//Author Nithyananda R S 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// Helper function to handle cases where no records are found
const handleNotFound = (parcelNumber, reason = "No tax records found for this parcel number.") => ({
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
    taxing_authority: "Cleveland County Tax Office, Shelby, NC",
    notes: reason,
    delinquent: "N/A",
    tax_history: []
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatCurrency = (str) => {
    if (!str || str === "N/A" || str === "") return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function to check if amount is greater than 0
const hasAmountDue = (amount) => {
    if (!amount || amount === "N/A" || amount === "") return false;
    const num = parseFloat(amount.replace(/[^0-9.-]+/g, ""));
    return !isNaN(num) && num > 0;
};

const calculateTaxDates = (taxYear) => {
    const year = parseInt(taxYear);
    const dueYear = year + 1; // Tax year 2024 is due in 2025
    
    const dueDate = new Date(dueYear, 0, 5); // January 5 of the following year
    
    // Setting delinquency date to the day after the due date (January 6th)
    const delqDateObj = new Date(dueDate);
    delqDateObj.setDate(dueDate.getDate() + 1);
    
    const formatDate = (date) => {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    };
    
    return { 
        dueDate: formatDate(dueDate), 
        delqDate: formatDate(delqDateObj)
    };
};

/**
 * Navigates to the search page, enters the parcel number, and clicks search.
 */
const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://www.clevelandcountytaxes.com/taxes.html#/WildfireSearch';
    
    // Check if we're already on the search page to avoid unnecessary reload
    const currentUrl = page.url();
    if (!currentUrl.includes('#/WildfireSearch')) {
        try {
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
        } catch (e) {
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        }
    }
    
    // Wait for the search box to be visible
    const searchBoxSelector = '#searchBox';
    await page.waitForSelector(searchBoxSelector, { timeout: 20000 });
    
    // Clear and type more reliably
    await page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, searchBoxSelector);
    
    await page.type(searchBoxSelector, parcelNumber, { delay: 50 });
    
    // Click search and also press Enter for reliability
    const searchButton = 'button[type="submit"]';
    if (await page.$(searchButton)) {
        await page.click(searchButton);
    } else {
        await page.keyboard.press('Enter');
    }
    
    // Wait for results or no-results
    try {
        const resultSelector = await Promise.race([
            page.waitForSelector('table.searchResults, table[ng-repeat*="result.Records"], table.table', { timeout: 30000 }).then(() => 'table'),
            page.waitForSelector('.no-results, .alert-info, .alert, [ng-if*="No results"]', { timeout: 30000 }).then(() => 'no-results')
        ]);
        
        // Small delay to let Angular finish rendering
        await delay(1000);
        return resultSelector;
    } catch (error) {
        console.error('Timeout waiting for search results');
        throw new Error('Results table did not appear after search. The website might be slow or the account number is invalid.');
    }
};

/**
 * Scrapes the initial table to get the list of all records.
 */
const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        // Try multiple selectors for the results table based on provided HTML
        const table = document.querySelector('table.searchResults') || 
                      document.querySelector('.searchResults table') || 
                      document.querySelector('table[ng-repeat*="result.Records"]') ||
                      document.querySelector('table.table');

        if (!table) {
            return { records: [], owner_name: "" };
        }
        
        // Use a more specific row selector based on the provided HTML
        const rows = table.querySelectorAll('tbody tr[ng-repeat]');
        const records = [];
        let ownerName = "";
        
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            // The provided HTML shows 9 columns (0-8)
            if (cells.length >= 7) {
                // Extract owner name - handle both primary and secondary names
                const ownerCell = cells[0];
                let owner = "";
                
                // Get all text and clean it up, or use childNodes if more precision is needed
                const primaryName = ownerCell.childNodes[0]?.textContent?.trim() || "";
                const secondaryNameSpan = ownerCell.querySelector('span');
                const secondaryName = secondaryNameSpan?.textContent?.trim() || "";
                
                if (primaryName && secondaryName) {
                    owner = `${primaryName} ${secondaryName}`.replace(/\s+/g, ' ').trim();
                } else {
                    owner = primaryName;
                }
                
                const year = cells[1]?.innerText?.trim() || "";
                const receiptNumber = cells[2]?.innerText?.trim() || "";
                const description = cells[3]?.innerText?.trim() || "";
                const type = cells[4]?.innerText?.trim() || "";
                const paidCell = cells[5];
                
                // Handle different statuses based on class and text
                let status = "Unpaid"; 
                let isTaxOnSale = false;
                let isNullaBona = false;
                let isPaid = false;
                
                const cellText = paidCell.innerText?.trim().toLowerCase() || '';
                const cellClasses = Array.from(paidCell.classList);
                
                if (cellText.includes('unpaid') || cellClasses.includes('Unpaid')) {
                    status = 'Unpaid';
                    isPaid = false;
                } else if (cellText.includes('paid') || cellClasses.includes('Paid')) {
                    status = 'Paid';
                    isPaid = true;
                } else if (cellText.includes('tax sale')) {
                    status = 'Tax Sale';
                    isTaxOnSale = true;
                    isPaid = false;
                } else if (cellText.includes('nulla bona') || cellText.includes('nulla bono')) {
                    status = 'Nulla Bona';
                    isNullaBona = true;
                    isPaid = false;
                } else {
                    // Fallback for other counties if class/text markers aren't standard
                    const amountDueText = cells[7]?.innerText?.trim() || "0";
                    const amountDue = parseFloat(amountDueText.replace(/[^0-9.-]+/g, ""));
                    if (!isNaN(amountDue) && amountDue > 0) {
                        status = 'Unpaid';
                        isPaid = false;
                    } else {
                        status = 'Paid';
                        isPaid = true;
                    }
                }
                
                const paidDateRaw = cells[6]?.innerText?.trim() || "";
                
                // Helper inside evaluate to handle MM/DD/YYYY extraction
                const formatFullDate = (dateStr) => {
                    if (!dateStr) return "";
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        const mm = parts[0].padStart(2, '0');
                        const dd = parts[1].padStart(2, '0');
                        let yyyy = parts[2].trim();
                        if (yyyy.length === 2) {
                            yyyy = "20" + yyyy;
                        }
                        return `${mm}/${dd}/${yyyy}`;
                    }
                    return dateStr;
                };
                const paidDate = formatFullDate(paidDateRaw);

                if (records.length === 0 && owner) {
                    ownerName = owner;
                }
                
                records.push({
                    owner_name: owner,
                    year: year,
                    receipt_number: receiptNumber,
                    description: description,
                    type: type,
                    is_paid: isPaid,
                    is_tax_on_sale: isTaxOnSale,
                    is_nulla_bona: isNullaBona,
                    status: status,
                    paid_date: paidDate
                });
            }
        });
        return { records: records, owner_name: ownerName };
    });
};

