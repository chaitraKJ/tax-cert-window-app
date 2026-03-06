// Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// ====================================================
// 1. COUNTY CONFIGURATION – ADD NEW COUNTIES HERE
// ====================================================
const COUNTY_CONFIG = {
  abbeville: {
    url: "https://abbevilletreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Abbeville County Treasurer, Abbeville, SC"
  },
  allendale: {
    url: "https://allendaletreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Allendale County Treasurer, Allendale, SC"
  },
  bamberg: {
    url: "https://bambergcountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Bamberg County Treasurer, Bamberg, SC"
  },
  barnwell: {
    url: "https://barnwelltreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Barnwell County Treasurer, Barnwell, SC"
  },
  calhoun: {
    url: "https://calhountreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Calhoun County Treasurer, St. Matthews, SC"
  },
  cherokee: {
    url: "https://cherokeecountysctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Cherokee County Treasurer, Gaffney, SC"
  },
  chesterfield: {
    url: "https://chesterfieldcountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Chesterfield County Treasurer, Chesterfield, SC"
  },
  clarendon: {
    url: "https://clarendoncountysctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Clarendon County Treasurer, Manning, SC"
  },
  colleton: {
    url: "https://colleton.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Colleton County Treasurer, Walterboro, SC"
  },
  darlington: {
    url: "https://darlingtontreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Darlington County Treasurer, Darlington, SC"
  },
  dillon: {
    url: "https://dilloncountysctaxes.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Dillon County Treasurer, Dillon, SC"
  },
  edgefield: {
    url: "https://edgefieldcountysc.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Edgefield County Treasurer, Edgefield, SC"
  },
  horry: {
    url: "https://horrycountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Horry County Treasurer, Conway, SC"
  },
  kershaw: {
    url: "https://kershawcounty.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Kershaw County Treasurer, Camden, SC"
  },
  lancaster: {
    url: "https://lancastersctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Lancaster County Treasurer, Lancaster, SC"
  },
  laurens: {
    url: "https://laurenstreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Laurens County Treasurer, Laurens, SC"
  },
  lee: {
    url: "https://leetreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Lee County Treasurer, Bishopville, SC"
  },
  lexington: {
    url: "https://lexingtoncountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Lexington County Treasurer, Lexington, SC"
  },
  marlboro: {
    url: "https://marlborocountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Marlboro County Treasurer, Bennettsville, SC"
  },
  mccormick: {
    url: "https://mccormicktreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "McCormick County Treasurer, McCormick, SC"
  },
  newberry: {
    url: "https://newberrytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Newberry County Treasurer, Newberry, SC"
  },
  oconee: {
    url: "https://oconeesctax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Oconee County Treasurer, Walhalla, SC"
  },
  orangeburg: {
    url: "https://orangeburgtreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Orangeburg County Tax Office, Orangeburg, SC"
  },
  saluda: {
    url: "https://saludacountytreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Saluda County Treasurer, Saluda, SC"
  },
  sumter: {
    url: "https://sumtercounty.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Sumter County Treasurer, Sumter, SC"
  },
  union: {
    url: "https://uniontreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Union County Treasurer, Union, SC"
  },
  williamsburg: {
    url: "https://williamsburgtreasurer.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Williamsburg County Treasurer, Kingstree, SC"
  },
  spartanburg: {
    url: "https://spartanburgcountytax.qpaybill.com/Taxes/TaxesDefaultType4.aspx",
    authority: "Spartanburg County Treasurer, Spartanburg, SC"
  }
};

// ====================================================
// 2. SHARED CONSTANTS
// ====================================================
// Maximum number of retry attempts for transient failures
const MAX_RETRIES = 3;

// Timeout configurations (in milliseconds)
const SEARCH_TIMEOUT = 90000;           // Initial page load timeout
const SELECTOR_TIMEOUT = 30000;         // Wait for specific DOM elements
const NAVIGATION_TIMEOUT = 30000;       // Page navigation timeout
const DETAIL_PAGE_TIMEOUT = 60000;      // Detail page load timeout

// Selector to wait for after search submission (either error or results)
const RETRY_WAIT_SELECTOR = "#ctl00_MainContent_lblError, #ctl00_MainContent_gvSearchResults";

// Standard note displayed on all tax records
const ANNUAL_NOTE = "NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/15";

// Validation limits
const MAX_PARCEL_LENGTH = 50;           // Maximum parcel number length
const MIN_EXPECTED_COLUMNS = 10;        // Minimum columns expected in results table

// ====================================================
// 3. CSS SELECTORS
// ====================================================
/**
 * DOM selectors for the QPayBill search form and results.
 * These target specific ASP.NET control IDs used by the platform.
 */
const SELECTORS = {
  REAL_ESTATE_RADIO: "#ctl00_MainContent_radRealEstateButton",  // Radio button to select "Real Estate" search type
  CRITERIA_DROPDOWN: "#ctl00_MainContent_ddlCriteriaList",      // Dropdown to select search criteria (Map, Owner, etc.)
  CRITERIA_INPUT: "#ctl00_MainContent_txtCriteriaBox",          // Input field for search value
  SEARCH_BUTTON: "#ctl00_MainContent_btnSearch",                // Search submit button
  ERROR_LABEL: "#ctl00_MainContent_lblError",                   // Error message display element
  RESULTS_TABLE: "#ctl00_MainContent_gvSearchResults",          // Results table
  DETAIL_OVERVIEW: "#overview"                                   // Detail page identifier
};

/**
 * Fallback column indexes if auto-detection fails.
 * These are zero-based indexes of columns in the results table.
 */
const COLUMN_INDEX = {
  NOTICE_NO: 0,      // Tax notice/bill number
  YEAR: 2,           // Tax year
  STATUS: 6,         // Payment status (Paid, Unpaid, Tax Sale, etc.)
  PAYMENT_DATE: 7,   // Date payment was made (if paid)
  AMOUNT: 8,         // Total tax amount
  VIEW_LINK: 9       // Link to detail page
};

