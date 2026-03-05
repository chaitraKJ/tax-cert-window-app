// Author: Dhanush

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};


const mahoningConfig = {
    url: 'https://auditor.mahoningcountyoh.gov/Parcel?Parcel=',
    taxing_authority: 'Mahoning County Auditor, 120 Market St, Youngstown, OH 44503, Ph: 330-740-2010',
    first_due: '03/07',
    second_due: '08/01',
    first_delq: '03/08',
    second_delq: '08/02',
};

// Navigation and validation
const mahoning_validate = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${mahoningConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 70000 });
            
            
            const pageContentExists = await page.waitForSelector('#ppPromoted', { timeout: 50000 });
            if (!pageContentExists) {
                return reject({ error: true, message: "Invalid Parcel Number or No Records Found" });
            }

            const isInvalidParcel = await page.evaluate(() => {
                const locationSection = document.querySelector('#Location');
                return locationSection?.textContent?.includes("No Base Records Found.") || false;
            });
            
            if (isInvalidParcel) {
                return reject({ error: true, message: `Parcel ${account} is invalid: No records found in the database.` });
            }

            resolve(true);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract basic parcel info
const mahoning_extract_basic = async (page, account) => {
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
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "",
                    notes: "",
                    delinquent: "",
                    tax_history: [],
                    currentYear:"",
                };

                const promoted = document.querySelector('#ppPromoted');
                if (promoted) {
                    const ownerDiv = promoted.querySelector('.col-6.col-md-3:nth-child(3) .text-truncate');
                    if (ownerDiv) {
                        data.owner_name[0] = ownerDiv.getAttribute('data-original-title') || ownerDiv.textContent.trim();
                    }

                    const addressDiv = promoted.querySelector('.col-6.col-md-3:nth-child(2) .text-truncate');
                    if (addressDiv) {
                        data.property_address = addressDiv.getAttribute('data-original-title') || addressDiv.textContent.trim();
                    }
                }

                const valuationTable = document.querySelector('.table-responsive .table[title="Valuation"]');
                if (valuationTable) {
                    const valuationRow = valuationTable.querySelector('tbody tr:first-child');
                    if (valuationRow) {
                        const cells = valuationRow.querySelectorAll('td');
                        if (cells.length >= 7) {
                            data.land_value = cells[1]?.textContent.trim() ?? "N/A";
                            data.improvements = cells[2]?.textContent.trim() ?? "N/A";
                            data.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A";
                            data.total_taxable_value = data.total_assessed_value;
                        }
                    }
                }
                 // Get current tax year from tab header
                const yearText = document.querySelector("#taxBill-tabs li div")?.textContent.trim();
                if (yearText) {
                    const year = yearText.split(" ")[0] || "N/A";
                    data.currentYear = year;
                }

                return data;
            }, account);

            basicData.taxing_authority = mahoningConfig.taxing_authority;
            resolve(basicData);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract payment records from Tax Payments table
const mahoning_extract_payments = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payments = await page.evaluate(() => {
                const paymentRecords = [];
                const paymentTable = document.querySelector('table[title="Tax Payments"]');
                
                if (!paymentTable) return paymentRecords;

                const rows = Array.from(paymentTable.querySelectorAll('tbody tr'));
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 6) return;

                    const paymentDate = cells[0]?.textContent?.trim() || "";
                    const cycle = cells[1]?.textContent?.trim() || "";
                    const firstHalfPaid = cells[3]?.textContent?.trim() || "$0.00";
                    const secondHalfPaid = cells[4]?.textContent?.trim() || "$0.00";

                    // Parse cycle (e.g., "1-24" = first half of 2024)
                    const cycleMatch = cycle.match(/(\d+)-(\d+)/);
                    if (!cycleMatch) return;

                    const halfNumber = cycleMatch[1]; // "1" or "2"
                    const yearShort = cycleMatch[2]; // "24"
                    const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;

                    paymentRecords.push({
                        paymentDate,
                        year,
                        halfNumber,
                        firstHalfPaid,
                        secondHalfPaid,
                        cycle
                    });
                });

                return paymentRecords;
            });

            resolve(payments);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax payment status
