//Author Nithyananda R S 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

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
    taxing_authority: "York County Tax Office",
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

// Function to calculate due date and delinquency date based on tax year
const calculateTaxDates = (taxYear) => {
    const year = parseInt(taxYear);
    const dueYear = year + 1; // Tax year 2024 is due in 2025
    
    const dueDate = new Date(dueYear, 0, 15); // January 15 of the following year
    
    // Setting delinquency date to the day after the due date (January 16th)
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
    const searchUrl = 'https://onlinetaxes.yorkcountygov.com/taxes#/WildfireSearch';
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector('#searchBox', { timeout: 30000 });
    await delay(2000);
    await page.type('#searchBox', parcelNumber);
    await delay(1000);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.wildfireResults table, .no-results', { timeout: 15000 });
    await delay(3000);
};

/**
 * Scrapes the initial table to get the list of all records.
 */
const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        const table = document.querySelector('.wildfireResults table.searchResults');
        if (!table) {
            return { records: [], owner_name: "" };
        }
        const rows = table.querySelectorAll('tbody tr[ng-repeat]');
        const records = [];
        let ownerName = "";
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) {
                const owner = cells[0]?.innerText?.trim() || "";
                const year = cells[1]?.innerText?.trim() || "";
                const receipt = cells[2]?.innerText?.trim() || "";
                const type = cells[4]?.innerText?.trim() || "";
                const paidCell = cells[5];
                
                // Handle different statuses
                let status = "Unpaid"; // default
                let isTaxOnSale = false;
                let isNullaBona = false;
                let isRefund = false;
                
                if (paidCell.classList.contains('Paid')) {
                    status = 'Paid';
                } else {
                    const cellText = paidCell.innerText?.trim().toLowerCase() || '';
                    if (cellText.includes('refund')) {
                        status = 'Refund';
                        isRefund = true;
                    } else if (cellText.includes('tax sale')) {
                        status = 'Tax Sale';
                        isTaxOnSale = true;
                    } else if (cellText.includes('nulla bono') || cellText.includes('nulla bona')) {
                        status = 'Nulla Bona';
                        isNullaBona = true;
                    }
                }
                
                // Skip refund records
                if (isRefund) {
                    return;
                }
                
                const paidDate = cells[6]?.querySelector('span')?.innerText?.trim() || "";

                if (records.length === 0 && owner) {
                    ownerName = owner;
                }
                
                records.push({
                    owner_name: owner,
                    year: year,
                    receipt: receipt,
                    type: type,
                    is_paid: status === 'Paid',
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

const scrapeDetailsPage = async (page, record) => {
    try {
        await page.waitForSelector('.tab-pane.ng-scope.active', { timeout: 10000 });

        const details = await page.evaluate((record) => {
            const detailContainer = document.querySelector('.tab-content');

            // Generic function to extract a value from a table given a label
            const getTextByLabel = (labelText, container) => {
                const rows = container.querySelectorAll('tr');
                for (const row of rows) {
                    const labelCell = row.querySelector('td:first-child');
                    if (labelCell && labelCell.innerText.trim().toLowerCase().includes(labelText.toLowerCase())) {
                        const valueCell = row.querySelector('td:last-child');
                        if (valueCell) {
                            return valueCell.innerText.trim();
                        }
                    }
                }
                return null;
            };

            // Scrape Owner Information and address
            const ownerInfoDiv = detailContainer.querySelector('div.col-md-4.section.ng-binding');
            let ownerAddress = 'N/A';
            let propertyAddress = 'N/A';
            if (ownerInfoDiv) {
                const lines = ownerInfoDiv.innerText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                if (lines.length > 2) {
                    ownerAddress = lines.slice(2).join(' ').replace(/\s{2,}/g, ' ').trim();
                }
            }

            // Scrape Property Information
            const propertyTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Property Information')?.parentNode.querySelector('table');
            const parcelNumber = propertyTable ? getTextByLabel('Parcel Number', propertyTable) : 'N/A';
            const assessedValue = propertyTable ? getTextByLabel('Assessed Value', propertyTable) : 'N/A';
            const appraisedValue = propertyTable ? getTextByLabel('Appraised Value', propertyTable) : 'N/A';

            // Scrape Bill Information
            const billTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Bill Information')?.parentNode.querySelector('table');
            const dueDateStr = billTable ? getTextByLabel('Due Date', billTable) : 'N/A';

            // Scrape Taxes
            const taxesTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Taxes')?.parentNode.querySelector('table');
            const baseTaxes = taxesTable ? getTextByLabel('Base Taxes', taxesTable) : 'N/A';
            const totalDue = taxesTable ? (taxesTable.querySelector('td b')?.innerText.trim() || 'N/A') : 'N/A';
            
            // Get paid status and amount from Payment Information table
            const paymentTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Payment Information')?.parentNode.querySelector('table');
            const amountPaid = paymentTable ? getTextByLabel('Amount Paid', paymentTable) : 'N/A';
            const paymentStatus = paymentTable ? getTextByLabel('Status', paymentTable) : 'N/A';
            
            // Calculate status based on record flags and current date
            const currentDate = new Date();
            const taxYear = parseInt(record.year);
            const dueDate = new Date(taxYear + 1, 0, 15); // January 15
            const delinquencyDate = new Date(taxYear + 1, 0, 16); // January 16
            
            let status;
            if (record.is_tax_on_sale || record.is_nulla_bona) {
                status = "Delinquent"; // Tax on Sale and Nulla Bona are always Delinquent
            } else if (record.is_paid) {
                status = "Paid";
            } else if (currentDate > delinquencyDate) {
                status = "Delinquent";
            } else if (currentDate > dueDate) {
                status = "Due";
            } else {
                status = "Due";
            }
            
            return {
                property_address: propertyAddress,
                owner_address: ownerAddress,
                parcel_number: parcelNumber,
                assessed_value: assessedValue,
                appraised_value: appraisedValue,
                base_amount: baseTaxes,
                total_due: totalDue,
                amount_paid: amountPaid,
                due_date: dueDateStr,
                payment_status: paymentStatus,
                status: status
            };
        }, record);
        return details;
    } catch (error) {
        console.error(`Error extracting details from the details page:`, error.message);
        return {
            property_address: "N/A",
            owner_address: "N/A",
            parcel_number: "N/A",
            assessed_value: "N/A",
            appraised_value: "N/A",
            base_amount: "N/A",
            total_due: "N/A",
            amount_paid: "N/A",
            due_date: "N/A",
            payment_status: "N/A",
            status: "N/A"
        };
    }
};

/**
 * Main function to orchestrate the scraping process.
 */
const getTaxData = async (page, parcelNumber) => {
    try {
        await performSearch(page, parcelNumber);
        const searchResults = await scrapeTableData(page);

        if (!searchResults.records || searchResults.records.length === 0) {
            return handleNotFound(parcelNumber);
        }

        const allRecords = searchResults.records;
        
        // Separate paid and unpaid/delinquent records
        // Tax on Sale and Nulla Bona are treated as unpaid/delinquent
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
        const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 01/15';

        if (unpaidRecords.length > 0) {
            // Process ALL unpaid/delinquent records (including Tax on Sale and Nulla Bona)
            recordsToProcess = unpaidRecords;
            
            const unpaidYears = unpaidRecords.map(r => parseInt(r.year)).sort((a, b) => a - b);
            const latestYear = unpaidYears[unpaidYears.length - 1];
            
            // Check if any unpaid record is past delinquency date or is Tax on Sale/Nulla Bona
            const isDelinquent = unpaidRecords.some(record => {
                const taxYear = parseInt(record.year);
                const delinquencyDate = new Date(taxYear + 1, 0, 16);
                return currentDate > delinquencyDate || record.is_tax_on_sale || record.is_nulla_bona;
            });
            
            delinquencyStatus = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            // Check latest unpaid year status
            const latestYearDueDate = new Date(latestYear + 1, 0, 15);
            const latestYearDelqDate = new Date(latestYear + 1, 0, 16);
            
            let latestYearStatus;
            if (currentDate > latestYearDelqDate) {
                latestYearStatus = "DELINQUENT";
            } else if (currentDate > latestYearDueDate) {
                latestYearStatus = "DUE";
            } else {
                latestYearStatus = "DUE";
            }

            if (unpaidYears.length > 1) {
                notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`;
            } else {
                notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`;
            }
        } else {
            // ALL PAID: Process only the most recent paid record
            recordsToProcess = [paidRecords[0]];
            delinquencyStatus = "NONE";

            const latestYear = parseInt(paidRecords[0].year);
            notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
        }
        
        let finalTaxHistory = [];
        
        // Process selected records
        for (const record of recordsToProcess) {
            await page.evaluate((receipt) => {
                const rows = document.querySelectorAll('tbody tr[ng-repeat]');
                for (const row of rows) {
                    const receiptCell = row.querySelector('td:nth-child(3)');
                    if (receiptCell && receiptCell.innerText.trim() === receipt) {
                        const viewButton = row.querySelector('button.btnView');
                        if (viewButton) {
                            viewButton.click();
                            return true;
                        }
                    }
                }
            }, record.receipt);

            await delay(3000); 
            const taxDetails = await scrapeDetailsPage(page, record);
            
            // Store property details from first record
            if (!propertyDetails) {
                propertyDetails = {
                    property_address: taxDetails.property_address,
                    owner_address: taxDetails.owner_address,
                    parcel_number: taxDetails.parcel_number,
                    total_assessed_value: formatCurrency(taxDetails.assessed_value),
                    total_taxable_value: formatCurrency(taxDetails.assessed_value)
                };
            }
            
            // Calculate dynamic tax dates based on year
            const taxDates = calculateTaxDates(record.year);
            
            const taxRecord = {
                jurisdiction: "County", 
                year: record.year, 
                status: taxDetails.status,
                payment_type: "Annual",
                base_amount: formatCurrency(taxDetails.base_amount),
                amount_paid: formatCurrency(taxDetails.amount_paid),
                amount_due: record.is_paid && !record.is_tax_on_sale && !record.is_nulla_bona ? "$0.00" : formatCurrency(taxDetails.total_due),
                paid_date: record.paid_date || "",
                due_date: taxDates.dueDate,
                delq_date: taxDates.delqDate,
                land_value: "N/A", 
                improvements: "N/A",
                total_assessed_value: propertyDetails.total_assessed_value,
                total_taxable_value: propertyDetails.total_taxable_value
            };
            
            finalTaxHistory.push(taxRecord);
            
            // Navigate back to search results
            await page.click('a[href="#/WildfireSearch"]');
            await page.waitForSelector('.wildfireResults table', { timeout: 10000 });
            await delay(2000);
        }
        
        if (finalTaxHistory.length === 0) {
            return handleNotFound(parcelNumber);
        }
        
        // Sort tax history based on payment status
        finalTaxHistory.sort((a, b) => {
            const aYear = parseInt(a.year);
            const bYear = parseInt(b.year);
            const aUnpaid = a.status !== "Paid";
            const bUnpaid = b.status !== "Paid";
            
            // If both unpaid/delinquent: oldest to newest (ascending)
            // If both paid: newest to oldest (descending)
            if (aUnpaid && bUnpaid) {
                return aYear - bYear; // Ascending for unpaid
            } else if (!aUnpaid && !bUnpaid) {
                return bYear - aYear; // Descending for paid
            }
            // Unpaid records come before paid records
            return aUnpaid ? -1 : 1;
        });
        
        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: searchResults.owner_name ? [searchResults.owner_name] : ["N/A"],
            property_address: propertyDetails?.property_address || "N/A",
            owner_address: propertyDetails?.owner_address || "N/A",
            parcel_number: propertyDetails?.parcel_number || parcelNumber,
            land_value: "N/A",
            improvements: "N/A",
            total_assessed_value: propertyDetails?.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: propertyDetails?.total_taxable_value || "$0.00",
            taxing_authority: "York County Tax Office",
            notes: notes,
            delinquent: delinquencyStatus,
            tax_history: finalTaxHistory
        };
    } catch (error) {
        console.error("Error in getTaxData:", error.message);
        return handleNotFound(parcelNumber);
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

export { search };