// ====================================================
// 4. STRUCTURED LOGGER
// ====================================================
/**
 * Structured logging function that outputs JSON format logs.
 * Useful for log aggregation and analysis tools.
 * 
 * @param {string} level - Log level (info, warn, error, etc.)
 * @param {string} message - Human-readable message
 * @param {Object} meta - Additional metadata to include in log
 */
function log(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...meta
  };
  const logFn = console[level] || console.log;
  logFn(JSON.stringify(entry));
}

// ====================================================
// 5. CUSTOM ERROR CLASSES
// ====================================================
/**
 * Base error class for search-related errors.
 * Includes a code for categorization and retryable flag.
 */
class SearchError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = "SearchError";
    this.code = code;
    this.retryable = retryable;  // Whether this error should trigger a retry
  }
}

/**
 * Thrown when search returns too many results.
 * User needs to provide a more specific parcel number.
 */
class TooManyHitsError extends SearchError {
  constructor() { super("Too many search results", "TOO_MANY_HITS", false); }
}

/**
 * Thrown when no records are found for the given parcel number.
 */
class NoResultsError extends SearchError {
  constructor() { super("No records found", "NO_RESULTS", false); }
}

/**
 * Thrown when detail page fails to load.
 * This is retryable as it may be a transient network issue.
 */
class DetailLoadError extends SearchError {
  constructor(notice) {
    super(`Failed to load detail page for notice ${notice}`, "DETAIL_LOAD", true);
  }
}

/**
 * Thrown when website structure doesn't match expected format.
 * Not retryable as structure issues require code changes.
 */
class StructureError extends SearchError {
  constructor(message) { super(message, "STRUCTURE_ERROR", false); }
}

/**
 * Thrown when input validation fails.
 */
class ValidationError extends SearchError {
  constructor(message) { super(message, "VALIDATION_ERROR", false); }
}

// ====================================================
// 6. UTILITY HELPERS
// ====================================================
/**
 * Formats a string as US currency.
 * Handles various input formats and returns consistent output.
 * 
 * @param {string} str - String containing a number
 * @returns {string} Formatted currency string (e.g., "$1,234.56")
 */
function formatCurrency(str) {
  if (!str) return "$0.00";
  // Remove all non-numeric characters except decimal and minus
  const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Normalizes date strings to MM/DD/YYYY format.
 * Handles both 2-digit and 4-digit year formats.
 * 
 * @param {string} dateStr - Date string to normalize
 * @returns {string} Normalized date string
 */
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return dateStr;
  const trimmed = dateStr.trim();

  // Check if already in full format (MM/DD/YYYY)
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullMatch) return trimmed;

  // Convert 2-digit year to 4-digit year
  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortMatch) {
    const [, m, d, y] = shortMatch;
    // Years 00-50 are 2000-2050, 51-99 are 1951-1999
    const fullYear = parseInt(y, 10) <= 50 ? 2000 + parseInt(y, 10) : 1900 + parseInt(y, 10);
    return `${m}/${d}/${fullYear}`;
  }

  return trimmed;
}

/**
 * Sanitizes parcel number input by removing potentially harmful characters.
 * Only allows alphanumeric, hyphens, dots, and spaces.
 * 
 * @param {string} input - Raw parcel number input
 * @returns {string} Sanitized parcel number
 * @throws {ValidationError} If input is invalid
 */
function sanitizeParcelNumber(input) {
  if (!input || typeof input !== "string") {
    throw new ValidationError("Parcel number must be a non-empty string");
  }
  // Remove any character that's not: word char, hyphen, dot, or space
  return input.trim().replace(/[^\w\-\. ]/g, "");
}

/**
 * Formats a Date object to MM/DD/YYYY string.
 * 
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${date.getFullYear()}`;
}

/**
 * Calculates tax due date and delinquency date for a given tax year.
 * In South Carolina, taxes are due January 15th of the following year,
 * and become delinquent January 16th.
 * 
 * @param {string} taxYear - Tax year (e.g., "2023")
 * @returns {Object} Object with dueDate and delqDate strings
 */
function calculateTaxDates(taxYear) {
  const year = parseInt(taxYear, 10);
  if (isNaN(year) || year < 1900 || year > 2100) {
    log("warn", "Invalid tax year provided", { taxYear });
    return { dueDate: "N/A", delqDate: "N/A" };
  }

  // Due date is January 15th of the following year
  const due = new Date(year + 1, 0, 15);
  // Delinquent date is one day after due date
  const delq = new Date(due);
  delq.setDate(delq.getDate() + 1);

  return { dueDate: formatDate(due), delqDate: formatDate(delq) };
}

/**
 * Checks if current date is past the due date for a given tax year.
 * 
 * @param {Date} now - Current date
 * @param {number} year - Tax year
 * @returns {boolean} True if past due date
 */
function isPastDueDate(now, year) {
  return now > new Date(year + 1, 0, 15);
}

/**
 * Checks if current date is past the delinquency date for a given tax year.
 * 
 * @param {Date} now - Current date
 * @param {number} year - Tax year
 * @returns {boolean} True if past delinquency date
 */
function isPastDelqDate(now, year) {
  return now > new Date(year + 1, 0, 16);
}

/**
 * Determines the current status of a tax record based on payment status and dates.
 * 
 * @param {Object} record - Tax record with year, is_paid, and is_tax_on_sale flags
 * @param {Date} now - Current date for comparison
 * @returns {string} Status: "Paid", "Delinquent", "Due", or "Unknown"
 */
function determineTaxStatus(record, now) {
  // Tax sale properties are always marked delinquent
  if (record.is_tax_on_sale) return "Delinquent";
  // Paid records show as paid regardless of date
  if (record.is_paid) return "Paid";

  const year = parseInt(record.year, 10);
  if (isNaN(year)) return "Unknown";

  // Check if past delinquency date, then due date
  if (isPastDelqDate(now, year)) return "Delinquent";
  if (isPastDueDate(now, year)) return "Due";
  return "Due";
}

