//Nithyananda R S 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const formatCurrency = (str) => {
    return str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const formatDate = (month, day, year) => {
    const date = new Date(year, month - 1, day);
    const isValidDate = date && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValidDate) {
        throw new Error(`Invalid date: ${month}/${day}/${year}`);
    }
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

const getCurrentTaxYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
};

const calculateDueDates = (year = getCurrentTaxYear(), county = 'Morrow') => {
    try {
        const taxYear = parseInt(year);
        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
            throw new Error('Invalid tax year');
        }
        // Due dates are in the NEXT year (taxYear + 1)
        const nextYear = taxYear + 1;
        const countyDueDates = {
            'Morrow': {
                firstHalf: {
                    dueDate: formatDate(11, 2, nextYear),
                    delqDate: formatDate(11, 3, nextYear),
                    period: 'First Half'
                },
                secondHalf: {
                    dueDate: formatDate(11, 7, nextYear),
                    delqDate: formatDate(11, 8, nextYear),
                    period: 'Second Half'
                },
                defaultPaymentType: 'Semi-Annual'
            }
        };
        if (!countyDueDates[county]) {
            throw new Error(`Unknown county: ${county}`);
        }
        const result = countyDueDates[county];
        result.taxYear = taxYear;
        result.displayYear = `${taxYear}`;
        result.formattedDueDates = `${result.firstHalf.dueDate.split('/').slice(0, 2).join('/')} & ${result.secondHalf.dueDate.split('/').slice(0, 2).join('/')}`;
        const now = new Date();
        const firstDueDate = new Date(result.firstHalf.dueDate);
        const secondDueDate = new Date(result.secondHalf.dueDate);
        result.currentPeriod = now < firstDueDate ? 'First Half' :
            now < secondDueDate ? 'Second Half' : 'Past Due';
        return result;
    } catch (error) {
        console.error('Error in calculateDueDates:', error);
        throw error;
    }
};

