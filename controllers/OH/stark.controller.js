// Author: Harsh Jha
// Modified to match Ashtabula controller logic with years and company parameters
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Puppeteer timeout configuration
const TIMEOUT_OPTIONS = { timeout: 90000 };

// Helper function to format dates
const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "";
    try {
        const months = {
            JAN: "01", FEB: "02", MAR: "03", APR: "04",
            MAY: "05", JUN: "06", JUL: "07", AUG: "08",
            SEP: "09", OCT: "10", NOV: "11", DEC: "12",
        };
        const parts = dateStr.split("-");
        if (parts.length !== 3) return dateStr;

        const day = parts[0].padStart(2, "0");
        const month = months[parts[1].toUpperCase()] || parts[1];
        let year = parts[2];
        if (year.length === 2) {
            const yearNum = parseInt(year);
            year = yearNum <= 50 ? "20" + year : "19" + year;
        }
        return `${month}/${day}/${year}`;
    } catch {
        return dateStr;
    }
};

// Navigation: Extract navigation URLs from sidebar
const extractNavigationUrls = async (page) => {
    await page.waitForSelector(".contentpanel li", TIMEOUT_OPTIONS);

    return await page.evaluate(() => {
        const result = {};
        document.querySelectorAll(".contentpanel li").forEach((item) => {
            const label = item.textContent.trim();
            const href = item.querySelector("a")?.href;

            if (label === "Values") result.valuesUrl = href;
            if (label === "Tax Summary") result.taxSummaryUrl = href;
            //   if (label === "Payment History") result.paymentHistoryUrl = href;
        });
        return result;
    });
};

// Values Page: Extract property values and owner info
const scrapeValuesPage = async (page, valuesUrl) => {
    await page.goto(valuesUrl, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_OPTIONS.timeout,
    });

    await page.waitForSelector("#datalet_div_1", TIMEOUT_OPTIONS);
    await page.waitForSelector("#datalet_div_2", TIMEOUT_OPTIONS);

    return await page.evaluate(() => {
        const values = {};

        // Extract owner name and address from header
        const headerCells = document.querySelectorAll(".DataletHeaderBottom");
        if (headerCells.length >= 2) {
            values.ownerName = headerCells[1].textContent.trim();
            values.propertyAddress = headerCells[2].textContent.trim();
        }

        // Extract Appraised Value (100%)
        document
            .querySelectorAll("table[id='Appraised Value (100%)'] tr")
            .forEach((tr) => {
                const td1 = tr.querySelector("td:nth-child(1)");
                const td2 = tr.querySelector("td:nth-child(2)");
                if (!td1 || !td2) return;

                const key = td1.textContent.trim();
                const value = td2.textContent.trim();

                if (key === "Year") values.taxYear = value;
                if (key === "Appraised Land") values.landValue = value;
                if (key === "Appraised Building") values.improvements = value;
                if (key === "Appraised Total") values.appraisedValue = value;
            });

        // Extract Assessed Value (35%)
        document
            .querySelectorAll("table[id='Assessed Value (35%)'] tr")
            .forEach((tr) => {
                const td1 = tr.querySelector("td:nth-child(1)");
                const td2 = tr.querySelector("td:nth-child(2)");
                if (!td1 || !td2) return;

                const key = td1.textContent.trim();
                const value = td2.textContent.trim();

                if (key === "Assessed Total") values.assessedValue = value;
            });

        return values;
    });
};

// Tax Summary Page: Extract tax summary data
const scrapeTaxSummary = async (page, taxSummaryUrl) => {
    try {
        await page.goto(taxSummaryUrl, {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUT_OPTIONS.timeout,
        });

        await page.waitForSelector("table#Tax\\ Summary", TIMEOUT_OPTIONS);

        const summaryData = await page.evaluate(() => {
            const rows = [];

            document
                .querySelectorAll("table#Tax\\ Summary tr")
                .forEach((tr, index) => {
                    if (index === 0) return;
                    const tds = tr.querySelectorAll("td");
                    if (tds.length < 8) return;

                    const rolltype = tds[0].textContent.trim();
                    const effectiveYear = tds[1].textContent.trim();
                    const cycle = tds[3].textContent.trim();
                    const originalCharge = tds[4].textContent.trim();
                    const adjustments = tds[5].textContent.trim();
                    const paymentsAmt = tds[6].textContent.trim();
                    const total = tds[7].textContent.trim();

                    if (
                        effectiveYear &&
                        !isNaN(parseInt(effectiveYear)) &&
                        rolltype !== "Total:"
                    ) {
                        rows.push({
                            rolltype,
                            year: effectiveYear,
                            cycle,
                            originalCharge,
                            adjustments,
                            payments: paymentsAmt,
                            total,
                        });
                    }
                });

            return rows;
        });

        return summaryData;
    } catch (err) {
        console.log("Tax Summary page error:", err.message);
        return [];
    }
};