/**
 * Checks if any unpaid records are delinquent.
 * 
 * @param {Array} unpaid - Array of unpaid tax records
 * @param {Date} now - Current date
 * @returns {boolean} True if any record is delinquent
 */
function hasDelinquentRecords(unpaid, now) {
  return unpaid.some(r => {
    const y = parseInt(r.year, 10);
    return !isNaN(y) && (isPastDelqDate(now, y) || r.is_tax_on_sale);
  });
}

// ====================================================
// 12. DELINQUENCY & TAX HISTORY LOGIC (FIXED)
// ====================================================
/**
 * Gets the status of the latest tax year.
 * 
 * @param {Date} now - Current date
 * @param {number} year - Tax year
 * @param {Object} record - Tax record object
 * @returns {string} Status: "PAID", "DELINQUENT", or "DUE"
 */
function getLatestYearStatus(now, year, record) {
  if (record?.is_tax_on_sale) return "DELINQUENT";
  if (record?.is_paid) return "PAID";
  if (isPastDelqDate(now, year)) return "DELINQUENT";
  if (isPastDueDate(now, year)) return "DUE";
  return "DUE";
}

/**
 * Builds descriptive notes about tax payment status.
 * Describes prior years status and current year status.
 * 
 * @param {Array} unpaidYears - Sorted array of unpaid years (newest first)
 * @param {Date} now - Current date
 * @param {Array} records - All tax records
 * @returns {string} Formatted notes string
 */
function buildTaxNotes(unpaidYears, now, records) {
  // If no unpaid years, all taxes are paid
  if (unpaidYears.length === 0) {
    return `ALL TAXES PAID, ${ANNUAL_NOTE}`;
  }

  // Get status of the most recent unpaid year
  const latestYear = unpaidYears[0];
  const latestRecord = records.find(r => parseInt(r.year, 10) === latestYear);
  const status = getLatestYearStatus(now, latestYear, latestRecord);

  // Determine prior years status
  const priorText = unpaidYears.length > 1
    ? "PRIORS ARE DELINQUENT"  // Multiple unpaid years means priors are delinquent
    : "ALL PRIORS ARE PAID";    // Only current year unpaid

  return `${priorText}, ${latestYear} TAXES ARE ${status}, ${ANNUAL_NOTE}`;
}

/**
 * Separates records into unpaid and paid arrays.
 * 
 * @param {Array} records - All tax records
 * @returns {Object} Object with unpaid and paid arrays
 */
function getUnpaidAndPaidRecords(records) {
  return {
    unpaid: records.filter(r => !r.is_paid),
    paid: records.filter(r => r.is_paid)
  };
}

/**
 * Extracts and sorts unpaid years from records (newest first).
 * 
 * @param {Array} unpaid - Unpaid records array
 * @returns {Array} Sorted array of year numbers
 */
function getUnpaidYearsSorted(unpaid) {
  return unpaid
    .map(r => parseInt(r.year, 10))
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);  // Descending order
}

/**
 * Finds a record by year.
 * 
 * @param {Array} records - Array of tax records
 * @param {number} year - Year to find
 * @returns {Object|undefined} Matching record or undefined
 */
function findLatestRecordByYear(records, year) {
  return records.find(r => parseInt(r.year, 10) === year);
}

/**
 * Creates delinquency object when all taxes are paid.
 * 
 * @param {Object} latest - Most recent tax record
 * @returns {Object} Delinquency information object
 */
