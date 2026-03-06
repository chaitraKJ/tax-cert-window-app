// Author: Dhanush (Refactored for Union County, OH - Like Williams Style)
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Format dollar properly
const formatDollar = (value) => {
    if (!value || value === "") return "$0.00";
    const num = parseFloat(value.toString().replace(/[$ ,()]/g, ""));
    return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const parseDollar = (str) => {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/[$ ,()]/g, "")) || 0;
};

// Union County Config
const unionConfig = {
    urlBase: "https://beacon.schneidercorp.com/Application.aspx?AppID=1260&LayerID=41600&PageTypeID=4&PageID=15350&KeyValue=",
    taxing_authority: "Union County, OH Auditor, 233 W 6th St, Marysville, OH 43040",
    first_due: "02/12",
    second_due: "07/16",
    first_delq: "02/13",
    second_delq: "07/17",
};

// Validate parcel exists
const union_validate = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${unionConfig.urlBase}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

            const noRecord = await page.evaluate(() => {
                return document.body.textContent.includes("No records found") ||
                       document.body.textContent.includes("Invalid Parcel");
            });

            if (noRecord) {
                return reject({ error: true, message: "Record not found" });
            }

            resolve(true);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// Extract basic info: owner, address, parcel, values
const union_extract_basic = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const basicData = await page.evaluate((account) => {
                const data = {
                    processed_date: new Date().toISOString().slice(0, 10),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [""],
                    property_address: "",
                    parcel_number: account,
                    land_value: "$0.00",
                    improvements: "$0.00",
                    total_assessed_value: "$0.00",
                    total_taxable_value: "$0.00",
                    taxing_authority: "",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    currentYear: ""
                };

                // Owner Name
                const ownerEl = document.querySelector("#ctlBodyPane_ctl03_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch") ||
                                document.querySelector("#ctlBodyPane_ctl03_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
                data.owner_name[0] = ownerEl ? ownerEl.textContent.trim() : "N/A";

                // Property Address
                const addrEl = document.querySelector("#ctlBodyPane_ctl02_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl03_pnlSingleValue span");
                const cityEl = document.querySelector("#ctlBodyPane_ctl02_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl04_pnlSingleValue span");
                if (addrEl && cityEl) {
                    data.property_address = `${addrEl.textContent.trim()}, ${cityEl.textContent.trim()}`.replace(/\s+/g, " ");
                }

                // Parcel fallback
                const parcelEl = document.querySelector("#ctlBodyPane_ctl02_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span");
                data.parcel_number = parcelEl ? parcelEl.textContent.trim() : account;

                // Valuation - Latest Year
                const valTable = document.querySelector("#ctlBodyPane_ctl14_ctl01_grdValuation_grdYearData");
                if (valTable) {
                    const years = Array.from(valTable.querySelectorAll("thead th")).slice(1).map(th => parseInt(th.textContent.trim()));
                    const latestYear = Math.max(...years.filter(y => !isNaN(y)));

                    const colIndex = years.indexOf(latestYear) + 1;
                    const rows = valTable.querySelectorAll("tbody tr");

                    rows.forEach(row => {
                        const label = row.querySelector("th")?.textContent.trim();
                        const val = row.querySelectorAll("td")[colIndex - 1]?.textContent.trim();

                        if (label === "Land Value") data.land_value = val || "$0.00";
                        if (label === "Improvement Value") data.improvements = val || "$0.00";
                        if (label === "Total Value (Assessed 35%)") {
                            data.total_assessed_value = val || "$0.00";
                            data.total_taxable_value = val || "$0.00";
                        }
                    });
                }

                return data;
            }, account);

            basicData.taxing_authority = unionConfig.taxing_authority;
            resolve(basicData);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// Extract full tax history + apply client year limit + keep delinquents
const union_extract_tax_history = async (page, basicData, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const currentDate = new Date();

            const parseDate = (dateStr, year) => {
                const [m, d] = dateStr.split('/').map(Number);
                return new Date(year, m - 1, d);
            };

            const allHistory = [];
            let latestTaxYear = "";
            const delinquentInstallments = [];

            // Get payment dates map first
            const paymentMap = await page.evaluate(() => {
                const map = {};
                const table = document.querySelector("#ctlBodyPane_ctl15_ctl01_grdPayments");
                if (!table) return map;

                const rows = table.querySelectorAll("tbody tr");
                rows.forEach(row => {
                    const cells = row.querySelectorAll("td, th");
                    if (cells.length >= 2) {
                        const taxYearText = cells[0].textContent.trim(); // "2024 Payable 2025"
                        const paidDate = cells[1].textContent.trim();
                        const match = taxYearText.match(/(\d{4})\s+Payable\s+(\d{4})/);
                        if (match && paidDate.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                            const key1 = `${match[1]} Payable ${match[2]} 1st Half`;
                            const key2 = `${match[1]} Payable ${match[2]} 2nd Half`;
                            if (!map[key2]) map[key2] = paidDate;
                            else if (!map[key1]) map[key1] = paidDate;
                        }
                    }
                });
                return map;
            });

            // Extract all tax sections
            const taxSections = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('[id^="btndiv"]')).map(btn => {
                    const text = btn.textContent.trim();
                    const match = text.match(/(\d{4})\s+Payable\s+(\d{4})/);
                    return match ? { taxYear: match[1], payYear: match[2], buttonText: text } : null;
                }).filter(x => x);
            });

            for (const section of taxSections) {
                const { taxYear, payYear } = section;
                const yearLabel = `${taxYear}-${payYear}`;

                if (taxYear > latestTaxYear) latestTaxYear = taxYear;

                // Get detail table for this section
                const detailData = await page.evaluate((idx, taxYear, payYear, paymentMap) => {
                    const table = document.querySelector(`#ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl0${idx + 2}_fvTaxHistory_DetailTotal table.tabular-data`);
                    if (!table) return null;

                    const rows = Array.from(table.querySelectorAll("tbody tr"));
                    let gross1st = "$0.00", gross2nd = "$0.00";
                    let net1st = "$0.00", net2nd = "$0.00";
                    let collected1st = "$0.00", collected2nd = "$0.00";
                    let balance1st = "$0.00", balance2nd = "$0.00";

                    rows.forEach(row => {
                        const label = row.querySelector("th")?.textContent.trim();
                        const cells = row.querySelectorAll("td");
                        if (!label || cells.length < 2) return;
                        const v1 = cells[0].textContent.trim();
                        const v2 = cells[1].textContent.trim();

                        if (label === "Gross Property Tax:") { gross1st = v1; gross2nd = v2; }
                        else if (label === "Net General:") { net1st = v1; net2nd = v2; }
                        else if (label === "Collected:") { collected1st = v1; collected2nd = v2; }
                        else if (label === "Balance:") { balance1st = v1; balance2nd = v2; }
                    });

                    return { net1st, net2nd, collected1st, collected2nd, balance1st, balance2nd };
                }, taxSections.indexOf(section), taxYear, payYear, paymentMap);

                if (!detailData) continue;

                // Process 1st Half
                const base1st = parseDollar(detailData.net1st);
                const paid1st = Math.abs(parseDollar(detailData.collected1st));
                const due1st = parseDollar(detailData.balance1st);
                const key1st = `${taxYear} Payable ${payYear} 1st Half`;
                const paidDate1st = paymentMap[key1st] || (due1st <= 0.01 ? "N/A" : "-");

                const dueDate1st = parseDate(unionConfig.first_due, payYear);
                const delqDate1st = parseDate(unionConfig.first_delq, payYear);
                const status1st = (due1st > 0.01 && currentDate >= delqDate1st) ? "Delinquent" : (due1st > 0.01 ? "Due" : "Paid");

                if (base1st > 0) {
                    const inst = {
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        installment: "1st Half",
                        status: status1st,
                        base_amount: formatDollar(base1st),
                        amount_paid: formatDollar(paid1st),
                        amount_due: due1st > 0.01 ? formatDollar(due1st) : "$0.00",
                        due_date: `${unionConfig.first_due}/${payYear}`,
                        delq_date: `${unionConfig.first_delq}/${payYear}`,
                        paid_date: paidDate1st,
                        mailing_date: "N/A",
                        good_through_date: ""
                    };
                    allHistory.push(inst);
                    if (status1st === "Delinquent") delinquentInstallments.push(inst);
                }

                // Process 2nd Half
                const base2nd = parseDollar(detailData.net2nd);
                const paid2nd = Math.abs(parseDollar(detailData.collected2nd));
                const due2nd = parseDollar(detailData.balance2nd);
                const key2nd = `${taxYear} Payable ${payYear} 2nd Half`;
                const paidDate2nd = paymentMap[key2nd] || (due2nd <= 0.01 ? "N/A" : "-");

                const dueDate2nd = parseDate(unionConfig.second_due, payYear);
                const delqDate2nd = parseDate(unionConfig.second_delq, payYear);
                const status2nd = (due2nd > 0.01 && currentDate >= delqDate2nd) ? "Delinquent" : (due2nd > 0.01 ? "Due" : "Paid");

                if (base2nd > 0) {
                    const inst = {
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        installment: "2nd Half",
                        status: status2nd,
                        base_amount: formatDollar(base2nd),
                        amount_paid: formatDollar(paid2nd),
                        amount_due: due2nd > 0.01 ? formatDollar(due2nd) : "$0.00",
                        due_date: `${unionConfig.second_due}/${payYear}`,
                        delq_date: `${unionConfig.second_delq}/${payYear}`,
                        paid_date: paidDate2nd,
                        mailing_date: "N/A",
                        good_through_date: ""
                    };
                    allHistory.push(inst);
                    if (status2nd === "Delinquent") delinquentInstallments.push(inst);
                }
            }

            // Sort all history: oldest → newest
            allHistory.sort((a, b) => {
                const ya = parseInt(a.year.split('-')[0]);
                const yb = parseInt(b.year.split('-')[0]);
                if (ya !== yb) return ya - yb;
                return a.installment === "1st Half" ? -1 : 1;
            });

            // Determine which years to keep: latest N + any delinquent
            const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))].sort();
            const latestNYears = uniqueYears.slice(-yearsRequested);

            let finalHistory = allHistory.filter(h => latestNYears.includes(h.year.split('-')[0]));

            // Add any delinquent installments not already included
            for (const delq of delinquentInstallments) {
                if (!finalHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
                    finalHistory.push(delq);
                }
            }

            // Re-sort final
            finalHistory.sort((a, b) => {
                const ya = parseInt(a.year.split('-')[0]);
                const yb = parseInt(b.year.split('-')[0]);
                if (ya !== yb) return ya - yb;
                return a.installment === "1st Half" ? -1 : 1;
            });

            basicData.tax_history = finalHistory;

            // Build notes
            const currentYearLabel = latestTaxYear ? `${latestTaxYear}-${parseInt(latestTaxYear) + 1}` : "";
            const currentEntries = finalHistory.filter(i => i.year === currentYearLabel);

            let noteParts = [];
            if (currentEntries.length > 0) {
                const first = currentEntries.find(i => i.installment === "1st Half") || { status: "Paid" };
                const second = currentEntries.find(i => i.installment === "2nd Half") || { status: "Paid" };
                const fStat = first.status.toUpperCase();
                const sStat = second.status.toUpperCase();

                if (first.status === "Paid" && second.status === "Paid") {
                    noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID`);
                } else {
                    noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`);
                }
            } else if (latestTaxYear) {
                noteParts.push(`${currentYearLabel}: NO TAXES DUE, POSSIBLY EXEMPT`);
            } else {
                noteParts.push("NO TAX DATA AVAILABLE");
            }

            const hasPriorDelq = allHistory.some(i => {
                const y = parseInt(i.year.split('-')[0]);
                return y < parseInt(latestTaxYear || 0) && i.status === "Delinquent";
            });

            if (hasPriorDelq) noteParts.unshift("PRIOR YEARS TAXES ARE DELINQUENT");

            noteParts.push(`NORMAL TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${unionConfig.first_due} AND ${unionConfig.second_due}`);

            basicData.notes = noteParts.join(". ");
            basicData.delinquent = delinquentInstallments.length > 0 ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            resolve(basicData);
        } catch (err) {
            console.error("union_extract_tax_history error:", err);
            reject({ error: true, message: err.message });
        }
    });
};