const mahoning_extract_tax_status = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const taxStatus = await page.evaluate((mahoningConfig) => {
                const currentDate = new Date();
                const parseDate = (dateStr, year) => {
                    const parts = dateStr.split('/');
                    if (parts.length !== 2) return new Date(0);
                    const month = parseInt(parts[0], 10);
                    const day = parseInt(parts[1], 10);
                    return new Date(year, month - 1, day);
                };

                // Find the FIRST tax table (most recent year)
                const billTable = document.querySelector('table[title*="Taxes"]');
                if (!billTable) return { status: "NO_TAX_HISTORY", totalDue: "$0.00", year: null };

                const title = billTable.getAttribute('title');
                const yearMatch = title?.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear() - 1;
                const dueYear = year + 1;

                const rows = Array.from(billTable.querySelectorAll('tr'));
                const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));
                const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));

                if (!netDueRow || !netPaidRow) return { status: "PAID", totalDue: "$0.00", year };

                const dueCells = netDueRow.querySelectorAll('td');
                const paidCells = netPaidRow.querySelectorAll('td');
                if (dueCells.length < 4 || paidCells.length < 4) return { status: "PAID", totalDue: "$0.00", year };

                const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const totalDue = firstHalfDue + secondHalfDue;

                if (totalDue <= 0.01) return { status: "PAID", totalDue: "$0.00", year };

                const firstDelqDate = parseDate(mahoningConfig.first_delq, dueYear);
                const secondDelqDate = parseDate(mahoningConfig.second_delq, dueYear);

                let status = "PAID";
                if (firstHalfDue > 0.01 && currentDate < firstDelqDate) status = "DUE";
                else if (firstHalfDue > 0.01) status = "DELINQUENT";
                else if (secondHalfDue > 0.01 && currentDate < secondDelqDate) status = "DUE";
                else if (secondHalfDue > 0.01) status = "DELINQUENT";

                return { 
                    status, 
                    totalDue: `$${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    year
                };
            }, mahoningConfig);

            resolve(taxStatus);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax history with configurable years and payment matching
const mahoning_extract_tax_history = async (page, basicData, taxStatus, paymentRecords, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const currentYear = basicData.currentYear;
            const currentDate = new Date();

            if (taxStatus.status === "NO_TAX_HISTORY") {
                basicData.notes = `ALL PRIORS ARE PAID, ${currentYear} NO TAXES DUE, POSSIBLY EXEMPT.`;
                basicData.delinquent = "NONE";
                basicData.tax_history = [];
                basicData.years_requested = yearsRequested;
                basicData.years_returned = 0;
                basicData.has_delinquent = false;
                basicData.delinquent_years = [];
                resolve(basicData);
                return;
            }

            // Extract all tax history from ALL tax bill tables
            const allHistory = await page.evaluate((mahoningConfig, currentDateIso) => {
                const currentDate = new Date(currentDateIso);
                const formatDollar = (value) => {
                    if (!value || value === "") return "$0.00";
                    const num = Math.abs(parseFloat(value.toString().replace(/[$ ,]/g, "")));
                    return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
                };

                const parseDate = (dateStr, year) => {
                    const parts = dateStr.split('/');
                    if (parts.length !== 2) return new Date(0);
                    const month = parseInt(parts[0], 10);
                    const day = parseInt(parts[1], 10);
                    return new Date(year, month - 1, day);
                };

                const history = [];
                
                // Find ALL tax bill tables
                const taxTables = document.querySelectorAll('table[title*="Taxes"]');

                taxTables.forEach(billTable => {
                    const title = billTable.getAttribute('title');
                    const yearMatch = title?.match(/\d{4}/);
                    if (!yearMatch) return;
                    
                    const year = yearMatch[0];
                    const dueYear = (parseInt(year) + 1).toString();
                    const taxYearLabel = `${year}-${dueYear}`;

                    const rows = Array.from(billTable.querySelectorAll('tr'));
                    const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));
                    const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));
                    
                    if (!netDueRow || !netPaidRow) return;

                    const dueCells = netDueRow.querySelectorAll('td');
                    const paidCells = netPaidRow.querySelectorAll('td');
                    if (dueCells.length < 4 || paidCells.length < 4) return;

                    const firstHalfPaid = Math.abs(parseFloat(paidCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0")) || 0;
                    const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                    const secondHalfPaid = Math.abs(parseFloat(paidCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0")) || 0;
                    const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;

                    const firstDelqDate = parseDate(mahoningConfig.first_delq, dueYear);
                    const secondDelqDate = parseDate(mahoningConfig.second_delq, dueYear);

                    // First Half
                    if (firstHalfDue > 0.01 || firstHalfPaid > 0.01) {
                        const status = firstHalfPaid > 0.01 
                            ? "Paid"
                            : (currentDate < firstDelqDate ? "Due" : "Delinquent");
                        
                        const amount = firstHalfDue > 0.01 ? firstHalfDue : firstHalfPaid;

                        history.push({
                            jurisdiction: "County",
                            year: taxYearLabel,
                            payment_type: "Semi-Annual",
                            installment: "1st Half",
                            status: status,
                            base_amount: formatDollar(amount),
                            amount_paid: firstHalfPaid > 0.01 ? formatDollar(firstHalfPaid) : "$0.00",
                            amount_due: firstHalfDue > 0.01 ? formatDollar(firstHalfDue) : "$0.00",
                            mailing_date: "N/A",
                            due_date: `${mahoningConfig.first_due}/${dueYear}`,
                            delq_date: `${mahoningConfig.first_delq}/${dueYear}`,
                            paid_date: "",
                            good_through_date: "",
                            _year: year,
                            _halfNumber: "1"
                        });
                    }

                    // Second Half
                    if (secondHalfDue > 0.01 || secondHalfPaid > 0.01) {
                        const status = secondHalfPaid > 0.01
                            ? "Paid"
                            : (currentDate < secondDelqDate ? "Due" : "Delinquent");
                        
                        const amount = secondHalfDue > 0.01 ? secondHalfDue : secondHalfPaid;

                        history.push({
                            jurisdiction: "County",
                            year: taxYearLabel,
                            payment_type: "Semi-Annual",
                            installment: "2nd Half",
                            status: status,
                            base_amount: formatDollar(amount),
                            amount_paid: secondHalfPaid > 0.01 ? formatDollar(secondHalfPaid) : "$0.00",
                            amount_due: secondHalfDue > 0.01 ? formatDollar(secondHalfDue) : "$0.00",
                            mailing_date: "N/A",
                            due_date: `${mahoningConfig.second_due}/${dueYear}`,
                            delq_date: `${mahoningConfig.second_delq}/${dueYear}`,
                            paid_date: "",
                            good_through_date: "",
                            _year: year,
                            _halfNumber: "2"
                        });
                    }
                });

                // Sort by year (oldest first), then by installment
                return history.sort((a, b) => {
                    const yearA = parseInt(a.year.split('-')[0]);
                    const yearB = parseInt(b.year.split('-')[0]);
                    const yearDiff = yearA - yearB;
                    if (yearDiff !== 0) return yearDiff;
                    return a.installment === "1st Half" ? -1 : 1;
                });
            }, mahoningConfig, currentDate.toISOString());

            // Match payment dates from payment records
            for (const item of allHistory) {
                const matchingPayment = paymentRecords.find(p => 
                    p.year === item._year && p.halfNumber === item._halfNumber
                );
                
                if (matchingPayment && item.status === "Paid") {
                    item.paid_date = matchingPayment.paymentDate;
                } else if (item.status === "Paid") {
                    item.paid_date = "N/A";
                }
                
                // Clean up temporary fields
                delete item._year;
                delete item._halfNumber;
            }

            // Track delinquent years
            const delinquentYears = new Set();
            allHistory.forEach(item => {
                if (item.status === "Delinquent") {
                    delinquentYears.add(item.year.split('-')[0]);
                }
            });

            // Filter logic: if delinquent exists, return ALL; otherwise return requested years
            let finalHistory = [];
            const hasDelinquent = delinquentYears.size > 0;

            if (hasDelinquent) {
                finalHistory = allHistory;
            } else {
                const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))];
                const yearsToInclude = uniqueYears.slice(-yearsRequested);
                finalHistory = allHistory.filter(h => yearsToInclude.includes(h.year.split('-')[0]));
            }

            basicData.tax_history = finalHistory;

            // Build notes
            const currentYearLabel = `${currentYear}-${parseInt(currentYear) + 1}`;
            const delinquentPayments = finalHistory.filter(item => item.status === "Delinquent");
            const priorDelinquentInFinal = finalHistory.filter(item => {
                const itemYear = parseInt(item.year.split('-')[0]);
                return itemYear < parseInt(currentYear) && item.status === "Delinquent";
            });

            if (finalHistory.length === 0 || !finalHistory.find(item => item.year === currentYearLabel)) {
                basicData.notes = `ALL PRIORS ARE PAID, ${currentYearLabel} NO TAXES DUE, POSSIBLY EXEMPT.`;
                basicData.delinquent = "NONE";
            } else {
                const currentPayments = finalHistory.filter(p => p.year === currentYearLabel);
                const first = currentPayments.find(x => x.installment === "1st Half") || { status: "Paid" };
                const second = currentPayments.find(x => x.installment === "2nd Half") || { status: "Paid" };

                let priorNote = priorDelinquentInFinal.length > 0
                    ? `PRIOR YEARS (${[...new Set(priorDelinquentInFinal.map(p => p.year.split('-')[0]))].sort((a,b)=>a-b).join(', ')}) TAXES ARE DELINQUENT, `
                    : `ALL PRIOR YEARS ARE PAID, `;

                let currentNote = `${currentYearLabel} `;
                const fStat = first.status.toUpperCase();
                const sStat = second.status.toUpperCase();
                currentNote += `1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`;
                currentNote += `, NORMALLY PAID IN INSTALLMENTS, NORMAL DUE DATES ARE ${mahoningConfig.first_due} & ${mahoningConfig.second_due}.`;

                basicData.notes = priorNote + currentNote;
                basicData.delinquent = (delinquentPayments.length > 0 || priorDelinquentInFinal.length > 0)
                    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                    : "NONE";
            }

            // Add summary metadata
            basicData.years_requested = yearsRequested;
            basicData.years_returned = finalHistory.length > 0 ? [...new Set(finalHistory.map(h => h.year.split('-')[0]))].length : 0;
            basicData.has_delinquent = hasDelinquent;
            basicData.delinquent_years = hasDelinquent ? Array.from(delinquentYears).sort() : [];

            resolve(basicData);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Main search flow
const mahoning_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            await mahoning_validate(page, account);
            const basicData = await mahoning_extract_basic(page, account);
            const paymentRecords = await mahoning_extract_payments(page);
            const taxStatus = await mahoning_extract_tax_status(page);
            const finalData = await mahoning_extract_tax_history(page, basicData, taxStatus, paymentRecords, yearsRequested);
            resolve(finalData);
        } catch (error) {
            reject({ error: true, message: error.message });
        }
    });
};

// Export search function
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    
    try {
        if (!account || account.trim() === '') {
            return res.status(200).render("error_data", {
                error: true,
                message: "Enter the Account Number..."
            });
        }

        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render("error_data", { error: true, message: "Invalid Access" });
        }

        // Get years requested based on client
        let yearsRequested = getOHCompanyYears(client);

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            mahoning_search(page, account, yearsRequested)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => res.status(200).render("error_data", { error: true, message: error.message }))
                .finally(() => context.close());
        } else if (fetch_type === "api") {
            mahoning_search(page, account, yearsRequested)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(() => context.close());
        }
    } catch (error) {
        const fetch_type = req.body?.fetch_type;
        if (fetch_type === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };