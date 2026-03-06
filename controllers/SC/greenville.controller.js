// Author: Nithyananda R S

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// ====================================================
// 1. CONFIGURATION
// ====================================================
const GREENVILLE_CONFIG = {
  url: "https://www.greenvillecounty.org/appsas400/votaxqry/",
  authority: "Greenville County Treasurer, Greenville, SC",
  detailBaseUrl: "https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx"
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
  REAL_ESTATE_TAB: "#lnk_RealEstate",
  MAP_INPUT: "#ctl00_bodyContent_txt_MapNumber",
  SEARCH_LINK: "#ctl00_bodyContent_lnk_Search",
  RESULTS_TABLE: "#tbl_Results",
  NO_RESULTS_MSG: ".noResultsMessage, .errorMessage",
  DETAIL_TABLE: "#MyData",
  OWNER_NAME_CELL: "tr:has(th:contains('Owner')) td",
  TAX_YEAR_SPAN: "#ctl00_body_rpt_Data_ctl01_lbl_TaxYear"
};

// ====================================================
// 4. UTILITY FUNCTIONS
// ====================================================
function log(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    county: "greenville",
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
  if (!dateStr || typeof dateStr !== "string") return dateStr;
  const trimmed = dateStr.trim();
  
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
    throw new ValidationError("Parcel number must be a non-empty string");
  }
  return input.trim().replace(/[^\w\-\. ]/g, "");
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
  
  const due = new Date(year + 1, 0, 15);
  const delq = new Date(due);
  delq.setDate(delq.getDate() + 1);
  
  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
}

function isPastDueDate(now, year) {
  return now > new Date(year + 1, 0, 15);
}

function isPastDelqDate(now, year) {
  return now > new Date(year + 1, 0, 16);
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
      
      if (error instanceof SearchError && !error.retryable) {
        throw error;
      }
      
      log("warn", "Retry attempt failed", {
        attempt: i + 1,
        maxAttempts: maxAttempts + 1,
        error: error.message
      });
      
      if (i < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
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
    if (sanitized.length > MAX_PARCEL_LENGTH) {
      return `Map number too long (max ${MAX_PARCEL_LENGTH} characters)`;
    }
  } catch (e) {
    return e.message;
  }
  
  return null;
}

// ====================================================
// 8. SEARCH FUNCTIONALITY
// ====================================================
async function performSearch(page, mapNumber) {
  try {
    // Navigate to search page
    await page.goto(GREENVILLE_CONFIG.url, {
      waitUntil: "domcontentloaded",
      timeout: SEARCH_TIMEOUT
    });
    
    // STEP 1: Click "Real Estate" tab first
    await page.waitForSelector(SELECTORS.REAL_ESTATE_TAB, {
      timeout: SELECTOR_TIMEOUT,
      visible: true
    });
    
    log("info", "Clicking Real Estate tab", { mapNumber });
    await page.click(SELECTORS.REAL_ESTATE_TAB);
    
    // STEP 2: Wait for map number input div to be visible and enabled
    await page.waitForFunction(
      () => {
        const div = document.getElementById('div_MapNumber');
        const input = document.getElementById('ctl00_bodyContent_txt_MapNumber');
        return div && input && 
               div.style.display !== 'none' && 
               !input.disabled;
      },
      { timeout: SELECTOR_TIMEOUT }
    );
    
    log("info", "Map number input is ready", { mapNumber });
    
    // STEP 3: Focus, clear and enter map number
    await page.focus(SELECTORS.MAP_INPUT);
    
    // Triple-clear to ensure it's empty
    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, SELECTORS.MAP_INPUT);
    
    // Type the map number
    await page.type(SELECTORS.MAP_INPUT, mapNumber, { delay: 50 });
    
    // Verify the value was entered
    const enteredValue = await page.$eval(SELECTORS.MAP_INPUT, el => el.value);
    log("info", "Entered map number", { expected: mapNumber, actual: enteredValue });
    
    if (enteredValue !== mapNumber) {
      throw new SearchError("Failed to enter map number correctly", "INPUT_ERROR", true);
    }
    
    // STEP 4: Click search and wait for navigation
    log("info", "Clicking search button", { mapNumber });
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT
      }),
      page.click(SELECTORS.SEARCH_LINK)
    ]);
    
    // STEP 5: Wait for either results or error
    await page.waitForSelector(`${SELECTORS.RESULTS_TABLE}, ${SELECTORS.NO_RESULTS_MSG}`, {
      timeout: SELECTOR_TIMEOUT
    });
    
    // Check for results
    const hasResults = await page.$(SELECTORS.RESULTS_TABLE);
    if (!hasResults) throw new NoResultsError();
    
    // Parse results table
    return await parseSearchResults(page);
  } catch (e) {
    if (e instanceof SearchError) throw e;
    log("error", "Search failed", { error: e.message, mapNumber });
    throw new SearchError("Search navigation failed", "NAV_ERROR", true);
  }
}

