// Author: Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";
// Format any value to proper dollar string
const formatDollar = (value) => {
    if (!value || value === "") return "$0.00";
    const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
    return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

// Configuration for Williams County
const williamsConfig = {
    url: 'https://realestate.williamscountyoh.gov/Parcel?Parcel=',
    taxing_authority: 'Williams County Treasurer, 1 Courthouse Square, Bryan, OH 43506, Ph: 419-636-1850',
    first_due: '02/15',
    second_due: '07/20',
    first_delq: '02/16',
    second_delq: '07/21',
};

// Navigation and validation - Check if parcel page loads and exists
const williams_validate = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Build full URL with parcel number
            const url = `${williamsConfig.url}${account}`;
            // Go to parcel page
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            // Wait for main content to appear
            await page.waitForSelector('#ppPromoted', { timeout: 50000 });
            await page.waitForSelector('#TaxBills', { timeout: 50000 });
           
            // Check if "No Base Records Found" message appears
            const isInvalidParcel = await page.evaluate(() => {
                const divs = document.querySelectorAll("#Location div");
                if (divs.length > 1) {
                    return divs[1].textContent?.includes("No Base Records Found.");
                }
                return false;
            });

            // If parcel doesn't exist, reject with error
            if (isInvalidParcel) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No records found in the database.`
                });
            }
            // Parcel is valid
            resolve(true);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract basic parcel info - Owner, address, values, etc.
const williams_extract_basic = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Run in browser context
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
                    currentYear: ""
                };

                // Helper to get values from Location table
                const findTableValue = (tableId, rowIndex, selector) => {
                    const table = document.querySelector(`#${tableId} .table`);
                    if (!table) return "N/A";
                    const row = table.querySelector(`tr:nth-child(${rowIndex})`);
                    return row?.querySelector(selector)?.textContent.trim() ?? "N/A";
                };

                // Extract owner and property address
                data.owner_name[0] = findTableValue('Location', 2, '.TableValue');
                data.property_address = findTableValue('Location', 3, '.TableValue');

                // Extract land, improvements, and total assessed value
                const valuationTable = document.querySelector('.table-responsive .table[title="Valuation"]');
                if (valuationTable) {
                    const valuationRow = valuationTable.querySelector('tbody tr:first-child');
                    if (valuationRow) {
                        data.land_value = valuationRow.querySelector('td[headers="appraised appraisedLand"]')?.textContent.trim() ?? "N/A";
                        data.improvements = valuationRow.querySelector('td[headers="appraised appraisedImprovements"]')?.textContent.trim() ?? "N/A";
                        data.total_assessed_value = valuationRow.querySelector('td[headers="assessed assessedTotal"]')?.textContent.trim() ?? "N/A";
                        data.total_taxable_value = data.total_assessed_value;
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

            // Add taxing authority info
            basicData.taxing_authority = williamsConfig.taxing_authority;
            resolve(basicData);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax payment status - Current year only (Paid/Due/Delinquent)
const williams_extract_tax_status = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const taxStatus = await page.evaluate((williamsConfig) => {
                const currentDate = new Date();

                // Convert MM/DD to actual Date object for a given year
                const parseDate = (dateStr, year) => {
                    const [month, day] = dateStr.split('/').map(Number);
                    return new Date(year, month - 1, day);
                };

                // Determine status based on paid amount and due dates
                const getTaxStatus = (paid, due, dueDate, delqDate, currentDate) => {
                    if (paid >= due) return "Paid";
                    if (currentDate < dueDate) return "Due";
                    if (currentDate < delqDate) return "Due";
                    return "Delinquent";
                };

                // Find current tax bill table
                const billTable = document.querySelector('table[title*="Taxes"]');
                if (!billTable) return { status: "NO_TAX_HISTORY", totalDue: "$0.00" };

                // Extract year from table title
                const title = billTable.getAttribute('title');
                const yearMatch = title?.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear() - 1;
                const dueYear = year + 1;

                // Get all rows and find NET DUE, NET TAX, NET PAID
                const rows = Array.from(billTable.querySelectorAll('tr'));
                const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));
                const netTaxRow = rows.find(row => row.textContent?.includes('NET TAX'));
                const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));

                if (!netDueRow || !netPaidRow || !netTaxRow) return { status: "NO_TAX_HISTORY", totalDue: "$0.00" };

                // Extract cell values
                const dueCells = netDueRow.querySelectorAll('td');
                const taxCells = netTaxRow.querySelectorAll('td');
                const paidCells = netPaidRow.querySelectorAll('td');

                if (dueCells.length < 4 || paidCells.length < 4 || taxCells.length < 4) return { status: "NO_TAX_HISTORY", totalDue: "$0.00" };

                // Parse amounts (remove $,, etc.)
                const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const firstHalfTax = parseFloat(taxCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfTax = parseFloat(taxCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const firstHalfPaid = Math.abs(parseFloat(paidCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0);
                const secondHalfPaid = Math.abs(parseFloat(paidCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0);

                const totalDue = firstHalfDue + secondHalfDue;
                const totalDueFormatted = totalDue > 0 ? `$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

                // If fully paid
                if (firstHalfPaid >= firstHalfDue && secondHalfPaid >= secondHalfDue && totalDue === 0) {
                    return { status: "Paid", totalDue: "$0.00" };
                }

                // Set due and delinquent dates
                const firstDueDate = parseDate(williamsConfig.first_due, dueYear);
                const secondDueDate = parseDate(williamsConfig.second_due, dueYear);
                const firstDelqDate = parseDate(williamsConfig.first_delq, dueYear);
                const secondDelqDate = parseDate(williamsConfig.second_delq, dueYear);

                let status = "Due";

                // Check first half
                if (firstHalfDue > 0 && firstHalfPaid < firstHalfDue) {
                    status = getTaxStatus(firstHalfPaid, firstHalfDue, firstDueDate, firstDelqDate, currentDate);
                }
                // If first half paid, check second half
                else if (secondHalfDue > 0 && secondHalfPaid < secondHalfDue) {
                    status = getTaxStatus(secondHalfPaid, secondHalfDue, secondDueDate, secondDelqDate, currentDate);
                }

                return { status, totalDue: totalDueFormatted };
            }, williamsConfig);

            resolve(taxStatus);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};


// Extract full tax history with client-specified years
const williams_extract_tax_history = async (page, basicData, taxStatus, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const currentYear = basicData.currentYear;
            const currentDate = new Date();

            // Parse MM/DD string into Date for comparison
            const parseDate = (dateStr, year) => {
                const [m, d] = dateStr.split('/').map(Number);
                return new Date(year, m - 1, d);
            };

            // Convert text to number safely
            const num = (txt = '') => Math.abs(parseFloat(txt.replace(/[^0-9.-]/g, '')) || 0);

            // Grab all tax tables from page
            const tablesData = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('table[title*="Taxes"]'))
                    .map(table => {
                        const year = (table.getAttribute('title') || '').match(/\d{4}/)?.[0] || '';
                        const rows = Array.from(table.querySelectorAll('tr'));
                        const rowTexts = rows.map(r =>
                            Array.from(r.querySelectorAll('td, th')).map(c => c.textContent?.trim() || '')
                        );
                        return { year, rows: rowTexts };
                    });
            });

            // If no tax tables found
            if (!tablesData.length) {
                basicData.notes = `ALL PRIORS ARE PAID, ${currentYear} NO TAXES DUE, POSSIBLY EXEMPT.`;
                basicData.delinquent = "NONE";
                resolve(basicData);
                return;
            }

            const allHistory = [];
            const delinquentInstallments = []; // Track specific delinquent installments

            // Process each tax year table
            for (const { year, rows } of tablesData) {
                const dueYear = (parseInt(year) + 1).toString();
                const taxYearLabel = `${year}-${dueYear}`;

                // Find NET rows
                const netDueIdx = rows.findIndex(r => r[0]?.includes('NET DUE'));
                const netTaxIdx = rows.findIndex(r => r[0]?.includes('NET TAX'));
                const netPaidIdx = rows.findIndex(r => r[0]?.includes('NET PAID'));

                if (netDueIdx === -1 || netPaidIdx === -1 || netTaxIdx === -1) continue;

                const dueRow = rows[netDueIdx];
                const taxRow = rows[netTaxIdx];
                const paidRow = rows[netPaidIdx];

                // Extract amounts
                const firstDue = num(dueRow[2]);
                const secondDue = num(dueRow[3]);
                const firstTax = num(taxRow[2]);
                const secondTax = num(taxRow[3]);
                const firstPaid = num(paidRow[2]);
                const secondPaid = num(paidRow[3]);

                // Set due dates
                const firstDueDate = parseDate(williamsConfig.first_due, dueYear);
                const secondDueDate = parseDate(williamsConfig.second_due, dueYear);
                const firstDelqDate = parseDate(williamsConfig.first_delq, dueYear);
                const secondDelqDate = parseDate(williamsConfig.second_delq, dueYear);

                // Status logic per installment
                const getStatus = (paid, due, dueDt, delqDt) => {
                    if (paid >= due) return "Paid";
                    if (currentDate < dueDt) return "Due";
                    if (currentDate < delqDt) return "Due";
                    return "Delinquent";
                };

                // First half installment
                const firstStatus = getStatus(firstPaid, firstDue, firstDueDate, firstDelqDate);
                if (firstDue > 0 || firstPaid > 0) {
                    const installment = {
                        jurisdiction: "County",
                        year: taxYearLabel,
                        payment_type: "Semi-Annual",
                        installment: "1st Half",
                        status: firstStatus,
                        base_amount: formatDollar(firstTax),
                        amount_paid: firstPaid > 0 ? formatDollar(firstPaid) : "$0.00",
                        amount_due: firstDue > 0 ? formatDollar(firstDue) : "$0.00",
                        mailing_date: "N/A",
                        due_date: `${williamsConfig.first_due}/${dueYear}`,
                        delq_date: `${williamsConfig.first_delq}/${dueYear}`,
                        paid_date: firstPaid > 0 ? "N/A" : "-",
                        good_through_date: ""
                    };
                    allHistory.push(installment);
                    
                    if (firstStatus === "Delinquent") {
                        delinquentInstallments.push(installment);
                    }
                }

                // Second half installment
                const secondStatus = getStatus(secondPaid, secondDue, secondDueDate, secondDelqDate);
                if (secondDue > 0 || secondPaid > 0) {
                    const installment = {
                        jurisdiction: "County",
                        year: taxYearLabel,
                        payment_type: "Semi-Annual",
                        installment: "2nd Half",
                        status: secondStatus,
                        base_amount: formatDollar(secondTax),
                        amount_paid: secondPaid > 0 ? formatDollar(secondPaid) : "$0.00",
                        amount_due: secondDue > 0 ? formatDollar(secondDue) : "$0.00",
                        mailing_date: "N/A",
                        due_date: `${williamsConfig.second_due}/${dueYear}`,
                        delq_date: `${williamsConfig.second_delq}/${dueYear}`,
                        paid_date: secondPaid > 0 ? "N/A" : "-",
                        good_through_date: ""
                    };
                    allHistory.push(installment);
                    
                    if (secondStatus === "Delinquent") {
                        delinquentInstallments.push(installment);
                    }
                }
            }

            // Sort: oldest year first, then first half before second half
            allHistory.sort((a, b) => {
                const yearA = parseInt(a.year.split('-')[0]);
                const yearB = parseInt(b.year.split('-')[0]);
                const y = yearA - yearB;
                if (y !== 0) return y;
                return a.installment === "1st Half" ? -1 : 1;
            });

            // NEW LOGIC: Only return requested years + delinquent installments
            const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))];
            const yearsToInclude = uniqueYears.slice(-yearsRequested);
            
            // Get installments from requested years
            const requestedYearInstallments = allHistory.filter(h => 
                yearsToInclude.includes(h.year.split('-')[0])
            );
            
            // Combine requested years with any delinquent installments (avoiding duplicates)
            const finalHistory = [...requestedYearInstallments];
            
            // Add delinquent installments that aren't already included
            for (const delqInstallment of delinquentInstallments) {
                const alreadyIncluded = finalHistory.some(h => 
                    h.year === delqInstallment.year && 
                    h.installment === delqInstallment.installment
                );
                if (!alreadyIncluded) {
                    finalHistory.push(delqInstallment);
                }
            }
            
            // Re-sort the final history
            finalHistory.sort((a, b) => {
                const yearA = parseInt(a.year.split('-')[0]);
                const yearB = parseInt(b.year.split('-')[0]);
                const y = yearA - yearB;
                if (y !== 0) return y;
                return a.installment === "1st Half" ? -1 : 1;
            });

            basicData.tax_history = finalHistory;

            // Build notes and delinquent status
            const currentYearLabel = `${currentYear}-${parseInt(currentYear) + 1}`;
            const latestEntries = finalHistory.filter(i => i.year === currentYearLabel);
            const anyDelinquent = finalHistory.some(i => i.status === "Delinquent");
            
            let note = `${currentYearLabel} `;

            if (latestEntries.length === 0) {
                note += "NO TAXES DUE, POSSIBLY EXEMPT.";
            } else {
                const first = latestEntries.find(x => x.installment === "1st Half") || { status: "Paid" };
                const second = latestEntries.find(x => x.installment === "2nd Half") || { status: "Paid" };
                const fStat = first.status === "Delinquent" ? "DELINQUENT" : (first.status === "Paid" ? "PAID" : "DUE");
                const sStat = second.status === "Delinquent" ? "DELINQUENT" : (second.status === "Paid" ? "PAID" : "DUE");

                if (first.status === "Paid" && second.status === "Paid") {
                    note += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
                } else if (first.status === "Paid") {
                    note += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${sStat}`;
                } else if (second.status === "Paid") {
                    note += `1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS PAID`;
                } else {
                    note += `1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`;
                }
            }

            // Check prior years for delinquency (from ALL history, not just returned)
            const currentYearInt = parseInt(currentYear);
            const priorDelinquent = allHistory.some(i => {
                const itemYear = parseInt(i.year.split('-')[0]);
                return itemYear < currentYearInt && i.status === "Delinquent";
            });
            
            const priorNote = priorDelinquent ? "PRIOR YEARS TAXES ARE DELINQUENT, " : "ALL PRIOR YEARS ARE PAID, ";
            note += `, NORMALLY PAID IN INSTALLMENTS, NORMAL DUE DATES ARE ${williamsConfig.first_due} & ${williamsConfig.second_due}.`;

            basicData.notes = priorNote + note;
            basicData.delinquent = anyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
            
            // Add summary info
            basicData.years_requested = yearsRequested;
            basicData.years_returned = finalHistory.length > 0 ? [...new Set(finalHistory.map(h => h.year.split('-')[0]))].length : 0;
            basicData.has_delinquent = delinquentInstallments.length > 0;
            basicData.delinquent_years = delinquentInstallments.length > 0 
                ? [...new Set(delinquentInstallments.map(d => d.year.split('-')[0]))].sort() 
                : [];

            resolve(basicData);
        } catch (err) {
            console.error("williams_extract_tax_history error:", err);
            reject({ error: true, message: err.message });
        }
    });
};

// Main search function - Runs validation → basic → status → history
const williams_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Step 1: Validate parcel
            williams_validate(page, account)
                .then(() => {
                    // Step 2: Extract basic info
                    williams_extract_basic(page, account)
                        .then((basicData) => {
                            // Step 3: Get current tax status
                            williams_extract_tax_status(page)
                                .then((taxStatus) => {
                                    // Step 4: Build full history and notes with requested years
                                    williams_extract_tax_history(page, basicData, taxStatus, yearsRequested)
                                        .then((finalData) => {
                                            resolve(finalData);
                                        })
                                        .catch((error) => {
                                            console.log("Error in williams_extract_tax_history:", error);
                                            reject(error);
                                        });
                                })
                                .catch((error) => {
                                    console.log("Error in williams_extract_tax_status:", error);
                                    reject(error);
                                });
                        })
                        .catch((error) => {
                            console.log("Error in williams_extract_basic:", error);
                            reject(error);
                        });
                })
                .catch((error) => {
                    console.log("Error in williams_validate:", error);
                    reject(error);
                });
        } catch (error) {
            console.log("Unexpected error in williams_search:", error);
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
            williams_search(page, account, yearsRequested)
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
            williams_search(page, account, yearsRequested)
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

export { search };