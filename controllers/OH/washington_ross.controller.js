// AUTHOR: DHANUSH 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// Format currency helper
const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = Math.abs(parseFloat(str.toString().replace(/[^0-9.-]+/g, "")));
    return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//timeout
const timeout_option = {
    timeout: 90000
};

// COUNTY CONFIGURATIONS
const counties = {
    ross: {
        url: 'https://auditor.rosscountyohio.gov/Parcel?Parcel=',
        taxing_authority: 'Ross County Auditor, 2 N Paint St, Chillicothe, OH 45601, Ph: 740-702-3080',
        first_due: '02/23',
        second_due: '07/18',
        first_delq: '02/15',
        second_delq: '07/19',
    },
    washington: {
        url: 'https://auditorwashingtoncountyohio.gov/Parcel?Parcel=',
        taxing_authority: 'Washington County Auditor, 205 Putnam Street, Marietta, OH 45750, Ph: 740-373-6623',
        first_due: '03/14',
        second_due: '08/08',
        first_delq: '03/15',
        second_delq: '08/09',
    }
};

// Navigation and validation
const validate_parcel = async (page, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${countyConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout_option});
            
            // Wait for main content sections to confirm page loaded properly
            const pageContentExists = await page.waitForSelector('#ppPromoted', { timeout_option});
            await page.waitForSelector('#TaxBills', { timeout_option});
            if (!pageContentExists) {
                return reject({ error: true, message: "Invalid Parcel Number or No Records Found" });
            }

            // Check if the page says "No Base Records Found" – means invalid parcel
            const isInvalidParcel = await page.evaluate(() => {
                const locationSection = document.querySelector('#Location');
                return locationSection?.textContent?.includes("No Base Records Found.") || false;
            });
            
            if (isInvalidParcel) {
                return reject({ error: true, message: `Parcel ${account} is invalid: No records found in the database.` });
            }

            // All good – parcel exists and page loaded
            resolve(true);
        } catch (error) {
            console.error("Error in validate_parcel:", error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract basic parcel info
const extract_basic_info = async (page, account, countyConfig) => {
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
                    currentYear:""
                };

                // Grab owner and address from the promoted info box at top
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

                // Extract land, building, and total assessed values from valuation table
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
                // Detect current tax year from the tax bill tab header
                const yearText = document.querySelector("#taxBill-tabs li div")?.textContent.trim();
                if(yearText){
                    const year = yearText.split(" ")[0]||"N/A"; 
                    data.currentYear=year;
                }
                return data;
            }, account);

            // Attach the correct county auditor info
            basicData.taxing_authority = countyConfig.taxing_authority;
            resolve(basicData);
        } catch (error) {
            console.error("Error in extract_basic_info:", error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax payment status (for flow control only)
const extract_tax_status = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const taxStatus = await page.evaluate(() => {
                const billTable = document.querySelector('table[title*="Tax Table"]');
                if (!billTable) return { status: "NO_TAX_HISTORY", totalDue: "$0.00" };

                const rows = Array.from(billTable.querySelectorAll('tr'));
                const owedRow = rows.find(row => row.textContent?.includes('Owed'));
                if (!owedRow) return { status: "PAID", totalDue: "$0.00" };

                const cells = owedRow.querySelectorAll('td');
                if (cells.length < 4) return { status: "PAID", totalDue: "$0.00" };

                // Calculate total still owed (1st + 2nd half)
                const firstHalfOwed = Math.abs(parseFloat(cells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0")) || 0;
                const secondHalfOwed = Math.abs(parseFloat(cells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0")) || 0;
                const totalOwed = firstHalfOwed + secondHalfOwed;

                if (totalOwed <= 0.01) return { status: "PAID", totalDue: "$0.00" };
                return { status: "UNPAID", totalDue: `$${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
            });

            resolve(taxStatus);
        } catch (error) {
            console.error("Error in extract_tax_status:", error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax history with NEW STATUS LOGIC (Due/Delinquent only)
const extract_tax_history = async (page, basicData, taxStatus, countyConfig, taxYears = 1) => {
    try {
        const currentDate = new Date();

        // 1. Extract all payments once with smart year/half detection
        let allPayments = await page.evaluate(() => {
            const paymentTable = document.querySelector('table[title="Tax Payments"], table[title*="Payment"], #taxPayments, #Payments table');
            if (!paymentTable) return [];

            const rows = Array.from(paymentTable.querySelectorAll('tbody tr, tr')).filter(row => row.querySelectorAll('td').length >= 2);
            
            return rows.map((row, index) => {
                const cells = row.querySelectorAll('td');
                const dateText = cells[0]?.textContent?.trim() || "";
                if (!dateText || !dateText.includes('/')) return null;

                const amountText = cells[2]?.textContent?.trim() || "0";
                const amount = Math.abs(parseFloat(amountText.replace(/[^0-9.-]+/g, ""))) || 0;
                if (amount <= 0) return null;

                const rowText = row.textContent.trim();
                
                // Extract tax year from row text if possible (e.g., "2024", "Cycle 1-24")
                let year = "";
                const yearMatch = rowText.match(/\b20\d{2}\b/);
                const cycleMatch = rowText.match(/[12]-(\d{2})\b/);
                
                if (cycleMatch) {
                    year = "20" + cycleMatch[1];
                } else if (yearMatch) {
                    // Only use it if it's not the payment date year
                    const paymentYear = dateText.split('/').pop();
                    if (yearMatch[0] !== paymentYear) {
                        year = yearMatch[0];
                    }
                }

                // Detect half if possible
                let half = 0;
                if (rowText.toLowerCase().includes('1st') || rowText.toLowerCase().includes('first')) half = 1;
                if (rowText.toLowerCase().includes('2nd') || rowText.toLowerCase().includes('second')) half = 2;

                return {
                    id: `pay_${index}`,
                    date: dateText,
                    year: year,
                    half: half,
                    amount: amount,
                    fullText: rowText,
                    sortDate: new Date(dateText).getTime() || 0
                };
            }).filter(p => p !== null);
        });

        // Sort payments by date chronologically
        allPayments.sort((a, b) => a.sortDate - b.sortDate);

    // 2. Extract available years from tabs
        const availableYears = await page.evaluate(() => {
            const years = [];
            const navTabs = document.querySelectorAll('#taxBill-tabs li div, .nav-tabs li div');
            navTabs.forEach((tab, idx) => {
                const yearText = tab.textContent.trim();
                const year = yearText.split(' ')[0];
                if (year && !isNaN(parseInt(year))) {
                    const targetId = tab.getAttribute('data-target') || tab.getAttribute('href');
                    years.push({ year: year, targetId: targetId, index: idx });
                }
            });
            return years;
        });

        if (availableYears.length === 0) return basicData;
        availableYears.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        const allHistory = [];
        let foundUnpaid = false;
        let yearsSuccessfullyProcessed = 0;

        // 3. Process each year by clicking tabs
        for (let i = 0; i < availableYears.length; i++) {
            const { year, targetId } = availableYears[i];
            const tabSelector = `div[data-target="${targetId}"], div[href="${targetId}"]`;
            
            try {
                await page.click(tabSelector);
                await page.waitForFunction((id) => {
                    const pane = document.querySelector(id);
                    return pane && (pane.classList.contains('active') || pane.classList.contains('show'));
                }, { timeout: 3000 }, targetId);
                await delay(500);
            } catch (e) {}

            const yearData = await page.evaluate((currentYear, targetId) => {
                let activeTabPane = document.querySelector(`${targetId}.active, ${targetId}.show.active`) || document.querySelector(targetId);
                if (!activeTabPane) return null;
                
                const taxTable = activeTabPane.querySelector('table[title*="Tax Table"], table[title*="Taxes"]');
                if (!taxTable) return null;

                const rows = Array.from(taxTable.querySelectorAll('tr'));
                const netGeneralRow = rows.find(r => r.textContent.includes('Net General') || r.textContent.includes('NET TAX'));
                const owedRow = rows.find(r => r.textContent.includes('Owed') || r.textContent.includes('NET DUE'));
                
                if (!owedRow || !netGeneralRow) return null;

                const netCells = netGeneralRow.querySelectorAll('td');
                const owedCells = owedRow.querySelectorAll('td');

                if (netCells.length < 4 || owedCells.length < 4) return null;

                return {
                    year: currentYear,
                    firstHalfNet: netCells[2]?.textContent.trim() || "$0.00",
                    secondHalfNet: netCells[3]?.textContent.trim() || "$0.00",
                    firstHalfOwed: owedCells[2]?.textContent.trim() || "$0.00",
                    secondHalfOwed: owedCells[3]?.textContent.trim() || "$0.00",
                    delinquencyDue: owedCells[1]?.textContent.trim() || "$0.00"
                };
            }, year, targetId);

            if (!yearData) continue;

            const dueYear = (parseInt(year) + 1).toString();

            const firstHalfBilled = Math.abs(parseFloat(yearData.firstHalfNet.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfBilled = Math.abs(parseFloat(yearData.secondHalfNet.replace(/[^0-9.-]+/g, ""))) || 0;
            const firstHalfDueAmount = Math.abs(parseFloat(yearData.firstHalfOwed.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfDueAmount = Math.abs(parseFloat(yearData.secondHalfOwed.replace(/[^0-9.-]+/g, ""))) || 0;


            const firstHalfPaidAmount = Math.max(0, firstHalfBilled - firstHalfDueAmount);
            const secondHalfPaidAmount = Math.max(0, secondHalfBilled - secondHalfDueAmount);

            // Find payments for this year
            let yearPayments = allPayments.filter(p => p.year === year).sort((a, b) => a.sortDate - b.sortDate);
            
            // Fallback for unlabeled payments
            if (yearPayments.length === 0 && (firstHalfPaidAmount > 0 || secondHalfPaidAmount > 0)) {
                yearPayments = allPayments.filter(p => {
                    if (p.year && p.year !== year) return false;
                    const pYear = new Date(p.date).getFullYear();
                    return pYear >= parseInt(year) && pYear <= parseInt(year) + 1;
                }).sort((a, b) => a.sortDate - b.sortDate);
            }

            let firstHalfPaidDate = "";
            let secondHalfPaidDate = "";
            const consumedPaymentIds = new Set();

            // 1. Check for Single Annual Payment (covers both halves)
            if (yearPayments.length === 1 && firstHalfPaidAmount > 0 && secondHalfPaidAmount > 0) {
                const p = yearPayments[0];
                const totalPaid = firstHalfPaidAmount + secondHalfPaidAmount;
                if (Math.abs(p.amount - totalPaid) < 5.00 || Math.abs(p.amount) > Math.max(firstHalfPaidAmount, secondHalfPaidAmount)) {
                    firstHalfPaidDate = p.date;
                    secondHalfPaidDate = p.date;
                    consumedPaymentIds.add(p.id);
                    yearPayments = []; // Consumed
                }
            }

            // 2. Match Second Half
            if (secondHalfPaidAmount > 0 && !secondHalfPaidDate && yearPayments.length > 0) {
                let matchIndex = yearPayments.findIndex(p => p.half === 2);
                if (matchIndex === -1) matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - secondHalfPaidAmount) < 1.00);
                
                if (matchIndex !== -1) {
                    secondHalfPaidDate = yearPayments[matchIndex].date;
                    consumedPaymentIds.add(yearPayments[matchIndex].id);
                    yearPayments.splice(matchIndex, 1);
                } else {
                    const p = yearPayments[yearPayments.length - 1];
                    secondHalfPaidDate = p.date;
                    consumedPaymentIds.add(p.id);
                    yearPayments.pop();
                }
            }

            // 3. Match First Half
            if (firstHalfPaidAmount > 0 && !firstHalfPaidDate && yearPayments.length > 0) {
                let matchIndex = yearPayments.findIndex(p => p.half === 1);
                if (matchIndex === -1) matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - firstHalfPaidAmount) < 1.00);
                
                if (matchIndex !== -1) {
                    firstHalfPaidDate = yearPayments[matchIndex].date;
                    consumedPaymentIds.add(yearPayments[matchIndex].id);
                    yearPayments.splice(matchIndex, 1);
                } else {
                    const p = yearPayments[0];
                    firstHalfPaidDate = p.date;
                    consumedPaymentIds.add(p.id);
                    yearPayments.shift();
                }
            }

            // Remove consumed payments from allPayments so they aren't reused
            if (consumedPaymentIds.size > 0) {
                allPayments = allPayments.filter(p => !consumedPaymentIds.has(p.id));
            }

            const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
            const firstDelqDate = `${countyConfig.first_delq}/${dueYear}`;
            const secondDelqDate = `${countyConfig.second_delq}/${dueYear}`;

            const is_delq = (dateStr) => {
                const [month, day, year] = dateStr.split('/');
                const delqDate = new Date(year, month - 1, day);
                delqDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return today >= delqDate;
            };

            const isFirstDelq = is_delq(firstDelqDate);
            const isSecondDelq = is_delq(secondDelqDate);

            if (isAnnual) {
                const totalPaid = firstHalfPaidAmount + secondHalfPaidAmount;
                const totalDue = firstHalfDueAmount + secondHalfDueAmount;
                const totalBilled = totalPaid + totalDue;

                let status = "Paid";
                let displayPaid = formatCurrency(totalPaid);
                let displayDue = formatCurrency(totalDue);

                if (totalDue > 0.01) {
                    status = isFirstDelq ? "Delinquent" : "Due";
                }

                allHistory.push({
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Annual",
                    status: status,
                    base_amount: formatCurrency(totalBilled),
                    amount_paid: displayPaid,
                    amount_due: displayDue,
                    mailing_date: "N/A",
                    due_date: `${countyConfig.first_due}/${dueYear}`,
                    delq_date: firstDelqDate,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            } else {
                let firstStatus = "Paid";
                let firstDisplayPaid = formatCurrency(firstHalfPaidAmount);
                let firstDisplayDue = formatCurrency(firstHalfDueAmount);

                if (firstHalfDueAmount > 0.01) {
                    firstStatus = isFirstDelq ? "Delinquent" : "Due";
                }

                let secondStatus = "Paid";
                let secondDisplayPaid = formatCurrency(secondHalfPaidAmount);
                let secondDisplayDue = formatCurrency(secondHalfDueAmount);

                if (secondHalfDueAmount > 0.01) {
                    secondStatus = isSecondDelq ? "Delinquent" : "Due";
                }

                allHistory.push(
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: firstStatus,
                        base_amount: formatCurrency(firstHalfBilled),
                        amount_paid: firstDisplayPaid,
                        amount_due: firstDisplayDue,
                        mailing_date: "N/A",
                        due_date: `${countyConfig.first_due}/${dueYear}`,
                        delq_date: firstDelqDate,
                        paid_date: firstHalfPaidDate || (firstStatus === "Paid" ? "N/A" : ""),
                        good_through_date: ""
                    },
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: secondStatus,
                        base_amount: formatCurrency(secondHalfBilled),
                        amount_paid: secondDisplayPaid,
                        amount_due: secondDisplayDue,
                        mailing_date: "N/A",
                        due_date: `${countyConfig.second_due}/${dueYear}`,
                        delq_date: secondDelqDate,
                        paid_date: secondHalfPaidDate || (secondStatus === "Paid" ? "N/A" : ""),
                        good_through_date: ""
                    }
                );
            }

            const currentYearHistory = allHistory.slice(isAnnual ? -1 : -2);
            const isYearUnpaid = currentYearHistory.some(item => ["Due", "Delinquent"].includes(item.status));
            if (isYearUnpaid) foundUnpaid = true;

            yearsSuccessfullyProcessed++;

            // Optimization logic
            if (taxYears === 1) {
                if (yearsSuccessfullyProcessed === 1 && !isYearUnpaid) break;
            } else if (taxYears === 2) {
                if (yearsSuccessfullyProcessed === 2 && !foundUnpaid) break;
            }

            if (foundUnpaid && !isYearUnpaid) break;
        }

        // 4. Final filtering based on client type
        let finalTaxHistory = allHistory;
        if (foundUnpaid) {
            finalTaxHistory = allHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        } else if (taxYears === 1) {
            const uniqueYears = [...new Set(allHistory.map(item => item.year))].sort((a, b) => b - a);
            finalTaxHistory = allHistory.filter(item => item.year === uniqueYears[0]);
        }

        basicData.tax_history = finalTaxHistory;

        // 5. Generate notes and set delinquent flag
        const unpaidItems = finalTaxHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        const delinquentItems = finalTaxHistory.filter(item => item.status === "Delinquent");
        const unpaidYears = [...new Set(unpaidItems.map(item => item.year))];
        const annualNote = `NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${countyConfig.first_due} & ${countyConfig.second_due}`;

        if (delinquentItems.length > 0) {
            basicData.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE DELINQUENT, ${annualNote}`;
            basicData.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else if (unpaidItems.length > 0) {
            const status = unpaidItems.every(item => item.status === "Due") ? "DUE" : "UNPAID";
            basicData.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE ${status}, ${annualNote}`;
            basicData.delinquent = "NONE";
        } else {
            const latestYear = availableYears.length > 0 ? availableYears[0].year : (new Date().getFullYear() - 1).toString();
            basicData.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${annualNote}`;
            basicData.delinquent = "NONE";
        }

        return basicData;
    } catch (error) {
        console.error("Error in extract_tax_history:", error);
        throw error;
    }
};

const account_search = async (page, account, countyConfig, taxYears = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            validate_parcel(page, account, countyConfig)
                .then(() => {
                    extract_basic_info(page, account, countyConfig)
                        .then((basicData) => {
                            extract_tax_status(page)
                                .then((taxStatus) => {
                                    extract_tax_history(page, basicData, taxStatus, countyConfig, taxYears)
                                        .then((finalData) => {
                                            resolve(finalData);
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
    const county = req.path.replace(/^\/+/, "");
    
    try {
        // Basic input validation
        if(!account || account.trim()==''){
            return res.status(200).render("error_data", {
                error: true,
                message: "Account number is required."
            });
        }
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        if (!county || !counties[county]) {
            return res.status(200).render("error_data", { 
                error: true, 
                message: "Invalid County" 
            });
        }

        const taxYears = getOHCompanyYears(client);
        const config = counties[county];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // Block images, CSS, fonts to speed up scraping
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, account, config, taxYears)
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
            account_search(page, account, config, taxYears)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).json({
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
        res.status(200).render('error_data', {
            error: true,
            message: error.message
        });
    }
};


export { search };