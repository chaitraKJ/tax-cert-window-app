// Author: Nithyananda R S

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

/* ═══════════════════════════════════════════════════════════════════════
 * CONFIGURATION - Centralized settings for timeouts, selectors, URLs, etc.
 * ═══════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  BASE_URL: "https://www7.richlandcountysc.gov/TreasurerTaxInfo/Main.aspx", // Main search page
  AUTHORITY: "Richland County Treasurer, Columbia, SC",                     // Official taxing authority
  CURRENT_YEAR: new Date().getFullYear()-1,                                   // Dynamic current tax year
  MAX_YEARS_BACK: 10,                                                        // How far back to check (e.g., 2025 → 2020)

  TIMEOUTS: {
    PAGE_LOAD: 60000,   // Max time to load initial page
    NAVIGATION: 15000,  // Max time for navigation after click
    SELECTOR: 15000,    // Max wait for any selector
    SHORT: 10000,       // General short timeout
    FORM_RESET: 10000,  // Max wait for form reset confirmation
  },

  SELECTORS: {
    MENU: "#mnuMainn1",                     // Dropdown menu to access Real Estate search
    YEAR_INPUT: "#txtYearRealEstate3",      // Input field for tax year
    TMS_INPUT: "#txtTMSRealEstate",         // Input field for TMS/parcel number
    SUBMIT_BTN: "#btnSubmitRealEstate",     // Submit button to search
    RESULT_LINK: "#gvRealEstate a",         // First result link in search table
    BACK_BTN: "#btnTaxInfoBackReal",        // Back button to return to search
  },

  TAX_DATES: {
    DUE_MONTH: 0,           // January (0-indexed)
    DUE_DAY: 16,            // Due date: January 16
    DELQ_OFFSET_DAYS: 1,    // Delinquent starting January 17
  },

  RETRY: {
    MAX_ATTEMPTS: 3,        // Max retry attempts for flaky operations
    BASE_DELAY: 1000,       // Base delay in ms (exponential backoff)
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * CUSTOM ERROR CLASSES - Structured errors with retryability & context
 * ═══════════════════════════════════════════════════════════════════════ */

class RichlandScraperError extends Error {
  constructor(message, code, retryable = false, context = {}) {
    super(message);
    this.name = "RichlandScraperError";
    this.code = code;           // Machine-readable error code
    this.retryable = retryable; // Can retry this error?
    this.context = context;     // Additional debug info
    this.timestamp = new Date().toISOString();
  }
}

// No tax records found for given TMS
class NoRecordsError extends RichlandScraperError {
  constructor(tms) {
    super(`No tax records found for TMS ${tms}`, "NO_RECORDS", false, { tms });
    this.name = "NoRecordsError";
  }
}

// Failed to reset form after multiple attempts
class FormResetError extends RichlandScraperError {
  constructor(tms, attempts) {
    super(`Form reset failed after ${attempts} attempts`, "FORM_RESET", true, { tms, attempts });
    this.name = "FormResetError";
  }
}

// Navigation failed at a specific step
class NavigationError extends RichlandScraperError {
  constructor(step, tms) {
    super(`Navigation failed at step: ${step}`, "NAVIGATION", true, { step, tms });
    this.name = "NavigationError";
  }
}

// DOM selector not found
class SelectorError extends RichlandScraperError {
  constructor(selector, tms, step) {
    super(`Selector not found: ${selector}`, "SELECTOR", true, { selector, tms, step });
    this.name = "SelectorError";
  }
}