const union_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Step 1: Validate parcel
            union_validate(page, account)
                .then(() => {
                    // Step 2: Extract basic info
                    union_extract_basic(page, account)
                        .then((data2) => {
                            // Step 3: Get tax History
                            union_extract_tax_history(page,data2,yearsRequested=1)
                                .then((data3) => {
                                   resolve(data3)
                                })
                                .catch((error) => {
                                    console.log( error);
                                    reject(error);
                                });
                        })
                        .catch((error) => {
                            console.log( error);
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

// Express route - Main entry point
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    try {
        // Validate account number is provided
        if (!account || account.trim() === '') {
            return res.status(200).render("error_data", {
                error: true,
                message: "Enter the Account Number..."
            });
        }

        // Validate fetch_type
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        // Parse tax_history_years, default to 1 if not provided or invalid
        let yearsRequested = getOHCompanyYears(client);
        // Launch browser
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Set user agent and timeout
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        // Block images, CSS, fonts for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Run search based on fetch_type
        if (fetch_type === "html") {
            union_search(page, account, yearsRequested)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', { error: true, message: error.message || error });
                })
                .finally(async () => {
                    await context.close();
                });
        }
        else if (fetch_type === "api") {
            union_search(page, account, yearsRequested)
                .then((data) => {
                    
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({ error: true, message: error.message || "Server Error" });
                })
                .finally(async () => {
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message || "Server Error" });
        } else {
            res.status(500).json({ error: true, message: error.message || "Server Error" });
        }
    }
};

module.exports = { search };