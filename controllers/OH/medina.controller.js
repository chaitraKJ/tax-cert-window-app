// Author: Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

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
    taxing_authority: "Medina County Tax Office, Medina, OH 44256",
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

const calculateDelinquentDate = (dueDateStr) => {
    if (!dueDateStr || dueDateStr === "N/A" || dueDateStr === "") return "N/A";
    try {
        const [mm, dd, yyyy] = dueDateStr.split('/');
        const dueDate = new Date(yyyy, mm - 1, dd);
        dueDate.setDate(dueDate.getDate() + 10);
        return `${String(dueDate.getMonth() + 1).padStart(2, '0')}/${String(dueDate.getDate()).padStart(2, '0')}/${dueDate.getFullYear()}`;
    } catch {
        return "N/A";
    }
};

const isDatePassed = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return false;
    try {
        const [mm, dd, yyyy] = dateStr.split('/');
        const date = new Date(yyyy, mm - 1, dd);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return date < today;
    } catch {
        return false;
    }
};

const isBeforeDueDate = (dueDateStr) => {
    if (!dueDateStr || dueDateStr === "N/A") return false;
    try {
        const [mm, dd, yyyy] = dueDateStr.split('/');
        const dueDate = new Date(yyyy, mm - 1, dd);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return today <= dueDate;
    } catch {
        return false;
    }
};

const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://www.medinacountytax.com/taxes.html#/WildfireSearch';
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 90000 });
    await page.waitForSelector('#searchBox', { timeout: 30000 });
    await delay(1000);
    await page.type('#searchBox', parcelNumber);
    await delay(500);
    await page.click('button[type="submit"]');
    
    // Wait for results or no results message
    try {
        await page.waitForSelector('.wildfireResults table, .no-results, .alert-warning', { timeout: 20000 });
    } catch (e) {
        const content = await page.content();
        if (content.includes('No records found') || content.includes('Search returned no results')) {
            // No records found
        } else {
            throw e;
        }
    }
    await delay(2000);
};

const scrapeTableData = async (page) => {
    return await page.evaluate(() => {
        const table = document.querySelector('.wildfireResults table');
        if (!table) return { records: [], owner_name: "" };
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

                if (records.length === 0 && owner) ownerName = owner;

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
        return { records, owner_name: ownerName };
    });
};

