//author:Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Default timeout
const timeout_option = {
    timeout: 90000
};

// County configurations with URLs, due dates, and taxing authority info
const COUNTY_CONFIGS = {
    henry: {
        url: "https://henryparcel.appraisalresearchcorp.com/TaxChargesPayments.aspx?Parcel=",
        taxing_authority: "Henry County Auditor, 660 N Perry St, Napoleon, OH 43545, Ph: (419) 592-1856",
        due_dates: {
            first: "05/02",
            second: "09/07"
        },
        delq_dates: {
            first: "05/03",
            second: "09/08"
        }
    },
    pike: {
        url: "https://pikeparcel.appraisalresearchcorp.com/TaxChargesPayments.aspx?Parcel=",
        taxing_authority: "Pike County Auditor, 230 Waverly Plaza, Waverly, OH 45690, Ph: (740) 947-4125",
        due_dates: {
            first: "01/12",
            second: "06/15"
        },
        delq_dates: {
            first: "01/13",
            second: "06/16"
        }
    }
};

// Step 1: Check if parcel number exists and has valid data
const ac_1 = async (page, account, config) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${config.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout_option });
            
            const result = await page.evaluate((expectedAccount) => {
                const taxGrid = document.querySelector('#MainContent_WGRE');
                if (!taxGrid) return false;

                let found = false;
                Array.from(document.querySelectorAll('td')).forEach(cell => {
                    const text = cell.textContent || '';
                    const match = text.match(/Parcel\s*([0-9A-Z-]+)/i);
                    if (match && match[1]?.trim().includes(expectedAccount)) {
                        found = true;
                    }
                });

                return found;
            }, account.trim());
            
            if (!result) {
                return reject(new Error(`Parcel ${account} is invalid: Not found on page (no matching parcel number)`));
            }
            resolve(true);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 2: Extract basic property info + get all available years
