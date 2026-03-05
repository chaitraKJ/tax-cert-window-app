// AUTHOR: Nithyananda R S 
// Modified: Optimized Mercer County scraper with client-specific early exits and improved payment mapping
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility functions
const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (month, day, year) => {
    const date = new Date(year, month - 1, day);
    const isValidDate = date && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValidDate) {
        throw new Error(`Invalid date: ${month}/${day}/${year}`);
    }
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

// COUNTY CONFIGURATIONS
const counties = {
    mercer: {
        url: 'https://auditor.mercercountyohio.gov/Parcel?Parcel=',
        taxing_authority: 'Mercer County Auditor, 101 N Main St, Celina, OH 45822, Ph: 419-586-6444',
        first_due: '02/14', // Updated based on typical OH dates if needed, keeping original logic
        second_due: '07/18',
        first_delq: '02/15',
        second_delq: '07/19',
    },
};
// Navigation and status check functions
const navigateToParcel = async (page, account, config) => {
    const url = `${config.url}${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await delay(2000);
    
    const pageContentExists = await page.$('#ppPromoted');
    if (!pageContentExists) {
        throw new Error("NOT_FOUND");
    }
    
    const isInvalidParcel = await page.evaluate(() => {
        const locationSection = document.querySelector('#Location');
        return locationSection?.textContent?.includes("No Base Records Found.") || false;
    });
    
    if (isInvalidParcel) {
        throw new Error("NOT_FOUND");
    }
};

const extractBasicData = async (page, account, config) => {
    const datum = await page.evaluate((account) => {
        const data = {
            processed_date: new Date().toISOString().split("T")[0],
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
            tax_history: []
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
        return data;
    }, account);
    
    datum.taxing_authority = config.taxing_authority;
    return datum;
};

// Extract tax history with optimization based on client type
const extractTaxHistory = async (page, config, taxYears = 1) => {
    
    const availableYears = await page.evaluate(() => {
        const years = [];
        // Mercer uses li elements with divs inside for tabs
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

    if (availableYears.length === 0) return [];
    availableYears.sort((a, b) => parseInt(b.year) - parseInt(a.year));

    let allPayments = await page.evaluate(() => {
        const paymentTable = document.querySelector('table[title="Tax Payments"] tbody, #taxPayments tbody, table[title*="Payment"] tbody');
        if (!paymentTable) return [];

        return Array.from(paymentTable.querySelectorAll('tr')).map((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return null;
            
            const dateStr = cells[0]?.textContent.trim();
            if (!dateStr || !dateStr.includes('/')) return null;

            const rawDateAttr = cells[0]?.getAttribute('data-sort');
            const rowText = row.textContent.trim();
            
            // Extract tax year from row text if possible (e.g., "2024", "Cycle 1-24")
            let year = "";
            const yearMatch = rowText.match(/\b20\d{2}\b/);
            const cycleMatch = rowText.match(/[12]-(\d{2})\b/);
            
            if (cycleMatch) {
                year = "20" + cycleMatch[1];
            } else if (yearMatch) {
                // Only use it if it's not the payment date year
                const paymentYear = dateStr.split('/').pop();
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
                date: dateStr,
                year: year,
                half: half,
                amount: Math.abs(parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0,
                fullText: rowText,
                sortDate: rawDateAttr ? new Date(rawDateAttr).getTime() : new Date(dateStr).getTime()
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
            
            const taxTable = activeTabPane.querySelector('table[title*="Tax Table"]');
            if (!taxTable) return null;

            const rows = Array.from(taxTable.querySelectorAll('tr'));
            const billedRow = rows.find(row => row.textContent.includes('Net General') || row.textContent.includes('NET TAX'));
            const dueRow = rows.find(row => row.textContent.includes('Owed') || row.textContent.includes('NET DUE'));
            
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

        // Find payments for this year
        let yearPayments = allPayments.filter(p => p.year === year).sort((a, b) => a.sortDate - b.sortDate);
        
        // Fallback for unlabeled payments
        if (yearPayments.length === 0 && (firstHalfPaidAmount > 0 || secondHalfPaidAmount > 0)) {
            yearPayments = allPayments.filter(p => {
                if (p.year && p.year !== year) return false;
                const pDate = new Date(p.date);
                const tYear = parseInt(year);
                return pDate.getFullYear() >= tYear && pDate.getFullYear() <= tYear + 1;
            }).sort((a, b) => a.sortDate - b.sortDate);
        }

        let firstHalfPaidDate = "";
        let secondHalfPaidDate = "";
        const consumedPaymentIds = new Set();

        // 1. Check for Single Annual Payment
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

        // Remove consumed payments from allPayments
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

        // Shortcut optimization
        if (delinquencyAmount < 0.01) {
            if (taxYears === 1) {
                if (yearsSuccessfullyProcessed >= 1 && !isYearUnpaid) break;
            } else if (taxYears === 2) {
                if (yearsSuccessfullyProcessed >= 2) break;
            }
        }

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

    return finalTaxHistory;
};

const getTaxData = async (page, account, config, taxYears = 1) => {
    try {
        await navigateToParcel(page, account, config);
        const baseData = await extractBasicData(page, account, config);
        const taxHistory = await extractTaxHistory(page, config, taxYears);

        if (taxHistory.length === 0) {
            baseData.notes = "Tax history and current taxes are not available on the website.";
            baseData.delinquent = "N/A";
            return baseData;
        }

        baseData.tax_history = taxHistory;
        const unpaidItems = taxHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        const delinquentItems = taxHistory.filter(item => item.status === "Delinquent");
        const unpaidYears = [...new Set(unpaidItems.map(item => item.year))];
        const annualNote = `NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${config.first_due} & ${config.second_due}`;

        if (delinquentItems.length > 0) {
            baseData.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE DELINQUENT, ${annualNote}`;
            baseData.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else if (unpaidItems.length > 0) {
            const status = unpaidItems.every(item => item.status === "Due") ? "DUE" : "UNPAID";
            baseData.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE ${status}, ${annualNote}`;
            baseData.delinquent = "NONE";
        } else {
            const uniqueYears = [...new Set(taxHistory.map(item => item.year))].sort((a, b) => b - a);
            baseData.notes = `ALL PRIORS ARE PAID, ${uniqueYears[0]} TAXES ARE PAID, ${annualNote}`;
            baseData.delinquent = "NONE";
        }

        return baseData;
    } catch (error) {
        if (error.message === "NOT_FOUND") {
            return {
                processed_date: new Date().toISOString().split("T")[0],
                owner_name: ["Invalid Parcel ID"],
                property_address: "Invalid Parcel ID",
                parcel_number: account,
                notes: "Parcel not found on the website.",
                delinquent: "N/A",
                tax_history: []
            };
        }
        throw error;
    }
};

const search = async (req, res) => {
    const fetch_type = req.body.fetch_type || req.query.fetch_type;
    const account = req.body.account || req.query.account;
    const client = req.body.client || req.query.client || 
                  req.body.clientType || req.query.clientType || 
                  req.body.client_name || req.query.client_name || 'default';
    
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).json({ error: true, message: "Invalid request type." });
    }
    if (!account) {
        return res.status(400).json({ error: true, message: "Parcel number is required." });
    }

    const taxYears = getOHCompanyYears(client);
    const config = counties.mercer;
    let browserContext = null;

    try {
        const browser = await getBrowserInstance();
        browserContext = await browser.createBrowserContext();
        const page = await browserContext.newPage();
        
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
            } else {
                reqInt.continue();
            }
        });

        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        
        const data = await getTaxData(page, account, config, taxYears);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error('Error in mercer.controller.js:', error);
        if (fetch_type === "html") {
            res.status(500).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (browserContext) await browserContext.close().catch(() => {});
    }
};

export { search };