function createAllPaidDelinquency(latest) {
  const now = new Date();
  const latestYear = parseInt(latest.year, 10);
  const status = getLatestYearStatus(now, latestYear, latest);
  return {
    allPaid: true,
    latestRecordToOpen: latest,
    delinquent: "NONE",
    notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${status}, ${ANNUAL_NOTE}`
  };
}

/**
 * Creates delinquency object when there are unpaid taxes.
 * 
 * @param {Array} unpaid - Unpaid records
 * @param {Array} years - Sorted unpaid years
 * @param {Date} now - Current date
 * @param {Array} records - All records
 * @returns {Object} Delinquency information object
 */
function createUnpaidDelinquency(unpaid, years, now, records) {
  const latest = findLatestRecordByYear(unpaid, years[0]);
  const delq = hasDelinquentRecords(unpaid, now);
  const notes = buildTaxNotes(years, now, records);
  return {
    allPaid: false,
    latestRecordToOpen: latest,
    delinquent: delq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    notes
  };
}

/**
 * Main function to determine delinquency status and which record to display.
 * Analyzes all tax records to determine payment status and latest relevant record.
 * 
 * @param {Array} records - All tax records
 * @returns {Object} Delinquency information with latest record to show
 */
function determineDelinquency(records) {
  const now = new Date();
  const { unpaid, paid } = getUnpaidAndPaidRecords(records);
  const unpaidYears = getUnpaidYearsSorted(unpaid);

  // If all taxes paid, show the most recent paid record
  if (unpaid.length === 0) {
    return createAllPaidDelinquency(paid[paid.length - 1]);
  }

  // Otherwise, show the most recent unpaid record
  return createUnpaidDelinquency(unpaid, unpaidYears, now, records);
}

/**
 * Creates an empty exemptions breakdown object with N/A values.
 * Used when detail data is unavailable.
 * 
 * @returns {Object} Exemptions breakdown with N/A values
 */
function createEmptyExemptionsBreakdown() {
  return {
    residential_exemption: "N/A",
    homestead_exemption: "N/A",
    other_exemptions: "N/A",
    local_option_credit: "N/A"
  };
}

/**
 * Builds a single tax history entry with all relevant details.
 * 
 * @param {Object} record - Tax record from search results
 * @param {Object} details - Detailed property/tax information
 * @param {boolean} isLatest - Whether this is the latest/primary record
 * @returns {Object} Complete tax history entry
 */
function buildTaxHistoryEntry(record, details, isLatest) {
  const { dueDate, delqDate } = calculateTaxDates(record.year);
  const base = formatCurrency(record.amount);
  const status = determineTaxStatus(record, new Date());

  return {
    jurisdiction: "County",
    year: record.year,
    status,
    payment_type: "Annual",
    base_amount: base,
    // Only include detailed breakdowns for the latest record
    county_tax: isLatest ? details.county_tax : "N/A",
    city_tax: isLatest ? details.city_tax : "N/A",
    fees: isLatest ? details.fees : "N/A",
    penalty: "N/A",
    cost: "N/A",
    amount_paid: record.is_paid ? base : "$0.00",
    amount_due: record.is_paid ? "$0.00" : base,
    paid_date: record.is_paid ? record.payment_date : " ",
    due_date: dueDate,
    delq_date: delqDate,
    // Property values only shown for latest record
    land_value: isLatest ? details.land_value : "N/A",
    improvements: isLatest ? details.improvements : "N/A",
    total_assessed_value: isLatest ? details.total_assessed_value : "N/A",
    exemptions_breakdown: isLatest ? details.exemptions_breakdown : createEmptyExemptionsBreakdown()
  };
}

/**
 * Determines if a record should be included in tax history.
 * If all paid: only show latest record
 * If unpaid exists: show all unpaid records
 * 
 * @param {Object} record - Record to check
 * @param {Object} latest - Latest record being displayed
 * @param {boolean} allPaid - Whether all taxes are paid
 * @returns {boolean} True if record should be in history
 */
function shouldIncludeInHistory(record, latest, allPaid) {
  return allPaid ? record.notice_no === latest.notice_no : !record.is_paid;
}

/**
 * Builds complete tax history array from records.
 * Filters and formats records based on payment status.
 * 
 * @param {Array} records - All tax records
 * @param {Object} latest - Latest record to display
 * @param {Object} details - Detailed tax/property info
 * @param {boolean} allPaid - Whether all taxes are paid
 * @returns {Array} Array of tax history entries
 */
function buildTaxHistory(records, latest, details, allPaid) {
  return records
    .filter(r => shouldIncludeInHistory(r, latest, allPaid))
    .map(r => buildTaxHistoryEntry(r, details, r.notice_no === latest.notice_no));
}

/**
 * Sorts records by year in ascending order (oldest first).
 * Modifies array in place.
 * 
 * @param {Array} records - Array of tax records
 */
function sortRecordsByYear(records) {
  records.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));
}

// ====================================================
// 7. RETRY WRAPPER
// ====================================================
/**
 * Generic retry wrapper for functions that may fail transiently.
 * Will retry up to maxAttempts times for retryable errors.
 * 
 * @param {Function} fn - Function to execute
 * @param {Object} context - Context to bind function to (this)
 * @param {Array} args - Arguments to pass to function
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise} Result of successful function execution
 * @throws {Error} Final error if all attempts fail
 */
async function withRetry(fn, context = null, args = [], maxAttempts = MAX_RETRIES) {
  let lastError;

  for (let i = 0; i <= maxAttempts; i++) {
    try {
      return await fn.apply(context, args);
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (error instanceof SearchError && !error.retryable) {
        log("error", "Non-retryable error encountered", {
          code: error.code,
          message: error.message
        });
        throw error;
      }

      log("warn", "Retry attempt failed", {
        attempt: i + 1,
        maxAttempts: maxAttempts + 1,
        error: error.message,
        willRetry: i < maxAttempts
      });

      // Wait briefly between retries to let page stabilize
      if (i < maxAttempts && args[0]?.waitForSelector) {
        try {
          await args[0].waitForSelector('body', {
            state: 'attached',
            timeout: 1000 * (i + 1)  // Increasing backoff
          });
        } catch { /* ignore */ }
      }
    }
  }

  log("error", "All retry attempts exhausted", {
    maxAttempts: maxAttempts + 1,
    finalError: lastError.message
  });
  throw lastError;
}

// ====================================================
// 8. INPUT VALIDATION
// ====================================================
/**
 * Validates the incoming request body for required fields and format.
 * 
 * @param {Object} body - Request body to validate
 * @returns {string|null} Error message if validation fails, null if valid
 */
function validateRequest(body) {
  // Check if body exists
  if (!body) return "Request body is required";

  const { fetch_type, account } = body;

  // Validate fetch_type
  if (!fetch_type || !["html", "api"].includes(fetch_type)) {
    return "Invalid fetch_type. Use 'html' or 'api'.";
  }

  // Validate account (parcel number) exists
  if (!account) return "Parcel number (account) is required";
  if (typeof account !== "string") return "Parcel number must be a string";
  if (account.trim().length === 0) return "Parcel number cannot be empty or whitespace only";

  // Validate parcel number format
  try {
    const sanitized = sanitizeParcelNumber(account);
    if (sanitized.length === 0) return "Parcel number contains no valid characters";
    if (sanitized.length > MAX_PARCEL_LENGTH) {
      return `Parcel number too long (max ${MAX_PARCEL_LENGTH} characters)`;
    }
  } catch (e) {
    return e.message;
  }

  return null;  // Validation passed
}

// ====================================================
// 9. NAVIGATION-SAFE DOM HELPERS
// ====================================================
/**
 * Safely selects a dropdown option and waits for navigation.
 * Some dropdowns trigger page reloads on change.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - CSS selector for dropdown
 * @param {string} value - Value to select
 * @throws {Error} If navigation fails
 */
async function safeSelect(page, selector, value) {
  const [resp] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT }),
    page.select(selector, value)
  ]);
  if (!resp?.ok()) throw new Error("Navigation failed after select");
}

/**
 * Selects the "Real Estate" radio button and waits for page update.
 * This is the first step in the search form workflow.
 * 
 * @param {Page} page - Puppeteer page object
 * @throws {StructureError} If radio button not found or navigation fails
 */
async function selectRealEstateRadio(page) {
  try {
    // Wait for radio button to be visible
    await page.waitForSelector(SELECTORS.REAL_ESTATE_RADIO, {
      timeout: SELECTOR_TIMEOUT,
      state: 'visible'
    });

    // Click and wait for navigation (page reloads to show Real Estate form)
    const [resp] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT }),
      page.click(SELECTORS.REAL_ESTATE_RADIO)
    ]);

    if (!resp?.ok()) throw new Error("Radio navigation failed");
  } catch (e) {
    log("error", "Failed to select Real Estate radio", { error: e.message });
    throw new StructureError("Cannot find Real Estate radio button");
  }
}

/**
 * Waits for the criteria dropdown to be populated with options.
 * The dropdown is dynamically populated after selecting Real Estate.
 * 
 * @param {Page} page - Puppeteer page object
 * @throws {StructureError} If dropdown not ready or missing Map option
 */
async function waitForDropdownReady(page) {
  try {
    // Wait for "Map" option to appear in dropdown
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return el && Array.from(el.options).some(o =>
          o.value === "Map" || o.textContent?.trim() === "Map"
        );
      },
      { timeout: SELECTOR_TIMEOUT },
      SELECTORS.CRITERIA_DROPDOWN
    );
  } catch (e) {
    log("error", "Dropdown not ready", { error: e.message });
    throw new StructureError("Search criteria dropdown not found or missing Map option");
  }
}

/**
 * Selects "Map" from the criteria dropdown.
 * This sets the search type to search by map/parcel number.
 * 
 * @param {Page} page - Puppeteer page object
 * @throws {StructureError} If selection fails
 */
async function selectMapCriteria(page) {
  try {
    await safeSelect(page, SELECTORS.CRITERIA_DROPDOWN, "Map");
  } catch (e) {
    log("error", "Failed to select Map criteria", { error: e.message });
    throw new StructureError("Cannot select Map from dropdown");
  }
}

/**
 * Clears and types parcel number into the search input field.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {string} parcelNumber - Parcel number to enter
 * @throws {StructureError} If input field not found
 */
async function clearAndTypeParcelNumber(page, parcelNumber) {
  try {
    // Wait for input field to be available
    await page.waitForSelector(SELECTORS.CRITERIA_INPUT, {
      state: "attached",
      timeout: SELECTOR_TIMEOUT
    });

    // Clear any existing value
    await page.evaluate((s) => {
      const i = document.querySelector(s);
      if (i) i.value = "";
    }, SELECTORS.CRITERIA_INPUT);

    // Type the parcel number
    await page.type(SELECTORS.CRITERIA_INPUT, parcelNumber);
  } catch (e) {
    log("error", "Failed to enter parcel number", {
      error: e.message,
      parcelNumber
    });
    throw new StructureError("Cannot find or fill parcel number input");
  }
}

/**
 * Fills the entire search form with the given parcel number.
 * This is the complete workflow: navigate, select type, select criteria, enter value.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {string} parcelNumber - Parcel number to search
 * @param {string} searchUrl - County search URL
 * @throws {Error} If any step of the workflow fails
 */
async function fillSearchForm(page, parcelNumber, searchUrl) {
  try {
    // Step 1: Navigate to search page
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: SEARCH_TIMEOUT
    });

    // Step 2: Select "Real Estate" search type
    await selectRealEstateRadio(page);

    // Step 3: Wait for dropdown to populate
    await waitForDropdownReady(page);

    // Step 4: Select "Map" criteria
    await selectMapCriteria(page);

    // Step 5: Enter parcel number
    await clearAndTypeParcelNumber(page, parcelNumber);
  } catch (error) {
    log("error", "Failed to fill search form", {
      error: error.message,
      parcelNumber,
      url: searchUrl
    });
    throw error;
  }
}

// ====================================================
// 10. SEARCH RESULT HELPERS
// ====================================================
/**
 * Attempts to auto-detect column positions in the results table.
 * Header text may vary slightly between counties, so we search for keywords.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Object|null} Column index map or null if detection failed
 */
async function detectColumnIndexes(page) {
  try {
    const indexes = await page.evaluate(() => {
      const row = document.querySelector("#ctl00_MainContent_gvSearchResults tr");
      if (!row) return null;

      // Extract header text and normalize
      const headers = Array.from(row.querySelectorAll("th"))
        .map(h => h.innerText?.trim().toLowerCase() || "");

      // Find columns by keyword matching
      return {
        NOTICE_NO: headers.findIndex(h => h.includes("notice") || h.includes("bill")),
        YEAR: headers.findIndex(h => h.includes("year") || h.includes("tax year")),
        STATUS: headers.findIndex(h => h.includes("status")),
        PAYMENT_DATE: headers.findIndex(h => h.includes("payment") && h.includes("date")),
        AMOUNT: headers.findIndex(h => h.includes("amount") || h.includes("total")),
        VIEW_LINK: headers.findIndex(h => h.includes("view") || h.includes("detail")),
        detectedHeaders: headers  // For debugging
      };
    });

    // Validate detection - NOTICE_NO is required
    if (indexes && indexes.NOTICE_NO >= 0) return indexes;

    log("warn", "Could not auto-detect columns, using defaults", { detected: indexes });
    return null;
  } catch (e) {
    log("warn", "Column detection failed, using defaults", { error: e.message });
    return null;
  }
}

/**
 * Extracts error text from the error label if present.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<string>} Error text or empty string
 */
async function getErrorText(page) {
  try {
    return await page.$eval(SELECTORS.ERROR_LABEL, el =>
      el?.innerText?.trim().toLowerCase() ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Checks error text for known error conditions and throws appropriate errors.
 * 
 * @param {string} errorText - Error text from page
 * @throws {TooManyHitsError} If too many results
 * @throws {SearchError} For other search errors
 */
function checkSearchErrors(errorText) {
  if (!errorText) return;

  // Check for "too many hits" error
  if (errorText.includes("too many hits") || errorText.includes("more specific")) {
    throw new TooManyHitsError();
  }

  // Generic search error
  log("warn", "Search returned error", { errorText });
  throw new SearchError(errorText, "SEARCH_ERROR", true);
}

/**
 * Waits for search results or error message to appear.
 * 
 * @param {Page} page - Puppeteer page object
 * @throws {SearchError} If timeout or error detected
 */
async function waitForSearchResult(page) {
  try {
    // Wait for either error label or results table
    await page.waitForSelector(RETRY_WAIT_SELECTOR, { timeout: SELECTOR_TIMEOUT });

    // Check if an error was displayed
    const errorText = await getErrorText(page);
    checkSearchErrors(errorText);
  } catch (e) {
    if (e instanceof SearchError) throw e;

    log("error", "Failed waiting for search results", { error: e.message });
    throw new SearchError("Timeout waiting for search results", "TIMEOUT", true);
  }
}

/**
 * Determines if a record is considered "paid" based on status and payment date.
 * Tax sale records are never considered paid.
 * 
 * @param {string} status - Status text from results table
 * @param {string} paymentDate - Payment date text
 * @returns {boolean} True if record is paid
 */
function isRecordPaid(status, paymentDate) {
  const s = status.toLowerCase();

  // Tax sale records are never "paid" in the traditional sense
  const isSale = s.includes("tax sale") || s.includes("sale");
  if (isSale) return false;

  // Must have "paid" status AND valid payment date
  const paidStatus = s.includes("paid");
  const validDate = paymentDate && !["", "-", "n/a"].includes(paymentDate.toLowerCase());

  return paidStatus && validDate;
}

/**
 * Parses the search results table and extracts tax record data.
 * Runs in browser context for performance.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Array>} Array of tax record objects
 * @throws {StructureError} If table parsing fails
 */
async function parseSearchResults(page) {
  try {
    const records = await page.evaluate((minCols, colIdx) => {
      // Find all data rows (alternating row classes)
      const rows = document.querySelectorAll(
        "#ctl00_MainContent_gvSearchResults tr.gvrow, tr.gvaltrow"
      );
      const results = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll("td");

        // Skip rows with too few columns
        if (cells.length < minCols) return;

        // Extract cell data
        const status = cells[colIdx.STATUS]?.innerText?.trim() || "";
        const payDate = cells[colIdx.PAYMENT_DATE]?.innerText?.trim() || "";
        const s = status.toLowerCase();

        // Determine if tax sale
        const isSale = s.includes("tax sale") || s.includes("sale");

        // Determine if paid (must have paid status + valid date, not a sale)
        const isPaid = !isSale &&
          s.includes("paid") &&
          payDate &&
          !["-", "n/a", ""].includes(payDate.toLowerCase());

        // Skip invalid rows (no status)
        if (!status || status === "-" || status === "") return;

        // Extract detail link
        const link = cells[colIdx.VIEW_LINK]?.querySelector("a")?.href || null;

        results.push({
          notice_no: cells[colIdx.NOTICE_NO]?.innerText?.trim() || "",
          year: cells[colIdx.YEAR]?.innerText?.trim() || "",
          amount: cells[colIdx.AMOUNT]?.innerText?.trim() || "",
          status,
          payment_date: payDate,
          view_link: link,
          is_paid: isPaid,
          is_tax_on_sale: isSale
        });
      });

      return results;
    }, MIN_EXPECTED_COLUMNS, COLUMN_INDEX);

    return records;
  } catch (e) {
    log("error", "Failed to parse search results", { error: e.message });
    throw new StructureError("Failed to parse search results table");
  }
}

/**
 * Normalizes payment dates in all records to consistent format.
 * Modifies the records array in place.
 * 
 * @param {Array} records - Array of tax records
 */
function normalizeRecordDates(records) {
  records.forEach(r => {
    if (r.payment_date) r.payment_date = normalizeDate(r.payment_date);
  });
}

/**
 * Performs the complete search workflow: fill form, submit, wait, parse.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {string} parcelNumber - Parcel number to search
 * @param {string} searchUrl - County search URL
 * @returns {Promise<Array>} Array of parsed tax records
 * @throws {SearchError} If search fails
 */
async function performSearch(page, parcelNumber, searchUrl) {
  try {
    // Fill the search form
    await fillSearchForm(page, parcelNumber, searchUrl);

    // Submit and wait for navigation
    await Promise.all([
      page.click(SELECTORS.SEARCH_BUTTON),
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT
      })
    ]);

    // Wait for results or error
    await waitForSearchResult(page);

    // Parse and return results
    return await parseSearchResults(page);
  } catch (e) {
    if (e instanceof SearchError) throw e;

    log("error", "Search navigation failed", {
      error: e.message,
      parcelNumber
    });
    throw new SearchError("Navigation failed during search", "NAV_ERROR", true);
  }
}

/**
 * Searches for parcel records with retry logic.
 * Main entry point for search functionality.
 * 
 * @param {Page} page - Puppeteer page object
 * @param {string} parcelNumber - Parcel number to search
 * @param {string} searchUrl - County search URL
 * @returns {Promise<Object>} Object with records array
 * @throws {NoResultsError} If no records found
 */
async function searchParcel(page, parcelNumber, searchUrl) {
  return withRetry(async () => {
    const records = await performSearch(page, parcelNumber, searchUrl);

    // Validate results
    if (!records || records.length === 0) throw new NoResultsError();

    // Normalize dates for consistency
    normalizeRecordDates(records);

    return { records };
  }, null, [page, parcelNumber, searchUrl]);
}

// ====================================================
// 11. DETAIL PAGE HELPERS
// ====================================================
/**
 * Sets up request interception to block unnecessary resources.
 * Improves page load performance by blocking images, fonts, CSS.
 * 
 * @param {Page} page - Puppeteer page object
 */
async function setupPageInterception(page) {
  try {
    await page.setRequestInterception(true);
    page.on("request", req => {
      const type = req.resourceType();
      // Block resources we don't need for scraping
      if (["stylesheet", "font", "image", "media"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  } catch (e) {
    log("warn", "Failed to setup request interception", { error: e.message });
  }
}

/**
 * Extracts all property and tax data from the detail page.
 * Runs in browser context to access DOM directly.
 * 
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Object|null>} Property data object or null if extraction fails
 */
async function extractPropertyData(page) {
  try {
    const data = await page.evaluate(() => {
      // Helper to get element text by ID
      const get = id => document.getElementById(id)?.innerText?.trim() || "N/A";

      // Helper to format currency consistently
      const fmt = str => {
        if (!str) return "$0.00";
        const n = parseFloat(str.replace(/[^0-9.-]+/g, ""));
        return isNaN(n) ? "$0.00" : `${n.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      };

      // Extract raw values
      const land = get("ctl00_MainContent_lblLand4");
      const bldg = get("ctl00_MainContent_lblBuilding4");
      const assd = get("ctl00_MainContent_lblAssmt");
      const res = get("ctl00_MainContent_lblResidential");
      const hm = get("ctl00_MainContent_lblHomestead");
      const oth = get("ctl00_MainContent_lblOther");
      const loc = get("ctl00_MainContent_lblLocalOpts");

      // Calculate total exemptions
      const exemps = [res, hm, oth, loc].reduce((s, v) =>
        s + (parseFloat(v.replace(/[^0-9.-]+/g, "")) || 0), 0
      );

      // Calculate taxable value (assessed - exemptions)
      const taxable = Math.max(0,
        (parseFloat(assd.replace(/[^0-9.-]+/g, "")) || 0) - exemps
      );

      // Extract owner name (may be multiple lines)
      const owner = get("ctl00_MainContent_lblName")
        .split("\n")
        .map(n => n.trim())
        .filter(n => n);

      return {
        owner_name: owner.length ? owner : ["N/A"],
        property_address: get("ctl00_MainContent_lblPropAddress"),
        parcel_number: get("ctl00_MainContent_lblMapNo"),
        land_value: fmt(land),
        improvements: fmt(bldg),
        total_assessed_value: fmt(assd),
        exemption: fmt(exemps.toString()),
        total_taxable_value: fmt(taxable.toString()),
        county_tax: fmt(get("ctl00_MainContent_lblCountyTax")),
        city_tax: fmt(get("ctl00_MainContent_lblCityTax")),
        fees: get("ctl00_MainContent_lblFees"),
        exemptions_breakdown: {
          residential_exemption: fmt(res),
          homestead_exemption: fmt(hm),
          other_exemptions: fmt(oth),
          local_option_credit: fmt(loc)
        },
        property_details: {
          record_type: get("ctl00_MainContent_lblRecordType"),
          acres: get("ctl00_MainContent_lblAcres"),
          lots: get("ctl00_MainContent_lblLots"),
          buildings: get("ctl00_MainContent_LabelBuildingNum"),
          description: `${get("ctl00_MainContent_lblDesc")} ${get("ctl00_MainContent_lblDesc2")}`.trim(),
          district_levy: get("ctl00_MainContent_lblDistrict"),
          city_levy: get("ctl00_MainContent_lblCity"),
          total_appraisal: fmt(get("ctl00_MainContent_lblMarketVal"))
        }
      };
    });

    return data;
  } catch (e) {
    log("error", "Failed to extract property data", { error: e.message });
    return null;
  }
}

