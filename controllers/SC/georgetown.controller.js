//Author Nithyananda R S 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

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
    taxing_authority: "Georgetown County Tax Office",
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

const calculateTaxDates = (taxYear) => {
    const year = parseInt(taxYear);
    const dueYear = year + 1;
    
    const dueDate = new Date(dueYear, 0, 15);
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

const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://georgetowncountysctax.com/update.html#/WildfireSearch';
    
    // Clean parcel number - remove all special characters except dots
    const cleanedParcelNumber = parcelNumber.replace(/[^a-zA-Z0-9.]/g, '');
    
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 90000 });
    await delay(3000);
    
    try {
        await page.waitForSelector('#searchBox, input[type="text"], input.form-control', { timeout: 30000 });
    } catch (err) {
        // Continue anyway
    }
    
    await delay(2000);
    await page.type('#searchBox', cleanedParcelNumber);
    await delay(1500);
    await page.click('button[type="submit"]');
    await delay(2000);
    
    let resultsLoaded = false;
    const maxAttempts = 10;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const hasResults = await page.evaluate(() => {
            const wildfireDiv = document.querySelector('.wildfireResults');
            const table = document.querySelector('.wildfireResults table.table');
            const rows = document.querySelectorAll('.wildfireResults tbody tr[ng-repeat], .wildfireResults tbody tr[data-btn-view-record]');
            const noResults = document.querySelector('.no-results, .alert');
            
            return {
                hasDiv: !!wildfireDiv,
                hasTable: !!table,
                rowCount: rows.length,
                hasNoResults: !!noResults
            };
        });
        
        if (hasResults.rowCount > 0 || hasResults.hasNoResults) {
            resultsLoaded = true;
            break;
        }
        
        await delay(2000);
    }
    
    await delay(3000);
};

