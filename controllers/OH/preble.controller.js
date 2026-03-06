// AUTHOR: MANJUNADH
// Ohio County Tax Scraper (Preble)
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 120000 };  //Timeout for wait for selectors.

// Retry wrapper: retries failed async operations with exponential backoff (2 retries)
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

// Wait for selector to be visible AND its text to stabilize (no change for 500ms)

const waitForStableSelector = (page, selector, options = {}) =>
  withRetry(async () => {
    await page.waitForSelector(selector, { state: 'visible', ...options });
    const text = await page.$eval(selector, el => el.innerText.trim());
    await page.waitForFunction(
      (sel, prev) => document.querySelector(sel)?.innerText.trim() === prev,
      { timeout: 3000 },
      selector, text
    ).catch(() => {});
    return true;
  }, 1, 500);

// - counties: Configuration object
//   Includes URLs, CSS selectors, due dates.
const counties = {
  preble: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1125&LayerID=28338&PageTypeID=4&PageID=11807&Q=1833579548&KeyValue={{account}}",
    taxing_authority: "Preble County Auditor — 101 E. Main St., Eaton, OH 45320, Ph: (937) 456-8148",
    city: "Eaton",
    zip: "45320",
    ids: {
      ownerNameLbl: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch", //owner name id - label type ( beacon websites specific )
      ownerNameLnk: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch", //owner name id - link type  ( beacon websites specific )
      ownerAddr: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl02_pnlSingleValue", //Property Address
      valuationTable: "#ctlBodyPane_ctl12_ctl01_grdValuation_grdYearData",  //Table id for Total Taxable/Assessed values
      taxHistoryTable: "#ctlBodyPane_ctl17_ctl01_gvwTaxHistory",  //Table id for Tax history 
      paymentsTable: "#ctlBodyPane_ctl19_ctl01_grdPayments"  //Table id for Payment dates table
    },
    dueDates: { due1: "02/21", delq1: "02/22", due2: "07/18", delq2: "07/19" },
    dueNotes: "02/21 & 07/18"
  }
};

// ────────────────────────────── HELPERS ──────────────────────────────

// Format raw currency values to $XX.XX
const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const num = Math.max(0, parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Determine tax status: Due, Delinquent, or Paid
const determineStatus = (amountDue, dueDate, delqDate, currentDate) => {
  const cleanAmount = Math.max(0, parseFloat(amountDue?.toString().replace(/[^0-9.-]+/g, '')) || 0);
  if (cleanAmount <= 0) return "Paid";
  const due = new Date(dueDate);
  const delq = new Date(delqDate);
  if (isNaN(due) || isNaN(delq)) {
    console.warn(`[EDGE] Invalid date format: ${dueDate}, ${delqDate}`);
    return "Paid";
  }
  if (currentDate < delq) return "Due";
  return "Delinquent";
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

//Navigate to the county search page, dismiss any modals, input the parcel account, and submit the search.

const preble_1 = async (page, account, config) => {
  if (!account?.trim()) throw new Error("Parcel account is required"); // Validate input

  const url = config.detailUrl.replace("{{account}}", account);
  await withRetry(() => page.goto(url, { waitUntil: "networkidle0", timeout: 120000 }), 1);
 
  // Dismiss any modal popups (multiple possible selectors)
  const modalSelectors = [
    '.btn.btn-primary.button-1[data-dismiss="modal"]',
    '[data-dismiss="modal"]',
    '.modal .close',
  ];
  for (const sel of modalSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      await new Promise(res => setTimeout(res, 1000));
      break;
    } catch (e) {
      console.info(`[INFO] Modal selector ${sel} not found, skipping`);
    }
  }

  // Wait for owner name section
  const ownerSelector = `${config.ids.ownerNameLbl},${config.ids.ownerNameLnk}`;
  await waitForStableSelector(page, ownerSelector, timeout_option);
};

// ────────────────────────────── STEP 2: EXTRACT OVERVIEW ──────────────────────────────
// Extracts owner name, property address, assessed value, and initial tax year payments/due amounts.

const preble_2 = async (page, config) => {
// Extracts Owner Name
  const ownerName = await withRetry(() => page.evaluate((lbl, lnk) => {
    const l = document.querySelector(lbl);
    const k = document.querySelector(lnk);
    return (l?.innerText || k?.innerText || '').replace(/\s+/g, ' ').trim();
  }, config.ids.ownerNameLbl, config.ids.ownerNameLnk), 1).catch(() => 'N/A');
// Extracts Property Address
  let propertyAddress = await withRetry(() =>
    page.$eval(config.ids.ownerAddr, el => el?.innerText?.replace(/\s+/g, ' ').trim() || ''), 1
  ).catch(() => 'N/A');
  
// Extracts Tax Year
  let yearData = await withRetry(() => page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("table tbody tr")).find(r =>
      r.querySelector("span[id$='lblYearExpand']")?.textContent.includes("Payable")
    );
    if (!row) return null;
    const label = row.querySelector("span[id$='lblYearExpand']").textContent.trim();
    const match = label.match(/(\d{4})\s+Payable\s+(\d{4})/); // ( eg.2024 payable 2025 = 2024 Tax Year )
    if (!match) return null;
    return { year: match[1], payable: match[2], label };
  }), 1).catch(() => null);

  let taxYear, payable, label; //Fall back based on current date if tax year label is not present
  if (!yearData) {
    const now = new Date();
    const year = now.getFullYear();
    const p = now.getMonth() >= 6 ? year + 1 : year;
    taxYear = year.toString();
    payable = p.toString();
    label = `${year} Payable ${p}`;
    console.warn(`[EDGE] Tax year fallback to computed values`);
  } else {
    taxYear = yearData.year;
    payable = yearData.payable;
    label = yearData.label;
  }
