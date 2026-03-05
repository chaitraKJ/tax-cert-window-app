//AUTHOR:DHANUSH
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    if (today >= delq_date) {
        return true;
    }
    return false;
}

const formatCurrency = (value) => {
    if (!value) return "$0.00";
    const num = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // SEARCH PAGE
            const url = `https://apps.sarpy.gov/CaptureCZ/CAPortal/CAMA/CAPortal/CZ_MainPage.aspx`;
            const status = await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector('iframe#Iframe1', timeout_option);
            const iframeElement = await page.$('iframe#Iframe1');
            const frame = await iframeElement.contentFrame();

            // FILL THE INPUT FIELD
            await frame.waitForSelector('input[name="ParcelSearchText"]', timeout_option);
            await delay(5000);

            await frame.click('input[name="ParcelSearchText"]', { clickCount: 3 });
            await frame.type('input[name="ParcelSearchText"]', account);

            // CLICK THE SEARCH BUTTON AND WAIT FOR NAVIGATION
            Promise.all([
                frame.click('input[name="Search"]'),
                frame.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeout_option.timeout })
            ])
            .then(async () => {
                await delay(5000);

                const recordsFound = await frame.evaluate(() => {
                    const el = document.querySelector('#TotalRecFound');
                    return el ? el.textContent.trim() : '1 Record Found';
                });

                if (!recordsFound.includes('1 Record Found')) {
                    reject(new Error("No Record Found"));
                } else {
                    resolve(true);
                }
            })
            .catch((error) => {
                console.log(error);
                reject(new Error(error.message));
            });

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};
const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Wait for iframe
            const iframeElement = await page.waitForSelector('iframe#Iframe1', { timeout: 30000 });
            const frame = await iframeElement.contentFrame();

            // Wait for the first result row
            await frame.waitForSelector('#GridView1_RowId_0', { timeout: 30000 });

            const searchData = await frame.evaluate(() => {
                const result = {
                    owner_name: ["N/A"],
                    property_address: "",
                    clicked: false
                };

                const gridRow = document.querySelector('#GridView1_RowId_0');
                if (!gridRow) return result;

                // Get ALL rows in the result block (the parent tbody or container)
                const allRows = gridRow.parentElement.querySelectorAll('tr');

                let ownerText = "";
                let propText = "N/A";

                allRows.forEach(row => {
                    const cells = row.querySelectorAll('td');

                    // Look for OWNER NAME in second column (label column)
                    if (cells[1] && cells[1].textContent.trim().includes("OWNER NAME:")) {
                        if (cells[2]) {
                            ownerText = cells[2].textContent.trim();
                        }
                    }

                    // Look for PROP ADDRESS
                    if (cells[1] && cells[1].textContent.trim().includes("PROP ADDRESS:")) {
                        if (cells[2]) {
                            propText = cells[2].textContent.trim();
                        }
                    }
                });

                // Clean owner name
                if (ownerText) {
                    ownerText = ownerText
                        .replace(/<br>/gi, ' ') 
                        .replace(/&amp;/g, '&')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // Split by / or &
                    result.owner_name = ownerText
                        .split(/\s*[\/&]\s*/)
                        .map(part => part.trim())
                        .filter(part => part && !/^\$|VALUE|ADDRESS|AC|CLASS|MUNICIPALITY|TAX/i.test(part));
                }

                // Clean property address (remove &nbsp; and extra spaces)
                if (propText) {
                    result.property_address = propText
                        .replace(/&nbsp;/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                // Click the detail link - usually in the first cell of the first row
                const detailLink = gridRow.querySelector('td:first-child span[onclick*="GoToInfoPage"]') ||
                    gridRow.querySelector('span[onclick*="GoToInfoPage"]');

                if (detailLink) {
                    detailLink.click();
                    result.clicked = true;
                }

                return result;
            });

            if (!searchData.clicked) {
                return reject(new Error("Failed to find or click detail link"));
            }

            // Wait a bit for the detail page to load inside iframe
            await delay(6000);

            resolve(searchData);

        } catch (error) {
            console.error("Error in ac_2:", error);
            reject(error);
        }
    });
};