/**
 * Fetches detailed property information from the record's detail page.
 * Opens a new page, loads the detail URL, extracts data, and closes page.
 * 
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} record - Tax record with view_link property
 * @returns {Promise<Object|null>} Property details or null if failed
 */
async function fetchRecordDetails(browser, record) {
  if (!record.view_link) {
    log("warn", "Record has no view link, skipping detail extraction", {
      noticeNo: record.notice_no
    });
    return null;
  }

  let detailPage = null;
  try {
    // Create new page for detail view
    detailPage = await browser.newPage();
    detailPage.setDefaultNavigationTimeout(DETAIL_PAGE_TIMEOUT);

    // Setup resource blocking for faster load
    await setupPageInterception(detailPage);

    // Navigate to detail page
    await detailPage.goto(record.view_link, {
      waitUntil: "domcontentloaded",
      timeout: DETAIL_PAGE_TIMEOUT
    });

    // Wait for overview section to load
    await detailPage.waitForSelector(SELECTORS.DETAIL_OVERVIEW, {
      timeout: DETAIL_PAGE_TIMEOUT
    });

    // Extract and return data
    return await extractPropertyData(detailPage);
  } catch (e) {
    log("error", "Failed to load detail page", {
      noticeNo: record.notice_no,
      error: e.message,
      url: record.view_link
    });
    return null;
  } finally {
    // Always close the detail page to free resources
    if (detailPage) {
      try {
        await detailPage.close();
      } catch (e) {
        log("warn", "Failed to close detail page", { error: e.message });
      }
    }
  }
}