// Extracts Total Assessed & Taxable Value
  let totalValue = 0;
  try {
    await waitForStableSelector(page, config.ids.valuationTable);
    totalValue = await page.$eval(config.ids.valuationTable, table => {
      for (let row of table.querySelectorAll('tr')) {
        const th = row.querySelector("th")?.textContent.trim();
        if (th === "Total Value (Assessed 35%)") {
          const td = row.querySelector("td.value-column");
          if (td) return Math.max(0, parseFloat(td.textContent.replace(/[^\d.]/g, "")) || 0);
        }
      }
      return 0;
    });
  } catch (e) {
    console.warn(`[EDGE] Valuation table not found or empty`);
  }

  return { owner_name: ownerName, property_address: propertyAddress || "N/A", total_value: totalValue, taxYear, payable, label };
};

// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────

//Loads tax history, extract current year installments, payment dates, statuses.
//conditionally scrape prior years based on years parameter

const preble_paid = async (page, overview, account, config, years = 1) => {
  const currentDate = new Date();
  const yearData = { year: overview.taxYear, payable: overview.payable, label: overview.label };
  const taxYearInt = parseInt(yearData.year);
  if (taxYearInt === 0) throw new Error("Invalid tax year");

  const due1 = `${config.dueDates.due1}/${yearData.payable}`;
  const delq1 = `${config.dueDates.delq1}/${yearData.payable}`;
  const due2 = `${config.dueDates.due2}/${yearData.payable}`;
  const delq2 = `${config.dueDates.delq2}/${yearData.payable}`;

  try {
    await waitForStableSelector(page, config.ids.taxHistoryTable, timeout_option);

    const result = await withRetry(() => page.evaluate((yearData, cfg, requestedYears) => {
      const txt = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent.trim() : "$0.00";
      };
      const parse = (s) => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
      const fmt = (n) => (n === 0 ? "$0.00" : `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      const curRow = Array.from(document.querySelectorAll("#ctlBodyPane_ctl17_ctl01_gvwTaxHistory tbody tr"))
        .find(r => r.querySelector("span[id$='lblYearExpand']")?.textContent === yearData.label);
      if (!curRow) return null;

      const exp = curRow.querySelector("a.expandCollapseIcon");
      if (exp && exp.getAttribute("aria-expanded") === "false") exp.click();

      let attempts = 0;
      while (attempts < 50) {
        const dt = document.querySelector("#ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail");
        if (dt && dt.style.display !== "none") break;
        attempts++;
        const s = Date.now(); while (Date.now() - s < 100) {}
      }

      const firstDue = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_FirstHalfBalanceLabel"));
      const secondDue = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_SecondHalfBalanceLabel"));
      const firstPaid = Math.abs(parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_FirstHalfCollectedLabel")));
      const secondPaid = Math.abs(parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_SecondHalfCollectedLabel")));
      const firstBal = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_FirstHalfBalanceLabel"));
      const secondBal = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_SecondHalfBalanceLabel"));
      const firstBase = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_FirstHalfNetGeneralsChargedLabel"));
      const secondBase = parse(txt("ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_SecondHalfNetGeneralsChargedLabel"));

      const now = new Date();
      const due1Obj = new Date(`${yearData.payable}-${cfg.dueDates.due1}`);
      const due2Obj = new Date(`${yearData.payable}-${cfg.dueDates.due2}`);
      const isFirstDue = now <= due1Obj;
      const isSecondDue = now <= due2Obj;

      const buildRow = (inst, due, delq, amountDue, amountPaid, balance, base, isDue) => {
        let status = "Paid";
        let amount_paid = fmt(amountPaid);
        let amount_due = "$0.00";
        let paid_date = "-";
        if (balance > 0) {
          amount_due = fmt(amountDue);
          amount_paid = "$0.00";
          status = isDue ? "Due" : "Delinquent";
        }
        return {
          jurisdiction: "County",
          year: yearData.year,
          payment_type: "Semi-Annual",
          installment: inst,
          status,
          base_amount: fmt(base),
          amount_paid,
          amount_due,
          mailing_date: "N/A",
          due_date: due,
          delq_date: delq,
          paid_date,
          good_through_date: "",
        };
      };

      const rows = [
        buildRow("1", `02/21/${yearData.payable}`, `02/22/${yearData.payable}`, firstDue, firstPaid, firstBal, firstBase, isFirstDue),
        buildRow("2", `07/18/${yearData.payable}`, `07/19/${yearData.payable}`, secondDue, secondPaid, secondBal, secondBase, isSecondDue),
      ];

      // Extract prior years based on years parameter (like Ashtabula)
      let priorRowsData = [];
      let allPayments = {};

      if (requestedYears > 1) {
        const allYearRows = Array.from(document.querySelectorAll("#ctlBodyPane_ctl17_ctl01_gvwTaxHistory tbody tr"))
          .filter(r => r.querySelector("span[id$='lblYearExpand']"));
        const curRowIndex = allYearRows.findIndex(r => r.querySelector("span[id$='lblYearExpand']")?.textContent.trim() === yearData.label);
        const priorRows = allYearRows.slice(curRowIndex + 1);

        // Extract up to (requestedYears - 1) prior years
        const yearsToExtract = Math.min(priorRows.length, requestedYears - 1);

        // Expand and extract 
        for (let rowIdx = 0; rowIdx < yearsToExtract; rowIdx++) {
          const priorRow = priorRows[rowIdx];
          const detailCtlNum = (3 + rowIdx).toString().padStart(2, '0');
          const detailPrefix = `ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl${detailCtlNum}_fvTaxHistory_Detail_`;
          const detailId = `ctlBodyPane_ctl17_ctl01_gvwTaxHistory_ctl${detailCtlNum}_fvTaxHistory_Detail`;
        
          // Expand the prior row
          const priorExp = priorRow.querySelector("a.expandCollapseIcon");
          if (priorExp && priorExp.getAttribute("aria-expanded") === "false") priorExp.click();

          attempts = 0;
          while (attempts < 50) {
            const priorDt = document.querySelector(`#${detailId}`);
            if (priorDt && priorDt.style.display !== "none") break;
            attempts++;
            const s = Date.now(); while (Date.now() - s < 100) {}
          }

          // Extract full details for this prior year
          const firstDuePrior = parse(txt(`${detailPrefix}FirstHalfBalanceLabel`));
          const secondDuePrior = parse(txt(`${detailPrefix}SecondHalfBalanceLabel`));
          const firstPaidPrior = Math.abs(parse(txt(`${detailPrefix}FirstHalfCollectedLabel`)));
          const secondPaidPrior = Math.abs(parse(txt(`${detailPrefix}SecondHalfCollectedLabel`)));
          const firstBalPrior = parse(txt(`${detailPrefix}FirstHalfBalanceLabel`));
          const secondBalPrior = parse(txt(`${detailPrefix}SecondHalfBalanceLabel`));
          const firstBasePrior = parse(txt(`${detailPrefix}FirstHalfNetGeneralsChargedLabel`));
          const secondBasePrior = parse(txt(`${detailPrefix}SecondHalfNetGeneralsChargedLabel`));

          // Get prior year from label
          const labelPrior = priorRow.querySelector("span[id$='lblYearExpand']").textContent.trim();
          const matchPrior = labelPrior.match(/(\d{4})/);
          if (!matchPrior) continue;
          const priorYear = matchPrior[1];

          // Build prior installment rows
          const priorRow1 = buildRow("1", `02/21/${priorYear}`, `02/22/${priorYear}`, firstDuePrior, firstPaidPrior, firstBalPrior, firstBasePrior, false);
          priorRow1.year = priorYear;
          priorRow1.status = firstBalPrior > 0 ? "Delinquent" : "Paid";
          const priorRow2 = buildRow("2", `07/18/${priorYear}`, `07/19/${priorYear}`, secondDuePrior, secondPaidPrior, secondBalPrior, secondBasePrior, false);
          priorRow2.year = priorYear;
          priorRow2.status = secondBalPrior > 0 ? "Delinquent" : "Paid";

          priorRowsData.push(priorRow1, priorRow2);
        }

        // Extract all payments after expansions
        try {
          const payRows = Array.from(document.querySelectorAll("#ctlBodyPane_ctl19_ctl01_grdPayments tbody tr"));
          payRows.forEach(r => {
            const yearTh = r.querySelector("th");
            const dateTd = r.querySelector("td");
            if (yearTh && dateTd) {
              let yearText = yearTh.textContent.trim();
              let payYear;
              if (yearText.includes("Payable")) {
                const match = yearText.match(/(\d{4})/g);
                payYear = match ? match[0] : null;
              } else {
                payYear = yearText.match(/(\d{4})/)?.[1];
              }
              if (payYear) {
                const [m, d, y] = dateTd.textContent.trim().split("/");
                if (m && d && y) {
                  const formatted = `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
                  if (!allPayments[payYear]) allPayments[payYear] = [];
                  allPayments[payYear].push(formatted);
                }
              }
            }
          });
        } catch (e) {
          console.log(e.message);
        }

        const updatePaidDate = (row) => {
          if (row.status === "Paid" && allPayments[row.year]) {
            const dates = allPayments[row.year].sort();
            if (row.installment === "1" && dates[0]) row.paid_date = dates[0];
            if (row.installment === "2" && dates.length > 1) row.paid_date = dates[1];
          }
        };
        rows.forEach(updatePaidDate);
        priorRowsData.forEach(updatePaidDate);
      } else {

        // Original payments extraction for current year only
        const payments = { "1": null, "2": null };
        try {
          const payRows = Array.from(document.querySelectorAll("#ctlBodyPane_ctl19_ctl01_grdPayments tbody tr"));
          payRows.forEach(r => {
            const yearTd = r.querySelector("th");
            const dateTd = r.querySelector("td");
            if (yearTd?.textContent.includes(yearData.label) && dateTd) {
              const [m, d, y] = dateTd.textContent.trim().split("/");
              const formatted = `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
              if (!payments["1"]) payments["1"] = formatted;
              else if (!payments["2"]) payments["2"] = formatted;
            }
          });
        } catch (e) {}
        rows.forEach(row => {
          if (row.status === "Paid") {
            const date = payments[row.installment];
            if (date) row.paid_date = date;
          }
        });
      }
      // Combine Tax History
      let allTaxHistory = rows;
      if (priorRowsData.length > 0) allTaxHistory = [...allTaxHistory, ...priorRowsData];
      return { rows: allTaxHistory };
    }, yearData, config, years), 1);

    if (!result || !result.rows || result.rows.length === 0) {
      return {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "", borrower_name: "", owner_name: overview.owner_name ? [overview.owner_name] : [],
        property_address: overview.property_address || "", parcel_number: account,
        land_value: "", improvements: "", total_assessed_value: formatCurrency(overview.total_value),
        exemption: "", total_taxable_value: formatCurrency(overview.total_value), taxing_authority: config.taxing_authority,
        notes: "ALL PRIORS ARE PAID, NO CURRENT TAX DATA", delinquent: "NONE",
        tax_history: []
      };
    }

    const taxHistory = result.rows;
    
    // Build notes dynamically for all years (like Ashtabula)
    const uniqueYears = [...new Set(taxHistory.map(item => item.year))].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Determine prior status from any year before current
    const currentYearInt = parseInt(yearData.year);
    const priorRows = taxHistory.filter(r => parseInt(r.year) < currentYearInt);
    const hasPriorDelq = priorRows.some(r => r.status === "Delinquent");
    
    let notes = hasPriorDelq ? "PRIOR YEARS ARE DELINQUENT." : "ALL PRIOR YEARS ARE PAID.";

    // Build status for each year
    uniqueYears.forEach(year => {
      const yearItems = taxHistory.filter(item => item.year === year);
      
      if (yearItems.length >= 2) {
        const firstStatus = yearItems[0].status.toUpperCase();
        const secondStatus = yearItems[1].status.toUpperCase();
        notes += ` ${year}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus},`;
      }
    });

    // Remove trailing comma and add final statement
    notes = notes.replace(/,$/, "");
    notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;

    // Determine delinquent status
    const currentRows = taxHistory.filter(r => r.year === yearData.year);
    const hasCurrentDue = currentRows.some(r => r.status === "Due");
    const hasCurrentDelq = currentRows.some(r => r.status === "Delinquent");

    let delin;
    if (hasPriorDelq) {
      delin = "PRIOR TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (hasCurrentDelq) {
      delin = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (hasCurrentDue) {
      delin = "TAXES ARE DUE";
    } else {
      delin = "NONE";
    }

    return {
      processed_date: new Date().toISOString().split("T")[0],
      order_number: "", borrower_name: "", owner_name: overview.owner_name ? [overview.owner_name] : [],
      property_address: overview.property_address || "", parcel_number: account,
      land_value: "", improvements: "", total_assessed_value: formatCurrency(overview.total_value),
      exemption: "", total_taxable_value: formatCurrency(overview.total_value), taxing_authority: config.taxing_authority,
      notes, delinquent: delin,
      tax_history: taxHistory
    };
  } catch (err) {
    console.error(`[ERROR] Tax history extraction failed:`, err.message);
    return {
      processed_date: new Date().toISOString().split("T")[0],
      order_number: "", borrower_name: "", owner_name: overview.owner_name ? [overview.owner_name] : [],
      property_address: overview.property_address || "", parcel_number: account,
      land_value: "", improvements: "", total_assessed_value: formatCurrency(overview.total_value),
      exemption: "", total_taxable_value: formatCurrency(overview.total_value), taxing_authority: config.taxing_authority,
      notes: "FAILED TO LOAD TAX HISTORY", delinquent: "NONE",
      tax_history: []
    };
  }
};

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county, years) => {
  const config = counties[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);
  await preble_1(page, account, config);
  const overview = await preble_2(page, config);
  return await preble_paid(page, overview, account, config, years);
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────
const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body || {};

    // Get years configuration from company settings (like other counties)
    const finalYears = getOHCompanyYears(client);

    // Validate account number
    if (!account?.trim()) {
      return res.status(400).json({
        error: true,
        message: "Please enter a valid account number",
      });
    }

    // Validate fetch_type
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      const errorResponse = {
        error: true,
        message: "Invalid Access. fetch_type must be 'html' or 'api'",
      };
      return fetch_type === "html"
        ? res.status(400).render("error_data", errorResponse)
        : res.status(400).json(errorResponse);
    }

    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    
    if (!counties[county]) {
      throw new Error(`Unsupported county: ${county}`);
    }

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await Promise.all([
      page.setViewport({ width: 1366, height: 768 }),
      page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    ]);
    page.setDefaultNavigationTimeout(timeout_option.timeout);
    
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ["stylesheet", "font", "image"];
      if (blocked.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, county, finalYears);
    
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
      try { await context.close(); } catch (e) { console.warn(`[WARN] Context close failed:`, e.message); }
    }
  }
};

module.exports = { search };