async function parseSearchResults(page) {
  try {
    const records = await page.evaluate(() => {
      const rows = document.querySelectorAll("#tbl_Results tbody tr.even, #tbl_Results tbody tr.odd");
      const results = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 7) return;
        
        // Extract owner name (first cell, bold span)
        const ownerSpan = cells[0].querySelector("span[style*='font-weight: bold']");
        const ownerName = ownerSpan ? ownerSpan.textContent.trim() : "";
        
        // Extract detail link and receipt info
        const detailLink = cells[0].querySelector("a");
        const detailHref = detailLink ? detailLink.href : null;
        const receiptText = detailLink ? detailLink.textContent.trim() : "";
        
        // Parse year from receipt text (e.g., "2025 000003383 88 001")
        const yearMatch = receiptText.match(/^(\d{4})/);
        const year = yearMatch ? yearMatch[1] : "";
        
        // Extract map number (second cell, highlighted)
        const mapSpan = cells[1].querySelector("span.highlight");
        const mapNumber = mapSpan ? mapSpan.textContent.trim() : "";
        
        // Extract assessment (5th cell, first div)
        const assessmentDiv = cells[4].querySelector("div:first-child");
        const assessment = assessmentDiv ? assessmentDiv.textContent.trim() : "";
        
        // Extract date paid (5th cell, second div)
        const datePaidDiv = cells[4].querySelector("div:nth-child(2)");
        const datePaid = datePaidDiv ? datePaidDiv.textContent.trim() : "";
        
        // Extract base amount (6th cell, first div)
        const baseAmountDiv = cells[5].querySelector("div:first-child");
        const baseAmount = baseAmountDiv ? baseAmountDiv.textContent.trim() : "";
        
        // Extract amount paid (6th cell, second div)
        const amountPaidDiv = cells[5].querySelector("div:nth-child(2)");
        const amountPaid = amountPaidDiv ? amountPaidDiv.textContent.trim() : "";
        
        // Extract balance due (7th cell)
        const balanceDueSpan = cells[6].querySelector("span[style*='font-weight: bold']");
        const balanceDue = balanceDueSpan ? balanceDueSpan.textContent.trim() : "";
        
        // Determine payment status
        const isPaid = balanceDue === "" || balanceDue === "$0" || balanceDue === "$0.00";
        
        results.push({
          owner_name: ownerName,
          year,
          map_number: mapNumber,
          assessment,
          date_paid: datePaid,
          base_amount: baseAmount,
          amount_paid: amountPaid,
          balance_due: balanceDue || "$0.00",
          detail_link: detailHref,
          is_paid: isPaid
        });
      });
      
      return results;
    });
    
    return records;
  } catch (e) {
    log("error", "Failed to parse search results", { error: e.message });
    throw new StructureError("Failed to parse search results table");
  }
}

async function searchParcel(page, mapNumber) {
  return withRetry(async () => {
    const records = await performSearch(page, mapNumber);
    
    if (!records || records.length === 0) throw new NoResultsError();
    
    // Normalize dates
    records.forEach(r => {
      if (r.date_paid) r.date_paid = normalizeDate(r.date_paid);
    });
    
    return { records };
  }, null, [page, mapNumber]);
}

