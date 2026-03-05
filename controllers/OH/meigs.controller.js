// AUTHOR: MANJUNADH 

// Ohio Tax Scraper for ( Meigs County )


import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";
const timeout_option = { timeout: 120000 };

// ────────────────────────────── UTILITIES ──────────────────────────────

// Retry wrapper: retries failed async operations with exponential backoff
const withRetry = (operation, maxRetries = 2, baseDelay = 1000) => {
  let lastError;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      operation()
        .then(resolve)
        .catch((error) => {
          lastError = error;
          if (maxRetries-- <= 0) {
            console.error(`[FAIL] Operation failed after ${maxRetries + 1} retries:`, lastError.message);
            return reject(lastError);
          }
          const delay = baseDelay * 2 ** (2 - maxRetries - 1);
          console.warn(`[RETRY ${2 - maxRetries}/${2}] ${error.message}. Retrying in ${delay}ms...`);
          setTimeout(attempt, delay);
        });
    };
    attempt();
  });
};

// Wait for selector to be visible AND its text to stabilize (no change for 500ms)
const waitForStableSelector = (page, selector, options = {}) =>
  withRetry(() => new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector(selector, { state: 'visible', ...options });
      const text = await page.$eval(selector, el => el.innerText.trim());
      await page.waitForFunction(
        (sel, prev) => document.querySelector(sel)?.innerText.trim() === prev,
        { timeout: 3000 },
        selector, text
      ).catch(() => { });
      resolve(true);
    } catch (err) { reject(err); }
  }), 1, 500);

// - counties: Configuration object mapping county names to scraper-specific settings.
//             Includes URLs, contact info, selectors, due dates, and notes.
//             Expandable for additional counties.

const COUNTIES = {
  meigs: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1117&LayerID=28104&PageTypeID=4&PageID=11533&Q=820463428&KeyValue={{account}}",
    taxing_authority: "Meigs County Auditor — 100 E Second Street, Room 201, Pomeroy, OH 45769, Ph: (740) 992-2698",
    city: "Pomeroy",
    zip: "45769",
    ids: {
      parcelInput: "#ctlBodyPane_ctl02_ctl01_txtParcelID",
      searchBtn: "#ctlBodyPane_ctl02_ctl01_btnSearch",
      ownerNameLbl: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
      ownerNameLnk: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
      ownerAddr: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_lblOwnerAddress",
      valuationTable: "#ctlBodyPane_ctl13_ctl01_grdValuation_grdYearData",
      valuationLabel: "Total Value (Assessed 35%)",
      taxHistoryTable: "#ctlBodyPane_ctl16_ctl01_gvwTaxHistory",
      detailTotal: "#ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail",
      paymentsSection: "#ctlBodyPane_ctl18_mSection",
      paymentsTable: "#ctlBodyPane_ctl18_ctl01_grdPayments"
    },
    dueDates: { due1: "03/07", delq1: "03/08", due2: "08/08", delq2: "08/09" },
    dueNotes: "03/07 & 08/08"
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
    return "Paid"; // Fallback to safe state
  }
  if (currentDate < delq) return "Due";
  return "Delinquent"; // Past due = Delinquent
};

