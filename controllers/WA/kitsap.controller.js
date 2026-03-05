// Author: Sanam Poojitha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const logError = (scope, err) => {
    console.error(`[${scope}]`, err?.message || err);
};

// ----------------------------
// Utilities
// ----------------------------
const softWait = async (page, selector, timeout = 20000) => {
    try {
        await page.waitForSelector(selector, { timeout, visible: true });
        return true;
    } catch {
        return false;
    }
};

const applyTaxNotes = (data) => {
    const suffix =
        ",NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31";
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
    const priorsDelq = priors.some((x) =>
        ["Delinquent", "Due"].includes(x.status)
    );
    const priorsTxt = priorsDelq
        ? "PRIORS ARE DELINQUENT"
        : "ALL PRIORS ARE PAID";

    if (latest.status === "Paid")
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
    else if (latest.status === "Delinquent")
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
    else data.notes = `${priorsTxt}, ${latest.year} TAX STATUS UNKNOWN${suffix}`;

    if (anyDelq)
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    else if (latest.status === "Due") data.delinquent = "NONE";
    else data.delinquent = "NONE";

    return data;
};

// ----------------------------
// AC-1: Search Parcel
// ----------------------------
async function ac_1(page, parcel) {
    try {
        const url = "https://psearch.kitsap.gov/pdetails/Default";
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.type("#txtSearchText", String(parcel), { delay: 20 });
        await page.keyboard.press("Enter");
        await page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 90000
        });
    } catch (err) {
        logError("AC_1", err);
        throw new Error(`AC_1 failed: ${err.message}`);
    }
}

