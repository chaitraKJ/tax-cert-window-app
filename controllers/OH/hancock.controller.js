// AUTHOR: MANJUNADH
// Ohio Tax Scraper for ( Hancock County )

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";
const timeout_option = { timeout: 120000 };

// ────────────────────────────── UTILITIES ──────────────────────────────

// Wait for timeout (for stability)
const waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper: retries failed async operations with exponential backoff
const withRetry = (operation, maxRetries = 2, baseDelay = 1000) => {
    let lastError;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            operation()
                .then(resolve)
                .catch((error) => {
                    lastError = error;
                    if (maxRetries-- <= 0) {
                        console.error(`[FAIL] Operation failed after ${maxRetries + 1} retries:`, lastError.message);
                        return reject(lastError);
                    }
                    const delay = baseDelay * 2 ** (2 - maxRetries - 1);
                    console.warn(`[RETRY ${2 - maxRetries}/${2}] ${error.message}. Retrying in ${delay}ms...`);
                    setTimeout(attempt, delay);
                });
        };
        attempt();
    });
};

// Wait for selector to be visible AND its text to stabilize
const waitForStableSelector = (page, selector, options = {}) =>
    withRetry(() => new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector(selector, { state: 'visible', ...options });
            const text = await page.$eval(selector, el => el.innerText.trim());
            await page.waitForFunction(
                (sel, prev) => document.querySelector(sel)?.innerText.trim() === prev,
                { timeout: 3000 },
                selector, text
            ).catch(() => { });
            resolve(true);
        } catch (err) { reject(err); }
    }), 1, 500);

// - counties: Configuration object mapping county names to scraper-specific settings.
const counties = {
    hancock: {
        url: "https://beacon.schneidercorp.com/Application.aspx?AppID=1128&LayerID=28484&PageTypeID=2&PageID=11858",
        detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1128&LayerID=28484&PageTypeID=4&PageID=11860&Q=1833579548&KeyValue={{account}}",
        taxing_authority: "Hancock County Auditor — 300 S. Main St., Findlay, OH 45840, Ph: (419) 424-7015",
        city: "Findlay",
        zip: "45840",
        ids: {
            parcelInput: "#ctlBodyPane_ctl03_ctl01_txtParcelID",
            searchBtn: "#ctlBodyPane_ctl03_ctl01_btnSearch"
        },
        dueDates: { due1: "02/14", delq1: "02/15", due2: "07/11", delq2: "07/12" },
        dueNotes: "02/14 & 07/11"
    }
};

// ────────────────────────────── HELPERS ──────────────────────────────

