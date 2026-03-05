//Author :- Nithyananda R S
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// ====================================================
// 1. CONFIGURATION
// ====================================================
const YAKIMA_CONFIG = {
  baseUrl: "https://yes.co.yakima.wa.us/ascend/(S(0kircpceocgw4lemreweglws))/default.aspx",
  authority: "Yakima County Treasurer, Yakima County, WA"
};

// ====================================================
// 2. CONSTANTS
// ====================================================
const MAX_RETRIES = 3;
const PAGE_TIMEOUT = 90000;
const SELECTOR_TIMEOUT = 30000;
const NAVIGATION_TIMEOUT = 30000;
const MAX_PARCEL_LENGTH = 50;

// Payment schedule for Yakima County (Washington state - semi-annual)
const PAYMENT_SCHEDULE = {
  install1: {
    dueMonth: 3,    // April (0-indexed)
    dueDay: 30,
    delqMonth: 4,
    delqDay: 1      // Delinquent after April 30
  },
  install2: {
    dueMonth: 9,    // October (0-indexed)
    dueDay: 31,
    delqMonth: 10,
    delqDay: 1      // Delinquent after October 31
  }
};

// ====================================================
// 3. SELECTORS
// ====================================================
const SELECTORS = {
  PARCEL_INPUT: "input#MainContent_mParcelID",
  PAY_TAXES_BUTTON: "input#MainContent_mPayTaxes",
  SITUS_ADDRESS: "span#MainContent_mSitusAddress",
  PARTIES_TABLE: "table#MainContent_mParties",
  PROPERTY_VALUES_TABLE: "table#MainContent_mPropertyValues",
  RECEIPTS_TABLE: "table#MainContent_mReceipts",
  RECEIPT_LINK: "table#MainContent_mReceipts tbody tr td a",
  RECEIPT_DETAIL_TABLE: "table#MainContent_mGrid",
  INSTALLMENTS_TABLE: "table#MainContent_mInstallmentsGrid",
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
    county: "yakima",
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

  // Handle MM/DD/YYYY HH:MM:SS format
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fullMatch) {
    return `${fullMatch[1]}/${fullMatch[2]}/${fullMatch[3]}`;
  }

  return trimmed;
}

function sanitizeParcelNumber(input) {
  if (!input || typeof input !== "string") {
    throw new ValidationError("Property ID must be a non-empty string");
  }
  return input.trim();
}

