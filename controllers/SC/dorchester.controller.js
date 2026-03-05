// Author: Nithyananda R S 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

/* ═══════════════════════════════════════════════════════════════════════
 * CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  BASE_URL: "https://dorchestercountysc.billtrax.com/welcome",
  AUTHORITY: "Dorchester County Treasurer, SC",
  CURRENT_YEAR: new Date().getFullYear(),
  MAX_YEARS_BACK: 10,

  TIMEOUTS: {
    PAGE_LOAD: 60000,
    NAVIGATION: 20000,
    ANGULAR_RENDER: 5000,
    SELECTOR: 15000,
    SHORT: 10000,
  },

  SELECTORS: {
    PARCEL_INPUT: 'input[placeholder*="Map #"]',
    SEARCH_BTN: 'button[type="submit"]',
    RESULTS_TABLE: 'table.table-borderless tbody',
    TABLE_ROWS: 'table.table-borderless tbody tr',
    NO_RESULTS: '.no-data, .alert, [class*="no-record"]',
  },

  TAX_DATES: {
    DUE_MONTH: 0,
    DUE_DAY: 15,
    DELQ_OFFSET_DAYS: 1,
  },

  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * CUSTOM ERROR CLASSES
 * ═══════════════════════════════════════════════════════════════════════ */