// ====================================================
// 13. RESPONSE BUILDERS
// ====================================================
/**
 * Creates a standardized "not found" response object.
 * 
 * @param {string} parcel - Parcel number searched
 * @param {string} reason - Reason for not found
 * @param {string} authority - Taxing authority name
 * @returns {Object} Standardized not found response
 */
function handleNotFound(parcel, reason, authority) {
  log("info", "Returning not found response", { parcelNumber: parcel, reason });
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    parcel_number: parcel,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: authority,
    notes: reason,
    delinquent: "N/A",
    tax_history: [],
    property_details: {}
  };
}

/**
 * Builds a successful response with complete property and tax data.
 * 
 * @param {Object} details - Property details object
 * @param {string} notes - Tax status notes
 * @param {string} delinquent - Delinquency status
 * @param {Array} history - Tax history array
 * @param {string} authority - Taxing authority name
 * @returns {Object} Complete success response
 */
function buildSuccessResponse(details, notes, delinquent, history, authority) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: details.owner_name,
    property_address: details.property_address,
    parcel_number: details.parcel_number,
    land_value: details.land_value,
    improvements: details.improvements,
    total_assessed_value: details.total_assessed_value,
    exemption: details.exemption,
    total_taxable_value: details.total_taxable_value,
    taxing_authority: authority,
    notes,
    delinquent,
    tax_history: history,
    property_details: details.property_details
  };
}

