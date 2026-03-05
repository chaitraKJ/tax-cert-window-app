//Author: Nithyananda R S

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ---------------------------
// Configuration
// ---------------------------
const CONFIG = {
    BASE_URL: "https://berkeleycountysc.paystar.io/app",
    AUTHORITY: "Berkeley County Treasurer, Moncks Corner, SC",
    CURRENT_YEAR: new Date().getFullYear(),
    TIMEOUTS: {
        PAGE_LOAD: 60000,
        NAVIGATION: 30000,
        SELECTOR: 15000,
    },
    SELECTORS: {
        SEARCH_INPUT: 'input.prompt',
        SUBMIT_BTN: 'button[type="submit"]',
        RESULTS_TABLE: 'table.ui.table',
        RESULTS_ROWS: 'tbody tr',
        VIEW_LINK: 'a[href^="/app/invoices/"]',
        BACK_TO_SEARCH: 'a.css-fab2a8[href*="app?term="]',
        PARCEL_LINK: 'a[href*="property_card.php?tms="]',
    },
};

const NAV = { waitUntil: "domcontentloaded", timeout: 30000 };

// ---------------------------
// Logger utility
// ---------------------------
const logger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || {}),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || {}),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || {}),
};

// ---------------------------
// Retry wrapper
// ---------------------------
/**
 * Retries a promise-returning function multiple times with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {number} retries - number of retry attempts
 */
const retry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) {
                console.error(`[ERROR] Retry failed after ${retries} attempts`, err);
                throw err;
            }
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
};

// ---------------------------
// Utilities
// ---------------------------
const formatCurrency = val => {
    const num = parseFloat(val);
    return isNaN(num)
        ? "$0.00"
        : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
};

const formatPaidDate = dateStr => {
    if (!dateStr || dateStr === "N/A" || dateStr.trim() === "") return "";
    const parts = dateStr.trim().split(/\D+/).map(Number).filter(n => !isNaN(n));
    if (parts.length < 3) return dateStr.trim();
    let [m, d, y] = parts;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return `${m.toString().padStart(2, '0')}/${d.toString().padStart(2, '0')}/${y}`;
};

// ---------------------------
// DOM Scraper
// ---------------------------
/**
 * Scrape property and tax details from a page.
 * @param {import('puppeteer').Page} page
 */
const scrapeDetails = async page => {
    try {
        return await page.evaluate(() => {
            const decode = text => {
                const el = document.createElement('textarea');
                el.innerHTML = text;
                return el.value.trim().replace(/\s+/g, ' ');
            };

            const getDlValue = key => {
                const dt = Array.from(document.querySelectorAll('dt')).find(el =>
                    el.textContent.trim().includes(key) || el.textContent.trim() === key
                );
                return dt ? dt.nextElementSibling?.textContent.trim() || "N/A" : "N/A";
            };

            const ownerBlock = document.querySelector('.address')?.innerHTML || "";
            const lines = ownerBlock.split('<br>').map(l => decode(l)).filter(Boolean);
            const owner = lines[0] || "N/A";
            const ownerAddress = lines.slice(1).join(', ') || "N/A";
            const propertyAddress = decode(document.querySelector('.description .address')?.textContent || "N/A");
            const statusSpan = document.querySelector('span.Paid, span.Unpaid');
            const isPaid = statusSpan?.classList.contains("Paid") || statusSpan?.textContent.trim() === "Paid";
            const totalDue = getDlValue("Total Due").replace(/[^0-9.-]/g, "") || "0";
            const amountPaid = isPaid
                ? getDlValue("Amount Paid").replace(/[^0-9.-]/g, "") || totalDue
                : "0";

            return {
                owner,
                owner_address: ownerAddress,
                property_address: propertyAddress,
                parcel: document.querySelector('a[href*="property_card.php?tms="]')?.textContent.trim() || "N/A",
                assessed_value: getDlValue("Assessed Value").replace(/[^0-9.-]/g, "") || "0",
                total_due: totalDue,
                amount_paid: amountPaid,
                last_payment_date: getDlValue("Last Payment Date"),
                year: getDlValue("Tax Year") || new Date().getFullYear().toString(),
                is_paid: isPaid,
            };
        });
    } catch (err) {
        logger.error("Failed page.evaluate", { error: err.message });
        throw err;
    }
};

