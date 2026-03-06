// Author: Sanam Poojitha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

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

//
// ─── TAX NOTE LOGIC ─────────────────────────────────────────────────────────
//
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`;

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +a.year - +b.year);
    const latest = list.at(-1);

    const priors = list.filter((x) => x.year < latest.year);
    const anyDelq = list.some((x) => x.status === "Delinquent");
    const priorsDelq = priors.some((x) => ["Delinquent", "Due"].includes(x.status));

    const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

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
            data.notes = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY${suffix}`;
    }

    if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
    else data.delinquent = "NONE";

    return data;
};


//
// ─── AC-1: Search Parcel ───────────────────────────────────────────────────
//
async function ac_1(page, account) {
    try {
        const url = "https://apps.clatsopcounty.gov/property/";

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Clean taxid
        await page.evaluate(() => {
            const el = document.querySelector("input[name='taxid']");
            if (el) el.value = "";
        });

        await page.type("input[name='taxid']", String(account), { delay: 25 });

        await Promise.all([
            page.click("button[type='submit']"),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]);

        // Now inside the parcel results page – ensure table exists
        const good = await softWait(page, "table");
        if (!good) throw new Error("NO RESULTS FOUND");

        return page.url();
    } catch (err) {
        logError("AC_1", err);
        throw new Error(`AC_1 failed: ${err.message}`);
    }
}