const scrapeDetailsPage = async (page) => {
    await page.waitForSelector('.tab-content', { timeout: 15000 });
    const rawDetails = await page.evaluate(() => {
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
        let location = 'N/A', parcelNumber = 'N/A';
        parcelRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = cells[0].textContent.trim().toLowerCase();
                const value = cells[1].textContent.trim();
                if (label.includes('location')) location = value;
                else if (label.includes('parcel number')) parcelNumber = value;
            }
        });

        let taxYear = (new Date().getFullYear() - 1).toString();
        const taxHeader = document.querySelector('.tab-pane.ng-scope h3');
        if (taxHeader) {
            const match = taxHeader.textContent.match(/TAXES FOR .*?(\d{4})/);
            if (match) taxYear = match[1];
        }

        const taxTable = document.querySelector('.infoTable.tableRightAlignInfo');
        const result = {
            property_address: location,
            owner_address: ownerAddress,
            parcel_number: parcelNumber,
            land_value: '$0.00',
            improvements: '$0.00',
            total_assessed_value: '$0.00',
            first_half_tax_raw: 0,
            first_half_paid: '$0.00',
            first_half_balance: '$0.00',
            first_half_due_date: '',
            first_half_special: 0,
            second_half_tax_raw: 0,
            second_half_paid: '$0.00',
            second_half_balance: '$0.00',
            second_half_due_date: '',
            second_half_special: 0,
            after_second_half_paid: '$0.00',
            total_due: '$0.00',
            prior_delinquent: '$0.00',
            prior_delinquent_paid: '$0.00',
            prior_delinquent_temp: null,
            prior_delinquent_paid_temp: null,
            tax_year: taxYear
        };

        if (!taxTable) return result;

        const rows = taxTable.querySelectorAll('tbody tr');
        let currentHalf = null;

        const getCurrency = (td) => {
            if (!td) return '$0.00';
            const text = td.textContent.trim();
            return /^\$?[\d,]+\.\d{2}$/.test(text) ? text : '$0.00';
        };

        const extractDueDate = (td) => {
            if (!td) return '';
            const match = td.innerHTML.match(/Due<br[^>]*>(\d{2}\/\d{2}\/\d{4})/);
            return match ? match[1] : '';
        };

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;

            const col1 = cells[0].textContent.trim();
            const col2 = cells[1].textContent.trim();
            const col3 = cells[2];

            if (col2 === 'Delinquent') {
                result.prior_delinquent_temp = getCurrency(col3);
            }
            else if (col2 === 'Delinquent Paid') {
                const paidAmt = getCurrency(col3);
                result.prior_delinquent_paid_temp = paidAmt;
                
                if (result.prior_delinquent_temp && 
                    parseFloat(result.prior_delinquent_temp.replace(/[^0-9.-]/g, '')) === 
                    parseFloat(paidAmt.replace(/[^0-9.-]/g, ''))) {
                    result.prior_delinquent = '$0.00';
                    result.prior_delinquent_paid = '$0.00';
                } else {
                    result.prior_delinquent = result.prior_delinquent_temp || '$0.00';
                    result.prior_delinquent_paid = paidAmt;
                }
            }

            if (col1 === 'First Half') currentHalf = 'first';
            else if (col1 === 'Second Half') currentHalf = 'second';
            else if (col1 === 'After Second Half') currentHalf = 'after';

            if (col2 === 'Tax' && currentHalf) {
                const num = parseFloat(getCurrency(col3).replace(/[^0-9.-]/g, '')) || 0;
                if (currentHalf === 'first') result.first_half_tax_raw = num;
                else if (currentHalf === 'second') result.second_half_tax_raw = num;
            }

            if (col2 === 'Special Assessment' && currentHalf) {
                const num = parseFloat(getCurrency(col3).replace(/[^0-9.-]/g, '')) || 0;
                if (currentHalf === 'first') result.first_half_special += num;
                else if (currentHalf === 'second') result.second_half_special += num;
            }

            if (col2 === 'Paid' && currentHalf) {
                const paid = getCurrency(col3);
                if (currentHalf === 'first') result.first_half_paid = paid;
                else if (currentHalf === 'second') result.second_half_paid = paid;
                else if (currentHalf === 'after') result.after_second_half_paid = paid;
            }

            if (col2 === 'Balance' && cells[1].style.fontWeight === 'bold') {
                const balance = getCurrency(col3);
                if (currentHalf === 'first') result.first_half_balance = balance;
                else if (currentHalf === 'second') result.second_half_balance = balance;
            }

            if (cells[0].innerHTML.includes('Due<br') && extractDueDate(cells[0])) {
                const dueDate = extractDueDate(cells[0]);
                if (currentHalf === 'first') result.first_half_due_date = dueDate;
                else if (currentHalf === 'second') result.second_half_due_date = dueDate;
            }

            if (col1 === 'Total Due') {
                const bold = cells[1].querySelector('b');
                result.total_due = bold ? bold.textContent.trim() : getCurrency(cells[2]);
            }
        });

        const valueRows = document.querySelectorAll('.infoTable tr');
        valueRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const label = cells[0]?.textContent.trim().toLowerCase() || '';
                if (label === 'land') result.land_value = getCurrency(cells[1]);
                else if (label === 'improvement') result.improvements = getCurrency(cells[1]);
                else if (label === 'total') result.total_assessed_value = getCurrency(cells[2]);
            }
        });

        return result;
    });

    rawDetails.first_half_tax = formatCurrency((rawDetails.first_half_tax_raw + rawDetails.first_half_special).toFixed(2));
    rawDetails.second_half_tax = formatCurrency((rawDetails.second_half_tax_raw + rawDetails.second_half_special).toFixed(2));
    delete rawDetails.prior_delinquent_temp;
    delete rawDetails.prior_delinquent_paid_temp;
    return rawDetails;
};