// ---------------------------
// Parcel validation
// ---------------------------
const validateParcelNumber = async (page, searchedParcel) => {
    await page.waitForSelector(CONFIG.SELECTORS.PARCEL_LINK, { timeout: CONFIG.TIMEOUTS.SELECTOR });
    const detailParcel = await page.$eval(CONFIG.SELECTORS.PARCEL_LINK, el => el.textContent.trim());
    const normalize = p => p.replace(/[\s-]/g, "").toUpperCase();
    return normalize(searchedParcel) === normalize(detailParcel);
};

// ---------------------------
// Navigation helpers
// ---------------------------
const clickBackToSearch = async page => {
    await retry(() => page.waitForSelector(CONFIG.SELECTORS.BACK_TO_SEARCH, { visible: true }));
    await Promise.all([
        page.click(CONFIG.SELECTORS.BACK_TO_SEARCH),
        page.waitForNavigation(NAV).catch(() => { }),
    ]);
    await page.waitForSelector(CONFIG.SELECTORS.RESULTS_TABLE);
};

// ---------------------------
// Main scraper function
// ---------------------------
/**
 * Get tax data for a given parcel number.
 * @param {import('puppeteer').Page} page
 * @param {string} parcel
 */
const getTaxData = async (page, parcel) => {
    if (!parcel || !parcel.trim()) throw new Error("Parcel number is required");
    const log = (lvl, msg) => logger[lvl](msg, { parcel });

    try {
        await retry(() => page.goto(CONFIG.BASE_URL, { ...NAV, timeout: CONFIG.TIMEOUTS.PAGE_LOAD }));

        await page.waitForSelector(CONFIG.SELECTORS.SEARCH_INPUT);
        await page.click(CONFIG.SELECTORS.SEARCH_INPUT, { clickCount: 3 });
        await page.keyboard.press("Backspace");
        await page.type(CONFIG.SELECTORS.SEARCH_INPUT, parcel);

        await Promise.all([
            page.click(CONFIG.SELECTORS.SUBMIT_BTN),
            page.waitForNavigation(NAV)
        ]);

        await page.waitForSelector(CONFIG.SELECTORS.RESULTS_TABLE);
        const rowCount = await page.$$eval(CONFIG.SELECTORS.RESULTS_ROWS, r => r.length);
        if (rowCount === 0) throw new Error("No records found");

        const taxRecords = [];
        let ownerInfo = null;
        let matchFound = false;

        for (let i = 0; i < rowCount; i++) {
           

            const rows = await page.$$(CONFIG.SELECTORS.RESULTS_ROWS);
            const viewLink = await rows[i]?.$(CONFIG.SELECTORS.VIEW_LINK);
            if (!viewLink) continue;

            await Promise.all([
                viewLink.click(),
                page.waitForNavigation(NAV)
            ]);

            const isMatch = await validateParcelNumber(page, parcel);
            if (!isMatch) {
                log("warn", "Parcel mismatch — skipping");
                await clickBackToSearch(page);
                continue;
            }

            matchFound = true;
            const details = await scrapeDetails(page);

            if (!ownerInfo) {
                ownerInfo = {
                    owner: details.owner,
                    property_address: details.property_address,
                    owner_address: details.owner_address,
                    parcel: details.parcel,
                    assessed_value: details.assessed_value,
                };
            }

            const year = details.year || CONFIG.CURRENT_YEAR;
            const totalDue = parseFloat(details.total_due) || 0;
            const amountPaid = parseFloat(details.amount_paid) || 0;
            const amountDue = details.is_paid ? 0 : totalDue;

            const status = details.is_paid
                ? "PAID"
                : new Date() >= new Date(parseInt(year) + 1, 0, 16)
                    ? "DELINQUENT"
                    : "DUE";

            taxRecords.push({
                jurisdiction: "County",
                year: year.toString(),
                status,
                payment_type: "Annual",
                half_designation: "Full",
                base_amount: formatCurrency(totalDue),
                amount_paid: formatCurrency(amountPaid),
                amount_due: formatCurrency(amountDue),
                paid_date: details.last_payment_date && details.last_payment_date !== "N/A"
                    ? formatPaidDate(details.last_payment_date.trim())
                    : "",
                due_date: `01/15/${parseInt(year) + 1}`,
                delq_date: `01/16/${parseInt(year) + 1}`,
                land_value: "N/A",
                improvements: "N/A",
                total_assessed_value: formatCurrency(details.assessed_value),
                receipt_number: "N/A",
            });

            await clickBackToSearch(page);
        }

        if (!matchFound) throw new Error("No matching parcel found");

        const sorted = taxRecords.sort((a, b) => parseInt(a.year) - parseInt(b.year));
        const hasDelinquent = sorted.some(r => r.status === "DELINQUENT");
        const latest = sorted[0];

        const { notes, delinquent } = hasDelinquent
            ? {
                notes: `PRIOR YEARS DELINQUENT. ${latest.year} TAXES ARE ${latest.status}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15`,
                delinquent: "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            }
            : {
                notes: `ALL PRIORS ARE PAID. ${latest.year} TAXES ARE ${latest.status}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15`,
                delinquent: "NONE"
            };

        return {
            processed_date: new Date().toISOString().split("T")[0],
            owner_name: [ownerInfo.owner],
            property_address: ownerInfo.property_address,
            owner_address: ownerInfo.owner_address,
            parcel_number: ownerInfo.parcel,
            land_value: "N/A",
            improvements: "N/A",
            total_assessed_value: formatCurrency(ownerInfo.assessed_value),
            exemption: "$0.00",
            total_taxable_value: formatCurrency(ownerInfo.assessed_value),
            taxing_authority: CONFIG.AUTHORITY,
            notes,
            delinquent,
            tax_history: sorted,
        };
    } catch (err) {
        log("error", `Scraping failed: ${err.message}`);
        throw err;
    }
};

// ---------------------------
// Express handler
// ---------------------------
export const search = async (req, res) => {
    const { fetch_type = "api", account } = req.body || {};
    let context = null;

    try {
        if (!account?.trim()) throw new Error("Parcel required");

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Block images/fonts for speed
        await page.setRequestInterception(true);
        page.on("request", r => ["stylesheet", "image", "font", "media"].includes(r.resourceType()) ? r.abort() : r.continue());

        const result = await getTaxData(page, account.trim());

        return fetch_type === "html"
            ? res.render("parcel_data_official", result)
            : res.json({ result });
    } catch (error) {
        console.error(`[ERROR] Main scraper error: ${error.message}`);
        const payload = {
            processed_date: new Date().toISOString().split("T")[0],
            owner_name: ["Error or No Record Found"],
            property_address: "N/A",
            owner_address: "N/A",
            parcel_number: account || "unknown",
            notes: error.message.includes("No records") || error.message.includes("matching parcel")
                ? "No tax records found for this parcel."
                : "Scraping error occurred.",
            delinquent: "N/A",
            tax_history: [],
            taxing_authority: CONFIG.AUTHORITY,
            total_assessed_value: "$0.00",
            exemption: "$0.00",
            total_taxable_value: "$0.00",
            land_value: "N/A",
            improvements: "N/A",
        };

        const status = error.message.includes("No records") || error.message.includes("matching parcel") ? 200 : 500;

        return fetch_type === "html"
            ? res.status(status).render("parcel_data_official", payload)
            : res.status(status).json({ result: payload });
    } finally {
        if (context) await context.close().catch(() => { });
    }
};

export default { search };
