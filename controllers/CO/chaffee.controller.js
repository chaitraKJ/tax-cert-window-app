// AUTHOR: MANJUNADH
// Colorado Tax Scraper for ( Chaffee, cheyenne, custer, sedgwick, Yuma County )

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const timeout_option = { timeout: 90000 }; //Timeout for wait for selectors

const COUNTIES = {
  chaffee: {
    url: "https://co118.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    taxing_authority: "Chaffee County Treasurer - 104 Crestone Ave, Salida, CO 81201, PH: (719) 539-6808",
    city: "Salida",
    zip: "81201",
    dueDates: { due1: "02/28", delq1: "03/01", due2: "06/15", delq2: "06/16" },
    dueNotes: "02/28 & 06/15"
  },
  cheyenne: {
    url: "https://co1347.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    taxing_authority: "Cheyenne County Treasurer - 51 S 1st St E, Cheyenne Wells, CO 80810, Ph: (719) 767-5658",
    city: "Cheyenne Wells",
    zip: "80810",
    dueDates: { due1: "02/28", delq1: "03/01", due2: "06/15", delq2: "06/16" },
    dueNotes: "02/28 & 06/15"
  },
  custer: {
    url: "https://co1467.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    taxing_authority: "Custer County Treasurer - PO Box 209, Westcliffe, CO 81252, Ph: (719) 783-2341",
    city: "Westcliffe",
    zip: "81252",
    dueDates: { due1: "02/28", delq1: "03/01", due2: "06/15", delq2: "06/16" },
    dueNotes: "02/28 & 06/15"
  },
  sedgwick: {
    url: "https://co1245.cichosting.com/CTASWebportal/parcelSearch.aspx",
    taxing_authority: "Sedgwick County Treasurer - 315 Cedar St Suite 210, Julesburg, CO 80737, Ph: (970) 474-3473",
    city: "Julesburg",
    zip: "80737",
    dueDates: { due1: "02/28", delq1: "03/01", due2: "06/15", delq2: "06/16" },
    dueNotes: "02/28 & 06/15"
  },
  yuma: {
    url: "https://co1232.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    taxing_authority: "Yuma County Treasurer - 310 Ash Street, Suite C, Wray, CO 80758, Ph: (970) 332-4965",
    city: "Wray",
    zip: "80758",
    dueDates: { due1: "04/30", delq1: "05/01", due2: "06/15", delq2: "06/16" },
    dueNotes: "04/30 & 06/15"
  },
  washington: {
    url: "https://co313.cichosting.com/CTASWebPortal/parcelSearch.aspx",
    taxing_authority: "Washington County Treasurer - 150 Ash Ave, PO Box 218, Akron, CO 80720, PH: (970) 345-6601",
    city: "Akron",
    zip: "80720",
    dueDates: { due1: "02/28", delq1: "03/01", due2: "06/16", delq2: "06/17" },
    dueNotes: "02/28 & 06/15"
  }
};


// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────
const chaffee_1 = async (page, account, config) => {
  try {

    if (!account?.trim()) throw new Error("Parcel account is required"); // Account Validation
    const parcel = account.trim().toUpperCase();
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout_option }); // Navigation
    await page.waitForSelector("#MainContent_txtParcelNumber", { state: "visible", timeout_option });
    await page.type("#MainContent_txtParcelNumber", parcel); // Parcel input
    await Promise.all([
      page.click("#MainContent_btnSearch2"), // Search btn
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout_option })
    ]);

    // Parcel info Preview Page
    const selectPropertyBtn = "input[value='Select Property' i]";
    await page.waitForSelector(selectPropertyBtn, { state: "Visible", timeout_option });

    await Promise.all([
      page.click(selectPropertyBtn),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout_option })
    ]);

    return { parcel };

  } catch (error) {

    console.error(`[CHAFFEE_1 ERROR] parcel "${account}" : ${error.message}`);
    return { parcel: account?.trim() || "UNKNOWN", error: true };

  }
}

