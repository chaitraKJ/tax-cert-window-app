// Author: Manjunadh 
// Ohio State Tax Scraper (Wood County)
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 };

// ----------------------- Config -----------------------
const counties = {
  wood: {
    detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1146&LayerID=30489&PageTypeID=4&PageID=12352&Q=80341899&KeyValue={{account}}",
    taxing_authority: "Wood County Auditor — One Courthouse Square, Bowling Green, OH 43402, Ph: (419) 354-9150",
    city: "Bowling Green",
    zip: "43402",
    ids: {
      ownerNameLbl: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
      ownerNameLnk: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch",
      ownerAddr: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_lblOwnerAddress",
      valuationTable: "#ctlBodyPane_ctl04_ctl01_grdValuation_grdYearData",
      taxHistoryTable: "#ctlBodyPane_ctl04_ctl01_grdTableViewer",
      paymentsTable: "#ctlBodyPane_ctl03_ctl01_grdTableViewer"
    },
    dueDates: { due1: "02/14", delq1: "02/15", due2: "07/11", delq2: "07/12" },
    dueNotes: "02/14 & 07/11"
  }
};

// Helper functions
const formatDollar = (value) => {
  if (!value || value === "") return "$0.00";
  const num = parseFloat(value.toString().replace(/[$ ,()]/g, ""));
  return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const parseDollar = (str) => {
  if (!str) return 0;
  return parseFloat(str.toString().replace(/[$ ,()]/g, "")) || 0;
};

// Navigation, dismiss any modals, input the parcel account, and submit the search.
const wood_1 = async (page, account, config) => {
  if (!account?.trim()) throw new Error("Parcel account is required");

  const url = config.detailUrl.replace("{{account}}", account);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

  // Dismiss any disclaimer popups
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
    } catch (error) {}
  }

  // Wait for owner name section
  const ownerSelector = `${config.ids.ownerNameLbl},${config.ids.ownerNameLnk}`;
  await page.waitForSelector(ownerSelector, timeout_option);
};

// Extracts owner name, property address, assessed/taxable values.
const wood_2 = async (page, config) => {
  // Extracts Owner Name
  const ownerName = await page.evaluate((lbl, lnk) => {
    try {
      const el = document.querySelector(lbl) || document.querySelector(lnk);
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'N/A';
    } catch (e) {
      return 'N/A';
    }
  }, config.ids.ownerNameLbl, config.ids.ownerNameLnk);

  // Extracts Property Address
  const propertyAddress = await page.evaluate(id => {
    try {
      const el = document.querySelector(id);
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'N/A';
    } catch (e) {
      return 'N/A';
    }
  }, config.ids.ownerAddr);
 
  // Extracts Total Assessed / Taxable Values
  let totalValue = 'N/A';
  try {
    const valueText = await page.$eval(
      config.ids.valuationTable,
      table => {
        for (const row of table.querySelectorAll('tr')) {
          const header = row.querySelector('th')?.textContent.trim();
          if (header === 'Total Value (Assessed 35%)') {
            const td = row.querySelector('td.value-column');
            return td?.textContent.trim() || null;
          }
        }
        return null;
      }
    );
    totalValue = (valueText && valueText.trim() !== '') ? valueText.trim() : '-';
  } catch (err) {
    totalValue = '-';
  }

  return {
    owner_name: ownerName,
    property_address: propertyAddress || "N/A",
    total_value: totalValue, 
  };
};

