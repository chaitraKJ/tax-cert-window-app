// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const formatDollar = (value) => {
    if (!value || value === "") return "$0.00";
    const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
    return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const lawrenceConfig = {
    url: 'https://lawrencecountytreasurer.org/Parcel?Parcel=',
    taxing_authority: 'Lawrence County Treasurer, 111 S 4th St, Ironton, OH 45638, Ph: 740-533-4310',
    first_due: '03/07',   
    second_due: '07/25',
    first_delq: '03/08',
    second_delq: '07/26',
};

// AC_1: VALIDATE PARCEL NUMBER
const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${lawrenceConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

            const cloudflareBlock = await page.evaluate(() => document.body.innerText.includes("Verify you are human"));
            if (cloudflareBlock) reject(new Error("Blocked by Cloudflare.retry Again."));

            if (page.url() !== url) reject(new Error("Redirect/block detected."));

            await page.waitForSelector("#site-main-container div", { timeout: 60000 })
                .catch(() => reject({ error: true, message: "Invalid Parcel or No Records" }));

            const invalid = await page.evaluate(() => 
                document.body.textContent.includes("No Valuation Records Found.") ||
                document.body.textContent.includes("No Tax Bill Records Found.")
            );

            if (invalid) reject({ error: true, message: `Parcel ${account} invalid: No records.` });

            resolve(true);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// AC_2: BASIC PARCEL INFO
const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = await page.evaluate(() => {
                const basic = {
                    processed_date: new Date().toISOString().slice(0, 10),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [""],
                    property_address: "",
                    parcel_number: "",
                    land_value: "N/A",
                    improvements: "-",
                    total_assessed_value: "N/A",
                    exemption: "-",
                    total_taxable_value: "N/A",
                    taxing_authority: "",
                    notes: "",
                    delinquent: "",
                    tax_history: [],
                    currentYear: (new Date().getFullYear() - 1).toString()  // e.g., 2024 (payable 2025)
                };

                const owner = document.querySelector('#ppPromoted .col-6.col-md-3:nth-child(3) .text-truncate');
                if (owner) basic.owner_name[0] = owner.textContent.trim();

                const addr = document.querySelector('#ppPromoted .col-6.col-md-3:nth-child(2) .text-truncate');
                if (addr) basic.property_address = addr.textContent.trim();

                const valTable = document.querySelector('table[title="Valuation"] tbody tr:first-child');
                if (valTable) {
                    const cells = valTable.querySelectorAll('td');
                    basic.land_value = cells[1]?.textContent.trim() || "N/A";
                    basic.improvements = cells[2]?.textContent.trim() || "N/A";
                    basic.total_assessed_value = cells[6]?.textContent.trim() || "N/A";
                    basic.total_taxable_value = basic.total_assessed_value;
                }

                return basic;
            });

            data.taxing_authority = lawrenceConfig.taxing_authority;
            data.parcel_number = account;

            resolve(data);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// AC_3: EXTRACT PAYMENTS + PAYER NAME
const ac_3 = async (page, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payments = await page.evaluate(() => {
                const records = [];
                const table = document.querySelector('table[title="Tax Payments"]');
                if (!table) return records;

                const rows = Array.from(table.querySelectorAll('tbody tr'));

                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 7) return;

                    const date = cells[0]?.textContent.trim() || "";
                    const cycle = cells[1]?.textContent.trim() || "";
                    const receipt = cells[6]?.textContent.trim() || "";


                    const cycleMatch = cycle.match(/(\d+)-(\d+)/);
                    if (!cycleMatch) return;

                    const half = cycleMatch[1];
                    const yearShort = cycleMatch[2];
                    const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;

                    records.push({ paymentDate: date, year, halfNumber: half});
                });

                return records;
            });

            resolve({ data, payment_records: payments });
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// AC_4: BUILD TAX HISTORY WITH CLIENT-REQUESTED YEARS + PAYER
const ac_4 = async (page, main_data, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = main_data.data;
            const payments = main_data.payment_records;
            const currentYear = data.currentYear; 
            const currentDate = new Date();

            const num = (txt = '') => Math.abs(parseFloat(txt.replace(/[^0-9.-]/g, '')) || 0);
            const parseDate = (dateStr, year) => {
                const [m, d] = dateStr.split('/').map(Number);
                return new Date(year, m - 1, d);
            };

            const tables = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('table[title*="Taxes"]')).map(table => {
                    const year = (table.getAttribute('title') || '').match(/\d{4}/)?.[0] || '';
                    const rows = Array.from(table.querySelectorAll('tr')).map(r =>
                        Array.from(r.querySelectorAll('td, th')).map(c => c.textContent.trim())
                    );
                    return { year, rows };
                });
            });

            const allHistory = [];
            const delinquentInstallments = [];

            for (const { year, rows } of tables) {
                if (!year) continue;
                const dueYear = (parseInt(year) + 1).toString();

                const netTaxIdx = rows.findIndex(r => r[0]?.includes('NET TAX'));
                const netDueIdx = rows.findIndex(r => r[0]?.includes('NET DUE'));
                const netPaidIdx = rows.findIndex(r => r[0]?.includes('NET PAID'));
                if (netDueIdx === -1 || netPaidIdx === -1) continue;

                const taxRow = rows[netTaxIdx];
                const dueRow = rows[netDueIdx];
                const paidRow = rows[netPaidIdx];

                const firstTax = num(taxRow[2]);
                const secondTax = num(taxRow[3]);
                const firstDue = num(dueRow[2]);
                const secondDue = num(dueRow[3]);
                const firstPaid = num(paidRow[2]);
                const secondPaid = num(paidRow[3]);

                const firstPayment = payments.find(p => p.year === year && p.halfNumber === "1");
                const secondPayment = payments.find(p => p.year === year && p.halfNumber === "2");
                const isAnnual = firstPayment && secondPayment && firstPayment.paymentDate === secondPayment.paymentDate && firstPaid > 0 && secondPaid > 0;

                const formatPaid = (p) => (p?.paymentDate || "N/A");  

                const getStatus = (paid, due, delqDate) => paid >= due ? "Paid" : (currentDate < delqDate ? "Due" : "Delinquent");

                const firstDelqDate = parseDate(lawrenceConfig.first_delq, dueYear);
                const secondDelqDate = parseDate(lawrenceConfig.second_delq, dueYear);

                if (firstDue > 0 || firstPaid > 0) {
                    const entry = {
                        jurisdiction: "County",
                        year,
                        payment_type: isAnnual ? "Annual" : "Semi-Annual",
                        status: getStatus(firstPaid, firstDue, firstDelqDate),
                        base_amount: formatDollar(firstDue > 0 ? firstTax : firstPaid),
                        amount_paid: formatDollar(firstPaid),
                        amount_due: formatDollar(firstDue),
                        mailing_date: "N/A",
                        due_date: `${lawrenceConfig.first_due}/${dueYear}`,
                        delq_date: `${lawrenceConfig.first_delq}/${dueYear}`,
                        paid_date: formatPaid(firstPayment),
                        good_through_date: ""
                    };
                    allHistory.push(entry);
                    if (entry.status === "Delinquent") delinquentInstallments.push(entry);
                }

                if (!isAnnual && (secondDue > 0 || secondPaid > 0)) {
                    const entry = {
                        jurisdiction: "County",
                        year,
                        payment_type: "Semi-Annual",
                        status: getStatus(secondPaid, secondDue, secondDelqDate),
                        base_amount: formatDollar(secondDue > 0 ? secondTax : secondPaid),
                        amount_paid: formatDollar(secondPaid),
                        amount_due: formatDollar(secondDue),
                        mailing_date: "N/A",
                        due_date: `${lawrenceConfig.second_due}/${dueYear}`,
                        delq_date: `${lawrenceConfig.second_delq}/${dueYear}`,
                        paid_date: formatPaid(secondPayment),
                        good_through_date: ""
                    };
                    allHistory.push(entry);
                    if (entry.status === "Delinquent") delinquentInstallments.push(entry);
                }

                if (isAnnual && allHistory.length > 0) {
                    const last = allHistory[allHistory.length - 1];
                    last.base_amount = last.amount_paid = formatDollar(firstPaid + secondPaid);
                    last.paid_date = formatPaid(firstPayment);
                }
            }

            // Filter: recent requested years + all delinquents
            const uniqueYears = [...new Set(allHistory.map(h => h.year))].sort().slice(-yearsRequested);
            let finalHistory = allHistory.filter(h => uniqueYears.includes(h.year));

            delinquentInstallments.forEach(delq => {
                if (!finalHistory.some(h => h.year === delq.year && h.due_date === delq.due_date)) {
                    finalHistory.push(delq);
                }
            });

            finalHistory.sort((a, b) => b.year.localeCompare(a.year) || (a.due_date.includes(lawrenceConfig.first_due) ? -1 : 1));

            data.tax_history = finalHistory;

            // Notes & delinquent flag (similar to Lorain)
            const latest = finalHistory.filter(h => h.year === currentYear);
            const anyDelq = finalHistory.some(h => h.status === "Delinquent");
            let note = `${currentYear} `;
            if (latest.length === 0) note += "NO TAXES DUE, POSSIBLY EXEMPT.";
            else {
                const isAnn = latest.length === 1 && latest[0].payment_type === "Annual";
                if (isAnn) note += `TAXES ARE ${latest[0].status.toUpperCase()} ANNUALLY`;
                else {
                    const first = latest.find(x => x.due_date.includes(lawrenceConfig.first_due)) || { status: "Paid" };
                    const second = latest.find(x => x.due_date.includes(lawrenceConfig.second_due)) || { status: "Paid" };
                    const fStat = first.status === "Delinquent" ? "DELINQUENT" : (first.status === "Paid" ? "PAID" : "DUE");
                    const sStat = second.status === "Delinquent" ? "DELINQUENT" : (second.status === "Paid" ? "PAID" : "DUE");
                    note += `1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`;
                }
            }
            const priorDelq = allHistory.some(h => parseInt(h.year) < parseInt(currentYear) && h.status === "Delinquent");
            note += `, NORMALLY PAID IN SEMI-ANNUAL , NORMAL DUE DATES ARE ${lawrenceConfig.first_due} & ${lawrenceConfig.second_due}.`;
            data.notes = (priorDelq ? "PRIOR YEARS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ") + note;
            data.delinquent = anyDelq ? "TAXES ARE DELINQUENT, CALL FOR PAYOFF" : "NONE";

            data.years_requested = yearsRequested;
            data.years_returned = [...new Set(finalHistory.map(h => h.year))].length;

            resolve(data);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// MAIN SEARCH WITH CLIENT YEARS
