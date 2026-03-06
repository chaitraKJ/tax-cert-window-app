//Author Nithyananda R S 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Helper functions
const handleNotFound = (parcelNumber) => ({
    processed_date: new Date().toISOString().split('T')[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    owner_address: "No records found",
    parcel_number: parcelNumber,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: "Scioto County Tax Office, Portsmouth, OH 45662",
    notes: "No tax records found for this parcel number.",
    delinquent: "N/A",
    tax_history: []
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatCurrency = (str) => {
    if (!str || str === "N/A" || str === "") return "$0.00";
    const num = parseFloat(String(str).replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const hasAmountDue = (amount) => {
    if (!amount || amount === "N/A" || amount === "") return false;
    const num = parseFloat(String(amount).replace(/[^0-9.-]+/g, ""));
    return !isNaN(num) && num > 0;
};

const calculateDelinquentDate = (dueDateStr) => {
    if (!dueDateStr || dueDateStr === "N/A" || dueDateStr === "") return "N/A";
    try {
        const dueDateParts = dueDateStr.split('/');
        if (dueDateParts.length !== 3) return "N/A";
        const dueDate = new Date(dueDateParts[2], dueDateParts[0] - 1, dueDateParts[1]);
        dueDate.setDate(dueDate.getDate() + 1);
        const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
        const dd = String(dueDate.getDate()).padStart(2, '0');
        const yyyy = dueDate.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    } catch (error) {
        console.error('Error calculating delinquent date:', error);
        return "N/A";
    }
};

const isDatePastDelinquency = (delqDateStr) => {
    if (delqDateStr === "N/A" || !delqDateStr) return false;
    try {
        const parts = delqDateStr.split('/');
        if (parts.length !== 3) return false;
        const delqDate = new Date(parts[2], parts[0] - 1, parts[1]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        delqDate.setHours(0, 0, 0, 0);
        return today >= delqDate;
    } catch (error) {
        console.error('Error checking delinquency date:', error);
        return false;
    }
};

const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://www.sciotocountytax.com/taxes.html#/WildfireSearch';
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector('#searchBox', { timeout: 30000 });
    await delay(2000);
    await page.type('#searchBox', parcelNumber);
    await delay(1000);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.wildfireResults table, .no-results', { timeout: 20000 });
    await delay(3000);
};

const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        const table = document.querySelector('.wildfireResults table');
        if (!table) {
            return { records: [], owner_name: "" };
        }
        const rows = table.querySelectorAll('tbody tr[ng-repeat]');
        const records = [];
        let ownerName = "";

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
                const owner = cells[0]?.innerText?.trim() || "";
                const address = cells[1]?.innerText?.trim() || "";
                const parcel = cells[2]?.innerText?.trim() || "";
                const firstHalfStatus = cells[3]?.classList.contains('Paid') ? 'Paid' : 'Unpaid';
                const secondHalfStatus = cells[4]?.classList.contains('Paid') ? 'Paid' : 'Unpaid';

                if (records.length === 0 && owner) {
                    ownerName = owner;
                }

                records.push({
                    owner_name: owner,
                    property_address: address,
                    parcel_number: parcel,
                    first_half_status: firstHalfStatus,
                    second_half_status: secondHalfStatus,
                    has_unpaid: firstHalfStatus === 'Unpaid' || secondHalfStatus === 'Unpaid'
                });
            }
        });
        return { records: records, owner_name: ownerName };
    });
};

