// AUTHOR: MANJUNADH
//UPDATED CODE

// Ohio County Tax Scraper (Adams & Knox)

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 120000 };

// ────────────────────────────── UTILITIES ──────────────────────────────

// Retry wrapper: retries failed async operations with exponential backoff
const withRetry = async (operation, maxRetries = 2, baseDelay = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt > maxRetries) break;
      const delay = baseDelay * 2 ** (attempt - 1);
      console.warn(
        `[RETRY ${attempt}/${maxRetries}] ${error.message}. Retrying in ${delay}ms...`
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  console.error(
    `[FAIL] Operation failed after ${maxRetries} retries:`,
    lastError.message
  );
  throw lastError;
};

// Wait for selector to be visible AND its text to stabilize (no change for 500ms)
const waitForStableSelector = (page, selector, options = {}) =>
  withRetry(
    async () => {
      await page.waitForSelector(selector, { state: "visible", ...options });
      const text = await page.$eval(selector, (el) => el.innerText.trim());
      await page
        .waitForFunction(
          (sel, prev) => document.querySelector(sel)?.innerText.trim() === prev,
          { timeout: 3000 },
          selector,
          text
        )
        .catch(() => {});
      return true;
    },
    1,
    500
  );

// - counties: Configuration object mapping county names to scraper-specific settings.
//             Includes URLs, contact info, selectors, due dates, and notes.
//             Expandable for additional counties.

const counties = {
adams: {
  detailUrl:
    "https://beacon.schneidercorp.com/Application.aspx?AppID=1135&LayerID=28756&PageTypeID=4&PageID=11962&Q=963843174&KeyValue={{account}}",
  taxing_authority:
    "Adams County Auditor — 138 W. Main St., West Union, OH 45693, Ph: (937) 544-2611",
  city: "West Union",
  zip: "45693",
  ids: {
    parcelInput: "#ctlBodyPane_ctl02_ctl01_txtParcelID",
    searchBtn: "#ctlBodyPane_ctl02_ctl01_btnSearch",
    ownerNameLbl:
      "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
    ownerNameLnk:
      "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
    ownerAddr:
      "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl01_lblOwnerAddress",
    valuationTable:
      "#ctlBodyPane_ctl03_ctl01_grdValuation_grdYearData",
    taxHistoryTable:
      "#ctlBodyPane_ctl14_ctl01_grdTaxHistory",
    paymentsSection:
      "#ctlBodyPane_ctl16_mSection",
    paymentsTable:
      "#ctlBodyPane_ctl16_ctl01_grdPayments",
  },

  dueDates: {
    due1: "02/14",
    delq1: "02/15",
    due2: "07/03",
    delq2: "07/04"
  },
  dueNotes: "02/14 & 07/04",
},

knox: {
  detailUrl:
    "https://beacon.schneidercorp.com/Application.aspx?AppID=1124&LayerID=28285&PageTypeID=4&PageID=11642&Q=811560522&KeyValue={{account}}",
  taxing_authority:
    "Knox County Auditor — 117 E. High Street, Suite 120, Mount Vernon, OH 43050, Ph: (740) 393-6750",
  city: "Mount Vernon",
  zip: "43050",
  ids: {
    parcelInput: "#ctlBodyPane_ctl03_ctl01_txtParcelID",
    searchBtn: "#ctlBodyPane_ctl03_ctl01_btnSearch",
    ownerNameLbl:
      "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
    ownerNameLnk:
      "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
    ownerAddr: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_lblOwnerAddress",
    valuationTable: "#ctlBodyPane_ctl05_ctl01_grdValuation_grdYearData",
    taxHistoryTable: "#ctlBodyPane_ctl16_ctl01_grdTaxHistory",
    detailTotal: "#ctlBodyPane_ctl16_ctl01_grdTaxHistoryTotals",
    paymentsSection: "#ctlBodyPane_ctl18_mSection",
    paymentsTable: "#ctlBodyPane_ctl18_ctl01_grdPayments",
  },
  dueDates: { due1: "02/21", delq1: "02/22", due2: "07/11", delq2: "07/12" },
  dueNotes: "02/21 & 07/11",
},

};