// Builds enhanced notes summarizing current and prior year tax statuses, including payment frequency and due dates.
const buildEnhancedNotes = (firstStatus, secondStatus, priorYearStatus, taxYear, dueDates) => {
  const hasDelinquent = [firstStatus, secondStatus].includes("Delinquent");
  const hasDue = [firstStatus, secondStatus].includes("Due");
  const currentStatusText = hasDelinquent ? "DELINQUENT" : hasDue ? "DUE" : "PAID";
  const overallCurrentStatus = [firstStatus, secondStatus].includes("Paid") ? "PAID" : "UNPAID";

  if (overallCurrentStatus === "PAID") {
    return `ALL PRIORS ARE ${priorYearStatus}, ${taxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
  }
  if (priorYearStatus === "PAID") {
    return `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${currentStatusText}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
  }
  return `PRIORS ARE DELINQUENT, ${taxYear} TAXES ARE ${currentStatusText}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

//Navigate to the county search page, dismiss any modals, input the parcel account, and submit the search.

const meigs_1 = async (page, account, config) => {
  // Validate input
  if (!account?.trim()) {
    console.error(`[EDGE] Empty/invalid account: "${account}"`);
    throw new Error("Parcel account is required");
  }

  const url = config.detailUrl.replace("{{account}}", account);

  // Navigate to county detail page
  await withRetry(() => page.goto(url, { waitUntil: "networkidle0", timeout: 120000 }), 1);

  // Dismiss any modal popups (multiple possible selectors)
  const modalSelectors = [
    '.btn.btn-primary.button-1[data-dismiss="modal"]',
    '[data-dismiss="modal"]',
    '.modal .close'
  ];
  for (const sel of modalSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel);
      await waitForStableSelector(page, sel);
      break;
    } catch (e) {
      console.info(`[INFO] Modal selector ${sel} not found, skipping`);
    }
  }
  // Extra disclaimer - only for meigs county
  try {
    await page.waitForSelector(`text/Close`, { visible: true, timeout: 5000 });
    await page.click(`text/Close`);

  } catch (e) {
    console.log(`[INFO] Extra Close button not found`);
  }

  // Wait for owner section
  const ownerSelector = `${config.ids.ownerNameLbl},${config.ids.ownerNameLnk}`;
  await waitForStableSelector(page, ownerSelector, timeout_option);


  const yearData = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("table tbody tr")).find(r =>
      r.querySelector("span[id$='lblYearExpand']")?.textContent.includes("Payable")
    );
    if (!row) return null;
    const label = row.querySelector("span[id$='lblYearExpand']").textContent.trim();
    const match = label.match(/(\d{4})\s+Payable\s+(\d{4})/);
    if (!match) return null;
    return { year: match[1], payable: match[2], label };
  });

  if (!yearData) {
    const now = new Date();
    const year = now.getFullYear();
    const payable = now.getMonth() >= 6 ? year + 1 : year;
    return { year: year.toString(), payable: payable.toString(), label: `${year} Payable ${payable}` };
  }

  return yearData;
};

// ────────────────────────────── STEP 2: EXTRACT OVERVIEW ──────────────────────────────

//Extract base property overview data after search submission.
// Includes owner name, property address, assessed value, and initial tax year payments/due amounts.

const meigs_2 = async (page, account, config) => {

  // Extract owner name (fallback between label and link)
  const ownerName = await withRetry(() => page.evaluate((lbl, lnk) => {
    const l = document.querySelector(lbl);
    const k = document.querySelector(lnk);
    return (l?.innerText || k?.innerText || '').replace(/\s+/g, ' ').trim();
  }, config.ids.ownerNameLbl, config.ids.ownerNameLnk), 1).catch(() => {
    console.warn(`[EDGE] Owner name selectors failed`);
    return '';
  });

  // Extract property address
  let propertyAddress = await withRetry(() =>
    page.$eval(config.ids.ownerAddr, el => el?.innerText?.replace(/\s+/g, ' ').trim() || ''), 1
  ).catch(() => '');
  propertyAddress = propertyAddress.replace(/,?\s*COLUMBUS,?\s*/gi, "").trim();
  if (propertyAddress && !/OH\s+45769/i.test(propertyAddress)) {
    propertyAddress = `${propertyAddress}, ${config.city}, OH ${config.zip}`;
  }

  // Extract total assessed value
  let totalValue = 0;
  try {
    await waitForStableSelector(page, config.ids.valuationTable);
    totalValue = await page.$eval(config.ids.valuationTable, (table, label) => {
      for (let row of table.querySelectorAll('tr')) {
        if (row.textContent.includes(label)) {
          return Math.max(0, parseFloat(row.cells[1]?.textContent.replace(/[$,]/g, '')) || 0);
        }
      }
      return 0;
    }, config.ids.valuationLabel);
  } catch (e) { console.warn(`[EDGE] Valuation table not found`); }

  return {
    owner_name: ownerName ? [ownerName] : [],
    property_address: propertyAddress || "N/A",
    total_value: totalValue
  };
};

// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────

//Load detailed tax history, extract current year installments, payment dates, statuses.
//conditionally scrape prior years if current balance due > 0.
// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────
const meigs_paid = async (page, overview, account, config, yearData, yearLimit = 1) => {
  const currentDate = new Date();
  const taxYearInt = parseInt(yearData.year);
  const nextYear = yearData.payable;
  const priorYearEntries = [];

  const due1 = `${config.dueDates.due1}/${nextYear}`;
  const delq1 = `${config.dueDates.delq1}/${nextYear}`;
  const due2 = `${config.dueDates.due2}/${nextYear}`;
  const delq2 = `${config.dueDates.delq2}/${nextYear}`;

  // Extract current year details
  let firstNetOwed = 0, secondNetOwed = 0, totalNetDue = 0;
  let firstNetPaid = 0, secondNetPaid = 0;
  try {
    await waitForStableSelector(page, config.ids.detailTotal);
    const details = await page.$eval(config.ids.detailTotal, table => {
      const labels = {};
      table.querySelectorAll('span').forEach(span => {
        const id = span.id;
        const text = span.textContent.trim();
        if (id && text) labels[id] = text;
      });
      return labels;
    });
    const parse = (key) => Math.max(0, parseFloat(details[key]?.replace(/[^0-9.-]+/g, '') || '0'));
    firstNetOwed = parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_FirstHalfNetGeneralsChargedLabel");
    secondNetOwed = parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_SecondHalfNetGeneralsChargedLabel");
    firstNetPaid = Math.abs(parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_FirstHalfCollectedLabel"));
    secondNetPaid = Math.abs(parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_SecondHalfCollectedLabel"));
    const firstBal = parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_FirstHalfBalanceLabel");
    const secondBal = parse("ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl02_fvTaxHistory_Detail_SecondHalfBalanceLabel");
    totalNetDue = firstBal + secondBal;
  } catch (e) {
    console.warn(`[EDGE] Current year detail parsing failed:`, e.message);
  }

  const firstInstallmentStatus = determineStatus(totalNetDue > 0 && firstNetPaid === 0 ? totalNetDue / 2 : 0, due1, delq1, currentDate);
  const secondInstallmentStatus = determineStatus(totalNetDue > 0 && secondNetPaid === 0 ? totalNetDue / 2 : 0, due2, delq2, currentDate);

  // ─────── EXTRACT ALL PAYMENT DATES FROM PAYMENTS TABLE ───────
  let allPaymentDates = [];
  const paymentSection = await page.$(config.ids.paymentsSection).catch(() => null);
  if (paymentSection) {
    try {
      await waitForStableSelector(page, config.ids.paymentsTable);
      allPaymentDates = await page.$$eval(config.ids.paymentsTable + ' tr', rows => {
        const dates = [];
        for (let row of rows) {
          const yearTd = row.querySelector('th');
          const dateTd = row.cells[1];
          if (yearTd && dateTd) {
            const yearText = yearTd.textContent.trim();
            const rawDate = dateTd.textContent.trim();
            if (rawDate && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(rawDate)) {
              const [m, d, y] = rawDate.split('/');
              dates.push({
                yearLabel: yearText,
                formatted: `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y.length === 2 ? '20' + y : y}`
              });
            }
          }
        }
        return dates;
      });
    } catch (e) {
      console.warn(`[EDGE] Payments table parsing failed:`, e.message);
    }
  }

  // Map payments by year label
  const paymentsByYear = {};
  allPaymentDates.forEach(p => {
    if (!paymentsByYear[p.yearLabel]) paymentsByYear[p.yearLabel] = [];
    paymentsByYear[p.yearLabel].push(p.formatted);
  });

  // Get current year payments (newest first)
  let paidDate1 = "-", paidDate2 = "-";
  const currentPayments = paymentsByYear[yearData.label] || [];
  if (currentPayments.length >= 2) {
    paidDate2 = currentPayments[0];
    paidDate1 = currentPayments[1];
  } else if (currentPayments.length === 1) {
    paidDate2 = secondNetPaid > 0 ? currentPayments[0] : "-";
    paidDate1 = firstNetPaid > 0 ? currentPayments[0] : "-";
  }

  // ─────── SCRAPE PRIOR YEARS BASED ON yearLimit ───────
  let priorYearStatus = "PAID";
  const tablePrefix = config.ids.taxHistoryTable;
  const detailPart = config.ids.detailTotal.replace(new RegExp(`^${tablePrefix}`), '');
  const currentCtlStr = detailPart.match(/ctl(\d{2})_/)?.[1] || '02';
  let currentCtl = parseInt(currentCtlStr);

  const numPriorYearsToScrape = yearLimit >= 2 ? 1 : 0; // Only support up to current + 1 prior

  for (let offset = 1; offset <= numPriorYearsToScrape; offset++) {
    const py = taxYearInt - offset;
    const priorCtlNum = currentCtl + offset;
    const priorCtlStr = priorCtlNum.toString().padStart(2, '0');
    const priorDetailSelector = `${tablePrefix}_ctl${priorCtlStr}_fvTaxHistory_Detail`;
    const priorBtnId = `btndiv${py}`;
    const priorYearLabel = `${py} Payable ${py + 1}`;

    const btn = await page.$(`#${priorBtnId}`).catch(() => null);
    if (!btn) {
      console.info(`[INFO] No button found for prior year ${py}, stopping.`);
      break;
    }

    try {
      await page.click(`#${priorBtnId}`);
      await waitForStableSelector(page, priorDetailSelector);

      const priorLabels = await page.$eval(priorDetailSelector, table => {
        const labels = {};
        table.querySelectorAll('span').forEach(span => {
          const id = span.id;
          const text = span.textContent.trim();
          if (id && text) labels[id] = text;
        });
        return labels;
      });

      const parse = (key) => Math.max(0, parseFloat(priorLabels[key]?.replace(/[^0-9.-]+/g, '') || '0'));

      const priorFirstNetOwed = parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_FirstHalfNetGeneralsChargedLabel`);
      const priorSecondNetOwed = parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_SecondHalfNetGeneralsChargedLabel`);
      const priorFirstPaid = Math.abs(parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_FirstHalfCollectedLabel`));
      const priorSecondPaid = Math.abs(parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_SecondHalfCollectedLabel`));
      const priorFirstDue = parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_FirstHalfBalanceLabel`);
      const priorSecondDue = parse(`ctlBodyPane_ctl16_ctl01_gvwTaxHistory_ctl${priorCtlStr}_fvTaxHistory_Detail_SecondHalfBalanceLabel`);

      if (priorFirstDue > 0 || priorSecondDue > 0) priorYearStatus = "DELINQUENT";

      const priorNextYear = py + 1;
      const priorDue1 = `${config.dueDates.due1}/${priorNextYear}`;
      const priorDelq1 = `${config.dueDates.delq1}/${priorNextYear}`;
      const priorDue2 = `${config.dueDates.due2}/${priorNextYear}`;
      const priorDelq2 = `${config.dueDates.delq2}/${priorNextYear}`;

      const priorPayments = paymentsByYear[priorYearLabel] || [];
      let priorPaidDate1 = "-", priorPaidDate2 = "-";
      if (priorPayments.length >= 2) {
        priorPaidDate2 = priorPayments[0];
        priorPaidDate1 = priorPayments[1];
      } else if (priorPayments.length === 1) {
        priorPaidDate2 = priorSecondPaid > 0 ? priorPayments[0] : "-";
        priorPaidDate1 = priorFirstPaid > 0 ? priorPayments[0] : "-";
      }

      priorYearEntries.push({
        jurisdiction: "County", year: py.toString(), payment_type: "Semi-Annual", installment: "1",
        status: priorFirstDue > 0 ? "Delinquent" : "Paid",
        base_amount: formatCurrency(priorFirstNetOwed),
        amount_paid: formatCurrency(priorFirstPaid),
        amount_due: formatCurrency(priorFirstDue),
        mailing_date: "N/A", due_date: priorDue1, delq_date: priorDelq1,
        paid_date: priorFirstPaid > 0 ? priorPaidDate1 : "-",
        good_through_date: ""
      });

      priorYearEntries.push({
        jurisdiction: "County", year: py.toString(), payment_type: "Semi-Annual", installment: "2",
        status: priorSecondDue > 0 ? "Delinquent" : "Paid",
        base_amount: formatCurrency(priorSecondNetOwed),
        amount_paid: formatCurrency(priorSecondPaid),
        amount_due: formatCurrency(priorSecondDue),
        mailing_date: "N/A", due_date: priorDue2, delq_date: priorDelq2,
        paid_date: priorSecondPaid > 0 ? priorPaidDate2 : "-",
        good_through_date: ""
      });

    } catch (e) {
      console.warn(`[EDGE] Failed to scrape prior year ${py}:`, e.message);
      break; // Stop if one fails
    }
  }

  const notes = buildEnhancedNotes(firstInstallmentStatus, secondInstallmentStatus, priorYearStatus, yearData.year, config.dueNotes);
  const isDelinquent = [firstInstallmentStatus, secondInstallmentStatus].includes("Delinquent") || priorYearStatus === "DELINQUENT";

  const taxHistory = [
    ...priorYearEntries,
    {
      jurisdiction: "County", year: yearData.year, payment_type: "Semi-Annual", installment: "1", status: firstInstallmentStatus,
      base_amount: formatCurrency(firstNetOwed), amount_paid: formatCurrency(firstNetPaid),
      amount_due: formatCurrency(totalNetDue > 0 && firstNetPaid === 0 ? totalNetDue / 2 : 0),
      mailing_date: "N/A", due_date: due1, delq_date: delq1,
      paid_date: firstNetPaid > 0 ? paidDate1 : "-",
      good_through_date: ""
    },
    {
      jurisdiction: "County", year: yearData.year, payment_type: "Semi-Annual", installment: "2", status: secondInstallmentStatus,
      base_amount: formatCurrency(secondNetOwed), amount_paid: formatCurrency(secondNetPaid),
      amount_due: formatCurrency(totalNetDue > 0 && secondNetPaid === 0 ? totalNetDue / 2 : 0),
      mailing_date: "N/A", due_date: due2, delq_date: delq2,
      paid_date: secondNetPaid > 0 ? paidDate2 : "-",
      good_through_date: ""
    }
  ];

  const priorityStatuses = ["Delinquent", "Due"];
  const hasPriority = taxHistory.some(row => priorityStatuses.includes(row.status));
  const filteredTaxHistory = hasPriority 
    ? taxHistory.filter(row => priorityStatuses.includes(row.status))
    : taxHistory.filter(row => row.status === "Paid");

  return {
    processed_date: new Date().toISOString(),
    order_number: "", borrower_name: "", owner_name: overview.owner_name,
    property_address: overview.property_address, parcel_number: account,
    land_value: "", improvements: "", total_assessed_value: formatCurrency(overview.total_value),
    exemption: "", total_taxable_value: formatCurrency(overview.total_value),
    taxing_authority: config.taxing_authority,
    notes,
    delinquent: isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    tax_history: filteredTaxHistory
  };
};

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county, yearLimit = 1) => {
  const config = COUNTIES[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);
  const yearData = await meigs_1(page, account, config);
  const overview = await meigs_2(page, account, config);
  return await meigs_paid(page, overview, account, config, yearData, yearLimit);
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────

const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account,client } = req.body || {};
    if (!account?.trim()) throw new Error("Account is required");
    if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");

    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    const config = COUNTIES[county];
    if (!config) throw new Error(`Unsupported county: ${county}`);
const yearLimit = getOHCompanyYears(client);
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ['image', 'font'];
      if (blocked.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, county,yearLimit);
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

export { search };