function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${date.getFullYear()}`;
}

function calculatePaymentDates(taxYear) {
  const year = parseInt(taxYear, 10);
  if (isNaN(year)) return { install1Due: "N/A", install1Delq: "N/A", install2Due: "N/A", install2Delq: "N/A" };
  
  // Install 1: Due April 30 of tax year, delinquent after
  const install1Due = new Date(year, PAYMENT_SCHEDULE.install1.dueMonth, PAYMENT_SCHEDULE.install1.dueDay);
  const install1Delq = new Date(year, PAYMENT_SCHEDULE.install1.delqMonth, PAYMENT_SCHEDULE.install1.delqDay);
  
  // Install 2: Due October 31 of tax year, delinquent after
  const install2Due = new Date(year, PAYMENT_SCHEDULE.install2.dueMonth, PAYMENT_SCHEDULE.install2.dueDay);
  const install2Delq = new Date(year, PAYMENT_SCHEDULE.install2.delqMonth, PAYMENT_SCHEDULE.install2.delqDay);
  
  return {
    install1Due: formatDate(install1Due),
    install1Delq: formatDate(install1Delq),
    install2Due: formatDate(install2Due),
    install2Delq: formatDate(install2Delq)
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
      const table = document.querySelector(selectors.PARTIES_TABLE);
      if (!table) return [];
      
      const rows = table.querySelectorAll("tbody tr");
      const owners = [];

      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 3) return;

        const role = cells[0].textContent.trim();
        const name = cells[2].textContent.trim();

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
      const situsAddress = document.querySelector(selectors.SITUS_ADDRESS);
      
      return {
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
      const table = document.querySelector(selectors.PROPERTY_VALUES_TABLE);
      
      if (!table) return null;
      
      const rows = table.querySelectorAll("tbody tr");
      const data = { 
        year: "N/A", 
        assessedValue: "N/A", 
        taxableValue: "N/A", 
        landValue: "N/A", 
        improvements: "N/A",
        marketTotal: "N/A"
      };
      
      // Get the latest year from header row
      const headerRow = rows[0];
      if (headerRow) {
        const headerCells = headerRow.querySelectorAll("th");
        if (headerCells.length > 1) {
          const yearText = headerCells[1].textContent.trim();
          const yearMatch = yearText.match(/(\d{4})/);
          if (yearMatch) {
            data.year = yearMatch[1];
          }
        }
      }
      
      // Extract values
      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) return;
        
        const label = cells[0].textContent.trim().toUpperCase();
        const latestValue = cells[1].textContent.trim();
        
        if (label.includes("TAXABLE VALUE")) {
          data.taxableValue = latestValue;
        } else if (label.includes("ASSESSED VALUE")) {
          data.assessedValue = latestValue;
        } else if (label.includes("MARKET LAND")) {
          data.landValue = latestValue;
        } else if (label.includes("MARKET IMPROVEMENT")) {
          data.improvements = latestValue;
        } else if (label.includes("MARKET TOTAL")) {
          data.marketTotal = latestValue;
        }
      });
      
      return data;
    }, SELECTORS);
    return assessmentData || { year: "N/A", assessedValue: "N/A", taxableValue: "N/A", landValue: "N/A", improvements: "N/A", marketTotal: "N/A" };
  } catch (e) {
    return { year: "N/A", assessedValue: "N/A", taxableValue: "N/A", landValue: "N/A", improvements: "N/A", marketTotal: "N/A" };
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
        if (index === 0) return; // Skip header
        
        const cells = row.querySelectorAll("td");
        if (cells.length < 6) return;

        const date = cells[0].textContent.trim();
        const receiptLink = cells[1].querySelector("a");
        const receiptNo = receiptLink ? receiptLink.textContent.trim() : cells[1].textContent.trim();
        const amountApplied = cells[2].textContent.trim();
        const amountDue = cells[3].textContent.trim();
        const receiptTotal = cells[4].textContent.trim();
        const change = cells[5].textContent.trim();

        results.push({
          date,
          receiptNo,
          amountApplied,
          amountDue,
          receiptTotal,
          change,
          taxYear: null
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
// 12. GET TAX YEAR FROM RECEIPT DETAIL
// ====================================================
async function getLatestReceiptTaxYear(page, receiptNo) {
  try {
    const receiptClicked = await page.evaluate((receiptNo, selectors) => {
      const links = Array.from(document.querySelectorAll(selectors.RECEIPT_LINK));
      const link = links.find(l => l.textContent.trim() === receiptNo);
      if (link) {
        link.click();
        return true;
      }
      return false;
    }, receiptNo, SELECTORS);

    if (!receiptClicked) {
      return null;
    }

    await page.waitForSelector(SELECTORS.RECEIPT_DETAIL_TABLE, { timeout: 10000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));

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
      return parseInt(taxYear, 10);
    }

    return null;
  } catch (err) {
    return null;
  }
}

// ====================================================
// 13. PARSE INSTALLMENTS TABLE (UNPAID)
// ====================================================
async function parseInstallmentsTable(page) {
  try {
    await page.waitForFunction(
      () => {
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

        const tables = Array.from(document.querySelectorAll("table"));
        for (const table of tables) {
          const theadHeaders = Array.from(table.querySelectorAll("thead th, thead td")).map(el => normalize(el.textContent));
          const headerMatch = theadHeaders.length > 0 && isHeader(theadHeaders);

          const firstRow = table.querySelector("tbody tr");
          let rowHeadersMatch = false;
          if (firstRow) {
            const rowHeaders = Array.from(firstRow.querySelectorAll("th, td")).map(el => normalize(el.textContent));
            rowHeadersMatch = rowHeaders.length > 0 && isHeader(rowHeaders);
          }

          if (!headerMatch && !rowHeadersMatch) continue;

          const tableText = (table.textContent || "").toString().toLowerCase();
          if (tableText.includes("no records")) return true;
          if (tableText.includes("loading")) return false;

          const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
          for (const row of bodyRows) {
            const firstCell = row.querySelector("td");
            if (!firstCell) continue;
            const yearNum = parseInt((firstCell.textContent || "").trim(), 10);
            if (Number.isFinite(yearNum)) return true;
          }
        }
        return false;
      },
      { timeout: 10000 }
    ).catch(() => {});

    await new Promise(r => setTimeout(r, 500));

    const installments = await page.evaluate(() => {
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

        const firstRow = table.querySelector("tbody tr");
        if (firstRow) {
          const rowCells = Array.from(firstRow.querySelectorAll("th, td"));
          return rowCells.map(el => normalize(el.textContent));
        }
        return [];
      };

      const findInstallmentsTable = () => {
        const tables = Array.from(document.querySelectorAll("table"));
        for (const table of tables) {
          const headers = getHeaders(table);
          if (headers.length > 0 && isHeader(headers)) return { table, headers };
        }
        return null;
      };

      const match = findInstallmentsTable();
      if (!match) return [];

      const { table, headers } = match;
      const tableText = (table.textContent || "").toString().toLowerCase();
      if (tableText.includes("no records")) return [];

      const headerIndex = (predicate) => {
        const idx = headers.findIndex(predicate);
        return idx >= 0 ? idx : null;
      };

      const idxTaxYear = headerIndex(h => h.includes("tax year"));
      const idxInstallment = headerIndex(h => h.includes("installment"));
      const idxDueDate = headerIndex(h => h.includes("due date"));
      const idxPrincipal = headerIndex(h => h === "principal" || h.includes("principal"));
      const idxInterestPenaltiesCosts = headerIndex(h => h.includes("interest") || (h.includes("penalt") && h.includes("cost")));
      const idxTotalDue = headerIndex(h => h === "total due" || (h.includes("total") && h.includes("due")));
      const idxCumulativeDue = headerIndex(h => h.includes("cumulative") && h.includes("due"));

      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      const results = [];

      const getCellText = (cells, idx, fallbackIdx) => {
        const cell = (idx !== null && idx !== undefined && idx >= 0) ? cells[idx] : cells[fallbackIdx];
        return cell ? cell.textContent.trim() : "";
      };

      for (const row of bodyRows) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length === 0) continue;

        const taxYearRaw = getCellText(cells, idxTaxYear, 0);
        const taxYearNum = parseInt(taxYearRaw, 10);
        if (Number.isNaN(taxYearNum)) continue;

        const installment = getCellText(cells, idxInstallment, 1);
        const dueDate = getCellText(cells, idxDueDate, 2);
        const principal = getCellText(cells, idxPrincipal, 3);
        const interestPenaltiesCosts = getCellText(cells, idxInterestPenaltiesCosts, 4);
        const totalDue = getCellText(cells, idxTotalDue, 5);
        const cumulativeDue = getCellText(cells, idxCumulativeDue, 6);

        results.push({
          taxYear: taxYearNum,
          installment,
          dueDate,
          principal,
          interestPenaltiesCosts,
          totalDue,
          cumulativeDue,
          isPaid: false
        });
      }

      return results;
    });
    return installments;
  } catch (e) {
    return [];
  }
}

// ====================================================
// 14. BUILD TAX HISTORY FROM RECEIPTS (PAID)
// ====================================================
function buildTaxHistoryFromReceipts(receipts, latestTaxYear, assessmentData, propertyInfo) {
  const history = [];
  const now = new Date();

  // Group receipts by tax year (infer from latest)
  receipts.forEach((receipt, index) => {
    const taxYear = latestTaxYear ? latestTaxYear - index : null;
    if (!taxYear) return;
    
    const dates = calculatePaymentDates(taxYear);
    const amountApplied = parseFloat(receipt.amountApplied.replace(/[^0-9.-]+/g, ""));
    
    // Determine which installment based on date
    const receiptDate = new Date(receipt.date);
    const month = receiptDate.getMonth();
    const installment = month <= 4 ? 1 : 2; // Jan-May = 1st half, Jun-Dec = 2nd half
    
    history.push({
      jurisdiction: "County",
      year: taxYear.toString(),
      status: "Paid",
      payment_type: "Semi-Annual",
      base_amount: formatCurrency(receipt.amountApplied),
      county_tax: formatCurrency(receipt.amountApplied),
      city_tax: "N/A",
      fees: "N/A",
      penalty: "$0.00",
      cost: "N/A",
      amount_paid: formatCurrency(receipt.amountApplied),
      amount_due: "$0.00",
      paid_date: normalizeDate(receipt.date),
      due_date: installment === 1 ? dates.install1Due : dates.install2Due,
      delq_date: installment === 1 ? dates.install1Delq : dates.install2Delq,
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

  history.sort((a, b) => {
    const yearDiff = parseInt(b.year) - parseInt(a.year);
    if (yearDiff !== 0) return yearDiff;
    return b.payment_type.includes("2") ? 1 : -1;
  });

  // Return only latest year
  const latestYearRecords = history.filter(h => h.year === latestTaxYear.toString());
  return latestYearRecords.length > 0 ? latestYearRecords : (history.length > 0 ? [history[0]] : []);
}

// ====================================================
// 15. BUILD TAX HISTORY FROM INSTALLMENTS (UNPAID)
// ====================================================
function buildTaxHistoryFromInstallments(installments, assessmentData, propertyInfo) {
  const history = [];
  const now = new Date();

  installments.forEach(installment => {
    const taxYear = installment.taxYear;
    const dueDate = normalizeDate(installment.dueDate);
    const dueDateObj = new Date(dueDate);
    const delqDate = new Date(dueDateObj);
    delqDate.setDate(delqDate.getDate() + 1);
    
    const installmentLabel = (installment.installment || "").toString();
    const isMarkedDelinquent = installmentLabel.toLowerCase().includes("delinquent");
    const status = isMarkedDelinquent || now > delqDate ? "Delinquent" : "Due";

    history.push({
      jurisdiction: "County",
      year: taxYear.toString(),
      status: status,
      payment_type: "Semi-Annual",
      base_amount: formatCurrency(installment.principal),
      county_tax: formatCurrency(installment.principal),
      city_tax: "N/A",
      fees: "N/A",
      penalty: installment.interestPenaltiesCosts ? formatCurrency(installment.interestPenaltiesCosts) : "$0.00",
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

  return history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
}

// ====================================================
// 16. RESPONSE BUILDERS
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
    taxing_authority: YAKIMA_CONFIG.authority,
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
    parcel_number: "N/A",
    land_value: assessmentData.landValue,
    improvements: assessmentData.improvements,
    total_assessed_value: assessmentData.assessedValue,
    exemption: "N/A",
    total_taxable_value: assessmentData.taxableValue,
    taxing_authority: YAKIMA_CONFIG.authority,
    mailing_date: "N/A",
    good_through_date: "N/A",
    notes,
    delinquent,
    tax_history: history,
    property_details: {
      assessment_year: assessmentData.year,
      market_total: assessmentData.marketTotal
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
// 17. MAIN DATA FETCHER
// ====================================================
const getTaxData = async (page, propertyId) => {
  try {
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      
      if (
        resourceType === 'image' ||
        resourceType === 'stylesheet' ||
        resourceType === 'font' ||
        resourceType === 'media' ||
        url.includes('analytics') ||
        url.includes('tracking') ||
        url.includes('.css') ||
        url.includes('.jpg') ||
        url.includes('.png') ||
        url.includes('.gif')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });
    
    await withRetry(async () => {
      await page.goto(YAKIMA_CONFIG.baseUrl, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });
    }, null, [], 2);

    await page.waitForSelector(SELECTORS.PARCEL_INPUT, { timeout: SELECTOR_TIMEOUT });

    await page.type(SELECTORS.PARCEL_INPUT, propertyId);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT }),
      page.click(SELECTORS.PAY_TAXES_BUTTON)
    ]);

    const errorMessage = await page.evaluate((selector) => {
      const errorEl = document.querySelector(selector);
      return errorEl ? errorEl.textContent.trim() : null;
    }, SELECTORS.NO_RESULTS);

    if (errorMessage && errorMessage.toLowerCase().includes("no records")) {
      return handleNotFound(propertyId, "No tax records found for this property ID.");
    }

    await page.waitForSelector(SELECTORS.SITUS_ADDRESS, { timeout: SELECTOR_TIMEOUT });
    
    await page.waitForFunction(
      (selectors) => {
        const situsAddress = document.querySelector(selectors.SITUS_ADDRESS);
        const partiesTable = document.querySelector(selectors.PARTIES_TABLE);
        const valuesTable = document.querySelector(selectors.PROPERTY_VALUES_TABLE);
        const ownerRows = partiesTable ? partiesTable.querySelectorAll("tbody tr").length : 0;
        const valueRows = valuesTable ? valuesTable.querySelectorAll("tbody tr").length : 0;
        
        const situsOk = situsAddress && situsAddress.textContent && situsAddress.textContent.trim().length > 0;
        return situsOk && partiesTable && valuesTable && ownerRows >= 2 && valueRows >= 2;
      },
      { timeout: 20000 },
      SELECTORS
    ).catch(() => {});
    
    await new Promise(r => setTimeout(r, 1000));

    const ownerNames = await extractOwnerName(page);
    const propertyInfo = await extractPropertyInfo(page);
    if (propertyInfo.situsAddress === "N/A") {
      return handleNotFound(propertyId, "No tax records found for this property ID.");
    }

    const assessmentData = await extractAssessmentData(page);

    // Check for installments first
    const installments = await parseInstallmentsTable(page);
    
    let delinquent = "NONE";
    let notes = "";
    let taxHistory = [];
    const PAYMENT_NOTE = "NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE 04/30 AND 10/31";

    if (installments.length > 0) {
      taxHistory = buildTaxHistoryFromInstallments(installments, assessmentData, propertyInfo);
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
          ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${PAYMENT_NOTE}`
          : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${PAYMENT_NOTE}`;
      } else {
        notes = `ALL PRIORS ARE PAID, ${PAYMENT_NOTE}`;
      }

      return buildSuccessResponse(ownerNames, propertyInfo, assessmentData, notes, delinquent, taxHistory);
      
    } else {
      const receipts = await parseReceiptsTable(page);
      
      if (receipts.length > 0) {
        const latestTaxYear = await getLatestReceiptTaxYear(page, receipts[0].receiptNo);
        
        delinquent = "NONE";
        if (Number.isFinite(latestTaxYear)) {
          notes = `ALL PRIORS ARE PAID, ${latestTaxYear} TAXES ARE PAID, ${PAYMENT_NOTE}`;
        } else {
          notes = `ALL PRIORS ARE PAID, ${PAYMENT_NOTE}`;
        }
        
        taxHistory = buildTaxHistoryFromReceipts(receipts, latestTaxYear, assessmentData, propertyInfo);
        return buildSuccessResponse(ownerNames, propertyInfo, assessmentData, notes, delinquent, taxHistory);
      } else {
        return buildSuccessResponse(ownerNames, propertyInfo, assessmentData, "NO TAX RECORDS FOUND", "NONE", []);
      }
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
// 18. EXPRESS HANDLER
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

export { search };
