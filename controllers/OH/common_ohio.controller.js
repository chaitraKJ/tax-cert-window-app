//  AUTHOR: NITHYA
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// Format currency helper
const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = Math.abs(parseFloat(str.toString().replace(/[^0-9.-]+/g, "")));
    return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const counties = {
    miami: {
        url: 'https://www.miamicountyohioauditor.gov/Parcel?Parcel=',
        taxing_authority: 'Miami County Auditor, 201 W Main St, Troy, OH 45373, Ph: 937-440-5925',
        first_due: '02/14',
        second_due: '07/20',
        first_delq: '02/15',
        second_delq: '07/21',
    },
    darke: {
        url: 'https://darkecountyrealestate.org/Parcel?Parcel=',
        taxing_authority: 'Darke County Auditor, 504 S Broadway St # 3, Greenville, OH 45331, Ph: 937-547-7300',
        first_due: '02/20',
        second_due: '07/18',
        first_delq: '02/21',
        second_delq: '07/19',
    },
    paulding: {
        url: 'https://www.pauldingcountyauditor.com/Parcel?Parcel=',
        taxing_authority: 'Paulding County Auditor, 115 N Williams St, Paulding, OH 45879, Ph: 419-399-8205',
        first_due: '02/05',
        second_due: '07/16',
        first_delq: '02/06',
        second_delq: '07/17',
    },
};

