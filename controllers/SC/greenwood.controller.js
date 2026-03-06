//Author :- Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// ====================================================
// 1. CONFIGURATION
// ====================================================
const GREENWOOD_CONFIG = {
  searchUrl: "https://greenwoodco.corebtpay.com/egov/apps/bill/pay.egov?view=search;itemid=1",
  authority: "Greenwood County Tax Collector, Greenwood, SC",
  baseUrl: "https://greenwoodco.corebtpay.com/egov/apps/bill/"
};

// ====================================================
// 2. CONSTANTS
// ====================================================
const MAX_RETRIES = 3;
const SEARCH_TIMEOUT = 90000;
const SELECTOR_TIMEOUT = 30000;
const NAVIGATION_TIMEOUT = 30000;
const DETAIL_PAGE_TIMEOUT = 60000;
const MAX_PARCEL_LENGTH = 50;
const ANNUAL_NOTE = "NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/15";

// ====================================================
// 3. SELECTORS
// ====================================================
const SELECTORS = {
  MAP_INPUT: "#ebillSearch_accountNumFld",
  SEARCH_BUTTON: "input[value='Find Account']",
  RESULTS_TABLE: "table.eGov_listContent",
  NO_RESULTS_MSG: ".eGov_errorMessage, .errorMessage",
  VIEW_LINK: "a[href*='view=bill']",
  DETAIL_CONTAINER: "#documentWrapper"
};

// ====================================================
// 4. UTILITY FUNCTIONS
// ====================================================
function log(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    county: "greenwood",
    ...meta
  };
  const logFn = console[level] || console.log;
  logFn(JSON.stringify(entry));
}

function formatCurrency(str) {
  if (!str) return "$0.00";
  const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullMatch) return trimmed;

  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortMatch) {
    const [, m, d, y] = shortMatch;
    const fullYear = parseInt(y, 10) <= 50 ? 2000 + parseInt(y, 10) : 1900 + parseInt(y, 10);
    return `${m}/${d}/${fullYear}`;
  }

  return trimmed;
}

function sanitizeParcelNumber(input) {
  if (!input || typeof input !== "string") {
    throw new ValidationError("Map number must be a non-empty string");
  }
  return input.trim().replace(/[^\w\-]/g, "");
}

