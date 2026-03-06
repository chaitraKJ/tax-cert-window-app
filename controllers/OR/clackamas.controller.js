// Author: Sanam Poojitha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//
// ─── HELPERS ───────────────────────────────────────────────────────────────
//

const logError = (scope, err) => {
    console.error(`[${scope}]`, err?.message || err);
};

const softWait = async (page, selector, timeout = 15000) => {
    try {
        await page.waitForSelector(selector, { timeout, visible: true });
        return true;
    } catch {
        return false;
    }
};

const applyTaxNotes = (data) => {
    const suffix = ", NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15";
    const history = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!history.length) {
        data.notes = "ALL PRIORS ARE PAID" + suffix;
        data.delinquent = "NONE";
        return data;
    }

    history.sort((a, b) => +a.year - +b.year);

    const latest = history.at(-1);
    if (!latest) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    const priors = history.filter(x => x.year < latest.year);
    const priorsUnpaid = priors.some(x => ["Delinquent", "Due"].includes(x.status));
    const anyDelq = history.some(x => x.status === "Delinquent");

    const priorsTxt = priorsUnpaid ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    switch (latest.status) {
        case "Paid":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
            break;
        case "Due":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DUE${suffix}`;
            break;
        case "Delinquent":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
            break;
        default:
            data.notes = `${latest.year} TAX STATUS UNKNOWN, PLEASE VERIFY MANUALLY.${suffix}`;
    }

    if (anyDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (latest.status === "Due" || priorsUnpaid) {
        data.delinquent = "YES";
    } else {
        data.delinquent = "NONE";
    }

    return data;
};

//
// ─── AC-1: Search / Open Parcel ────────────────────────────────────────────
//

async function ac_1(page, account) {
    const url = "https://ascendweb.clackamas.us/";
    try {

        await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });


        await page.waitForSelector("#MainContent_mParcelID2", { timeout: 30000 });

        await page.evaluate(() => {
            const el = document.querySelector("#MainContent_mParcelID2");
            if (el) el.value = "";
        });
        await page.type("#MainContent_mParcelID2", String(account), { delay: 20 });

        // Use evaluate() click to trigger ASP.NET postback properly
        await page.evaluate(() => {
            const btn = document.querySelector("#MainContent_mSubmit");
            if (btn) btn.click();
        });

        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector("#MainContent_mParcelNumber", { timeout: 30000 });

        const finalUrl = page.url();


        return finalUrl;
    } catch (err) {
        logError("AC_1", err);
        throw new Error(`AC_1 failed: ${err.message}`);
    }
}


//
// ─── AC-2: Scrape Tax Data (Clackamas + Notes Integration) ─────────────────
//


async function ac_2(page) {
    try {
        await softWait(page, "#MainContent_mParcelNumber");

        const data = await page.evaluate(() => {
            const get = (sel) =>
                document.querySelector(sel)?.innerText.trim() || "";

            // --------------------------------------------------------
            // OWNER + AVR
            // --------------------------------------------------------
            const owner_name = [];
            const ownerRows = document.querySelectorAll("table tr");

            ownerRows.forEach((row) => {
                const tds = row.querySelectorAll("td");
                if (tds.length >= 3 && tds[0].innerText.trim() === "Owner") {
                    owner_name.push(tds[2].innerText.trim());
                }
            });

            let latest_assessed_value = "";
            try {
                const avrRow = [...document.querySelectorAll("tr")]
                    .find((tr) => tr.innerText.includes("AVR Total"));

                if (avrRow) {
                    const tds = avrRow.querySelectorAll("td");
                    latest_assessed_value = tds[1]?.innerText.trim() || "";
                }
            } catch (e) { }

            // --------------------------------------------------------
            // TAX HISTORY
            // --------------------------------------------------------
            let tax_history = [];

            const taxGrid = document.querySelector("#MainContent_mGrid");
            const receiptsGrid = document.querySelector("#MainContent_mReceipts");

            // Helper: Assign trimester based on receipt date
            // Helper: Assign trimester based on paid date
            function assignTrimester(paid_date) {
                const d = new Date(paid_date);
                const month = d.getMonth() + 1; // Jan=1
                const year = d.getFullYear();

                let taxYear;
                let trimester;
                let due_date;

                // ------------------------------
                // Oregon Trimester Rules:
                //  1st Trimester: 11/15 of tax year
                //  2nd Trimester: 02/15 of following year
                //  3rd Trimester: 05/15 of following year
                // ------------------------------

                if (month === 11 || month === 12) {
                    // Paid in Nov/Dec → 1st Trimester of *same calendar year*
                    taxYear = year;
                    trimester = 1;
                    due_date = new Date(`${taxYear}-11-15`);
                } else if (month === 1 || month === 2) {
                    // Paid Jan–Feb → always 2nd Trimester of previous tax year
                    taxYear = year - 1;
                    trimester = 2;
                    due_date = new Date(`${taxYear + 1}-02-15`);
                } else if (month >= 3 && month <= 5) {
                    // Paid Mar–May → always 3rd Trimester of previous tax year
                    taxYear = year - 1;
                    trimester = 3;
                    due_date = new Date(`${taxYear + 1}-05-15`);
                } else {
                    // Should rarely occur, but default to 3rd trimester
                    taxYear = year;
                    trimester = 3;
                    due_date = new Date(`${taxYear}-11-15`);
                }

                return { taxYear, trimester, due_date };
            }

            // --------------------------------------------------------
            // PAID RECEIPTS
            // --------------------------------------------------------
            if (receiptsGrid) {
                const rows = [...receiptsGrid.querySelectorAll("tr")].slice(1);

                let receipts = rows.map((r) => {
                    const tds = r.querySelectorAll("td");
                    if (tds.length < 5) return null;

                    const paid_date = tds[0].innerText.trim().split(" ")[0];
                    const amountApplied = tds[2].innerText.trim();
                    const base_amount = tds[3].innerText.trim();
                    const amount_paid = tds[4].innerText.trim();

                    return {
                        paid_date,
                        base_amount,
                        amountApplied,
                        amount_paid
                    };
                }).filter(Boolean);

                receipts.sort((a, b) => new Date(a.paid_date) - new Date(b.paid_date));

                receipts.forEach((r) => {
                    const { taxYear, trimester, due_date } = assignTrimester(r.paid_date);
                    const delq_date = new Date(due_date.getTime() + 86400000)
                        .toLocaleDateString();

                    const payment_type =
                        r.amountApplied == r.base_amount
                            ? "Annual"
                            : `${trimester}${["", "st", "nd", "rd"][trimester]} Trimester`;

                    tax_history.push({
                        jurisdiction: "County",
                        year: taxYear,
                        base_amount: r.base_amount,
                        amount_due: "$0.00",
                        mailing_date: "N/A",
                        due_date: due_date.toLocaleDateString(),
                        delq_date,
                        paid_date: r.paid_date,
                        good_through_date: "",
                        amount_paid: r.amount_paid,
                        payment_type,
                        status: "Paid"
                    });
                });
            }

            // --------------------------------------------------------
            // UNPAID TAXES
            // --------------------------------------------------------
            if (taxGrid) {
                const rows = [...taxGrid.querySelectorAll("tr")].slice(1);

                let totalCharged = 0;
                let totalBalance = 0;
                let taxYear = null;
                let dueDate = null;

                rows.forEach((row) => {
                    const tds = row.querySelectorAll("td");
                    if (tds.length < 7) return;

                    // skip total rows
                    if (tds[0].innerText.includes("TOTAL")) {
                        totalCharged = tds[3].innerText.trim();
                        totalBalance = tds[5].innerText.trim();
                        dueDate = tds[6].innerText.trim();
                        return;
                    }

                    // capture year from first actual line item
                    if (!taxYear) {
                        const yearText = tds[0].innerText.trim();
                        if (/^\d{4}$/.test(yearText)) taxYear = yearText;
                    }
                });

                if (taxYear && totalBalance) {
                    const numericBalance = parseFloat(totalBalance.replace(/[$,]/g, "")) || 0;
                    const today = new Date();

                    // Correct delinquent date for Oregon counties = Dec 16
                    const delqDate = new Date(`${taxYear}-12-16`);

                    let status = numericBalance > 0
                        ? (today > delqDate ? "Delinquent" : "Due")
                        : "Paid";

                    tax_history.push({
                        jurisdiction: "County",
                        year: taxYear,
                        base_amount: totalCharged,
                        amount_due: totalBalance,
                        mailing_date: "N/A",
                        due_date: dueDate,
                        delq_date: delqDate.toLocaleDateString(),
                        paid_date: "",
                        good_through_date: "",
                        amount_paid: "$0.00",
                        payment_type: "Annual",
                        status
                    });
                }
            }

            // --------------------------------------------------------
            // KEEP ONLY THE MOST RECENT YEAR
            // --------------------------------------------------------
            const allYears = tax_history.map((t) => parseInt(t.year)).filter(Boolean);
            const latestYear = allYears.length ? Math.max(...allYears) : null;

            const recentHistory = latestYear
                ? tax_history.filter((t) => parseInt(t.year) === latestYear)
                : [];

            return {
                owner_name,
                property_address: get("#MainContent_mSitusAddress"),
                parcel_number: get("#MainContent_mParcelNumber"),
                total_assessed_value: latest_assessed_value || "$0.00",
                total_taxable_value: latest_assessed_value || "$0.00",
                taxing_authority:
                    "Clackamas County Assessor, 150 Beavercreek Rd #160, Oregon City, OR 97045",
                tax_history: recentHistory,
                notes: latestYear
                    ? `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMAL DUE DATES: 11/15, 02/15, 05/15`
                    : "",
                delinquent: "NONE"
            };
        });
        // ------------------------------------------------------------
        // GENERATE ALL 3 TRIMESTERS FOR TRIMESTER COUNTIES
        // ------------------------------------------------------------


        const recentHistory = data.tax_history;

        if (recentHistory.length > 0) {
            const year = parseInt(recentHistory[0].year);

            // Map existing trimesters
            const trimesterMap = {};
            recentHistory.forEach(item => {
                const t = item.payment_type.includes("Trimester")
                    ? parseInt(item.payment_type)
                    : null;
                if (t) trimesterMap[t] = item;
            });

            // Calculate total tax using the first trimester
            const first = trimesterMap[1];
            if (first) {
                const amt = parseFloat(first.base_amount.replace(/[$,]/g, ""));
                const trimesterAmount = amt / 3;

                // Helper to create trimester rows
                function makeTrimester(t) {
                    const dueDates = {
                        1: `11/15/${year}`,
                        2: `02/15/${year + 1}`,
                        3: `05/15/${year + 1}`
                    };
                    const delqDates = {
                        1: `11/16/${year}`,
                        2: `02/16/${year + 1}`,
                        3: `05/16/${year + 1}`
                    };

                    const dueDateObj = new Date(dueDates[t]);
                    const delqDateObj = new Date(delqDates[t]);
                    const today = new Date();

                    let status = today > delqDateObj ? "Delinquent" : "Due";


                    return {
                        jurisdiction: "County",
                        year: year,
                        base_amount: `$${trimesterAmount.toFixed(2)}`,
                        amount_due: `$${trimesterAmount.toFixed(2)}`,
                        mailing_date: "N/A",
                        due_date: dueDates[t],
                        delq_date: delqDates[t],
                        paid_date: "-",
                        good_through_date: "",
                        amount_paid: "$0.00",
                        payment_type: `Trimester`,
                        status
                    };
                }

                // Update all existing trimesters with the calculated base amount
                for (let t = 1; t <= 3; t++) {
                    if (trimesterMap[t]) {
                        // Always set base_amount, regardless of status
                        trimesterMap[t].base_amount = `$${trimesterAmount.toFixed(2)}`;
                        trimesterMap[t].payment_type = "Trimester"

                    } else {
                        // Create missing trimester rows
                        recentHistory.push(makeTrimester(t));
                    }
                }

                // Sort by trimester order
                recentHistory.sort((a, b) =>
                    parseInt(a.payment_type) - parseInt(b.payment_type)
                );

                // Update status for unpaid rows
                const today = new Date();
                recentHistory.forEach(item => {
                    if (item.status !== "Paid") {
                        const delq = new Date(item.delq_date);
                        item.status = today > delq ? "Delinquent" : "Due";
                    }
                });
            }
        }




        return applyTaxNotes(data);

    } catch (err) {
        logError("AC_2", err);
        throw new Error(`AC_2 failed: ${err.message}`);
    }
}

//
// ─── COMBINED SEARCH ───────────────────────────────────────────────────────
//

async function accountSearch(page, account) {
    try {
        await ac_1(page, account);
        return await ac_2(page);
    } catch (err) {
        logError("ACCOUNT_SEARCH", err);
        throw new Error(`Account search failed: ${err.message}`);
    }
}

//
// ─── EXPRESS HANDLER ───────────────────────────────────────────────────────
//

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser;

    try {
        if (!account) return res.status(400).json({ error: "account must be provided" });

        if (!["html", "api"].includes(fetch_type)) {
            return res.status(400).json({ error: "Invalid fetch_type, must be 'html' or 'api'" });
        }

        browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        );

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "font"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const data = await accountSearch(page, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

        await context.close();
    } catch (error) {
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message
            });
        } else {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

module.exports = { search };