// ────────────────────────────── HELPERS ──────────────────────────────
const latestDate = (dates = []) =>
  dates.length
    ? new Date(Math.max(...dates.map(d => d.getTime())))
        .toLocaleDateString("en-US")
    : "-";

// Format raw currency values to $XX.XX
const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const num = Math.max(
    0,
    parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0
  );
  return `$${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Determine tax status: Due, Delinquent, or Paid
const determineStatus = (amountDue, dueDate, delqDate, currentDate) => {
  const cleanAmount = Math.max(
    0,
    parseFloat(amountDue?.toString().replace(/[^0-9.-]+/g, "")) || 0
  );
  if (cleanAmount <= 0) return "Paid";
  const due = new Date(dueDate);
  const delq = new Date(delqDate);
  if (isNaN(due) || isNaN(delq)) {
    console.warn(`[EDGE] Invalid date format: ${dueDate}, ${delqDate}`);
    return "Paid"; // Fallback to safe state
  }
  if (currentDate < due) return "Due";
  return "Delinquent"; // Past due = Delinquent
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

//Navigate to the county search page, dismiss any modals, input the parcel account, and submit the search.

const gc_1 = async (page, account, config) => {
  // Validate input
  if (!account?.trim()) {
    console.error(`[EDGE] Empty/invalid account: "${account}"`);
    throw new Error("Parcel account is required");
  }

  const url = config.detailUrl.replace("{{account}}", account);

  // Navigate to county detail page
  await withRetry(
    () => page.goto(url, { waitUntil: "networkidle0", timeout: 120000 }),
    1
  );

  // Dismiss any modal popups (multiple possible selectors)
  const modalSelectors = [
    '.btn.btn-primary.button-1[data-dismiss="modal"]',
    '[data-dismiss="modal"]',
    ".modal .close",
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

  // Wait for owner section
  const ownerSelector = `${config.ids.ownerNameLbl},${config.ids.ownerNameLnk}`;
  await waitForStableSelector(page, ownerSelector, timeout_option);
};

// ────────────────────────────── STEP 2: EXTRACT OVERVIEW ──────────────────────────────

//Extract base property overview data after search submission.
// Includes owner name, property address, assessed value, and initial tax year payments/due amounts.

const gc_2 = async (page, config) => {
  const currentYear = new Date().getFullYear();
  const taxYear = currentYear - 1;

  // Extract owner name (fallback between label and link)
  const ownerName = await withRetry(
    () =>
      page.evaluate(
        (lbl, lnk) => {
          const l = document.querySelector(lbl);
          const k = document.querySelector(lnk);
          return (l?.innerText || k?.innerText || "")
            .replace(/\s+/g, " ")
            .trim();
        },
        config.ids.ownerNameLbl,
        config.ids.ownerNameLnk
      ),
    1
  ).catch(() => {
    console.warn(`[EDGE] Owner name selectors failed`);
    return "";
  });

  // Extract property address
  const propertyAddress = await withRetry(
    () =>
      page.$eval(
        config.ids.ownerAddr,
        (el) => el?.innerText?.replace(/\s+/g, " ").trim() || ""
      ),
    1
  ).catch(() => {
    console.warn(`[EDGE] Property address missing`);
    return "";
  });

  // Extract total assessed value
  let totalValue = 0;
  try {
    await waitForStableSelector(page, config.ids.valuationTable);
    totalValue = await page.$eval(config.ids.valuationTable, (table) => {
      for (let row of table.querySelectorAll("tr")) {
        if (row.textContent.includes("Total Value (Assessed 35%)")) {
          return Math.max(
            0,
            parseFloat(row.cells[1]?.textContent.replace(/[$,]/g, "")) || 0
          );
        }
      }
      return 0;
    });
  } catch (e) {
    console.warn(`[EDGE] Valuation table not found or empty`);
  }

  // Extract current year tax payments and due amounts
  let firstPaid = 0,
    secondPaid = 0,
    firstDue = 0,
    secondDue = 0;
  try {
    const btnId = `btndiv${taxYear}`;
    await waitForStableSelector(page, `#${btnId}`);
    const rowData = await page.$eval(
      config.ids.taxHistoryTable,
      (table, id) => {
        const row = [...table.querySelectorAll("tr")].find((r) =>
          r.querySelector(`#${id}`)
        );
        if (!row || row.cells.length < 6) return null;
        return {
          firstPaid: row.cells[3]?.textContent.trim(),
          secondPaid: row.cells[4]?.textContent.trim(),
          due: row.cells[5]?.textContent.trim(),
        };
      },
      btnId
    );
    if (rowData) {
      firstPaid = Math.max(
        0,
        parseFloat(rowData.firstPaid.replace(/[$,]/g, "")) || 0
      );
      secondPaid = Math.max(
        0,
        parseFloat(rowData.secondPaid.replace(/[$,]/g, "")) || 0
      );
      const totalDue = Math.max(
        0,
        parseFloat(rowData.due.replace(/[$,]/g, "")) || 0
      );
      if (totalDue > 0) {
        firstDue = firstPaid === 0 ? totalDue / 2 : 0;
        secondDue = secondPaid === 0 ? totalDue / 2 : 0;
      }
    }
  } catch (e) {
    console.warn(`[EDGE] Tax history row for ${taxYear} not found`);
  }

  return {
    owner_name: ownerName,
    property_address: propertyAddress,
    total_value: totalValue,
    firstPaid,
    secondPaid,
    firstDue,
    secondDue,
    taxYear: taxYear.toString(),
  };
};

// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────

//Load detailed tax history, extract current year installments, payment dates, statuses.
//conditionally scrape prior years based on years parameter
// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────

const gc_paid = async (page, overview, account, config, yearsWanted = 1) => {
  const today = new Date();

  const parseMoney = (v) =>
    parseFloat((v || "0").replace(/[$,]/g, "")) || 0;

  const parseDate = (mmddyyyy) => {
    const [mm, dd, yyyy] = mmddyyyy.split("/");
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
  };

  const determineStatus = (dueAmt, dueDateStr) => {
    if (dueAmt <= 0) return "Paid";
    return today > parseDate(dueDateStr) ? "Delinquent" : "Due";
  };

  // ────────────────────────────── PAYMENTS (SOURCE OF TRUTH) ──────────────────────────────
  const payments = await page.$$eval(
    `${config.ids.paymentsTable} tbody tr`,
    rows =>
      rows.map(r => {
        const c = r.cells;
        if (c.length < 6) return null;

        const yearMatch = c[0].innerText.match(/^(\d{4})/);
        if (!yearMatch) return null;

        return {
          year: yearMatch[1],
          paidDate: c[1].innerText.trim(),
          first: parseFloat(c[4].innerText.replace(/[$,]/g, "")) || 0,
          second: parseFloat(c[5].innerText.replace(/[$,]/g, "")) || 0,
        };
      }).filter(Boolean)
  );

const paidByYear = {};
payments.forEach(p => {
  if (!paidByYear[p.year]) {
    paidByYear[p.year] = {
      first: 0,
      second: 0,
      firstDates: [],
      secondDates: []
    };
  }

  if (p.first > 0 && p.paidDate && p.paidDate !== "-") {
    paidByYear[p.year].first += p.first;
    paidByYear[p.year].firstDates.push(parseDate(p.paidDate));
  }

  if (p.second > 0 && p.paidDate && p.paidDate !== "-") {
    paidByYear[p.year].second += p.second;
    paidByYear[p.year].secondDates.push(parseDate(p.paidDate));
  }
});


  // ────────────────────────────── TAX HISTORY (BALANCE DUE) ──────────────────────────────
  const taxRows = await page.$$eval(
    `${config.ids.taxHistoryTable} tbody tr`,
    rows =>
      rows.map(r => {
        const c = r.cells;
        return {
          yearText: c[0]?.innerText.trim(),
          desc: c[3]?.innerText.toLowerCase(),
          balance: c[c.length - 1]?.innerText.trim()
        };
      })
  );

  const yearMap = {};
  taxRows.forEach(r => {
    const ym = r.yearText?.match(/^(\d{4})/);
    if (!ym) return;

    const year = ym[1];
    if (!yearMap[year]) yearMap[year] = { first: 0, second: 0 };

    const bal = parseMoney(r.balance);

    if (r.desc.includes("1st")) yearMap[year].first += bal;
    if (r.desc.includes("2nd")) yearMap[year].second += bal;
  });

  // ────────────────────────────── BUILD TAX HISTORY ──────────────────────────────
  const tax_history = [];
  const years = Object.keys(yearMap).sort((a, b) => b - a).slice(0, yearsWanted);

  years.forEach(y => {
    const paid = paidByYear[y] || { first: 0, second: 0, dates: new Set() };
    const bal = yearMap[y];

    const due1 = `${config.dueDates.due1}/${Number(y) + 1}`;
    const due2 = `${config.dueDates.due2}/${Number(y) + 1}`;

    tax_history.push(
      {
        jurisdiction: "County",
        year: y,
        payment_type: "Semi-Annual",
        installment: "1",
        status: determineStatus(bal.first, due1),
        base_amount: formatCurrency(bal.first + paid.first),
        amount_paid: formatCurrency(paid.first),
        amount_due: formatCurrency(bal.first),
        mailing_date: "N/A",
        due_date: due1,
        delq_date: `${config.dueDates.delq1}/${Number(y) + 1}`,
        paid_date: paid.first > 0 ? latestDate(paid.firstDates) : "-",

        good_through_date: ""
      },
      {
        jurisdiction: "County",
        year: y,
        payment_type: "Semi-Annual",
        installment: "2",
        status: determineStatus(bal.second, due2),
        base_amount: formatCurrency(bal.second + paid.second),
        amount_paid: formatCurrency(paid.second),
        amount_due: formatCurrency(bal.second),
        mailing_date: "N/A",
        due_date: due2,
        delq_date: `${config.dueDates.delq2}/${Number(y) + 1}`,
        paid_date: paid.second > 0 ? latestDate(paid.secondDates) : "-",

        good_through_date: ""
      }
    );
  });

  // ────────────────────────────── FLAGS & NOTES ──────────────────────────────
  const hasDelinquent = tax_history.some(t => t.status === "Delinquent");

  const notes =
    tax_history
      .map(t => `${t.year}: ${t.installment}${t.installment === "1" ? "ST" : "ND"} INSTALLMENT IS ${t.status.toUpperCase()}`)
      .join(", ") +
    ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;

  return {
    processed_date: today.toISOString().split("T")[0],
    order_number: "",
    borrower_name: "",
    owner_name: overview.owner_name ? [overview.owner_name] : [],
    property_address: overview.property_address || "",
    parcel_number: account,
    land_value: "",
    improvements: "",
    total_assessed_value: formatCurrency(overview.total_value || 0),
    exemption: "",
    total_taxable_value: formatCurrency(overview.total_value || 0),
    taxing_authority: config.taxing_authority,
    notes,
    delinquent: hasDelinquent
      ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
      : "NONE",
    tax_history
  };
};