// ====================================================
// 9. DETAIL PAGE EXTRACTION
// ====================================================
async function fetchRecordDetails(browser, record) {
  if (!record.detail_link) {
    log("warn", "Record has no detail link", { year: record.year });
    return null;
  }
  
  let detailPage = null;
  try {
    detailPage = await browser.newPage();
    detailPage.setDefaultNavigationTimeout(DETAIL_PAGE_TIMEOUT);
    
    // Navigate to detail page
    await detailPage.goto(record.detail_link, {
      waitUntil: "domcontentloaded",
      timeout: DETAIL_PAGE_TIMEOUT
    });
    
    // Wait for detail table
    await detailPage.waitForSelector(SELECTORS.DETAIL_TABLE, {
      timeout: DETAIL_PAGE_TIMEOUT
    });
    
    // Extract data
    return await extractDetailData(detailPage);
  } catch (e) {
    log("error", "Failed to load detail page", {
      year: record.year,
      error: e.message
    });
    return null;
  } finally {
    if (detailPage) {
      try {
        await detailPage.close();
      } catch (e) {
        log("warn", "Failed to close detail page", { error: e.message });
      }
    }
  }
}

async function extractDetailData(page) {
  try {
    const data = await page.evaluate(() => {
      const getText = (label) => {
        const rows = document.querySelectorAll("#MyData tr");
        for (const row of rows) {
          const th = row.querySelector("th");
          if (th && th.textContent.includes(label)) {
            const td = row.querySelector("td");
            return td ? td.textContent.trim() : "N/A";
          }
        }
        return "N/A";
      };
      
      const fmt = str => {
        if (!str || str === "N/A") return "$0.00";
        const n = parseFloat(str.replace(/[^0-9.-]+/g, ""));
        return isNaN(n) ? "$0.00" : `$${n.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      };
      
      // Extract owner names (can be multiple lines)
      const ownerText = getText("Owner(s):");
      const owners = ownerText.split("<br>").map(o => o.trim()).filter(o => o && o !== "N/A");
      
      // Extract values
      const fairMarketValue = getText("Fair Market Value:");
      const taxableMarketValue = getText("Taxable Market Value:");
      const taxes = getText("Taxes:");
      
      // Extract location
      const location = getText("Location:");
      
      // Extract other info
      const acreage = getText("Acreage:");
      const description = getText("Description:");
      const subdivision = getText("Subdivision:");
      const deedBookPage = getText("Deed Book-Page:");
      const deedDate = getText("Deed Date:");
      const homesteadCode = getText("Homestead Code:");
      const assessmentClass = getText("Assessment Class:");
      const landUse = getText("Land Use:");
      
      return {
        owner_name: owners.length ? owners : ["N/A"],
        property_address: location,
        map_number: getText("Map #:"),
        fair_market_value: fmt(fairMarketValue),
        taxable_market_value: fmt(taxableMarketValue),
        taxes_due: fmt(taxes.replace(/\(due\)/i, "")),
        acreage,
        description,
        subdivision,
        deed_book_page: deedBookPage,
        deed_date: deedDate,
        homestead_code: homesteadCode,
        assessment_class: assessmentClass,
        land_use: landUse
      };
    });
    
    return data;
  } catch (e) {
    log("error", "Failed to extract detail data", { error: e.message });
    return null;
  }
}

// ====================================================
// 10. DELINQUENCY LOGIC
// ====================================================
function determineDelinquency(records) {
  const now = new Date();
  const unpaid = records.filter(r => !r.is_paid);
  const paid = records.filter(r => r.is_paid);
  
  // Get unpaid years sorted (newest first)
  const unpaidYears = unpaid
    .map(r => parseInt(r.year, 10))
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);
  
  // If all paid, return most recent paid record (by year, not array position)
  if (unpaid.length === 0) {
    // Find the record with the highest year number
    const latestYear = Math.max(...paid.map(r => parseInt(r.year, 10)).filter(y => !isNaN(y)));
    const latest = paid.find(r => parseInt(r.year, 10) === latestYear);
    
    if (!latest) {
      log("warn", "No valid paid record found", { records });
      return {
        allPaid: true,
        latestRecordToOpen: paid[0],
        delinquent: "NONE",
        notes: `ALL TAXES PAID, ${ANNUAL_NOTE}`
      };
    }
    
    const status = isPastDelqDate(now, latestYear) ? "DUE" : "PAID";
    
    return {
      allPaid: true,
      latestRecordToOpen: latest,
      delinquent: "NONE",
      notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${status}, ${ANNUAL_NOTE}`
    };
  }
  
  // Has unpaid records
  const latestUnpaidYear = unpaidYears[0];
  const latestUnpaid = unpaid.find(r => parseInt(r.year, 10) === latestUnpaidYear);
  
  // Check if delinquent
  const isDelinquent = unpaidYears.some(y => isPastDelqDate(now, y));
  
  // Build notes
  const priorText = unpaidYears.length > 1 ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";
  const currentStatus = isPastDelqDate(now, latestUnpaidYear) ? "DELINQUENT" : "DUE";
  
  return {
    allPaid: false,
    latestRecordToOpen: latestUnpaid,
    delinquent: isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    notes: `${priorText}, ${latestUnpaidYear} TAXES ARE ${currentStatus}, ${ANNUAL_NOTE}`
  };
}

// ====================================================
// 11. BUILD TAX HISTORY
// ====================================================
function buildTaxHistory(records, latest, details, allPaid) {
  const now = new Date();
  
  return records
    .filter(r => allPaid ? r.year === latest.year : !r.is_paid)
    .map(r => {
      const { dueDate, delqDate } = calculateTaxDates(r.year);
      const isLatest = r.year === latest.year;
      const year = parseInt(r.year, 10);
      
      let status = "Unknown";
      if (r.is_paid) {
        status = "Paid";
      } else if (!isNaN(year)) {
        if (isPastDelqDate(now, year)) status = "Delinquent";
        else if (isPastDueDate(now, year)) status = "Due";
        else status = "Due";
      }
      
      return {
        jurisdiction: "County",
        year: r.year,
        status,
        payment_type: "Annual",
        base_amount: formatCurrency(r.base_amount),
        county_tax: isLatest ? details.taxes_due : "N/A",
        city_tax: "N/A",
        fees: "N/A",
        penalty: "N/A",
        cost: "N/A",
        amount_paid: formatCurrency(r.amount_paid),
        amount_due: formatCurrency(r.balance_due),
        paid_date: r.is_paid ? r.date_paid : " ",
        due_date: dueDate,
        delq_date: delqDate,
        land_value: isLatest ? details.fair_market_value : "N/A",
        improvements: "N/A",
        total_assessed_value: isLatest ? details.taxable_market_value : "N/A",
        exemptions_breakdown: {
          residential_exemption: "N/A",
          homestead_exemption: isLatest ? details.homestead_code : "N/A",
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
    taxing_authority: GREENVILLE_CONFIG.authority,
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
    land_value: details.fair_market_value,
    improvements: "N/A",
    total_assessed_value: details.taxable_market_value,
    exemption: "N/A",
    total_taxable_value: details.taxable_market_value,
    taxing_authority: GREENVILLE_CONFIG.authority,
    notes,
    delinquent,
    tax_history: history,
    property_details: {
      acreage: details.acreage,
      description: details.description,
      subdivision: details.subdivision,
      deed_book_page: details.deed_book_page,
      deed_date: details.deed_date,
      homestead_code: details.homestead_code,
      assessment_class: details.assessment_class,
      land_use: details.land_use
    }
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
    
    // Determine which record to open for details
    const { allPaid, latestRecordToOpen, delinquent, notes } = determineDelinquency(records);
    if (!latestRecordToOpen) {
      return handleNotFound(mapNumber, "No valid tax record found.");
    }
    
    // Fetch detail page data
    const browser = page.browser();
    const details = await fetchRecordDetails(browser, latestRecordToOpen);
    if (!details) {
      return handleNotFound(mapNumber, "Failed to load property details.");
    }
    
    // Build tax history
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
      try {
        await browserContext.close();
      } catch (e) {
        log("warn", "Failed to close browser context", { error: e.message });
      }
    }
  }
};

module.exports = { search };