const scrapePaymentHistory = async (page) => {
    try {
        const clicked = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('a[uib-tab-heading-transclude]'));
            const paymentTab = tabs.find(tab => {
                const text = tab.textContent.toLowerCase();
                return text.includes('payment history') || text.includes('pay history');
            });
            if (paymentTab) {
                paymentTab.click();
                return true;
            }
            return false;
        });

        if (!clicked) {
            const tabs = await page.$$('a[uib-tab-heading-transclude]');
            if (tabs.length > 1) {
                await tabs[1].click(); // Usually the second tab
            } else {
                return [];
            }
        }

        await delay(2000);
        await page.waitForSelector('table.table.text-center', { timeout: 10000 });
        return await page.evaluate(() => {
            const table = document.querySelector('table.table.text-center');
            if (!table) return [];
            const rows = table.querySelectorAll('tbody tr[ng-repeat]');
            const payments = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 7) return;

                const priorAmount = parseFloat(cells[2].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
                const firstHalfAmount = parseFloat(cells[3].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
                const secondHalfAmount = parseFloat(cells[4].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
                const surplusAmount = parseFloat(cells[5].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

                payments.push({
                    payment_date: cells[0]?.textContent?.trim() || '',
                    half_designation: cells[1]?.textContent?.trim() || '',
                    receipt_number: cells[6]?.textContent?.trim() || 'N/A',
                    prior_amount: priorAmount,
                    first_half_amount: firstHalfAmount,
                    second_half_amount: secondHalfAmount,
                    surplus_amount: surplusAmount,
                    total_paid_in_row: priorAmount + firstHalfAmount + secondHalfAmount + surplusAmount
                });
            });
            return payments;
        });
    } catch (e) {
        console.error(`Error scraping payment history: ${e.message}`);
        return [];
    }
};