// ────────────────────────────── STEP 2: EXTRACT OVERVIEW  ──────────────────────────────
const chaffee_2 = async (page, config) => {
  try {
    // Click Parcel Overview from sidebar
    const parcelOverviewLink = "a[href='parcelOverview.aspx']";
    await page.waitForSelector(parcelOverviewLink, { state: "visible", timeout_option });
    await Promise.all([
      page.click(parcelOverviewLink),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout_option })
    ]);

    // Extract Owner Name
    let ownerName = "N/A";
    try {
      const raw = await page.$eval("#MainContent_gvPropertyOwner td", el => el.innerText.trim());
      ownerName = raw.replace(/\s+/g, " ").trim();
      if (!ownerName) ownerName = "N/A";
    } catch {
      ownerName = "N/A";
    }

    // Extract Property Address
    let propertyAddress = "N/A";
    try {
      propertyAddress = await page.$eval(
        "#MainContent_txtParcelAddress",
        el => (el.value || el.innerText || "").trim()
      );
      if (!propertyAddress) propertyAddress = "N/A";
    } catch {
      propertyAddress = "N/A";
    }


    // Click Taxes link in sidebar
    const taxesLink = "a[href='taxInformation.aspx']";
    await page.waitForSelector(taxesLink, { state: "visible", timeout_option });
    await Promise.all([
      page.click(taxesLink),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout_option })
    ]);
    // Extract Tax Year
    let taxYear = "N/A";
    try {
      taxYear = await page.$eval(
        "#MainContent_ddlTaxYear",
        el => el.innerText.trim() || el.textContent.trim()
      );
      if (!taxYear || taxYear === "N/A") throw new Error("empty");
    } catch {
      // Fallback: current year minus 1 (since taxes are for previous year)
      const currentYear = new Date().getFullYear();
      taxYear = (currentYear - 1).toString();
    }

    // Return clean data
    return {
      owner_name: ownerName !== "N/A" ? [ownerName] : [],
      property_address: propertyAddress,
      tax_year: taxYear,
      total_assessed_value: "N/A",
      total_taxable_value: "N/A"
    };

  } catch (error) {
    console.error(`[CHAFFEE_2 ERROR] Navigation or extraction failed → ${error.message}`);

    // Never break the entire scrape — always return safe object
    return {
      owner_name: [],
      property_address: "N/A",
      tax_year: (new Date().getFullYear() - 1).toString(),
      total_assessed_value: "N/A",
      total_taxable_value: "N/A"
    };
  }
};
const today = new Date();

const parseMoney = (str) =>
  parseFloat((str || "0").replace(/[^0-9.-]/g, "")) || 0;

const getStatusByDate = (amountDue, dueDateStr) => {
  if (parseMoney(amountDue) <= 0) return "Paid";

  const [mm, dd, yyyy] = dueDateStr.split("/").map(Number);
  const dueDate = new Date(yyyy, mm - 1, dd, 23, 59, 59);

  return today > dueDate ? "Delinquent" : "Due";
};

