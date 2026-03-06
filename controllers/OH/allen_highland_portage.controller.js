// AUTHOR: MANJUNADH

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 120000 };

// ────────────────────────────── UTILITIES ──────────────────────────────
const withRetry = async (operation, maxRetries = 2, baseDelay = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt > maxRetries) break;
      const delay = baseDelay * 2 ** (attempt - 1);
      console.warn(`[RETRY ${attempt}/${maxRetries}] ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error(`[FAIL] Operation failed after ${maxRetries} retries:`, lastError.message);
  throw lastError;
};

const waitForStableSelector = (page, selector, options = {}) =>
  withRetry(async () => {
    await page.waitForSelector(selector, { state: 'visible', ...options });
    const text = await page.$eval(selector, el => el.innerText.trim());
    await page.waitForFunction(
      (sel, prev) => document.querySelector(sel)?.innerText.trim() === prev,
      { timeout: 3000 },
      selector, text
    ).catch(() => { });
    return true;
  }, 1, 500);

const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const num = Math.max(0, parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const parseCurrency = (str) => {
  if (!str) return 0;
  return Math.max(0, parseFloat(str.toString().replace(/[^0-9.-]+/g, "")) || 0);
};

// ────────────────────────────── CONFIG ──────────────────────────────
const counties = {
  highland: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1116&LayerID=28103&PageTypeID=4&PageID=11529&KeyValue={{account}}",
    taxing_authority: "Highland County Auditor — 119 Governor Foraker Place, P.O. Box 822, Hillsboro, OH 45133, Ph: (937) 393-1915",
    ids: {
      ownerNameLbl: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
      ownerNameLnk: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
      ownerAddr: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_lblOwnerAddress",
      valuationTable: "#ctlBodyPane_ctl05_ctl01_grdValuation_grdYearData",
      valuationLabel: "Taxable Value",
      taxHistoryTable: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory",
      detailTotal: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl02_gvwTaxHistory_Detail_Total",
      paymentsSection: "#ctlBodyPane_ctl16_mSection",
      paymentsTable: "#ctlBodyPane_ctl16_ctl01_grdPayments"
    },
    dueDates: { due1: "03/01", delq1: "03/02", due2: "07/11", delq2: "07/12" },
    dueNotes: "03/01 & 07/12"
  },
  allen: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1178&LayerID=34847&PageTypeID=4&PageID=13177&KeyValue={{account}}",
    taxing_authority: "Allen County Auditor — 1000 Wardhill Ave, Lima, OH 45805, Ph: (419) 228-3700",
    ids: {
      ownerNameLbl: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
      ownerNameLnk: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
      ownerAddr: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_lblOwnerAddress",
      valuationTable: "#ctlBodyPane_ctl03_ctl01_grdValuation_grdYearData",
      valuationLabel: "Total Value (Assessed 35%)",
      taxHistoryTable: "#ctlBodyPane_ctl12_ctl01_gvwTaxHistory",
      detailTotal: "#ctlBodyPane_ctl12_ctl01_gvwTaxHistory_ctl03_gvwTaxHistory_Detail_Total",
      paymentsSection: "#ctlBodyPane_ctl16_mSection",
      paymentsTable: "#ctlBodyPane_ctl16_ctl01_grdPayments"
    },
    dueDates: { due1: "02/01", delq1: "02/02", due2: "07/02", delq2: "07/03" },
    dueNotes: "02/01 & 07/02"
  },
  portage: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1147&LayerID=30592&PageTypeID=4&PageID=12392&KeyValue={{account}}",
    taxing_authority: "Portage County Auditor — 449 S. Meridian St., 5th Floor, Ravenna, OH 44266, Ph: (330) 297-3561",
    ids: {
      ownerNameLbl: "#ctlBodyPane_ctl03_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
      ownerNameLnk: "#ctlBodyPane_ctl03_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
      ownerAddr: "#ctlBodyPane_ctl03_ctl01_rptOwner_ctl00_lblOwnerAddress",
      valuationTable: "#ctlBodyPane_ctl12_ctl01_grdValuation_grdYearData",
      valuationLabel: "Total Value (Assessed 35%)",
      taxHistoryTable: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory",
      detailTotal: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl03_gvwTaxHistory_Detail_Total",
      paymentsSection: "#ctlBodyPane_ctl16_mSection",
      paymentsTable: "#ctlBodyPane_ctl16_ctl01_grdPayments"
    },
    dueDates: { due1: "02/28", delq1: "03/01", due2: "07/15", delq2: "07/16" },
    dueNotes: "02/28 & 07/15"
  }
};

// ────────────────────────────── STEP 1: NAVIGATE ──────────────────────────────
const gc_1 = async (page, account, config) => {
  if (!account?.trim()) throw new Error("Parcel account is required");

  const url = config.detailUrl.replace("{{account}}", account.trim());
  await withRetry(() => page.goto(url, { waitUntil: "networkidle0", timeout: 120000 }), 2);

  // Dismiss modals
  const modalSelectors = ['[data-dismiss="modal"]', '.modal .close', '.btn[data-dismiss="modal"]'];
  for (const sel of modalSelectors) {
    try {
      await page.click(sel, { timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch { }
  }

  const ownerSelector = `${config.ids.ownerNameLbl}, ${config.ids.ownerNameLnk}`;
  await waitForStableSelector(page, ownerSelector, timeout_option);
};

// ────────────────────────────── STEP 2: BASIC EXTRACTION ──────────────────────────────
const extract_basic = async (page, account, config) => {
  const ownerName = await withRetry(() => page.evaluate((lbl, lnk) => {
    return (document.querySelector(lbl)?.innerText || document.querySelector(lnk)?.innerText || '')
      .replace(/\s+/g, ' ').trim();
  }, config.ids.ownerNameLbl, config.ids.ownerNameLnk)).catch(() => '');

  const propertyAddress = await withRetry(() =>
    page.$eval(config.ids.ownerAddr, el => el.innerText.replace(/\s+/g, ' ').trim())
  ).catch(() => '');

  let totalValue = 0;
  try {
    await waitForStableSelector(page, config.ids.valuationTable);
    totalValue = await page.$eval(config.ids.valuationTable, (table, label) => {
      for (const row of table.querySelectorAll('tr')) {
        if (row.textContent.includes(label)) {
          return Math.max(0, parseFloat(row.cells[1]?.textContent.replace(/[$,]/g, '')) || 0);
        }
      }
      return 0;
    }, config.ids.valuationLabel);
  } catch { }

  return {
    owner_name: ownerName,
    property_address: propertyAddress,
    total_value: totalValue,
    tax_history: [],
    notes: "",
    delinquent: "NONE"
  };
};

// ────────────────────────────── STEP 3: TAX HISTORY (with yearsRequested like Trumbull) ──────────────────────────────
const extract_tax_history = async (page, data, config, yearsRequested = 1) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentTaxYear = currentYear - 1; // e.g., 2025 taxes in Jan 2026

  // Get all available tax years from buttons
  const taxYears = await page.evaluate(() => {
    const years = [];
    document.querySelectorAll('[id^="btndiv"]').forEach(btn => {
      const id = btn.id;
      const match = id.match(/btndiv(\d{4})/);
      if (match) {
        years.push({ year: parseInt(match[1]), btnId: id });
      }
    });
    return years.sort((a, b) => b.year - a.year); // newest first
  });

  if (taxYears.length === 0) {
    data.notes = "NO TAX DATA AVAILABLE";
    return data;
  }

  const latestTaxYear = taxYears[0].year;
  const allHistory = [];
  const delinquentInstallments = [];

  // Payment dates map
  const paymentMap = await page.evaluate((targetYear) => {
    const formatCurrency = (val) => {
      if (!val) return "$0.00";
      const num = Math.max(0, parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0);
      return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const parseCurrency = (str) => {
      if (!str) return 0;
      return Math.max(0, parseFloat(str.toString().replace(/[^0-9.-]+/g, "")) || 0);
    };
    const map = {};
    const table = document.querySelector("#ctlBodyPane_ctl16_ctl01_grdPayments") ||
      document.querySelector("#ctlBodyPane_ctl19_ctl01_grdPayments");
    if (!table) return map;
    const rows = table.querySelectorAll("tbody tr");
    for (const row of rows) {
      const cells = row.cells;
      if (cells.length < 4) continue;
      const yearText = cells[0]?.textContent.trim();
      if (yearText.includes(targetYear)) {
        const date = cells[1]?.textContent.trim();
        const amt1 = cells[3]?.textContent.trim();
        const amt2 = cells[4]?.textContent.trim();
        if (!map[targetYear]) map[targetYear] = {};
        if (parseCurrency(amt1) > 0) map[targetYear].first = date;
        if (parseCurrency(amt2) > 0) map[targetYear].second = date;
      }
    }
    return map;
  }, currentTaxYear);

  for (const { year, btnId } of taxYears) {
    try {
      await page.click(`#${btnId}`);
      await page.waitForTimeout(800);
    } catch { }

    const ctlOffset = taxYears.findIndex(y => y.year === year) + 2;
    const ctlNum = String(ctlOffset).padStart(2, '0');
    const detailSelector = `${config.ids.taxHistoryTable}_ctl${ctlNum}_gvwTaxHistory_Detail_Total`;

    let netOwed = 0, netDue = 0;
    try {
      await waitForStableSelector(page, detailSelector);
      const details = await page.$eval(detailSelector, table => {
        let owed = 0, due = 0;
        for (const row of table.querySelectorAll('tr')) {
          const text = row.textContent;
          const val = parseFloat(row.cells[1]?.textContent.replace(/[$,]/g, '') || '0') || 0;
          if (text.includes('Net Owed')) owed = val;
          if (text.includes('Net Due')) due = val;
        }
        return { owed, due };
      });
      netOwed = details.owed;
      netDue = details.due;
    } catch { }

    const halfOwed = netOwed / 2;
    const halfDue = netDue / 2;

    const payYear = year + 1;
    const due1Date = new Date(`${config.dueDates.due1}/${payYear}`);
    const delq1Date = new Date(`${config.dueDates.delq1}/${payYear}`);
    const due2Date = new Date(`${config.dueDates.due2}/${payYear}`);
    const delq2Date = new Date(`${config.dueDates.delq2}/${payYear}`);

    const status1 = halfDue > 0.01 ? (currentDate >= delq1Date ? "Delinquent" : "Due") : "Paid";
    const status2 = halfDue > 0.01 ? (currentDate >= delq2Date ? "Delinquent" : "Due") : "Paid";

    const paidDate1 = status1 === "Paid" ? "N/A" : "-";
    const paidDate2 = status2 === "Paid" ? "N/A" : "-";

    const inst1 = {
      jurisdiction: "County", year: year.toString(), payment_type: "Semi-Annual", installment: "1",
      status: status1, base_amount: formatCurrency(halfOwed), amount_paid: status1 === "Paid" ? formatCurrency(halfOwed) : "$0.00",
      amount_due: formatCurrency(halfDue), due_date: `${config.dueDates.due1}/${payYear}`, delq_date: `${config.dueDates.delq1}/${payYear}`,
      paid_date: paidDate1, mailing_date: "N/A", good_through_date: ""
    };

    const inst2 = {
      jurisdiction: "County", year: year.toString(), payment_type: "Semi-Annual", installment: "2",
      status: status2, base_amount: formatCurrency(halfOwed), amount_paid: status2 === "Paid" ? formatCurrency(halfOwed) : "$0.00",
      amount_due: formatCurrency(halfDue), due_date: `${config.dueDates.due2}/${payYear}`, delq_date: `${config.dueDates.delq2}/${payYear}`,
      paid_date: paidDate2, mailing_date: "N/A", good_through_date: ""
    };

    allHistory.push(inst1, inst2);
    if (status1 === "Delinquent") delinquentInstallments.push(inst1);
    if (status2 === "Delinquent") delinquentInstallments.push(inst2);
  }

  // Keep latest N years
  const latestYears = taxYears.slice(0, yearsRequested).map(y => y.year);
  let finalHistory = allHistory.filter(h => latestYears.includes(parseInt(h.year)));

  // Add back any delinquent from older years
  for (const del of delinquentInstallments) {
    if (!finalHistory.find(h => h.year === del.year && h.installment === del.installment)) {
      finalHistory.push(del);
    }
  }

  // Sort: oldest to newest
  finalHistory.sort((a, b) => {
    if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
    return a.installment === "1" ? -1 : 1;
  });

  data.tax_history = finalHistory;

  // Notes - same style as Trumbull
  const priorDelq = allHistory.some(h => parseInt(h.year) < latestTaxYear && h.status === "Delinquent");
  const currentInsts = finalHistory.filter(h => parseInt(h.year) === latestTaxYear);
  const first = currentInsts.find(i => i.installment === "1") || { status: "Paid" };
  const second = currentInsts.find(i => i.installment === "2") || { status: "Paid" };

  data.notes = [
    priorDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID",
    `${latestTaxYear} TAXES: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`,
    `NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`
  ].join(", ");

  data.delinquent = delinquentInstallments.length > 0
    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
    : "NONE";

  return data;
};

