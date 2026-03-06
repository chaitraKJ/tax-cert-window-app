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
    taxing_authority: "Catawba County Tax Office, NC",
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
    
    // Catawba County due date: January 5
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
        const searchUrl = 'https://taxbill.catawbacountync.gov/ITSPublicCT/TaxBillSearch';
        
        await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 90000 });
        
        await delay(3000);
        
        // Wait for the parcel number input field (REID field)
        await page.waitForSelector('#LRK', { timeout: 30000 });
        
        // Clear and enter parcel number
        await page.click('#LRK', { clickCount: 3 });
        await page.type('#LRK', parcelNumber, { delay: 100 });
        
        // Trigger the change event to update hidden field
        await page.evaluate(() => {
            const input = document.querySelector('#LRK');
            if (input) {
                const event = new Event('change', { bubbles: true });
                input.dispatchEvent(event);
            }
        });
        
        await delay(1500);
        
        // Verify the hidden field was updated
        const hiddenValue = await page.evaluate(() => {
            return document.querySelector('#ParcelNumber')?.value || '';
        });
        
        // Click submit button (AJAX submission - no navigation)
        await page.click('#tax-bill-search-submit');
        
        // Wait for the loading indicator to disappear or table to appear
        await delay(2000);
        
        // Wait for loading to complete
        try {
            await page.waitForSelector('.page-table-loader.no-disp', { timeout: 10000 });
        } catch (e) {
            // Loading indicator check timed out, continuing...
        }
        
        await delay(3000);
        
        // Wait for table to load - try multiple selectors
        try {
            await page.waitForSelector('#PayTaxBills', { timeout: 20000 });
        } catch (e) {
            const pageContent = await page.content();
            
            // Check if there's a "no results" message
            const noResults = await page.evaluate(() => {
                const body = document.body.innerText;
                return body.includes('No records found') || body.includes('no results') || body.includes('0 records');
            });
            
            if (noResults) {
                throw new Error('No tax records found for this parcel number');
            }
            
            throw e;
        }
        
        // Wait for JavaScript to populate table using PopulateTable function
        await delay(5000);
        
        // Wait for table rows to appear with better detection
        let rowsFound = false;
        for (let i = 0; i < 10; i++) {
            const rowCount = await page.evaluate(() => {
                const rows = document.querySelectorAll('#PayTaxBills tbody tr');
                return rows.length;
            });
            
            if (rowCount > 0) {
                rowsFound = true;
                break;
            }
            
            await delay(1000);
        }
        
        if (!rowsFound) {
            // Try one more check with longer wait
            await page.waitForSelector('#PayTaxBills tbody tr', { timeout: 10000 });
        }
        
        // Wait for JavaScript table population
        await delay(3000);
        
        // Count rows
        const rowCount = await page.evaluate(() => {
            return document.querySelectorAll('#PayTaxBills tbody tr').length;
        });
        
        return true;
        
    } catch (error) {
        console.error('Error in performSearch:', error.message);
        
        // Get current URL for debugging
        try {
            const currentUrl = await page.url();
            console.error('Current URL:', currentUrl);
        } catch (e) {
            // ignore
        }
        
        throw error;
    }
};

/**
 * Scrapes the table to get all tax records
 */
const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        const records = [];
        
        // Get all rows from the table body
        const rows = document.querySelectorAll('#PayTaxBills tbody tr');
        
        rows.forEach((row) => {
            const rowId = row.id; // Format: "YEAR/BILLNUMBER" e.g., "2025/60850"
            if (!rowId) return;
            
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 8) {
                const taxYear = cells[0]?.getAttribute('title') || cells[0]?.innerText?.trim() || "";
                const billNumber = cells[1]?.getAttribute('title') || cells[1]?.innerText?.trim() || "";
                const accountNumber = cells[2]?.getAttribute('title') || cells[2]?.innerText?.trim() || "";
                const ownerName = cells[3]?.getAttribute('title') || cells[3]?.innerText?.trim() || "";
                const description = cells[4]?.getAttribute('title') || cells[4]?.innerText?.trim() || "";
                const originalLevy = cells[5]?.getAttribute('title') || cells[5]?.innerText?.trim() || "";
                const balance = cells[6]?.getAttribute('title') || cells[6]?.innerText?.trim() || "";
                const statusCell = cells[7]?.getAttribute('title') || cells[7]?.innerText?.trim() || "";
                
                // Parse description to extract address and parcel info
                const descLines = description.split('<br>').map(line => line.trim());
                const parcelId = descLines[0] || "";
                const parcelNumber = descLines[1] || "";
                const address = descLines[2] || "";
                const acreage = descLines[3] || "";
                
                // Determine if paid based on balance and status
                const balanceNum = parseFloat(balance.replace(/[^0-9.-]+/g, ""));
                const isPaid = (balanceNum === 0 || isNaN(balanceNum)) || statusCell.toLowerCase().includes('paid');
                
                records.push({
                    row_id: rowId,
                    tax_year: taxYear,
                    bill_number: billNumber,
                    account_number: accountNumber,
                    owner_name: ownerName,
                    description: description,
                    parcel_id: parcelId,
                    parcel_number: parcelNumber,
                    address: address,
                    acreage: acreage,
                    original_levy: originalLevy,
                    balance: balance,
                    status: statusCell,
                    is_paid: isPaid
                });
            }
        });
        
        return records;
    });
};