// ────────────────────────────── STEP 3: MULTI-YEAR TAX HISTORY ──────────────────────────────
const wood_paid = async (page, overview, account, config, yearsRequested = 1) => {
  const now = new Date();
  const currentPayYear = now.getFullYear();

  const parseDate = (dateStr, year) => {
    const [m, d] = dateStr.split('/').map(Number);
    return new Date(year, m - 1, d);
  };

  const allHistory = [];
  const delinquentInstallments = [];

  try {
    // Extract all tax data from the page
    const result = await page.evaluate((cfg) => {
      const parseAmt = (s) => parseFloat((s || "").replace(/[$,]/g, "")) || 0;
      const fmt = (n) => n === 0 ? "$0.00" : "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

      const taxData = {}; // { "2024-2025": { first: {...}, second: {...} } }
      const paymentData = {}; // { "2024-2025": [{ date, amount, rawDate }] }

      // === 1. Extract Base Amounts from Tax History ===
      document.querySelectorAll("#ctlBodyPane_ctl04_ctl01_grdTableViewer tbody tr").forEach(row => {
        const cells = row.cells;
        if (cells.length < 3) return;

        const yearText = cells[0]?.textContent.trim(); // "2024 Pay 2025"
        const desc = cells[1]?.textContent.trim();
        const amt = parseAmt(cells[2]?.textContent);

        const match = yearText.match(/(\d{4})\s+Pay\s+(\d{4})/);
        if (!match) return;

        const taxYear = match[1];
        const payYear = match[2];
        const yearLabel = `${taxYear}-${payYear}`;

        if (!taxData[yearLabel]) {
          taxData[yearLabel] = { taxYear, payYear, first: 0, second: 0 };
        }

        if (desc.includes("First Half Net Tax")) taxData[yearLabel].first = amt;
        if (desc.includes("Second Half Net Tax")) taxData[yearLabel].second = amt;
      });

      // === 2. Extract Payments ===
      document.querySelectorAll("#ctlBodyPane_ctl03_ctl01_grdTableViewer tbody tr").forEach(row => {
        const cells = row.cells;
        if (cells.length < 5) return;

        const yearText = cells[0]?.textContent.trim(); // "2024 Pay 2025"
        const dateText = cells[1]?.textContent.trim();
        const desc = cells[3]?.textContent.trim();
        const amtText = cells[4]?.textContent.trim();

        if (!desc.includes("Payment")) return;

        const amount = parseAmt(amtText);
        if (amount <= 0) return;

        const match = yearText.match(/(\d{4})\s+Pay\s+(\d{4})/);
        if (!match) return;

        const taxYear = match[1];
        const payYear = match[2];
        const yearLabel = `${taxYear}-${payYear}`;

        const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) return;

        const date = `${dateMatch[1].padStart(2,"0")}/${dateMatch[2].padStart(2,"0")}/${dateMatch[3]}`;
        const rawDate = new Date(dateText);

        if (!paymentData[yearLabel]) paymentData[yearLabel] = [];
        paymentData[yearLabel].push({ date, amount, rawDate });
      });

      // Sort payments by date (latest first)
      Object.keys(paymentData).forEach(yr => {
        paymentData[yr].sort((a, b) => b.rawDate - a.rawDate);
      });

      return { taxData, paymentData };
    }, config);

    const { taxData, paymentData } = result;

    // === 3. Process each year and build installments ===
    const allYears = Object.keys(taxData).sort(); // ["2023-2024", "2024-2025"]
    const latestTaxYear = allYears.length > 0 ? allYears[allYears.length - 1].split('-')[0] : "";

    for (const yearLabel of allYears) {
      const { taxYear, payYear, first: firstHalfBase, second: secondHalfBase } = taxData[yearLabel];
      const payments = paymentData[yearLabel] || [];
      const totalBase = firstHalfBase + secondHalfBase;

      const due1 = `${config.dueDates.due1}/${payYear}`;
      const delq1 = `${config.dueDates.delq1}/${payYear}`;
      const due2 = `${config.dueDates.due2}/${payYear}`;
      const delq2 = `${config.dueDates.delq2}/${payYear}`;

      const dueDate1Obj = parseDate(config.dueDates.due1, payYear);
      const dueDate2Obj = parseDate(config.dueDates.due2, payYear);

      // Determine payment status
      let firstStatus = now > dueDate1Obj ? "Delinquent" : "Due";
      let secondStatus = now > dueDate2Obj ? "Delinquent" : "Due";
      let paidDate1 = "-", paidDate2 = "-";
      let amountPaid1 = 0, amountPaid2 = 0;

      if (payments.length >= 2) {
        // Two payments
        paidDate1 = payments[1].date;
        paidDate2 = payments[0].date;
        amountPaid1 = payments[1].amount;
        amountPaid2 = payments[0].amount;
        firstStatus = secondStatus = "Paid";

      } else if (payments.length === 1) {
        const p = payments[0];
        // Full payment?
        if (totalBase > 0 && p.amount >= totalBase * 0.93) {
          paidDate1 = paidDate2 = p.date;
          firstStatus = secondStatus = "Paid";
          amountPaid1 = p.amount;
          amountPaid2 = 0;
        } else {
          // Partial payment
          const month = p.rawDate.getMonth() + 1;
          if (month <= 7) {
            firstStatus = "Paid";
            paidDate1 = p.date;
            amountPaid1 = p.amount;
            secondStatus = now > dueDate2Obj ? "Delinquent" : "Due";
          } else {
            secondStatus = "Paid";
            paidDate2 = p.date;
            amountPaid2 = p.amount;
            firstStatus = "Delinquent";
          }
        }
      }

      // Build installments
      const inst1 = {
        jurisdiction: "County",
        year: yearLabel,
        payment_type: "Semi-Annual",
        installment: "1st Half",
        status: firstStatus,
        base_amount: formatDollar(firstHalfBase),
        amount_paid: formatDollar(amountPaid1),
        amount_due: firstStatus === "Paid" ? "$0.00" : formatDollar(firstHalfBase - amountPaid1),
        mailing_date: "N/A",
        due_date: due1,
        delq_date: delq1,
        paid_date: paidDate1,
        good_through_date: ""
      };

      const inst2 = {
        jurisdiction: "County",
        year: yearLabel,
        payment_type: "Semi-Annual",
        installment: "2nd Half",
        status: secondStatus,
        base_amount: formatDollar(secondHalfBase),
        amount_paid: formatDollar(amountPaid2),
        amount_due: secondStatus === "Paid" ? "$0.00" : formatDollar(secondHalfBase - amountPaid2),
        mailing_date: "N/A",
        due_date: due2,
        delq_date: delq2,
        paid_date: paidDate2,
        good_through_date: ""
      };

      allHistory.push(inst1);
      allHistory.push(inst2);

      if (firstStatus === "Delinquent") delinquentInstallments.push(inst1);
      if (secondStatus === "Delinquent") delinquentInstallments.push(inst2);
    }

    // === 4. Filter by requested years + keep all delinquents ===
    const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))].sort();
    const latestNYears = uniqueYears.slice(-yearsRequested);

    let finalHistory = allHistory.filter(h => latestNYears.includes(h.year.split('-')[0]));

    // Add any delinquent installments not already included
    for (const delq of delinquentInstallments) {
      if (!finalHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
        finalHistory.push(delq);
      }
    }

    // Sort: oldest → newest
    finalHistory.sort((a, b) => {
      const ya = parseInt(a.year.split('-')[0]);
      const yb = parseInt(b.year.split('-')[0]);
      if (ya !== yb) return ya - yb;
      return a.installment === "1st Half" ? -1 : 1;
    });

    // === 5. Build notes ===
    const currentYearLabel = latestTaxYear ? `${latestTaxYear}-${parseInt(latestTaxYear) + 1}` : "";
    const currentEntries = finalHistory.filter(i => i.year === currentYearLabel);

    let noteParts = [];
    
    // Check for prior year delinquency FIRST
    const hasPriorDelq = allHistory.some(i => {
      const y = parseInt(i.year.split('-')[0]);
      return y < parseInt(latestTaxYear || 0) && i.status === "Delinquent";
    });

    // Add prior year status at the beginning
    if (hasPriorDelq) {
      noteParts.push("PRIORS ARE DELINQUENT");
    } else {
      noteParts.push("ALL PRIORS ARE PAID");
    }

    // Current year detailed status
    if (currentEntries.length > 0) {
      const first = currentEntries.find(i => i.installment === "1st Half") || { status: "Paid" };
      const second = currentEntries.find(i => i.installment === "2nd Half") || { status: "Paid" };

      noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
    } else if (latestTaxYear) {
      noteParts.push(`${currentYearLabel}: NO TAXES DUE`);
    }

    noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`);

    const notes = noteParts.join(". ");
    const delinquent = delinquentInstallments.length > 0 ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    return {
      processed_date: new Date().toISOString(),
      order_number: "",
      borrower_name: "",
      owner_name: overview.owner_name ? [overview.owner_name] : [],
      property_address: overview.property_address || "",
      parcel_number: account,
      land_value: "",
      improvements: "",
      total_assessed_value: overview.total_value || "",
      exemption: "",
      total_taxable_value: overview.total_value || "",
      taxing_authority: config.taxing_authority,
      notes,
      delinquent,
      tax_history: finalHistory
    };

  } catch (err) {
    console.error("[WOOD COUNTY] Critical failure:", err.message || err);
    
    // Fallback
    const taxYear = (currentPayYear - 1).toString();
    const yearLabel = `${taxYear}-${currentPayYear}`;
    
    return {
      processed_date: new Date().toISOString(),
      order_number: "",
      borrower_name: "",
      owner_name: overview.owner_name ? [overview.owner_name] : [],
      property_address: overview.property_address || "",
      parcel_number: account,
      land_value: "",
      improvements: "",
      total_assessed_value: overview.total_value || "",
      exemption: "",
      total_taxable_value: overview.total_value || "",
      taxing_authority: config.taxing_authority,
      notes: "FAILED TO LOAD TAX HISTORY",
      delinquent: "NONE",
      tax_history: []
    };
  }
};

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county, yearsRequested = 1) => {
  const config = counties[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);
  await wood_1(page, account, config);
  const overview = await wood_2(page, config);
  return await wood_paid(page, overview, account, config, yearsRequested);
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────
const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body || {};
    
    if (!account?.trim()) throw new Error("Account is required");
    if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");
    
    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    
    if (!counties[county]) throw new Error(`Unsupported county: ${county}`);
    
    // Get years requested from client config (defaults to 1)
    let yearsRequested = getOHCompanyYears(client);
    
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    
    await Promise.all([
      page.setViewport({ width: 1366, height: 768 }),
      page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36")
    ]);
    
    page.setDefaultNavigationTimeout(90000);
    
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ['image', 'stylesheet', 'font'];
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
      try { await context.close(); } catch (e) { console.warn(`[WARN] Context close failed:`, e.message); }
    }
  }
};

module.exports = { search };