const ac_3 = async (page, account, searchData) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Wait for main iframe
            const mainIframe = await page.waitForSelector('iframe#Iframe1', { timeout: 20000 });
            const mainFrame = await mainIframe.contentFrame();

            // Wait for nested iframe (this is the actual detail content)
            await mainFrame.waitForSelector('iframe#Iframe1', { timeout: 30000 });
            const nestedIframe = await mainFrame.$('iframe#Iframe1');
            const dataFrame = await nestedIframe.contentFrame();

            // Wait for content to load
            await dataFrame.waitForSelector('table', { timeout: 15000 });

            const page_data = await dataFrame.evaluate((parcel, incomingData) => {
                const datum = {
                    processed_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                    order_number: "",
                    borrower_name: "",
                    owner_name: incomingData.owner_name || [],          
                    property_address: incomingData.property_address || "N/A", 
                    parcel_number: parcel,
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "Sarpy County Treasurer, 1210 Golden Gate Dr, Papillion, NE 68046",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                const clean = (t) => t?.replace(/\s+/g, ' ').trim() || "";

                // Helper to extract dollar amounts
                const extractDollar = (text) => {
                    const match = text.match(/\$[\d,]+(\.\d{2})?/);
                    return match ? match[0] : "";
                };

                // Scan all tables and rows for valuation data
                document.querySelectorAll('table').forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 2) return;

                        const labelCell = cells[0];
                        const valueCell = cells[1];

                        const label = clean(labelCell.textContent).toLowerCase();
                        const value = clean(valueCell.textContent);

                        // Land Value
                        if (label.includes('land') && label.includes('value') && !label.includes('total')) {
                            datum.land_value = extractDollar(value) || extractDollar(labelCell.nextElementSibling?.textContent || "");
                        }

                        // Improvements
                        if (label.includes('imp') || label.includes('improvement')) {
                            datum.improvements = extractDollar(value);
                        }

                        // Total Assessed Value
                        if (label.includes('total') && (label.includes('value') || label.includes('assessed'))) {
                            datum.total_assessed_value = extractDollar(value);
                            datum.total_taxable_value = extractDollar(value);
                        }

                        // Exemption or Taxable Value
                        if (label.includes('exemption')) {
                            datum.exemption = extractDollar(value);
                        }

                    });
                });

                // Fallback: if total_taxable_value is empty, use total_assessed_value
                if (!datum.total_taxable_value || datum.total_taxable_value === "$0.00") {
                    datum.total_taxable_value = datum.total_assessed_value;
                }


                return datum;
            }, account, searchData); // Pass account (parcel) and searchData into evaluate

            resolve(page_data);

        } catch (error) {
            console.error("Error in ac_3:", error);
            reject(new Error("Failed to extract data from detail page: " + error.message));
        }
    });
};
const ac_4 = async (page, data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // TAX HISTORY PAGE
            const mainIframe = await page.$('iframe#Iframe1');
            if (!mainIframe) throw new Error("Main iframe missing");

            const mainFrame = await mainIframe.contentFrame();
            if (!mainFrame) throw new Error("Main frame empty");

            await mainFrame.waitForSelector('iframe#Iframe1', { timeout: 40000 });
            const nestedIframe = await mainFrame.$('iframe#Iframe1');
            if (!nestedIframe) throw new Error("Nested iframe not found");

            const dataFrame = await nestedIframe.contentFrame();
            if (!dataFrame) throw new Error("Nested iframe content failed to load");

            await delay(5000);

            const tax_history = await dataFrame.evaluate(() => {
                const history = [];
                
                const taxTable = Array.from(document.querySelectorAll('table')).find(table => {
                    const text = table.textContent.toLowerCase();
                    return text.includes('year') && 
                           text.includes('taxes due') && 
                           text.includes('balance');
                });

                if (!taxTable) return history;

                const rows = taxTable.querySelectorAll('tr');

                const formatMoney = (val) => {
                    if (!val) return "$0.00";
                    const cleanVal = val.toString().replace(/[^0-9.]/g, '');
                    const num = parseFloat(cleanVal);
                    if (isNaN(num)) return "$0.00";
                    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };

                // HARDCODED DUE AND DELINQUENCY DATES
                const getDueDate = (year, installment) => {
                    const paymentYear = parseInt(year) + 1;
                    return installment === "1" ? `03/31/${paymentYear}` : `07/31/${paymentYear}`;
                };

                const getDelqDate = (year, installment) => {
                    const paymentYear = parseInt(year) + 1;
                    return installment === "1" ? `04/01/${paymentYear}` : `08/01/${paymentYear}`;
                };

                // START FROM ROW 1 TO SKIP HEADER
                for (let i = 1; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll('td');
                    if (cells.length < 7) continue;

                    const year = cells[0].textContent.trim();
                    const statementLink = cells[1].querySelector('a');
                    const taxesDue = cells[4].textContent.trim();
                    const balance = cells[6].textContent.trim();
                    const installmentsCell = cells[7];
                    
                    if (!year || year === 'Year') continue;
                    
                    const installmentsHTML = installmentsCell ? installmentsCell.innerHTML : '';
                    const installmentLines = installmentsHTML.split(/<br\s*\/?>/i).filter(line => line.trim());
                    
                    const totalDue = parseFloat(taxesDue.replace(/[^0-9.]/g, '')) || 0;
                    const halfAmount = (totalDue / 2).toFixed(2);
                    
                    let hasInstallments = false;
                    
                    // PARSE INSTALLMENT DATA
                    installmentLines.forEach(line => {
                        const match = line.match(/(\d+):\s*(?:<input[^>]*(?:checked[^>]*)?>?)?\s*DUE\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*:\s*\$?([\d,]+\.?\d*)/i);
                        
                        if (!match) return;
                        
                        hasInstallments = true;
                        const installmentNum = match[1];
                        const amount = parseFloat(match[3].replace(/,/g, ''));
                        
                        const isPaid = /checked/i.test(line);
                        
                        const dueDateHardcoded = getDueDate(year, installmentNum);
                        const delqDateHardcoded = getDelqDate(year, installmentNum);
                        
                        history.push({
                            jurisdiction: "Sarpy County",
                            year: year,
                            payment_type: "Semi-Annual",
                            status: isPaid ? "Paid" : "Due",
                            base_amount: formatMoney(halfAmount),
                            amount_paid: isPaid ? formatMoney(halfAmount) : "$0.00",
                            amount_due: isPaid ? "$0.00" : formatMoney(amount),
                            mailing_date: "N/A",
                            due_date: dueDateHardcoded,   
                            delq_date: delqDateHardcoded,                      
                            paid_date: "-",
                            statement_link: statementLink ? statementLink.getAttribute('onclick') : "",
                            installment: installmentNum
                        });
                    });
                    
                    // IF NO INSTALLMENTS, TREAT AS ANNUAL
                    if (!hasInstallments) {
                        const balanceNum = parseFloat(balance.replace(/[^0-9.]/g, '')) || 0;
                        const isFullyPaid = balanceNum === 0;
                        
                        const dueDateAnnual = getDueDate(year, "1");
                        const delqDateAnnual = getDelqDate(year, "1");
                        
                        history.push({
                            jurisdiction: "Sarpy County",
                            year: year,
                            payment_type: "Annual",
                            status: isFullyPaid ? "Paid" : "Due",
                            base_amount: formatMoney(totalDue),
                            amount_paid: isFullyPaid ? formatMoney(totalDue) : "$0.00",
                            amount_due: isFullyPaid ? "$0.00" : formatMoney(balanceNum),
                            mailing_date: "N/A",
                            due_date: dueDateAnnual,
                            delq_date: delqDateAnnual,
                            paid_date: "-",
                            statement_link: statementLink ? statementLink.getAttribute('onclick') : ""
                        });
                    }
                }

                // SORT OLDEST TO NEWEST
                return history.sort((a, b) => {
                    const yearDiff = parseInt(a.year) - parseInt(b.year);
                    if (yearDiff !== 0) return yearDiff;
                    if (a.installment && b.installment) {
                        return parseInt(a.installment) - parseInt(b.installment);
                    }
                    return 0;
                });
            });

            // UPDATE STATUS TO DELINQUENT IF PAST DELQ DATE
            const currentDate = new Date();
            tax_history.forEach(h => {
                if (h.status === "Due") {
                    if (is_delq(h.delq_date)) {
                        h.status = "Delinquent";
                    }
                }
            });

            // GET LATEST YEAR
            const latestYear = tax_history.length > 0 ? tax_history[tax_history.length - 1].year : new Date().getFullYear().toString();

            // FILTER: LATEST YEAR + PRIOR YEARS WITH DUE > 0
            data.tax_history = tax_history.filter(h => {
                if (h.year === latestYear) return true;
                const amountDue = parseFloat(h.amount_due.replace(/[^\d.]/g, '') || '0');
                return amountDue > 0;
            });

            // CHECK DELINQUENCY STATUS
            const hasDelinquent = data.tax_history.some(h => h.status === "Delinquent");
            
            data.delinquent = hasDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            resolve(data);

        } catch (err) {
            console.log(err);
            data.tax_history = [];
            data.delinquent = "ERROR READING TAX HISTORY";
            data.notes = "";
            reject(err);
        }
    });
};