const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        const table = document.querySelector('.wildfireResults table.table');
        
        if (!table) {
            return { records: [], owner_name: "" };
        }
        
        const rows = table.querySelectorAll('tbody tr[ng-repeat], tbody tr[data-btn-view-record]');
        const records = [];
        let ownerName = "";
        
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 7) {
                const owner = cells[0]?.innerText?.trim() || "";
                const year = cells[1]?.innerText?.trim() || "";
                
                let receipt = "";
                const receiptCell = cells[2];
                if (receiptCell) {
                    receipt = receiptCell.innerText?.trim() || "";
                }
                
                const type = cells[4]?.innerText?.trim() || "";
                const paidCell = cells[5];
                
                let status = "Unpaid";
                let isTaxOnSale = false;
                let isNullaBona = false;
                let isRefund = false;
                
                if (paidCell) {
                    if (paidCell.classList.contains('Paid')) {
                        status = 'Paid';
                    } else if (paidCell.classList.contains('Unpaid')) {
                        status = 'Unpaid';
                    } else {
                        const cellText = paidCell.innerText?.trim().toLowerCase() || '';
                        if (cellText.includes('paid') && !cellText.includes('unpaid')) {
                            status = 'Paid';
                        } else if (cellText.includes('refund')) {
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
                }
                
                if (isRefund) {
                    return;
                }
                
                const paidDate = cells[6]?.innerText?.trim() || "";

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
        await page.waitForSelector('.tab-pane.ng-scope.active, .tab-content', { timeout: 15000 });
        await delay(2000);

        const details = await page.evaluate((record) => {
            const detailContainer = document.querySelector('.tab-content');

            if (!detailContainer) {
                return null;
            }

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

            const ownerInfoDiv = detailContainer.querySelector('div.col-md-4.section.ng-binding');
            let ownerAddress = 'N/A';
            if (ownerInfoDiv) {
                const lines = ownerInfoDiv.innerText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                if (lines.length > 2) {
                    ownerAddress = lines.slice(2).join(' ').replace(/\s{2,}/g, ' ').trim();
                }
            }

            // Extract property address from the Address row
            let propertyAddress = 'N/A';
            const addressRow = Array.from(detailContainer.querySelectorAll('tr')).find(tr => {
                const firstTd = tr.querySelector('td:first-child');
                return firstTd && firstTd.innerText.trim().toLowerCase() === 'address';
            });
            
            if (addressRow) {
                const addressCell = addressRow.querySelector('td:last-child');
                if (addressCell) {
                    // Look for the visible span (ng-hide class means it's hidden)
                    const visibleSpan = addressCell.querySelector('span:not(.ng-hide)');
                    if (visibleSpan) {
                        propertyAddress = visibleSpan.innerText.trim();
                    }
                }
            }

            const propertyTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Property Information')?.parentNode.querySelector('table');
            const parcelNumber = propertyTable ? getTextByLabel('Parcel Number', propertyTable) : 'N/A';
            const assessedValue = propertyTable ? getTextByLabel('Assessed Value', propertyTable) : 'N/A';
            const appraisedValue = propertyTable ? getTextByLabel('Appraised Value', propertyTable) : 'N/A';

            const billTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Bill Information')?.parentNode.querySelector('table');
            const dueDateStr = billTable ? getTextByLabel('Due Date', billTable) : 'N/A';

            const taxesTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Taxes')?.parentNode.querySelector('table');
            const baseTaxes = taxesTable ? getTextByLabel('Base Taxes', taxesTable) : 'N/A';
            const totalDue = taxesTable ? (taxesTable.querySelector('td b')?.innerText.trim() || 'N/A') : 'N/A';
            
            const paymentTable = Array.from(detailContainer.querySelectorAll('h4')).find(h4 => h4.innerText.trim() === 'Payment Information')?.parentNode.querySelector('table');
            const amountPaid = paymentTable ? getTextByLabel('Amount Paid', paymentTable) : 'N/A';
            const paymentStatus = paymentTable ? getTextByLabel('Status', paymentTable) : 'N/A';
            
            const currentDate = new Date();
            const taxYear = parseInt(record.year);
            const dueDate = new Date(taxYear + 1, 0, 15);
            const delinquencyDate = new Date(taxYear + 1, 0, 16);
            
            let status;
            if (record.is_tax_on_sale || record.is_nulla_bona) {
                status = "Delinquent";
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
        
        if (!details) {
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
        
        return details;
    } catch (error) {
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

const getTaxData = async (page, parcelNumber) => {
    try {
        await performSearch(page, parcelNumber);
        const searchResults = await scrapeTableData(page);

        if (!searchResults.records || searchResults.records.length === 0) {
            return handleNotFound(parcelNumber);
        }

        const allRecords = searchResults.records;
        
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
            recordsToProcess = unpaidRecords;
            
            const unpaidYears = unpaidRecords.map(r => parseInt(r.year)).sort((a, b) => a - b);
            const latestYear = unpaidYears[unpaidYears.length - 1];
            
            const isDelinquent = unpaidRecords.some(record => {
                const taxYear = parseInt(record.year);
                const delinquencyDate = new Date(taxYear + 1, 0, 16);
                return currentDate > delinquencyDate || record.is_tax_on_sale || record.is_nulla_bona;
            });
            
            delinquencyStatus = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

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
            const sortedPaidRecords = paidRecords.sort((a, b) => parseInt(b.year) - parseInt(a.year));
            recordsToProcess = [sortedPaidRecords[0]];
            delinquencyStatus = "NONE";

            const latestYear = parseInt(sortedPaidRecords[0].year);
            notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
        }
        
        let finalTaxHistory = [];
        
        for (let i = 0; i < recordsToProcess.length; i++) {
            const record = recordsToProcess[i];
            
            const clickSuccess = await page.evaluate((recordData) => {
                const table = document.querySelector('.wildfireResults table.table');
                if (!table) {
                    return false;
                }
                
                const rows = table.querySelectorAll('tbody tr[ng-repeat], tbody tr[data-btn-view-record]');
                
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length < 3) continue;
                    
                    const year = cells[1]?.innerText?.trim() || '';
                    const receipt = cells[2]?.innerText?.trim() || '';
                    
                    if (year === recordData.year && receipt === recordData.receipt) {
                        const viewButton = row.querySelector('button.btnView');
                        
                        if (viewButton) {
                            viewButton.click();
                            return true;
                        } else {
                            const allButtons = row.querySelectorAll('button');
                            if (allButtons.length > 0) {
                                allButtons[allButtons.length - 1].click();
                                return true;
                            }
                            return false;
                        }
                    }
                }
                
                return false;
            }, { year: record.year, receipt: record.receipt });
            
            if (!clickSuccess) {
                continue;
            }
            
            await delay(4000);
            
            const taxDetails = await scrapeDetailsPage(page, record);
            
            if (!propertyDetails) {
                propertyDetails = {
                    property_address: taxDetails.property_address,
                    owner_address: taxDetails.owner_address,
                    parcel_number: taxDetails.parcel_number,
                    total_assessed_value: formatCurrency(taxDetails.assessed_value),
                    total_taxable_value: formatCurrency(taxDetails.assessed_value)
                };
            }
            
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
            
            if (i < recordsToProcess.length - 1) {
                await page.click('a[href="#/WildfireSearch"]');
                await page.waitForSelector('.wildfireResults table.table tbody tr', { timeout: 15000 });
                await delay(3000);
            }
        }
        
        if (finalTaxHistory.length === 0) {
            return handleNotFound(parcelNumber, "Could not extract tax details from any records");
        }
        
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
            land_value: "N/A",
            improvements: "N/A",
            total_assessed_value: propertyDetails?.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: propertyDetails?.total_taxable_value || "$0.00",
            taxing_authority: "Georgetown County Tax Office",
            notes: notes,
            delinquent: delinquencyStatus,
            tax_history: finalTaxHistory
        };
    } catch (error) {
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