/**
 * Clicks on a specific row in the table by row ID
 */
const clickTableRow = async (page, rowId) => {
    try {
        
        // Check for and close any overlays/modals that might be blocking clicks
        const overlaysClosed = await page.evaluate(() => {
            // Check for common modal/overlay patterns
            const overlays = document.querySelectorAll('.modal, .overlay, [role="dialog"], .popup');
            let closed = false;
            
            overlays.forEach(overlay => {
                if (overlay.style.display !== 'none') {
                    // Try to find and click close button
                    const closeBtn = overlay.querySelector('.close, .modal-close, [aria-label="Close"]');
                    if (closeBtn) {
                        closeBtn.click();
                        closed = true;
                    } else {
                        // Try to hide it directly
                        overlay.style.display = 'none';
                        closed = true;
                    }
                }
            });
            
            return closed;
        });
        
        if (overlaysClosed) {
            await delay(500);
        }
        
        // Wait for the row to be present and visible
        await page.waitForSelector(`#PayTaxBills tbody tr[id="${rowId}"]`, { timeout: 10000 });
        
        // Check if row is actually visible and clickable
        const rowInfo = await page.evaluate((rowId) => {
            const row = document.querySelector(`#PayTaxBills tbody tr[id="${rowId}"]`);
            if (row) {
                const rect = row.getBoundingClientRect();
                const style = window.getComputedStyle(row);
                return {
                    exists: true,
                    visible: style.display !== 'none' && style.visibility !== 'hidden',
                    inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
                    hasClass: row.className,
                    top: rect.top,
                    height: rect.height
                };
            }
            return { exists: false };
        }, rowId);
        
        if (!rowInfo.exists) {
            throw new Error(`Row ${rowId} does not exist`);
        }
        
        // Scroll the row into view first
        await page.evaluate((rowId) => {
            const row = document.querySelector(`#PayTaxBills tbody tr[id="${rowId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, rowId);
        
        await delay(1000);
        
        // Try multiple click strategies
        let clicked = false;
        
        // Strategy 1: Puppeteer click on row
        try {
            await page.click(`#PayTaxBills tbody tr[id="${rowId}"]`);
            clicked = true;
        } catch (e) {
            // Strategy 1 failed
        }
        
        // Strategy 2: Click first cell in row
        if (!clicked) {
            try {
                await page.click(`#PayTaxBills tbody tr[id="${rowId}"] td:first-child`);
                clicked = true;
            } catch (e) {
                // Strategy 2 failed
            }
        }
        
        // Strategy 3: JavaScript click event with full event simulation
        if (!clicked) {
            clicked = await page.evaluate((rowId) => {
                const row = document.querySelector(`#PayTaxBills tbody tr[id="${rowId}"]`);
                if (row) {
                    // Simulate full click sequence
                    const events = ['mousedown', 'mouseup', 'click'];
                    events.forEach(eventType => {
                        const event = new MouseEvent(eventType, {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            button: 0,
                            buttons: 1
                        });
                        row.dispatchEvent(event);
                    });
                    
                    // Also try jQuery trigger if available
                    if (typeof jQuery !== 'undefined') {
                        jQuery(row).trigger('click');
                    }
                    
                    return true;
                }
                return false;
            }, rowId);
        }
        
        // Strategy 4: Click on the year cell (first column)
        if (!clicked) {
            try {
                const yearCellSelector = `#PayTaxBills tbody tr[id="${rowId}"] td.cell-align-center:first-child`;
                await page.click(yearCellSelector);
                clicked = true;
            } catch (e) {
                // Strategy 4 failed
            }
        }
        
        // Strategy 5: Force click with {force: true} option
        if (!clicked) {
            try {
                await page.evaluate((rowId) => {
                    const row = document.querySelector(`#PayTaxBills tbody tr[id="${rowId}"]`);
                    if (row) {
                        // Force focus and click
                        row.focus();
                        row.click();
                        
                        // Try clicking the first TD as well
                        const firstTd = row.querySelector('td');
                        if (firstTd) {
                            firstTd.click();
                        }
                        return true;
                    }
                    return false;
                }, rowId);
                clicked = true;
            } catch (e) {
                // Strategy 5 failed
            }
        }
        
        if (!clicked) {
            throw new Error(`Could not click row with ID: ${rowId} using any strategy`);
        }
        
        // This is an AJAX load - wait for content to change
        await delay(3000);
        
        // Wait for fieldsets to appear (indicates detail page loaded)
        let detailLoaded = false;
        for (let i = 0; i < 15; i++) {
            const detailInfo = await page.evaluate(() => {
                const fieldsets = document.querySelectorAll('fieldset');
                const results = {
                    fieldsetCount: fieldsets.length,
                    hasContent: false,
                    legends: []
                };
                
                // Check if fieldsets have actual content
                for (const fieldset of fieldsets) {
                    const legend = fieldset.querySelector('legend');
                    if (legend) {
                        const legendText = legend.innerText;
                        results.legends.push(legendText);
                        if (legendText.includes('Taxable Values') || legendText.includes('Balance Info')) {
                            results.hasContent = true;
                        }
                    }
                }
                
                return results;
            });
            
            if (detailInfo.hasContent) {
                detailLoaded = true;
                break;
            }
            
            await delay(1000);
        }
        
        if (!detailLoaded) {
            
            // Log current page state for debugging
            const pageState = await page.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    fieldsets: Array.from(document.querySelectorAll('fieldset')).map(f => ({
                        legend: f.querySelector('legend')?.innerText || 'No legend',
                        itemCount: f.querySelectorAll('li').length
                    }))
                };
            });
        }
        
        await delay(1000);
        
        return true;
        
    } catch (error) {
        console.error(`Error clicking row ${rowId}:`, error.message);
        
        // Take screenshot for debugging
        try {
            const screenshotPath = `/tmp/click-error-${rowId}-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (e) {
            // Could not take screenshot
        }
        
        throw error;
    }
};

/**
 * Scrapes details from the detail page
 */
const scrapeDetailsPage = async (page, record) => {
    try {
        
        // Wait for the detail page to load with increased timeout
        try {
            await page.waitForSelector('fieldset', { timeout: 15000 });
        } catch (e) {
            const hasInfoRows = await page.evaluate(() => {
                return document.querySelectorAll('.info-row-label').length > 0;
            });
            
            if (!hasInfoRows) {
                console.error('No detail page elements found');
                throw new Error('Detail page did not load properly');
            }
        }
        
        await delay(2000);
        
        const details = await page.evaluate((record) => {
            const getFieldValue = (labelText) => {
                const labels = document.querySelectorAll('.info-row-label');
                for (const label of labels) {
                    const labelContent = label.innerText.trim().toLowerCase();
                    if (labelContent.includes(labelText.toLowerCase())) {
                        const valueDiv = label.nextElementSibling;
                        if (valueDiv && valueDiv.classList.contains('info-row-text')) {
                            return valueDiv.innerText.trim();
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
            
            // Extract owner information from the page
            let ownerName = record.owner_name || 'N/A';
            let ownerAddress = 'N/A';
            
            // Try to find owner info section
            const legends = document.querySelectorAll('fieldset legend');
            for (const legend of legends) {
                if (legend.innerText.includes('Owner')) {
                    const ownerFieldset = legend.parentElement;
                    const addressSpan = ownerFieldset.querySelector('li span');
                    if (addressSpan) {
                        ownerAddress = addressSpan.innerHTML
                            .replace(/<br>/g, ' ')
                            .replace(/<br\/>/g, ' ')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                    }
                    break;
                }
            }
            
            // Extract taxable values
            const buildingValue = getFieldValue('Building Value') || '0';
            const outbuildingValue = getFieldValue('Outbuilding Value') || '0';
            const landValue = getFieldValue('Land Value') || '0';
            const parcelValueTotal = getFieldValue('Parcel Value Total') || '0';
            const deferredValue = getFieldValue('Deferred Value') || '0';
            const taxableValue = getFieldValue('Taxable Value') || '0';
            
            // Extract balance information
            const currentBalance = getFieldValue('Current Balance') || '0.00';
            const originalLevy = getFieldValue('Original Levy') || '0.00';
            const personalValue = getFieldValue('Personal Value') || '0';
            const totalValuation = getFieldValue('Total Valuation') || '0';
            const exemption = getFieldValue('Exemption') || '0';
            const netTaxableValuation = getFieldValue('Net Taxable Valuation') || '0';
            const lastTransactionDate = getFieldValue('Last Transaction Date') || '';
            const lastPaymentDate = getFieldValue('Last Payment Date') || '';
            
            // Try to get parcel number from the page if available
            const parcelNumber = getFieldValue('Parcel Number') || getFieldValue('REID') || record.parcel_number || 'N/A';
            const legalDescription = getFieldValue('Legal Description') || '';
            
            return {
                owner_name: ownerName,
                owner_address: ownerAddress,
                parcel_number: parcelNumber,
                legal_description: legalDescription,
                building_value: cleanCurrency(buildingValue),
                outbuilding_value: cleanCurrency(outbuildingValue),
                land_value: cleanCurrency(landValue),
                parcel_value_total: cleanCurrency(parcelValueTotal),
                deferred_value: cleanCurrency(deferredValue),
                taxable_value: cleanCurrency(taxableValue),
                current_balance: cleanCurrency(currentBalance),
                original_levy: cleanCurrency(originalLevy),
                personal_value: cleanCurrency(personalValue),
                total_valuation: cleanCurrency(totalValuation),
                exemption: cleanCurrency(exemption),
                net_taxable_valuation: cleanCurrency(netTaxableValuation),
                last_transaction_date: lastTransactionDate,
                last_payment_date: lastPaymentDate
            };
        }, record);
        
        return details;
        
    } catch (error) {
        console.error(`Error extracting details for year ${record.tax_year}:`, error.message);
        
        // Return default values but with record's known data
        return {
            owner_name: record.owner_name || "N/A",
            owner_address: "N/A",
            parcel_number: record.parcel_number || "N/A",
            legal_description: "",
            building_value: "$0.00",
            outbuilding_value: "$0.00",
            land_value: "$0.00",
            parcel_value_total: "$0.00",
            deferred_value: "$0.00",
            taxable_value: "$0.00",
            current_balance: formatCurrency(record.balance),
            original_levy: formatCurrency(record.original_levy),
            personal_value: "$0.00",
            total_valuation: "$0.00",
            exemption: "$0.00",
            net_taxable_valuation: "$0.00",
            last_transaction_date: "",
            last_payment_date: ""
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
        
        // Scrape table data
        const allRecords = await scrapeTableData(page);
        
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
            
            
            // Verify the table is still visible on the page
            const tableState = await page.evaluate(() => {
                const table = document.querySelector('#PayTaxBills');
                const tbody = document.querySelector('#PayTaxBills tbody');
                const rows = document.querySelectorAll('#PayTaxBills tbody tr');
                
                return {
                    tableExists: !!table,
                    tableVisible: table && table.offsetParent !== null,
                    rowCount: rows.length,
                    tbodyVisible: tbody && tbody.offsetParent !== null
                };
            });
            
            
            if (!tableState.tableVisible) {
                // Table is not visible, but attempting to click row anyway...
            }
            
            // Click on the row
            await clickTableRow(page, record.row_id);
            
            // Scrape details
            const taxDetails = await scrapeDetailsPage(page, record);
            
            // Store property details from first record
            if (!propertyDetails) {
                propertyDetails = {
                    owner_address: taxDetails.owner_address,
                    parcel_number: taxDetails.parcel_number || record.parcel_number,
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
                bill_number: record.bill_number
            };
            
            finalTaxHistory.push(taxRecord);
            
            // NO NEED TO NAVIGATE BACK - table is still visible on the same page!
            // Just add a small delay before clicking the next row
            if (i < recordsToProcess.length - 1) {
                await delay(1500);
            }
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
            taxing_authority: "Catawba County Tax Office, NC",
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
        return res.status(400).send("Parcel number (REID) is required.");
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