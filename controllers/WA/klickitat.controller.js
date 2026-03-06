// Author: Sanam Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const logError = (scope, err) => {
    console.error(`[${scope}]`, err?.message || err);
};

// ---------------- TAX NOTES LOGIC ------------------

const applyTaxNotes = (data) => {
    const suffix = ",NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY NORMAL DUE DATES ARE 04/30 AND 10/31";
    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +a.year - +b.year);
    const latest = list.at(-1);
    const priors = list.filter(x => x.year < latest.year);
    const anyDelq = list.some(x => x.status === "Delinquent");
    const priorsDelq = priors.some(x => ["Delinquent", "Due"].includes(x.status));
    const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    if (latest.status === "Paid")
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
    else if (latest.status === "Delinquent")
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
    else
        data.notes = `${priorsTxt}, ${latest.year} TAX STATUS UNKNOWN${suffix}`;

    if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    else if (latest.status === "Due") data.delinquent = "YES";
    else data.delinquent = "NONE";

    return data;
};

// ---------------- AC-1: SEARCH PARCEL ------------------

async function ac_1(page, parcel) {
    try {
        const url = "http://www.klickitatcountytreasurer.org/propertysearch.aspx";
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

        // Fill parcel
        await page.type("#body_txtParcelNumber", String(parcel), { delay: 30 });

        // Click search
        await page.click("#body_btnSearchParcelNumber");

        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 });

        // If redirected to propertyinfo.aspx → success
        if (!page.url().includes("propertyinfo.aspx")) {
            throw new Error("Parcel not found");
        }
    } catch (err) {
        logError("AC_1", err);
        throw new Error(`AC_1 failed: ${err.message}`);
    }
}

// ---------------- AC-2: SCRAPE DATA ------------------

