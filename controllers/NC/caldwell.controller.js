// Author Nithyananda R S 
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
    taxing_authority: "Caldwell County Tax Office, Lenoir, NC",
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

// New helper: always format paid date as MM/DD/YYYY with leading zeros
const formatPaidDate = (dateStr) => {
    if (!dateStr || dateStr.trim() === '') return "";
    
    // Handle common formats: M/D/YY, MM/DD/YYYY, M/D/YYYY, etc.
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return dateStr; // fallback if not date-like

    let [month, day, year] = parts.map(p => p.trim());

    // Handle 2-digit year (assume 20xx if < 50, else 19xx — adjust as needed)
    if (year.length === 2) {
        const yy = parseInt(year, 10);
        year = yy >= 0 && yy <= 50 ? `20${year.padStart(2, '0')}` : `19${year.padStart(2, '0')}`;
    }

    // Pad month and day with leading zero
    month = month.padStart(2, '0');
    day   = day.padStart(2, '0');

    return `${month}/${day}/${year}`;
};

const calculateTaxDates = (taxYear) => {
    const year = parseInt(taxYear);
    const dueDateObj = new Date(year + 1, 8, 1); // January 5 next year
    const delqDateObj = new Date(year + 1, 8, 2); // January 6 next year
    
    const formatDate = (date) => {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}/${day}/${date.getFullYear()}`;
    };
    
    return { 
        dueDate: formatDate(dueDateObj), 
        delqDate: formatDate(delqDateObj)
    };
};

const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://www.caldwellcountynctax.com/taxes.html#/WildfireSearch';
    
    const currentUrl = page.url();
    if (!currentUrl.includes('#/WildfireSearch')) {
        try {
            await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
        } catch {
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        }
    }
    
    const searchBoxSelector = '#searchBox';
    await page.waitForSelector(searchBoxSelector, { timeout: 20000 });
    
    await page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, searchBoxSelector);
    
    await page.type(searchBoxSelector, parcelNumber, { delay: 50 });
    
    const searchButton = 'button[type="submit"]';
    if (await page.$(searchButton)) {
        await page.click(searchButton);
    } else {
        await page.keyboard.press('Enter');
    }
    
    try {
        await delay(600);

        await page.waitForFunction(() => {
            const spinner = document.querySelector('.fa-spin, .wildfireLoading, [ng-show="loading"]');
            return !spinner || getComputedStyle(spinner).display === 'none' || !spinner.offsetParent;
        }, { timeout: 35000, polling: 400 });

        const resultType = await page.evaluate(() => {
            const tableRow = document.querySelector('table.searchResults tbody tr.ng-scope');
            const noResults = document.querySelector('.no-results, .alert-info, .alert-danger, [ng-if*="No results"], .wildfireResults:empty');
            
            if (tableRow) return 'table';
            if (noResults && noResults.offsetParent !== null) return 'no-results';
            return 'unknown';
        });

        if (resultType === 'no-results') {
            throw new Error('No records found message appeared after search completed');
        }

        if (resultType !== 'table') {
            await page.waitForSelector('table.searchResults tbody tr', { timeout: 8000 });
        }

        await delay(800);
        return 'table';

    } catch (error) {
        console.warn('[performSearch] Wait error:', error.message);
        throw new Error(`Search results did not load properly: ${error.message}`);
    }
};

const scrapeTableData = async (page) => {
    return page.evaluate(() => {
        const table = document.querySelector('table.searchResults') || 
                      document.querySelector('table[ng-repeat*="result.Records"]') ||
                      document.querySelector('table.table');

        if (!table) {
            return { records: [], owner_name: "" };
        }
        
        // More robust row selection
        const rows = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
        const records = [];
        let ownerName = "";
        
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
                const year = cells[1]?.innerText?.trim() || "";
                const billNumber = cells[2]?.innerText?.trim() || "";
                
                // Skip rows that don't have a valid 4-digit year or missing bill number
                if (!/^\d{4}$/.test(year) || !billNumber) {
                    return;
                }

                const ownerCell = cells[0];
                let owner = ownerCell.innerText.trim() || "";
                const type = cells[4]?.innerText?.trim() || "";
                const paidDateRaw = cells[6]?.innerText?.trim() || "";
                const statusCell = cells[cells.length - 1]; 

                let status = "Unpaid";
                let isPaid = false;
                let isTaxOnSale = false;
                let isNullaBona = false;

                const cellText = statusCell?.innerText?.trim().toLowerCase() || '';
                
                // If there's a paid date, it's likely paid
                const hasPaidDate = paidDateRaw && paidDateRaw.includes('/');

                if ((cellText.includes('paid') && !cellText.includes('unpaid')) || hasPaidDate) {
                    status = 'Paid';
                    isPaid = true;
                } else if (cellText.includes('unpaid')) {
                    status = 'Unpaid';
                    isPaid = false;
                } else if (cellText.includes('sale')) {
                    status = 'Tax Sale';
                    isTaxOnSale = true;
                    isPaid = false;
                } else if (cellText.includes('nulla')) {
                    status = 'Nulla Bona';
                    isNullaBona = true;
                    isPaid = false;
                } else if (cellText.includes('due') || cellText.includes('delinq')) {
                    status = cellText.includes('delinq') ? 'Delinquent' : 'Due';
                    isPaid = false;
                } else {
                    // Default to unpaid if we can't determine, but only if it looks like a real tax row
                    status = "Unpaid";
                    isPaid = false;
                }

                // Use the new formatter (defined outside evaluate)
                // Note: since evaluate runs in browser, we pass the function logic inline
                let paidDate = "";
                if (paidDateRaw) {
                    const parts = paidDateRaw.split('/');
                    if (parts.length === 3) {
                        let [m, d, y] = parts.map(p => p.trim());
                        if (y.length === 2) {
                            const yy = parseInt(y, 10);
                            y = yy <= 50 ? `20${y.padStart(2,'0')}` : `19${y.padStart(2,'0')}`;
                        }
                        paidDate = `${m.padStart(2,'0')}/${d.padStart(2,'0')}/${y}`;
                    } else {
                        paidDate = paidDateRaw;
                    }
                }

                if (records.length === 0 && owner) {
                    ownerName = owner;
                }
                
                records.push({
                    owner_name: owner,
                    year,
                    bill_number: billNumber,
                    type,
                    is_paid: isPaid,
                    is_tax_on_sale: isTaxOnSale,
                    is_nulla_bona: isNullaBona,
                    status,
                    paid_date: paidDate
                });
            }
        });

        return { records, owner_name: ownerName };
    });
};

const scrapeDetailsPage = async (page, record) => {
    try {
        await page.waitForSelector('.tab-content, .infoTable', { timeout: 30000 });
        await delay(1200);
        
        const details = await page.evaluate((record) => {
            const container = document.querySelector('.tab-content') || document.querySelector('body');
            
            const getText = (label) => {
                const rows = container.querySelectorAll('table.infoTable tr');
                for (const row of rows) {
                    const lbl = row.querySelector('td:first-child')?.innerText?.trim().toLowerCase();
                    if (lbl && lbl.includes(label.toLowerCase())) {
                        let val = row.querySelector('td:last-child')?.innerText?.trim();
                        if (label.toLowerCase().includes('balance due') || label.toLowerCase().includes('total balance')) {
                            val = row.querySelector('b')?.innerText?.trim() || val;
                        }
                        return val || null;
                    }
                }
                return null;
            };

            const clean = (v) => {
                if (!v) return "$0.00";
                const n = parseFloat(v.replace(/[^0-9.-]+/g,''));
                return isNaN(n) ? "$0.00" : `$${n.toLocaleString('en-US',{minimumFractionDigits:2})}`;
            };

            // Format paid date from detail page if needed (fallback)
            let paidDateFromDetail = getText('Date Paid') || '';
            if (paidDateFromDetail) {
                const parts = paidDateFromDetail.split('/');
                if (parts.length === 3) {
                    let [m, d, y] = parts.map(p => p.trim());
                    if (y.length === 2) {
                        const yy = parseInt(y, 10);
                        y = yy <= 50 ? `20${y.padStart(2,'0')}` : `19${y.padStart(2,'0')}`;
                    }
                    paidDateFromDetail = `${m.padStart(2,'0')}/${d.padStart(2,'0')}/${y}`;
                }
            }

            let ownerAddr = 'N/A';
            const ownerBlock = container.querySelector('.col-md-4.section:first-child');
            if (ownerBlock) {
                ownerAddr = ownerBlock.innerText.replace(/Owner Information/i,'').trim().replace(/\s{2,}/g,' ');
            }

            const totalValue = getText('Total Value') || getText('Real Value') || '0';

            const current = new Date();
            const y = parseInt(record.year);
            const due = new Date(y, 8, 1);
            const delq = new Date(y + 1, 0, 6);

            const dueText = getText('Total Balance Due') || getText('Balance Due') || '0';
            const dueNum = parseFloat(dueText.replace(/[^0-9.-]+/g,'')) || 0;
            const hasDue = dueNum > 0;

            let stat = 'Unpaid';
            if (record.is_tax_on_sale || record.is_nulla_bona) {
                stat = "Delinquent";
            } else if (!hasDue) {
                stat = "Paid";
            } else if (current > delq) {
                stat = "Delinquent";
            } else {
                stat = "Due";
            }

            return {
                property_address: getText('Description') || 'N/A',
                owner_address: ownerAddr,
                parcel_number: getText('Map Number') || 'N/A',
                land_value: "$0.00",
                improvements: "$0.00",
                total_assessed_value: clean(totalValue),
                base_amount: clean(getText('Base Tax')),
                total_due: clean(dueText),
                amount_paid: clean(getText('Paid Amount')),
                due_date: getText('Due Date') || 'N/A',
                receipt_number: getText('Bill Number') || 'N/A',
                status: stat,
                paid_date_detail: paidDateFromDetail  // optional: for cross-check
            };
        }, record);
        
        return details;
    } catch (e) {
        console.warn('Details extraction error:', e.message);
        return {
            property_address: "N/A", owner_address: "N/A", parcel_number: "N/A",
            land_value: "$0.00", improvements: "$0.00", total_assessed_value: "$0.00",
            base_amount: "$0.00", total_due: "$0.00", amount_paid: "$0.00",
            due_date: "N/A", receipt_number: "N/A", status: "N/A",
            paid_date_detail: ""
        };
    }
};

const getTaxData = async (page, parcelNumber) => {
    try {
        await performSearch(page, parcelNumber);
        
        const searchResults = await scrapeTableData(page);

        if (!searchResults.records?.length) {
            return handleNotFound(parcelNumber);
        }

        let allRecords = searchResults.records;

        // Sort newest to oldest
        allRecords.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        const unpaid = allRecords.filter(r => r.status !== "Paid");
        const paid   = allRecords.filter(r => r.status === "Paid");

        let toProcess = [];
        let delqStatus = "NONE";
        let notes = "";
        let propDetails = null;

        const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE 01/05';
        const CITY_TAX_NOTE = 'CITY TAX NEED TO CONFIRM';

        if (unpaid.length > 0) {
            // ONLY process unpaid years if they exist
            toProcess = unpaid;
            
            const years = unpaid.map(r => parseInt(r.year)).sort((a,b)=>a-b);
            const latest = years[years.length - 1];

            const isDelq = unpaid.some(r => {
                const y = parseInt(r.year);
                return new Date() > new Date(y + 1, 0, 6) || r.is_tax_on_sale || r.is_nulla_bona;
            });

            delqStatus = isDelq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            const latestStatus = new Date() > new Date(latest + 1, 0, 6) ? "DELINQUENT" : "DUE";

            if (unpaid.length > 1) {
                notes = `PRIORS ARE DELINQUENT, ${latest} TAXES ARE ${latestStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            } else {
                notes = `ALL PRIORS ARE PAID, ${latest} TAXES ARE ${latestStatus}, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
            }
        } 
        else if (paid.length > 0) {
            // ONLY process the latest paid year if no unpaid records exist
            toProcess = [paid[0]]; 
            
            const latest = parseInt(paid[0].year);
            notes = `ALL PRIORS ARE PAID, ${latest} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}, ${CITY_TAX_NOTE}`;
        }

        let history = [];
        const normalize = s => (s || '').replace(/[^a-z0-9]/gi,'').toLowerCase();
        const targetNorm = normalize(parcelNumber);

        for (let i = 0; i < toProcess.length; i++) {
            const r = toProcess[i];

            const btnSel = await page.evaluate((bill, yr) => {
                // More robust row selection in detail click logic
                const rows = Array.from(document.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
                for (let j = 0; j < rows.length; j++) {
                    const cells = rows[j].querySelectorAll('td');
                    const rowYear = cells[1]?.innerText?.trim() || "";
                    const rowBill = cells[2]?.innerText?.trim() || "";
                    
                    if (rowYear === yr && (rowBill === bill || bill === "" || !bill)) {
                        const btn = rows[j].querySelector('button.btnView, button[ng-click*="view"], a.btnView, .btn-primary');
                        if (btn) {
                            btn.classList.add(`temp-click-${j}-${yr}`);
                            return `.temp-click-${j}-${yr}`;
                        }
                    }
                }
                return null;
            }, r.bill_number, r.year);

            if (!btnSel) {
                console.warn(`No view button for ${r.bill_number} / ${r.year}`);
                continue;
            }

            await page.click(btnSel);
            
            // Wait for detail page to load
            try {
                await page.waitForSelector('.tab-content, .infoTable', { timeout: 15000 });
            } catch (err) {
                console.warn(`Detail page did not load for ${r.year}:`, err.message);
                // Try one more time or go back
                await page.goBack().catch(() => {});
                await delay(1000);
                continue;
            }

            await delay(800);
            const det = await scrapeDetailsPage(page, r);

            const pNorm = normalize(det.parcel_number);
            if (targetNorm && pNorm && pNorm !== targetNorm) {
                await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const back = links.find(a => a.innerText.includes('Back to Search')) || 
                                 document.querySelector('a[href="#/WildfireSearch"], .goBack a');
                    if (back) back.click();
                }).catch(() => page.goBack());
                await page.waitForSelector('table.searchResults', {timeout: 12000}).catch(() => {});
                continue;
            }

            if (!propDetails && det.property_address !== "N/A") {
                propDetails = {
                    property_address: det.property_address,
                    owner_address: det.owner_address,
                    parcel_number: det.parcel_number,
                    land_value: det.land_value,
                    improvements: det.improvements,
                    total_assessed_value: det.total_assessed_value
                };
            }

            const dates = calculateTaxDates(r.year);

            history.push({
                jurisdiction: "County",
                year: r.year,
                status: det.status,
                payment_type: "Annual",
                base_amount: det.base_amount,
                amount_paid: det.amount_paid,
                amount_due: det.status === "Paid" ? "$0.00" : det.total_due,
                paid_date: r.paid_date || det.paid_date_detail || "",  // prefer table date, fallback to detail
                due_date: dates.dueDate,
                delq_date: dates.delqDate,
                land_value: propDetails?.land_value || "$0.00",
                improvements: propDetails?.improvements || "$0.00",
                total_assessed_value: propDetails?.total_assessed_value || "$0.00",
                receipt_number: det.receipt_number
            });

            if (i < toProcess.length - 1) {
                const backClicked = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const b = links.find(a => a.innerText.toLowerCase().includes('back to search')) || 
                              document.querySelector('a[href="#/WildfireSearch"], .goBack a, button.btn-link');
                    if (b) { b.click(); return true; }
                    return false;
                });

                if (!backClicked) {
                    await page.goBack().catch(() => {});
                }

                try {
                    await page.waitForSelector('table.searchResults tbody tr', { timeout: 15000 });
                    await delay(1000); // Give it a moment to settle
                } catch (err) {
                    console.warn(`[getTaxData] Table did not reappear after back, re-searching...`);
                    await performSearch(page, parcelNumber);
                }
            }
        }

        if (!history.length) {
            return handleNotFound(parcelNumber, "No valid tax records processed");
        }

        // Final sort: newest years first, unpaid years prioritized at the top
        history.sort((a, b) => {
            const ya = parseInt(a.year), yb = parseInt(b.year);
            const aUnpaid = a.status !== "Paid";
            const bUnpaid = b.status !== "Paid";

            if (aUnpaid && !bUnpaid) return -1;
            if (!aUnpaid && bUnpaid) return 1;
            
            // If both are same status, newest year first
            return yb - ya;
        });

        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: searchResults.owner_name ? [searchResults.owner_name] : ["N/A"],
            property_address: propDetails?.property_address || "N/A",
            owner_address: propDetails?.owner_address || "N/A",
            parcel_number: propDetails?.parcel_number || parcelNumber,
            land_value: propDetails?.land_value || "$0.00",
            improvements: propDetails?.improvements || "$0.00",
            total_assessed_value: propDetails?.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: propDetails?.total_assessed_value || "$0.00",
            taxing_authority: "Caldwell County Tax Office, Lenoir, NC",
            notes,
            delinquent: delqStatus,
            tax_history: history
        };
    } catch (err) {
        console.warn("getTaxData error:", err);
        return handleNotFound(parcelNumber, err.message);
    }
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;
    
    if (!fetch_type || !["html","api"].includes(fetch_type)) {
        return res.status(400).send("Invalid fetch_type. Use 'html' or 'api'");
    }
    if (!account) {
        return res.status(400).send("account (parcel number) is required");
    }

    let ctx = null;
    getBrowserInstance()
        .then(b => b.createBrowserContext())
        .then(c => {
            ctx = c;
            return c.newPage();
        })
        .then(p => {
            p.setDefaultNavigationTimeout(90000);
            p.setRequestInterception(true).then(() => {
                p.on('request', req => {
                    if (['stylesheet','font','image','media'].includes(req.resourceType())) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
            });
            return getTaxData(p, account);
        })
        .then(data => {
            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
            } else {
                res.status(200).json({ result: data });
            }
        })
        .catch(err => {
            const msg = err.message || "Scraping failed";
            console.warn("Controller error:", msg, err);
            if (fetch_type === "html") {
                res.status(500).render('error_data', { error: true, message: msg });
            } else {
                res.status(500).json({ error: true, message: msg });
            }
        })
        .finally(() => {
            if (ctx) ctx.close().catch(console.warn);
        });
};

export { search };
