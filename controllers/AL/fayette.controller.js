//Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

/* ═══════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  BASE_URL: "https://www.alabamagis.com/Fayette/Frameset.cfm",
  AUTHORITY: "Fayette County Revenue Commissioner, Alabama",
  CURRENT_YEAR: new Date().getFullYear(),
  MAX_YEARS_BACK: 7,
  TIMEOUTS: {
    PAGE_LOAD: 60000,
    NAVIGATION: 40000,
    SELECTOR: 30000,
    SHORT: 15000,
  },
  SELECTORS: {
    SEARCH_FRAME: "frame[name='searchFrame']",
    PARCEL_INPUTS: [
      "input[name='Master__Map1']",
      "input[name='Master__Map2']",
      "input[name='Master__Map3']",
      "input[name='Master__Map4']",
      "input[name='Master__Map5']",
      "input[name='Master__Map6']",
      "input[name='Master__Map7']",
    ],
    SUBMIT_BTN: "input[name='submit'][value='Search']",
  },
  FIELD_LENGTHS: [2, 2, 2, 1, 3, 3, 3],
};

/* ═══════════════════════════════════════════════════════════════════════ */

class FayetteScraperError extends Error {
  constructor(message, code, retryable = false, context = {}) {
    super(message);
    this.name = "FayetteScraperError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
  }
}

class NoRecordsError extends FayetteScraperError {
  constructor(parcel) {
    super(`No records found for parcel ${parcel}`, "NO_RECORDS", false, { parcel });
  }
}

class ValidationError extends FayetteScraperError {
  constructor(message, field) {
    super(message, "VALIDATION", false, { field });
  }
}

const log = (level, parcel, step, msg = "") => {
  if (level === "info") return;
  const t = new Date().toISOString().split("T")[1].split(".")[0];
  console[level === "error" ? "error" : "warn"](
    `[${level.toUpperCase()}] ${t} [PARCEL:${parcel}] ${step} ${msg}`
  );
};

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Validates and formats parcel number to 16 digits
 * Input: "32 00 00 00 0 000 000.708" → Output: "0000000000000708"
 * Strips "32" prefix and decimal point
 */
const validateAndFormatParcel = (input) => {
  if (!input || typeof input !== "string") {
    throw new ValidationError("Parcel must be a non-empty string", "parcel");
  }

  let cleaned = input.trim().toUpperCase();

  if (cleaned.startsWith("32")) {
    cleaned = cleaned.substring(2).trim();
  }

  cleaned = cleaned.replace(/[\s\-\.]/g, "");
  const digits = cleaned.replace(/\D/g, "");

  if (digits.length === 0) {
    throw new ValidationError("No digits found in parcel number", "parcel");
  }

  const formatted = digits.padStart(16, "0").substring(0, 16);

  if (!/^\d{16}$/.test(formatted)) {
    throw new ValidationError("Invalid parcel format after processing", "parcel");
  }

  return formatted;
};

/**
 * Types parcel number into the 7 input fields
 * Field distribution: [2][2][2][1][3][3][3] = 16 digits
 */
const typeParcelNumber = async (frame, rawParcel) => {
  const formatted = validateAndFormatParcel(rawParcel);

  let position = 0;

  for (let i = 0; i < CONFIG.FIELD_LENGTHS.length; i++) {
    const fieldLength = CONFIG.FIELD_LENGTHS[i];
    const value = formatted.substring(position, position + fieldLength);
    const selector = CONFIG.SELECTORS.PARCEL_INPUTS[i];

    await frame.waitForSelector(selector, {
      visible: true,
      timeout: CONFIG.TIMEOUTS.SHORT,
    });

    await frame.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) input.value = "";
    }, selector);

    await frame.focus(selector);
    await frame.type(selector, value, { delay: 50 });
    await new Promise((r) => setTimeout(r, 150));

    position += fieldLength;
  }
};

/**
 * Gets the search frame from the frameset page
 */
const getSearchFrame = async (page) => {
  const handle = await page.waitForSelector(CONFIG.SELECTORS.SEARCH_FRAME, {
    timeout: CONFIG.TIMEOUTS.SELECTOR,
  });
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("searchFrame failed to load");
  await frame.waitForSelector(CONFIG.SELECTORS.PARCEL_INPUTS[0], {
    timeout: CONFIG.TIMEOUTS.SHORT,
  });
  return frame;
};

/**
 * Handles navigation after search submission
 * Site may go directly to detail page or show results table
 */
