//Author Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const CHARLESTON_CONFIG = {
  url: "https://sc-charleston.publicaccessnow.com/RealPropertyBillSearch.aspx",
  authority: "Charleston County Treasurer, Charleston, SC"
};

const SELECTORS = {
  PARCEL_INPUT: 'input[title="PIN"], input[aria-label="PIN"], input#txtPIN',
  SEARCH_BUTTON: 'button.btn-primary.btn-icon.mr-2[title="Search"]',
  LATEST_YEAR_LINK: '#lxT387 table.table-striped tbody tr:first-child a.btn-primary',
  PAYMENT_DATE_CELL: '#lxT396 table.x-payment tbody tr:first-child td:first-child'
};

function log(level, message, meta = {}) {
  console[level]?.(JSON.stringify({ level, timestamp: new Date().toISOString(), message, ...meta }));
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// PLAIN NUMBER SEARCH ONLY
function sanitizeParcelNumber(input) {
  const plain = (input || "").toString().trim().replace(/[^\w]/g, "").toUpperCase();
  return { plain, formatted: plain };
}

function formatCurrency(str) {
  if (!str) return "$0.00";
  const num = parseFloat(str.replace(/[^\d.-]/g, ""));
  return isNaN(num) ? "$0.00" : `$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function calculateTaxDates(year) {
  const y = parseInt(year, 10);
  if (isNaN(y)) return { dueDate: "N/A", delqDate: "N/A" };
  const due = new Date(y + 1, 0, 15);
  const delq = new Date(y + 1, 0, 16);
  return {
    dueDate: `${String(due.getMonth() + 1).padStart(2, "0")}/${String(due.getDate()).padStart(2, "0")}/${due.getFullYear()}`,
    delqDate: `${String(delq.getMonth() + 1).padStart(2, "0")}/${String(delq.getDate()).padStart(2, "0")}/${delq.getFullYear()}`
  };
}

async function performSearch(page, parcelInfo) {
  const { plain } = parcelInfo;

  await page.goto(CHARLESTON_CONFIG.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await delay(5000);

  await page.waitForSelector(SELECTORS.PARCEL_INPUT, { timeout: 30000 });
  await page.click(SELECTORS.PARCEL_INPUT, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(SELECTORS.PARCEL_INPUT, plain, { delay: 100 });

  await page.evaluate((val) => {
    const input = document.querySelector('input[title="PIN"], input[aria-label="PIN"], input#txtPIN');
    if (input) {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, plain);

  await Promise.all([
    page.waitForResponse(r => r.url().includes("Processing.aspx") || r.url().includes("AccountSummary"), { timeout: 30000 }),
    page.click(SELECTORS.SEARCH_BUTTON)
  ]);

  await delay(10000);

  const currentUrl = await page.url();
  if (!currentUrl.includes("AccountSummary") && !currentUrl.includes(plain)) {
    const linkSel = `a[href*="/Processing.aspx?p=${plain}"]`;
    await page.waitForSelector(linkSel, { timeout: 30000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 60000 }),
      page.click(linkSel)
    ]);
  }
}

async function waitForDetailsLoad(page) {
  await page.waitForSelector("#lxT385", { timeout: 60000 });
  await page.waitForSelector("#lxT387", { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll("#lxT387 table.table-striped tbody tr").length > 1, { timeout: 60000 });
  await delay(3000);
}

async function extractAccountInfo(page) {
  return await page.evaluate(() => {
    const table = document.querySelector("#lxT385 table.table-bordered.table-sm");
    if (!table) return { owner_name: ["N/A"], property_address: "N/A", parcel_number: "N/A" };

    let owner = "N/A", address = "N/A", parcel = "N/A";
    const firstCenter = table.querySelector("td.center");
    if (firstCenter) parcel = firstCenter.textContent.trim();

    const cells = table.querySelectorAll("td[colspan='3']");
    cells.forEach(cell => {
      const html = cell.innerHTML;
      const ownerMatch = html.match(/Current Owner:<\/b><\/em><br[^>]*>([^<]+)/i);
      if (ownerMatch?.[1]) owner = ownerMatch[1].trim();
      const addrMatch = html.match(/Physical Address:<\/b><\/em><br[^>]*>([^<]+)/i);
      if (addrMatch?.[1]) address = addrMatch[1].trim().replace(/ Sc /gi, " SC ");
    });

    return {
      owner_name: owner !== "N/A" ? [owner.toUpperCase()] : ["N/A"],
      property_address: address !== "N/A" ? address.toUpperCase() : "N/A",
      parcel_number: parcel
    };
  });
}

async function extractTaxBillsAndPaidDate(page) {
  const bills = await page.evaluate(() => {
    const rows = document.querySelectorAll("#lxT387 table.table-striped tbody tr");
    return Array.from(rows).map(row => {
      const tds = row.querySelectorAll("td");
      if (tds.length < 9) return null;
      const yearLink = tds[0].querySelector("a");
      return {
        year: yearLink ? yearLink.textContent.trim() : tds[0].textContent.trim(),
        tax: tds[2].textContent.trim(),
        penalty: tds[3].textContent.trim(),
        interest: tds[4].textContent.trim(),
        fees: tds[5].textContent.trim(),
        total_paid: tds[6].textContent.trim(),
        amount_due: tds[7].textContent.trim(),
        is_marked_paid: tds[8].textContent.trim().toLowerCase().includes("paid")
      };
    }).filter(Boolean);
  });

  let realPaidDate = null;
  const allMarkedPaid = bills.length > 0 && bills.every(b => b.is_marked_paid);

  if (allMarkedPaid && bills.length > 0) {
    await page.click(SELECTORS.LATEST_YEAR_LINK);
    await delay(6000);
    await page.waitForSelector("#lxT396", { timeout: 30000 });
    await delay(2000);
    realPaidDate = await page.evaluate((sel) => {
      const cell = document.querySelector(sel);
      return cell ? cell.textContent.trim() : null;
    }, SELECTORS.PAYMENT_DATE_CELL);
  }

  return { bills, realPaidDate, allMarkedPaid };
}

// CORRECT STATUS: amount_due = 0 → "Paid" | Only unpaid + past due → "Delinquent"
function getStatus(bill) {
  const amountDue = parseFloat((bill.amount_due || "").replace(/[^\d.-]/g, "")) || 0;

  if (amountDue <= 0.01) {
    return "Paid"; // FULLY PAID = Paid (even if late)
  }

  const yearInt = parseInt(bill.year, 10);
  const delqDate = new Date(yearInt + 1, 0, 16); // Jan 16
  const now = new Date();

  return now >= delqDate ? "Delinquent" : "Due";
}

// RICHLAND-STYLE NOTES — 100% CORRECT LOGIC IN CAPITAL LETTERS
function determineDelinquencyAndNotes(bills, realPaidDate) {
  if (!bills || bills.length === 0) {
    return {
      delinquent: "NONE",
      notes: "NO TAX BILLS FOUND. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15",
      latestBill: null
    };
  }

  const latest = bills[0];
  const latestYear = latest.year;
  const latestStatus = getStatus(latest);

  const hasUnpaid = bills.some(b => parseFloat((b.amount_due || "").replace(/[^\d.-]/g, "")) > 0.01);
  const priorUnpaid = bills.slice(1).some(b => parseFloat((b.amount_due || "").replace(/[^\d.-]/g, "")) > 0.01);

  const hasDelinquentPrior = bills.slice(1).some(b => getStatus(b) === "Delinquent");

  const notes = hasDelinquentPrior
    ? `PRIOR YEARS DELINQUENT. ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15`
    : `ALL PRIORS ARE PAID. ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15`;

  const delinquent = hasDelinquentPrior || latestStatus === "Delinquent"
    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
    : "NONE";

  return { delinquent, notes, latestBill: latest };
}

function buildTaxHistory(bills, latestBill, allMarkedPaid, realPaidDate) {
  const billsToShow = allMarkedPaid && bills.every(b => parseFloat((b.amount_due || "").replace(/[^\d.-]/g, "")) <= 0.01)
    ? [bills[0]]
    : bills.filter(b => parseFloat((b.amount_due || "").replace(/[^\d.-]/g, "")) > 0.01 || b.year === latestBill.year);

  // Reverse to show oldest to newest (bills come from website in newest-first order)
  const sortedBills = [...billsToShow].reverse();

  return sortedBills.map(bill => {
    const { dueDate, delqDate } = calculateTaxDates(bill.year);
    const status = getStatus(bill);

    return {
      jurisdiction: "County",
      year: bill.year,
      status,
      payment_type: "Annual",
      base_amount: formatCurrency(bill.tax),
      county_tax: bill.year === latestBill.year ? formatCurrency(bill.tax) : "N/A",
      city_tax: "N/A",
      fees: bill.year === latestBill.year ? formatCurrency(bill.fees) : "N/A",
      penalty: formatCurrency(bill.penalty),
      cost: "N/A",
      amount_paid: formatCurrency(bill.total_paid),
      amount_due: formatCurrency(bill.amount_due),
      paid_date: status === "Paid" && bill.year === latestBill.year && realPaidDate ? realPaidDate : " ",
      due_date: dueDate,
      delq_date: delqDate,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: "N/A",
      exemptions_breakdown: { residential_exemption: "N/A", homestead_exemption: "N/A", other_exemptions: "N/A", local_option_credit: "N/A" }
    };
  });
}

function safeResponse(accountInfo, notes, delinquent, history, authority) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: accountInfo.owner_name,
    property_address: accountInfo.property_address,
    parcel_number: accountInfo.parcel_number,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: authority,
    notes,
    delinquent,
    tax_history: history,
    property_details: {}
  };
}

function handleNotFound(parcel, authority) {
  return safeResponse(
    { owner_name: ["NO RECORDS FOUND"], property_address: "NO RECORDS FOUND", parcel_number: parcel },
    "NO TAX RECORDS FOUND.",
    "N/A",
    [],
    authority
  );
}

const getTaxData = async (page, parcelInput, config) => {
  const parcelInfo = sanitizeParcelNumber(parcelInput);
  const { authority } = config;

  try {
    await performSearch(page, parcelInfo);
    await waitForDetailsLoad(page);

    const accountInfo = await extractAccountInfo(page);
    const { bills, realPaidDate, allMarkedPaid } = await extractTaxBillsAndPaidDate(page);

    if (bills.length === 0) return handleNotFound(parcelInfo.plain, authority);

    const { delinquent, notes, latestBill } = determineDelinquencyAndNotes(bills, realPaidDate);
    const taxHistory = buildTaxHistory(bills, latestBill, allMarkedPaid, realPaidDate);

    return safeResponse(accountInfo, notes, delinquent, taxHistory, authority);
  } catch (err) {
    log("error", "Scraping failed", { error: err.message, parcel: parcelInfo?.plain });
    return handleNotFound(parcelInfo.plain, authority);
  }
};

const search = async (req, res) => {
  if (!req.body?.account) {
    return res.status(400).json({ error: true, message: "Parcel number required" });
  }

  const parcelInput = req.body.account.trim();
  let browserContext = null;

  try {
    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.setViewport({ width: 1366, height: 768 });

    const data = await getTaxData(page, parcelInput, CHARLESTON_CONFIG);

    if (req.body.fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (err) {
    log("error", "Server error", { error: err.message });
    res.status(500).json({ error: true, message: "Server error" });
  } finally {
    if (browserContext) await browserContext.close().catch(() => {});
  }
};

export { search };