class DorchesterScraperError extends Error {
  constructor(message, code, retryable = false, context = {}) {
    super(message);
    this.name = "DorchesterScraperError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class NoRecordsError extends DorchesterScraperError {
  constructor(parcel) {
    super(`No tax records found for parcel ${parcel}`, "NO_RECORDS", false, { parcel });
    this.name = "NoRecordsError";
  }
}

class NavigationError extends DorchesterScraperError {
  constructor(step, parcel) {
    super(`Navigation failed at step: ${step}`, "NAVIGATION", true, { step, parcel });
    this.name = "NavigationError";
  }
}

class SelectorError extends DorchesterScraperError {
  constructor(selector, parcel, step) {
    super(`Selector not found: ${selector}`, "SELECTOR", true, { selector, parcel, step });
    this.name = "SelectorError";
  }
}

class ValidationError extends DorchesterScraperError {
  constructor(message, field) {
    super(message, "VALIDATION", false, { field });
    this.name = "ValidationError";
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * STRUCTURED LOGGER
 * ═══════════════════════════════════════════════════════════════════════ */

const log = (level, parcel, step, message = "", meta = {}) => {
  if (level === "info" && process.env.NODE_ENV !== "development") return;

  const timestamp = new Date().toISOString();
  const hmsTime = timestamp.split("T")[1].split(".")[0];
  const structuredLog = { 
    level: level.toUpperCase(), 
    timestamp, 
    service: "dorchester-scraper", 
    parcel, 
    step, 
    message, 
    ...meta 
  };
  const humanLog = `[${level.toUpperCase()}] ${hmsTime} [PARCEL:${parcel}] ${step} ${message}`;
  const logFn = console[level] || console.error;

  if (process.env.NODE_ENV === "production") {
    logFn(JSON.stringify(structuredLog));
  } else {
    logFn(humanLog, meta.error ? structuredLog : "");
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * VALIDATION & UTILITIES
 * ═══════════════════════════════════════════════════════════════════════ */

const validateParcel = (parcel) => {
  if (!parcel || typeof parcel !== "string") {
    throw new ValidationError("Parcel must be a non-empty string", "parcel");
  }
  const sanitized = parcel.trim().replace(/\s+/g, "");
  if (sanitized.length < 3) {
    throw new ValidationError("Parcel must be at least 3 chars", "parcel");
  }
  return sanitized;
};

const validateFetchType = (fetchType) => {
  if (!fetchType || !["html", "api"].includes(fetchType)) {
    throw new ValidationError("fetch_type must be 'html' or 'api'", "fetch_type");
  }
};

const withRetry = async (operation, context = {}, maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS, baseDelay = CONFIG.RETRY.BASE_DELAY) => {
  const { parcel = "unknown", step = "unknown" } = context;
  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof DorchesterScraperError && !error.retryable) {
        log("error", parcel, step, `Non-retryable: ${error.message}`, { error: error.code });
        throw error;
      }
      if (attempt >= maxAttempts) break;
      const delay = baseDelay * (1 << attempt);
      log("warn", parcel, step, `Retry ${attempt + 1}/${maxAttempts} after ${delay}ms`, { error: error.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
};

const formatDate = (date) => {
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
};

const parseDate = (dateStr) => {
  if (!dateStr || dateStr.trim() === "" || dateStr === "-") return "";
  const match = dateStr.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}` : dateStr.trim();
};

const calculateTaxDates = (year) => {
  const y = parseInt(year, 10);
  if (isNaN(y) || y < 1900) return { dueDate: "N/A", delqDate: "N/A" };
  const due = new Date(y + 1, 0, 15);
  const delq = new Date(due.getTime() + 86400000);
  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
};

const formatCurrency = (val) => {
  if (!val || val === "N/A" || val === "-") return "$0.00";
  const cleaned = typeof val === "string" ? val.replace(/[$,\s]/g, "") : String(val);
  const num = parseFloat(cleaned);
  return isNaN(num) ? "$0.00" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const extractYearFromNotice = (noticeNum) => {
  if (!noticeNum) return null;
  const match = noticeNum.match(/M-(\d{4})-/);
  return match ? match[1] : null;
};

/* ═══════════════════════════════════════════════════════════════════════
 * PUPPETEER HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */

const waitForAngular = async (page, timeout = CONFIG.TIMEOUTS.ANGULAR_RENDER) => {
  try {
    await page.waitForFunction(
      () => typeof window.getAllAngularTestabilities === 'function' 
        ? window.getAllAngularTestabilities().every(t => t.isStable()) 
        : true,
      { timeout }
    );
  } catch (e) {
    log("warn", "system", "ANGULAR_WAIT", "Angular stability timeout");
  }
  await new Promise(r => setTimeout(r, 1000));
};

const clickWhenReady = async (page, sel, parcel, step) => {
  await page.waitForSelector(sel, { visible: true, timeout: CONFIG.TIMEOUTS.SELECTOR });
  await page.click(sel);
};

const typeClear = async (page, sel, text, parcel, step) => {
  await page.waitForSelector(sel, { visible: true, timeout: CONFIG.TIMEOUTS.SHORT });
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 50 });
};

/* ═══════════════════════════════════════════════════════════════════════
 * BUSINESS LOGIC
 * ═══════════════════════════════════════════════════════════════════════ */

const determineTaxStatus = (status, paidDate, year) => {
  if (status === "PAID" && paidDate) return "PAID";
  if (status === "UNPAID") {
    const delqDate = new Date(parseInt(year || new Date().getFullYear()) + 1, 0, 16);
    return new Date() > delqDate ? "DELINQUENT" : "DUE";
  }
  return "UNKNOWN";
};

const buildNotesAndStatus = (taxHistory) => {
  const NOTE = "NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS JANUARY 15";

  if (taxHistory.length === 0) {
    return { notes: `PRIORS TAXES ARE PAID. ${NOTE}`, delinquent: "NONE" };
  }

  const latest = taxHistory[taxHistory.length - 1];
  const latestYear = latest.year;
  const latestStatus = latest.status;

  if (taxHistory.length === 1) {
    return {
      notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: latestStatus === "DELINQUENT" 
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
        : "NONE",
    };
  }

  const hasDelinquentPrior = taxHistory.slice(0, -1).some(r => r.status === "DELINQUENT");

  if (hasDelinquentPrior) {
    return {
      notes: `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF",
    };
  }

  return {
    notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
    delinquent: latestStatus === "DELINQUENT" 
      ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
      : "NONE",
  };
};

const handleNotFound = (parcel, reason = "No tax records found.") => {
  log("info", parcel, "NOT_FOUND", reason);
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    owner_address: "No records found",
    parcel_number: parcel,
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
 * CORE SCRAPING LOGIC
 * ═══════════════════════════════════════════════════════════════════════ */

const getTaxData = async (page, parcel) => {
  try {
    await page.goto(CONFIG.BASE_URL, { waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.PAGE_LOAD });
    await waitForAngular(page);

    await typeClear(page, CONFIG.SELECTORS.PARCEL_INPUT, parcel, parcel, "INPUT_PARCEL");
    await Promise.all([
      page.click(CONFIG.SELECTORS.SEARCH_BTN),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {})
    ]);
    await waitForAngular(page);
    await new Promise(r => setTimeout(r, 3000));

    const hasNoResults = await page.$(CONFIG.SELECTORS.NO_RESULTS);
    if (hasNoResults) throw new NoRecordsError(parcel);

    const rows = await page.$$(CONFIG.SELECTORS.TABLE_ROWS);
    if (rows.length === 0) throw new NoRecordsError(parcel);

    const records = [];

    // Parse all rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const data = await page.evaluate((r, idx) => {
        const cells = Array.from(r.querySelectorAll('td'));
        if (cells.length < 8) return null;

        const getText = i => cells[i]?.textContent.trim() || "";
        const statusDiv = r.querySelector('[class*="ribbon-"]');
        const status = statusDiv ? statusDiv.textContent.trim() : "UNKNOWN";

        let paidDate = "";
        for (const cell of cells) {
          if (cell.classList.contains('d-none')) continue;
          const txt = cell.textContent.trim();
          if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(txt)) paidDate = txt;
        }

        return {
          index: idx,
          type: getText(0),
          map_number: getText(1),
          notice_number: getText(2),
          billing_name: getText(3),
          property_location: getText(4),
          amount: getText(5),
          status,
          paid_date: paidDate,
        };
      }, row, i);