const navigateToDetailPage = async (frame) => {
  await new Promise((r) => setTimeout(r, 2000));

  const currentUrl = await frame.evaluate(() => window.location.href);

  if (currentUrl.includes("Detail.cfm") || currentUrl.includes("Detail.CFM")) {
    await new Promise((r) => setTimeout(r, 1000));
    return true;
  }

  const pageContent = await frame.content();

  if (!pageContent.includes("PARCEL SUMMARY") && !pageContent.includes("Detail.CFM")) {
    return false;
  }

  if (pageContent.includes("Detail.CFM") && pageContent.includes("info.gif")) {
    const clicked = await frame.evaluate(() => {
      const link = document.querySelector('a[href*="Detail.CFM"][target="searchFrame"]');
      if (!link) return false;

      const href = link.getAttribute("href");
      if (href) {
        window.location.href = href;
        return true;
      }
      return false;
    });

    if (!clicked) return false;

    await frame.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.NAVIGATION,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 2000));
    return true;
  }

  return false;
};

/**
 * Scrapes all relevant data from the detail page
 */
const scrapeDetails = async (frame) => {
  return await frame.evaluate(() => {
    const get = (label) => {
      const allCells = Array.from(document.querySelectorAll("td"));
      const row = allCells.find((td) => {
        const text = td.textContent || "";
        return text.includes(label);
      });
      if (!row) return "N/A";

      const nextCell = row.nextElementSibling;
      if (!nextCell) return "N/A";

      const boldEl = nextCell.querySelector("b");
      return boldEl ? boldEl.textContent.trim() : "N/A";
    };

    const allCells = Array.from(document.querySelectorAll("td"));
    const ownerCells = allCells.filter((td) => {
      const text = td.textContent || "";
      return text.trim() === "Name:";
    });

    const owners = ownerCells
      .map((cell) => {
        const nextCell = cell.nextElementSibling;
        if (!nextCell) return null;
        const boldEl = nextCell.querySelector("b");
        return boldEl ? boldEl.textContent.trim() : null;
      })
      .filter(Boolean);

    const propAddr = get("Prop Addr:");
    const cleanPropAddr = propAddr.replace(/\s+/g, " ").trim();
    const propertyAddress =
      cleanPropAddr === "N/A" || cleanPropAddr === "" || cleanPropAddr === "---"
        ? "No situs address"
        : cleanPropAddr;

    const addr1 = get("Address :");
    const addr2 = get("City, State, ZIP:");
    const ownerAddress = [addr1, addr2]
      .filter((a) => a && a !== "N/A" && a.trim() !== "")
      .join(", ");

    const taxText = get("Yrly Tax:");
    const taxMatch = taxText.match(/\$([\d,.]+)\s+for\s+(\d{4})/i);

    const payments = [];
    const tables = Array.from(document.querySelectorAll("table"));
    const paymentTable = tables.find((t) => {
      const text = t.textContent || "";
      return text.includes("Payment History");
    });

    if (paymentTable) {
      const rows = paymentTable.querySelectorAll("tr");
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].cells;
        if (cells && cells.length >= 3) {
          const yearText = cells[0].textContent.trim();
          const year = parseInt(yearText);
          const amountText = cells[2].textContent.replace(/[^\d.]/g, "");
          const amount = parseFloat(amountText) || 0;
          const date = cells[1].textContent.trim();

          if (year && !isNaN(year)) {
            payments.push({ year, amount, date });
          }
        }
      }
    }

    const landValue = get("Land Total:").replace(/[^\d.]/g, "");
    const buildingValue = get("Building Total:").replace(/[^\d.]/g, "");
    const totalValue = get("Appraised Value:").replace(/[^\d.]/g, "");

    return {
      owner: owners.length > 0 ? owners.join(" & ") : "N/A",
      ownerAddress: ownerAddress || "N/A",
      propertyAddress,
      parcelNumber: get("Parcel No:"),
      landValue: landValue || "0",
      buildingValue: buildingValue || "0",
      totalValue: totalValue || "0",
      currentTax: taxMatch ? parseFloat(taxMatch[1].replace(/,/g, "")) : 0,
      currentYear: taxMatch ? parseInt(taxMatch[2]) : new Date().getFullYear(),
      paymentHistory: payments,
    };
  });
};

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Main scraping orchestrator
 */
