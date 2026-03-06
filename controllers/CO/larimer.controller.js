//Author Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const fmtPosCurrency = (val) => {
    if (val === undefined || val === null) return "$0.00";
    const s = String(val).trim();
    if (!s || s === "N/A" || s === "-") return "$0.00";
    let clean = s.replace(/[$,\s]/g, "");
    if (clean.startsWith("(") && clean.endsWith(")")) {
        clean = clean.slice(1, -1);
    }
    const num = Math.abs(parseFloat(clean));
    if (!isFinite(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const lc_1 = (page, account) => {
    return new Promise((resolve, reject) => {
        page.goto("https://www.larimer.gov/treasurer/search", { 
            waitUntil: "domcontentloaded", 
            timeout: 180000 
        })
        .then(() => page.waitForSelector('#parcelno', { timeout: 90000 }))
        .then(() => page.click('#parcelno'))
        .then(() => page.evaluate(() => document.querySelector('#parcelno').value = ''))
        .then(() => page.type('#parcelno', account, { delay: 100 }))
        .then(() => page.waitForSelector('input[value="Find Property"]', { timeout: 90000 }))
        .then(() => page.click('input[value="Find Property"]'))
        .then(() => page.waitForSelector('#resultsTable', { timeout: 90000 }))
        .then(() => page.waitForSelector('#resultsTable tbody tr', { timeout: 90000 }))
        .then(() => new Promise(resolve => setTimeout(resolve, 5000))) 
        .then(() => page.$('#resultsTable tbody tr:first-child'))
        .then(firstRow => {
            if (!firstRow) {
                return Promise.reject(new Error('No search results found'));
            }
            return firstRow.click();
        })
        .then(() => page.waitForSelector('.col-sm-6', { timeout: 90000 }))
        .then(() => new Promise(resolve => setTimeout(resolve, 5000))) 
        .then(() => page.evaluate((parcelNum) => {
            const formatDate = (dateStr) => {
                if (!dateStr || dateStr === "-" || dateStr === "N/A") return dateStr;
                try {
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return dateStr;
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    return `${mm}/${dd}/${yyyy}`;
                } catch {
                    return dateStr;
                }
            };
            const addOneDay = (dateStr) => {
                try {
                    const d = new Date(dateStr);
                    d.setDate(d.getDate() + 1);
                    return formatDate(d);
                } catch {
                    return "";
                }
            };
            const getStatus = (isPaid, dueDateStr) => {
                if (isPaid) return "Paid";
                try {
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const due = new Date(dueDateStr);
                    if (isNaN(due)) return "Due";
                    return now <= due ? "Due" : "Delinquent";
                } catch {
                    return "Due";
                }
            };
            const data = {
                processed_date: new Date().toISOString().split("T")[0],
                order_number: "",
                borrower_name: "",
                owner_name: [],
                property_address: "N/A",
                parcel_number: parcelNum,
                land_value: "N/A",
                improvements: "N/A",
                total_assessed_value: "N/A",
                exemption: "N/A",
                total_taxable_value: "N/A",
                taxing_authority: "Larimer County Treasurer, 200 W Oak St, Fort Collins, CO 80521",
                notes: "",
                delinquent: "",
                tax_history: []
            };
            let currentYear = (new Date().getFullYear() - 1).toString();
            const taxYearElements = document.querySelectorAll('*');
            for (let element of taxYearElements) {
                const text = element.textContent || element.innerText || '';
                if (text.includes('2024') || text.includes('2023') || text.includes('2025')) {
                    const yearMatch = text.match(/\b(202[0-9])\b/);
                    if (yearMatch) {
                        const foundYear = parseInt(yearMatch[1]);
                        const currentCalendarYear = new Date().getFullYear();
                        if (foundYear >= currentCalendarYear - 2 && foundYear <= currentCalendarYear) {
                            currentYear = foundYear.toString();
                            break;
                        }
                    }
                }
            }
            const propertyRows = document.querySelectorAll(".col-sm-6:first-child table tbody tr");
            propertyRows.forEach((row) => {
                const cells = row.querySelectorAll("td");
                if (cells.length >= 2) {
                    const label = cells[0].innerText.trim();
                    const value = cells[1].innerText.trim();
                    if (label.includes("Owner Name")) {
                        data.owner_name[0] = value || "N/A";
                    } else if (label.includes("Property Address") || label.includes("Situs Address")) {
                        data.property_address = value || "N/A";
                    } else if (label.includes("Land") && !label.includes("Total")) {
                        data.land_value = value || "N/A";
                    } else if (label.includes("Improvements") || label.includes("Building")) {
                        data.improvements = value || "N/A";
                    } else if (label.includes("Total Assessed Value") || label.includes("Assessed Value")) {
                        data.total_assessed_value = value || "N/A";
                    } else if (label.includes("Exemption") || label.includes("Exempt")) {
                        data.total_taxable_value = value || "N/A";
                    } else if (label.includes("Total Taxable Value") || label.includes("Taxable Value") ||
                               label.includes("Net Taxable") || label.includes("Actual Value")) {
                        data.exemption = value || "N/A";
                    }
                }
            });
            const paymentRows = document.querySelectorAll(".col-sm-6:nth-child(2) table tbody tr");
            let paidDates = [];
            let fullRow = null, firstRow = null, secondRow = null, propertyBalance = "$0.00";
            paymentRows.forEach((row) => {
                const cells = row.querySelectorAll("td");
                const firstCellText = cells[0]?.innerText.trim() || "";
                if (firstCellText.includes("Payment Received Date")) {
                    const spans = row.querySelectorAll("span.ng-binding");
                    paidDates = Array.from(spans).map(el => el.innerText.trim());
                }
                if (firstCellText.includes("Property Balance") && cells.length >= 3) {
                    propertyBalance = cells[2].innerText.trim() || "$0.00";
                }
                if (cells.length === 3) {
                    const period = firstCellText;
                    const due_date = cells[1].innerText.trim();
                    const base_amount = cells[2].innerText.trim();
                    if (period.includes("Full Amount")) {
                        fullRow = { period, due_date, base_amount };
                    } else if (period.includes("First Half")) {
                        firstRow = { period, due_date, base_amount };
                    } else if (period.includes("Second Half")) {
                        secondRow = { period, due_date, base_amount };
                    }
                }
            });
            const balanceAmount = parseFloat(propertyBalance.replace(/[^0-9.-]+/g, "")) || 0;
            if (fullRow && balanceAmount === 0 && paidDates.length === 1) {
                data.tax_history.push({
                    jurisdiction: "County",
                    year: currentYear,
                    payment_type: "Annual",
                    status: "Paid",
                    base_amount: fullRow.base_amount,
                    amount_paid: fullRow.base_amount,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: formatDate(fullRow.due_date),
                    delq_date: addOneDay(fullRow.due_date),
                    paid_date: formatDate(paidDates[0]),
                    good_through_date: ""
                });
                data.notes = `ALL PRIORS ARE PAID, ${currentYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, DUE DATE IS ${formatDate(fullRow.due_date)}`;
                data.delinquent = "NONE";
            } else if (paidDates.length >= 2 && firstRow && secondRow) {
                const effectivePaidDates = paidDates.slice(0, 2);
                [firstRow, secondRow].forEach((row, index) => {
                    data.tax_history.push({
                        jurisdiction: "County",
                        year: currentYear,
                        payment_type: "Semi-Annual",
                        status: "Paid",
                        base_amount: row.base_amount,
                        amount_paid: row.base_amount,
                        amount_due: "$0.00",
                        mailing_date: "N/A",
                        due_date: formatDate(row.due_date),
                        delq_date: addOneDay(row.due_date),
                        paid_date: formatDate(effectivePaidDates[index]),
                        good_through_date: ""
                    });
                });
                data.notes = `ALL PRIORS ARE PAID, ${currentYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${formatDate(firstRow.due_date)} & ${formatDate(secondRow.due_date)}`;
                data.delinquent = "NONE";
            } else {
                const hasBalance = balanceAmount > 0;
                if (hasBalance || fullRow || firstRow || secondRow) {
                    if (fullRow && (!firstRow || !secondRow ||
                                    (firstRow && parseFloat(firstRow.base_amount.replace(/[^0-9.-]+/g, "")) === 0) ||
                                    (secondRow && parseFloat(secondRow.base_amount.replace(/[^0-9.-]+/g, "")) === 0))) {
                        const isPaid = paidDates.length > 0 && !hasBalance;
                        const stat = getStatus(isPaid, fullRow.due_date);
                        data.tax_history.push({
                            jurisdiction: "County",
                            year: currentYear,
                            payment_type: "Annual",
                            status: stat,
                            base_amount: fullRow.base_amount,
                            amount_paid: isPaid ? fullRow.base_amount : "$0.00",
                            amount_due: isPaid ? "$0.00" : fullRow.base_amount,
                            mailing_date: "N/A",
                            due_date: formatDate(fullRow.due_date),
                            delq_date: addOneDay(fullRow.due_date),
                            paid_date: isPaid ? formatDate(paidDates[0]) : "",
                            good_through_date: ""
                        });
                        data.notes = isPaid
                            ? `ALL PRIORS ARE PAID, ${currentYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, DUE DATE IS ${formatDate(fullRow.due_date)}`
                            : `ALL PRIORS ARE PAID, ${currentYear} TAXES ARE ${stat.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, DUE DATE IS ${formatDate(fullRow.due_date)}`;
                        data.delinquent = stat === "Delinquent" ? "YES, TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
                    } else if (firstRow && secondRow) {
                        const firstHalfAmount = parseFloat(firstRow.base_amount.replace(/[^0-9.-]+/g, "")) || 0;
                        const secondHalfAmount = parseFloat(secondRow.base_amount.replace(/[^0-9.-]+/g, "")) || 0;
                        if (firstHalfAmount > 0) {
                            let isFirstHalfPaid = false;
                            if (paidDates.length >= 2) {
                                isFirstHalfPaid = true;
                            } else if (paidDates.length === 1) {
                                isFirstHalfPaid = true;
                            }
                            const firstStat = getStatus(isFirstHalfPaid, firstRow.due_date);
                            data.tax_history.push({
                                jurisdiction: "County",
                                year: currentYear,
                                payment_type: "Semi-Annual",
                                status: firstStat,
                                base_amount: firstRow.base_amount,
                                amount_paid: isFirstHalfPaid ? firstRow.base_amount : "$0.00",
                                amount_due: isFirstHalfPaid ? "$0.00" : firstRow.base_amount,
                                mailing_date: "N/A",
                                due_date: formatDate(firstRow.due_date),
                                delq_date: addOneDay(firstRow.due_date),
                                paid_date: isFirstHalfPaid && paidDates.length > 0 ? formatDate(paidDates[0]) : "",
                                good_through_date: ""
                            });
                        }
                        if (secondHalfAmount > 0) {
                            let isSecondHalfPaid = false;
                            if (paidDates.length >= 2) {
                                isSecondHalfPaid = true;
                            } else if (paidDates.length === 1 && !hasBalance) {
                                isSecondHalfPaid = true;
                            }
                            const secondStat = getStatus(isSecondHalfPaid, secondRow.due_date);
                            data.tax_history.push({
                                jurisdiction: "County",
                                year: currentYear,
                                payment_type: "Semi-Annual",
                                status: secondStat,
                                base_amount: secondRow.base_amount,
                                amount_paid: isSecondHalfPaid ? secondRow.base_amount : "$0.00",
                                amount_due: isSecondHalfPaid ? "$0.00" : secondRow.base_amount,
                            mailing_date: "N/A",
                                due_date: formatDate(secondRow.due_date),
                                delq_date: addOneDay(secondRow.due_date),
                                paid_date: isSecondHalfPaid && paidDates.length >= 2 ? formatDate(paidDates[1]) :
                                            (isSecondHalfPaid && paidDates.length === 1 ? formatDate(paidDates[0]) : ""),
                                good_through_date: ""
                            });
                        }
                        const hasDelinquent = data.tax_history.some(entry => entry.status === "Delinquent");
                        const hasDue = data.tax_history.some(entry => entry.status === "Due");
                        const hasUnpaid = hasDelinquent || hasDue;
                        const hasPaid = data.tax_history.some(entry => entry.status === "Paid");

                        const semi = data.tax_history.filter(e => e.year === currentYear && e.payment_type === "Semi-Annual");
                        const firstStatus = (semi[0]?.status || "N/A").toUpperCase();
                        const secondStatus = (semi[1]?.status || "N/A").toUpperCase();
                        data.notes = `ALL PRIORS ARE PAID, ${currentYear} TAXES: 1ST INSTALLMENT ${firstStatus}, 2ND INSTALLMENT ${secondStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${formatDate(firstRow.due_date)} & ${formatDate(secondRow.due_date)}`;
                        data.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
                    } else {
                        data.notes = "TAX INFORMATION FOUND BUT PAYMENT STRUCTURE UNCLEAR";
                        data.delinquent = hasBalance ? "YES" : "UNKNOWN";
                    }
                } else {
                    data.notes = "NO TAX INFORMATION AVAILABLE OR TAXES ARE PAID";
                    data.delinquent = "UNKNOWN";
                }
            }
            const taxableValueElement = Array.from(propertyRows).find(row =>
                row.querySelector("td:first-child")?.innerText.trim().includes("Net Taxable Value")
            );
            if (taxableValueElement) {
                const valueCell = taxableValueElement.querySelector("td:nth-child(2)");
                if (valueCell) {
                    data.total_taxable_value = valueCell.innerText.trim() || "N/A";
                }
            }
            return data;
        }, account))
        .then(pageData => {
            pageData.land_value = fmtPosCurrency(pageData.land_value);
            pageData.improvements = fmtPosCurrency(pageData.improvements);
            pageData.total_assessed_value = fmtPosCurrency(pageData.total_assessed_value);
            pageData.exemption = fmtPosCurrency(pageData.exemption);
            pageData.total_taxable_value = fmtPosCurrency(pageData.total_taxable_value);
            if (Array.isArray(pageData.tax_history)) {
                pageData.tax_history = pageData.tax_history.map(entry => ({
                    ...entry,
                    base_amount: fmtPosCurrency(entry.base_amount),
                    amount_paid: fmtPosCurrency(entry.amount_paid),
                    amount_due: fmtPosCurrency(entry.amount_due)
                }));
            }
            return resolve(pageData);
        })
        .catch(error => reject(new Error(`Scraping failed: ${error.message}`)));
    });
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;
    let context;
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
        const error = { error: true, message: "Invalid fetch_type. Must be 'html' or 'api'" };
        return fetch_type === "html"
            ? res.status(200).render('error_data', error)
            : res.status(400).json(error);
    }
    if (!account) {
        const error = { error: true, message: "Parcel number is required" };
        return fetch_type === "html"
            ? res.status(200).render('error_data', error)
            : res.status(400).json(error);
    }
    getBrowserInstance()
        .then(browser => browser.createBrowserContext())
        .then(browserContext => {
            context = browserContext;
            return context.newPage();
        })
        .then(page => {
            page.setDefaultNavigationTimeout(180000); // Set default navigation timeout for page
            return page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            .then(() => lc_1(page, account))
        })
        .then(data => {
            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
            } else {
                res.status(200).json({ result: data });
            }
        })
        .catch(error => {
            const errorResponse = { error: true, message: error.message };
            if (fetch_type === "html") {
                res.status(200).render('error_data', errorResponse);
            } else {
                res.status(500).json(errorResponse);
            }
        })
        .finally(() => {
            if (context) {
                context.close().catch(() => {});
            }
        });
};

module.exports = { search };