// ────────────────────────────── STEP 3: DETAILED TAX & PRIOR YEARS ──────────────────────────────
const chaffee_paid = async (page, overview, account, config) => {
  try {
    const parcel = account.trim().toUpperCase();
    const taxYear = overview.tax_year !== "N/A" ? overview.tax_year : (new Date().getFullYear() - 1).toString();
    const nextYear = (parseInt(taxYear) + 1).toString();
    const firstDueDate = `${config.dueDates.due1}/${nextYear}`;
    const firstDelqDate = `${config.dueDates.delq1}/${nextYear}`;

    const secondDueDate = `${config.dueDates.due2}/${nextYear}`;
    const secondDelqDate = `${config.dueDates.delq2}/${nextYear}`;


    // Safe text extractor
    const getText = async (selector) => {
      try { return await page.$eval(selector, el => el.innerText.trim()) || "0.00"; }
      catch { return "0.00"; }
    };

    // Current installment values
    const base1 = await getText("#MainContent_Label15");   // 1st Half Base
    const paid1 = await getText("#MainContent_Label201");  // 1st Half Paid
    const due1 = await getText("#MainContent_Label203");  // 1st Half Due
    const date1 = await getText("#MainContent_Label17");   // 1st Paid Date

    const base2 = await getText("#MainContent_Label25");   // 2nd Half Base
    const paid2 = await getText("#MainContent_Label301");  // 2nd Half Paid
    const due2 = await getText("#MainContent_Label303");  // 2nd Half Due
    const date2 = await getText("#MainContent_Label27");   // 2nd Paid Date

    // Parse amounts safely
    const parseAmt = (str) => parseFloat((str || "0").replace(/[^0-9.-]/g, "")) || 0;
    const due1Amt = parseAmt(due1);
    const due2Amt = parseAmt(due2);

    // Status per installment
    const firstStatus = getStatusByDate(due1, firstDueDate);
    const secondStatus = getStatusByDate(due2, secondDueDate);


    // Prior Year Delinquency Check (using Payment History table)
    let priorYearStatus = "PAID";
    try {
      const prevYear = (parseInt(taxYear) - 1).toString();
      const paidYearsData = await page.$$eval(
        "#MainContent_gvTaxHistory tbody tr",
        rows => rows.map(row => {
          const cells = row.querySelectorAll("td");
          // Column positions in Chaffee's history table
          const year = cells[0].innerText.trim();  // Prior Tax Year
          const totalPaid1st = cells[5].innerText.trim();  // 1st Half "Total Paid"
          const totalPaid2nd = cells[12].innerText.trim(); // 2nd Half "Total Paid"

          const amt1 = parseFloat(totalPaid1st.replace(/[^0-9.-]/g, "")) || 0;
          const amt2 = parseFloat(totalPaid2nd.replace(/[^0-9.-]/g, "")) || 0;

          return {
            year,
            totalPaid: amt1 + amt2   // real total amount paid for that year
          };
        })
      );

      const prevYearEntry = paidYearsData.find(e => e.year === prevYear);

      if (!prevYearEntry || prevYearEntry.totalPaid <= 0) {
        priorYearStatus = "DELINQUENT";
      }

    } catch (err) {
      // Table error or missing → safe: mark DATA NOT FOUND only if not brand new
      priorYearStatus = "DATA NOT FOUND";
    }

    // Build notes
    // const currentUnpaid = due1Amt > 0 || due2Amt > 0;
    const currentDelinquent =
      firstStatus === "Delinquent" || secondStatus === "Delinquent";

    const currentUnpaid =
      firstStatus === "Due" || secondStatus === "Due" || currentDelinquent;

    const currentYearStatus = currentDelinquent
      ? "DELINQUENT"
      : currentUnpaid
        ? "DUE"
        : "PAID";

    const hasDelinquent =
      priorYearStatus === "DELINQUENT" || currentDelinquent;

    let notes = "";
    if (priorYearStatus === "DELINQUENT") {
      notes = `PRIORS ARE DELINQUENT, ${taxYear} TAXES ARE ${currentYearStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
    } else {
      notes = `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${currentYearStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;
    }


    // Final Tax History
    const taxHistory = [
      {
        jurisdiction: "County",
        year: taxYear,
        payment_type: "Semi-Annual",
        installment: "1",
        status: firstStatus,
        base_amount: base1,
        amount_paid: paid1,
        amount_due: due1,
        mailing_date: "N/A",
        due_date: firstDueDate,
        delq_date: firstDelqDate,

        paid_date: parseAmt(paid1) > 0 ? date1 : "-",
        good_through_date: ""
      },
      {
        jurisdiction: "County",
        year: taxYear,
        payment_type: "Semi-Annual",
        installment: "2",
        status: secondStatus,
        base_amount: base2,
        amount_paid: paid2,
        amount_due: due2,
        mailing_date: "N/A",
        due_date: secondDueDate,
        delq_date: secondDelqDate,

        paid_date: parseAmt(paid2) > 0 ? date2 : "-",
        good_through_date: ""
      }
    ];

    return {
      processed_date: new Date().toISOString(),
      order_number: "",
      borrower_name: "",
      owner_name: overview.owner_name,
      property_address: overview.property_address,
      parcel_number: parcel,
      land_value: "",
      improvements: "",
      total_assessed_value: "N/A",
      exemption: "",
      total_taxable_value: "N/A",
      taxing_authority: config.taxing_authority,
      notes,
      delinquent: hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
      tax_history: taxHistory
    };

  } catch (error) {
    console.error(`[CHAFFEE_PAID ERROR] Parcel ${account} → ${error.message}`);
    return {
      processed_date: new Date().toISOString(),
      order_number: "",
      borrower_name: "",
      owner_name: overview.owner_name || [],
      property_address: overview.property_address || "N/A",
      parcel_number: account?.trim() || "UNKNOWN",
      land_value: "",
      improvements: "",
      total_assessed_value: "N/A",
      exemption: "",
      total_taxable_value: "N/A",
      taxing_authority: config.taxing_authority,
      notes: "ERROR DURING TAX SCRAPING — MANUAL REVIEW REQUIRED",
      delinquent: "UNKNOWN",
      tax_history: []
    };
  }
};
// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county) => {
  const config = COUNTIES[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);
  const yearData = await chaffee_1(page, account, config);
  const overview = await chaffee_2(page, account, config);
  return await chaffee_paid(page, overview, account, config, yearData);
};
// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────
const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account } = req.body || {};
    if (!account?.trim()) throw new Error("Account is required");
    if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");
    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    const config = COUNTIES[county];
    if (!config) throw new Error(`Unsupported county: ${county}`);
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
    const data = await account_search(page, account, county);
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