const scrapeDetailsPage = async (page) => {
    try {
        await page.waitForSelector('.tab-content', { timeout: 10000 });
        const details = await page.evaluate(() => {
            const getTextContent = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : null;
            };
            const ownerSection = document.querySelector('.col-md-4.section .ng-binding');
            let ownerAddress = 'N/A';
            if (ownerSection) {
                const lines = ownerSection.innerHTML.split('<br>');
                const addressLines = lines.slice(1).map(line =>
                    line.trim().replace(/<[^>]*>/g, '').trim()
                ).filter(line => line.length > 0);
                ownerAddress = addressLines.join(' ').replace(/\s{2,}/g, ' ').trim();
            }
            const parcelRows = document.querySelectorAll('.infoTable tr');
            let location = 'N/A';
            let parcelNumber = 'N/A';
            parcelRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const label = cells[0].textContent.trim().toLowerCase();
                    const value = cells[1].textContent.trim();
                    if (label.includes('location')) {
                        location = value;
                    } else if (label.includes('parcel number')) {
                        parcelNumber = value;
                    }
                }
            });
            const taxTable = document.querySelector('.infoTable.tableRightAlignInfo');
            let firstHalfTax = '$0.00';
            let firstHalfPaid = '$0.00';
            let firstHalfBalance = '$0.00';
            let secondHalfTax = '$0.00';
            let secondHalfPaid = '$0.00';
            let secondHalfBalance = '$0.00';
            let totalDue = '$0.00';
            let firstHalfDueDate = '';
            let secondHalfDueDate = '';
            let taxYear = (new Date().getFullYear() - 1).toString();

            const taxHeader = document.querySelector('.tab-pane.ng-scope h3');
            if (taxHeader) {
                const match = taxHeader.textContent.match(/TAXES FOR .*?(\d{4})/);
                if (match) {
                    taxYear = match[1];
                }
            }

            if (taxTable) {
                const allRows = taxTable.querySelectorAll('tr');
                let currentHalf = 'none';
                allRows.forEach((row, index) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const col1 = cells[0].textContent.trim();
                        const col2 = cells[1].textContent.trim();
                        const col3 = cells[2].textContent.trim();
                        const col1HTML = cells[0].innerHTML;
                        if (col1.includes('First Half')) {
                            currentHalf = 'first';
                            if (col2.toLowerCase().includes('tax') && !col2.toLowerCase().includes('paid')) {
                                firstHalfTax = col3;
                            }
                        } else if (col1.includes('Second Half')) {
                            currentHalf = 'second';
                            if (col2.toLowerCase().includes('tax') && !col2.toLowerCase().includes('paid')) {
                                secondHalfTax = col3;
                            }
                        }
                        if (col2.toLowerCase().includes('paid') && !col2.toLowerCase().includes('unpaid')) {
                            if (currentHalf === 'first') {
                                firstHalfPaid = col3;
                            } else if (currentHalf === 'second') {
                                secondHalfPaid = col3;
                            }
                        }
                        if (col2.toLowerCase().includes('balance')) {
                            if (currentHalf === 'first') {
                                firstHalfBalance = col3;
                            } else if (currentHalf === 'second') {
                                secondHalfBalance = col3;
                            }
                        }
                        if (col1HTML.includes('Due<br>') || col1.includes('Due')) {
                            const dateMatch = col1.match(/(\d{2}\/\d{2}\/\d{4})/);
                            if (dateMatch) {
                                const foundDate = dateMatch[1];
                                if (currentHalf === 'first' && !firstHalfDueDate) {
                                    firstHalfDueDate = foundDate;
                                } else if (currentHalf === 'second' && !secondHalfDueDate) {
                                    secondHalfDueDate = foundDate;
                                }
                            }
                        }
                        if (col1.toLowerCase().includes('total due') || col2.toLowerCase().includes('total due')) {
                            const boldElement = cells[2].querySelector('b');
                            totalDue = boldElement ? boldElement.textContent.trim() : col3;
                        }
                    }
                });
                if (!firstHalfDueDate || !secondHalfDueDate) {
                    const allTableCells = document.querySelectorAll('td');
                    let dateCount = 0;
                    allTableCells.forEach(cell => {
                        const cellText = cell.textContent.trim();
                        const cellHTML = cell.innerHTML;
                        if ((cellHTML.includes('Due<br>') || cellText.includes('Due')) && cellText.match(/\d{2}\/\d{2}\/\d{4}/)) {
                            const dateMatch = cellText.match(/(\d{2}\/\d{2}\/\d{4})/);
                            if (dateMatch) {
                                const foundDate = dateMatch[1];
                                if (dateCount === 0 && !firstHalfDueDate) {
                                    firstHalfDueDate = foundDate;
                                    dateCount++;
                                } else if (dateCount === 1 && !secondHalfDueDate && foundDate !== firstHalfDueDate) {
                                    secondHalfDueDate = foundDate;
                                    dateCount++;
                                }
                            }
                        }
                    });
                }
            } else {
                console.error('Tax table not found with selector .infoTable.tableRightAlignInfo');
            }
            const valueRows = document.querySelectorAll('.infoTable tr');
            let landValue = '$0.00';
            let improvementValue = '$0.00';
            let totalAssessedValue = '$0.00';
            let landAssessed = '$0.00';
            let improvementAssessed = '$0.00';
            valueRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const label = cells[0] ? cells[0].textContent.trim().toLowerCase() : '';
                    if (label === 'land') {
                        landValue = cells[1] ? cells[1].textContent.trim() : '$0.00';
                        landAssessed = cells[2] ? cells[2].textContent.trim() : '$0.00';
                    } else if (label === 'improvement') {
                        improvementValue = cells[1] ? cells[1].textContent.trim() : '$0.00';
                        improvementAssessed = cells[2] ? cells[2].textContent.trim() : '$0.00';
                    } else if (label === 'total') {
                        totalAssessedValue = cells[2] ? cells[2].textContent.trim() : '$0.00';
                    }
                }
            });
            return {
                property_address: location,
                owner_address: ownerAddress,
                parcel_number: parcelNumber,
                land_value: landValue,
                improvements: improvementValue,
                total_assessed_value: totalAssessedValue,
                land_assessed: landAssessed,
                improvement_assessed: improvementAssessed,
                first_half_tax: firstHalfTax,
                first_half_paid: firstHalfPaid,
                first_half_balance: firstHalfBalance,
                first_half_due_date: firstHalfDueDate,
                second_half_tax: secondHalfTax,
                second_half_paid: secondHalfPaid,
                second_half_balance: secondHalfBalance,
                second_half_due_date: secondHalfDueDate,
                total_due: totalDue,
                tax_year: taxYear
            };
        });
        return details;
    } catch (error) {
        console.error(`Error extracting details:`, error.message);
        return {
            property_address: "N/A", owner_address: "N/A", parcel_number: "N/A",
            land_value: "$0.00", improvements: "$0.00", total_assessed_value: "$0.00",
            first_half_tax: "$0.00", first_half_paid: "$0.00", first_half_balance: "$0.00",
            second_half_tax: "$0.00", second_half_paid: "$0.00", second_half_balance: "$0.00",
            total_due: "$0.00", first_half_due_date: "", second_half_due_date: "", tax_year: (new Date().getFullYear() - 1).toString()
        };
    }
};

