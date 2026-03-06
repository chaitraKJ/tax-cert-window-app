// Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

/* ═══════════════════════════════════════════════════════════════════════
 * CONFIGURATION - Centralized settings for timeouts, selectors, URLs, etc.
 * ═══════════════════════════════════════════════════════════════════════ */
const CONFIG = {
  BASE_URL:
    "https://taxes.paystar.io/app/customer/jasper-county-tax/search/property-taxes",
  BASE_DOMAIN: "https://taxes.paystar.io",
  AUTHORITY: "Jasper County Tax, Ridgeland, SC",
  CURRENT_YEAR: new Date().getFullYear(),
  MAX_YEARS_BACK: 10,
  TIMEOUTS: {
    PAGE_LOAD: 60000,
    NAVIGATION: 60000,
    SELECTOR: 30000,
    SHORT: 10000,
  },
  SELECTORS: {
    SEARCH_INPUT: "#search1",
    SUBMIT_BTN: 'button[type="submit"]',
    TABLE: "table.ui.sortable.table",
    DETAIL_DL: "dl.css-1do5m6g",
    BACK_LINK: 'a[href*="/search/property-taxes"]',
  },
  TAX_DATES: {
    DUE_MONTH: 0, // January
    DUE_DAY: 15,
    DELQ_MONTH: 2, // March
    DELQ_DAY: 17,
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * CUSTOM ERROR CLASSES
 * ═══════════════════════════════════════════════════════════════════════ */
class JasperScraperError extends Error {
  constructor(message, code, retryable = false, context = {}) {
    super(message);
    this.name = "JasperScraperError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class NoRecordsError extends JasperScraperError {
  constructor(parcel) {
    super(`No tax records found for parcel ${parcel}`, "NO_RECORDS", false, {
      parcel,
    });
    this.name = "NoRecordsError";
  }
}

class NavigationError extends JasperScraperError {
  constructor(step, parcel) {
    super(`Navigation failed at step: ${step}`, "NAVIGATION", true, {
      step,
      parcel,
    });
    this.name = "NavigationError";
  }
}

class SelectorError extends JasperScraperError {
  constructor(selector, parcel, step) {
    super(`Selector not found: ${selector}`, "SELECTOR", true, {
      selector,
      parcel,
      step,
    });
    this.name = "SelectorError";
  }
}

class ValidationError extends JasperScraperError {
  constructor(message, field) {
    super(message, "VALIDATION", false, { field });
    this.name = "ValidationError";
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * STRUCTURED LOGGER
 * ═══════════════════════════════════════════════════════════════════════ */
const log = (level, parcel, step, message = "", meta = {}) => {
  if (level === "info") return;
  const timestamp = new Date().toISOString();
  const hmsTime = timestamp.split("T")[1].split(".")[0];
  const structuredLog = {
    level: level.toUpperCase(),
    timestamp,
    service: "jasper-scraper",
    parcel,
    step,
    message,
    ...meta,
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
 * VALIDATION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════ */
const validateParcel = (parcel) => {
  if (!parcel || typeof parcel !== "string")
    throw new ValidationError("Parcel must be a non-empty string", "parcel");
  const trimmed = parcel.trim();
  if (trimmed.length === 0)
    throw new ValidationError("Parcel cannot be empty", "parcel"); // Allow any alphanumeric and hyphens/spaces for input validation
  const sanitized = trimmed.replace(/\s+/g, "-");
  if (sanitized.length < 5)
    throw new ValidationError("Parcel must be at least 5 chars", "parcel");
  if (!/^[a-zA-Z0-9\-]+$/.test(sanitized))
    throw new ValidationError("Parcel contains invalid chars", "parcel");
  return trimmed; // Return the trimmed original for the search input
};

const validateFetchType = (fetchType) => {
  if (!fetchType || !["html", "api"].includes(fetchType)) {
    throw new ValidationError(
      "fetch_type must be 'html' or 'api'",
      "fetch_type",
    );
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * RETRY WRAPPER
 * ═══════════════════════════════════════════════════════════════════════ */
const withRetry = async (
  operation,
  context = {},
  maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS,
  baseDelay = CONFIG.RETRY.BASE_DELAY,
) => {
  const { parcel = "unknown", step = "unknown" } = context;
  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof JasperScraperError && !error.retryable) {
        log("error", parcel, step, `Non-retryable: ${error.message}`, {
          error: error.code,
        });
        throw error;
      }
      if (attempt >= maxAttempts) break;
      const delay = baseDelay * (1 << attempt);
      log(
        "warn",
        parcel,
        step,
        `Retry ${attempt + 1}/${maxAttempts} after ${delay}ms`,
        { error: error.message },
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
};

/* ═══════════════════════════════════════════════════════════════════════
 * DATE & CURRENCY UTILITIES
 * ═══════════════════════════════════════════════════════════════════════ */
const formatDate = (date) => {
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
};

const formatScrapedDate = (dateStr) => {
  if (!dateStr || dateStr === "N/A") return "N/A";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${year}`;
};

const calculateTaxDates = (year) => {
  const y = parseInt(year, 10);
  if (isNaN(y) || y < 1900) return { dueDate: "N/A", delqDate: "N/A" };
  const due = new Date(
    y + 1,
    CONFIG.TAX_DATES.DUE_MONTH,
    CONFIG.TAX_DATES.DUE_DAY,
  );
  const delq = new Date(
    y + 1,
    CONFIG.TAX_DATES.DELQ_MONTH,
    CONFIG.TAX_DATES.DELQ_DAY,
  );
  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
};

const isYearDelinquent = (year, now = new Date()) => {
  const delq = new Date(
    parseInt(year, 10) + 1,
    CONFIG.TAX_DATES.DELQ_MONTH,
    CONFIG.TAX_DATES.DELQ_DAY,
  );
  return now >= delq;
};

const formatCurrency = (val) => {
  if (val == null || val === "N/A") return "$0.00";
  const num =
    typeof val === "string"
      ? parseFloat(val.replace(/[^\d.-]/g, ""))
      : parseFloat(val);
  return isNaN(num)
    ? "$0.00"
    : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ═══════════════════════════════════════════════════════════════════════
 * PUPPETEER HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */
const clickWhenReady = async (page, sel, parcel, step) => {
  try {
    await page.waitForSelector(sel, {
      visible: true,
      timeout: CONFIG.TIMEOUTS.SELECTOR,
    });
    await page.click(sel);
  } catch (e) {
    throw new SelectorError(sel, parcel, step);
  }
};

const typeClear = async (page, sel, text, parcel, step) => {
  try {
    await page.waitForSelector(sel, {
      visible: true,
      timeout: CONFIG.TIMEOUTS.SHORT,
    });
    await page.click(sel, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(text);
    const val = await page.$eval(sel, (el) => el.value);
    if (val !== text)
      log(
        "warn",
        parcel,
        step,
        `Value mismatch: expected "${text}", got "${val}"`,
      );
  } catch (e) {
    throw new SelectorError(sel, parcel, step);
  }
};

const waitForPageReady = async (page, timeout = CONFIG.TIMEOUTS.SHORT) => {
  try {
    await Promise.race([
      page.waitForFunction(() => document.readyState === "complete", {
        timeout,
      }),
      page.waitForSelector("body", { timeout }),
    ]);
  } catch (e) {
    log("warn", "system", "PAGE_READY", "Page ready timeout (non-critical)");
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * NAVIGATION HELPERS (Using Direct URL Re-run Strategy)
 * ═══════════════════════════════════════════════════════════════════════ */
const reRunSearch = async (page, parcel) => {
  const step = "RE_SEARCH";
  try {
    // 1. Navigate back to the base search page
    await page.goto(CONFIG.BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.NAVIGATION,
    }); // 2. Re-enter the parcel number
    await typeClear(page, CONFIG.SELECTORS.SEARCH_INPUT, parcel, parcel, step); // 3. Re-submit the search and wait for the results table to appear
    await Promise.all([
      page.click(CONFIG.SELECTORS.SUBMIT_BTN),
      page
        .waitForNavigation({
          waitUntil: "networkidle0",
          timeout: CONFIG.TIMEOUTS.NAVIGATION,
        })
        .catch(() => {}),
    ]);
    await page.waitForSelector(CONFIG.SELECTORS.TABLE, {
      visible: true,
      timeout: CONFIG.TIMEOUTS.SELECTOR,
    });
  } catch (e) {
    // If the re-search fails (e.g., input or submit button not found)
    throw new NavigationError(
      "Failed to rerun search and return to search results list",
      parcel,
    );
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * DATA EXTRACTION - Enhanced to pull all available fields
 * ═══════════════════════════════════════════════════════════════════════ */
const scrapeDetails = async (page) => {
  return page.evaluate(() => {
    const getItemValue = (key) => {
      const dls = document.querySelectorAll("dl.css-1do5m6g");
      for (let dl of dls) {
        const dt = Array.from(dl.querySelectorAll("dt.key")).find(
          (el) => el.textContent.trim() === key,
        );
        if (dt) {
          let dd = dt.nextElementSibling;
          if (!dd) continue; // **REFINED LOGIC:** Handling the nested anchor tag and cleaning the parcel number
          if (key === "Parcel Number") {
            const a = dd.querySelector("a");
            let val = a ? a.textContent : dd.textContent; // Crucial: Use strict regex to remove all non-alphanumeric chars
            return val.replace(/[^a-zA-Z0-9]/g, "").trim() || "N/A";
          }

          let val = dd.textContent.trim();
          const span = dd.querySelector("span.wrap.right");
          if (span) val = span.textContent.trim();
          if (dd.tagName.toLowerCase() === "address") {
            val = Array.from(dd.childNodes)
              .map((node) => node.textContent.trim())
              .filter((v) => v)
              .join(", ");
          }
          return val;
        }
      }
      return "N/A";
    }; // Property Information

    const property = {
      parcel_number: getItemValue("Parcel Number"),
      description: getItemValue("Description"),
      district: getItemValue("District"),
      acres: getItemValue("Acres"),
      assessed_value:
        getItemValue("Assessed Value").replace(/[^\d.-]/g, "") || "0",
      taxable_appraised_value:
        getItemValue("Taxable Appraised Value").replace(/[^\d.-]/g, "") || "0",
      owner: getItemValue("Owner"),
      owner_address: getItemValue("Owner Address"),
    }; // Bill Information

    const bill = {
      record_type: getItemValue("Record Type"),
      tax_year: getItemValue("Tax Year"),
      receipt: getItemValue("Receipt"),
      due_date: getItemValue("Due Date"),
      status: getItemValue("Status"),
      amount_paid: getItemValue("Amount Paid").replace(/[^\d.-]/g, "") || "0",
      payment_date: getItemValue("Payment Date"),
    }; // Taxes & Fees

    const taxes = {
      base_taxes: getItemValue("Base Taxes").replace(/[^\d.-]/g, "") || "0",
      credit: getItemValue("Credit").replace(/[^\d.-]/g, "") || "0",
      penalty: getItemValue("Penalty").replace(/[^\d.-]/g, "") || "0",
      costs: getItemValue("Costs").replace(/[^\d.-]/g, "") || "0",
      total_due: getItemValue("Total Due").replace(/[^\d.-]/g, "") || "0",
    };

    return { ...property, ...bill, ...taxes };
  });
};

/* ═══════════════════════════════════════════════════════════════════════
 * BUSINESS LOGIC
 * ═══════════════════════════════════════════════════════════════════════ */
const determineTaxStatus = (statusText, year) => {
  if (statusText.toLowerCase() === "paid") return "PAID";
  return isYearDelinquent(year) ? "DELINQUENT" : "DUE";
};

const buildTaxHistoryRecord = (row, details, assessedValue) => {
  // 1. Calculate hardcoded dates first (always necessary).
  const calculated = calculateTaxDates(row.year); // 2. Handle case where detail scrape (and verification) failed completely.

  if (!details) {
    return {
      jurisdiction: "County",
      year: row.year.toString(),
      status: row.status_text.toUpperCase() || "N/A",
      payment_type: "N/A",
      half_designation: "N/A",
      base_amount: "$0.00",
      credit: "$0.00",
      penalty: "$0.00",
      costs: "$0.00",
      amount_paid: "$0.00",
      amount_due: "$0.00",
      paid_date: "N/A", // ACTION: Use hardcoded dates when details are null
      due_date: calculated.dueDate,
      delq_date: calculated.delqDate,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: "$0.00",
      receipt_number: row.receipt,
      _verified: false,
    };
  }
  // --- Details were scraped successfully (details is NOT null) ---
  const status = determineTaxStatus(details.status, row.year);
  const base = parseFloat(details.base_taxes) || 0;
  const paid = parseFloat(details.amount_paid) || 0;
  const due = parseFloat(details.total_due) || 0;
  const credit = parseFloat(details.credit) || 0;
  const penalty = parseFloat(details.penalty) || 0;
  const costs = parseFloat(details.costs) || 0; // 3. Determine Final Dates:
  // ACTION: ONLY use the hardcoded calculated dates
  const dueDate = calculated.dueDate;
  const delqDate = calculated.delqDate;
  const paidDate =
    details.payment_date !== "N/A"
      ? formatScrapedDate(details.payment_date)
      : "";

  return {
    jurisdiction: "County",
    year: row.year.toString(),
    status,
    payment_type: "Annual",
    half_designation: "First Half + Second Half",
    base_amount: formatCurrency(base),
    credit: formatCurrency(credit),
    penalty: formatCurrency(penalty),
    costs: formatCurrency(costs),
    amount_paid: formatCurrency(paid),
    amount_due: formatCurrency(due),
    paid_date: paidDate,
    due_date: dueDate, // Always hardcoded
    delq_date: delqDate, // Always hardcoded
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: formatCurrency(assessedValue),
    receipt_number: row.receipt, // Marker for verified records
    _verified: true,
  };
};

const buildNotesAndStatus = (taxHistory) => {
  const NOTE = "NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15";
  if (taxHistory.length === 0) {
    return {
      notes: `ALL PRIORS ARE PAID,${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: "NONE",
    }; // This case should handle when no unpaid records exist
  } // Sort by year, then receipt number for stability, and use the latest year for status check
  taxHistory.sort((a, b) => {
    if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
    return a.receipt_number.localeCompare(b.receipt_number);
  }); // Find the latest entry in the returned history (which is either the latest paid or the latest unpaid)
  const latestRecord = taxHistory[taxHistory.length - 1];

  if (!latestRecord) {
    // Safety check, although history.length === 0 is handled above
    return {
      notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: "NONE",
    };
  }
  const latestYear = latestRecord.year;
  const latestStatus = latestRecord.status; // Check if any prior year (before the latest year) has a DELINQUENT status
  const hasDelinquentPrior = taxHistory.some(
    (r) => r.status === "DELINQUENT" && parseInt(r.year) < parseInt(latestYear),
  ); // If the latest record is PAID and there's only one record (meaning all priors were paid)

  if (latestStatus === "PAID" && taxHistory.length === 1) {
    return {
      notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
      delinquent: "NONE",
    };
  } // If the latest record is paid, but we have more than one record, it means the priors are unpaid (e.g., [2022 DUE, 2024 PAID])
  if (latestStatus === "PAID" && taxHistory.length > 1) {
    return {
      notes: `PRIORS ARE DELINQUENT . ${latestYear} TAXES ARE PAID. ${NOTE}`,
      delinquent: "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF",
    };
  }

  if (hasDelinquentPrior || latestStatus === "DELINQUENT") {
    return {
      notes: `PRIORS ARE DELINQUENT . ${latestYear} TAXES ARE ${latestStatus}. ${NOTE}`,
      delinquent: "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF",
    };
  } // This case handles if the latest year is DUE, and no priors are delinquent/due (taxHistory.length === 1)
  return {
    notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`,
    delinquent: "NONE",
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
  // Clean the input parcel number using strict non-alphanumeric removal for comparison
  const expectedBaseParcel = parcel.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  try {
    // 1. Navigate to search page and search
    await page.goto(CONFIG.BASE_URL, {
      waitUntil: "networkidle0",
      timeout: CONFIG.TIMEOUTS.PAGE_LOAD,
    });
    await waitForPageReady(page);
    await typeClear(
      page,
      CONFIG.SELECTORS.SEARCH_INPUT,
      parcel,
      parcel,
      "SEARCH_INPUT",
    );
    await Promise.all([
      page.click(CONFIG.SELECTORS.SUBMIT_BTN),
      page
        .waitForNavigation({
          waitUntil: "networkidle0",
          timeout: CONFIG.TIMEOUTS.NAVIGATION,
        })
        .catch(() => {}),
    ]);
    await page.waitForSelector(CONFIG.SELECTORS.TABLE, {
      timeout: CONFIG.TIMEOUTS.SELECTOR,
    }); // 2. Extract all rows from table

    const historyRaw = await page.evaluate(
      (tableSel, maxYears) => {
        const rows = document.querySelectorAll(`${tableSel} tbody tr`);
        return (
          Array.from(rows)
            .map((r) => {
              const cells = r.querySelectorAll("td");
              const owner_cell = cells[0]?.textContent.trim() || "N/A";
              const year_cell = cells[1]?.textContent.trim() || "";
              const receipt_cell = cells[2]?.textContent.trim() || "N/A";
              const status_span = cells[4]?.querySelector("span");
              const status_text = status_span
                ? status_span.textContent.trim()
                : "";
              const view_a = r.querySelector("a");
              const view_href = view_a ? view_a.getAttribute("href") : "";
              return {
                owner: owner_cell,
                year: parseInt(year_cell),
                receipt: receipt_cell,
                status_text,
                view_href,
              };
            })
            // FIX: Filter out any record where status_text is 'Refund' OR 'Errored' (case-insensitive)
            .filter((r) => {
              const status = r.status_text.toLowerCase();
              return status !== "refund" && status !== "errored";
            })
            .filter((r) => !isNaN(r.year))
            .sort((a, b) => a.year - b.year)
            .filter(
              (r, i, arr) => r.year >= arr[arr.length - 1].year - maxYears + 1,
            )
        );
      },
      CONFIG.SELECTORS.TABLE,
      CONFIG.MAX_YEARS_BACK,
    );

    if (historyRaw.length === 0) throw new NoRecordsError(parcel);

    const ownerFromTable = historyRaw[historyRaw.length - 1].owner.replace(
      /&amp;/g,
      "&",
    ); // 3. Identify records to scrape and records to return.

    const latestRow = historyRaw[historyRaw.length - 1];
    const unpaidRows = historyRaw.filter(
      (r) => r.status_text.toLowerCase() !== "paid",
    );
    let rowsToScrape = [];
    let recordsToProcess = []; // This list is used for the final tax_history array
    // Use Receipt Number for Uniqueness in Scrape List

    const scrapeMap = new Map(); // 1. Add the latest bill (highest year) - ensures property details are scraped.
    if (latestRow) {
      scrapeMap.set(latestRow.receipt, latestRow);
    } // 2. Add all unpaid bills. If the latest bill is unpaid, this updates the existing entry.
    unpaidRows.forEach((row) => scrapeMap.set(row.receipt, row));

    rowsToScrape = Array.from(scrapeMap.values()); // Process List (Final output):
    if (unpaidRows.length > 0) {
      // Case 1: Unpaid records exist. Only return these.
      recordsToProcess = unpaidRows;
    } else if (latestRow) {
      // Case 2: All records are paid. Return only the latest (paid) record.
      recordsToProcess = [latestRow];
      log(
        "info",
        parcel,
        "FILTER",
        "All records are paid. Returning only the latest paid year.",
      );
    } else {
      // Case 3: No records found (Should be caught by the check above, but for completeness)
      recordsToProcess = [];
    } // Sort scrape list to ensure the bill containing the latest property details is scraped first
    rowsToScrape.sort((a, b) => b.year - a.year); // 4. Scrape detail pages with verification

    const detailsMap = new Map(); // receipt -> details object (Key changed from 'year' to 'receipt')
    let property_address = "N/A";
    let owner_address = "N/A";
    let assessed_value = "0";
    let taxable_value = "0";
    for (let i = 0; i < rowsToScrape.length; i++) {
      const row = rowsToScrape[i];
      await withRetry(
        async () => {
          await page.goto(`${CONFIG.BASE_DOMAIN}${row.view_href}`, {
            waitUntil: "networkidle0",
            timeout: CONFIG.TIMEOUTS.NAVIGATION,
          });
        },
        { parcel, step: `DETAIL_GOTO_${row.year}` },
      );
      await waitForPageReady(page);
      await page.waitForSelector(CONFIG.SELECTORS.DETAIL_DL, {
        timeout: CONFIG.TIMEOUTS.SELECTOR,
      });
      const details = await scrapeDetails(page);
      // === NEW EDGE CASE CHECK: Ignore Zero-Value Records ===
      const isZeroRecord =
        parseFloat(details.base_taxes) === 0 &&
        parseFloat(details.credit) === 0 &&
        parseFloat(details.penalty) === 0 &&
        parseFloat(details.costs) === 0 &&
        parseFloat(details.total_due) === 0;

      if (isZeroRecord) {
        log(
          "warn",
          parcel,
          `ZERO_RECORD_${row.year}`,
          `Ignoring record for year ${row.year} as all key financial fields are zero.`,
        ); // Remove this receipt from the details map if it somehow got added earlier
        detailsMap.delete(row.receipt); // If the record was in the original `recordsToProcess` list, we must remove it so it's not processed later.
        recordsToProcess = recordsToProcess.filter(
          (r) => r.receipt !== row.receipt,
        );
        await reRunSearch(page, parcel); // Must return to list view before next loop iteration
        continue; // Skip the rest of the loop for this row
      } // --- PARCEL VERIFICATION LOGIC ---
      // ======================================================

      const scrapedParcel = details.parcel_number.toLowerCase();
      if (scrapedParcel !== expectedBaseParcel) {
        log(
          "warn",
          parcel,
          `VERIFY_${row.year}`,
          `Parcel mismatch: Expected ${expectedBaseParcel}, found ${scrapedParcel}. Skipping record.`,
        );
        if (i === 0) {
          log(
            "error",
            parcel,
            `VERIFY_${row.year}`,
            "Mismatch on LATEST year/receipt. Cannot guarantee property data integrity.",
          );
        }
        await reRunSearch(page, parcel);
        continue;
      } // --- END PARCEL VERIFICATION LOGIC ---
      // Store details by receipt number
      detailsMap.set(row.receipt, details); // Extract property info (only done once, from the first scraped record, which should be the latest)

      if (i === 0) {
        property_address = details.description || "N/A";
        owner_address = details.owner_address || "N/A";
        assessed_value = details.assessed_value;
        taxable_value = details.taxable_appraised_value;
      }

      if (i < rowsToScrape.length - 1) {
        await reRunSearch(page, parcel);
      }
    } // 5. Final records to process are the recordsToProcess. Sort them ascending by year.

    recordsToProcess.sort((a, b) => a.year - b.year); // 6. Build final tax history records

    let taxHistory = recordsToProcess.map((row) => {
      // Look up details by receipt number (which is unique per bill)
      const details = detailsMap.get(row.receipt) || null;
      return buildTaxHistoryRecord(row, details, assessed_value);
    }); // CRITICAL FILTER: Remove records that failed verification.
    taxHistory = taxHistory.filter((record) => record._verified === true); // Clean up temporary key
    taxHistory.forEach((record) => delete record._verified);

    const { notes, delinquent } = buildNotesAndStatus(taxHistory);

    return {
      processed_date: new Date().toISOString().split("T")[0],
      owner_name: ownerFromTable ? [ownerFromTable] : ["Unknown"],
      property_address,
      owner_address,
      parcel_number: parcel,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: formatCurrency(assessed_value),
      exemption: "$0.00",
      total_taxable_value: formatCurrency(taxable_value),
      taxing_authority: CONFIG.AUTHORITY,
      notes,
      delinquent,
      tax_history: taxHistory,
    };
  } catch (e) {
    if (e instanceof NoRecordsError) throw e;
    log("error", parcel, "FATAL", "getTaxData failed", {
      error: e.message,
      stack: e.stack,
    });
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
    await page.setDefaultNavigationTimeout(CONFIG.TIMEOUTS.PAGE_LOAD);
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      if (["stylesheet", "font", "image", "media"].includes(r.resourceType()))
        r.abort();
      else r.continue();
    });
    const data = await withRetry(() => getTaxData(page, parcel), {
      parcel,
      step: "CORE_FETCH",
    });
    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (e) {
    let parcel = "unknown";
    try {
      if (req.body?.account) parcel = validateParcel(req.body.account);
    } catch {}
    const isVal = e instanceof ValidationError;
    const isNo = e instanceof NoRecordsError;
    const status = isVal ? 400 : isNo ? 200 : 500;
    const payload = isNo
      ? handleNotFound(e.context.parcel)
      : {
          error: true,
          message: e.message || "Error",
          code: e.code || "UNKNOWN",
        };
    log(isVal ? "warn" : "error", parcel, "API_ERROR", e.message, {
      code: e.code,
      status,
    });
    if (fetch_type === "html") {
      isNo
        ? res.status(200).render("parcel_data_official", payload)
        : res.status(status).render("error_data", payload);
    } else {
      isNo
        ? res.status(200).json({ result: payload })
        : res.status(status).json(payload);
    }
  } finally {
    if (browserContext) {
      try {
        await browserContext.close();
      } catch (e) {
        log("warn", "system", "CLEANUP", "Failed", { error: e.message });
      }
    }
  }
};

module.exports = { search };