/**
 * Scrapes details from a record's specific page.
 */
const scrapeDetailsPage = async (page, record) => {
    try {
        await page.waitForSelector('.tab-content, .detail-view, .record-details, .infoTable', { timeout: 30000 });
        await delay(1000);
        
        const details = await page.evaluate((record) => {
            const detailContainer = document.querySelector('.tab-content') || 
                                   document.querySelector('.detail-view') ||
                                   document.querySelector('body');
            
            const getTextByLabel = (labelText) => {
                const tables = detailContainer.querySelectorAll('table.infoTable, table');
                for (const table of tables) {
                    const rows = table.querySelectorAll('tr');
                    for (const row of rows) {
                        const labelCell = row.querySelector('td:first-child');
                        if (labelCell && labelCell.innerText.trim().toLowerCase().includes(labelText.toLowerCase())) {
                            const valueCell = row.querySelector('td:last-child');
                            if (labelText.toLowerCase() === 'total due') {
                                const boldText = valueCell?.querySelector('b')?.innerText.trim();
                                if (boldText) return boldText;
                            }
                            return valueCell ? valueCell.innerText.trim() : null;
                        }
                    }
                }
                return null;
            };
            
            const cleanCurrency = (value) => {
                if (!value || value === "N/A") return "$0.00";
                const num = parseFloat(value.replace(/[^0-9.-]+/g, ""));
                return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };
            
            // Extract owner address from the Address field in Bill Information
            let ownerAddress = 'N/A';
            const addressCell = Array.from(detailContainer.querySelectorAll('table tr'))
                .find(row => {
                    const label = row.querySelector('td:first-child')?.innerText.trim();
                    return label === 'Address';
                });
            
            if (addressCell) {
                const addressTd = addressCell.querySelector('td:last-child');
                if (addressTd) {
                    ownerAddress = addressTd.innerText.trim().replace(/\s{2,}/g, ' ').replace(/\n/g, ' ');
                }
            }
            
            // Get tax value (total assessed value)
            const taxValue = getTextByLabel('Tax Value') || 
                           getTextByLabel('Assessed Value') || 
                           getTextByLabel('Appraised Value') || 
                           '$0.00';
            
            // Calculate status based on record flags and current date
            const currentDate = new Date();
            const taxYear = parseInt(record.year);
            const dueDate = new Date(taxYear + 1, 0, 5); // January 5
            const delinquencyDate = new Date(taxYear + 1, 0, 6); // January 6
            
            // Check for amount due in details first as it's more definitive
            const totalDueText = getTextByLabel('Amount Due') || getTextByLabel('Total Due') || "0";
            const totalDue = parseFloat(totalDueText.replace(/[^0-9.-]+/g, ""));
            const hasBalance = !isNaN(totalDue) && totalDue > 0;
            
            let status;
            if (record.is_tax_on_sale || record.is_nulla_bona) {
                status = "Delinquent";
            } else if (!hasBalance) {
                status = "Paid";
            } else {
                // There is a balance
                if (currentDate > delinquencyDate) {
                    status = "Delinquent";
                } else {
                    status = "Due";
                }
            }
            
            return {
                property_address: getTextByLabel('Description') || 
                                getTextByLabel('Property Address') || 
                                'N/A',
                owner_address: ownerAddress,
                parcel_number: getTextByLabel('Parcel Number') || 
                             getTextByLabel('Map No.') || 
                             'N/A',
                land_value: "$0.00",
                improvements: "$0.00",
                total_assessed_value: cleanCurrency(taxValue),
                base_amount: cleanCurrency(getTextByLabel('Base Tax Amount') || 
                                         getTextByLabel('Base Taxes')),
                total_due: cleanCurrency(getTextByLabel('Amount Due') || 
                                       getTextByLabel('Total Due')),
                amount_paid: cleanCurrency(getTextByLabel('Net Taxes Paid') || 
                                         getTextByLabel('Amount Paid')),
                due_date: getTextByLabel('Due Date') || 'N/A',
                receipt_number: getTextByLabel('Receipt Number') || 
                              getTextByLabel('Notice Number') || 
                              'N/A',
                status: status
            };
        }, record);
        
        return details;
        
    } catch (error) {
        console.error(`Error extracting details:`, error.message);
        return {
            property_address: "N/A", owner_address: "N/A", parcel_number: "N/A",
            land_value: "$0.00", improvements: "$0.00", total_assessed_value: "$0.00",
            base_amount: "$0.00", total_due: "$0.00", amount_paid: "$0.00", due_date: "N/A",
            receipt_number: "N/A", status: "N/A"
        };
    }
};