const account_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, account)
                .then(() => {
                    ac_2(page, account)
                        .then((data1) => {
                            ac_3(page, data1)
                                .then((data2) => {
                                    ac_4(page, data2, yearsRequested)
                                        .then((data3) => {
                                            resolve(data3);
                                        })
                                        .catch((error) => {
                                            console.log(error);
                                            reject(error);
                                        });
                                })
                                .catch((error) => {
                                    console.log(error);
                                    reject(error);
                                });
                        })
                        .catch((error) => {
                            console.log(error);
                            reject(error);
                        });
                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                });
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};
// API + HTML ROUTES
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    
    if(account.trim()==''||!account){
        return res.status(200).render("error_data", {
            error: true,
            message: "Account number is required."
        });
    }
    
    try{
        if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        let yearsRequested = getOHCompanyYears(client);

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'image'||req.resourceType()==='websocket'|| req.resourceType()==='media'||req.resourceType()==='other') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if(fetch_type == "html"){
            account_search(page, account, yearsRequested)
            .then((data) => {
                res.status(200).render("parcel_data_official", data);
            })
            .catch((error) => {
                console.log(error)
                res.status(200).render('error_data', {
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                await context.close();
            })
        }
        else if(fetch_type == "api"){
            account_search(page, account, yearsRequested)
            .then((data) => {
                res.status(200).json({
                    result: data
                })
            })
            .catch((error) => {
                console.log(error)
                res.status(500).json({
                    error: true,
                    message: error.message
                })
            })
            .finally(async () => {
                await context.close();
            })
        }

    }
    catch(error){
        console.log(error);
        if(fetch_type == "html"){
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if(fetch_type == "api"){
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

module.exports = { search };