async function ac_2(page) {
    try {
        const fmt = n => `$${Number(n || 0).toFixed(2)}`;
        const cleanNum = v => Number(String(v || "0").replace(/[^0-9.]/g, ""));
        const today = new Date();  // NEW RULE

        const data = {
            owner_name: [],
            parcel_number: "",
            property_address: "",
            total_assessed_value: "N/A",
            total_taxable_value: "N/A",
            taxing_authority:
                "Klickitat County Treasurer, 205 S. Columbus Ave, Room 203, Goldendale, WA 98620",
            tax_history: [],
            notes: "",
            delinquent: ""
        };

        // ---------------- HEADER ----------------
        const header = await page.evaluate(() => {
            const g = id => document.querySelector(`#${id}`)?.innerText.trim() || "";
            return {
                parcel: g("body_lblParcelNumber"),
                owner: g("body_lblTaxpayerName"),
                situs: g("body_lblSitusAddress")
            };
        });

        data.parcel_number = header.parcel;
        data.property_address = header.situs;
        if (header.owner) data.owner_name = [header.owner];

        // ---------------- TAXABLE VALUE ----------------
        const values = await page.evaluate(() => {
            const row = document.querySelector("#body_tbAssessedValues tr:nth-child(2)");
            if (!row) return {};
            const c = row.querySelectorAll("td");
            return { taxable: c[1]?.innerText.trim() };
        });

        if (values.taxable) {
            data.total_taxable_value = `$${values.taxable}`;
            data.total_assessed_value = `$${values.taxable}`;
        }

        // ---------------- PAYMENT HISTORY ----------------
        const payments = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("#body_tbPayments tr"))
                .slice(1)
                .filter(r => r.querySelectorAll("td").length === 3)
                .map(r => {
                    const c = r.querySelectorAll("td");
                    return {
                        year: Number(c[0].innerText.trim()),
                        paid_date: c[1].innerText.trim(),
                        amount: c[2].innerText.trim()
                    };
                });
        });

        // ---------------- BASE AMOUNT ----------------
        const baseAmounts = await page.evaluate(() => {
            const map = {};
            const rows = Array.from(document.querySelectorAll("#body_tbChargeHistory tr"));
            rows.forEach(r => {
                const c = r.querySelectorAll("td");
                if (c.length === 3 && c[1].innerText.includes("Total")) {
                    const year = c[1].innerText.match(/\d+/)?.[0];
                    if (year) map[year] = c[2].innerText.trim();
                }
            });
            return map;
        });

        // ---------------- DUE AMOUNT (from summary) ----------------
        const dueAmounts = await page.evaluate(() => {
            const map = {};
            const rows = Array.from(document.querySelectorAll("#body_tbCurrentTaxSummary tr"));
            rows.forEach(r => {
                const c = r.querySelectorAll("td");
                if (c.length === 3) {
                    const year = c[0].innerText.trim();
                    const type = c[1].innerText.trim().toLowerCase();
                    if (type === "total") {
                        map[year] = c[2].innerText.trim();
                    }
                }
            });
            return map;
        });

        // ---------------- YEAR DATA ----------------
        const recentYear = Math.max(...payments.map(p => p.year));
        const yearPayments = payments.filter(p => p.year === recentYear);

        const baseAmt = cleanNum(baseAmounts[recentYear] || 0);
        const amtDue = cleanNum(dueAmounts[recentYear] || 0);
        const amtPaid = cleanNum(
            yearPayments.reduce((sum, p) => sum + cleanNum(p.amount), 0)
        );

        // ---------------- ANNUAL RULE ----------------
        // PAYMENT COUNT
        const paymentCount = yearPayments.length;

        // Extract dates
        const firstPaymentDate = yearPayments[0]
            ? new Date(yearPayments[0].paid_date)
            : null;

        // Annual rule
        let isAnnual = false;
        if (paymentCount === 1) {
            const startAnnual = new Date(`05/01/${recentYear}`);  // after 1st half delinquent
            const endAnnual = new Date(`10/31/${recentYear}`);    // before 2nd half delinquent

            const dateValid =
                firstPaymentDate >= startAnnual &&
                firstPaymentDate <= endAnnual;

            const amountValid =
                Math.abs(baseAmt - amtPaid) <= 0.05;

            if (dateValid && amountValid) {
                isAnnual = true;
            }
        }


        if (isAnnual) {
            const dueDate = `10/31/${recentYear}`;
            const delqDate = `11/01/${recentYear}`;

            data.tax_history.push({
                year: recentYear,
                jurisdiction: "County",
                base_amount: fmt(baseAmt),
                amount_due: fmt(amtDue),
                amount_paid: fmt(amtPaid),
                payment_type: "Annual",
                paid_date: yearPayments[0]?.paid_date || "",
                status: "Paid",
                due_date: dueDate,
                delq_date: delqDate,
                mailing_date: "N/A"
            });

            applyTaxNotes(data);
            return data;
        }

        // ---------------- SEMI-ANNUAL ----------------
        const half = baseAmt / 2;
        const p1 = cleanNum(yearPayments[0]?.amount || 0);
        const p2 = cleanNum(yearPayments[1]?.amount || 0);

        // FIRST HALF
        const fhDelq = new Date(`05/01/${recentYear}`);
        const firstPaid = Math.abs(half - p1) <= 0.05;
        const firstStatus = firstPaid
            ? "Paid"
            : today < fhDelq ? "Due" : "Delinquent";

        data.tax_history.push({
            year: recentYear,
            jurisdiction: "County",
            base_amount: fmt(half),
            amount_due: firstStatus === "Paid" ? fmt(0) : fmt(amtDue),
            amount_paid: fmt(p1),
            payment_type: "Semi-Annual",
            paid_date: yearPayments[0]?.paid_date || "",
            status: firstStatus,
            due_date: `04/30/${recentYear}`,
            delq_date: `05/01/${recentYear}`,
            mailing_date: "N/A"
        });

        // SECOND HALF
        const shDelq = new Date(`11/01/${recentYear}`);
        const secondPaid = Math.abs(half - p2) <= 0.05;
        const secondStatus = secondPaid
            ? "Paid"
            : today < shDelq ? "Due" : "Delinquent";

        data.tax_history.push({
            year: recentYear,
            jurisdiction: "County",
            base_amount: fmt(half),
            amount_due: secondStatus === "Paid" ? fmt(0) : fmt(amtDue),
            amount_paid: fmt(p2),
            payment_type: "Semi-Annual",
            paid_date: yearPayments[1]?.paid_date || "-",
            status: secondStatus,
            due_date: `10/31/${recentYear}`,
            delq_date: `11/01/${recentYear}`,
            mailing_date: "N/A"
        });

        applyTaxNotes(data);
        return data;

    } catch (err) {
        logError("AC_2", err);
        throw new Error(`AC_2 failed: ${err.message}`);
    }
}

// ---------------- COMBINED SEARCH ------------------

const account_search = async (page, parcel) => {
    return new Promise((resolve, reject) => {

        ac_1(page, parcel)
            .then(() => {
                ac_2(page)
                    .then((data) => {
                        resolve(data);
                    })
                    .catch((error) => {
                        console.log("ac_2 error:", error.message);
                        reject(new Error(error.message));
                    });

            })
            .catch((error) => {
                console.log("ac_1 error:", error.message);
                reject(new Error(error.message));
            });

    });
};

// ---------------- EXPRESS HANDLER ------------------

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {

            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        // await page.setViewport({ width: 1366, height: 768});
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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
                    console.log(error)
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                })
        }
        else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    })
                })
                .catch((error) => {
                    console.log(error)
                    res.status(500).json({
                        error: true,
                        message: error.message
                    })
                })
                .finally(async () => {
                    await context.close();
                })
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

module.exports = { search };