/**
 * Main function to orchestrate the scraping process.
 */
const getTaxData = async (page, parcelNumber) => {
    try {
        const resultsSelector = await performSearch(page, parcelNumber);
        
        let searchResults = await scrapeTableData(page);

        if (!searchResults.records || searchResults.records.length === 0) {
            return handleNotFound(parcelNumber);
        }

        const allRecords = searchResults.records;
        
        // Separate paid and unpaid/delinquent records
        const unpaidRecords = allRecords.filter(record => 
            !record.is_paid || record.is_tax_on_sale || record.is_nulla_bona
        );
        const paidRecords = allRecords.filter(record => 
            record.is_paid && !record.is_tax_on_sale && !record.is_nulla_bona
        );
        
        let recordsToProcess = [];
        let delinquencyStatus;
        let notes;
        let propertyDetails = null;
        
        const currentDate = new Date();
        const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE 01/05';
        const CITY_TAX_NOTE = 'CITY TAX NEED TO CONFIRM';

        if (unpaidRecords.length > 0) {
            recordsToProcess = unpaidRecords;
            
            const unpaidYears = unpaidRecords.map(r => parseInt(r.year)).sort((a, b) => a - b);
            const latestYear = unpaidYears[unpaidYears.length - 1];
            
            const isDelinquent = unpaidRecords.some(record => {
                const taxYear = parseInt(record.year);
                const delinquencyDate = new Date(taxYear + 1, 0, 6);
                return currentDate > delinquencyDate || record.is_tax_on_sale || record.is_nulla_bona;
            });
            
            delinquencyStatus = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            const latestYearDueDate = new Date(latestYear + 1, 0, 5);
            const latestYearDelqDate = new Date(latestYear + 1, 0, 6);
            
            let latestYearStatus;
            if (currentDate > latestYearDelqDate) {
                latestYearStatus = "DELINQUENT";
            } else {
                latestYearStatus = "DUE";
            }

            if (unpaidYears.length > 1) {
                notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            } else {
                notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            }
        } else {
            recordsToProcess = [paidRecords[0]];
            delinquencyStatus = "NONE";
            const latestYear = parseInt(paidRecords[0].year);
            notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
        }
        
        console.log(`Processing ${recordsToProcess.length} candidate records`);
        let finalTaxHistory = [];
        
        const normalize = (str) => str ? str.toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : "";
        const targetParcelNormalized = normalize(parcelNumber);

        // Process selected records
        for (let i = 0; i < recordsToProcess.length; i++) {
            const record = recordsToProcess[i];
            
            // Find the correct row and click the view button
            const buttonSelector = await page.evaluate((receiptNum, year) => {
                const rows = document.querySelectorAll('tr[ng-repeat], tr.ng-scope');
                for (let j = 0; j < rows.length; j++) {
                    const row = rows[j];
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const cellYear = cells[1].innerText.trim();
                        const cellReceipt = cells[2].innerText.trim();
                        if (cellReceipt === receiptNum && cellYear === year) {
                            const btn = row.querySelector('button.btnView');
                            if (btn) {
                                btn.classList.add(`click-target-${j}`);
                                return `.click-target-${j}`;
                            }
                        }
                    }
                }
                return null;
            }, record.receipt_number, record.year);

            if (buttonSelector) {
                await page.click(buttonSelector);
            } else {
                console.warn(`Could not find view button for receipt ${record.receipt_number}`);
                continue;
            }

            await delay(1000); 
            const taxDetails = await scrapeDetailsPage(page, record);

            // VERIFICATION: Check if this record belongs to our target parcel
            const scrapedParcelNormalized = normalize(taxDetails.parcel_number);
            if (targetParcelNormalized && (scrapedParcelNormalized === "" || scrapedParcelNormalized !== targetParcelNormalized)) {
                // Navigate back even if skipping
                const backButtonClicked = await page.evaluate(() => {
                    const backBtn = document.querySelector('.goBack a, a[href="#/WildfireSearch"]');
                    if (backBtn) { backBtn.click(); return true; }
                    return false;
                });
                if (!backButtonClicked) await page.goBack();
                await page.waitForSelector('table.searchResults, table[ng-repeat*="result.Records"], table.table', { timeout: 15000 });
                continue;
            }
            
            if (!propertyDetails && taxDetails.property_address !== "N/A") {
                propertyDetails = {
                    property_address: taxDetails.property_address,
                    owner_address: taxDetails.owner_address,
                    parcel_number: taxDetails.parcel_number,
                    land_value: taxDetails.land_value,
                    improvements: taxDetails.improvements,
                    total_assessed_value: taxDetails.total_assessed_value
                };
            }
            
            const taxDates = calculateTaxDates(record.year);
            
            const taxRecord = {
                jurisdiction: "County", 
                year: record.year,
                status: taxDetails.status,
                payment_type: "Annual",
                base_amount: taxDetails.base_amount || "$0.00",
                amount_paid: taxDetails.amount_paid || "$0.00",
                amount_due: taxDetails.status === "Paid" ? "$0.00" : (taxDetails.total_due || "$0.00"),
                paid_date: record.paid_date || "",
                due_date: taxDates.dueDate,
                delq_date: taxDates.delqDate,
                land_value: propertyDetails?.land_value || "$0.00",
                improvements: propertyDetails?.improvements || "$0.00",
                total_assessed_value: propertyDetails?.total_assessed_value || "$0.00",
                receipt_number: taxDetails.receipt_number
            };
            
            finalTaxHistory.push(taxRecord);
            
            // Only navigate back if there are more records to process
            if (i < recordsToProcess.length - 1) {
                // Try to click the "Back to Search" button first as it's more reliable in this SPA
                const backButtonClicked = await page.evaluate(() => {
                    const backBtn = document.querySelector('.goBack a, a[href="#/WildfireSearch"]');
                    if (backBtn) {
                        backBtn.click();
                        return true;
                    }
                    return false;
                });

                if (!backButtonClicked) {
                    await page.goBack();
                }

                try {
                    // Wait for the table to reappear with a shorter timeout
                    await page.waitForSelector('table.searchResults, table[ng-repeat*="result.Records"], table.table', { timeout: 15000 });
                } catch (e) {
                    // If the table doesn't appear, it's possible the search state was lost.
                    // Re-run the search to get back to the results.
                    await performSearch(page, parcelNumber);
                }
            }
        }
        
        if (finalTaxHistory.length === 0) {
            return handleNotFound(parcelNumber, "Could not process any tax records");
        }
        
        // Sort tax history
        finalTaxHistory.sort((a, b) => {
            const aYear = parseInt(a.year);
            const bYear = parseInt(b.year);
            const aUnpaid = a.status !== "Paid";
            const bUnpaid = b.status !== "Paid";
            
            if (aUnpaid && bUnpaid) {
                return aYear - bYear;
            } else if (!aUnpaid && !bUnpaid) {
                return bYear - aYear;
            }
            return aUnpaid ? -1 : 1;
        });
        
        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: searchResults.owner_name ? [searchResults.owner_name] : ["N/A"],
            property_address: propertyDetails?.property_address || "N/A",
            owner_address: propertyDetails?.owner_address || "N/A",
            parcel_number: propertyDetails?.parcel_number || parcelNumber,
            land_value: propertyDetails?.land_value || "$0.00",
            improvements: propertyDetails?.improvements || "$0.00",
            total_assessed_value: propertyDetails?.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: propertyDetails?.total_assessed_value || "$0.00",
            taxing_authority: "Cleveland County Tax Office, Shelby, NC",
            notes: notes,
            delinquent: delinquencyStatus,
            tax_history: finalTaxHistory
        };
    } catch (error) {
        console.error("Error in getTaxData:", error.message);
        console.error("Stack trace:", error.stack);
        return handleNotFound(parcelNumber, `Error: ${error.message}`);
    }
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;
    
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
                    return getTaxData(page, account);
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
            console.error("Full error:", error);
            if (fetch_type === "html") {
                res.status(500).render('error_data', { error: true, message: errorMessage });
            } else {
                res.status(500).json({ error: true, message: errorMessage });
            }
        })
        .finally(() => {
            if (browserContext) {
                browserContext.close().catch(err => console.error('Error closing browser:', err));
            }
        });
};

module.exports = { search };