const getTaxData = async (page, rawParcel) => {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (
      url.includes("flagshipcloud.com") ||
      url.includes("mapserver") ||
      url.includes("mapguide") ||
      url.includes("ApplicationDefinition") ||
      req.resourceType() === "stylesheet" ||
      req.resourceType() === "font" ||
      req.resourceType() === "image" ||
      req.resourceType() === "media"
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(CONFIG.BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.TIMEOUTS.PAGE_LOAD,
  });

  const frame = await getSearchFrame(page);
  await typeParcelNumber(frame, rawParcel);
  await frame.click(CONFIG.SELECTORS.SUBMIT_BTN);

  await frame
    .waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.NAVIGATION,
    })
    .catch(() => {});

  const found = await navigateToDetailPage(frame);
  if (!found) throw new NoRecordsError(rawParcel);

  const details = await scrapeDetails(frame);

  const allHistory = [];
  for (let y = details.currentYear; y >= details.currentYear - CONFIG.MAX_YEARS_BACK; y--) {
    const paymentRecord = details.paymentHistory.find((p) => p.year === y);
    const paid = paymentRecord?.amount || 0;

    let base = 0;
    if (y === details.currentYear) {
      base = details.currentTax;
    } else if (paid > 0) {
      base = paid;
    }

    const due = Math.max(0, base - paid);
    const status = due > 0.5 ? "DUE" : "PAID";

    allHistory.push({
      jurisdiction: "County",
      year: y.toString(),
      status,
      payment_type: "Annual",
      half_designation: "Full Year",
      base_amount: formatCurrency(base),
      amount_paid: status === "PAID" ? formatCurrency(base) : formatCurrency(paid),
      amount_due: formatCurrency(due),
      paid_date: paymentRecord?.date || "",
      due_date: `10/01/${y}`,
      delq_date: `01/01/${y + 1}`,
      land_value: formatCurrency(details.landValue),
      improvements: formatCurrency(details.buildingValue),
      total_assessed_value: formatCurrency(details.totalValue),
      receipt_number: "N/A",
    });
  }

  const unpaidYears = allHistory.filter((r) => r.status === "DUE");
  const latestYear = allHistory[0];

  let history = [];

  if (unpaidYears.length === 0) {
    history = [latestYear];
  } else if (unpaidYears.length === 1 && unpaidYears[0].year === latestYear.year) {
    history = [latestYear];
  } else {
    history = unpaidYears;
  }

  const priorYearsUnpaid = unpaidYears.filter((r) => r.year !== latestYear.year);
  let notes = "";

  if (unpaidYears.length === 0) {
    notes = `ALL TAXES PAID INCLUDING ${latestYear.year}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 10/01`;
  } else if (priorYearsUnpaid.length > 0) {
    notes = `PRIOR YEARS DELINQUENT (${priorYearsUnpaid
      .map((r) => r.year)
      .join(", ")}). ${latestYear.year} TAXES ARE ${
      latestYear.status
    }. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 10/01`;
  } else {
    notes = `ALL PRIORS PAID, ${latestYear.year} TAXES ARE ${latestYear.status}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 10/01`;
  }

  const delinquent = unpaidYears.length > 0 ? "TAXES DUE OR DELINQUENT" : "NONE";

  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: details.owner.split(" & "),
    property_address: details.propertyAddress,
    owner_address: details.ownerAddress,
    parcel_number: details.parcelNumber,
    land_value: formatCurrency(details.landValue),
    improvements: formatCurrency(details.buildingValue),
    total_assessed_value: formatCurrency(details.totalValue),
    exemption: "$0.00",
    total_taxable_value: formatCurrency(details.totalValue),
    taxing_authority: CONFIG.AUTHORITY,
    notes,
    delinquent,
    tax_history: history.sort((a, b) => b.year - a.year),
  };
};

/**
 * Formats numeric values to currency strings
 */
const formatCurrency = (val) => {
  if (!val || val === "N/A") return "$0.00";
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ""));
  return isNaN(n)
    ? "$0.00"
    : `$${n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
};

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Express route handler
 */
const search = async (req, res) => {
  const { fetch_type = "api", account } = req.body || {};
  let browserContext = null;

  try {
    if (!["html", "api"].includes(fetch_type))
      throw new ValidationError("Invalid fetch_type", "fetch_type");

    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();

    const data = await getTaxData(page, account);

    fetch_type === "html"
      ? res.status(200).render("parcel_data_official", data)
      : res.status(200).json({ result: data });
  } catch (e) {
    const parcel = req.body?.account || "unknown";
    const isNo = e instanceof NoRecordsError;

    const payload = isNo
      ? {
          result: {
            processed_date: new Date().toISOString().split("T")[0],
            owner_name: ["No records found"],
            parcel_number: parcel,
            notes: "No parcel found",
            tax_history: [],
            taxing_authority: CONFIG.AUTHORITY,
          },
        }
      : { error: true, message: e.message || "Unknown error" };

    log("error", parcel, "API", e.message || "Exception");
    res.status(isNo ? 200 : 500).json(payload);
  } finally {
    if (browserContext) await browserContext.close().catch(() => {});
  }
};
module.exports = { search };