const scrapePaymentHistory = async (page) => {
    try {
        const tabs = await page.$$('a[uib-tab-heading-transclude]');
        let paymentTab = null;
        for (const tab of tabs) {
            const text = await page.evaluate(el => el.textContent.toLowerCase(), tab);
            if (text.includes('payment history') || text.includes('pay history')) {
                paymentTab = tab;
                break;
            }
        }

        if (paymentTab) {
            await paymentTab.click();
            await delay(2000);
        } else {
            console.error('Payment History tab not found');
            return [];
        }

        await page.waitForSelector('table.table.text-center', { timeout: 10000 });
        const paymentHistory = await page.evaluate(() => {
            const table = document.querySelector('table.table.text-center');
            if (!table) return [];
            const rows = table.querySelectorAll('tbody tr[ng-repeat]');
            const payments = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    const date = cells[0]?.textContent?.trim() || '';
                    const half = cells[1]?.textContent?.trim() || '';
                    const prior = cells[2]?.textContent?.trim() || '$0.00';
                    const firstHalf = cells[3]?.textContent?.trim() || '$0.00';
                    const secondHalf = cells[4]?.textContent?.trim() || '$0.00';
                    const surplus = cells[5]?.textContent?.trim() || '$0.00';
                    const receipt = cells[6]?.textContent?.trim() || '';
                    payments.push({
                        payment_date: date,
                        half_designation: half,
                        prior_amount: prior,
                        first_half_amount: firstHalf,
                        second_half_amount: secondHalf,
                        surplus_amount: surplus,
                        receipt_number: receipt
                    });
                }
            });
            return payments;
        });
        return paymentHistory;
    } catch (error) {
        console.error('Error scraping payment history:', error.message);
        return [];
    }
};

