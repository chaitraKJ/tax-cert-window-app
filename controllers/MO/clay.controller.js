//Author :- Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// ====================================================
// 1. CONFIGURATION
// ====================================================
const CLAY_CONFIG = {
  baseUrl: "https://collector.claycountymo.gov/ascend/(dggm4ibpya0yw0b3jkk1qu45)/search.aspx",
  authority: "Clay County Tax Collector, Clay County, MO"
};

// ====================================================
// 2. CONSTANTS
// ====================================================
const MAX_RETRIES = 3;
const PAGE_TIMEOUT = 90000;
const SELECTOR_TIMEOUT = 30000;
const NAVIGATION_TIMEOUT = 30000;
const MAX_PARCEL_LENGTH = 50;

// Payment schedule for Clay County (based on provided info)
const PAYMENT_SCHEDULE = {
  dueMonth: 0,     // January (0-indexed)
  dueDay: 30,
  delqMonth: 0,
  delqDay: 31      // Delinquent after Jan 30
};

// ====================================================
// 3. SELECTORS
// ====================================================
const SELECTORS = {
  PARCEL_INPUT: "input#mSearchControl_mParcelID",
  SUBMIT_BUTTON: "input#mSearchControl_mSubmit",
  PARCEL_SITUS_TABLE: "table#ParcelSitusTable",
  PARCEL_NUMBER_SPAN: "span#mParcelnumbersitusaddress_mParcelNumber",
  SITUS_ADDRESS_SPAN: "span#mParcelnumbersitusaddress_mSitusAddress",
  OWNER_TABLE: "table.DataGrid#RealDataGrid",
  OWNER_TABLE_ROWS: "table.DataGrid#RealDataGrid tbody tr",
  VALUES_TABLE: "table.DataGrid#mTabGroup_Values_mValues_mGrid_RealDataGrid",
  RECEIPTS_TABLE: "table.DataGrid#mTabGroup_Receipts_mReceipts_mGrid_RealDataGrid",
  RECEIPTS_ROWS: "table.DataGrid#mTabGroup_Receipts_mReceipts_mGrid_RealDataGrid tbody tr",
  RECEIPT_LINK: "table.DataGrid#mTabGroup_Receipts_mReceipts_mGrid_RealDataGrid tbody tr td a",
  RECEIPT_DETAIL_TABLE: "table.DataGrid#mReceiptDetail_mGrid_RealDataGrid",
  INSTALLMENTS_TABLE: "table.DataGrid#mGrid_RealDataGrid",
  ASSESSMENT_TABLE: "table.DataGrid",
  NO_RESULTS: "span.ErrorMessage"
};

// ====================================================
// 4. UTILITY FUNCTIONS
// ====================================================
function log(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    county: "clay",
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

  // Handle MM/DD/YYYY format
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullMatch) return trimmed;

  // Handle MM/DD/YY format
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
    throw new ValidationError("Property ID must be a non-empty string");
  }
  return input.trim().replace(/[^\w\-]/g, "");
}

