// Author: Harsh Jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const TIMEOUT_OPTIONS = { timeout: 90000 };

const getClermontTaxDates = (year) => {
    const taxYear = parseInt(year);
    const payableYear = taxYear + 1;
    return {
        firstHalfDue: `02/12/${payableYear}`,
        firstHalfDelq: `03/12/${payableYear}`,
        secondHalfDue: `07/09/${payableYear}`,
        secondHalfDelq: `08/09/${payableYear}`,
    };
};

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        const day = parts[0];
        const monthMap = {
            JAN: "01", FEB: "02", MAR: "03", APR: "04",
            MAY: "05", JUN: "06", JUL: "07", AUG: "08",
            SEP: "09", OCT: "10", NOV: "11", DEC: "12",
        };
        const month = monthMap[parts[1]];
        const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
        if (month) return `${month}/${day}/${year}`;
    }
    return dateStr;
};

// Core scraping function
const ac_1 = async (page, url, parcelId, client) => {
    const finalYears = getOHCompanyYears(client) || 1;

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout });
        await page.waitForSelector("input#inpParid", TIMEOUT_OPTIONS);
        await page.type("input#inpParid", parcelId, { delay: 50 });
        await page.keyboard.press("Enter");

        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout }),
            page.waitForSelector("#searchResults tbody tr", TIMEOUT_OPTIONS),
        ]);

        await Promise.all([
            page.click("#searchResults tbody tr"),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout }),
        ]);

        const navigationUrls = await page.evaluate(() => {
            const result = {};
            document.querySelectorAll(".contentpanel li").forEach((item) => {
                const label = item.textContent.trim();
                const href = item.querySelector("a")?.href;
                if (label === "Values") result.valuesUrl = href;
                if (label === "Payment History") result.paymentHistoryUrl = href;
                if (label === "Tax Summary") result.delinquentCheckUrl = href;
                if (label === "Tax History") result.detailhistoryPage = href;
            });
            return result;
        });

        if (!navigationUrls.valuesUrl) throw new Error("Values link not found");
        if (!navigationUrls.detailhistoryPage) throw new Error("Tax History link not found");

        await page.goto(navigationUrls.valuesUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout });

        const valuesPageData = await page.evaluate(() => {
            const values = {};
            const headerCells = document.querySelectorAll(".DataletHeaderBottom");
            if (headerCells.length >= 2) {
                values.ownerName = headerCells[1].textContent.trim();
                values.propertyAddress = headerCells[2].textContent.trim();
            }

            const extractValues = (tables) => {
                for (const selector of tables) {
                    const rows = document.querySelectorAll(`${selector} tr`);
                    if (!rows.length) continue;
                    rows.forEach(tr => {
                        const td1 = tr.querySelector("td:nth-child(1)");
                        const td2 = tr.querySelector("td:nth-child(2)");
                        if (!td1 || !td2) return;
                        const key = td1.textContent.trim();
                        const value = td2.textContent.trim();
                        if (key === "Land Value") values.landValue = value;
                        if (key === "Building Value") values.improvements = value;
                        if (key === "Total Value") values.appraisedValue = value;
                        if (key === "Total Value") values.assessedValue = value;
                    });
                    if (values.appraisedValue && values.assessedValue) break;
                }
            };

            extractValues(["table[id*='Appraised Value']", "#datalet_div_1 table"]);
            extractValues(["table[id*='Assessed Value']", "#datalet_div_2 table"]);

            return values;
        });

        // Payment History
        let paymentRecords = {};
        if (navigationUrls.paymentHistoryUrl) {
            try {
                await page.goto(navigationUrls.paymentHistoryUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout });
                await page.waitForSelector("table#Payment\\ History", { timeout: 10000 });
                paymentRecords = await page.evaluate(() => {
                    const payments = {};
                    const formatDate = (dateStr) => {
                        if (!dateStr || dateStr === "N/A") return "";
                        const parts = dateStr.split("-");
                        if (parts.length === 3) {
                            const day = parts[0];
                            const monthMap = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
                            const month = monthMap[parts[1]];
                            const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                            if (month) return `${month}/${day}/${year}`;
                        }
                        return dateStr;
                    };

                    document.querySelectorAll("table#Payment\\ History tr").forEach((tr, i) => {
                        if (i === 0) return;
                        const tds = tr.querySelectorAll("td");
                        if (tds.length < 5) return;
                        const year = tds[1].textContent.trim();
                        const effectiveDate = tds[2].textContent.trim();
                        const amount = parseFloat(tds[4].textContent.replace(/[$,-]/g, "")) || 0;
                        if (!payments[year]) payments[year] = [];
                        payments[year].push({ date: formatDate(effectiveDate), amount });
                    });
                    return payments;
                });
            } catch (err) {
                console.log("Payment History error:", err);
            }
        }

        // Tax History
        await page.goto(navigationUrls.detailhistoryPage, { waitUntil: "domcontentloaded", timeout: TIMEOUT_OPTIONS.timeout });
        let allTaxHistory = await page.evaluate(() => {
            const history = [];
            document.querySelectorAll("table#Tax\\ History tr").forEach((tr, i) => {
                if (i === 0) return;
                const tds = tr.querySelectorAll("td");
                if (tds.length < 6) return;
                const year = tds[0].textContent.trim();
                if (!year || year.includes("Total") || isNaN(parseInt(year))) return;
                const firstHalf = parseFloat(tds[3].textContent.replace(/[$,]/g, "")) || 0;
                const secondHalf = parseFloat(tds[4].textContent.replace(/[$,]/g, "")) || 0;
                const delqAmount = parseFloat(tds[2].textContent.replace(/[$,]/g, "")) || 0;
                history.push({ year, firstHalf, secondHalf, delinquentAmount: delqAmount, isPaid: delqAmount === 0 });
            });
            return history;
        });

        // Determine which years to include
        const mostRecentYear = allTaxHistory.length ? Math.max(...allTaxHistory.map(h => parseInt(h.year))) : new Date().getFullYear();
        const yearsToProcess = [];
        for (let i = 0; i < finalYears; i++) {
            const targetYear = mostRecentYear - i;
            const yearData = allTaxHistory.find(h => parseInt(h.year) === targetYear);
            if (yearData) {
                yearsToProcess.push(yearData);
            } else {
                // Fill missing year with zero amounts
                const dates = getClermontTaxDates(targetYear);
                yearsToProcess.push({
                    year: targetYear.toString(),
                    firstHalf: 0,
                    secondHalf: 0,
                    delinquentAmount: 0,
                    isPaid: true,
                    missing: true,
                    dates
                });
            }
        }

        // Build taxHistory array
        const taxHistory = [];
        yearsToProcess.forEach((y) => {
            const dates = getClermontTaxDates(y.year);
            const payments = paymentRecords[y.year] || [];

            // Sort payments by date to determine which installment they belong to
            const sortedPayments = payments.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateA - dateB;
            });

            const totalPaid = sortedPayments.reduce((sum, p) => sum + p.amount, 0);
            const totalTax = y.firstHalf + y.secondHalf;

            // Determine payment status more accurately
            let firstHalfPaid = false;
            let secondHalfPaid = false;
            let firstHalfPaidDate = "";
            let secondHalfPaidDate = "";

            // If there are payments, match them to installments
            if (sortedPayments.length > 0) {
                // Check if fully paid
                if (totalPaid >= totalTax * 0.95) {
                    firstHalfPaid = true;
                    secondHalfPaid = true;
                    firstHalfPaidDate = sortedPayments[0]?.date || "";
                    secondHalfPaidDate = sortedPayments[sortedPayments.length - 1]?.date || "";
                }
                // Check if first half paid
                else if (totalPaid >= y.firstHalf * 0.95) {
                    firstHalfPaid = true;
                    firstHalfPaidDate = sortedPayments[0]?.date || "";
                }
            }

            // Determine status based on dates and payment status
            const today = new Date();
            const firstHalfDelqDate = new Date(dates.firstHalfDelq);
            const secondHalfDelqDate = new Date(dates.secondHalfDelq);

            let firstHalfStatus = "Due";
            let secondHalfStatus = "Due";

            if (y.missing) {
                firstHalfStatus = "N/A";
                secondHalfStatus = "N/A";
            } else {
                // First installment status
                if (firstHalfPaid) {
                    firstHalfStatus = "Paid";
                } else if (today > firstHalfDelqDate) {
                    firstHalfStatus = "Delinquent";
                }

                // Second installment status
                if (secondHalfPaid) {
                    secondHalfStatus = "Paid";
                } else if (today > secondHalfDelqDate) {
                    secondHalfStatus = "Delinquent";
                }
            }

            // First installment
            taxHistory.push({
                jurisdiction: "County",
                year: y.year,
                payment_type: "Semi-Annual",
                status: firstHalfStatus,
                base_amount: `$${y.firstHalf.toFixed(2)}`,
                amount_paid: firstHalfPaid ? `$${y.firstHalf.toFixed(2)}` : "$0.00",
                amount_due: firstHalfPaid ? "$0.00" : `$${y.firstHalf.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: dates.firstHalfDue,
                delq_date: dates.firstHalfDelq,
                paid_date: firstHalfPaidDate,
                good_through_date: "",
                link: "",
            });

            // Second installment
            taxHistory.push({
                jurisdiction: "County",
                year: y.year,
                payment_type: "Semi-Annual",
                status: secondHalfStatus,
                base_amount: `$${y.secondHalf.toFixed(2)}`,
                amount_paid: secondHalfPaid ? `$${y.secondHalf.toFixed(2)}` : "$0.00",
                amount_due: secondHalfPaid ? "$0.00" : `$${y.secondHalf.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: dates.secondHalfDue,
                delq_date: dates.secondHalfDelq,
                paid_date: secondHalfPaidDate,
                good_through_date: "",
                link: "",
            });
        });

        // Delinquent summary
        let calculatedDelinquentAmount = taxHistory.reduce((sum, t) =>
            t.status === "Delinquent" ? sum + parseFloat(t.amount_due.replace(/[$,]/g, "")) : sum, 0
        );

        const delinquentAmountDue = calculatedDelinquentAmount > 0 ? `$${calculatedDelinquentAmount.toFixed(2)}` : "$0.00";
        const delinquent = calculatedDelinquentAmount > 0 ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        // Build notes
        let notes = "";
        const hasDelinquent = taxHistory.some(t => t.status === "Delinquent");

        const currentTaxYear = yearsToProcess[0]?.year;

        if (hasDelinquent) {
            notes = "PRIOR YEARS ARE DELINQUENT. ";
        } else {
            notes = `ALL PRIOR YEARS ARE PAID, ${currentTaxYear} TAXES ARE PAID. `;
        }

        const taxDates = getClermontTaxDates(currentTaxYear);
        notes += `NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${taxDates.firstHalfDue} AND ${taxDates.secondHalfDue}.`;


        return {
            processed_date: new Date().toISOString().split("T")[0],
            order_number: "",
            borrower_name: "",
            owner_name: valuesPageData.ownerName ? [valuesPageData.ownerName] : ["N/A"],
            property_address: valuesPageData.propertyAddress || "",
            parcel_number: parcelId,
            land_value: valuesPageData.landValue || "",
            improvements: valuesPageData.improvements || "",
            total_assessed_value: valuesPageData.assessedValue || "N/A",
            exemption: "",
            total_taxable_value: valuesPageData.assessedValue || "N/A",
            taxing_authority: "Clermont County Auditor, 101 E Main St, Batavia, OH 45103",
            notes,
            delinquent,
            delinquent_amount: delinquentAmountDue,
            tax_history: taxHistory,
        };

    } catch (err) {
        console.log("Error in ac_1:", err);
        throw new Error("Record Not Found");
    }
};

// Wrapper
const accountSearch = (page, url, account, client) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, url, account, client)
                .then(resolve)
                .catch(reject);
        } catch (err) {
            reject(err);
        }
    });
};

// Main controller
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    if (!account || account.trim() === "") {
        return res.status(400).json({ error: true, message: "Please enter a valid account number" });
    }

    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
        return res.status(400).json({ error: true, message: "Invalid fetch_type" });
    }

    const url = "https://www.clermontauditorrealestate.org/_web/search/CommonSearch.aspx?mode=PARID";
    let browser, context;

    try {
        browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (req) => ["stylesheet", "font", "image"].includes(req.resourceType()) ? req.abort() : req.continue());

        const data = await accountSearch(page, url, account, client);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

    } catch (err) {
        console.log("Search Error:", err);
        if (fetch_type === "html") {
            res.status(200).render("error_data", { error: true, message: err.message || "An error occurred" });
        } else {
            res.status(500).json({ error: true, message: err.message || "An error occurred" });
        }
    }
};

module.exports = { search };