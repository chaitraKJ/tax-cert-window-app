// Author : Manjunadh

//  Ohio State Tax Scraper ( Butler County )

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 };

// ----------------------- Config -----------------------
const counties = {
    butler: {
        url: "https://propertysearch.bcohio.gov/search/commonsearch.aspx?mode=parid",
        taxing_authority: "Butler County Auditor — 130 High Street, 3rd Floor, Hamilton, OH 45011, Ph: (513) 887-3154",
        city: "Hamilton",
        zip: "45011",
        dueDates: { due1: "02/27", delq1: "02/28", due2: "07/15", delq2: "07/16" },
        dueNotes: "02/27 & 07/15"
    }
};

// Navigation, input the parcel account, and submit the search.
const butler_1 = async (page, account, config) => {
    if (!account?.trim()) throw new Error("Parcel Account is Required");

    try {
        await page.goto(config.url, { waitUntil: "networkidle0", timeout_option });

        // Wait for input and clear any garbage
        await page.waitForSelector("#inpParid", { timeout_option });
        await page.click("#inpParid", { clickCount: 3 }); // triple click = select all
        await page.keyboard.press("Backspace"); // clear

        // TYPE SLOWLY + verify every character
        const cleanAccount = account.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

        for (const char of cleanAccount) {
            await page.type("#inpParid", char, { delay: 80 }); // 80ms between chars
        }

        // FINAL VERIFICATION: double-check the input field value
        const actualValue = await page.$eval("#inpParid", el => el.value.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase());

        if (actualValue !== cleanAccount) {
            await page.click("#inpParid", { clickCount: 3 });
            await page.keyboard.press("Backspace");
            await page.type("#inpParid", cleanAccount, { delay: 100 });
        }

        // Click search ONLY after verification
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle0", timeout_option }),
            page.click("#btSearch")
        ]);

        // Wait for result page
        await page.waitForSelector("#datalet_header_row, #lblNoResults", { timeout_option });

        // If no result, throw clear error
        const noResult = await page.$eval("body", body => body.textContent.includes("No records found"));
        if (noResult) throw new Error("No parcel found");

        return page;

    } catch (error) {
        throw new Error(`[BUTLER] Search failed: ${error.message}`);
    }
};

// Extracts owner name, property address, assessed/taxable values.
const butler_2 = async (page) => {
    try {
        return await page.evaluate(() => {
            // Owner Name
            const ownerName = (() => {
                const td = document.querySelector('tr.DataletHeaderBottom td:first-child');
                return td ? td.textContent.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : 'N/A';
            })();

            // Property Address
            const propertyAddress = (() => {
                const td = document.querySelector('tr.DataletHeaderBottom td:last-child');
                return td ? td.textContent.replace(/\s+/g, ' ').trim() : 'N/A';
            })();

            // Total Assessed Value
            const totalValue = (() => {
                const row = Array.from(document.querySelectorAll('#Current\\ Value tr'))
                    .find(r => r.textContent.includes('Assessed Total (35%)'));
                const td = row?.querySelector('td.DataletData');
                return td ? td.textContent.trim() : '-';
            })();

            return {
                owner_name: ownerName,
                property_address: propertyAddress,
                total_value: totalValue
            };
        });
    } catch (error) {
        console.error(`[BUTLER] data extraction failed: ${error.message}`);
        return {
            owner_name: 'N/A',
            property_address: 'N/A',
            total_value: '-'
        };
    }
};

// ────────────────────────────── STEP 3: DETAILED TAX REPORT & PRIOR YEARS STATUS ──────────────────────────────
const butler_tax_page = async (page) => {
    try {
        // Find tax link manually
        const taxHref = await page.evaluate(() => {
            const link = [...document.querySelectorAll("a")]
                .find(a => /tax/i.test(a.textContent) || /tax/i.test(a.getAttribute("href") || ""));
            return link ? link.href : null;
        });

        if (!taxHref) {
            throw new Error("Tax link not found");
        }

        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 90000 }),
            page.goto(taxHref)
        ]);

        await page.waitForSelector("table[id^='Tax']", { timeout: 90000 });

    } catch (e) {
        throw new Error(`[BUTLER] Failed to open tax page: ${e.message}`);
    }
};