/**
 * Sends response to client based on fetch type.
 * Either renders HTML view or sends JSON.
 * 
 * @param {Response} res - Express response object
 * @param {Object} data - Data to send
 * @param {string} fetchType - "html" or "api"
 */
function sendResponse(res, data, fetchType) {
  if (fetchType === "html") {
    res.status(200).render("parcel_data_official", data);
  } else {
    res.status(200).json({ result: data });
  }
}

/**
 * Sends error response to client based on fetch type.
 * 
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 * @param {string} fetchType - "html" or "api"
 * @param {number} status - HTTP status code (default 500)
 */
function sendErrorResponse(res, message, fetchType, status = 500) {
  if (fetchType === "html") {
    res.status(status).render("error_data", { error: true, message });
  } else {
    res.status(status).json({ error: true, message });
  }
  log("error", "Error response sent", { statusCode: status, message, fetchType });
}

// ====================================================
// 14. BROWSER SETUP HELPERS
// ====================================================
/**
 * Sets up resource blocking for a page to improve performance.
 * Blocks stylesheets, fonts, images, scripts, and media.
 * 
 * @param {Page} page - Puppeteer page object
 */
async function setupPageResourceBlocking(page) {
  try {
    await page.setRequestInterception(true);
    page.on("request", req => {
      const t = req.resourceType();
      if (["stylesheet", "font", "image", "script", "media"].includes(t)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  } catch (e) {
    log("warn", "Failed to setup resource blocking", { error: e.message });
  }
}

/**
 * Creates a new browser page with resource blocking enabled.
 * 
 * @param {BrowserContext} context - Puppeteer browser context
 * @returns {Promise<Page>} Configured page object
 * @throws {SearchError} If page creation fails
 */
async function createBrowserPage(context) {
  try {
    const page = await context.newPage();
    await setupPageResourceBlocking(page);
    return page;
  } catch (e) {
    log("error", "Failed to create browser page", { error: e.message });
    throw new SearchError("Failed to create browser page", "BROWSER_ERROR", false);
  }
}

/**
 * Safely closes a browser context and handles any errors.
 * 
 * @param {BrowserContext} context - Browser context to close
 * @param {string} parcel - Parcel number (for logging)
 */
async function closeBrowserContext(context, parcel) {
  if (!context) return;
  try {
    await context.close();
  } catch (e) {
    log("warn", "Failed to close browser context", {
      error: e.message,
      parcelNumber: parcel
    });
  }
}
// ====================================================
// 15. MAIN DATA FETCHER
// ====================================================
const getTaxData = async (page, mapNumber, config) => {
  const { url: searchUrl, authority } = config;

  try {
    const { records } = await searchParcel(page, mapNumber, searchUrl);
    if (!records?.length) return handleNotFound(mapNumber, "No tax records found for this parcel number.", authority);

    sortRecordsByYear(records);
    const { allPaid, latestRecordToOpen, delinquent, notes } = determineDelinquency(records);
    if (!latestRecordToOpen) return handleNotFound(mapNumber, "No valid tax record found.", authority);

    const browser = page.browser();
    const details = await fetchRecordDetails(browser, latestRecordToOpen);
    if (!details) return handleNotFound(mapNumber, "Failed to load property details.", authority);

    const taxHistory = buildTaxHistory(records, latestRecordToOpen, details, allPaid);
    return buildSuccessResponse(details, notes, delinquent, taxHistory, authority);
  } catch (err) {
    if (err instanceof TooManyHitsError) return handleNotFound(mapNumber, "Too many search results. Please use a more specific parcel number.", authority);
    if (err instanceof NoResultsError) return handleNotFound(mapNumber, "No tax records found for this parcel number.", authority);
    if (err instanceof StructureError) {
      log("error", "Website structure changed", { mapNumber, error: err.message });
      return handleNotFound(mapNumber, "Unable to parse website data. The website structure may have changed.", authority);
    }
    log("error", "getTaxData unexpected error", { mapNumber, error: err.message, stack: err.stack });
    return handleNotFound(mapNumber, "An error occurred while fetching tax data.", authority);
  }
};

// ====================================================
// 16. EXPRESS HANDLER (entry point)
// ====================================================
const search = async (req, res) => {
  const path = req.path; // e.g., "/orangeburg"
  const countyKey = path.replace(/^\/+/, '').toLowerCase(); // → "orangeburg"

  console.log("REQUEST PATH:", path);
  console.log("EXTRACTED COUNTY:", countyKey);

  const config = COUNTY_CONFIG[countyKey];
  if (!config) {
    log("error", "Unsupported county", { requested: countyKey, available: Object.keys(COUNTY_CONFIG) });
    return sendErrorResponse(res, "County not supported", req.body.fetch_type || "api", 404);
  }

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
    const page = await createBrowserPage(browserContext);
    const data = await getTaxData(page, mapNumber, config);
    sendResponse(res, data, req.body.fetch_type);
  } catch (err) {
    log("error", "Search handler crash", { county: countyKey, error: err.message, stack: err.stack });
    sendErrorResponse(res, "An unexpected error occurred. Please try again later.", req.body.fetch_type, 500);
  } finally {
    await closeBrowserContext(browserContext, mapNumber);
  }
};
module.exports = { search };