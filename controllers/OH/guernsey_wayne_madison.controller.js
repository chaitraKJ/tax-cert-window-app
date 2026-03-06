// AUTHOR: DHANUSH
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility functions
const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = Math.abs(parseFloat(str.toString().replace(/[^0-9.-]+/g, "")));
    return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

// COUNTY CONFIGURATIONS
const counties = {
    wayne: {
        url: 'https://waynecountyauditor.org/Parcel?Parcel=',
        taxing_authority: 'Wayne County Auditor, 428 W Liberty St, Wooster, OH 44691, Ph: 330-287-5485',
        first_due: '02/02',
        second_due: '06/07',
        first_delq: '02/03',
        second_delq: '06/08',
    },
    guernsey: {
        url: 'https://auditor.guernseycounty.gov/Parcel?Parcel=',
        taxing_authority: 'Guernsey County Auditor, 627 Wheeling Avenue, Suite 301, Cambridge, OH 43725, Ph: 740-432-9277',
        first_due: '02/14',
        second_due: '07/18',
        first_delq: '02/15',
        second_delq: '07/19',
    },
    madison: {
        url: 'https://auditor.co.madison.oh.us/Parcel?Parcel=',
        taxing_authority: 'Madison County Auditor, 1 N. Main St., London, OH 43140, Ph: 740-852-9446',
        first_due: '02/14',
        second_due: '06/20',
        first_delq: '02/15',
        second_delq: '06/21',
    }
};

// Navigation and validation
const validate_parcel = async (page, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${countyConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 70000 });
            
            // Wait for key sections – if missing, parcel likely doesn't exist
            const pageContentExists = await page.waitForSelector('#ppPromoted', { timeout: 50000 });
            await page.waitForSelector('#TaxBills', { timeout: 50000 });
            if (!pageContentExists) {
                return reject({ error: true, message: "Invalid Parcel Number or No Records Found" });
            }

            // Double-check for "No Base Records Found" message
            const isInvalidParcel = await page.evaluate(() => {
                const locationSection = document.querySelector('#Location');
                return locationSection?.textContent?.includes("No Base Records Found.") || false;
            });
            
            if (isInvalidParcel) {
                return reject({ error: true, message: `Parcel ${account} is invalid: No records found in the database.` });
            }

            // Parcel is valid and page loaded successfully
            resolve(true);
        } catch (error) {
            console.log(error);
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

                // Extract owner and property address from top summary box
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

                // Get valuation breakdown from the Valuation table
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
                // Extract current tax year from the tab header
                const yearText = document.querySelector("#taxBill-tabs li div")?.textContent.trim();
                if(yearText){
                    const year = yearText.split(" ")[0]||"N/A";
                    data.currentYear=year;
                }
                
                return data;
            }, account);

            // Attach county-specific auditor contact info
            basicData.taxing_authority = countyConfig.taxing_authority;
            resolve(basicData);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax payment status (for flow control only)