const butler_paid = async (page, overview = {}, account = "", config = {},yearLimit=1) => {
    let taxHistory = [];

    try {
        const tablesData = await page.evaluate(() => {
            const cleanNum = (v) =>
                parseFloat((v || "0").replace(/[^0-9.-]/g, "")) || 0;

            const parseTable = (table) => {
                const rows = [...table.querySelectorAll("tr")];
                let baseAmount = "";
                let firstPaid = { amount: "0.00", date: "" };
                let secondPaid = { amount: "0.00", date: "" };
                let balances = { first: "0.00", second: "0.00", prior: "0.00" };
                let taxYear = "";

                for (const row of rows) {
                    const tds = row.querySelectorAll("td");
                    if (tds.length < 8) continue;

                    const rawYear = tds[0]?.textContent || "";
                    const yearMatch = rawYear.match(/\b(20\d{2})\b/);
                    if (yearMatch) taxYear = yearMatch[1];

                    const action = tds[1]?.textContent?.trim();
                    const code = tds[2]?.textContent?.trim();
                    const date = tds[3]?.textContent?.trim();
                    const first = tds[5]?.textContent?.trim();
                    const second = tds[6]?.textContent?.trim();

                    // Base tax
                    if (!baseAmount && action === "DUP" && code === "ADJ" && first === second && first !== "0.00") {
                        baseAmount = first;
                    }

                    // Payments
                    if (action === "PAY" && code === "CHG") {
                        const f = cleanNum(first);
                        const s = cleanNum(second);

                        if (f < 0 && !firstPaid.date) firstPaid = { amount: (-f).toFixed(2), date };
                        if (s < 0 && !secondPaid.date) secondPaid = { amount: (-s).toFixed(2), date };
                    }

                    // Totals
                    if (row.textContent.includes("Total:")) {
                        balances = {
                            first: tds[5]?.textContent?.trim() || "0.00",
                            second: tds[6]?.textContent?.trim() || "0.00",
                            prior: tds[7]?.textContent?.trim() || "0.00"
                        };
                    }
                }

                return { taxYear, baseAmount, firstPaid, secondPaid, balances };
            };

            return [...document.querySelectorAll("table[id^='Tax Detail']")]
                .map(parseTable)
                .filter(t => t.taxYear);
        });
        // ---- PICK ONLY LATEST 2 TAX YEARS ----
// ---- PICK LATEST N TAX YEARS (company-based) ----
const limit = Number(yearLimit) > 0 ? Number(yearLimit) : 1;

const latestTables = tablesData
    .map(t => {
        const m = String(t.taxYear).match(/\b(20\d{2})\b/);
        return m ? { ...t, _year: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._year - a._year)
    .slice(0, limit);



        const formatDate = (str) => {
            if (!str) return "-";
            const m = str.match(/(\d{1,2})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2})/i);
            if (!m) return str;
            const map = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
            return `${map[m[2].toUpperCase()]}/${m[1].padStart(2, "0")}/20${m[3]}`;
        };

        const toNum = (v) => parseFloat((v || "0").replace(/[^0-9.-]/g, "")) || 0;
        const money = (v) => `$${toNum(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

        for (const t of latestTables) {
            const year = t._year;
            const nextYear = year + 1;

            const due1 = `${config.dueDates.due1}/${nextYear}`;
            const due2 = `${config.dueDates.due2}/${nextYear}`;

            const fDue = toNum(t.balances.first);
            const sDue = toNum(t.balances.second);

            taxHistory.push(
                {
                    jurisdiction: "County",
                    year: String(year),
                    payment_type: "Semi-Annual",
                    installment: "1",
                    status: fDue > 0 ? "Due" : "Paid",
                    base_amount: money(t.baseAmount),
                    amount_paid: fDue > 0 ? "$0.00" : money(t.firstPaid.amount || t.baseAmount),
                    amount_due: fDue > 0 ? money(fDue) : "$0.00",
                    mailing_date: "N/A",
                    due_date: due1,
                    delq_date: config.dueDates.delq1 + "/" + nextYear,
                    paid_date: formatDate(t.firstPaid.date),
                    good_through_date: ""
                },
                {
                    jurisdiction: "County",
                    year: String(year),
                    payment_type: "Semi-Annual",
                    installment: "2",
                    status: sDue > 0 ? "Due" : "Paid",
                    base_amount: money(t.baseAmount),
                    amount_paid: sDue > 0 ? "$0.00" : money(t.secondPaid.amount || t.baseAmount),
                    amount_due: sDue > 0 ? money(sDue) : "$0.00",
                    mailing_date: "N/A",
                    due_date: due2,
                    delq_date: config.dueDates.delq2 + "/" + nextYear,
                    paid_date: formatDate(t.secondPaid.date),
                    good_through_date: ""
                }
            );
        }


    } catch (e) {
        console.warn("[BUTLER] Tax extraction failed:", e.message);
    }

    return {
        processed_date: new Date().toISOString(),
        order_number: "",
        borrower_name: "",
        owner_name: overview.owner_name ? [overview.owner_name] : [],
        property_address: overview.property_address || "",
        parcel_number: account,
        land_value: "",
        improvements: "",
        total_assessed_value: overview.total_value || "-",
        exemption: "",
        total_taxable_value: overview.total_value || "-",
        taxing_authority: config.taxing_authority,
        notes: "ALL PRIORS ARE PAID, TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY",
        delinquent: taxHistory.some(t => t.status === "Due")
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE",
        tax_history: taxHistory
    };
};


// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county,yearLimit=1) => {
    const config = counties[county];
    if (!config) throw new Error(`Unsupported county: ${county}`);
    await butler_1(page, account, config);

    const overview = await butler_2(page);

    // 🔥 THIS WAS MISSING
    await butler_tax_page(page);

    return await butler_paid(page, overview, account, config,yearLimit);

};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────
const search = async (req, res) => {
    let context = null;
    try {
        const { fetch_type, account ,client} = req.body || {};
        if (!account?.trim()) throw new Error("Account is required");
        if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");
        const pathParts = req.path.split("/").filter(Boolean);
        const county = pathParts[pathParts.length - 1].toLowerCase();
        if (!counties[county]) throw new Error(`Unsupported county: ${county}`);
        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await Promise.all([
            page.setViewport({ width: 1366, height: 768 }),
            page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36")
        ]);
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const blocked = [];
            if (blocked.includes(req.resourceType())) req.abort();
            else req.continue();
        });
        const data = await account_search(page, account, county,yearLimit);
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", { ...data, tax_history: data.tax_history });
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error(`[ERROR] Scrape failed:`, error.message);
        const fetchType = req.body?.fetch_type || "api";
        if (fetchType === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (context) {
            try { await context.close(); } catch (e) { console.warn(`[WARN] Context close failed:`, e.message); }
        }
    }
};

export { search };