// Helper function (ensure it's defined in your codebase)

// Helper (make sure this exists in your codebase)




// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────

const account_search = async (page, account, county, years) => {
  const config = counties[county];
  if (!config) {
    console.error(`[EDGE] Unsupported county: ${county}`);
    throw new Error(`Unsupported county: ${county}`);
  }
  await gc_1(page, account, config);
  const overview = await gc_2(page, config);
  return await gc_paid(page, overview, account, config, years);
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
      console.error(`[EDGE] Missing or empty account in request body`);
      return res.status(400).json({
        error: true,
        message: "Please enter a valid account number",
      });
    }

    // Validate fetch_type
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      console.error(`[EDGE] Invalid fetch_type: ${fetch_type}`);
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
      console.error(`[EDGE] County not supported: ${county}`);
      throw new Error(`Unsupported county: ${county}`);
    }

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(timeout_option.timeout);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ["stylesheet", "font", "image"];
      if (blocked.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, county, finalYears);

    if (fetch_type === "html") {
      res
        .status(200)
        .render("parcel_data_official", {
          ...data,
          tax_history: data.tax_history,
        });
    } else {
      res.status(200).json({ result: data });
    }
  } catch (error) {
    console.error(`[ERROR] Scrape failed:`, error.message);
    const fetchType = req.body?.fetch_type || "api";
    if (fetchType === "html") {
      res
        .status(200)
        .render("error_data", { error: true, message: error.message });
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