      if (data) {
        records.push(data);
      }
    }

    if (records.length === 0) throw new NoRecordsError(parcel);

    const ownerInfo = {
      owner: records[0].billing_name || "N/A",
      property_address: records[0].property_location || "N/A",
      parcel: records[0].map_number || parcel,
    };

    // Build tax history
    const taxHistory = records.map(record => {
      let year = "N/A";

      if (record.status === "PAID" && record.paid_date) {
        const match = record.paid_date.match(/(\d{4})$/);
        year = match ? match[1] : "N/A";
      } else {
        year = extractYearFromNotice(record.notice_number) || "N/A";
      }

      const { dueDate, delqDate } = calculateTaxDates(year);
      const amount = formatCurrency(record.amount);
      const isPaid = record.status === "PAID" && record.paid_date !== "";
      const status = determineTaxStatus(record.status, record.paid_date, year);

      return {
        jurisdiction: "County",
        year: year === "N/A" ? year : parseInt(year),
        status,
        payment_type: "Annual",
        half_designation: "Full Payment",
        base_amount: amount,
        amount_paid: isPaid ? amount : "$0.00",
        amount_due: isPaid ? "$0.00" : amount,
        paid_date: parseDate(record.paid_date),
        due_date: dueDate,
        delq_date: delqDate,
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A",
        total_taxable_value: "N/A",
        receipt_number: record.notice_number || "N/A",
      };
    }).sort((a, b) => (a.year || 0) - (b.year || 0));

    // Filtering logic
    const allPaid = taxHistory.every(r => r.status === "PAID");
    const latestRecord = taxHistory[taxHistory.length - 1];
    const unpaidRecords = taxHistory.filter(r => r.status !== "PAID");
    let filteredHistory = allPaid ? [latestRecord] : (unpaidRecords.length > 0 ? unpaidRecords : taxHistory);

    const { notes, delinquent } = buildNotesAndStatus(filteredHistory);

    return {
      processed_date: new Date().toISOString().split("T")[0],
      owner_name: [ownerInfo.owner],
      property_address: ownerInfo.property_address,
      owner_address: ownerInfo.property_address,
      parcel_number: ownerInfo.parcel,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: "N/A",
      exemption: "$0.00",
      total_taxable_value: "N/A",
      taxing_authority: CONFIG.AUTHORITY,
      notes,
      delinquent,
      tax_history: filteredHistory,
    };
  } catch (e) {
    if (e instanceof NoRecordsError) throw e;
    log("error", parcel, "FATAL", "getTaxData failed", { error: e.message, stack: e.stack });
    throw e;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * API HANDLER
 * ═══════════════════════════════════════════════════════════════════════ */

const search = async (req, res) => {
  const { fetch_type, account } = req.body || {};
  let browserContext = null;

  try {
    validateFetchType(fetch_type);
    const parcel = validateParcel(account);

    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();
    page.parcel = parcel;
    await page.setDefaultNavigationTimeout(CONFIG.TIMEOUTS.PAGE_LOAD);
    
    await page.setRequestInterception(true);
    page.on("request", r => {
      ["stylesheet", "font", "image", "media"].includes(r.resourceType()) ? r.abort() : r.continue();
    });

    const data = await getTaxData(page, parcel);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (e) {
    let parcel = "unknown";
    try { if (req.body?.account) parcel = validateParcel(req.body.account); } catch {}

    const isVal = e instanceof ValidationError;
    const isNo = e instanceof NoRecordsError;
    const status = isVal ? 400 : isNo ? 200 : 500;
    const payload = isNo ? handleNotFound(e.context?.parcel || parcel) : { error: true, message: e.message || "Error", code: e.code || "UNKNOWN" };

    log(isVal ? "warn" : "error", parcel, "API_ERROR", e.message, { code: e.code, status });

    if (fetch_type === "html") {
      isNo ? res.status(200).render("parcel_data_official", payload) : res.status(status).render("error_data", payload);
    } else {
      isNo ? res.status(200).json({ result: payload }) : res.status(status).json(payload);
    }
  } finally {
    if (browserContext) {
      try { await browserContext.close(); } catch (e) {
        log("warn", "system", "CLEANUP", "Failed", { error: e.message });
      }
    }
  }
};

export { search };