// ---------------------------
// GROUP TAX SUMMARY BY YEAR & CYCLE (FIRST / SECOND HALF)
// ---------------------------
const groupByYearAndCycle = (summaryData) => {
    const map = {};

    summaryData.forEach(row => {
        const year = row.year;
        const cycle = row.cycle;

        if (!map[year]) {
            map[year] = { 1: 0, 2: 0 };
        }

        const amount =
            parseFloat(row.total.replace(/[$,]/g, "")) || 0;

        if (cycle === "1" || cycle === 1) {
            map[year][1] += amount;
        }

        if (cycle === "2" || cycle === 2) {
            map[year][2] += amount;
        }
    });

    return map;
};


// Build tax history from summary data (configurable years)
const buildTaxHistory = (summaryData, years = 1) => {
    if (summaryData.length === 0) {
        return { taxHistory: [], mostRecentYears: [] };
    }

    // Get most recent years
    const uniqueYears = [...new Set(summaryData.map(r => parseInt(r.year)))]
        .sort((a, b) => b - a);

    const selectedYears = uniqueYears.slice(0, years);
    const taxHistory = [];

    // Group summary rows into first / second half
    const grouped = groupByYearAndCycle(summaryData);
    const today = new Date();

    selectedYears.forEach((targetYear) => {
        const yearStr = targetYear.toString();
        const yearCycles = grouped[yearStr];

        if (!yearCycles) return;

        // ---------------- FIRST HALF ----------------
        const firstDue = `03/05/${targetYear + 1}`;
        const firstDelq = `03/15/${targetYear + 1}`;

        taxHistory.push({
            jurisdiction: "County",
            year: yearStr,
            payment_type: "Semi-Annual",
            status:
                yearCycles[1] === 0
                    ? "Paid"
                    : today < new Date(firstDelq)
                        ? "Due"
                        : "Delinquent",
            base_amount: `$${yearCycles[1].toFixed(2)}`,
            amount_paid: "$0.00",
            amount_due: `$${yearCycles[1].toFixed(2)}`,
            mailing_date: "N/A",
            due_date: firstDue,
            delq_date: firstDelq,
            paid_date: "",
            good_through_date: "",
            link: "",
        });

        // ---------------- SECOND HALF ----------------
        const secondDue = `07/16/${targetYear + 1}`;
        const secondDelq = `07/26/${targetYear + 1}`;

        taxHistory.push({
            jurisdiction: "County",
            year: yearStr,
            payment_type: "Semi-Annual",
            status:
                yearCycles[2] === 0
                    ? "Paid"
                    : today < new Date(secondDelq)
                        ? "Due"
                        : "Delinquent",
            base_amount: `$${yearCycles[2].toFixed(2)}`,
            amount_paid: "$0.00",
            amount_due: `$${yearCycles[2].toFixed(2)}`,
            mailing_date: "N/A",
            due_date: secondDue,
            delq_date: secondDelq,
            paid_date: "",
            good_through_date: "",
            link: "",
        });
    });

    return { taxHistory, mostRecentYears: selectedYears };
};