function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${date.getFullYear()}`;
}

function calculatePaymentDates(taxYear) {
  // Tax year format: "2025" for calendar year
  const year = parseInt(taxYear, 10);
  if (isNaN(year)) return { dueDate: "N/A", delqDate: "N/A" };
  
  // Due: January 30 of following year
  const dueDate = new Date(year + 1, PAYMENT_SCHEDULE.dueMonth, PAYMENT_SCHEDULE.dueDay);
  // Delinquent: January 31 of following year
  const delqDate = new Date(year + 1, PAYMENT_SCHEDULE.delqMonth, PAYMENT_SCHEDULE.delqDay);
  
  return {
    dueDate: formatDate(dueDate),
    delqDate: formatDate(delqDate)
  };
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
  if (!account) return "Property ID (account) is required";
  if (typeof account !== "string") return "Property ID must be a string";
  if (account.trim().length === 0) return "Property ID cannot be empty";

  try {
    const sanitized = sanitizeParcelNumber(account);
    if (sanitized.length === 0) return "Property ID contains no valid characters";
    if (sanitized.length > MAX_PARCEL_LENGTH) return `Property ID too long (max ${MAX_PARCEL_LENGTH} characters)`;
  } catch (e) {
    return e.message;
  }
  return null;
}

// ====================================================
// 8. EXTRACT OWNER NAME
// ====================================================
async function extractOwnerName(page) {
  try {
    const ownerData = await page.evaluate((selectors) => {
      const table = document.querySelector(selectors.OWNER_TABLE);
      if (!table) return [];
      
      const rows = table.querySelectorAll("tbody tr");
      const owners = [];

      rows.forEach((row, index) => {
        // Skip header row
        if (index === 0) return;
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 3) return;

        const role = cells[0].textContent.trim();
        const name = cells[2].textContent.trim();

        // Get owner or taxpayer names
        if (role.toUpperCase() === "OWNER" || role.toUpperCase() === "TAXPAYER") {
          if (name && !owners.includes(name)) {
            owners.push(name);
          }
        }
      });

      return owners;
    }, SELECTORS);

    return ownerData.length > 0 ? ownerData : ["N/A"];
  } catch (e) {
    return ["N/A"];
  }
}

// ====================================================
// 9. EXTRACT PROPERTY INFO
// ====================================================
async function extractPropertyInfo(page) {
  try {
    const propertyData = await page.evaluate((selectors) => {
      const parcelNumber = document.querySelector(selectors.PARCEL_NUMBER_SPAN);
      const situsAddress = document.querySelector(selectors.SITUS_ADDRESS_SPAN);
      
      return {
        parcelNumber: parcelNumber ? parcelNumber.textContent.trim() : "N/A",
        situsAddress: situsAddress ? situsAddress.textContent.trim() : "N/A"
      };
    }, SELECTORS);

    return propertyData;
  } catch (e) {
    log("error", "Failed to extract property info", { error: e.message });
    throw new StructureError("Failed to extract property information");
  }
}

// ====================================================
// 10. EXTRACT ASSESSMENT DATA
// ====================================================
async function extractAssessmentData(page) {
  try {
    const assessmentData = await page.evaluate((selectors) => {
      const table = document.querySelector(selectors.VALUES_TABLE);
      
      if (!table) return null;
      
      const rows = table.querySelectorAll("tbody tr");
      const data = { 
        year: "N/A", 
        assessedValue: "N/A", 
        taxableValue: "N/A", 
        landValue: "N/A", 
        improvements: "N/A" 
      };
      
      // Get the latest year from header row (first data column after "Value Type")
      const headerRow = rows[0];
      if (headerRow) {
        const headerCells = headerRow.querySelectorAll("td");
        if (headerCells.length > 1) {
          // Extract year from "Tax Year\n2025" format
          const yearText = headerCells[1].textContent.trim();
          const yearMatch = yearText.match(/(\d{4})/);
          if (yearMatch) {
            data.year = yearMatch[1];
          }
        }
      }
      
      // Extract Assessed Value and Taxable Value
      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) return;
        
        const label = cells[0].textContent.trim().toUpperCase();
        const latestValue = cells[1].textContent.trim(); // First data column is latest year
        
        if (label.includes("ASSESSED VALUE TOTAL")) {
          data.assessedValue = latestValue;
        } else if (label.includes("TAXABLE VALUE TOTAL")) {
          data.taxableValue = latestValue;
        }
      });
      
      return data;
    }, SELECTORS);

    if (assessmentData) {
      // Format the values with currency if they're numbers
      if (assessmentData.assessedValue !== "N/A") {
        assessmentData.assessedValue = formatCurrency(assessmentData.assessedValue);
      }
      if (assessmentData.taxableValue !== "N/A") {
        assessmentData.taxableValue = formatCurrency(assessmentData.taxableValue);
      }
    }

    return assessmentData || { year: "N/A", assessedValue: "N/A", taxableValue: "N/A", landValue: "N/A", improvements: "N/A" };
  } catch (e) {
    return { year: "N/A", assessedValue: "N/A", taxableValue: "N/A", landValue: "N/A", improvements: "N/A" };
  }
}

// ====================================================
// 11. PARSE RECEIPTS TABLE
// ====================================================
async function parseReceiptsTable(page) {
  try {
    const receipts = await page.evaluate((selectors) => {
      const table = document.querySelector(selectors.RECEIPTS_TABLE);
      if (!table) return [];
      
      const rows = table.querySelectorAll("tbody tr");
      const results = [];

      rows.forEach((row, index) => {
        // Skip header row
        if (index === 0) return;
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 6) return;

        const date = cells[0].textContent.trim();
        const receiptLink = cells[1].querySelector("a");
        const receiptNo = receiptLink ? receiptLink.textContent.trim() : cells[1].textContent.trim();
        const amountApplied = cells[2].textContent.trim();
        const amountDue = cells[3].textContent.trim();
        const tendered = cells[4].textContent.trim();
        const change = cells[5].textContent.trim();

        results.push({
          date,
          receiptNo,
          amountApplied,
          amountDue,
          tendered,
          change,
          taxYear: null // Will be filled later from detail page
        });
      });

      return results;
    }, SELECTORS);

    return receipts;
  } catch (e) {
    log("error", "Failed to parse receipts table", { error: e.message });
    throw new StructureError("Failed to parse receipts table");
  }
}

// ====================================================
// 12. GET TAX YEARS FROM RECEIPT DETAILS
// ====================================================
async function enrichReceiptsWithTaxYears(page, receipts) {
  try {
    // Only process the first receipt (latest) for efficiency
    // If we need all tax years, we can expand this later
    if (receipts.length === 0) return receipts;
    
    try {
      // Find and click the first receipt link (latest)
      const receiptClicked = await page.evaluate((receiptNo) => {
        const links = Array.from(document.querySelectorAll("table.DataGrid#mTabGroup_Receipts_mReceipts_mGrid_RealDataGrid tbody tr td a"));
        const link = links.find(l => l.textContent.trim() === receiptNo);
        if (link) {
          link.click();
          return true;
        }
        return false;
      }, receipts[0].receiptNo);

      if (receiptClicked) {
        // Wait for the detail table to load
        await page.waitForSelector(SELECTORS.RECEIPT_DETAIL_TABLE, { timeout: 5000 }).catch(() => null);
        await new Promise(r => setTimeout(r, 300));

        // Extract tax year from detail table
        const taxYear = await page.evaluate((selectors) => {
          const table = document.querySelector(selectors.RECEIPT_DETAIL_TABLE);
          if (!table) return null;
          
          const rows = table.querySelectorAll("tbody tr");
          if (rows.length > 1) {
            const cells = rows[1].querySelectorAll("td");
            if (cells.length > 1) {
              return cells[1].textContent.trim();
            }
          }
          return null;
        }, SELECTORS);

        if (taxYear) {
          receipts[0].taxYear = parseInt(taxYear, 10);
          
          // Infer tax years for older receipts (decrement by 1 for each previous year)
          for (let i = 1; i < receipts.length; i++) {
            receipts[i].taxYear = receipts[0].taxYear - i;
          }
        }
      }
    } catch (err) {
    }

    return receipts;
  } catch (e) {
    log("error", "Failed to enrich receipts with tax years", { error: e.message });
    return receipts;
  }
}

// ====================================================
// 12. PARSE INSTALLMENTS PAYABLE TABLE
// ====================================================
async function parseInstallmentsPayable(page) {
  try {
    try {
      await page.waitForFunction(
      (installmentsSelector) => {
        const normalize = (txt) =>
          (txt || "")
            .toString()
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();

        const isHeader = (headers) => {
          const tokens = ["tax year", "installment", "due date", "principal", "total due"];
          const hitCount = tokens.reduce((acc, t) => acc + (headers.some(h => h.includes(t)) ? 1 : 0), 0);
          return hitCount >= 4;
        };

        const tables = [];
        const direct = document.querySelector(installmentsSelector);
        if (direct) tables.push(direct);
        for (const t of Array.from(document.querySelectorAll("table"))) {
          if (!tables.includes(t)) tables.push(t);
        }

        for (const table of tables) {
          const theadHeaders = Array.from(table.querySelectorAll("thead th, thead td")).map(el => normalize(el.textContent));
          const headers = theadHeaders.length > 0 ? theadHeaders : Array.from(table.querySelectorAll("tbody tr:first-child th, tbody tr:first-child td")).map(el => normalize(el.textContent));
          if (headers.length === 0 || !isHeader(headers)) continue;

          const bodyRows = table.querySelectorAll("tbody tr");
          if (bodyRows.length >= 2) return true;
          if (table.textContent && table.textContent.includes("No records")) return true;
          if (table.textContent && table.textContent.toLowerCase().includes("loading")) return false;
          return false;
        }

        return false;
      },
      { timeout: 10000 },
      SELECTORS.INSTALLMENTS_TABLE
      );
    } catch {
      return [];
    }

    await new Promise(r => setTimeout(r, 500));

    return await page.evaluate((installmentsSelector) => {
      const normalize = (txt) =>
        (txt || "")
          .toString()
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();

      const isHeader = (headers) => {
        const tokens = ["tax year", "installment", "due date", "principal", "total due"];
        const hitCount = tokens.reduce((acc, t) => acc + (headers.some(h => h.includes(t)) ? 1 : 0), 0);
        return hitCount >= 4;
      };

      const getHeaders = (table) => {
        const theadCells = Array.from(table.querySelectorAll("thead th, thead td"));
        if (theadCells.length > 0) return theadCells.map(el => normalize(el.textContent));
        const firstRowCells = Array.from(table.querySelectorAll("tbody tr:first-child th, tbody tr:first-child td"));
        return firstRowCells.map(el => normalize(el.textContent));
      };

      const pickTable = () => {
        const candidates = [];
        const direct = document.querySelector(installmentsSelector);
        if (direct) candidates.push(direct);
        for (const t of Array.from(document.querySelectorAll("table"))) {
          if (!candidates.includes(t)) candidates.push(t);
        }
        for (const table of candidates) {
          const headers = getHeaders(table);
          if (headers.length > 0 && isHeader(headers)) return { table, headers };
        }
        return null;
      };

      const match = pickTable();
      if (!match) return [];

      const { table } = match;
      if (table.textContent && table.textContent.includes("No records")) return [];

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const results = [];

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length < 5) continue;

        const taxYearNum = parseInt((cells[0]?.textContent || "").trim(), 10);
        if (Number.isNaN(taxYearNum)) continue;

        const installment = (cells[1]?.textContent || "").trim();
        const dueDate = (cells[2]?.textContent || "").trim();
        const principal = (cells[3]?.textContent || "").trim();
        const interestPenalties = (cells[4]?.textContent || "").trim();
        const totalDue = (cells[5]?.textContent || "").trim();
        const cumulativeDue = (cells[6]?.textContent || "").trim();

        results.push({
          taxYear: taxYearNum,
          installment,
          dueDate,
          principal,
          interestPenalties,
          totalDue,
          cumulativeDue,
          isPaid: false
        });
      }

      return results;
    }, SELECTORS.INSTALLMENTS_TABLE);
  } catch (e) {
    return [];
  }
}

// ====================================================
// 14. BUILD TAX HISTORY FROM INSTALLMENTS (UNPAID)
// ====================================================
function buildTaxHistoryFromInstallments(installments, assessmentData, propertyInfo) {
  const history = [];
  const now = new Date();

  installments.forEach(installment => {
    const taxYear = installment.taxYear;
    const dueDate = normalizeDate(installment.dueDate);
    const dueDateObj = new Date(dueDate);
    const delqDate = new Date(dueDateObj);
    delqDate.setDate(delqDate.getDate() + 1); // Delinquent day after due date
    
    const status = now > delqDate ? "Delinquent" : "Due";

    history.push({
      jurisdiction: "County",
      year: taxYear.toString(),
      status: status,
      payment_type: `Annual`,
      base_amount: formatCurrency(installment.principal),
      county_tax: formatCurrency(installment.principal),
      city_tax: "N/A",
      fees: "N/A",
      penalty: formatCurrency(installment.interestPenalties),
      cost: "N/A",
      amount_paid: "$0.00",
      amount_due: formatCurrency(installment.totalDue),
      paid_date: " ",
      due_date: dueDate,
      delq_date: formatDate(delqDate),
      mailing_date: "N/A",
      good_through_date: "N/A",
      land_value: assessmentData.landValue,
      improvements: assessmentData.improvements,
      total_assessed_value: assessmentData.assessedValue,
      exemptions_breakdown: {
        residential_exemption: "N/A",
        homestead_exemption: "N/A",
        other_exemptions: "N/A",
        local_option_credit: "N/A"
      }
    });
  });

  // Sort by year descending
  return history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
}

// ====================================================
// 15. BUILD TAX HISTORY FROM RECEIPTS (PAID)
// ====================================================
function buildTaxHistoryFromReceipts(receipts, assessmentData, propertyInfo, allPaid) {
  const history = [];
  const now = new Date();

  receipts.forEach(receipt => {
    const taxYear = receipt.taxYear || new Date(receipt.date).getFullYear() - 1;
    const dates = calculatePaymentDates(taxYear);
    
    const amountApplied = parseFloat(receipt.amountApplied.replace(/,/g, ""));
    const amountDue = parseFloat(receipt.amountDue.replace(/,/g, ""));
    const isPaid = amountApplied >= amountDue;
    
    const delqDate = new Date(dates.delqDate);
    const status = isPaid ? "Paid" : (now > delqDate ? "Delinquent" : "Due");

    history.push({
      jurisdiction: "County",
      year: taxYear.toString(),
      status: status,
      payment_type: "Annual",
      base_amount: formatCurrency(receipt.amountDue),
      county_tax: formatCurrency(receipt.amountDue),
      city_tax: "N/A",
      fees: "N/A",
      penalty: "$0.00",
      cost: "N/A",
      amount_paid: isPaid ? formatCurrency(receipt.amountApplied) : "$0.00",
      amount_due: isPaid ? "$0.00" : formatCurrency(String(amountDue - amountApplied)),
      paid_date: isPaid ? normalizeDate(receipt.date) : " ",
      due_date: dates.dueDate,
      delq_date: dates.delqDate,
      mailing_date: "N/A",
      good_through_date: "N/A",
      land_value: assessmentData.landValue,
      improvements: assessmentData.improvements,
      total_assessed_value: assessmentData.assessedValue,
      exemptions_breakdown: {
        residential_exemption: "N/A",
        homestead_exemption: "N/A",
        other_exemptions: "N/A",
        local_option_credit: "N/A"
      }
    });
  });

  // Sort by year descending
  history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

  // If all paid, return only the latest year
  return allPaid && history.length > 0 ? [history[0]] : history;
}

// ====================================================
// 17. RESPONSE BUILDERS
// ====================================================
function handleNotFound(propertyId, reason) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    parcel_number: propertyId,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: CLAY_CONFIG.authority,
    notes: reason,
    delinquent: "N/A",
    tax_history: [],
    property_details: {}
  };
}

function buildSuccessResponse(ownerNames, propertyInfo, assessmentData, notes, delinquent, history) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ownerNames,
    property_address: propertyInfo.situsAddress,
    parcel_number: propertyInfo.parcelNumber,
    land_value: assessmentData.landValue,
    improvements: assessmentData.improvements,
    total_assessed_value: assessmentData.assessedValue,
    exemption: "N/A",
    total_taxable_value: assessmentData.taxableValue,
    taxing_authority: CLAY_CONFIG.authority,
    mailing_date: "N/A",
    good_through_date: "N/A",
    notes,
    delinquent,
    tax_history: history,
    property_details: {
      assessment_year: assessmentData.year
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
// 18. MAIN DATA FETCHER
// ====================================================
const getTaxData = async (page, propertyId) => {
  try {
    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      
      // Block images, stylesheets, fonts, and other non-essential resources
      if (
        resourceType === 'image' ||
        resourceType === 'stylesheet' ||
        resourceType === 'font' ||
        resourceType === 'media' ||
        url.includes('analytics') ||
        url.includes('tracking') ||
        url.includes('advertisement') ||
        url.includes('.css') ||
        url.includes('.jpg') ||
        url.includes('.jpeg') ||
        url.includes('.png') ||
        url.includes('.gif') ||
        url.includes('.svg') ||
        url.includes('.woff') ||
        url.includes('.ttf')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Set realistic User-Agent and Viewport
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to search page
    await withRetry(async () => {
      await page.goto(CLAY_CONFIG.baseUrl, { 
        waitUntil: "networkidle2",
        timeout: PAGE_TIMEOUT 
      });
    }, null, [], 2);

    // Wait for search form to load
    await page.waitForSelector(SELECTORS.PARCEL_INPUT, { timeout: SELECTOR_TIMEOUT });

    // Enter parcel number
    await page.type(SELECTORS.PARCEL_INPUT, propertyId);

    // Click submit and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT }),
      page.click(SELECTORS.SUBMIT_BUTTON)
    ]);

    // Check for error messages
    const errorMessage = await page.evaluate((selector) => {
      const errorEl = document.querySelector(selector);
      return errorEl ? errorEl.textContent.trim() : null;
    }, SELECTORS.NO_RESULTS);

    if (errorMessage && errorMessage.toLowerCase().includes("no records")) {
      return handleNotFound(propertyId, "No tax records found for this property ID.");
    }

    // Wait for results to load
    await page.waitForSelector(SELECTORS.PARCEL_SITUS_TABLE, { timeout: SELECTOR_TIMEOUT });
    
    // Give extra time for all tables to load on the page
    await page.waitForFunction(
      () => {
        const parcelTable = document.querySelector("table#ParcelSitusTable");
        const ownerTable = document.querySelector("table.DataGrid#RealDataGrid");
        const valuesTable = document.querySelector("table.DataGrid#mTabGroup_Values_mValues_mGrid_RealDataGrid");
        const parcelNumber = document.querySelector("span#mParcelnumbersitusaddress_mParcelNumber");

        const ownerRows = ownerTable ? ownerTable.querySelectorAll("tbody tr").length : 0;
        const valueRows = valuesTable ? valuesTable.querySelectorAll("tbody tr").length : 0;

        const parcelTextOk = parcelNumber && parcelNumber.textContent && parcelNumber.textContent.trim().length > 0;
        return parcelTable && ownerTable && valuesTable && parcelTextOk && ownerRows >= 2 && valueRows >= 2;
      },
      { timeout: 20000 }
    ).catch(() => {
    });
    
    // Additional wait to ensure dynamic content is rendered
    await new Promise(r => setTimeout(r, 1000));

    // Extract owner names
    const ownerNames = await extractOwnerName(page);

    // Extract property information
    const propertyInfo = await extractPropertyInfo(page);
    if (propertyInfo.parcelNumber === "N/A") {
      return handleNotFound(propertyId, "No tax records found for this property ID.");
    }

    // Extract assessment data
    const assessmentData = await extractAssessmentData(page);

    // Check for installments payable first (unpaid taxes)
    const installments = await parseInstallmentsPayable(page);
    
    let enrichedReceipts = [];
    let allPaid = false;
    let delinquent = "NONE";
    let notes = "";
    const ANNUAL_PAYMENT_NOTE = "NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 01/30";

    if (installments.length > 0) {
      // Installments table exists - there are UNPAID taxes
      allPaid = false;

      const taxHistory = buildTaxHistoryFromInstallments(installments, assessmentData, propertyInfo);
      delinquent = taxHistory.some(r => r.status === "Delinquent") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      const unpaidYears = taxHistory
        .filter(r => r.status !== "Paid")
        .map(r => parseInt(r.year, 10))
        .filter(y => Number.isFinite(y))
        .sort((a, b) => a - b);

      const latestYear = unpaidYears.length > 0 ? unpaidYears[unpaidYears.length - 1] : null;
      let latestYearStatus = "DUE";

      if (latestYear) {
        const latestYearRecords = taxHistory.filter(r => parseInt(r.year, 10) === latestYear);
        latestYearStatus = latestYearRecords.some(r => r.status === "Delinquent") ? "DELINQUENT" : "DUE";
      }

      if (latestYear) {
        notes = unpaidYears.length > 1
          ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`
          : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`;
      } else {
        notes = `ALL PRIORS ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
      }

      return buildSuccessResponse(ownerNames, propertyInfo, assessmentData, notes, delinquent, taxHistory);
      
    } else {
      // No installments table - all taxes are PAID
      // Parse receipts table
      await page.waitForFunction(
        (selector) => {
          const table = document.querySelector(selector);
          if (!table) return false;
          const rows = table.querySelectorAll("tbody tr");
          return rows.length >= 2 || table.textContent.includes("No records");
        },
        { timeout: 20000 },
        SELECTORS.RECEIPTS_TABLE
      ).catch(() => {});

      const receipts = await parseReceiptsTable(page);
      
      // Enrich receipts with actual tax years from detail pages
      enrichedReceipts = await enrichReceiptsWithTaxYears(page, receipts);
      
      allPaid = true;
      delinquent = "NONE";
      
      const latestReceipt = enrichedReceipts.length > 0 ? enrichedReceipts[0] : null;
      if (latestReceipt && Number.isFinite(latestReceipt.taxYear)) {
        notes = `ALL PRIORS ARE PAID, ${latestReceipt.taxYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
      } else {
        notes = `ALL PRIORS ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
      }
      
      // Build tax history from receipts only (show latest year only)
      const taxHistory = buildTaxHistoryFromReceipts(enrichedReceipts, assessmentData, propertyInfo, allPaid);
      return buildSuccessResponse(ownerNames, propertyInfo, assessmentData, notes, delinquent, taxHistory);
    }
  } catch (err) {
    if (err instanceof NoResultsError) {
      return handleNotFound(propertyId, "No tax records found for this property ID.");
    }
    if (err instanceof StructureError) {
      log("error", "Website structure changed", { propertyId, error: err.message });
      return handleNotFound(propertyId, "Unable to parse website data. The website structure may have changed.");
    }
    log("error", "getTaxData unexpected error", { propertyId, error: err.message, stack: err.stack });
    return handleNotFound(propertyId, "An error occurred while fetching tax data.");
  }
};

// ====================================================
// 19. EXPRESS HANDLER
// ====================================================
const search = async (req, res) => {
  const valErr = validateRequest(req.body);
  if (valErr) {
    log("error", "Validation failed", { error: valErr, body: req.body });
    return sendErrorResponse(res, valErr, req.body.fetch_type || "api", 400);
  }

  const propertyId = sanitizeParcelNumber(req.body.account);
  let browserContext = null;

  try {
    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();

    const data = await getTaxData(page, propertyId);
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