const ac_2 = async (page, account, config) => {
    return new Promise(async (resolve, reject) => {
        try {
            const pageData = await page.evaluate((account, configData) => {
                const datum = {
                    processed_date: new Date().toISOString().split("T")[0],
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
                    taxing_authority: configData.taxing_authority,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    allYears: [],
                    currentDisplayYear: ""
                };

                const rows = Array.from(document.querySelectorAll('tr'));
                
                // Find and extract owner name
                const ownerRow = rows.find(tr => {
                    const cells = tr.querySelectorAll('td');
                    return cells.length >= 2 && cells[0].textContent.includes('Owner Name');
                });
                if (ownerRow) {
                    datum.owner_name[0] = ownerRow.querySelectorAll('td')[1]?.textContent.trim() || "N/A";
                }

                // Find and extract property address
                const addressRow = rows.find(tr => {
                    const cells = tr.querySelectorAll('td');
                    return cells.length >= 2 && cells[0].textContent.includes('Property Location');
                });
                if (addressRow) {
                    datum.property_address = addressRow.querySelectorAll('td')[1]?.textContent.trim() || "N/A";
                }

                // Find market value and taxable value from the table
                for (let i = 0; i < rows.length; i++) {
                    const headerCells = rows[i].querySelectorAll('td, th');
                    let hasMarket = false;
                    let hasTaxable = false;
                    
                    for (let cell of headerCells) {
                        const text = cell.textContent.trim();
                        if (text.includes('Market') && text.includes('Value')) hasMarket = true;
                        if (text.includes('Taxable') && text.includes('Value')) hasTaxable = true;
                    }
                    
                    if (hasMarket && hasTaxable) {
                        const valueRow = rows[i + 1];
                        if (valueRow) {
                            const valueCells = valueRow.querySelectorAll('td');
                            if (valueCells.length >= 2) {
                                for (let j = 0; j < headerCells.length; j++) {
                                    if (headerCells[j].textContent.includes('Market')) {
                                        const rawValue = valueCells[j]?.textContent.trim().replace(/,/g, '') || "0";
                                        const num = parseFloat(rawValue);
                                        datum.land_value = isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                    }
                                    if (headerCells[j].textContent.includes('Taxable')) {
                                        const rawValue = valueCells[j]?.textContent.trim().replace(/,/g, '') || "0";
                                        const num = parseFloat(rawValue);
                                        datum.total_taxable_value = isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                        datum.total_assessed_value = datum.total_taxable_value;
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
                
                // Get all years from dropdown
                let allYears = [];
                const dropdown = document.querySelector('#MainContent_DDLColYr');
                if (dropdown) {
                    const options = Array.from(dropdown.querySelectorAll('option'));
                    allYears = options
                        .map(opt => opt.value.trim())
                        .filter(val => val && val !== "");
                }
                datum.allYears = allYears;
                datum.currentDisplayYear = allYears.length > 0 ? allYears[0] : "";
                
                return datum;
            }, account, config);

            if (pageData.owner_name[0] === "N/A" || pageData.property_address === "N/A") {
                return reject(new Error(`Parcel ${account} has incomplete data.`));
            }

            resolve(pageData);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 3: Extract tax history
const ac_3 = async (page, data, config, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const availableYears = data.allYears;

            if (availableYears.length === 0) {
                return reject(new Error("No years available in dropdown"));
            }

            const currentDisplayYear = parseInt(data.currentDisplayYear);

            const formatCurrency = (val) => {
                if (!val) return "$0.00";
                const num = parseFloat(val.toString().replace(/[^0-9.-]+/g, ""));
                return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };

            const parseAmount = (str) => {
                if (!str) return 0;
                const num = parseFloat(str.toString().replace(/[^0-9.-]+/g, ""));
                return isNaN(num) ? 0 : num;
            };

            let allTaxHistory = [];
            let delinquentInstallments = [];
            let hasStartingBalance = false;

            // Sort available years descending: newest first
            availableYears.sort((a, b) => parseInt(b) - parseInt(a));

            // Load N+1 years to check for delinquencies and starting balances
            const maxYearsToLoad = yearsRequested + 1;
            let yearsToProcess = availableYears.slice(0, maxYearsToLoad);

            if (yearsToProcess.length < yearsRequested) {
                yearsToProcess = availableYears.slice();
            }

            // Process the years
            for (const targetYear of yearsToProcess) {
                try {
                    await page.waitForSelector('#MainContent_DDLColYr', { timeout: 10000 });
                    await page.select('#MainContent_DDLColYr', targetYear);
                    await delay(5000);
                    await page.waitForSelector('#MainContent_WGRE tbody tr', { timeout: 20000 });

                    const yearData = await page.evaluate((configData, targetYr) => {
                        const formatCurrency = (str) => {
                            if (!str) return "$0.00";
                            const num = parseFloat(str.toString().replace(/[^0-9.-]+/g, ""));
                            return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        };

                        const parseAmount = (str) => {
                            if (!str) return 0;
                            const num = parseFloat(str.toString().replace(/[^0-9.-]+/g, ""));
                            return isNaN(num) ? 0 : num;
                        };

                        const history = [];
                        const displayYear = parseInt(targetYr);
                        const taxYear = displayYear.toString();

                        // Payments
                        const paymentGrid = document.querySelector('#MainContent_GridView1');
                        const payments = [];
                        if (paymentGrid) {
                            const paymentRows = Array.from(paymentGrid.querySelectorAll('tbody tr')).filter(tr => {
                                return !tr.classList.contains('igg_SummaryRow') &&
                                       !tr.classList.contains('igg_Header') &&
                                       !tr.id?.includes('header') &&
                                       !tr.id?.includes('footer') &&
                                       tr.querySelectorAll('td').length >= 3;
                            });

                            paymentRows.forEach(row => {
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 3) {
                                    payments.push({
                                        date: cells[0]?.textContent.trim() || "",
                                        amount: parseAmount(cells[1]?.textContent.trim() || "0"),
                                        description: cells[2]?.textContent.trim() || ""
                                    });
                                }
                            });
                        }

                        // Tax grid
                        const taxGrid = document.querySelector('#MainContent_WGRE');
                        if (!taxGrid) return { history: [], hasStartingBalance: false };

                        const taxRows = Array.from(taxGrid.querySelectorAll('tbody tr')).filter(tr => {
                            return !tr.classList.contains('igg_SummaryRow') &&
                                   !tr.classList.contains('igg_Header') &&
                                   !tr.id?.includes('header') &&
                                   !tr.id?.includes('footer') &&
                                   tr.querySelectorAll('td').length > 0;
                        });

                        let yearHasStartingBalance = false;
                        let totalFirstHalf = 0;
                        let totalSecondHalf = 0;
                        let totalFirstHalfPenalty = 0;
                        let totalSecondHalfPenalty = 0;
                        let totalInterest = 0;

                        taxRows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length < 10) return;

                            const description = cells[0]?.textContent.trim() || "";
                            if (description.toLowerCase().includes('prepayment')) return;

                            const startingBalance = parseAmount(cells[1]?.textContent.trim() || "0");
                            if (startingBalance > 0.01) {
                                yearHasStartingBalance = true;
                            }

                            totalFirstHalf += parseAmount(cells[2]?.textContent.trim() || "0");
                            totalSecondHalf += parseAmount(cells[3]?.textContent.trim() || "0");
                            totalFirstHalfPenalty += parseAmount(cells[4]?.textContent.trim() || "0");
                            totalSecondHalfPenalty += parseAmount(cells[5]?.textContent.trim() || "0");
                            totalInterest += parseAmount(cells[6]?.textContent.trim() || "0");
                        });

                        const firstHalfTotal = totalFirstHalf + totalFirstHalfPenalty;
                        const secondHalfTotal = totalSecondHalf + totalSecondHalfPenalty;

                        const parseDelqDate = (dateStr, year) => {
                            const parts = dateStr.split('/');
                            return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
                        };

                        const currentDate = new Date();

                        if (totalFirstHalf > 0.01) {
                            const firstHalfPaid = payments.some(p => Math.abs(p.amount - firstHalfTotal) < 0.01);
                            const firstDelqDate = parseDelqDate(configData.delq_dates.first, displayYear);
                            const isFirstDelq = currentDate > firstDelqDate;
                            const firstStatus = firstHalfPaid ? "Paid" : (isFirstDelq ? "Delinquent" : "Due");

                            const payment = payments.find(p => Math.abs(p.amount - firstHalfTotal) < 0.01);

                            history.push({
                                jurisdiction: "County",
                                year: taxYear,
                                payment_type: "Semi-Annual",
                                installment: "1st Half",
                                status: firstStatus,
                                base_amount: formatCurrency(totalFirstHalf),
                                amount_paid: firstHalfPaid ? formatCurrency(firstHalfTotal) : "$0.00",
                                amount_due: firstHalfPaid ? "$0.00" : formatCurrency(firstHalfTotal + (totalInterest * 0.5)),
                                mailing_date: "N/A",
                                due_date: `${configData.due_dates.first}/${displayYear}`,
                                delq_date: `${configData.delq_dates.first}/${displayYear}`,
                                paid_date: payment ? payment.date : "-",
                                good_through_date: ""
                            });
                        }

                        if (totalSecondHalf > 0.01) {
                            const secondHalfPaid = payments.some(p => Math.abs(p.amount - secondHalfTotal) < 0.01);
                            const secondDelqDate = parseDelqDate(configData.delq_dates.second, displayYear);
                            const isSecondDelq = currentDate > secondDelqDate;
                            const secondStatus = secondHalfPaid ? "Paid" : (isSecondDelq ? "Delinquent" : "Due");

                            const payment = payments.find(p => Math.abs(p.amount - secondHalfTotal) < 0.01);

                            history.push({
                                jurisdiction: "County",
                                year: taxYear,
                                payment_type: "Semi-Annual",
                                installment: "2nd Half",
                                status: secondStatus,
                                base_amount: formatCurrency(totalSecondHalf),
                                amount_paid: secondHalfPaid ? formatCurrency(secondHalfTotal) : "$0.00",
                                amount_due: secondHalfPaid ? "$0.00" : formatCurrency(secondHalfTotal + (totalInterest * 0.5)),
                                mailing_date: "N/A",
                                due_date: `${configData.due_dates.second}/${displayYear}`,
                                delq_date: `${configData.delq_dates.second}/${displayYear}`,
                                paid_date: payment ? payment.date : "-",
                                good_through_date: ""
                            });
                        }

                        return { history, hasStartingBalance: yearHasStartingBalance };
                    }, config, targetYear);

                    if (yearData.history.length > 0) {
                        allTaxHistory.push(...yearData.history);
                        delinquentInstallments.push(...yearData.history.filter(h => h.status === "Delinquent"));
                    }

                    if (yearData.hasStartingBalance) {
                        hasStartingBalance = true;
                    }

                } catch (error) {
                    console.log(`Error loading year ${targetYear}:`, error.message);
                }
            }

            // Sort history
            allTaxHistory.sort((a, b) => {
                const yearDiff = parseInt(a.year) - parseInt(b.year);
                if (yearDiff !== 0) return yearDiff;
                return a.installment === "1st Half" ? -1 : 1;
            });

            const uniqueYearsInHistory = [...new Set(allTaxHistory.map(h => h.year))].sort();

            // CORRECTED LOGIC: Determine which years to show
            let yearsToShow = [];
            
            if (uniqueYearsInHistory.length <= yearsRequested) {
                // If we have fewer or equal years than requested, show all
                yearsToShow = uniqueYearsInHistory;
            } else {
                // Start with the most recent N years requested
                yearsToShow = uniqueYearsInHistory.slice(-yearsRequested);
                
                // Check if we need to include one additional older year
                const oldestYearToShow = yearsToShow[0];
                const indexOfOldest = uniqueYearsInHistory.indexOf(oldestYearToShow);
                
                if (indexOfOldest > 0) {
                    const previousYear = uniqueYearsInHistory[indexOfOldest - 1];
                    const previousYearEntries = allTaxHistory.filter(h => h.year === previousYear);
                    
                    // Include previous year if:
                    // 1. It has a starting balance, OR
                    // 2. It has delinquent installments
                    const prevYearHasDelinquent = previousYearEntries.some(e => e.status === "Delinquent");
                    const prevYearStartBalance = hasStartingBalance && 
                        parseInt(previousYear) === parseInt(yearsToShow[0]) - 1;
                    
                    if (prevYearHasDelinquent || prevYearStartBalance) {
                        yearsToShow.unshift(previousYear);
                    }
                }
            }

            let finalHistory = allTaxHistory.filter(h => yearsToShow.includes(h.year));

            // Always include delinquent installments from any year
            for (const delq of delinquentInstallments) {
                if (!finalHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
                    finalHistory.push(delq);
                }
            }

            finalHistory.sort((a, b) => {
                const yearDiff = parseInt(a.year) - parseInt(b.year);
                if (yearDiff !== 0) return yearDiff;
                return a.installment === "1st Half" ? -1 : 1;
            });

            data.tax_history = finalHistory;

            // Generate notes
            const hasAnyDelinquent = finalHistory.some(e => e.status === "Delinquent");

            const priorDelinquent = allTaxHistory.some(i => 
                parseInt(i.year) < currentDisplayYear && i.status === "Delinquent"
            );

            const priorYearsNote = priorDelinquent
                ? "PRIOR YEARS TAXES ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID";

            // Find the most recent year that actually has tax charges
            const yearsWithCharges = [...new Set(finalHistory.map(h => h.year))].sort().reverse();
            let actualCurrentYear = yearsWithCharges.length > 0 ? yearsWithCharges[0] : currentDisplayYear.toString();

            const currentYearEntries = finalHistory.filter(e => e.year === actualCurrentYear);

            let currentYearNote = "";
            if (currentYearEntries.length === 0) {
                currentYearNote = "NO CURRENT TAXES BILLED YET";
            } else {
                const first = currentYearEntries.find(e => e.installment === "1st Half");
                const second = currentYearEntries.find(e => e.installment === "2nd Half");

                const firstStatus = first ? (first.status === "Paid" ? "PAID" : first.status.toUpperCase()) : "PAID";
                const secondStatus = second ? (second.status === "Paid" ? "PAID" : second.status.toUpperCase()) : "PAID";

                if (firstStatus === secondStatus && firstStatus !== "PAID") {
                    currentYearNote = `${actualCurrentYear} 1ST INSTALLMENT IS ${firstStatus} AND 2ND INSTALLMENT IS ${secondStatus}`;
                } else {
                    currentYearNote = `${actualCurrentYear} 1ST INSTALLMENT ${firstStatus}, 2ND INSTALLMENT ${secondStatus}`;
                }
            }

            const notesParts = [
                priorYearsNote,
                currentYearNote,
                `NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${config.due_dates.first} & ${config.due_dates.second}`
            ];

            data.notes = notesParts.join(', ');
            data.delinquent = hasAnyDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            // Metadata
            data.years_requested = yearsRequested;
            data.years_returned = [...new Set(finalHistory.map(h => h.year))].length;
            data.has_delinquent = delinquentInstallments.length > 0;
            data.delinquent_years = [...new Set(delinquentInstallments.map(d => d.year))].sort();

            resolve(data);

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const account_search = async (page, account, config, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, account, config)
            .then(() => {
                ac_2(page, account, config)
                .then((ac2Data) => {
                    ac_3(page, ac2Data, config, yearsRequested)
                    .then((finalData) => { 
                        resolve(finalData);
                    })
                    .catch((error) => {
                        console.log(error);
                        reject(error);
                    })
                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                })
            })
            .catch((error) => {
                console.log(error);
                reject(error);
            })
        } catch(error) {
            console.log(error);
            reject(new Error(error.message));
        }
    })
}


// API + HTML ROUTES
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    const county = req.path.replace(/^\/+/, "");
    
    try {
        if (account.trim() == '' || !account) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Account number is required."
            });
        }
        
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        if (!county || !COUNTY_CONFIGS[county]) {
            return res.status(200).render("error_data", { 
                error: true, 
                message: "Invalid County" 
            });
        }

        const config = COUNTY_CONFIGS[county];
        
        // Get number of years to fetch based on client
        let yearsRequested = getOHCompanyYears(client);
        
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image')  {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, account, config, yearsRequested)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, account, config, yearsRequested)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

module.exports = { search };