// Payment History Page: Get actual payment dates
const scrapePaymentHistory = async (page, targetYears) => {
    try {


        await page.waitForSelector("#datalet_div_3 table#Payment\\ History", TIMEOUT_OPTIONS);

        return await page.evaluate((years = []) => {
            const paymentsByYear = {};

            const formatDate = (dateStr) => {
                if (!dateStr || dateStr === "N/A") return "";
                const parts = dateStr.split("-");
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, "0");
                    const monthMap = {
                        JAN: "01", FEB: "02", MAR: "03", APR: "04",
                        MAY: "05", JUN: "06", JUL: "07", AUG: "08",
                        SEP: "09", OCT: "10", NOV: "11", DEC: "12",
                    };
                    const month = monthMap[parts[1]];
                    const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                    if (month) {
                        return `${month}/${day}/${year}`;
                    }
                }
                return dateStr;
            };

            document
                .querySelectorAll("table#Payment\\ History tr")
                .forEach((tr, index) => {
                    if (index === 0) return;
                    const tds = tr.querySelectorAll("td");
                    if (tds.length < 5) return;

                    const rollType = tds[0].textContent.trim();
                    const taxYear = tds[1].textContent.trim();
                    const effectiveDate = tds[2].textContent.trim();
                    const amount = tds[4].textContent.trim();

                    if (rollType !== "Total:") {

                        if (!paymentsByYear[taxYear]) {
                            paymentsByYear[taxYear] = [];
                        }
                        paymentsByYear[taxYear].push({
                            date: formatDate(effectiveDate),
                            amount: amount,
                        });
                    }
                });

            return paymentsByYear;
        }, targetYears);
    } catch (err) {
        console.log("Payment History page error:", err.message);
        return {};
    }
};

// Update tax history with payment dates
const updateTaxHistoryWithPayments = (taxHistory, paymentsByYear) => {
    taxHistory.forEach((item) => {
        const year = item.year;
        const yearPayments = paymentsByYear[year] || [];

        if (item.status === "Paid" && yearPayments.length > 0) {
            // Match payment to installment based on cycle
            const isCycle1 = item.payment_type === "1st Installment";

            if (isCycle1 && yearPayments[0]) {
                item.paid_date = yearPayments[0].date;
            } else
                if (!isCycle1 && yearPayments[1]) {
                    item.paid_date = yearPayments[1].date;
                } else if (yearPayments[0]) {
                    item.paid_date = yearPayments[0].date;
                }
        }

        // Update status to Delinquent if past delq_date
        if (item.status === "Due" && item.delq_date !== "N/A") {
            const today = new Date();
            const delinquentDate = new Date(item.delq_date);

            if (today > delinquentDate) {
                item.status = "Delinquent";
            }
        }
    });

    return taxHistory;
};
// Build previous year tax history from Payment History

const buildPreviousYearFromPayments = (paymentsByYear, existingYears, maxYears) => {
    const previousEntries = [];

    // Sort years descending
    const sortedYears = Object.keys(paymentsByYear)
        .map(y => parseInt(y))
        .sort((a, b) => b - a);

    for (const year of sortedYears) {
        // Stop when year limit reached
        const usedYears = new Set(previousEntries.map(e => e.year));
        if (existingYears.length + usedYears.size >= maxYears) break;

        if (existingYears.includes(year)) continue;

        const payments = paymentsByYear[year.toString()] || [];

        // Normalize amounts
        let firstAmt = 0;
        let secondAmt = 0;
        let firstDate = "";
        let secondDate = "";

        if (payments.length >= 2) {
            // Two real installments
            firstAmt = payments[0].amount;
            secondAmt = payments[1].amount;
            firstDate = payments[0].date;
            secondDate = payments[1].date;
        } else if (payments.length === 1) {
            // Single payment → split into 2
            const amt =
                parseFloat(payments[0].amount.replace(/[$,]/g, "")) / 2;

            firstAmt = `$${amt.toFixed(2)}`;
            secondAmt = `$${amt.toFixed(2)}`;
            firstDate = payments[0].date;
            secondDate = payments[0].date;
        }

        // -------- 1ST INSTALLMENT --------
        previousEntries.push({
            jurisdiction: "County",
            year: year.toString(),
            payment_type: "Semi-Annual",
            status: "Paid",
            base_amount: firstAmt,
            amount_paid: firstAmt,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `03/05/${year + 1}`,
            delq_date: `03/15/${year + 1}`,
            paid_date: firstDate,
            good_through_date: "",
            link: "",
        });

        // -------- 2ND INSTALLMENT --------
        previousEntries.push({
            jurisdiction: "County",
            year: year.toString(),
            payment_type: "Semi-Annual",
            status: "Paid",
            base_amount: secondAmt,
            amount_paid: secondAmt,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `07/16/${year + 1}`,
            delq_date: `07/26/${year + 1}`,
            paid_date: secondDate,
            good_through_date: "",
            link: "",
        });

        existingYears.push(year);
    }

    return previousEntries;
};