function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${date.getFullYear()}`;
}

function calculateTaxDates(taxYear) {
  const year = parseInt(taxYear, 10);
  if (isNaN(year) || year < 1900 || year > 2100) {
    return { dueDate: "N/A", delqDate: "N/A" };
  }
  const due = new Date(year + 1, 0, 15);  // Jan 15 next year
  const delq = new Date(due);
  delq.setDate(delq.getDate() + 1);       // Jan 16
  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
}

// ====================================================
// 5. ERROR CLASSES
// ====================================================
class SearchError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = "SearchError";
    this.code = code;
    this.retryable = retryable;
  }
}
class NoResultsError extends SearchError {
  constructor() { super("No records found", "NO_RESULTS", false); }
}
class DetailLoadError extends SearchError {
  constructor(year) {
    super(`Failed to load detail page for year ${year}`, "DETAIL_LOAD", true);
  }
}
class StructureError extends SearchError {
  constructor(message) { super(message, "STRUCTURE_ERROR", false); }
}
class ValidationError extends SearchError {
  constructor(message) { super(message, "VALIDATION_ERROR", false); }
}

// ====================================================
// 6. RETRY WRAPPER
// ====================================================
async function withRetry(fn, context = null, args = [], maxAttempts = MAX_RETRIES) {
  let lastError;
  for (let i = 0; i <= maxAttempts; i++) {
    try {
      return await fn.apply(context, args);
    } catch (error) {
      lastError = error;
      if (error instanceof SearchError && !error.retryable) throw error;
      log("warn", "Retry attempt failed", { attempt: i + 1, maxAttempts: maxAttempts + 1, error: error.message });
      if (i < maxAttempts) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

// ====================================================
// 7. VALIDATION
// ====================================================
function validateRequest(body) {
  if (!body) return "Request body is required";
  const { fetch_type, account } = body;
  if (!fetch_type || !["html", "api"].includes(fetch_type)) {
    return "Invalid fetch_type. Use 'html' or 'api'.";
  }
  if (!account) return "Map number (account) is required";
  if (typeof account !== "string") return "Map number must be a string";
  if (account.trim().length === 0) return "Map number cannot be empty";

  try {
    const sanitized = sanitizeParcelNumber(account);
    if (sanitized.length === 0) return "Map number contains no valid characters";
    if (sanitized.length > MAX_PARCEL_LENGTH) return `Map number too long (max ${MAX_PARCEL_LENGTH} characters)`;
  } catch (e) {
    return e.message;
  }
  return null;
}

// ====================================================
// 8. FIXED: SEARCH RESULTS PARSING (2025 COLUMN ORDER)
// ====================================================
async function parseSearchResults(page) {
  try {
    const records = await page.evaluate(() => {
      const rows = document.querySelectorAll("table.eGov_listContent tbody tr");
      const results = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 7) return;

        // 2025 column order: View | Account | Year | Owner | Status | Date Paid | Amount Due
        const viewButton = cells[0].querySelector("input[type='button']");
        const onclick = viewButton?.getAttribute("onclick") || "";
        const accountMatch = onclick.match(/account=([^;']+)/);
        const account = accountMatch ? accountMatch[1] : cells[1].textContent.trim();

        const taxYear = cells[2].textContent.trim();
        const ownerName = cells[3].textContent.trim();
        const statusIcon = cells[4].querySelector("i");
        const isPaid = statusIcon?.classList.contains("fa-check");
        const datePaidRaw = cells[5].textContent.trim();
        const amountDueRaw = cells[6].textContent.trim();

        results.push({
          account,
          year: taxYear,
          owner_name: ownerName,
          status: isPaid ? "Paid" : "Unpaid",
          date_paid: datePaidRaw || null,
          amount_due: amountDueRaw,
          is_paid: isPaid,
          detail_url: account ? `pay.egov?view=detail;account=${account};itemid=1` : null
        });
      });

      return results;
    });

    records.forEach(r => {
      if (r.date_paid) r.date_paid = normalizeDate(r.date_paid);
    });

    return records;
  } catch (e) {
    log("error", "Failed to parse search results", { error: e.message });
    throw new StructureError("Failed to parse search results table");
  }
}

async function performSearch(page, mapNumber) {
  try {
    await page.goto(GREENWOOD_CONFIG.searchUrl, { waitUntil: "domcontentloaded", timeout: SEARCH_TIMEOUT });
    await page.waitForSelector(SELECTORS.MAP_INPUT, { timeout: SELECTOR_TIMEOUT, visible: true });

    log("info", "Entering map number", { mapNumber });
    await page.focus(SELECTORS.MAP_INPUT);
    await page.evaluate(sel => { document.querySelector(sel).value = ""; }, SELECTORS.MAP_INPUT);
    await page.type(SELECTORS.MAP_INPUT, mapNumber, { delay: 50 });

    const enteredValue = await page.$eval(SELECTORS.MAP_INPUT, el => el.value);
    log("info", "Map number entered", { expected: mapNumber, actual: enteredValue });

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT }),
      page.click(SELECTORS.SEARCH_BUTTON)
    ]);

    await page.waitForSelector(`${SELECTORS.RESULTS_TABLE}, ${SELECTORS.NO_RESULTS_MSG}`, { timeout: SELECTOR_TIMEOUT });
    const hasResults = await page.$(SELECTORS.RESULTS_TABLE);
    if (!hasResults) throw new NoResultsError();

    return await parseSearchResults(page);
  } catch (e) {
    if (e instanceof SearchError) throw e;
    log("error", "Search failed", { error: e.message, mapNumber });
    throw new SearchError("Search navigation failed", "NAV_ERROR", true);
  }
}

async function searchParcel(page, mapNumber) {
  return withRetry(async () => {
    const records = await performSearch(page, mapNumber);
    if (!records || records.length === 0) throw new NoResultsError();
    return { records };
  }, null, [page, mapNumber]);
}

// ====================================================
// 9. DETAIL PAGE EXTRACTION
// ====================================================
async function fetchRecordDetails(browser, record) {
  if (!record.detail_url) return null;

  let detailPage = null;
  try {
    detailPage = await browser.newPage();
    detailPage.setDefaultNavigationTimeout(DETAIL_PAGE_TIMEOUT);

    const fullUrl = `${GREENWOOD_CONFIG.baseUrl}${record.detail_url}`;
    await detailPage.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: DETAIL_PAGE_TIMEOUT });
    await detailPage.waitForSelector(SELECTORS.VIEW_LINK, { timeout: SELECTOR_TIMEOUT });

    const billUrl = await detailPage.$eval(SELECTORS.VIEW_LINK, el => el.href);
    await detailPage.goto(billUrl, { waitUntil: "domcontentloaded", timeout: DETAIL_PAGE_TIMEOUT });
    await detailPage.waitForSelector(SELECTORS.DETAIL_CONTAINER, { timeout: DETAIL_PAGE_TIMEOUT });

    return await extractBillData(detailPage);
  } catch (e) {
    log("error", "Failed to load detail page", { year: record.year, error: e.message });
    return null;
  } finally {
    if (detailPage) await detailPage.close().catch(() => {});
  }
}

async function extractBillData(page) {
  try {
    const data = await page.evaluate(() => {
      const fmt = str => {
        if (!str || str === "N/A") return "$0.00";
        const n = parseFloat(str.replace(/[^0-9.-]+/g, ""));
        return isNaN(n) ? "$0.00" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      // === OWNER & ADDRESS (unchanged) ===
      const custAddr = document.querySelector(".custAddrStyle");
      const ownerName = custAddr ? custAddr.textContent.trim().split("\n")[0].trim() : "N/A";

      const taxMapContainer = document.querySelector("#taxMapNumberContainer");
      const locationText = taxMapContainer?.textContent || "";
      const propertyAddress = locationText.match(/LOCATION:\s*(.+)/)?.[1].trim() || "N/A";

      const mapText = document.querySelector(".taxMapNumberStyle")?.textContent || "";
      const mapNumber = mapText.match(/TAX MAP NUMBER\s+([\d-]+)/)?.[1].trim() || "N/A";

      // === NEW: Extract from #taxTableBottomContainer (accurate labels) ===
      const getBottomTableValue = (label) => {
        const container = document.querySelector("#taxTableBottomContainer");
        if (!container) return "N/A";
        const labelEl = Array.from(container.querySelectorAll(".taxTableLabelIndent"))
          .find(el => el.textContent.trim() === label);
        if (!labelEl) return "N/A";
        const valueEl = labelEl.nextElementSibling;
        return valueEl ? valueEl.textContent.trim() : "N/A";
      };

      const assessedValueRaw = getBottomTableValue("ASSESSED VALUE")||"N/A";
      const taxValueRaw = getBottomTableValue("TAX VALUE")||"N/A";

      // === Tax amounts (still from main table or summary) ===
      const getTableValue = (label) => {
        const rows = document.querySelectorAll("table tbody tr, #documentWrapper div");
        for (const row of rows) {
          if (row.textContent.includes(label)) {
            const match = row.textContent.match(/[\d,]+\.?\d*/);
            return match ? match[0] : "N/A";
          }
        }
        return "N/A";
      };

      const totalDueText = document.querySelector("#customerSummaryHeader .largeText")?.textContent.trim() || "N/A";

      return {
        owner_name: [ownerName],
        property_address: propertyAddress,
        map_number: mapNumber,
        assessed_value: fmt(assessedValueRaw),        // ← Now correct: 30000.00 → $30,000.00
        tax_value: fmt(taxValueRaw),                  // ← Now correct: 500000.00 → $500,000.00
        total_due: fmt(totalDueText),
        county_tax: fmt(getTableValue("TOTAL COUNTY TAX DOLLARS")),
        education_tax: fmt(getTableValue("TOTAL EDUCATION TAX DOLLARS")),
        other_tax: fmt(getTableValue("TOTAL OTHER TAX DOLLARS")),
        property_details: {
          district: getTableValue("DISTRICT"),
          description: document.querySelector("#taxTableTopContainer .taxTableLargeRem .taxTableValueIndent")?.textContent.trim() || "N/A",
          buildings: getTableValue("BLDGS"),
          lots: getTableValue("LOTS"),
          acres: getTableValue("ACRES")
        }
      };
    });

    return data;
  } catch (e) {
    log("error", "Failed to extract bill data", { error: e.message });
    return null;
  }
}

// ====================================================
// 10. DELINQUENCY LOGIC – EXACTLY LIKE GREENVILLE
// ====================================================
function determineDelinquency(records) {
  const now = new Date();
  const unpaid = records.filter(r => !r.is_paid);
  const paid = records.filter(r => r.is_paid);

  const unpaidYears = unpaid
    .map(r => parseInt(r.year, 10))
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);

  if (unpaid.length === 0) {
    const latestYear = Math.max(...paid.map(r => parseInt(r.year, 10)));
    const latest = paid.find(r => parseInt(r.year, 10) === latestYear);

    return {
      allPaid: true,
      latestRecordToOpen: latest,
      delinquent: "NONE",
      notes: `ALL TAXES PAID, ${ANNUAL_NOTE}`
    };
  }

  const latestUnpaidYear = unpaidYears[0];
  const latestUnpaid = unpaid.find(r => parseInt(r.year, 10) === latestUnpaidYear);

  const isDelinquent = unpaidYears.some(y => now > new Date(y + 1, 0, 16));

  const priorText = unpaidYears.length > 1 ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";
  const currentStatus = now > new Date(latestUnpaidYear + 1, 0, 16) ? "DELINQUENT" : "DUE";

  return {
    allPaid: false,
    latestRecordToOpen: latestUnpaid,
    delinquent: isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    notes: `${priorText}, ${latestUnpaidYear} TAXES ARE ${currentStatus}, ${ANNUAL_NOTE}`
  };
}

// ====================================================
// 11. TAX HISTORY – EXACT STATUS WORDS LIKE GREENVILLE
// ====================================================
function buildTaxHistory(records, latest, details, allPaid) {
  const now = new Date();

  return records
    .filter(r => allPaid ? r.year === latest.year : !r.is_paid)
    .map(r => {
      const year = parseInt(r.year, 10);
      const { dueDate, delqDate } = calculateTaxDates(r.year);

      let status = "Unknown";
      if (r.is_paid) {
        status = "Paid";
      } else if (!isNaN(year)) {
        if (now > new Date(year + 1, 0, 16)) status = "Delinquent";
        else if (now > new Date(year + 1, 0, 15)) status = "Due";
        else status = "Due";
      }

      return {
        jurisdiction: "County",
        year: r.year,
        status,
        payment_type: "Annual",
        base_amount: formatCurrency(r.amount_due),
        county_tax: r.year === latest.year ? details.county_tax : "N/A",
        city_tax: r.year === latest.year ? details.other_tax : "N/A",
        fees: "N/A",
        penalty: "N/A",
        cost: "N/A",
        amount_paid: r.is_paid ? formatCurrency(r.amount_due) : "$0.00",
        amount_due: r.is_paid ? "$0.00" : formatCurrency(r.amount_due),
        paid_date: r.is_paid ? (r.date_paid || " ") : " ",
        due_date: dueDate,
        delq_date: delqDate,
        land_value: r.year === latest.year ? details.assessed_value : "N/A",
        improvements: "N/A",
        total_assessed_value: r.year === latest.year ? details.tax_value : "N/A",
        exemptions_breakdown: {
          residential_exemption: "N/A",
          homestead_exemption: "N/A",
          other_exemptions: "N/A",
          local_option_credit: "N/A"
        }
      };
    })
    .sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));
}

// ====================================================
// 12. RESPONSE BUILDERS
// ====================================================
function handleNotFound(mapNumber, reason) {
  log("info", "Returning not found response", { mapNumber, reason });
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    parcel_number: mapNumber,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: GREENWOOD_CONFIG.authority,
    notes: reason,
    delinquent: "N/A",
    tax_history: [],
    property_details: {}
  };
}

function buildSuccessResponse(details, notes, delinquent, history) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: details.owner_name,
    property_address: details.property_address,
    parcel_number: details.map_number,
    land_value: details.assessed_value,
    improvements: "N/A",
    total_assessed_value: details.tax_value||"N/A",
    exemption: "N/A",
    total_taxable_value: details.tax_value||"N/A",
    taxing_authority: GREENWOOD_CONFIG.authority,
    notes,
    delinquent,
    tax_history: history,
    property_details: details.property_details
  };
}

function sendResponse(res, data, fetchType) {
  if (fetchType === "html") {
    res.status(200).render("parcel_data_official", data);
  } else {
    res.status(200).json({ result: data });
  }
}

function sendErrorResponse(res, message, fetchType, status = 500) {
  if (fetchType === "html") {
    res.status(status).render("error_data", { error: true, message });
  } else {
    res.status(status).json({ error: true, message });
  }
  log("error", "Error response sent", { statusCode: status, message, fetchType });
}

// ====================================================
// 13. MAIN DATA FETCHER
// ====================================================
const getTaxData = async (page, mapNumber) => {
  try {
    const { records } = await searchParcel(page, mapNumber);
    if (!records?.length) {
      return handleNotFound(mapNumber, "No tax records found for this map number.");
    }

    const { allPaid, latestRecordToOpen, delinquent, notes } = determineDelinquency(records);
    if (!latestRecordToOpen) {
      return handleNotFound(mapNumber, "No valid tax record found.");
    }

    const browser = page.browser();
    const details = await fetchRecordDetails(browser, latestRecordToOpen);
    if (!details) {
      return handleNotFound(mapNumber, "Failed to load property details.");
    }

    const taxHistory = buildTaxHistory(records, latestRecordToOpen, details, allPaid);

    return buildSuccessResponse(details, notes, delinquent, taxHistory);
  } catch (err) {
    if (err instanceof NoResultsError) {
      return handleNotFound(mapNumber, "No tax records found for this map number.");
    }
    if (err instanceof StructureError) {
      log("error", "Website structure changed", { mapNumber, error: err.message });
      return handleNotFound(mapNumber, "Unable to parse website data. The website structure may have changed.");
    }
    log("error", "getTaxData unexpected error", { mapNumber, error: err.message, stack: err.stack });
    return handleNotFound(mapNumber, "An error occurred while fetching tax data.");
  }
};

// ====================================================
// 14. EXPRESS HANDLER
// ====================================================
const search = async (req, res) => {
  const valErr = validateRequest(req.body);
  if (valErr) {
    log("error", "Validation failed", { error: valErr, body: req.body });
    return sendErrorResponse(res, valErr, req.body.fetch_type || "api", 400);
  }

  const mapNumber = sanitizeParcelNumber(req.body.account);
  let browserContext = null;

  try {
    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();

    const data = await getTaxData(page, mapNumber);
    sendResponse(res, data, req.body.fetch_type);
  } catch (err) {
    log("error", "Search handler crash", { error: err.message, stack: err.stack });
    sendErrorResponse(res, "An unexpected error occurred. Please try again later.", req.body.fetch_type, 500);
  } finally {
    if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }
};

module.exports = { search };