//Formats currency values
const formatCurrency = (val) => {
    if (!val) return "$0.00";
    let num = parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

//For determining status based on payment status
const determineStatus = (amountDue, dueDate, delqDate, currentDate) => {
    const cleanAmount = parseFloat(amountDue.toString().replace(/[^0-9.-]+/g, '')) || 0;
    if (cleanAmount === 0) return "Paid";
    const dueDateObj = new Date(dueDate);
    const delqDateObj = new Date(delqDate);
    if (currentDate < delqDateObj) return "Due";
    else return "Delinquent";
};

//Building notes
const buildEnhancedNotes = (firstStatus, secondStatus, priorYearStatus, taxYear, dueDates) => {
    const hasDue = [firstStatus, secondStatus].includes("Due");

    const hasDelinquent = [firstStatus, secondStatus].includes("Delinquent");
    let currentStatusText = [];
    if (hasDelinquent) currentStatusText.push("DELINQUENT");
    else if (hasDue) currentStatusText.push("DUE");

    else currentStatusText.push("PAID");
    const overallCurrentStatus = [firstStatus, secondStatus].includes("Paid") ? "PAID" : "DUE";
    let notes;
    if (overallCurrentStatus === "PAID") {
        notes = `ALL PRIORS ARE ${priorYearStatus}, ${taxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    } else if (priorYearStatus === "PAID") {
        notes = `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${currentStatusText.join(" & ")}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    } else {
        notes = `PRIORS ARE DELINQUENT, ${taxYear} TAXES ARE ${currentStatusText.join(" & ")}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    }
    return notes;
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

//Navigate to the county search page, dismiss any modals, input the parcel account, and submit the search.
const hancock_1 = async (page, account, config) => {
    if (!account?.trim()) throw new Error("Parcel account is required");
    const url = config.detailUrl.replace("{{account}}", account);
    await withRetry(() => page.goto(url, { waitUntil: "networkidle0", timeout: 120000 }), 1);
    await page.click('text="I Agree"', { timeout: 5000 }).catch(() => { });
    await page.click('text="Close"', { timeout: 5000 }).catch(() => { });
    const ownerSelector = "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch," +
        "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch";
    await waitForStableSelector(page, ownerSelector, timeout_option);
};

// ────────────────────────────── STEP 2: EXTRACT YEAR DATA ──────────────────────────────

//Wait for owner panel to load and extract current tax year/payable year from the page label
const hancock_2 = async (page, account, config) => {
    try {
        const ownerSelector = "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch," +
            "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch";
        await waitForStableSelector(page, ownerSelector, timeout_option);
        const yearData = await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll("table tbody tr")).find(r =>
                r.querySelector("span[id$='lblYearExpand']")?.textContent.includes("Payable")
            );
            if (!row) return null;
            const label = row.querySelector("span[id$='lblYearExpand']").textContent.trim();
            const match = label.match(/(\d{4})\s+Payable\s+(\d{4})/);
            if (!match) return null;
            return { year: match[1], payable: match[2], label };
        });
        if (!yearData) {
            const now = new Date();
            const year = now.getFullYear();
            const payable = now.getMonth() >= 6 ? year + 1 : year;
            return { year: year.toString(), payable: payable.toString(), label: `${year} Payable ${payable}` };
        }
        return yearData;
    } catch (error) {
        console.error(`[HANCOCK_2] Error during year data extraction: ${error.message}`);
        throw new Error(`Failed to extract year data: ${error.message}`);
    }
};

// ────────────────────────────── STEP 3: EXTRACT BASE DATA ──────────────────────────────

//Extract base property overview data (owner, address, assessed value) using page evaluation.
const hancock_extract_base = async (page, account, config, yearData) => {
    try {
        return await page.evaluate((account, cfg, yearData) => {
            const $ = (s) => document.querySelector(s);
            const txt = (s) => ($(s) ? $(s).textContent.trim().replace(/\s+/g, " ") : "");
            const ownerRaw =
                txt("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch") ||
                txt("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
            const owner_name = ownerRaw ? [ownerRaw] : [];
            let address = txt("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_lblOwnerAddress");
            address = address.replace(/,?\s*COLUMBUS,?\s*/gi, "").trim();
            if (address && !/OH\s+45840/i.test(address)) {
                address = `${address}, ${cfg.city}, OH ${cfg.zip}`;
            }
            let assessed = "0";
            const valTable = $("#ctlBodyPane_ctl14_ctl01_grdValuation_grdYearData");
            if (valTable) {
                const rows = valTable.querySelectorAll("tbody tr");
                for (const r of rows) {
                    const th = r.querySelector("th")?.textContent.trim();
                    if (th === "Total Value (Assessed 35%)") {
                        const td = r.querySelector("td.value-column");
                        if (td) assessed = td.textContent.replace(/[^\d.]/g, "");
                        break;
                    }
                }
            }
            const fmt = (n) => {
                const num = parseFloat(n) || 0;
                return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };
            return {
                processed_date: new Date().toISOString(),
                order_number: "",
                borrower_name: "",
                owner_name,
                property_address: address || "ADDRESS NOT FOUND",
                parcel_number: account,
                land_value: "",
                improvements: "",
                total_assessed_value: fmt(assessed),
                exemption: "",
                total_taxable_value: fmt(assessed),
                taxing_authority: cfg.taxing_authority,
                notes: "",
                delinquent: "",
                tax_history: [],
                yearData
            };
        }, account, config, yearData);
    } catch (error) {
        console.error(`[HANCOCK_EXTRACT] Error extracting base data: ${error.message}`);
        throw new Error(`Failed to extract property details: ${error.message}`);
    }
};

// ────────────────────────────── STEP 4: TAX HISTORY & PAYMENTS ──────────────────────────────

//Load and expand tax history table, extract semi-annual installment details, payments, and statuses.
// ────────────────────────────── STEP 4: TAX HISTORY & PAYMENTS ──────────────────────────────
const hancock_paid = async (page, overview, account, config, yearData, yearLimit = 1) => {
    try {
        await withRetry(() =>
            page.waitForFunction(
                () => document.querySelector("#ctlBodyPane_ctl17_ctl01_gvwTaxHistory") !== null,
                timeout_option
            ), 1
        );

        // Determine which years to scrape based on yearLimit
        const yearsToScrape = [];
        for (let i = 0; i < yearLimit; i++) {
            const year = (parseInt(yearData.year) - i).toString();
            const payable = (parseInt(yearData.payable) - i).toString();
            yearsToScrape.push({
                year,
                payable,
                label: `${year} Payable ${payable}`
            });
        }

        const result = await page.evaluate((yearsToScrape, cfg) => {
            const txt = id => document.getElementById(id)?.textContent.trim() || "$0.00";
            const parse = s => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
            const fmt = n => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const now = new Date();
            const allRows = [];
            const allPayments = {};

            const buildRow = (yearData, inst, amountDue, amountPaid, base) => {
                let status = "Paid";
                let paid_date = "-";
                let amount_due = "$0.00";
                let amtPaidFmt = fmt(amountPaid);

                const dueDate = inst === "1" ? `02/14/${yearData.payable}` : `07/11/${yearData.payable}`;
                const delqDate = inst === "1" ? `02/15/${yearData.payable}` : `07/12/${yearData.payable}`;

                if (amountDue > 0) {
                    status = now <= new Date(`${yearData.payable}-${cfg.dueDates[inst === "1" ? "due1" : "due2"]}`) ? "Due" : "Delinquent";
                    amount_due = fmt(amountDue);
                    amtPaidFmt = "$0.00";
                }

                return {
                    jurisdiction: "County",
                    year: yearData.year,
                    payment_type: "Semi-Annual",
                    installment: inst,
                    status,
                    base_amount: fmt(base),
                    amount_paid: amtPaidFmt,
                    amount_due,
                    mailing_date: "N/A",
                    due_date: dueDate,
                    delq_date: delqDate,
                    paid_date,
                    good_through_date: "",
                };
            };

            // Scrape tax rows for each year
            yearsToScrape.forEach(yearData => {
                const allYearRows = Array.from(document.querySelectorAll("#ctlBodyPane_ctl17_ctl01_gvwTaxHistory tbody tr"))
                    .filter(r => r.querySelector("span[id$='lblYearExpand']"));
                const curRow = allYearRows.find(r => r.querySelector("span[id$='lblYearExpand']")?.textContent.trim() === yearData.label);
                if (!curRow) return;

                const exp = curRow.querySelector("a.expandCollapseIcon");
                if (exp && exp.getAttribute("aria-expanded") === "false") exp.click();

                let attempts = 0;
                while (attempts < 50) {
                    const dt = document.querySelector(`#ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal`);
                    if (dt && dt.style.display !== "none") break;
                    attempts++;
                    const s = Date.now(); while (Date.now() - s < 100) { }
                }

                const firstDue = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_FirstHalfBalanceLabel"));
                const secondDue = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_SecondHalfBalanceLabel"));
                const firstPaid = Math.abs(parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_FirstHalfCollectedLabel")));
                const secondPaid = Math.abs(parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_SecondHalfCollectedLabel")));
                const firstBase = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_FirstHalfDueLabel"));
                const secondBase = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_DetailTotal_SecondHalfDueLabel"));

                allRows.push(buildRow(yearData, "1", firstDue, firstPaid, firstBase));
                allRows.push(buildRow(yearData, "2", secondDue, secondPaid, secondBase));
            });

            // Scrape payment dates
            try {
                const payRows = Array.from(document.querySelectorAll("#ctlBodyPane_ctl19_ctl01_grdPayments tbody tr"));
                payRows.forEach(r => {
                    const yearTh = r.querySelector("th");
                    const dateTd = r.querySelector("td");
                    if (yearTh && dateTd) {
                        const yearText = yearTh.textContent.trim();
                        const matchYear = yearText.match(/(\d{4})/);
                        if (!matchYear) return;
                        const payYear = matchYear[1];
                        const [m, d, y] = dateTd.textContent.trim().split("/");
                        if (!m || !d || !y) return;
                        const formatted = `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
                        if (!allPayments[payYear]) allPayments[payYear] = [];
                        allPayments[payYear].push(formatted);
                    }
                });

                Object.keys(allPayments).forEach(y => allPayments[y].sort((a, b) => new Date(a) - new Date(b)));
                allRows.forEach(row => {
                    const dates = allPayments[row.year] || [];
                    if (row.status === "Paid") {
                        row.paid_date = row.installment === "1" ? dates[0] || "-" : dates[1] || "-";
                    }
                });
            } catch (e) {
                console.log("Error parsing payments table:", e.message);
            }

            return { rows: allRows };
        }, yearsToScrape, config);

        if (!result || result.rows.length === 0) {
            overview.tax_history = [];
            overview.delinquent = "NONE";
            overview.notes = "ALL PRIORS ARE PAID, NO CURRENT TAX DATA";
            return overview;
        }

        overview.tax_history = result.rows;

        // Determine delinquent/notes for current year
        const currentRows = result.rows.filter(r => r.year === yearData.year);
        const priorRows = result.rows.filter(r => r.year !== yearData.year);
        const hasCurrentDue = currentRows.some(r => r.status === "Due");
        const hasCurrentDelq = currentRows.some(r => r.status === "Delinquent");
        const hasPriorDelq = priorRows.some(r => r.status === "Delinquent");

        let delin, notes;
        if (hasPriorDelq) {
            delin = "PRIOR TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            notes = `PRIOR TAXES ARE DELINQUENT, ${yearData.year} TAXES ARE ${hasCurrentDelq ? "DUE" : hasCurrentDelq ? "DELINQUENT" : "PAID"}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
        } else if (hasCurrentDelq) {
            delin = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            notes = `ALL PRIORS ARE PAID, ${yearData.year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
        } else if (hasCurrentDue) {
            delin = "TAXES ARE DUE";
            notes = `ALL PRIORS ARE PAID, ${yearData.year} TAXES ARE DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
        } else {
            delin = "NONE";
            notes = `ALL PRIORS ARE PAID, ${yearData.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
        }

        overview.delinquent = delin;
        overview.notes = notes;
        return overview;

    } catch (error) {
        console.error(`[HANCOCK_PAID] Error loading tax history: ${error.message}`);
        overview.tax_history = [];
        overview.delinquent = "NONE";
        overview.notes = "FAILED TO LOAD TAX HISTORY";
        return overview;
    }
};



// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────

const account_search = async (page, account, county, yearLimit = 1) => {
    const config = counties[county];
    if (!config) throw new Error(`Unsupported county: ${county}`);
    await hancock_1(page, account, config);
    const yearData = await hancock_2(page, account, config);
    const overview = await hancock_extract_base(page, account, config, yearData);
    return await hancock_paid(page, overview, account, config, yearData, yearLimit);
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────

const search = async (req, res) => {
    let context = null;
    try {
        const { fetch_type, account, client } = req.body;
        if (!account) throw new Error("account is not defined");
        if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");
        const pathParts = req.path.split("/").filter(Boolean);
        const county = pathParts[pathParts.length - 1].toLowerCase();
        if (!counties[county]) throw new Error(`Unsupported county: ${county}`);
        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (req) => { if (['image', 'font'].includes(req.resourceType())) req.abort(); else req.continue(); });
        const data = await account_search(page, account, county, yearLimit);
        if (fetch_type === "html") res.status(200).render("parcel_data_official", { ...data, tax_history: data.tax_history });
        else res.status(200).json({ result: data });
    } catch (error) {
        const fetchType = req.body?.fetch_type || "api";
        if (fetchType === "html") res.status(200).render("error_data", { error: true, message: error.message });
        else res.status(500).json({ error: true, message: error.message });
    } finally {
        if (context) await context.close().catch(() => { });
    }
};

export { search };