// Check for delinquent status
// Check for delinquent status (FIXED: Ohio tax-year logic)
const checkDelinquency = async (page) => {
    return await page.evaluate(() => {
        let isDelinquent = false;

        // Ohio logic: prior year = (currentYear - 1) or older
        const currentTaxYear = new Date().getFullYear() - 1;

        // Check Tax Summary
        document
            .querySelectorAll("table#Tax\\ Summary tr")
            .forEach((tr, index) => {
                if (index === 0) return;
                const tds = tr.querySelectorAll("td");
                if (tds.length < 8) return;

                const rolltype = tds[0].textContent.trim();
                const year = parseInt(tds[1].textContent.trim());
                const total =
                    parseFloat(tds[7].textContent.replace(/[$,]/g, "")) || 0;

                if (rolltype === "Total:" || !year) return;

                //  ONLY older than current tax year
                if (year < currentTaxYear && total > 0) {
                    isDelinquent = true;
                }
            });

        return isDelinquent;
    });
};


// Build final notes
// Build final notes (STARK COUNTY – SEMI-ANNUAL LOGIC)
const buildNotes = (isDelinquent, taxHistory, mostRecentYears) => {
    const priorYearsStatus = isDelinquent
        ? "PRIOR YEARS ARE DELINQUENT"
        : "ALL PRIOR YEARS ARE PAID";

    let notes = `${priorYearsStatus},`;

    mostRecentYears.forEach((year) => {
        const yearItems = taxHistory.filter(
            (item) => parseInt(item.year) === year
        );

        if (yearItems.length === 0) return;

        const hasDelinquent = yearItems.some(i => i.status === "Delinquent");
        const hasDue = yearItems.some(i => i.status === "Due");
        const allPaid = yearItems.every(i => i.status === "Paid");

        let yearStatus = "DUE";

        if (hasDelinquent) {
            yearStatus = "DELINQUENT";
        } else if (allPaid) {
            yearStatus = "PAID";
        } else if (hasDue) {
            yearStatus = "DUE";
        }

        notes += ` ${year} TAXES ARE ${yearStatus},`;
    });

    notes += " NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 03/05 AND 07/16.";

    return notes;
};