const getTaxData = async (page, parcelNumber, clientType = 'default') => {
    const normalizedClientType = clientType.toLowerCase().trim();
    try {
        await performSearch(page, parcelNumber);
        const searchResults = await scrapeTableData(page);

        if (!searchResults.records || searchResults.records.length === 0) {
            return handleNotFound(parcelNumber);
        }

        await page.evaluate(() => {
            const viewButton = document.querySelector('.btnView');
            if (viewButton) {
                viewButton.click();
            }
        });

        await delay(3000);
        const taxDetails = await scrapeDetailsPage(page);
        const paymentHistory = await scrapePaymentHistory(page);
        
        // Parse numeric values
        const firstHalfBalance = parseFloat((taxDetails.first_half_balance || '0').replace(/[^0-9.-]+/g, ""));
        const secondHalfBalance = parseFloat((taxDetails.second_half_balance || '0').replace(/[^0-9.-]+/g, ""));
        const firstHalfTaxValue = parseFloat((taxDetails.first_half_tax || '0').replace(/[^0-9.-]+/g, ""));
        const secondHalfTaxValue = parseFloat((taxDetails.second_half_tax || '0').replace(/[^0-9.-]+/g, ""));
        
        const currentTaxYear = taxDetails.tax_year || (new Date().getFullYear() - 1).toString();
        
        // Determine if semi-annual or annual based on payment history
        // If a single payment covers both halves, it's annual payment
        const hasFirstHalf = firstHalfTaxValue > 0;
        const hasSecondHalf = secondHalfTaxValue > 0;
        
        // Check if there's a single payment record with both halves
        const singlePaymentCoveringBoth = paymentHistory.some(p => 
            parseFloat(String(p.first_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0 && 
            parseFloat(String(p.second_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0
        );
        
        // Check if paid dates are different
        const firstHalfPaidDate = taxDetails.first_half_due_date || "";
        const secondHalfPaidDate = taxDetails.second_half_due_date || "";
        const hasDifferentDueDates = firstHalfPaidDate !== secondHalfPaidDate && firstHalfPaidDate && secondHalfPaidDate;
        
        // Semi-annual only if both halves exist, different due dates, AND not paid together
        const isSemiAnnual = hasFirstHalf && hasSecondHalf && hasDifferentDueDates && !singlePaymentCoveringBoth;
        const isAnnual = (hasFirstHalf || hasSecondHalf) && !isSemiAnnual;
        
        // Calculate delinquent dates
        const firstHalfDelqDate = calculateDelinquentDate(taxDetails.first_half_due_date);
        const secondHalfDelqDate = calculateDelinquentDate(taxDetails.second_half_due_date);
        
        // Check if past delinquency threshold
        const isFirstHalfDelinquent = firstHalfBalance > 0 && isDatePastDelinquency(firstHalfDelqDate);
        const isSecondHalfDelinquent = secondHalfBalance > 0 && isDatePastDelinquency(secondHalfDelqDate);
        
        // Determine payment status for each half
        const firstHalfStatus = firstHalfBalance <= 0 ? "PAID" : (isFirstHalfDelinquent ? "DELINQUENT" : "DUE");
        const secondHalfStatus = secondHalfBalance <= 0 ? "PAID" : (isSecondHalfDelinquent ? "DELINQUENT" : "DUE");
        
        // Build tax history
        const taxHistory = [];
        const yearsRequired = getOHCompanyYears(normalizedClientType);
        
        if (isSemiAnnual) {
            // Semi-annual: create two records
            const firstHalfPayment = paymentHistory.find(p => parseFloat(String(p.first_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0);
            taxHistory.push({
                jurisdiction: "County",
                year: currentTaxYear,
                status: firstHalfStatus,
                payment_type: "Semi-Annual",
                half_designation: "First Half",
                base_amount: taxDetails.first_half_tax,
                amount_paid: firstHalfStatus === "PAID" ? firstHalfPayment?.first_half_amount || "$0.00" : taxDetails.first_half_paid,
                amount_due: taxDetails.first_half_balance,
                paid_date: firstHalfStatus === "PAID" ? firstHalfPayment?.payment_date || "N/A" : "",
                due_date: taxDetails.first_half_due_date,
                delq_date: firstHalfDelqDate,
                land_value: taxDetails.land_value,
                improvements: taxDetails.improvements,
                total_assessed_value: taxDetails.total_assessed_value,
                receipt_number: firstHalfStatus === "PAID" ? firstHalfPayment?.receipt_number || "N/A" : "N/A"
            });

            const secondHalfPayment = paymentHistory.find(p => parseFloat(String(p.second_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0);
            taxHistory.push({
                jurisdiction: "County",
                year: currentTaxYear,
                status: secondHalfStatus,
                payment_type: "Semi-Annual",
                half_designation: "Second Half",
                base_amount: taxDetails.second_half_tax,
                amount_paid: secondHalfStatus === "PAID" ? secondHalfPayment?.second_half_amount || "$0.00" : taxDetails.second_half_paid,
                amount_due: taxDetails.second_half_balance,
                paid_date: secondHalfStatus === "PAID" ? secondHalfPayment?.payment_date || "N/A" : "",
                due_date: taxDetails.second_half_due_date,
                delq_date: secondHalfDelqDate,
                land_value: taxDetails.land_value,
                improvements: taxDetails.improvements,
                total_assessed_value: taxDetails.total_assessed_value,
                receipt_number: secondHalfStatus === "PAID" ? secondHalfPayment?.receipt_number || "N/A" : "N/A"
            });
        } else if (isAnnual) {
            // Annual: create one record with combined totals
            const combinedStatus = (firstHalfBalance <= 0 && secondHalfBalance <= 0) ? "PAID" : "DUE";
            const annualPayment = paymentHistory.find(p => 
                parseFloat(String(p.first_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0 || 
                parseFloat(String(p.second_half_amount || '0').replace(/[^0-9.-]+/g, "")) > 0
            );

            taxHistory.push({
                jurisdiction: "County",
                year: currentTaxYear,
                status: combinedStatus,
                payment_type: "Annual",
                half_designation: "",
                base_amount: firstHalfTaxValue > 0 ? taxDetails.first_half_tax : taxDetails.second_half_tax,
                amount_paid: firstHalfTaxValue > 0 ? taxDetails.first_half_paid : taxDetails.second_half_paid,
                amount_due: firstHalfTaxValue > 0 ? taxDetails.first_half_balance : taxDetails.second_half_balance,
                paid_date: combinedStatus === "PAID" ? annualPayment?.payment_date || "N/A" : "",
                due_date: firstHalfTaxValue > 0 ? taxDetails.first_half_due_date : taxDetails.second_half_due_date,
                delq_date: firstHalfTaxValue > 0 ? firstHalfDelqDate : secondHalfDelqDate,
                land_value: taxDetails.land_value,
                improvements: taxDetails.improvements,
                total_assessed_value: taxDetails.total_assessed_value,
                receipt_number: combinedStatus === "PAID" ? annualPayment?.receipt_number || "N/A" : "N/A"
            });
        }

        // Filter tax history based on yearsRequired
        const uniqueYears = [...new Set(taxHistory.map(item => item.year))].sort((a, b) => b - a);
        const allowedYears = uniqueYears.slice(0, yearsRequired);
        const filteredTaxHistory = taxHistory.filter(item => allowedYears.includes(item.year));

        // Check for prior years delinquency
        const priorYearsDelinquent = paymentHistory.some(p => hasAmountDue(p.prior_amount));

        // Determine delinquency status
        let delinquencyStatus = "NONE";
        if (isFirstHalfDelinquent || isSecondHalfDelinquent || priorYearsDelinquent) {
            delinquencyStatus = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        }

        // Build notes
        let priorYearNote = "";
        if (priorYearsDelinquent) {
            priorYearNote = "PRIORS ARE DELINQUENT";
        } else if (normalizedClientType.includes('accurate')) {
            priorYearNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE";
        } else {
            priorYearNote = "ALL PRIORS ARE PAID";
        }

        let currentYearStatus = "PAID";
        if (isSemiAnnual) {
            if (isFirstHalfDelinquent || isSecondHalfDelinquent) {
                currentYearStatus = "DELINQUENT";
            } else if (firstHalfBalance > 0 || secondHalfBalance > 0) {
                currentYearStatus = "DUE";
            } else {
                currentYearStatus = "PAID";
            }
        } else if (isAnnual) {
            const annualBalance = firstHalfBalance > 0 ? firstHalfBalance : secondHalfBalance;
            if (annualBalance > 0) {
                currentYearStatus = "DUE";
            } else {
                currentYearStatus = "PAID";
            }
        }

        let currentYearNote = "";
        if (isSemiAnnual) {
            currentYearNote = `${currentTaxYear} TAXES ARE ${currentYearStatus}, 1ST INSTALLMENT IS ${firstHalfStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalfStatus.toUpperCase()}`;
        } else if (isAnnual) {
            currentYearNote = `${currentTaxYear} TAXES ARE ${currentYearStatus}`;
        } else {
            currentYearNote = `${currentTaxYear} TAXES ARE NOT LISTED`;
        }

        // Format due dates
        const dueDates = [];
        if (taxDetails.first_half_due_date) {
            dueDates.push(taxDetails.first_half_due_date.substring(0, 5));
        }
        if (taxDetails.second_half_due_date && taxDetails.second_half_due_date !== taxDetails.first_half_due_date) {
            dueDates.push(taxDetails.second_half_due_date.substring(0, 5));
        }
        const formattedDueDates = [...new Set(dueDates)].join(' & ');
        const notes = [
            priorYearNote,
            currentYearNote,
            `NORMALLY TAXES ARE PAID SEMI-ANNUALLY`,
            formattedDueDates ? `NORMAL DUE DATES ARE ${formattedDueDates}` : ""
        ].filter(Boolean).join(', ').toUpperCase().trim();

        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: [searchResults.owner_name || "N/A"],
            property_address: taxDetails.property_address || "N/A",
            owner_address: taxDetails.owner_address || "N/A",
            parcel_number: taxDetails.parcel_number || parcelNumber,
            land_value: taxDetails.land_value || "$0.00",
            improvements: taxDetails.improvements || "$0.00",
            total_assessed_value: taxDetails.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: taxDetails.total_assessed_value || "$0.00",
            taxing_authority: "Scioto County Tax Office, Portsmouth, OH 45662",
            notes: notes,
            delinquent: delinquencyStatus,
            tax_history: filteredTaxHistory
        };
    } catch (error) {
        console.error("Error in getTaxData:", error.message);
        return handleNotFound(parcelNumber);
    }
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;
    const clientType = (req.body.clientName || req.body.client || 'others').toLowerCase().trim();
    
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).send("Invalid request type.");
    }
    if (!account) {
        return res.status(400).send("Parcel number is required.");
    }
    
    let browserContext = null;
    getBrowserInstance()
        .then(browser => {
            return browser.createBrowserContext();
        })
        .then(context => {
            browserContext = context;
            return context.newPage();
        })
        .then(page => {
            page.setDefaultNavigationTimeout(90000);
            return page.setRequestInterception(true)
                .then(() => {
                    page.on("request", (reqInt) => {
                        if (["stylesheet", "font", "image", "media"].includes(reqInt.resourceType())) {
                            reqInt.abort();
                        } else {
                            reqInt.continue();
                        }
                    });
                    return getTaxData(page, account, clientType);
                });
        })
        .then(data => {
            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
            } else {
                res.status(200).json({ result: data });
            }
        })
        .catch(error => {
            const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
            console.error("Scraping error:", errorMessage);
            if (fetch_type === "html") {
                res.status(500).render('error_data', { error: true, message: errorMessage });
            } else {
                res.status(500).json({ error: true, message: errorMessage });
            }
        })
        .finally(() => {
            if (browserContext) {
                browserContext.close();
            }
        });
};

module.exports = { search };