//
// ─── AC-2: Scrape Parcel Data ──────────────────────────────────────────────
//
async function ac_2(page) {
    try {
        //
        // SCRAPE OWNER + ADDRESS + PARCEL
        //
        const data = await page.evaluate(() => {
            const owners = $("td:contains('Owner Name')").next().next().text().trim();
            const property_address = $("td:contains('Property Address')").next().next().text().trim();
            const account_id = $("td:contains('Account ID')").next().next().text().trim() || "";

            const ownerArray = owners ? owners.split(',').map(o => o.trim()) : [];

            return {
                owner_name: ownerArray,
                property_address,
                parcel_number: account_id,
                taxing_authority: `Clatsop County Tax Collector 820 Exchange Street, Suite 210 Astoria, OR 97103`,
                total_assessed_value: "",
                total_taxable_value: "",
                tax_history: [],
                notes: "",
                delinquent: "",
            };
        });

        //
        // CLICK ASSESSMENT TAB
        //
        const assessTab = await page.$("a.nav-link[href='#assessment']");
        if (assessTab) {
            await assessTab.click();
            await page.waitForSelector("#assessment table", { timeout: 20000 }).catch(() => {});
        }

        //
        // SCRAPE ASSESSED VALUE
        //
        try {
            const latestAssessed = await page.evaluate(() => {
                const firstRow = document.querySelector("#assessments table tbody tr");
                if (!firstRow) return "";
                const tds = firstRow.querySelectorAll("td");
                return tds.length >= 5 ? tds[4].innerText.trim() : "";
            });

            if (latestAssessed) {
                data.total_assessed_value = latestAssessed;
                data.total_taxable_value = latestAssessed;
            }
        } catch {}

        //
        // CLICK TAXES TAB
        //
        const taxesTab = await page.$("a.nav-link[href='#taxes']");
        if (taxesTab) {
            await taxesTab.click();
            await page.waitForSelector("#taxes table", { timeout: 20000 });
        }

        //
        // SCRAPE TAX DUE TABLE
        //
        const dues = await page.$$eval("#taxes table tbody tr", rows =>
            rows.map(r => {
                const t = r.querySelectorAll("td");
                if (!t.length) return null;

                return {
                    year: t[0]?.innerText.trim(),
                    total_billed: t[1]?.innerText.trim() || "",
                    interest: t[2]?.innerText.trim() || "",
                    discount: t[3]?.innerText.trim() || "",
                    amount_due: t[t.length - 1]?.innerText.trim() || "", 
                };
            }).filter(Boolean)
        );

        //
        // CLICK PAYMENTS TAB
        //
        const payTab = await page.$("a.nav-link[href='#payments']");
        let payments = [];

        if (payTab) {
            await payTab.click();
            await page.waitForSelector("#payments table", { timeout: 20000 });

            payments = await page.$$eval("#payments table tbody tr", rows =>
                rows.map(r => {
                    const t = r.querySelectorAll("td");
                    return {
                        year: t[0]?.innerText.trim(),
                        receipt_no: t[1]?.innerText.trim(),
                        paid_date: t[2]?.innerText.trim(),
                        amount_paid: t[3]?.innerText.trim()
                    };
                })
            );
        }

        //
        // DETERMINE STATUS FOR EACH DUE
        //
        const today = new Date();
        dues.forEach(d => {
            const amountDueNum = Number(d.amount_due.replace(/[^0-9.-]/g, "")) || 0;
            const delqDate = new Date(+d.year + 1, 4, 16); // May 16 of following year

            if (amountDueNum > 0 && delqDate < today) {
                d.status = "Delinquent";
            } else if (amountDueNum > 0) {
                d.status = "Due";
            } else {
                d.status = "Paid";
            }
        });

        //
        // BUILD TAX HISTORY
        //
        let history = [];
        const hasAnyDue = dues.some(d => d.status === "Delinquent" || d.status === "Due");

        if (hasAnyDue) {
            history = dues
                .filter(d => d.status === "Delinquent" || d.status === "Due")
                .map(d => ({
                    year: d.year,
                    jurisdiction: "County",
                    base_amount: d.total_billed,
                    amount_due: d.amount_due,
                    amount_paid: "$0.00",
                    paid_date: "",
                    receipt_no: "",
                    payment_type: "Annual",
                    mailing_date: "N/A",
                    due_date: `11/17/${d.year}`,
                    delq_date: `11/18/${d.year}`,
                    status: d.status
                }));

            data.delinquent = "YES";

        } else {
            // CASE: no due → latest paid
            let latest = null;
            payments.forEach(p => {
                if (!latest || Number(p.year) > Number(latest.year)) latest = p;
            });

            if (latest) {
                let paid_date = "";
                if (latest.paid_date) {
                    const pd = new Date(latest.paid_date);
                    if (!isNaN(pd)) {
                        const month = String(pd.getMonth() + 1).padStart(2, "0");
                        const day = String(pd.getDate()).padStart(2, "0");
                        const year = pd.getFullYear();
                        paid_date = `${month}/${day}/${year}`;
                    }
                }

                const billed = dues.find(d => d.year === latest.year)?.total_billed || latest.amount_paid;

                history.push({
                    year: latest.year,
                    jurisdiction: "County",
                    base_amount: billed,
                    amount_due: "$0.00",
                    amount_paid: latest.amount_paid || "",
                    paid_date,
                    receipt_no: latest.receipt_no || "",
                    payment_type: "Annual",
                    mailing_date: "N/A",
                    due_date: `11/17/${latest.year}`,
                    delq_date: `11/18/${latest.year }`,
                    status: "Paid"
                });
            }
            data.delinquent = "NONE";
        }

        data.tax_history = history;

        //
        // APPLY NOTES
        //
        if (typeof applyTaxNotes === "function") {
            applyTaxNotes(data);
        }

        return data;

    } catch (err) {
        console.log("AC_2 ERROR", err);
        throw new Error(`AC_2 failed: ${err.message}`);
    }
}

//
// ─── Unified ───────────────────────────────────────────────────────────────
//
async function accountSearch(page, account) {
    await ac_1(page, account);
    return await ac_2(page);
}


//
// ─── EXPRESS HANDLER ───────────────────────────────────────────────────────
//
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser;

    try {
        if (!account)
            return res.status(400).json({ error: "account is required" });

        browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Block images
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            if (["image", "font"].includes(request.resourceType())) request.abort();
            else request.continue();
        });

        const result = await accountSearch(page, account);

        if (fetch_type === "html")
            res.status(200).render("parcel_data_official", result);
        else res.status(200).json({ result });

        await context.close();
    } catch (e) {
        logError("SEARCH", e);

        if (fetch_type === "html")
            res.status(200).render("error_data", {
                error: true,
                message: e.message,
            });
        else
            res.status(500).json({
                error: true,
                message: e.message,
            });
    }
};

module.exports = { search };