const ac_5 = async (page, data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // FETCH PAYMENT DATES AND GENERATE NOTES
            const mainIframe = await page.$('iframe#Iframe1');
            const mainFrame = await mainIframe.contentFrame();
            const nestedIframe = await mainFrame.$('iframe#Iframe1');
            const dataFrame = await nestedIframe.contentFrame();

            const latestYear = data.tax_history.length > 0 ? data.tax_history[data.tax_history.length - 1].year : new Date().getFullYear().toString();

            // FETCH PAYMENT DATES FOR PAID TAXES
            for (let i = 0; i < data.tax_history.length; i++) {
                const taxEntry = data.tax_history[i];
                
                if (taxEntry.status === "Paid" && taxEntry.statement_link) {
                    try {
                        const invoiceMatch = taxEntry.statement_link.match(/OnOpenInvoice\('(\d+)'\)/);
                        if (!invoiceMatch) continue;
                        
                        const invoiceId = invoiceMatch[1];
                        
                        await dataFrame.evaluate((invId) => {
                            const link = document.querySelector(`a[onclick*="OnOpenInvoice('${invId}')"]`);
                            if (link) link.click();
                        }, invoiceId);
                        
                        await delay(8000);
                        
                        const paymentDate = await dataFrame.evaluate((installmentNum) => {
                            const paymentTable = document.querySelector('#GridView1');
                            if (!paymentTable) return "";
                            
                            const rows = paymentTable.querySelectorAll('tr.GridCellBorders');
                            for (const row of rows) {
                                const cells = row.querySelectorAll('td');
                                if (cells.length < 3) continue;
                                
                                const codeCell = cells[1];
                                const dateCell = cells[2];
                                const codeTitle = codeCell.getAttribute('title') || "";
                                
                                if ((installmentNum === "1" && codeTitle.includes("FIRST HALF")) ||
                                    (installmentNum === "2" && codeTitle.includes("SECOND HALF"))) {
                                    return dateCell.textContent.trim();
                                }
                            }
                            return "";
                        }, taxEntry.installment);
                        
                        if (paymentDate) {
                            data.tax_history[i].paid_date = paymentDate;
                        }
                        
                        await dataFrame.evaluate(() => {
                            const backBtn = document.querySelector('input[name="BackBtn"]');
                            if (backBtn) backBtn.click();
                        });
                        
                        await delay(5000);
                        
                    } catch (err) {
                        console.log(`Error fetching payment date for ${taxEntry.year}: ${err.message}`);
                        continue;
                    }
                }
            }

            // GENERATE NOTES
            if (data.tax_history.length > 0) {
                let notesParts = [];
                
                const priorYearUnpaid = data.tax_history.filter(h => h.year !== latestYear && parseFloat(h.amount_due.replace(/[^\d.]/g, '')) > 0);
                
                if (priorYearUnpaid.length > 0) {
                    notesParts.push("PRIOR YEARS ARE DELINQUENT");
                } else {
                    notesParts.push("ALL PRIOR YEARS ARE PAID");
                }
                
                const latestEntries = data.tax_history.filter(h => h.year === latestYear);
                if (latestEntries.length === 2) {
                    const first = latestEntries.find(h => h.installment === "1");
                    const second = latestEntries.find(h => h.installment === "2");
                    notesParts.push(`${latestYear} 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
                } else if (latestEntries.length === 1) {
                    notesParts.push(`${latestYear} TAXES ARE ${latestEntries[0].status.toUpperCase()}`);
                }

                notesParts.push("NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 03/31 AND 07/31");
                data.notes = notesParts.join(", ");
            }

            // FORMAT CURRENCY VALUES
            data.land_value = formatCurrency(data.land_value);
            data.improvements = formatCurrency(data.improvements);
            data.total_assessed_value = formatCurrency(data.total_assessed_value);
            data.exemption = formatCurrency(data.exemption);
            data.total_taxable_value = formatCurrency(data.total_taxable_value);

            resolve(data);

        } catch (err) {
            console.log(err);
            reject(err);
        }
    });
};

const account_search = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, account)
            .then((data) => {

                ac_2(page, account)
                .then((searchData) => {

                    ac_3(page, account, searchData)
                    .then((data2) => {

                        ac_4(page, data2, account)
                        .then((data3) => {

                            ac_5(page, data3, account)
                            .then((data4) => {
                                resolve(data4);
                            })
                            .catch((error) => {
                                console.log(error);
                                reject(error);
                            })

                        })
                        .catch((error) => {
                            console.log(error);
                            reject(error);
                        })

                    })
                    .catch((error) => {
                        console.log(error);
                        reject(error);
                    })

                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                })

            })
            .catch((error) => {
                console.log(error);
                reject(error);
            })

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!account || account.trim() === '') {
			return res.status(200).render("error_data", {
				error: true,
				message: "Enter the Account Number..."
			});
		}

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account)
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
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
            .then((data) => {
                res.status(200).json({
                    result: data
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(500).json({
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
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

export { search };