const is_delq = (date) => {
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let delq_date = new Date(date);
    delq_date.setHours(0, 0, 0, 0);
    return today >= delq_date;
}
// Navigation and validation
const ac_1 = async (page, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${countyConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
            
            // CHECK IF PARCEL IS INVALID
            const isInvalidParcel = await page.evaluate(() => {
                const divs = document.querySelectorAll("#Location div");
                if (divs.length > 1) {
                    return divs[1].textContent?.includes("No Base Records Found.");
                }
                const locationSection = document.querySelector('#Location');
                return locationSection?.textContent?.includes("No Base Records Found.") || false;
            });

            if (isInvalidParcel) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No records found in the database.`
                });
            }

            resolve({ success: true });
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};


const ac_2 = async (page, ac1_data, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const page_data = await page.evaluate((account, countyConfig) => {
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
                    taxing_authority: countyConfig.taxing_authority,
                    notes: "",
                    delinquent: "",
                    tax_history: []
                };

                // OWNER AND ADDRESS FROM LOCATION TABLE
                const locationTable = document.querySelector('#Location table');
                if (locationTable) {
                    const rows = Array.from(locationTable.querySelectorAll('tr'));
                    datum.owner_name[0] = rows[1]?.querySelector('td:last-child')?.textContent.trim() || 
                                         rows[1]?.querySelector('.TableValue')?.textContent.trim() || "N/A";
                    datum.property_address = rows[2]?.querySelector('td:last-child')?.textContent.trim() || 
                                            rows[2]?.querySelector('.TableValue')?.textContent.trim() || "N/A";
                }

                // ASSESSED VALUES FROM VALUATION TABLE
                const valuationRow = document.querySelector('.table-responsive .table tbody tr:first-child');
                if (valuationRow) {
                    datum.land_value = valuationRow.querySelector('td[headers="appraised appraisedLand"]')?.textContent.trim() || 
                                     valuationRow.querySelectorAll('td')[1]?.textContent.trim() || "N/A";
                    datum.improvements = valuationRow.querySelector('td[headers="appraised appraisedImprovements"]')?.textContent.trim() || 
                                       valuationRow.querySelectorAll('td')[2]?.textContent.trim() || "N/A";
                    datum.total_assessed_value = valuationRow.querySelector('td[headers="assessed assessedTotal"]')?.textContent.trim() || 
                                               valuationRow.querySelectorAll('td')[6]?.textContent.trim() || "N/A";
                    datum.total_taxable_value = datum.total_assessed_value;
                }

                return datum;
            }, account, countyConfig);

            if (
                page_data.owner_name[0] === "N/A" &&
                page_data.property_address === "N/A" &&
                page_data.land_value === "N/A" &&
                page_data.improvements === "N/A" &&
                page_data.total_assessed_value === "N/A"
            ) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No appraisal or owner data found.`,
                });
            }

            resolve({ 
                data: page_data
            });
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Tax history extraction
const ac_3 = async (page, ac2_data, countyConfig, taxYears = 1) => {
    try {
        const { data } = ac2_data;
        const currentDate = new Date();

        // First, get all available year tabs
        const availableYears = await page.evaluate(() => {
            const years = [];
            // More flexible selector for tabs
            const navTabs = document.querySelectorAll('.nav-link[data-toggle="tab"], [data-toggle="tab"], .nav-tabs a, .nav-pills a');
            
            navTabs.forEach((tab, idx) => {
                const yearText = tab.textContent.trim();
                const yearMatch = yearText.match(/\d{4}/);
                if (yearMatch) {
                    const year = yearMatch[0];
                    let targetId = tab.getAttribute('data-target') || tab.getAttribute('href');
                    if (targetId && !targetId.startsWith('#') && !targetId.startsWith('.') && !targetId.includes('/')) {
                        targetId = '#' + targetId;
                    }
                    years.push({ year: year, targetId: targetId, index: idx });
                }
            });
            
            return years;
        });

        // If no tabs found, try to find tax tables directly
        if (availableYears.length === 0) {
            const directTableData = await page.evaluate(() => {
                const tables = Array.from(document.querySelectorAll('table[title*="Taxes"], table[id*="Tax"]'));
                return tables.map(table => {
                    const title = table.getAttribute('title') || table.getAttribute('id') || "";
                    const yearMatch = title.match(/\d{4}/);
                    if (!yearMatch) return null;
                    
                    const rows = Array.from(table.querySelectorAll('tr'));
                    const billedRow = rows.find(r => r.textContent.includes('Taxes Billed') || r.textContent.includes('NET TAX'));
                    const dueRow = rows.find(r => r.textContent.includes('Taxes Due') || r.textContent.includes('NET DUE'));
                    const paidRow = rows.find(r => r.textContent.includes('Payments Made') || r.textContent.includes('NET PAID'));
                    
                    if (!dueRow || !paidRow) return null;
                    
                    const billedCells = billedRow ? billedRow.querySelectorAll('td') : [];
                    const dueCells = dueRow.querySelectorAll('td');
                    const paidCells = paidRow.querySelectorAll('td');
                    
                    return {
                        year: yearMatch[0],
                        firstHalfBilled: billedCells.length >= 4 ? billedCells[2]?.textContent.trim() : "N/A",
                        secondHalfBilled: billedCells.length >= 4 ? billedCells[3]?.textContent.trim() : "N/A",
                        firstHalfPaid: paidCells[2]?.textContent.trim() || "$0.00",
                        secondHalfPaid: paidCells[3]?.textContent.trim() || "$0.00",
                        firstHalfDue: dueCells[2]?.textContent.trim() || "$0.00",
                        secondHalfDue: dueCells[3]?.textContent.trim() || "$0.00"
                    };
                }).filter(t => t !== null);
            });

            if (directTableData.length > 0) {
                directTableData.forEach(d => {
                    availableYears.push({ year: d.year, directData: d });
                });
            }
        }

        if (availableYears.length === 0) {
            data.notes = "Tax history and current taxes are not available on the website.";
            data.delinquent = "N/A";
            data.tax_history = [];
            return data;
        }

        // Sort by year descending
        availableYears.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        // Extract all payments once to avoid repeated evaluations
        let allPayments = await page.evaluate(() => {
            const paymentTable = document.querySelector('#taxPayments tbody, table[title*="Payment"] tbody, table[id*="Payment"] tbody, #Payments table tbody');
            if (!paymentTable) return [];

            return Array.from(paymentTable.querySelectorAll('tr')).map((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return null;
                
                const dateText = cells[0]?.textContent.trim();
                if (!dateText || !dateText.includes('/')) return null; // Likely a header or invalid row

                const rawDateAttr = cells[0]?.getAttribute('data-sort');
                
                // Extract amount and which half it belongs to
                let amount = 0;
                let half = 0; // 0 = unknown, 1 = first, 2 = second
                
                // Column indices for Miami/Darke/Paulding payments table:
                // 0: Date, 1: Cycle, 2: Prior, 3: First Half, 4: Second Half, 5: Surplus
                if (cells.length >= 5) {
                    const firstHalfVal = cells[3]?.textContent.trim();
                    const secondHalfVal = cells[4]?.textContent.trim();
                    
                    const firstAmount = Math.abs(parseFloat(firstHalfVal.replace(/[^0-9.-]+/g, ""))) || 0;
                    const secondAmount = Math.abs(parseFloat(secondHalfVal.replace(/[^0-9.-]+/g, ""))) || 0;
                    
                    if (firstAmount > 0.01) {
                        amount = firstAmount;
                        half = 1;
                    } else if (secondAmount > 0.01) {
                        amount = secondAmount;
                        half = 2;
                    }
                }
                
                // Fallback for non-standard tables
                if (amount < 0.01) {
                    for (let i = 1; i < cells.length; i++) {
                        const val = cells[i].textContent.trim();
                        if (val.includes('$') || (val.match(/\d+\.\d{2}/) && !val.includes('/'))) {
                            const parsed = Math.abs(parseFloat(val.replace(/[^0-9.-]+/g, "")));
                            if (parsed > 0) {
                                amount = parsed;
                                break;
                            }
                        }
                    }
                }
                
                const rowText = row.textContent.trim();
                
                // Smarter Year Extraction for Ohio (Miami/Darke/Paulding)
                // Look for "Cycle" format like "1-24" or "2-24"
                let year = "";
                const cycleMatch = rowText.match(/[12]-(\d{2})\b/);
                if (cycleMatch) {
                    year = "20" + cycleMatch[1];
                } else {
                    // Fallback to 4-digit year in row, but only if it's not the payment date year
                    const yearMatches = rowText.match(/\b\d{4}\b/g);
                    if (yearMatches) {
                        // If there's a 4-digit year that ISN'T the payment date year, it's likely the tax year
                        const paymentYear = dateText.split('/').pop();
                        const taxYearCandidate = yearMatches.find(y => y !== paymentYear);
                        year = taxYearCandidate || yearMatches[0];
                    }
                }
                
                const sortDate = rawDateAttr ? new Date(rawDateAttr).getTime() : new Date(dateText).getTime();
                
                return {
                    id: `pay_${index}`,
                    date: dateText,
                    year: year,
                    half: half,
                    fullText: rowText,
                    amount: amount,
                    sortDate: isNaN(sortDate) ? 0 : sortDate
                };
            }).filter(p => p !== null && p.amount > 0);
        });

        // Sort all payments chronologically (oldest first)
        allPayments.sort((a, b) => a.sortDate - b.sortDate);

        const allHistory = [];
        let foundUnpaid = false;
        let yearsSuccessfullyProcessed = 0;

        // Process years based on optimization rules
        for (let i = 0; i < availableYears.length; i++) {
            const yearInfo = availableYears[i];
            const { year, targetId, directData } = yearInfo;

            let yearData = null;

            if (directData) {
                yearData = directData;
            } else if (targetId) {
                // Click on the tab to make it active
                const tabSelector = `[data-target="${targetId}"], [href="${targetId}"]`;
                try {
                    await page.click(tabSelector);
                    // Wait for the tab pane to become active and visible
                    await page.waitForFunction((id) => {
                        const pane = document.querySelector(id);
                        return pane && (pane.classList.contains('active') || pane.classList.contains('show'));
                    }, { timeout: 5000 }, targetId);
                    // Add a small delay to ensure content is rendered
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e) {
                    console.log(`Failed to click tab ${targetId}:`, e.message);
                }

                // Extract data from the now-active tab
                yearData = await page.evaluate((currentYear, targetId) => {
                    let activeTabPane = document.querySelector(`${targetId}.active, ${targetId}.show.active`);
                    if (!activeTabPane) {
                        activeTabPane = document.querySelector(targetId);
                    }
                    
                    if (!activeTabPane) return null;
                    
                    const taxTable = activeTabPane.querySelector('table[title*="Taxes"]');
                    if (!taxTable) return null;

                    const rows = Array.from(taxTable.querySelectorAll('tr'));
                    
                    // Support multiple possible labels
                    const taxesBilledRow = rows.find(row => row.textContent.includes('Taxes Billed') || row.textContent.includes('NET TAX'));
                    const taxesDueRow = rows.find(row => row.textContent.includes('Taxes Due') || row.textContent.includes('NET DUE'));
                    const paymentsMadeRow = rows.find(row => row.textContent.includes('Payments Made') || row.textContent.includes('NET PAID'));

                    if (!taxesDueRow || !paymentsMadeRow) return null;

                    const billedCells = taxesBilledRow ? taxesBilledRow.querySelectorAll('td') : [];
                    const dueCells = taxesDueRow.querySelectorAll('td');
                    const paidCells = paymentsMadeRow.querySelectorAll('td');

                    if (dueCells.length < 4 || paidCells.length < 4) return null;

                    return {
                        year: currentYear,
                        firstHalfBilled: billedCells.length >= 4 ? billedCells[2]?.textContent.trim() : "N/A",
                        secondHalfBilled: billedCells.length >= 4 ? billedCells[3]?.textContent.trim() : "N/A",
                        firstHalfPaid: paidCells[2]?.textContent.trim(),
                        secondHalfPaid: paidCells[3]?.textContent.trim(),
                        firstHalfDue: dueCells[2]?.textContent.trim(),
                        secondHalfDue: dueCells[3]?.textContent.trim()
                    };
                }, year, targetId);
            }
            
            if (!yearData) continue;
            
            yearsSuccessfullyProcessed++;

            const firstHalfDueAmount = Math.abs(parseFloat(yearData.firstHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfDueAmount = Math.abs(parseFloat(yearData.secondHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;
            const firstHalfPaidAmount = Math.abs(parseFloat(yearData.firstHalfPaid.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfPaidAmount = Math.abs(parseFloat(yearData.secondHalfPaid.replace(/[^0-9.-]+/g, ""))) || 0;

            // Find payment dates from pre-extracted payments
            // Try to match by year first
            let yearPayments = allPayments.filter(p => p.year == year).sort((a, b) => a.sortDate - b.sortDate);
            
            // If no year-matched payments, but we have paid amounts, try a slightly broader search but avoid using payments with other years
            if (yearPayments.length === 0 && (firstHalfPaidAmount > 0 || secondHalfPaidAmount > 0)) {
                yearPayments = allPayments.filter(p => {
                    if (p.year && p.year !== year) return false; // Don't use if explicitly assigned to another year
                    const pDate = new Date(p.date);
                    const tYear = parseInt(year);
                    // Only consider payments made during or shortly after the tax year
                    return pDate.getFullYear() >= tYear && pDate.getFullYear() <= tYear + 1;
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

            // 2. Match First Half
            if (firstHalfPaidAmount > 0 && !firstHalfPaidDate && yearPayments.length > 0) {
                let matchIndex = -1;
                // Try to match by half first if available
                if (yearPayments.some(p => p.half === 1)) {
                    matchIndex = yearPayments.findIndex(p => p.half === 1 && Math.abs(p.amount - firstHalfPaidAmount) < 1.00);
                    if (matchIndex === -1) matchIndex = yearPayments.findIndex(p => p.half === 1);
                }
                
                if (matchIndex === -1) {
                    matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - firstHalfPaidAmount) < 1.00);
                }
                
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

            // 3. Match Second Half
            if (secondHalfPaidAmount > 0 && !secondHalfPaidDate && yearPayments.length > 0) {
                let matchIndex = -1;
                // Try to match by half first if available
                if (yearPayments.some(p => p.half === 2)) {
                    matchIndex = yearPayments.findIndex(p => p.half === 2 && Math.abs(p.amount - secondHalfPaidAmount) < 1.00);
                    if (matchIndex === -1) matchIndex = yearPayments.findIndex(p => p.half === 2);
                }
                
                if (matchIndex === -1) {
                    matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - secondHalfPaidAmount) < 1.00);
                }
                
                if (matchIndex !== -1) {
                    secondHalfPaidDate = yearPayments[matchIndex].date;
                    consumedPaymentIds.add(yearPayments[matchIndex].id);
                    yearPayments.splice(matchIndex, 1);
                } else {
                    const p = yearPayments[0];
                    secondHalfPaidDate = p.date;
                    consumedPaymentIds.add(p.id);
                    yearPayments.shift();
                }
            }

            // Remove consumed payments from allPayments
            if (consumedPaymentIds.size > 0) {
                allPayments = allPayments.filter(p => !consumedPaymentIds.has(p.id));
            }

            const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
            
            const firstDueDateStr = `${countyConfig.first_due}/${parseInt(year) + 1}`;
            const firstDelqDateStr = `${countyConfig.first_delq}/${parseInt(year) + 1}`;
            const secondDueDateStr = `${countyConfig.second_due}/${parseInt(year) + 1}`;
            const secondDelqDateStr = `${countyConfig.second_delq}/${parseInt(year) + 1}`;

            const isFirstDelq = is_delq(firstDelqDateStr);
            const isSecondDelq = is_delq(secondDelqDateStr);

            if (isAnnual) {
                const totalPaid = firstHalfPaidAmount + secondHalfPaidAmount;
                const totalDue = firstHalfDueAmount + secondHalfDueAmount;
                const totalBilled = totalPaid + totalDue;

                let status = "Paid";
                if (totalDue > 0.01) {
                    status = isFirstDelq ? "Delinquent" : "Due";
                }

                allHistory.push({
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Annual",
                    status: status,
                    base_amount: formatCurrency(totalBilled.toString()),
                    amount_paid: formatCurrency(totalPaid.toString()),
                    amount_due: formatCurrency(totalDue.toString()),
                    mailing_date: "N/A",
                    due_date: firstDueDateStr,
                    delq_date: firstDelqDateStr,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            } else {
                let firstStatus = "Paid";
                if (firstHalfDueAmount > 0.01) {
                    firstStatus = isFirstDelq ? "Delinquent" : "Due";
                }

                let secondStatus = "Paid";
                if (secondHalfDueAmount > 0.01) {
                    secondStatus = isSecondDelq ? "Delinquent" : "Due";
                }

                allHistory.push(
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: firstStatus,
                        base_amount: formatCurrency((firstHalfPaidAmount + firstHalfDueAmount).toString()),
                        amount_paid: formatCurrency(yearData.firstHalfPaid),
                        amount_due: formatCurrency(yearData.firstHalfDue),
                        mailing_date: "N/A",
                        due_date: firstDueDateStr,
                        delq_date: firstDelqDateStr,
                        paid_date: firstHalfPaidDate,
                        good_through_date: ""
                    },
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: secondStatus,
                        base_amount: formatCurrency((secondHalfPaidAmount + secondHalfDueAmount).toString()),
                        amount_paid: formatCurrency(yearData.secondHalfPaid),
                        amount_due: formatCurrency(yearData.secondHalfDue),
                        mailing_date: "N/A",
                        due_date: secondDueDateStr,
                        delq_date: secondDelqDateStr,
                        paid_date: secondHalfPaidDate,
                        good_through_date: ""
                    }
                );
            }

            const currentYearHistory = allHistory.slice(isAnnual ? -1 : -2);
            const isYearUnpaid = currentYearHistory.some(item => ["Due", "Delinquent"].includes(item.status));
            if (isYearUnpaid) foundUnpaid = true;

            // Optimization logic
            if (taxYears === 1) {
                if (yearsSuccessfullyProcessed === 1 && !isYearUnpaid) break;
            } else if (taxYears === 2) {
                if (yearsSuccessfullyProcessed === 2 && !foundUnpaid) break;
            }

            if (foundUnpaid && !isYearUnpaid) break;
        }

        let finalTaxHistory = allHistory;
        if (foundUnpaid) {
            finalTaxHistory = allHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        }

        data.tax_history = finalTaxHistory;

        // Determine delinquent status and notes
        const unpaidItems = finalTaxHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        const delinquentItems = finalTaxHistory.filter(item => item.status === "Delinquent");
        const unpaidYears = [...new Set(unpaidItems.map(item => item.year))];
        const annualNote = `NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${countyConfig.first_due} & ${countyConfig.second_due}`;

        if (delinquentItems.length > 0) {
            data.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE DELINQUENT, ${annualNote}`;
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else if (unpaidItems.length > 0) {
            const status = unpaidItems.every(item => item.status === "Due") ? "DUE" : "UNPAID";
            data.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE ${status}, ${annualNote}`;
            data.delinquent = "NONE";
        } else {
            const latestYear = availableYears.length > 0 ? availableYears[0].year : (new Date().getFullYear() - 1).toString();
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${annualNote}`;
            data.delinquent = "NONE";
        }

        return data;
    } catch (error) {
        console.log(error);
        throw error;
    }
};
// Account search flow
const account_search = async (page, account, countyConfig, taxYears = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const ac1_data = await ac_1(page, account, countyConfig);
            if (ac1_data.error) {
                return reject(ac1_data);
            }
            const ac2_data = await ac_2(page, ac1_data, account, countyConfig);
            const finalData = await ac_3(page, ac2_data, countyConfig, taxYears);
            resolve(finalData);
        } catch (error) {
            console.log("Unexpected error in account_search:", error);
            reject({ error: true, message: error.message });
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    let taxYears = getOHCompanyYears(client);

    if(!account || account.trim()==''){
        return res.status(200).render("error_data", {
            error: true,
            message: "Account number is required."
        });
    }

    const county = req.path.replace(/^\/+/, "");
    try {
        if (fetch_type !== "html" && fetch_type !== "api") {
            return res.status(200).render("error_data", { error: true, message: "Invalid Access" });
        }
        if (!county || !counties[county]) {
            return res.status(200).render("error_data", { error: true, message: "Invalid County" });
        }
        const config = counties[county];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });
        if (fetch_type === "html") {
            account_search(page, account, config, taxYears)
                .then((data) => res.status(200).render("parcel_data_official", data))
                .catch((error) => res.status(200).render("error_data", { error: true, message: error.message }))
                .finally(() => context.close());
        } else if (fetch_type === "api") {
            account_search(page, account, config, taxYears)
                .then((data) => res.status(200).json({ result: data }))
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(() => context.close());
        }
    } catch (error) {
        if (fetch_type === "html") res.status(200).render("error_data", { error: true, message: error.message });
        else if (fetch_type === "api") res.status(500).json({ error: true, message: error.message });
    }
};

export { search };