// Input validation failure
class ValidationError extends RichlandScraperError {
  constructor(message, field) {
    super(message, "VALIDATION", false, { field });
    this.name = "ValidationError";
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * STRUCTURED LOGGER - Only warnings & errors (info logs removed)
 * ═══════════════════════════════════════════════════════════════════════ */

const log = (level, tms, step, message = "", meta = {}) => {
  if (level === "info") return; // Drop all success/info logs silently

  const timestamp = new Date().toISOString();
  const hmsTime = timestamp.split("T")[1].split(".")[0];
  const structuredLog = { level: level.toUpperCase(), timestamp, service: "richland-scraper", tms, step, message, ...meta };
  const humanLog = `[${level.toUpperCase()}] ${hmsTime} [TMS:${tms}] ${step} ${message}`;
  const logFn = console[level] || console.error; // Use console.warn / console.error

  if (process.env.NODE_ENV === "production") {
    logFn(JSON.stringify(structuredLog)); // JSON for log aggregators (e.g. ELK, Datadog)
  } else {
    logFn(humanLog, meta.error ? structuredLog : ""); // Human-readable in dev
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * VALIDATION UTILITIES - Sanitize and validate inputs early
 * ═══════════════════════════════════════════════════════════════════════ */

const validateTMS = (tms) => {
  if (!tms || typeof tms !== "string") throw new ValidationError("TMS must be a non-empty string", "tms");
  const trimmed = tms.trim();
  if (trimmed.length === 0) throw new ValidationError("TMS cannot be empty", "tms");
  const sanitized = trimmed.replace(/[-\s]/g, ""); // Remove hyphens and spaces
  if (sanitized.length < 5) throw new ValidationError("TMS must be at least 5 chars", "tms");
  if (!/^[a-zA-Z0-9]+$/.test(sanitized)) throw new ValidationError("TMS contains invalid chars", "tms");
  return sanitized;
};

const validateFetchType = (fetchType) => {
  if (!fetchType || !["html", "api"].includes(fetchType)) {
    throw new ValidationError("fetch_type must be 'html' or 'api'", "fetch_type");
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * RETRY WRAPPER - Exponential backoff with max attempts
 * ═══════════════════════════════════════════════════════════════════════ */

const withRetry = async (operation, context = {}, maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS, baseDelay = CONFIG.RETRY.BASE_DELAY) => {
  const { tms = "unknown", step = "unknown" } = context;
  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof RichlandScraperError && !error.retryable) {
        log("error", tms, step, `Non-retryable: ${error.message}`, { error: error.code });
        throw error; // Don't retry non-retryable errors
      }
      if (attempt >= maxAttempts) break;
      const delay = baseDelay * (1 << attempt); // 2^n using bit shift (faster than Math.pow)
      log("warn", tms, step, `Retry ${attempt + 1}/${maxAttempts} after ${delay}ms`, { error: error.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError; // Exhausted retries
};

/* ═══════════════════════════════════════════════════════════════════════
 * DATE & CURRENCY UTILITIES - Format dates and money consistently
 * ═══════════════════════════════════════════════════════════════════════ */

const formatDate = (date) => {
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`; // MM/DD/YYYY
};

const parseDateWithMonthName = (text) => {
  if (!text) return "";
  const match = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i); // e.g., "January 15, 2024"
  if (!match) return "";
  const months = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
  const month = months[match[1].toLowerCase()];
  if (!month) return "";
  return `${month}/${match[2].padStart(2, "0")}/${match[3]}`; // → MM/DD/YYYY
};

const calculateTaxDates = (year) => {
  const y = parseInt(year, 10);
  if (isNaN(y) || y < 1900) return { dueDate: "N/A", delqDate: "N/A" };
  const due = new Date(y + 1, 0, 16); // January 16 of next year
  const delq = new Date(due.getTime() + 86400000); // +1 day in milliseconds
  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
};

const isYearDelinquent = (year, now = new Date()) => {
  const delq = new Date(parseInt(year, 10) + 1, 0, 17); // January 17 of next year
  return now >= delq;
};

const formatCurrency = (val) => {
  if (val == null || val === "N/A") return "$0.00";
  const num = typeof val === "string" ? parseFloat(val.replace(/[^\d.-]/g, "")) : parseFloat(val); // Strip $, commas
  return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ═══════════════════════════════════════════════════════════════════════
 * PUPPETEER HELPERS - Reusable DOM interactions
 * ═══════════════════════════════════════════════════════════════════════ */

const clickWhenReady = async (page, sel, tms, step) => {
  try {
    await page.waitForSelector(sel, { visible: true, timeout: CONFIG.TIMEOUTS.SELECTOR });
    await page.click(sel);
  } catch (e) { throw new SelectorError(sel, tms, step); } // Selector missing or not visible
};

const typeClear = async (page, sel, text, tms, step) => {
  try {
    await page.waitForSelector(sel, { visible: true, timeout: CONFIG.TIMEOUTS.SHORT });
    await page.click(sel, { clickCount: 3 }); // Triple-click selects all text
    await page.keyboard.press("Backspace");   // Clear selection
    await page.keyboard.type(text);           // Type new value
    const val = await page.$eval(sel, el => el.value);
    if (val !== text) log("warn", tms, step, `Value mismatch: expected "${text}", got "${val}"`);
  } catch (e) { throw new SelectorError(sel, tms, step); }
};

const waitForPageReady = async (page, timeout = CONFIG.TIMEOUTS.SHORT) => {
  try {
    await Promise.race([
      page.waitForFunction(() => document.readyState === "complete", { timeout }),
      page.waitForSelector("body", { timeout })
    ]);
  } catch (e) {
    log("warn", "system", "PAGE_READY", "Page ready timeout (non-critical)");
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * NAVIGATION HELPERS - Control browser flow
 * ═══════════════════════════════════════════════════════════════════════ */

const openRealEstateMenu = async (page, tms) => {
  await clickWhenReady(page, CONFIG.SELECTORS.MENU, tms, "OPEN_MENU"); // Open dropdown
  await waitForPageReady(page);
};

const resetToSearchForm = async (page, tms) => {
  const max = 2;
  for (let i = 1; i <= max; i++) {
    try {
      if (i === 1) {
        await clickWhenReady(page, CONFIG.SELECTORS.MENU, tms, "RESET_MENU");
        await page.waitForFunction( // Wait until both inputs are empty
          (y, t) => {
            const yi = document.querySelector(y);
            const ti = document.querySelector(t);
            return yi && ti && yi.value === "" && ti.value === "";
          },
          { timeout: CONFIG.TIMEOUTS.FORM_RESET },
          CONFIG.SELECTORS.YEAR_INPUT,
          CONFIG.SELECTORS.TMS_INPUT
        );
        return;
      } else {
        await page.goto(CONFIG.BASE_URL, { waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.PAGE_LOAD });
        await waitForPageReady(page);
        await openRealEstateMenu(page, tms);
        return;
      }
    } catch (e) {
      if (i >= max) throw new FormResetError(tms, max); // Both methods failed
    }
  }
};

const clickFirstResult = async (page, tms) => {
  const has = await page.evaluate(s => !!document.querySelector(s), CONFIG.SELECTORS.RESULT_LINK);
  if (!has) { log("warn", tms, "RESULT", "No result link"); return false; }
  try {
    await Promise.all([
      page.click(CONFIG.SELECTORS.RESULT_LINK),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {})
    ]);
    return true;
  } catch (e) { throw new NavigationError("RESULT_CLICK", tms); }
};

const goBack = async (page, tms) => {
  try {
    await clickWhenReady(page, CONFIG.SELECTORS.BACK_BTN, tms, "GO_BACK");
    await waitForPageReady(page);
  } catch (e) {
    log("warn", tms, "GO_BACK", "Back button missing");
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * DATA EXTRACTION - Pull data from detail page
 * ═══════════════════════════════════════════════════════════════════════ */

const scrapeDetails = async (page) => {
  return page.evaluate(() => {
    const get = (s, f = "") => document.querySelector(s)?.textContent.trim() || f;
    const getM = (...ss) => { for (const s of ss) { const t = get(s); if (t && t !== "N/A") return t; } return "N/A"; };
    const owner = getM("#lblTaxInfoRName", "#lblTaxInfoRName2"); // Try multiple possible owner fields
    const addr = [get("#lblTaxInfoRAddress"), get("#lblTaxInfoRCityName"), get("#lblTaxInfoRState"), get("#lblTaxInfoRZip")]
      .filter(p => p && p !== "N/A").join(", ") || "N/A";
    return {
      owner,
      property_address: get("#lblTaxInfoRPropertyDescription", "N/A"),
      owner_address: addr,
      tms: get("#lblTaxInfoRTMSNo", "N/A"),
      assessed_value: get("#lblTaxInfoRAssessedValue").replace(/,/g, "") || "0",
      amount_due: get("#lblTaxInfoRAmountDue").replace(/,/g, "") || "0",
      amount_paid: get("#lblTaxInfoRAmountPaid").replace(/,/g, "") || "0",
      date_paid_raw: get("#lblTaxInfoRDatePaid"),
    };
  });
};

/* ═══════════════════════════════════════════════════════════════════════
 * BUSINESS LOGIC - Build tax records and determine status
 * ═══════════════════════════════════════════════════════════════════════ */

const determineTaxStatus = (due, year) => due === 0 ? "PAID" : isYearDelinquent(year) ? "DELINQUENT" : "DUE";

const buildTaxHistoryRecord = (details, year) => {
  const due = parseFloat(details.amount_due) || 0;
  const paid = parseFloat(details.amount_paid) || 0;
  const base = due + paid;
  const { dueDate, delqDate } = calculateTaxDates(year);
  const status = determineTaxStatus(due, year);
  const paidDate = details.date_paid_raw ? parseDateWithMonthName(details.date_paid_raw) : "";
  return {
    jurisdiction: "County",
    year: year.toString(),
    status,
    payment_type: "Annual",
    half_designation: "First Half + Second Half",
    base_amount: formatCurrency(base),
    amount_paid: formatCurrency(paid),
    amount_due: formatCurrency(due),
    paid_date: paidDate,
    due_date: dueDate,
    delq_date: delqDate,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: formatCurrency(details.assessed_value),
    receipt_number: "N/A",
  };
};

const buildNotesAndStatus = (taxHistory) => {
  const NOTE = "NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15";

  if (taxHistory.length === 0) {
    return { notes: `ALL TAXES PAID. ${NOTE}`, delinquent: "NONE" };
  }

  const latest = taxHistory[0];
  const latestYear = latest.year;
  const latestStatus = latest.status;

  if (taxHistory.length === 1) {
    return {
      notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: latestStatus === "DELINQUENT" ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    };
  }

  const hasDelinquentPrior = taxHistory.slice(1).some(r => r.status === "DELINQUENT");

  if (hasDelinquentPrior) {
    return {
      notes: `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF",
    };
  }

  return {
    notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
    delinquent: latestStatus === "DELINQUENT" ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
  };
};

const handleNotFound = (tms, reason = "No tax records found.") => {
  log("info", tms, "NOT_FOUND", reason); // Kept for visibility in no-records case
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    owner_address: "No records found",
    parcel_number: tms,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "$0.00",
    total_taxable_value: "N/A",
    taxing_authority: CONFIG.AUTHORITY,
    notes: reason,
    delinquent: "N/A",
    tax_history: [],
  };
};

/* ═══════════════════════════════════════════════════════════════════════
 * CORE SCRAPING LOGIC - Loop through years, stop early if newer year paid
 * ═══════════════════════════════════════════════════════════════════════ */

const getTaxData = async (page, tms) => {
  try {
    await page.goto(CONFIG.BASE_URL, { waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.PAGE_LOAD });
    await openRealEstateMenu(page, tms);

    const records = [];
    let ownerInfo = null;
    let hasPaidNewerYear = false; // Stop searching older years if any newer year is paid

    for (let year = CONFIG.CURRENT_YEAR; year >= CONFIG.CURRENT_YEAR - CONFIG.MAX_YEARS_BACK; year--) {
      const step = `YEAR_${year}`;

      if (hasPaidNewerYear) break; // Early exit: newer year already paid

      try {
        await withRetry(() => resetToSearchForm(page, tms), { tms, step: "RESET" }, 2);

        await typeClear(page, CONFIG.SELECTORS.YEAR_INPUT, year.toString(), tms, `${step}_YEAR`);
        await typeClear(page, CONFIG.SELECTORS.TMS_INPUT, tms, tms, `${step}_TMS`);

        await Promise.all([
          page.click(CONFIG.SELECTORS.SUBMIT_BTN),
          page.waitForNavigation({ waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {})
        ]);

        const hasResult = await clickFirstResult(page, tms);
        if (!hasResult) continue; // No result → skip to next year

        const details = await scrapeDetails(page);
        if (details.owner === "N/A") {
          await goBack(page, tms);
          continue; // Invalid data → skip
        }

        if (!ownerInfo) {
          ownerInfo = { // Capture owner info from first valid result
            owner: details.owner,
            property_address: details.property_address,
            owner_address: details.owner_address,
            tms: details.tms,
            assessed_value: details.assessed_value,
          };
        }

        const record = buildTaxHistoryRecord(details, year);

        if (year === CONFIG.CURRENT_YEAR) {
          records.push(record); // Always include current year
        } else if (record.amount_due !== "$0.00") {
          records.push(record); // Include older unpaid years
        }

        if (record.amount_due === "$0.00") {
          hasPaidNewerYear = true; // Stop after this
        }

        await goBack(page, tms);
      } catch (e) {
        log("warn", tms, step, "Year failed", { error: e.message });
        await goBack(page, tms);
        continue;
      }
    }

    if (records.length === 0 || !ownerInfo) throw new NoRecordsError(tms);

    const sortedHistory = records.sort((a, b) => parseInt(a.year) - parseInt(b.year)); // Oldest → newest
    const { notes, delinquent } = buildNotesAndStatus(sortedHistory);

    return {
      processed_date: new Date().toISOString().split("T")[0],
      owner_name: [ownerInfo.owner],
      property_address: ownerInfo.property_address,
      owner_address: ownerInfo.owner_address,
      parcel_number: ownerInfo.tms,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: formatCurrency(ownerInfo.assessed_value),
      exemption: "$0.00",
      total_taxable_value: formatCurrency(ownerInfo.assessed_value),
      taxing_authority: CONFIG.AUTHORITY,
      notes,
      delinquent,
      tax_history: sortedHistory,
    };
  } catch (e) {
    if (e instanceof NoRecordsError) throw e;
    log("error", tms, "FATAL", "getTaxData failed", { error: e.message, stack: e.stack });
    throw e;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * API HANDLER - Entry point for Express route
 * ═══════════════════════════════════════════════════════════════════════ */

const search = async (req, res) => {
  const { fetch_type, account } = req.body || {};
  let browserContext = null;

  try {
    validateFetchType(fetch_type);
    const tms = validateTMS(account);

    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext(); // Isolated context
    const page = await browserContext.newPage();
    await page.setDefaultNavigationTimeout(CONFIG.TIMEOUTS.PAGE_LOAD);
    await page.setRequestInterception(true);
    page.on("request", r => {
      ["stylesheet", "font", "image", "media"].includes(r.resourceType()) ? r.abort() : r.continue(); // Block heavy assets
    });

    const data = await getTaxData(page, tms);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (e) {
    let tms = "unknown";
    try { if (req.body?.account) tms = validateTMS(req.body.account); } catch {}
    const isVal = e instanceof ValidationError;
    const isNo = e instanceof NoRecordsError;
    const status = isVal ? 400 : isNo ? 200 : 500;
    const payload = isNo ? handleNotFound(e.context.tms) : { error: true, message: e.message || "Error", code: e.code || "UNKNOWN" };

    log(isVal ? "warn" : "error", tms, "API_ERROR", e.message, { code: e.code, status });

    if (fetch_type === "html") {
      isNo ? res.status(200).render("parcel_data_official", payload) : res.status(status).render("error_data", payload);
    } else {
      isNo ? res.status(200).json({ result: payload }) : res.status(status).json(payload);
    }
  } finally {
    if (browserContext) {
      try { await browserContext.close(); }
      catch (e) { log("warn", "system", "CLEANUP", "Failed", { error: e.message }); }
    }
  }
};

module.exports = { search };