// ----------------------------
// AC-2: Scrape Property Data
// ----------------------------
async function ac_2(page, parcel) {
    try {
        const data = {
            owner_name: [],
            property_address: "",
            parcel_number: parcel,
            taxing_authority:
                "Kitsap County Treasurer, 619 Division St, Port Orchard, WA 98366",
            tax_history: [],
            total_assessed_value: "N/A",
            total_taxable_value: "N/A",
            notes: "",
            delinquent: ""
        };

        // ----------------------------
        // 1) GENERAL DETAILS
        // ----------------------------
        await softWait(page, "table.table");

        const general = await page.evaluate(() => {
            const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
            const toLine = (html) =>
                html
                    ?.replace(/<br\s*\/?>/gi, ", ")
                    .replace(/\s+/g, " ")
                    .trim() || "";

            const rows = Array.from(
                document.querySelectorAll("table.table tbody tr")
            );
            const out = { owner: "", site: "", parcel: "" };

            for (const row of rows) {
                const label = norm(
                    row.querySelector("td.text-right")?.innerText
                );
                const valCell = row.querySelector("td:nth-child(2)");
                if (!label || !valCell) continue;

                const valTxt = norm(valCell.innerText);
                const valHTML = valCell.innerHTML;

                if (label.includes("Taxpayer Name")) out.owner = valTxt;
                if (label.includes("Site Address"))
                    out.site = toLine(valHTML);
                if (label.includes("Parcel No")) out.parcel = valTxt;
            }
            return out;
        });

        data.owner_name = [general.owner];
        data.property_address = general.site;
        data.parcel_number = general.parcel || parcel;

        // ----------------------------
        // 2) TAX HISTORY
        // ----------------------------
        const histUrl = `https://psearch.kitsap.gov/pdetails/Details?parcel=${parcel}&page=valuetaxhistory`;
        await page.goto(histUrl, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        const status = await scrapeTaxHistoryStatus(page);
        const hist = await scrapeTaxHistory(page);
        const currentYear = new Date().getFullYear();
        const thisYear = hist.find((h) => h.year === currentYear);

        if (status === "TBD") {
            data.notes = "CURRENT YEAR TAXES ARE NOT YET AVAILABLE (TBD)";
            data.delinquent = "UNKNOWN";
            return data;
        }

        if (thisYear) {
            data.total_assessed_value =
                thisYear.taxable_value_formatted;
            data.total_taxable_value =
                thisYear.taxable_value_formatted;
        }

        // ----------------------------
        // 3) RECEIPTS
        // ----------------------------
        const receiptsUrl = `https://psearch.kitsap.gov/pdetails/Details?parcel=${parcel}&page=receipts`;
        await page.goto(receiptsUrl, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        const receipts = await scrapeKitsapSemiAnnual(page);

        // ----------------------------
        // 4) MERGE HISTORY + RECEIPTS
        // ----------------------------

        const receiptByYear = {};
        for (const r of receipts) {
            receiptByYear[r.year] = receiptByYear[r.year] || [];
            receiptByYear[r.year].push(r);
        }

        // ---- Build final tax history from VALUE table
        data.tax_history = hist.map((h) => {
            const paidList = receiptByYear[h.year] || [];

            if (paidList.length) {
                // ---- Paid year
                return {
                    ...paidList[paidList.length - 1], // latest payment
                    base_amount: h.base_amount_formatted,
                    status: "Paid"
                };
            }

            // ---- No receipts → Due
            return {
                year: h.year,
                jurisdiction: "County",
                base_amount: h.base_amount_formatted,
                amount_due: h.base_amount_formatted,
                amount_paid: "$0.00",
                payment_type: "Annual",
                paid_date: null,
                status: "Due",
                due_date: `10/31/${h.year}`,
                delq_date: `11/01/${h.year}`,
                mailing_date: "N/A"
            };
        });

        // ---- Keep ONLY LATEST YEAR
        const latestYear = Math.max(...data.tax_history.map((x) => x.year));
        data.tax_history = data.tax_history.filter((x) => x.year === latestYear);

        // ----------------------------
        // 5) TAX STATEMENT (DUE / DELINQUENT)
        // ----------------------------
        const stmtUrl = `https://psearch.kitsap.gov/pdetails/Details?parcel=${parcel}&page=taxstatement`;
        await page.goto(stmtUrl, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        const stmt = await scrapeKitsapTaxStatement(page);
        const today = new Date();

        let isDue = false;
        let isDelq = false;

        if (stmt.first_half_due > 0) {
            isDue = true;
            if (today > new Date(`04/30/${stmt.year}`)) isDelq = true;
        }

        if (stmt.second_half_due > 0) {
            isDue = true;
            if (today > new Date(`10/31/${stmt.year}`)) isDelq = true;
        }

        if (stmt.past_due > 0) {
            isDue = true;
            isDelq = true;
        }

        if (isDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        else if (isDue) data.delinquent = "NONE";
        else data.delinquent = "NONE";

        // ----------------------------
        // 6) APPLY NOTES
        // ----------------------------
        applyTaxNotes(data);

        return data;
    } catch (err) {
        logError("AC_2", err);
        throw new Error(`AC_2 failed: ${err.message}`);
    }
}

// ----------------------------
// SCRAPE TAX HISTORY
// ----------------------------
// ----------------------------
// SCRAPE TAX HISTORY (FIXED)
// ----------------------------
async function scrapeTaxHistory(page) {
    const ok = await softWait(
        page,
        "table.table-bordered.table-condensed",
        20000
    );
    if (!ok) return [];

    return await page.evaluate(() => {
        const clean = (v) =>
            parseFloat((v || "").replace(/[^0-9.]/g, "")) || 0;

        const fmt = (n) =>
            `$${n.toLocaleString(undefined, {
                minimumFractionDigits: 2
            })}`;

        const rows = Array.from(
            document.querySelectorAll(
                "table.table-bordered.table-condensed tbody tr"
            )
        );

        return rows
            .map((tr) => {
                const tds = tr.querySelectorAll("td");
                if (tds.length < 13) return null;

                const year = parseInt(tds[0].innerText.trim(), 10);
                if (!year) return null;

                const taxable = clean(tds[4].innerText);
                const totalBilled = clean(tds[12].innerText);

                return {
                    year,
                    taxable_value: taxable,
                    taxable_value_formatted: fmt(taxable),
                    base_amount: totalBilled,
                    base_amount_formatted: fmt(totalBilled)
                };
            })
            .filter(Boolean);
    });
}


// ----------------------------
async function scrapeTaxHistoryStatus(page) {
    const ok = await softWait(page, "table.table", 15000);
    if (!ok) return "UNKNOWN";

    return await page.evaluate(() => {
        const rows = Array.from(
            document.querySelectorAll("table.table tbody tr")
        );
        const year = new Date().getFullYear();

        for (const tr of rows) {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 13) continue;
            if (parseInt(tds[0].innerText) !== year) continue;
            if (/TBD/i.test(tds[6].innerText)) return "TBD";
            return "READY";
        }
        return "UNKNOWN";
    });
}

// ----------------------------
// RECEIPTS
// ----------------------------
// ----------------------------
// RECEIPTS (FIXED FOR NEW HTML)
// ----------------------------
async function scrapeKitsapSemiAnnual(page) {
    const ok = await softWait(
        page,
        "table.table-bordered.table-striped",
        20000
    );
    if (!ok) return [];

    return await page.evaluate(() => {
        const clean = (v) =>
            parseFloat((v || "").replace(/[^0-9.]/g, "")) || 0;

        const fmt = (n) =>
            `$${n.toLocaleString(undefined, {
                minimumFractionDigits: 2
            })}`;

        const rows = Array.from(
            document.querySelectorAll(
                "table.table-bordered.table-striped tbody tr"
            )
        );

        const receipts = [];
        let current = null;

        for (const tr of rows) {
            const strong = tr.querySelector("td[colspan] strong");

            // ---- HEADER ROW (Date / Receipt / Year)
            if (strong && /Date:/i.test(strong.innerText)) {
                const dateMatch = strong.innerText.match(/Date:\s*([\d/]+)/);
                const yearMatch = strong.innerText.match(/Tax Year:\s*(\d{4})/);

                if (dateMatch && yearMatch) {
                    current = {
                        year: parseInt(yearMatch[1], 10),
                        paid_date: dateMatch[1],
                        total: 0
                    };
                }
                continue;
            }

            // ---- TOTAL ROW
            if (current && tr.innerText.includes("Total")) {
                const totalTd = tr.querySelector(
                    "td.text-right strong:last-child"
                );

                current.total = clean(totalTd?.innerText);
                receipts.push(current);
                current = null;
            }
        }

        // ---- GROUP BY YEAR
        const byYear = {};
        for (const r of receipts) {
            byYear[r.year] = byYear[r.year] || [];
            byYear[r.year].push(r);
        }

        // ---- BUILD FINAL OUTPUT
        const output = [];

        Object.keys(byYear).forEach((year) => {
            const list = byYear[year].sort(
                (a, b) => new Date(a.paid_date) - new Date(b.paid_date)
            );

            const annual = list.length === 1;

            list.forEach((p, idx) => {
                output.push({
                    year: p.year,
                    jurisdiction: "County",
                    base_amount: fmt(p.total),
                    amount_due: fmt(0),
                    amount_paid: fmt(p.total),
                    payment_type: annual ? "Annual" : "Semi-Annual",
                    paid_date: p.paid_date,
                    status: "Paid",
                    due_date:
                        annual || idx === 0
                            ? `04/30/${p.year}`
                            : `10/31/${p.year}`,
                    delq_date:
                        annual || idx === 0
                            ? `05/01/${p.year}`
                            : `11/01/${p.year}`,
                    mailing_date: "N/A"
                });
            });
        });

        return output;
    });
}


// ----------------------------
// TAX STATEMENT SCRAPER
// ----------------------------
async function scrapeKitsapTaxStatement(page) {
    const ok = await softWait(page, "#AutoNumber1", 20000);
    if (!ok)
        return {
            year: new Date().getFullYear(),
            first_half_due: 0,
            second_half_due: 0,
            past_due: 0
        };

    return await page.evaluate(() => {
        const clean = (v) =>
            parseFloat((v || "").replace(/[^0-9.]/g, "")) || 0;

        const rows = Array.from(document.querySelectorAll("#AutoNumber1 tr"));
        let first = 0,
            second = 0,
            past = 0,
            year = new Date().getFullYear();

        for (const tr of rows) {
            const txt = tr.innerText;
            if (/First Half/i.test(txt))
                first = clean(tr.querySelector("b")?.innerText);
            if (/Second Half/i.test(txt))
                second = clean(tr.querySelector("b")?.innerText);
            if (/Past Due/i.test(txt))
                past = clean(tr.querySelector("b")?.innerText);
            if (/WEB TAX STATEMENT/i.test(txt)) {
                const y = txt.match(/(\d{4})/);
                if (y) year = +y[1];
            }
        }

        return { year, first_half_due: first, second_half_due: second, past_due: past };
    });
}

// ----------------------------
// Combined Search
// ----------------------------
async function accountSearch(page, parcel) {
    await ac_1(page, parcel);
    return ac_2(page, parcel);
}

// ----------------------------
// Express Handler
// ----------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser;

    try {
        if (!account)
            return res
                .status(400)
                .json({ error: "parcel must be provided" });

        browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        const data = await accountSearch(page, account);

        if (fetch_type === "html")
            res.status(200).render("parcel_data_official", data);
        else res.status(200).json({ result: data });

        await context.close();
    } catch (err) {
        if (fetch_type === "html")
            res.status(200).render("error_data", {
                error: true,
                message: err.message
            });
        else
            res.status(500).json({
                error: true,
                message: err.message
            });
    }
};

export { search };