const getPaymentStatus = async (page, account) => {
    const url = `https://auditor.co.morrow.oh.us/Parcel?Parcel=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const pageContentExists = await page.$('.parcel');
    if (!pageContentExists) {
        return "NOT_FOUND";
    }
    try {
        await page.waitForSelector('table[title*="Tax Table"]', { timeout: 5000 });
    } catch (error) {
        return "NO_TAX_HISTORY";
    }
    return page.evaluate(() => {
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));
        if (!taxTables || taxTables.length === 0) return "NO_TAX_HISTORY";
        const mostRecentTaxTable = taxTables[0];
        const owedRow = Array.from(mostRecentTaxTable.querySelectorAll('tr')).find(row => {
            const firstCell = row.querySelector('td');
            return firstCell && firstCell.textContent.trim() === 'Owed';
        });
        if (!owedRow) return "NO_TAX_HISTORY";
        const cells = owedRow.querySelectorAll('td');
        if (cells.length < 5) return "UNPAID";
        const firstHalfOwed = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        const secondHalfOwed = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        if (firstHalfOwed === 0 && secondHalfOwed === 0) {
            return "PAID";
        } else {
            return "UNPAID";
        }
    });
};

const getParcelData = async (page, account) => {
    const pageData = await page.evaluate(() => {
        const datum = {
            processed_date: new Date().toISOString().split("T")[0],
            owner_name: [],
            property_address: "",
            parcel_number: "",
            land_value: "N/A",
            improvements: "N/A",
            total_assessed_value: "N/A",
            exemption: "N/A",
            total_taxable_value: "N/A",
            taxing_authority: "Morrow County Treasurer, 48 E High St, Mount Gilead, OH 43338, Ph: 419-947-5010",
            notes: "",
            delinquent: "",
            tax_history: []
        };
        const locationTable = document.querySelector('#Location table');
        if (locationTable) {
            const rows = locationTable.querySelectorAll('tr');
            rows.forEach(row => {
                const titleCell = row.querySelector('.tableTitle');
                const valueCell = row.querySelector('.TableValue');
                if (titleCell && valueCell) {
                    const titleText = titleCell.textContent.trim();
                    if (titleText.includes('Owner')) {
                        datum.owner_name[0] = valueCell.textContent.trim();
                    } else if (titleText.includes('Address')) {
                        const address = valueCell.textContent.split('<div')[0].trim();
                        datum.property_address = address;
                    }
                }
            });
        }
        const valuationTable = document.querySelector('table[title="Valuation"]');
        if (valuationTable) {
            const dataRow = valuationTable.querySelector('tbody tr') ||
                valuationTable.querySelectorAll('tr')[2];
            if (dataRow) {
                const cells = dataRow.querySelectorAll('td, th');
                if (cells.length >= 7) {
                    datum.land_value = cells[1]?.textContent.trim() || "N/A";
                    datum.improvements = cells[2]?.textContent.trim() || "N/A";
                    datum.total_assessed_value = cells[6]?.textContent.trim() || "N/A";
                    datum.total_taxable_value = datum.total_assessed_value;
                }
            }
        }
        const reductionRows = Array.from(document.querySelectorAll('tr'));
        const homesteadRow = reductionRows.find(row =>
            row.textContent.includes('Homestead Reduction')
        );
        if (homesteadRow) {
            const cells = homesteadRow.querySelectorAll('td');
            if (cells.length >= 3) {
                const exemptionAmount = cells[2]?.textContent.trim();
                if (exemptionAmount && exemptionAmount !== '$0.00') {
                    datum.exemption = exemptionAmount;
                }
            }
        }
        return datum;
    });
    pageData.parcel_number = account;
    return pageData;
};

const handleNotFound = (account) => ({
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["Invalid Parcel ID"],
    property_address: "Invalid Parcel ID",
    parcel_number: account,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: "Morrow County Treasurer, 48 E High St, Mount Gilead, OH 43338, Ph: 419-947-5010",
    notes: "Parcel not found on the website.",
    delinquent: "N/A",
    tax_history: []
});

const handleNoTaxHistory = (data, clientType = 'default') => {
    const normalizedClientType = clientType.toLowerCase().trim();
    data.tax_history = [];
    if (normalizedClientType.includes('accurate')) {
        data.notes = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE";
    } else {
        data.notes = "AS PER THE TAX COLLECTOR WEBSITE, TAX HISTORY AND CURRENT TAXES ARE NOT AVAILABLE";
    }
    data.delinquent = "N/A";
    return data;
};

const extract_tax_history = async (page, data, clientType = 'default') => {
    const normalizedClientType = clientType.toLowerCase().trim();
    const yearsNeeded = getOHCompanyYears(normalizedClientType);
    
    const taxHistory = await page.evaluate((normalizedClientType, yearsNeeded) => {
        const formatCurrency = (str) => {
            if (!str) return "$0.00";
            const num = Math.abs(parseFloat(str.toString().replace(/[^0-9.-]+/g, "")));
            return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
        };

        const history = [];
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));
        if (taxTables.length === 0) return [];

        const paymentsTable = document.querySelector('table[title="Tax Payments"]');
        let allPayments = paymentsTable ? Array.from(paymentsTable.querySelectorAll('tbody tr')).map((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return null;
            
            const dateStr = cells[0]?.textContent.trim();
            const yearStr = cells[1]?.textContent.trim();
            const periodStr = cells[2]?.textContent.trim();
            const amountStr = cells[3]?.textContent.trim();

            if (!dateStr || !dateStr.includes('/')) return null;

            return {
                id: `pay_${index}`,
                date: dateStr,
                year: yearStr,
                period: periodStr,
                amount: Math.abs(parseFloat(amountStr.replace(/[^0-9.-]+/g, ""))) || 0,
                sortDate: new Date(dateStr.split('/').reverse().join('-')).getTime()
            };
        }).filter(p => p !== null && p.amount > 0) : [];

        allPayments.sort((a, b) => a.sortDate - b.sortDate);

        let latestYearDelinquency = 0;
        let foundUnpaid = false;
        let yearsSuccessfullyProcessed = 0;

        for (let i = 0; i < taxTables.length; i++) {
            const taxTable = taxTables[i];
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (!titleMatch) continue;
            const taxYear = titleMatch[1];
            const nextYear = parseInt(taxYear) + 1;

            // Get base amounts from Net General row
            const netGeneralRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Net General'));
            let firstHalfBase = 0, secondHalfBase = 0;
            if (netGeneralRow) {
                const cells = netGeneralRow.querySelectorAll('td');
                firstHalfBase = Math.abs(parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
                secondHalfBase = Math.abs(parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
            }

            // Get amount due from Owed row
            const owedRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Owed'));
            let firstHalfDue = 0, secondHalfDue = 0;
            if (owedRow) {
                const cells = owedRow.querySelectorAll('td');
                firstHalfDue = Math.abs(parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
                secondHalfDue = Math.abs(parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
            }

            // Get delinquency amount (often in a separate row or first column of owed row)
            const delqRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Delinquent'));
            let delinquencyAmount = 0;
            if (delqRow) {
                const cells = delqRow.querySelectorAll('td');
                delinquencyAmount = Math.abs(parseFloat(cells[1]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
            } else if (owedRow) {
                const cells = owedRow.querySelectorAll('td');
                delinquencyAmount = Math.abs(parseFloat(cells[1]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0;
            }

            if (yearsSuccessfullyProcessed === 0) {
                latestYearDelinquency = delinquencyAmount;
            }

            const firstHalfPaidAmount = Math.max(0, firstHalfBase - firstHalfDue);
            const secondHalfPaidAmount = Math.max(0, secondHalfBase - secondHalfDue);

            let yearPayments = allPayments.filter(p => p.year === taxYear).sort((a, b) => a.sortDate - b.sortDate);
            
            let firstHalfPaidDate = "", secondHalfPaidDate = "";
            const consumedPaymentIds = new Set();

            // Match payments
            if (yearPayments.length === 1 && firstHalfPaidAmount > 0 && secondHalfPaidAmount > 0) {
                const p = yearPayments[0];
                if (Math.abs(p.amount - (firstHalfPaidAmount + secondHalfPaidAmount)) < 5.00) {
                    firstHalfPaidDate = p.date;
                    secondHalfPaidDate = p.date;
                    consumedPaymentIds.add(p.id);
                }
            }

            if (secondHalfPaidAmount > 0 && !secondHalfPaidDate) {
                const match = yearPayments.find(p => !consumedPaymentIds.has(p.id) && (p.period.includes('2nd') || Math.abs(p.amount - secondHalfPaidAmount) < 1.00));
                if (match) {
                    secondHalfPaidDate = match.date;
                    consumedPaymentIds.add(match.id);
                } else {
                    const lastP = yearPayments.filter(p => !consumedPaymentIds.has(p.id)).pop();
                    if (lastP) {
                        secondHalfPaidDate = lastP.date;
                        consumedPaymentIds.add(lastP.id);
                    }
                }
            }

            if (firstHalfPaidAmount > 0 && !firstHalfPaidDate) {
                const match = yearPayments.find(p => !consumedPaymentIds.has(p.id) && (p.period.includes('1st') || Math.abs(p.amount - firstHalfPaidAmount) < 1.00));
                if (match) {
                    firstHalfPaidDate = match.date;
                    consumedPaymentIds.add(match.id);
                } else {
                    const firstP = yearPayments.find(p => !consumedPaymentIds.has(p.id));
                    if (firstP) {
                        firstHalfPaidDate = firstP.date;
                        consumedPaymentIds.add(firstP.id);
                    }
                }
            }

            if (consumedPaymentIds.size > 0) {
                allPayments = allPayments.filter(p => !consumedPaymentIds.has(p.id));
            }

            const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
            const firstDelqDate = `11/03/${nextYear}`;
            const secondDelqDate = `11/08/${nextYear}`;

            const is_delq = (dateStr) => {
                const [m, d, y] = dateStr.split('/');
                return new Date() >= new Date(y, m - 1, d);
            };

            const isFirstDelq = is_delq(firstDelqDate);
            const isSecondDelq = is_delq(secondDelqDate);

            if (isAnnual) {
                let status = "Paid";
                if ((firstHalfDue + secondHalfDue) > 0.01) {
                    if (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0) {
                        status = "Paid";
                    } else {
                        status = isFirstDelq ? "Delinquent" : "Due";
                    }
                }
                history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Annual",
                    status: status,
                    base_amount: formatCurrency(firstHalfBase + secondHalfBase),
                    amount_paid: formatCurrency(firstHalfPaidAmount + secondHalfPaidAmount),
                    amount_due: status === "Paid" ? "$0.00" : formatCurrency(firstHalfDue + secondHalfDue),
                    mailing_date: "N/A",
                    due_date: `11/02/${nextYear}`,
                    delq_date: firstDelqDate,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            } else {
                let fStatus = firstHalfDue > 0.01 ? (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0 ? "Paid" : (isFirstDelq ? "Delinquent" : "Due")) : "Paid";
                let sStatus = secondHalfDue > 0.01 ? (latestYearDelinquency < 0.01 && yearsSuccessfullyProcessed > 0 ? "Paid" : (isSecondDelq ? "Delinquent" : "Due")) : "Paid";

                history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Semi-Annual",
                    status: fStatus,
                    base_amount: formatCurrency(firstHalfBase),
                    amount_paid: formatCurrency(firstHalfPaidAmount),
                    amount_due: fStatus === "Paid" ? "$0.00" : formatCurrency(firstHalfDue),
                    mailing_date: "N/A",
                    due_date: `11/02/${nextYear}`,
                    delq_date: firstDelqDate,
                    paid_date: firstHalfPaidDate || (fStatus === "Paid" ? "N/A" : ""),
                    good_through_date: ""
                });
                history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Semi-Annual",
                    status: sStatus,
                    base_amount: formatCurrency(secondHalfBase),
                    amount_paid: formatCurrency(secondHalfPaidAmount),
                    amount_due: sStatus === "Paid" ? "$0.00" : formatCurrency(secondHalfDue),
                    mailing_date: "N/A",
                    due_date: `11/07/${nextYear}`,
                    delq_date: secondDelqDate,
                    paid_date: secondHalfPaidDate || (sStatus === "Paid" ? "N/A" : ""),
                    good_through_date: ""
                });
            }

            const currentYearHistory = history.slice(isAnnual ? -1 : -2);
            const isYearUnpaid = currentYearHistory.some(item => ["Due", "Delinquent"].includes(item.status));
            if (isYearUnpaid) foundUnpaid = true;
            yearsSuccessfullyProcessed++;

            if (delinquencyAmount < 0.01) {
                if (yearsSuccessfullyProcessed >= yearsNeeded && !isYearUnpaid && !foundUnpaid) break;
            }
            if (foundUnpaid && !isYearUnpaid) break;
        }

        return history;
    }, normalizedClientType);

    data.tax_history = taxHistory;
    
    if (taxHistory.length === 0) {
        data.notes = "NO TAX HISTORY FOUND";
        data.delinquent = "NONE";
        return data;
    }

    const latestYear = taxHistory[0].year;
    const delinquentRecords = taxHistory.filter(item => item.status === "Delinquent");
    const priorDelinquent = taxHistory.filter(item => item.year < latestYear && item.status === "Delinquent");

    const currentYearRecords = taxHistory.filter(item => item.year === latestYear);
    const priorYearsInHistory = taxHistory.filter(item => item.year < latestYear);

    const firstHalf = currentYearRecords.find(item => item.due_date.includes('11/02')) || { status: "PAID" };
    const secondHalf = currentYearRecords.find(item => item.due_date.includes('11/07')) || { status: "PAID" };
    const annual = currentYearRecords.find(item => item.payment_type === "Annual");

    let priorNote = "";
    if (priorDelinquent.length > 0) {
        priorNote = `PRIOR YEARS (${[...new Set(priorDelinquent.map(p => p.year))].sort().join(', ')}) TAXES ARE DELINQUENT, `;
    } else if (normalizedClientType.includes('accurate')) {
        priorNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE, ";
    } else {
        priorNote = "ALL PRIOR YEARS ARE PAID, ";
    }
    
    let currentNote = `${latestYear} `;
    if (annual) {
        currentNote += `TAXES ARE ${annual.status.toUpperCase()} ANNUALLY`;
    } else {
        currentNote += `TAXES ARE ${firstHalf.status.toUpperCase()}, 1ST INSTALLMENT IS ${firstHalf.status.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalf.status.toUpperCase()}`;
    }
    currentNote += `, NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE 11/02 & 11/07.`;

    data.notes = (priorNote + currentNote).toUpperCase();
    data.delinquent = (delinquentRecords.length > 0 || priorDelinquent.length > 0) 
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
        : "NONE";

    return data;
};

const account_search = async (page, account, clientType = 'default') => {
    try {
        const paymentStatus = await getPaymentStatus(page, account);
        if (paymentStatus === "NOT_FOUND") {
            return handleNotFound(account);
        }
        const data = await getParcelData(page, account);
        if (paymentStatus === "NO_TAX_HISTORY") {
            return handleNoTaxHistory(data, clientType);
        }
        
        // Unified tax history extraction
        return await extract_tax_history(page, data, clientType);
    } catch (error) {
        console.error("Error during account search:", error);
        throw error;
    }
};

const retryableScrape = (page, account, maxRetries = 3, clientType = 'default') => {
    return new Promise((resolve, reject) => {
        const attemptScrape = (retries) => {
            account_search(page, account, clientType)
                .then(result => resolve(result))
                .catch(error => {
                    console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error);
                    if (retries < maxRetries - 1) {
                        setTimeout(() => attemptScrape(retries + 1), 2000 * (retries + 1));
                    } else {
                        reject(error);
                    }
                });
        };
        attemptScrape(0);
    });
};

const search = async (req, res) => {
    const { fetch_type, account, clientName, client } = req.body;
    const clientType = client || clientName || 'others';

    let browserContext = null;
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).send("Invalid request type.");
    }
    try {
        const browser = await getBrowserInstance();
        browserContext = await browser.createBrowserContext();
        const page = await browserContext.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
            } else {
                reqInt.continue();
            }
        });

        const data = await retryableScrape(page, account, 3, clientType);
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error("Error in search function:", error);
        const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
        if (fetch_type === "html") {
            res.status(500).render('error_data', { error: true, message: errorMessage });
        } else {
            res.status(500).json({ error: true, message: errorMessage });
        }
    } finally {
        if (browserContext) {
            await browserContext.close();
        }
    }
};

module.exports = { search };