// Main extraction function
const ac_1 = (page, url, parcelId, years = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Load initial page
            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUT_OPTIONS.timeout,
            });

            // Accept agreement
            await page.waitForSelector("button#btAgree", TIMEOUT_OPTIONS);
            await page.click("button#btAgree");
            await page.waitForNavigation({
                waitUntil: "domcontentloaded",
                timeout: TIMEOUT_OPTIONS.timeout,
            });

            // Enter parcel number
            await page.waitForSelector("input#inpParid", TIMEOUT_OPTIONS);
            await page.locator("input#inpParid").fill(parcelId);

            // Submit and wait for navigation
            await page.keyboard.press("Enter");
            await page.waitForNavigation({
                waitUntil: "domcontentloaded",
                timeout: TIMEOUT_OPTIONS.timeout,
            });

            // Check for multiple results
            const multipleResults = await page
                .waitForSelector(".searchResults", { timeout: 5000 })
                .then(() => true)
                .catch(() => false);

            if (multipleResults) {
                return reject("Multiple Records Found, Please refine your search");
            }

            // Extract navigation URLs
            const navigationUrls = await extractNavigationUrls(page);

            // Scrape Values page
            const valuesPageData = await scrapeValuesPage(
                page,
                navigationUrls.valuesUrl
            );

            // Scrape tax summary
            const summaryData = await scrapeTaxSummary(
                page,
                navigationUrls.taxSummaryUrl
            );

            // Build tax history
            let { taxHistory, mostRecentYears } = buildTaxHistory(summaryData, years);

            // Get payment history
            const paymentsByYear = await scrapePaymentHistory(
                page,
                mostRecentYears
            );

            // Update tax history with payment dates
            taxHistory = updateTaxHistoryWithPayments(taxHistory, paymentsByYear);
            // ---------------- ADD PREVIOUS YEAR FROM PAYMENTS ----------------
            const existingYears = [...new Set(taxHistory.map(t => parseInt(t.year)))];

            const previousYearEntries = buildPreviousYearFromPayments(
                paymentsByYear,
                existingYears,
                years // <-- ensures max years matches company setting
            );


            if (previousYearEntries.length > 0) {
                taxHistory.push(...previousYearEntries);
                previousYearEntries.forEach(entry => {
                    const y = parseInt(entry.year);
                    if (!mostRecentYears.includes(y)) {
                        mostRecentYears.push(y);
                    }
                });

            }


            // Check for delinquency
            const isDelinquent = await checkDelinquency(page);

            // Calculate delinquent amount
            let delinquentAmount = 0;
            taxHistory.forEach((entry) => {
                if (entry.status === "Delinquent") {
                    const amount = parseFloat(entry.amount_due.replace(/[$,]/g, "")) || 0;
                    delinquentAmount += amount;
                }
            });

            // Build notes
            const notes = buildNotes(isDelinquent, taxHistory, mostRecentYears);

            // Build final data structure
            const delinquentAmountDue =
                delinquentAmount > 0 ? `$${delinquentAmount.toFixed(2)}` : "$0.00";

            const delinquentStatus = isDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "YES";

            const data = {
                processed_date: new Date().toISOString().split("T")[0],
                order_number: "",
                borrower_name: "",
                owner_name: valuesPageData.ownerName ? [valuesPageData.ownerName] : [],
                property_address: valuesPageData.propertyAddress || "",
                parcel_number: parcelId,
                land_value: valuesPageData.landValue || "N/A",
                improvements: valuesPageData.improvements || "N/A",
                total_assessed_value: valuesPageData.assessedValue || "N/A",
                exemption: "",
                total_taxable_value: valuesPageData.assessedValue || "N/A",
                taxing_authority: "Stark County, OH",
                notes: notes,
                delinquent: delinquentStatus,
                delinquent_amount: delinquentAmountDue,
                tax_history: taxHistory,
            };

            resolve(data);
        } catch (error) {
            console.log("Error in ac_1:", error.message);
            reject("Record Not Found");
        }
    });
};


// Wrapper function for account search
const accountSearch = (page, url, account, years) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, url, account, years)
                .then((data) => resolve(data))
                .catch((error) => reject(error));
        } catch (error) {
            reject(error);
        }
    });
};


// Main controller: handles API and HTML routes
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    const finalYears = getOHCompanyYears(client);

    // Validate account number
    if (!account || account.trim() === "") {
        return res.status(400).json({
            error: true,
            message: "Please enter a valid account number",
        });
    }

    // Validate fetch_type
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        const errorResponse = {
            error: true,
            message: "Invalid Access. fetch_type must be 'html' or 'api'",
        };

        return fetch_type === "html"
            ? res.status(400).render("error_data", errorResponse)
            : res.status(400).json(errorResponse);
    }

    let context;

    try {
        const url = `https://realestate.starkcountyohio.gov/search/commonsearch.aspx?mode=realprop`;

        // Launch browser
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Set user agent
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(TIMEOUT_OPTIONS.timeout);

        // Block unnecessary resources for performance
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            const resourceType = request.resourceType();
            if (["stylesheet", "font", "image"].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Handle frontend rendering requests
        if (fetch_type === "html") {
            accountSearch(page, url, account, finalYears)
                .then((data) => res.status(200).render("parcel_data_official", data))
                .catch((error) => {
                    console.log(error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message || error,
                    });
                })
                .finally(async () => {
                    if (context) await context.close();
                });
        }
        // Handle API responses (JSON format)
        else if (fetch_type === "api") {
            accountSearch(page, url, account, finalYears)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message || error,
                    });
                })
                .finally(async () => {
                    if (context) await context.close();
                });
        }
    } catch (error) {
        console.log("Main error:", error.message);
        if (context) await context.close();

        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message || "An error occurred during the search",
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message || "An error occurred during the search",
            });
        }
    }
};

module.exports = { search };