const extract_tax_status = async (page, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const taxStatus = await page.evaluate((config) => {
                const currentDate = new Date();
                const parseDate = (dateStr, year) => {
                    const parts = dateStr.split('/');
                    if (parts.length !== 2) return new Date(0);
                    const month = parseInt(parts[0], 10);
                    const day = parseInt(parts[1], 10);
                    return new Date(year, month - 1, day);
                };

                const billTable = document.querySelector('table[title*="Taxes"]');
                if (!billTable) return { status: "NO_TAX_HISTORY", totalDue: "$0.00" };

                // Extract tax year from table title
                const title = billTable.getAttribute('title');
                const yearMatch = title?.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear() - 1;
                const dueYear = year + 1;

                // Find NET DUE and NET PAID rows
                const rows = Array.from(billTable.querySelectorAll('tr'));
                const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));
                const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));

                if (!netDueRow || !netPaidRow) return { status: "PAID", totalDue: "$0.00" };

                const dueCells = netDueRow.querySelectorAll('td');
                const paidCells = netPaidRow.querySelectorAll('td');
                if (dueCells.length < 4 || paidCells.length < 4) return { status: "PAID", totalDue: "$0.00" };

                // Calculate remaining balance
                const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const totalDue = firstHalfDue + secondHalfDue;

                if (totalDue <= 0.01) return { status: "PAID", totalDue: "$0.00" };

                // Determine status based on delinquent dates
                const firstDelqDate = parseDate(config.first_delq, dueYear);
                const secondDelqDate = parseDate(config.second_delq, dueYear);

                let status = "PAID";
                if (firstHalfDue > 0.01 && currentDate < firstDelqDate) status = "DUE";
                else if (firstHalfDue > 0.01) status = "DELINQUENT";
                else if (secondHalfDue > 0.01 && currentDate < secondDelqDate) status = "DUE";
                else if (secondHalfDue > 0.01) status = "DELINQUENT";

                return { status, totalDue: `$${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
            }, countyConfig);

            resolve(taxStatus);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract tax history with optimization based on client type
const extract_tax_history = async (page, basicData, taxStatus, config, taxYears = 1) => {
    
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

    let allPayments = await page.evaluate(() => {
        const paymentTable = document.querySelector('table[title="Tax Payments"] tbody, #taxPayments tbody, table[title*="Payment"] tbody');
        if (!paymentTable) return [];

        return Array.from(paymentTable.querySelectorAll('tr')).map((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return null;
            
            const dateStr = cells[0]?.textContent.trim();
            if (!dateStr || !dateStr.includes('/')) return null;

            const rowText = row.textContent.trim();
            
            let year = "";
            const yearMatch = rowText.match(/\b20\d{2}\b/);
            const cycleMatch = rowText.match(/[12]-(\d{2})\b/);
            
            if (cycleMatch) {
                year = "20" + cycleMatch[1];
            } else if (yearMatch) {
                const paymentYear = dateStr.split('/').pop();
                if (yearMatch[0] !== paymentYear) {
                    year = yearMatch[0];
                }
            }

            let half = 0;
            if (rowText.toLowerCase().includes('1st') || rowText.toLowerCase().includes('first')) half = 1;
            if (rowText.toLowerCase().includes('2nd') || rowText.toLowerCase().includes('second')) half = 2;

            return {
                id: `pay_${index}`,
                date: dateStr,
                year: year,
                half: half,
                amount: Math.abs(parseFloat(cells[1]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0,
                fullText: rowText,
                sortDate: new Date(dateStr.split('/').reverse().join('-')).getTime()
            };
        }).filter(p => p !== null && p.amount > 0);
    });

    allPayments.sort((a, b) => a.sortDate - b.sortDate);
    
    const allHistory = [];
    let foundUnpaid = false;
    let yearsSuccessfullyProcessed = 0;
    let latestYearDelinquency = 0;

    for (let i = 0; i < availableYears.length; i++) {
        const { year, targetId } = availableYears[i];
        const tabSelector = `div[data-target="${targetId}"], div[href="${targetId}"]`;
        
        try {
            const isVisible = await page.evaluate((id) => {
                const pane = document.querySelector(id);
                return pane && (pane.classList.contains('active') || pane.classList.contains('show'));
            }, targetId);

            if (!isVisible) {
                await page.click(tabSelector);
                await delay(800);
            }
        } catch (e) {}

        const yearData = await page.evaluate((currentYear, targetId) => {
            let activeTabPane = document.querySelector(`${targetId}.active, ${targetId}.show.active`) || document.querySelector(targetId);
            if (!activeTabPane) return null;
            
            const taxTable = activeTabPane.querySelector('table[title*="Taxes"]');
            if (!taxTable) return null;

            const rows = Array.from(taxTable.querySelectorAll('tr'));
            const billedRow = rows.find(row => row.textContent.includes('NET TAX'));
            const dueRow = rows.find(row => row.textContent.includes('NET DUE'));
            
            if (!billedRow || !dueRow) return null;

            const billedCells = billedRow.querySelectorAll('td');
            const dueCells = dueRow.querySelectorAll('td');

            if (billedCells.length < 4 || dueCells.length < 4) return null;

            return {
                year: currentYear,
                firstHalfBilled: billedCells[2]?.textContent.trim(),
                secondHalfBilled: billedCells[3]?.textContent.trim(),
                firstHalfDue: dueCells[2]?.textContent.trim(),
                secondHalfDue: dueCells[3]?.textContent.trim(),
                delinquencyDue: dueCells[1]?.textContent.trim() || "$0.00"
            };
        }, year, targetId);
        
        if (!yearData) continue;

        const delinquencyAmount = Math.abs(parseFloat((yearData.delinquencyDue || "$0.00").replace(/[^0-9.-]+/g, ""))) || 0;
        if (yearsSuccessfullyProcessed === 0) {
            latestYearDelinquency = delinquencyAmount;
        }

        const firstHalfBilled = Math.abs(parseFloat(yearData.firstHalfBilled.replace(/[^0-9.-]+/g, ""))) || 0;
        const secondHalfBilled = Math.abs(parseFloat(yearData.secondHalfBilled.replace(/[^0-9.-]+/g, ""))) || 0;
        const firstHalfDueAmount = Math.abs(parseFloat(yearData.firstHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;
        const secondHalfDueAmount = Math.abs(parseFloat(yearData.secondHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;

        const firstHalfPaidAmount = Math.max(0, firstHalfBilled - firstHalfDueAmount);
        const secondHalfPaidAmount = Math.max(0, secondHalfBilled - secondHalfDueAmount);

        let yearPayments = allPayments.filter(p => p.year === year).sort((a, b) => a.sortDate - b.sortDate);
        if (yearPayments.length === 0 && (firstHalfPaidAmount > 0 || secondHalfPaidAmount > 0)) {
            yearPayments = allPayments.filter(p => {
                if (p.year && p.year !== year) return false;
                const pYear = parseInt(p.date.split('/').pop());
                const tYear = parseInt(year);
                return pYear >= tYear && pYear <= tYear + 1;
            }).sort((a, b) => a.sortDate - b.sortDate);
        }

        let firstHalfPaidDate = "";
        let secondHalfPaidDate = "";
        const consumedPaymentIds = new Set();

        if (yearPayments.length === 1 && firstHalfPaidAmount > 0 && secondHalfPaidAmount > 0) {
            const p = yearPayments[0];
            const totalPaid = firstHalfPaidAmount + secondHalfPaidAmount;
            if (Math.abs(p.amount - totalPaid) < 5.00 || Math.abs(p.amount) > Math.max(firstHalfPaidAmount, secondHalfPaidAmount)) {
                firstHalfPaidDate = p.date;
                secondHalfPaidDate = p.date;
                consumedPaymentIds.add(p.id);
                yearPayments = [];
            }
        }

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

        if (consumedPaymentIds.size > 0) {
            allPayments = allPayments.filter(p => !consumedPaymentIds.has(p.id));
        }

        const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
        const dueYear = (parseInt(year) + 1).toString();
        const firstDelqDate = `${config.first_delq}/${dueYear}`;
        const secondDelqDate = `${config.second_delq}/${dueYear}`;

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
            const totalBilled = firstHalfBilled + secondHalfBilled;

            let status = "Paid";
            let displayPaid = formatCurrency(totalPaid.toString());
            let displayDue = formatCurrency(totalDue.toString());

            if (totalDue > 0.01) {
                if (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0) {
                    status = "Paid";
                    displayPaid = formatCurrency(totalBilled.toString());
                    displayDue = "$0.00";
                } else {
                    status = isFirstDelq ? "Delinquent" : "Due";
                }
            }

            allHistory.push({
                jurisdiction: "County",
                year: year,
                payment_type: "Annual",
                status: status,
                base_amount: formatCurrency(totalBilled.toString()),
                amount_paid: displayPaid,
                amount_due: displayDue,
                mailing_date: "N/A",
                due_date: `${config.first_due}/${dueYear}`,
                delq_date: firstDelqDate,
                paid_date: firstHalfPaidDate,
                good_through_date: ""
            });
        } else {
            let firstStatus = "Paid";
            let firstDisplayPaid = formatCurrency(firstHalfPaidAmount.toString());
            let firstDisplayDue = formatCurrency(firstHalfDueAmount.toString());

            if (firstHalfDueAmount > 0.01) {
                if (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0) {
                    firstStatus = "Paid";
                    firstDisplayPaid = formatCurrency(firstHalfBilled.toString());
                    firstDisplayDue = "$0.00";
                } else {
                    firstStatus = isFirstDelq ? "Delinquent" : "Due";
                }
            }

            let secondStatus = "Paid";
            let secondDisplayPaid = formatCurrency(secondHalfPaidAmount.toString());
            let secondDisplayDue = formatCurrency(secondHalfDueAmount.toString());

            if (secondHalfDueAmount > 0.01) {
                if (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0) {
                    secondStatus = "Paid";
                    secondDisplayPaid = formatCurrency(secondHalfBilled.toString());
                    secondDisplayDue = "$0.00";
                } else {
                    secondStatus = isSecondDelq ? "Delinquent" : "Due";
                }
            }

            allHistory.push(
                {
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Semi-Annual",
                    status: firstStatus,
                    base_amount: formatCurrency(firstHalfBilled.toString()),
                    amount_paid: firstDisplayPaid,
                    amount_due: firstDisplayDue,
                    mailing_date: "N/A",
                    due_date: `${config.first_due}/${dueYear}`,
                    delq_date: firstDelqDate,
                    paid_date: firstHalfPaidDate || (firstStatus === "Paid" ? "N/A" : ""),
                    good_through_date: ""
                },
                {
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Semi-Annual",
                    status: secondStatus,
                    base_amount: formatCurrency(secondHalfBilled.toString()),
                    amount_paid: secondDisplayPaid,
                    amount_due: secondDisplayDue,
                    mailing_date: "N/A",
                    due_date: `${config.second_due}/${dueYear}`,
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
        
        // Standard optimization
        if (taxYears === 1) {
            if (yearsSuccessfullyProcessed >= 1 && !isYearUnpaid && !foundUnpaid) break;
        } else if (taxYears === 2) {
            if (yearsSuccessfullyProcessed >= 2 && !foundUnpaid) break;
        }
        
        if (foundUnpaid && !isYearUnpaid) break;
    }

    // Final filtering based on client type
    let finalTaxHistory = allHistory;
    if (foundUnpaid) {
        if (taxYears === 2) {
            const uniqueYears = [...new Set(allHistory.map(item => item.year))].sort((a, b) => b - a);
            const unpaidItems = allHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
            const unpaidYears = [...new Set(unpaidItems.map(item => item.year))];
            const yearsToKeep = [...new Set([...unpaidYears, ...uniqueYears.slice(0, 2)])];
            finalTaxHistory = allHistory.filter(item => yearsToKeep.includes(item.year));
        } else {
            finalTaxHistory = allHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        }
    } else if (taxYears === 1) {
        const uniqueYears = [...new Set(allHistory.map(item => item.year))].sort((a, b) => b - a);
        finalTaxHistory = allHistory.filter(item => item.year === uniqueYears[0]);
    }

    basicData.tax_history = finalTaxHistory;

    const latestYear = availableYears[0].year;
    const delinquentPayments = finalTaxHistory.filter(item => item.status === "Delinquent");
    const priorDelinquent = finalTaxHistory.filter(item => item.year < latestYear && item.status === "Delinquent");

    if (finalTaxHistory.length === 0 || !finalTaxHistory.find(item => item.year === latestYear)) {
        basicData.notes = `ALL PRIORS ARE PAID, ${latestYear} NO TAXES DUE, POSSIBLY EXEMPT.`;
        basicData.delinquent = "NONE";
    } else {
        const currentPayments = finalTaxHistory.filter(p => p.year === latestYear);
        const first = currentPayments.find(x => x.due_date.includes(config.first_due)) || { status: "Paid" };
        const second = currentPayments.find(x => x.due_date.includes(config.second_due)) || { status: "Paid" };
        const annual = currentPayments.find(x => x.payment_type === "Annual");

        let priorNote = priorDelinquent.length > 0
            ? `PRIOR YEARS (${[...new Set(priorDelinquent.map(p => p.year))].sort((a,b)=>a-b).join(', ')}) TAXES ARE DELINQUENT, `
            : `ALL PRIOR YEARS ARE PAID, `;

        let currentNote = `${latestYear} `;
        if (annual) {
            currentNote += `TAXES ARE ${annual.status.toUpperCase()} ANNUALLY`;
        } else {
            currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
        }
        currentNote += `, NORMALLY PAID IN SEMI-ANNUAL, NORMAL DUE DATES ARE ${config.first_due} & ${config.second_due}.`;

        basicData.notes = priorNote + currentNote;
        basicData.delinquent = (delinquentPayments.length > 0 || priorDelinquent.length > 0)
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";
    }

    return basicData;
};


const account_search = async (page, account, countyConfig, taxYears = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            validate_parcel(page, account, countyConfig)
                .then(() => {
                    extract_basic_info(page, account, countyConfig)
                        .then((basicData) => {
                            extract_tax_status(page, countyConfig)
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
    const county = req.path.replace(/^\/+/, "").toLowerCase();
    
    try {
        // Validate required inputs
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
        const countyConfig = counties[county];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // Block images, CSS, fonts for faster scraping
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, account, countyConfig, taxYears)
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
            account_search(page, account, countyConfig, taxYears)
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

module.exports = { search };