// ────────────────────────────── MAIN FLOW ──────────────────────────────
const account_search = async (page, account, county, yearsRequested) => {
  const config = counties[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);

  await gc_1(page, account, config);
  let data = await extract_basic(page, account, config);
  data = await extract_tax_history(page, data, config, yearsRequested);

  return {
    processed_date: new Date().toISOString(),
    order_number: "",
    borrower_name: "", // Will be set in controller
    owner_name: data.owner_name ? [data.owner_name] : [],
    property_address: data.property_address,
    parcel_number: account,
    land_value: "",
    improvements: "",
    total_assessed_value: formatCurrency(data.total_value),
    exemption: "",
    total_taxable_value: formatCurrency(data.total_value),
    taxing_authority: config.taxing_authority,
    notes: data.notes,
    delinquent: data.delinquent,
    tax_history: data.tax_history
  };
};

const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body || {};
    if (!account?.trim()) {
      console.error(`[EDGE] Missing or empty account in request body`);
      throw new Error("Account is required");
    }
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      console.error(`[EDGE] Invalid fetch_type: ${fetch_type}`);
      throw new Error("Invalid fetch_type");
    }
    const yearsRequested = getOHCompanyYears(client);
    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    if (!counties[county]) {
      console.error(`[EDGE] County not supported: ${county}`);
      throw new Error(`Unsupported county: ${county}`);
    }

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = [];
      if (blocked.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, county, yearsRequested);
    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", { ...data, tax_history: data.tax_history });
    } else {
      res.status(200).json({ result: data });
    }
  } catch (error) {
    console.error(`[ERROR] Scrape failed:`, error.message);
    const fetchType = req.body?.fetch_type || "api";
    if (fetchType === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (e) {
        console.warn(`[WARN] Failed to close browser context:`, e.message);
      }
    }
  }
};

module.exports = { search };