export const search = async (req, res) => {
    const { account, clientName, client, fetch_type } = req.body;
    const parcelNumber = account;
    const clientType = client || clientName || 'others';

    if (!parcelNumber) {
        return res.status(400).json({ error: "Parcel number is required" });
    }

    let browser;
    try {
        browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
            } else {
                reqInt.continue();
            }
        });

        await performSearch(page, parcelNumber);
  
        const { records } = await scrapeTableData(page);
        if (records.length === 0) {
            const data = handleNotFound(parcelNumber);
            await context.close();
            return fetch_type === "html" ? res.status(200).render("parcel_data_official", data) : res.status(200).json({ result: data });
        }
  
        // Navigate to details page
        const detailLinkSelector = '.wildfireResults table tbody tr a, .wildfireResults table a, .btnView';
        try {
            // Try to find any link in the results table first
            await page.waitForSelector('.wildfireResults table', { timeout: 10000 });
            const clicked = await page.evaluate(() => {
                const table = document.querySelector('.wildfireResults table');
                if (!table) return false;
                // Try specific row link first, then any link in table
                const link = table.querySelector('tbody tr a') || 
                             table.querySelector('a') ||
                             document.querySelector('.btnView');
                if (link) {
                    link.click();
                    return true;
                }
                return false;
            });
  
            if (!clicked) {
                await page.waitForSelector(detailLinkSelector, { timeout: 10000 });
                await page.click(detailLinkSelector);
            }
        } catch (e) {
            console.error(`Navigation to details failed: ${e.message}`);
            // Last resort: try clicking the first available link that looks like a property link
            const lastResort = await page.evaluate(() => {
                const allLinks = Array.from(document.querySelectorAll('a'));
                const propertyLink = allLinks.find(a => 
                    a.innerText.match(/\d{2}-\d{2}-\d{2}/) || // Parcel pattern
                    a.innerText.match(/[A-Z0-9]{5,}/) ||       // Account pattern
                    a.href.includes('Details')
                );
                if (propertyLink) {
                    propertyLink.click();
                    return true;
                }
                return false;
            });
            if (!lastResort) throw e;
        }
        await delay(6000);

        // Get available years from tabs
        let availableYears = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('#taxBill-tabs ul.nav-tabs li a'));
            return tabs.map(tab => {
                const yearMatch = tab.textContent.match(/\d{4}/);
                return yearMatch ? { year: yearMatch[0], id: tab.getAttribute('id') } : null;
            }).filter(y => y !== null);
        });

        if (availableYears.length === 0) {
            const currentYear = await page.evaluate(() => {
                const taxHeader = document.querySelector('.tab-pane.ng-scope h3') || document.querySelector('h3');
                const match = taxHeader ? taxHeader.textContent.match(/TAXES FOR .*?(\d{4})/) : null;
                return match ? match[1] : new Date().getFullYear().toString();
            });
            availableYears = [{ year: currentYear, id: null }];
        }

        const taxHistory = [];
        const normalizedClientType = (clientType || 'default').toLowerCase().trim();
        const yearsRequired = getOHCompanyYears(normalizedClientType);

        // Process each year
        for (let i = 0; i < Math.min(availableYears.length, yearsRequired); i++) {
            const yearInfo = availableYears[i];
            
            // Switch to year tab if not already on it
            if (i > 0) {
                await page.click(`#${yearInfo.id}`);
                await delay(2000);
            }

            const taxDetails = await scrapeDetailsPage(page);
            const paymentHistory = await scrapePaymentHistory(page);
            
            // Re-click the Tax Bill tab to ensure we're back on the data view if payment history switched it
            await page.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll('a[uib-tab-heading-transclude]'));
                const taxBillTab = tabs.find(tab => tab.textContent.toLowerCase().includes('tax bill'));
                if (taxBillTab) taxBillTab.click();
            });
            await delay(1500);

            const currentTaxYear = taxDetails.tax_year;
            const yearSuffix = currentTaxYear.slice(2);

            const priorDelinquentValue = parseFloat((taxDetails.prior_delinquent || '0').replace(/[^0-9.-]/g, "")) || 0;
            const priorDelinquentPaidValue = parseFloat((taxDetails.prior_delinquent_paid || '0').replace(/[^0-9.-]/g, "")) || 0;
            const priorUnpaid = priorDelinquentValue - priorDelinquentPaidValue;

            if (i === 0 && priorDelinquentValue > 0.01) {
                taxHistory.push({
                    jurisdiction: "County",
                    year: "Prior",
                    status: priorUnpaid > 0.01 ? "Delinquent" : "Paid",
                    payment_type: "Annual",
                    half_designation: "Prior Year",
                    base_amount: formatCurrency(priorDelinquentValue.toString()),
                    amount_paid: formatCurrency(priorDelinquentPaidValue.toString()),
                    amount_due: formatCurrency(priorUnpaid.toString()),
                    paid_date: "N/A",
                    due_date: taxDetails.first_half_due_date || "N/A",
                    delq_date: calculateDelinquentDate(taxDetails.first_half_due_date),
                    land_value: taxDetails.land_value,
                    improvements: taxDetails.improvements,
                    total_assessed_value: taxDetails.total_assessed_value,
                    receipt_number: "N/A"
                });
            }

            const firstHalfTaxRaw = taxDetails.first_half_tax_raw || 0;
            const firstHalfSpecial = taxDetails.first_half_special || 0;
            const firstHalfBaseAmount = firstHalfTaxRaw + firstHalfSpecial;
            const firstHalfPaidValue = parseFloat((taxDetails.first_half_paid || '0').replace(/[^0-9.-]/g, "")) || 0;
            const firstHalfDue = Math.max(0, firstHalfBaseAmount - firstHalfPaidValue);

            const secondHalfTaxRaw = taxDetails.second_half_tax_raw || 0;
            const secondHalfSpecial = taxDetails.second_half_special || 0;
            const secondHalfBaseAmount = secondHalfTaxRaw + secondHalfSpecial;
            const secondHalfPaidValue = parseFloat((taxDetails.second_half_paid || '0').replace(/[^0-9.-]/g, "")) || 0;
            const secondHalfDue = Math.max(0, secondHalfBaseAmount - secondHalfPaidValue);

            const firstHalfDelqDate = calculateDelinquentDate(taxDetails.first_half_due_date);
            const secondHalfDelqDate = calculateDelinquentDate(taxDetails.second_half_due_date);

            const getPaymentStatus = (balance, dueDate, delqDate) => {
                if (balance <= 0.01) return "Paid";
                if (isBeforeDueDate(dueDate)) return "Due";
                if (delqDate && delqDate !== "N/A" && isDatePassed(delqDate)) return "Delinquent";
                return "Unpaid";
            };

            const firstHalfStatus = getPaymentStatus(firstHalfDue, taxDetails.first_half_due_date, firstHalfDelqDate);
            const secondHalfStatus = getPaymentStatus(secondHalfDue, taxDetails.second_half_due_date, secondHalfDelqDate);

            const currentYearPayments = paymentHistory.filter(p => {
                const designation = p.half_designation.trim();
                return designation.includes(`-${yearSuffix}`) || 
                       designation.includes(` ${currentTaxYear}`) || 
                       designation.includes(`-${currentTaxYear}`);
            });
            const firstHalfPayment = currentYearPayments.find(p => p.first_half_amount > 0);
            const secondHalfPayment = currentYearPayments.find(p => p.second_half_amount > 0);

            const bothPaid = firstHalfStatus === "Paid" && secondHalfStatus === "Paid";
            let paymentType = "SEMI-ANNUAL";

            if (bothPaid && firstHalfBaseAmount > 0 && secondHalfBaseAmount > 0) {
                const rowWithBothAmounts = currentYearPayments.find(p => p.first_half_amount > 0 && p.second_half_amount > 0);
                if (rowWithBothAmounts || (firstHalfPayment && secondHalfPayment && firstHalfPayment.payment_date === secondHalfPayment.payment_date)) {
                    paymentType = "ANNUAL";
                }
            }

            if (paymentType === "ANNUAL") {
                const totalBase = firstHalfBaseAmount + secondHalfBaseAmount;
                const totalPaid = firstHalfPaidValue + secondHalfPaidValue;
                const totalDue = Math.max(0, totalBase - totalPaid);
                const annualStatus = (firstHalfStatus === "Delinquent" || secondHalfStatus === "Delinquent") ? "Delinquent" : 
                                   (totalDue > 0.01 ? (isBeforeDueDate(taxDetails.first_half_due_date) ? "Due" : "Unpaid") : "Paid");

                taxHistory.push({
                    jurisdiction: "County",
                    year: currentTaxYear,
                    status: annualStatus,
                    payment_type: "Annual",
                    half_designation: "Full Year",
                    base_amount: formatCurrency(totalBase.toString()),
                    amount_paid: formatCurrency(totalPaid.toString()),
                    amount_due: formatCurrency(totalDue.toString()),
                    paid_date: firstHalfPayment?.payment_date || secondHalfPayment?.payment_date || "N/A",
                    due_date: taxDetails.first_half_due_date || "N/A",
                    delq_date: firstHalfDelqDate,
                    land_value: taxDetails.land_value,
                    improvements: taxDetails.improvements,
                    total_assessed_value: taxDetails.total_assessed_value,
                    receipt_number: firstHalfPayment?.receipt_number || secondHalfPayment?.receipt_number || "N/A"
                });
            } else {
                if (firstHalfBaseAmount > 0) {
                    taxHistory.push({
                        jurisdiction: "County",
                        year: currentTaxYear,
                        status: firstHalfStatus,
                        payment_type: "Semi-Annual",
                        half_designation: "1st Half",
                        base_amount: formatCurrency(firstHalfBaseAmount.toString()),
                        amount_paid: formatCurrency(firstHalfPaidValue.toString()),
                        amount_due: formatCurrency(firstHalfDue.toString()),
                        paid_date: firstHalfPayment?.payment_date || "N/A",
                        due_date: taxDetails.first_half_due_date || "N/A",
                        delq_date: firstHalfDelqDate,
                        land_value: taxDetails.land_value,
                        improvements: taxDetails.improvements,
                        total_assessed_value: taxDetails.total_assessed_value,
                        receipt_number: firstHalfPayment?.receipt_number || "N/A"
                    });
                }
                if (secondHalfBaseAmount > 0) {
                    taxHistory.push({
                        jurisdiction: "County",
                        year: currentTaxYear,
                        status: secondHalfStatus,
                        payment_type: "Semi-Annual",
                        half_designation: "2nd Half",
                        base_amount: formatCurrency(secondHalfBaseAmount.toString()),
                        amount_paid: formatCurrency(secondHalfPaidValue.toString()),
                        amount_due: formatCurrency(secondHalfDue.toString()),
                        paid_date: secondHalfPayment?.payment_date || "N/A",
                        due_date: taxDetails.second_half_due_date || "N/A",
                        delq_date: secondHalfDelqDate,
                        land_value: taxDetails.land_value,
                        improvements: taxDetails.improvements,
                        total_assessed_value: taxDetails.total_assessed_value,
                        receipt_number: secondHalfPayment?.receipt_number || "N/A"
                    });
                }
            }
        }

        taxHistory.sort((a, b) => {
            if (a.year === "Prior") return 1;
            if (b.year === "Prior") return -1;
            const yearDiff = parseInt(b.year) - parseInt(a.year);
            if (yearDiff !== 0) return yearDiff;
            // Within same year, put Full Year or 1st Half first
            const order = { "Full Year": 1, "1st Half": 2, "2nd Half": 3, "Prior Year": 4 };
            return (order[a.half_designation] || 99) - (order[b.half_designation] || 99);
        });

        const firstYearDetails = await scrapeDetailsPage(page); 
        
        // Generate Notes
        let notes = "";
        const latestYearEntry = taxHistory.find(h => h.year !== "Prior");
        const priorEntry = taxHistory.find(h => h.year === "Prior");
        const isPriorsDelinquent = priorEntry && priorEntry.status === "Delinquent";
        
        let priorNote = "";
        if (isPriorsDelinquent) {
            priorNote = "PRIORS ARE DELINQUENT";
        } else if (normalizedClientType.includes('accurate')) {
            priorNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE";
        } else {
            priorNote = "ALL PRIORS ARE PAID";
        }

        if (latestYearEntry) {
            const year = latestYearEntry.year;
            const status = latestYearEntry.status.toUpperCase();
            const payType = latestYearEntry.payment_type.toUpperCase();
            
            if (payType === "ANNUAL") {
                notes = `${priorNote}, ${year} TAXES ARE ${status}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY,NORMAL DUE DATES ARE 02/14 and 01/11`;
            } else {
                const firstHalf = taxHistory.find(h => h.year === year && h.half_designation === "1st Half");
                const secondHalf = taxHistory.find(h => h.year === year && h.half_designation === "2nd Half");
                const firstStatus = firstHalf ? firstHalf.status.toUpperCase() : "N/A";
                const secondStatus = secondHalf ? secondHalf.status.toUpperCase() : "N/A";
                notes = `${priorNote}, ${year} TAXES ARE ${status}, 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY,NORMAL DUE DATES ARE 02/14 and 01/11`;
            }
        } else {
            notes = priorNote;
        }

        const finalData = {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: [records[0].owner_name],
            property_address: firstYearDetails.property_address || "N/A",
            owner_address: firstYearDetails.owner_address || "N/A",
            parcel_number: firstYearDetails.parcel_number || parcelNumber,
            land_value: firstYearDetails.land_value || "$0.00",
            improvements: firstYearDetails.improvements || "$0.00",
            total_assessed_value: firstYearDetails.total_assessed_value || "$0.00",
            exemption: "$0.00",
            total_taxable_value: firstYearDetails.total_assessed_value || "$0.00",
            taxing_authority: "Medina County Tax Office, Medina, OH 44256",
            notes: notes.toUpperCase().trim(),
            delinquent: taxHistory.some(item => item.status === "Delinquent") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
            tax_history: taxHistory
        };

        await context.close();
        return fetch_type === "html" ? res.status(200).render("parcel_data_official", finalData) : res.status(200).json({ result: finalData });

    } catch (error) {
        console.error("Medina search error:", error);
        if (browser) await browser.close();
        return res.status(500).json({ error: true, message: error.message });
    }
};