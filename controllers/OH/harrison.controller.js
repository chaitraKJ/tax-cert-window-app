//Author: Sanam Poojitha
//counties--hardin,wyandot,crawford,harrison,noble
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Function to apply tax notes
const applyTaxNotes = (data) => {
    const suffix = `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/15 07/15`;

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    // Sort by year ascending
    const getYearValue = (y) => {
        if (typeof y === "number") return y;
        if (typeof y === "string" && y.includes("-")) {
            return Number(y.split("-")[0]);
        }
        return Number(y) || 0;
    };

    list.sort((a, b) => getYearValue(a.year) - getYearValue(b.year));


    const latest = list.at(-1);

    const priors = list.filter((x) => x.year < latest.year);
    const priorsDelq = priors.some((x) => ["Due", "Delinquent"].includes(x.status));
    const anyDelq = list.some((x) => x.status === "Delinquent");
    const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    let latestTxt = "";
    if (latest.status === "Paid") latestTxt = `${latest.year} TAXES ARE PAID`;
    else if (latest.status === "Due") latestTxt = `${latest.year} TAXES ARE DUE`;
    else if (latest.status === "Delinquent") latestTxt = `${latest.year} TAXES ARE DELINQUENT`;
    else latestTxt = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY`;

    data.notes = `${priorsTxt}, ${latestTxt}${suffix}`;

    if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
    else data.delinquent = "NONE";

    return data;
};

// -----------------------------------------
// HARRISON — STEP 1 (search by parcel)
// -----------------------------------------
const hardin_1 = async (page, url, parcel) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });

            // Click Parcel Number radio
            await page.waitForSelector("input[name='item'][value='Parn']", { timeout: 15000 });
            await page.click("input[name='item'][value='Parn']");

            await page.waitForNavigation({ waitUntil: "networkidle2" });

            // Enter parcel number
            await page.waitForSelector("input[name='quantity']", { timeout: 15000 });
            await page.$eval("input[name='quantity']", el => el.value = "");
            await page.type("input[name='quantity']", String(parcel), { delay: 50 });

            // Submit search
            await Promise.all([
                page.click("input[type='submit'][value='Search']"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);

            // Grab first parcel link
            const first = await page.$("a[href*='re-chg.php?account']");
            if (!first) return reject(new Error("Parcel not found"));

            const detailUrl = await page.evaluate(a => a.href, first);
            resolve(detailUrl);

        } catch (err) {
            reject(err);
        }
    });
};

// -----------------------------------------
// HARRISON — STEP 2 (scrape parcel detail page)
// -----------------------------------------
const hardin_2 = async (page, url, accountNumber, county, yearsRequired = 1) => {

    try {
        await page.goto(url, { waitUntil: "networkidle2" });
        const countyName = (county || "").toLowerCase();

        // -----------------------------
        // Helpers
        // -----------------------------
        const cleanNum = (v) => Number((v || "").replace(/[^0-9.]/g, "")) || 0;
        const formatMoney = (num) =>
            "$" + Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

        const fmtDate = (d) => {
            if (!d || d === "0001-01-01") return "-";

            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                const [y, m, day] = d.split("-");
                return `${m}/${day}/${y}`;
            }

            if (/^\d{2}\/\d{2}\/\d{2}$/.test(d)) {
                const [m, day, yy] = d.split("/");
                return `${m}/${day}/20${yy}`;
            }

            return d;
        };

        // -----------------------------
        // 1. BASIC INFO
        // -----------------------------
        await page.waitForSelector("#headtable");
        const header = await page.evaluate(() => {
            const get = (s) =>
                document.querySelector(s)?.innerText.trim().replace(/\s+/g, " ") || "";
            return {
                owner_name: get("#headtable td:nth-child(2)"),
                parcel_number: get("#headtable td:last-child")
            };
        });

        // -----------------------------
        // 2. PROPERTY INFO
        // -----------------------------
        const main = await page.evaluate(() => {
            const get = (s) =>
                document.querySelector(s)?.innerText.trim().replace(/\s+/g, " ") || "";

            const findVal = (lbl) => {
                const th = Array.from(document.querySelectorAll("#maintable th"))
                    .find(x => x.innerText.trim() === lbl);
                return th ? (th.parentElement.querySelector("td:last-child")?.innerText.trim() || "0") : "0";
            };

            return {
                property_address: get("#maintable tr:nth-child(2) td[colspan='2']"),
                land_value: findVal("Land"),
                building_value: findVal("Building"),
                total_value: findVal("Total")
            };
        });

        // -----------------------------
        // 3. DETAIL PAGE
        // -----------------------------
        let taxTable = {
            base_1st: 0, base_2nd: 0,
            due_1st: 0, due_2nd: 0,
            prior_charge: 0, prior_due: 0
        };

        let paymentDates = [];
        let detailLoaded = false;

        const payLink = await page.$("a[href*='re-chg.php'][href*='detail=Y']");
        if (payLink) {
            const payUrl = await page.evaluate(a => a.href, payLink);
            await page.goto(payUrl, { waitUntil: "networkidle2" });

            const detailEmpty = await page.evaluate(() => {
                const table = document.querySelector("#maintable2");
                if (!table) return true;
                const rows = Array.from(table.querySelectorAll("tr"));
                const labels = ["Charge", "Due"];
                const relevant = rows.filter(r =>
                    labels.includes(r.querySelector("th")?.innerText.trim())
                );
                return relevant.every(r =>
                    Array.from(r.querySelectorAll("td")).every(td => !td.innerText.trim())
                );
            });

            if (!detailEmpty) {
                detailLoaded = true;

                taxTable = await page.evaluate(() => {
                    const clean = (v) => Number(v.replace(/[^0-9.]/g, "")) || 0;
                    const rows = Array.from(document.querySelectorAll("#maintable2 tr"));

                    const findRow = (label) =>
                        rows.find(r => r.querySelector("th")?.innerText.trim() === label);

                    const parseSemiRow = (row) => {
                        if (!row) return { first: 0, second: 0 };
                        const tds = row.querySelectorAll("td");
                        return {
                            first: clean(tds[2]?.innerText || "0"),
                            second: clean(tds[4]?.innerText || "0")
                        };
                    };

                    const chargeRow = findRow("Charge");
                    const dueRow = findRow("Due");
                    const charge = parseSemiRow(chargeRow);
                    const due = parseSemiRow(dueRow);
                    const prior_charge = clean(chargeRow?.querySelector("td:nth-child(2)")?.innerText || "0");
                    const prior_due = clean(dueRow?.querySelector("td:nth-child(2)")?.innerText || "0");

                    return {
                        base_1st: charge.first,
                        base_2nd: charge.second,
                        due_1st: due.first,
                        due_2nd: due.second,
                        prior_charge,
                        prior_due
                    };
                });

                paymentDates = await page.evaluate(() => {
                    const cleanNum = (v) => Number(v.replace(/[^0-9.]/g, "")) || 0;
                    const tables = Array.from(document.querySelectorAll("#maintable2"));
                    const tbl = tables.find(t => t.innerText.includes("Payment Information"));
                    if (!tbl) return [];
                    const rows = Array.from(tbl.querySelectorAll("tr"));
                    const arr = [];
                    rows.forEach(r => {
                        const tds = r.querySelectorAll("td");
                        if (tds.length < 3) return;
                        const date = tds[1]?.innerText.trim();
                        const amt = tds[2]?.innerText.trim();
                        if (!date || date === "0001-01-01") return;
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
                        arr.push({ date, amount: cleanNum(amt) });
                    });
                    return arr;
                });

                const hasPaymentHistory = paymentDates && paymentDates.length > 0;
                const semiAnnualMissing =
                    taxTable.base_1st === 0 &&
                    taxTable.base_2nd === 0 &&
                    taxTable.due_1st === 0 &&
                    taxTable.due_2nd === 0;

                if (taxTable.prior_charge > 0 && semiAnnualMissing && hasPaymentHistory) {
                    detailLoaded = true;
                }
                if (taxTable.prior_charge > 0 && semiAnnualMissing && !hasPaymentHistory) {
                    detailLoaded = false;
                }
            }
        }

        // -----------------------------
        // 4. HISTORY PAGE (fallback)
        // -----------------------------
        if (!detailLoaded && accountNumber) {
            let historyUrl = "";
            if (countyName.includes("hardin"))
                historyUrl = `http://realestate.co.hardin.oh.us/re-hstp.php?account=${accountNumber}&rec=2`;
            else if (countyName.includes("wyandot"))
                historyUrl = `http://realestate.co.wyandot.oh.us/re/re-hstp.php?account=${accountNumber}&rec=15`;
            else if (countyName.includes("crawford"))
                historyUrl = `http://realestate.crawford-co.org/re-hstp.php?account=${accountNumber}&rec=6`;
            else if (countyName.includes("noble"))
                historyUrl = `http://70.62.18.11/reaweb/re-hstp.php?account=${accountNumber}&rec=1`;
            else if (countyName.includes("harrison"))
                historyUrl = `http://208.79.141.29/reaweb/re-hstp.php?account=${accountNumber}&rec=1`;

            if (historyUrl) {
                await page.goto(historyUrl, { waitUntil: "networkidle2" });
                paymentDates = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll("#maintable tr"));
                    let latestYear = 0;
                    const out = [];
                    for (const r of rows) {
                        if (r.id === "ownerbio") {
                            const yr = Number(r.querySelector("td")?.innerText.trim());
                            if (yr > latestYear) latestYear = yr;
                        }
                    }
                    let active = null;
                    for (const r of rows) {
                        if (r.id === "ownerbio") {
                            const yr = Number(r.querySelector("td")?.innerText.trim());
                            active = yr >= latestYear - 1 ? yr : null;
                            continue;
                        }
                        if (!active) continue;
                        const t = r.querySelectorAll("td");
                        if (t.length < 6) continue;
                        const date = t[2]?.innerText.trim();
                        const amt = Number((t[3]?.innerText.trim() || "").replace(/,/g, "")) || 0;
                        if (date) out.push({ year: active, date, amount: amt });
                    }
                    return out.sort((a, b) => new Date(a.date) - new Date(b.date));
                });
            }
        }

        // -----------------------------
        // 5. HALF ASSIGNMENT
        // -----------------------------
        paymentDates.sort((a, b) => new Date(a.date) - new Date(b.date));

        let halfPayments = { 1: { amt: 0, lastPaid: "-" }, 2: { amt: 0, lastPaid: "-" } };
        for (const p of paymentDates) {
            const month = new Date(p.date).getMonth() + 1;
            const half = month <= 6 ? 1 : 2;
            halfPayments[half].amt += p.amount;
            if (halfPayments[half].lastPaid === "-" || new Date(p.date) > new Date(halfPayments[half].lastPaid)) {
                halfPayments[half].lastPaid = fmtDate(p.date);
            }
        }

        if (halfPayments[1].amt === 0) halfPayments[1].amt = taxTable.base_1st;
        if (halfPayments[2].amt === 0) halfPayments[2].amt = taxTable.base_2nd;

        const amt1 = halfPayments[1].amt;
        const paid1 = halfPayments[1].lastPaid;
        const amt2 = halfPayments[2].amt;
        const paid2 = halfPayments[2].lastPaid;

        // -----------------------------
        // 6. CREATE TAX HISTORY RECORDS
        // -----------------------------
        const year = new Date().getFullYear() - 1;

        const makeStatus = (due, half) => {
            const today = new Date();
            const delinquentDate = new Date(`${year + 1}-${half === 1 ? "02-16" : "07-16"}`);
            if (due > 0) return today > delinquentDate ? "Delinquent" : "Due";
            return "Paid";
        };

        const makeEntry = (half, base, due, paidDate) => ({
            jurisdiction: "County",
            year,
            payment_type: "Semi-Annual",
            status: makeStatus(due, half),
            base_amount: `$${base.toFixed(2)}`,
            amount_paid: `$${(base - due).toFixed(2)}`,
            amount_due: `$${due.toFixed(2)}`,
            mailing_date: "N/A",
            due_date: half === 1 ? `02/15/${year + 1}` : `07/15/${year + 1}`,
            delq_date: half === 1 ? `02/16/${year + 1}` : `07/16/${year + 1}`,
            paid_date: paidDate,
            good_through_date: ""
        });

        let tax_history = [
            makeEntry(1, amt1, taxTable.due_1st, paid1),
            makeEntry(2, amt2, taxTable.due_2nd, paid2)
        ];

        const priorCharge = Number(taxTable.prior_charge || 0);
        const priorDue = Number(taxTable.prior_due || 0);
        if (priorDue > 0 || priorCharge > 0) {
            tax_history.unshift({
                jurisdiction: "County",
                year: year - 1,
                payment_type: "Annual",
                status: priorDue > 0 ? "Delinquent" : "Paid",
                base_amount: `$${priorCharge.toFixed(2)}`,
                amount_paid: "$0.00",
                amount_due: `$${priorDue.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: `02/15/${year}`,
                delq_date: `02/16/${year}`,
                paid_date: "-",
                good_through_date: ""
            });
        }

        // -----------------------------
        // 7. EXTEND TAX HISTORY FOR PAID STATUS
        // -----------------------------
        const currentYearStatus = tax_history.every(h => h.status === "Paid");
        if (currentYearStatus && accountNumber) {
            const historyMap = {};
paymentDates.forEach(p => {
    const paidDate = new Date(p.date);

    if (isNaN(paidDate)) return;

    // Ohio taxes: paid in year+1 for prior tax year
    const taxYear = p.year ?? (paidDate.getFullYear() - 1);
    const yrRange = `${taxYear}-${taxYear + 1}`;

    const month = paidDate.getMonth() + 1;
    const half = month <= 6 ? 1 : 2;

    if (!historyMap[yrRange]) {
        historyMap[yrRange] = {
            1: { amt: 0, lastPaid: "-" },
            2: { amt: 0, lastPaid: "-" }
        };
    }

    historyMap[yrRange][half].amt += p.amount;

    if (
        historyMap[yrRange][half].lastPaid === "-" ||
        paidDate > new Date(historyMap[yrRange][half].lastPaid)
    ) {
        historyMap[yrRange][half].lastPaid = fmtDate(p.date);
    }
});


            const extraHistory = [];
            for (const [yrRange, halves] of Object.entries(historyMap)) {
                extraHistory.push({
                    jurisdiction: "County",
                    year: yrRange,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: `$${halves[1].amt.toFixed(2)}`,
                    amount_paid: `$${halves[1].amt.toFixed(2)}`,
                    amount_due: `$0.00`,
                    mailing_date: "N/A",
                    due_date: `02/28/${yrRange.split("-")[1]}`,
                    delq_date: `03/01/${yrRange.split("-")[1]}`,
                    paid_date: halves[1].lastPaid,
                    good_through_date: ""
                });
                extraHistory.push({
                    jurisdiction: "County",
                    year: yrRange,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: `$${halves[2].amt.toFixed(2)}`,
                    amount_paid: `$${halves[2].amt.toFixed(2)}`,
                    amount_due: `$0.00`,
                    mailing_date: "N/A",
                    due_date: `07/31/${yrRange.split("-")[1]}`,
                    delq_date: `08/01/${yrRange.split("-")[1]}`,
                    paid_date: halves[2].lastPaid,
                    good_through_date: ""
                });
            }

            tax_history.splice(0, tax_history.length, ...extraHistory);
        }

        // -----------------------------
        // 8. TREASURER ADDRESS
        // -----------------------------
        const treasurerAddr = {
            hardin: "Hardin County Treasurer's Office One Courthouse Sq, Suite 230, Kenton, OH 43326",
            wyandot: "Wyandot County Treasurer's Office 109 S Sandusky Ave, Upper Sandusky, OH 43351",
            crawford: "Crawford County Treasurer's Office 112 E Mansfield St #102, Bucyrus, OH 44820",
            harrison: "Harrison County Treasurer's Office 100 W. Market St. Cadiz, OH 43907",
            noble: "Noble County Treasurer's Office 290 Court House Caldwell, OH 43724"
        };

        const taxing_authority =
            countyName.includes("hardin") ? treasurerAddr.hardin :
                countyName.includes("wyandot") ? treasurerAddr.wyandot :
                    countyName.includes("harrison") ? treasurerAddr.harrison :
                        countyName.includes("noble") ? treasurerAddr.noble :
                            countyName.includes("crawford") ? treasurerAddr.crawford : "";

        // -----------------------------
        // 9. FINAL RESULT
        // -----------------------------
        let result = {
            parcel_number: header.parcel_number,
            owner_name: [header.owner_name],
            property_address: main.property_address,
            total_assessed_value: formatMoney(main.total_value),
            total_taxable_value: formatMoney(main.total_value),
            tax_history,
            taxing_authority,
            delinquent: "NONE",
            notes: ""
        };
        const getYearValue = (y) => {
            if (typeof y === "number") return y;
            if (typeof y === "string" && y.includes("-")) {
                return Number(y.split("-")[0]);
            }
            return Number(y) || 0;
        };

        // -----------------------------
        // LIMIT TAX HISTORY BY COMPANY
        // -----------------------------
        if (Array.isArray(tax_history) && yearsRequired > 0) {
            tax_history.sort((a, b) => getYearValue(b.year) - getYearValue(a.year));

            const allowedYears = new Set(
                tax_history
                    .map(t => t.year)
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .slice(0, yearsRequired)
            );

            tax_history = tax_history.filter(t => allowedYears.has(t.year));
        }

        // IMPORTANT: reassign back to result
        result.tax_history = tax_history;


        result = applyTaxNotes(result);
        return result;

    } catch (err) {
        console.error("HARDIN SCRAPER ERROR:", err);
        throw err;
    }
};



// -------------------------------------------------------------
// ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, parcel, url, county, yearsRequired) => {
    return new Promise((resolve, reject) => {
        hardin_1(page, url, parcel)
            .then(detailUrl => {
                hardin_2(page, detailUrl, parcel, county, yearsRequired)
                    .then(data => resolve(data))
                    .catch(err => reject(err));
            })
            .catch(err => reject(err));
    });
};


// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------

const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    const county = req.path.replace(/^\/+/, "");

    if (!account) return res.status(400).json({ error: true, message: "Missing account" });
    if (!county) return res.status(400).json({ error: true, message: "Missing county" });

    const yearsRequired = getOHCompanyYears(client);


    let browser;
    try {
        const countyUrls = {
            hardin: "http://realestate.co.hardin.oh.us/re-search.php",
            wyandot: "http://realestate.co.wyandot.oh.us/re/re-search.php",
            crawford: "http://realestate.crawford-co.org/re-search.php",
            harrison: "http://208.79.141.29/reaweb/re-search.php",
            noble: "http://70.62.18.11/reaweb/re-search.php",

        };
        const url = countyUrls[county];
        if (!url) throw new Error(`Unknown county: ${county}`);

        browser = await getBrowserInstance();
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setUserAgent("Mozilla/5.0");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const handler = async () =>
            await account_search(page, account, url, county, yearsRequired);


        if (fetch_type === "html") {
            handler()
                .then((result) => res.status(200).render("parcel_data_official", result))
                .catch((error) => res.status(500).render("error_data", { error: true, message: error.message }))
                .finally(async () => await ctx.close());
        } else if (fetch_type === "api") {
            handler()
                .then((result) => res.status(200).json({ result }))
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(async () => await ctx.close());
        }
    } catch (error) {
        if (fetch_type === "html") {
            res.status(500).render("error_data", { error: true, message: error.message });
        } else if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

module.exports = { search };