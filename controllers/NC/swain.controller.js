//Author: Nithyananda R S
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
    taxing_authority: "Swain County Tax Office, NC",
    notes: reason,
    delinquent: "N/A",
    tax_history: []
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatCurrency = (str) => {
    if (!str || str === "N/A" || str === "" || str === "&nbsp;") return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function to check if amount is greater than 0
const hasAmountDue = (amount) => {
    if (!amount || amount === "N/A" || amount === "") return false;
    const num = parseFloat(amount.replace(/[^0-9.-]+/g, ""));
    return !isNaN(num) && num > 0;
};

// Function to calculate due date and delinquency date based on tax year
const calculateTaxDates = (taxYear) => {
    const year = parseInt(taxYear);
    const dueYear = year + 1; // Tax year 2024 is due in 2025
    
    // Swain County due date: January 5
    const dueDate = new Date(dueYear, 0, 5);
    const delqDateObj = new Date(dueYear, 0, 6); // January 6
    
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
 * Navigates to the search page, enters the parcel number, and submits the form.
 */
const performSearch = async (page, parcelNumber) => {
    try {
        const searchUrl = 'https://www.bttaxpayerportal.com/ITSPublicSW/TaxBillSearch';
        
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
        
        await delay(2000);
        
        // Wait for the parcel number input field
        await page.waitForSelector('#ParcelNumber', { timeout: 30000 });
        
        // Clear and enter parcel number
        await page.click('#ParcelNumber', { clickCount: 3 });
        await page.type('#ParcelNumber', parcelNumber);
        
        await delay(1000);
        
        // Click submit button
        await page.click('input[type="submit"]');
        
        // Wait for results page to load
        await delay(3000);
        
        // Wait for jqGrid to load
        await page.waitForSelector('#list', { timeout: 30000 });
        
        // Wait for grid data to populate
        await delay(3000);
        
        return true;
        
    } catch (error) {
        console.error('Error in performSearch:', error.message);
        throw error;
    }
};

/**
 * Scrapes the jqGrid table to get all tax records
 */
const scrapeGridData = async (page) => {
    return page.evaluate(() => {
        const records = [];
        
        // Get all rows from the grid (skip the first row which is a template row)
        const rows = document.querySelectorAll('#list tbody tr[role="row"]');
        
        rows.forEach((row, index) => {
            // Skip the first row (jqgfirstrow)
            if (row.classList.contains('jqgfirstrow')) {
                return;
            }
            
            const rowId = row.id; // Format: "YEAR/BILLNUMBER" e.g., "2025/8749"
            if (!rowId) return;
            
            const cells = row.querySelectorAll('td[role="gridcell"]');
            
            if (cells.length >= 9) {
                const taxYear = cells[0]?.getAttribute('title') || cells[0]?.innerText?.trim() || "";
                const billNumber = cells[1]?.getAttribute('title') || cells[1]?.innerText?.trim() || "";
                const accountNumber = cells[2]?.getAttribute('title') || cells[2]?.innerText?.trim() || "";
                const ownerName = cells[3]?.getAttribute('title') || cells[3]?.innerText?.trim() || "";
                const originalLevy = cells[4]?.getAttribute('title') || cells[4]?.innerText?.trim() || "";
                const balance = cells[5]?.getAttribute('title') || cells[5]?.innerText?.trim() || "";
                const discoveryYear = cells[6]?.getAttribute('title') || cells[6]?.innerText?.trim() || "";
                const property = cells[7]?.getAttribute('title') || cells[7]?.innerText?.trim() || "";
                const address = cells[8]?.getAttribute('title') || cells[8]?.innerText?.trim() || "";
                
                // Determine if paid based on balance
                const balanceNum = parseFloat(balance.replace(/[^0-9.-]+/g, ""));
                const isPaid = balanceNum === 0 || isNaN(balanceNum);
                
                records.push({
                    row_id: rowId,
                    tax_year: taxYear,
                    bill_number: billNumber,
                    account_number: accountNumber,
                    owner_name: ownerName,
                    original_levy: originalLevy,
                    balance: balance,
                    discovery_year: discoveryYear,
                    property: property,
                    address: address,
                    is_paid: isPaid
                });
            }
        });
        
        return records;
    });
};

/**
 * Clicks on a specific row in the grid by row ID
 */
const clickGridRow = async (page, rowId) => {
    try {
        const clicked = await page.evaluate((rowId) => {
            const row = document.querySelector(`#list tbody tr[id="${rowId}"]`);
            if (row) {
                row.click();
                return true;
            }
            return false;
        }, rowId);
        
        if (!clicked) {
            throw new Error(`Could not find row with ID: ${rowId}`);
        }
        
        await delay(3000); // Wait for detail page to load
        
        return true;
        
    } catch (error) {
        console.error(`Error clicking row ${rowId}:`, error.message);
        throw error;
    }
};

/**
 * Scrapes details from the detail page
 */
const scrapeDetailsPage = async (page, record) => {
    try {
        // Wait for the detail page to load
        await page.waitForSelector('fieldset', { timeout: 10000 });
        await delay(2000);
        
        const details = await page.evaluate((record) => {
            const getFieldValue = (labelText) => {
                const labels = document.querySelectorAll('span.label');
                for (const label of labels) {
                    if (label.innerText.trim().toLowerCase().includes(labelText.toLowerCase())) {
                        const valueSpan = label.nextElementSibling;
                        if (valueSpan) {
                            return valueSpan.innerText.trim();
                        }
                    }
                }
                return null;
            };
            
            const cleanCurrency = (value) => {
                if (!value || value === "N/A") return "$0.00";
                const cleaned = value.replace(/,/g, '');
                const num = parseFloat(cleaned.replace(/[^0-9.-]+/g, ""));
                return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };
            
            // Extract owner information (second <li> in first fieldset contains full address)
            let ownerAddress = 'N/A';
            const firstFieldset = document.querySelector('fieldset');
            if (firstFieldset) {
                const addressLi = firstFieldset.querySelectorAll('li')[1];
                if (addressLi) {
                    const span = addressLi.querySelector('span');
                    if (span) {
                        ownerAddress = span.innerHTML
                            .replace(/<br>/g, ' ')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                    }
                }
            }
            
            // Extract property values
            const buildingValue = getFieldValue('Building Value') || '0';
            const outbuildingValue = getFieldValue('Outbuilding Value') || '0';
            const landValue = getFieldValue('Land Value') || '0';
            const parcelValue = getFieldValue('Parcel Value Total') || '0';
            const taxableValue = getFieldValue('Taxable Value') || '0';
            
            // Extract tax information
            const currentBalance = getFieldValue('Current Balance') || '0.00';
            const originalLevy = getFieldValue('Original Levy') || '0.00';
            const personalValue = getFieldValue('Personal Value') || '0';
            const totalValuation = getFieldValue('Total Valuation') || '0';
            const exemption = getFieldValue('Exemption') || '0';
            const lastTransactionDate = getFieldValue('Last Transaction Date') || '';
            const lastPaymentDate = getFieldValue('Last Payment Date') || '';
            
            // Get parcel number and legal description
            const parcelNumber = getFieldValue('Parcel Number') || 'N/A';
            const legalDescription = getFieldValue('Legal Description') || '';
            
            // Extract taxes breakdown from the grid
            const taxesGrid = document.querySelector('#taxdistricts');
            let taxBreakdown = [];
            if (taxesGrid) {
                const taxRows = taxesGrid.querySelectorAll('tbody tr[role="row"]');
                taxRows.forEach(row => {
                    if (row.classList.contains('jqgfirstrow')) return;
                    
                    const cells = row.querySelectorAll('td[role="gridcell"]');
                    if (cells.length >= 7) {
                        taxBreakdown.push({
                            description: cells[0]?.innerText?.trim() || '',
                            levied: cells[1]?.innerText?.trim() || '0.00',
                            interest_fees: cells[2]?.innerText?.trim() || '0.00',
                            released: cells[3]?.innerText?.trim() || '0.00',
                            discount: cells[4]?.innerText?.trim() || '0.00',
                            collected: cells[5]?.innerText?.trim() || '0.00',
                            balance: cells[6]?.innerText?.trim() || '0.00'
                        });
                    }
                });
            }
            
            return {
                owner_address: ownerAddress,
                parcel_number: parcelNumber,
                legal_description: legalDescription,
                building_value: cleanCurrency(buildingValue),
                outbuilding_value: cleanCurrency(outbuildingValue),
                land_value: cleanCurrency(landValue),
                parcel_value_total: cleanCurrency(parcelValue),
                taxable_value: cleanCurrency(taxableValue),
                current_balance: cleanCurrency(currentBalance),
                original_levy: cleanCurrency(originalLevy),
                personal_value: cleanCurrency(personalValue),
                total_valuation: cleanCurrency(totalValuation),
                exemption: cleanCurrency(exemption),
                last_transaction_date: lastTransactionDate,
                last_payment_date: lastPaymentDate,
                tax_breakdown: taxBreakdown
            };
        }, record);
        
        return details;
        
    } catch (error) {
        console.error(`Error extracting details for year ${record.tax_year}:`, error.message);
        return {
            owner_address: "N/A",
            parcel_number: "N/A",
            legal_description: "",
            building_value: "$0.00",
            outbuilding_value: "$0.00",
            land_value: "$0.00",
            parcel_value_total: "$0.00",
            taxable_value: "$0.00",
            current_balance: "$0.00",
            original_levy: "$0.00",
            personal_value: "$0.00",
            total_valuation: "$0.00",
            exemption: "$0.00",
            last_transaction_date: "",
            last_payment_date: "",
            tax_breakdown: []
        };
    }
};

/**
 * Main function to orchestrate the scraping process
 */
const getTaxData = async (page, parcelNumber) => {
    try {
        // Perform search
        await performSearch(page, parcelNumber);
        
        // Scrape grid data
        const allRecords = await scrapeGridData(page);
        
        if (!allRecords || allRecords.length === 0) {
            return handleNotFound(parcelNumber);
        }
        
        // Sort by year descending (newest first)
        allRecords.sort((a, b) => parseInt(b.tax_year) - parseInt(a.tax_year));
        
        const latestRecord = allRecords[0];
        const ownerName = latestRecord.owner_name || "N/A";
        
        let recordsToProcess = [];
        let delinquencyStatus;
        let notes;
        
        const currentDate = new Date();
        const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE 01/05';
        const CITY_TAX_NOTE = 'CITY TAX NEED TO CONFIRM';
        
        // Logic: If latest year is paid, return only that year
        // If latest year is unpaid, go back and collect all unpaid years
        if (latestRecord.is_paid) {
            // Latest year is paid - return only this year
            recordsToProcess = [latestRecord];
            delinquencyStatus = "NONE";
            notes = `ALL PRIORS ARE PAID, ${latestRecord.tax_year} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
        } else {
            // Latest year is unpaid - collect all unpaid years
            for (const record of allRecords) {
                if (!record.is_paid) {
                    recordsToProcess.push(record);
                } else {
                    // Stop when we hit the first paid year
                    break;
                }
            }
            
            const unpaidYears = recordsToProcess.map(r => parseInt(r.tax_year)).sort((a, b) => a - b);
            const latestYear = unpaidYears[unpaidYears.length - 1];
            
            // Check if any unpaid record is past delinquency date
            const isDelinquent = recordsToProcess.some(record => {
                const taxYear = parseInt(record.tax_year);
                const delinquencyDate = new Date(taxYear + 1, 0, 6); // January 6
                return currentDate > delinquencyDate;
            });
            
            delinquencyStatus = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
            
            // Check latest unpaid year status
            const latestYearDueDate = new Date(latestYear + 1, 0, 5);
            const latestYearDelqDate = new Date(latestYear + 1, 0, 6);
            
            let latestYearStatus;
            if (currentDate > latestYearDelqDate) {
                latestYearStatus = "DELINQUENT";
            } else if (currentDate > latestYearDueDate) {
                latestYearStatus = "DUE";
            } else {
                latestYearStatus = "DUE";
            }
            
            if (unpaidYears.length > 1) {
                notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            } else {
                notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            }
        }
        
        let finalTaxHistory = [];
        let propertyDetails = null;
        
        // Process each selected record
        for (let i = 0; i < recordsToProcess.length; i++) {
            const record = recordsToProcess[i];
            
            // Click on the row
            await clickGridRow(page, record.row_id);
            
            // Scrape details
            const taxDetails = await scrapeDetailsPage(page, record);
            
            // Store property details from first record
            if (!propertyDetails) {
                propertyDetails = {
                    owner_address: taxDetails.owner_address,
                    parcel_number: taxDetails.parcel_number,
                    property_address: record.address || "N/A",
                    legal_description: taxDetails.legal_description,
                    building_value: taxDetails.building_value,
                    outbuilding_value: taxDetails.outbuilding_value,
                    land_value: taxDetails.land_value,
                    total_assessed_value: taxDetails.taxable_value,
                    exemption: taxDetails.exemption
                };
            }
            
            // Calculate tax dates
            const taxDates = calculateTaxDates(record.tax_year);
            
            // Determine status
            const taxYear = parseInt(record.tax_year);
            const dueDate = new Date(taxYear + 1, 0, 5);
            const delqDate = new Date(taxYear + 1, 0, 6);
            
            let status;
            if (record.is_paid) {
                status = "Paid";
            } else if (currentDate > delqDate) {
                status = "Delinquent";
            } else if (currentDate > dueDate) {
                status = "Due";
            } else {
                status = "Due";
            }
            
            const taxRecord = {
                jurisdiction: "County",
                year: record.tax_year,
                status: status,
                payment_type: "Annual",
                base_amount: formatCurrency(record.original_levy),
                amount_paid: record.is_paid ? formatCurrency(record.original_levy) : "$0.00",
                amount_due: formatCurrency(record.balance),
                paid_date: taxDetails.last_payment_date || "",
                due_date: taxDates.dueDate,
                delq_date: taxDates.delqDate,
                land_value: taxDetails.land_value,
                building_value: taxDetails.building_value,
                improvements: taxDetails.outbuilding_value,
                total_assessed_value: taxDetails.taxable_value,
                bill_number: record.bill_number,
                tax_breakdown: taxDetails.tax_breakdown
            };
            
            finalTaxHistory.push(taxRecord);
            
            // Navigate back to search results
            await page.goBack();
            await delay(3000);
            
            // Wait for grid to reload
            await page.waitForSelector('#list tbody tr[role="row"]', { timeout: 10000 });
            await delay(2000);
        }
        
        if (finalTaxHistory.length === 0) {
            return handleNotFound(parcelNumber, "Could not process any tax records");
        }
        
        // Sort tax history: unpaid oldest to newest, then paid newest to oldest
        finalTaxHistory.sort((a, b) => {
            const aYear = parseInt(a.year);
            const bYear = parseInt(b.year);
            const aUnpaid = a.status !== "Paid";
            const bUnpaid = b.status !== "Paid";
            
            if (aUnpaid && bUnpaid) {
                return aYear - bYear; // Ascending for unpaid
            } else if (!aUnpaid && !bUnpaid) {
                return bYear - aYear; // Descending for paid
            }
            return aUnpaid ? -1 : 1;
        });
        
        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: [ownerName],
            property_address: propertyDetails?.property_address || "N/A",
            owner_address: propertyDetails?.owner_address || "N/A",
            parcel_number: propertyDetails?.parcel_number || parcelNumber,
            legal_description: propertyDetails?.legal_description || "",
            land_value: propertyDetails?.land_value || "$0.00",
            building_value: propertyDetails?.building_value || "$0.00",
            improvements: propertyDetails?.outbuilding_value || "$0.00",
            total_assessed_value: propertyDetails?.total_assessed_value || "$0.00",
            exemption: propertyDetails?.exemption || "$0.00",
            total_taxable_value: propertyDetails?.total_assessed_value || "$0.00",
            taxing_authority: "Swain County Tax Office, NC",
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
                        if (["font", "image", "media"].includes(reqInt.resourceType())) {
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