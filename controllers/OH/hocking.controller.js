// AUTHOR: MANJUNADH
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// ----------------------- Config -----------------------
const timeout_option = { timeout: 120000 };
const waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const counties = {
  hocking: {
    url: "https://auditor.hocking.oh.gov/Search",
    taxing_authority: "Hocking County Auditor & Treasurer — 1 E Main St, Logan, OH 43138, Ph: (740) 385-2127",
    city: "Logan",
    zip: "43138",
    first_due: '03/03',
    second_due: '07/03',
    first_delq: '03/04',
    second_delq: '07/04',
  }
};

// ----------------------- Helpers -----------------------
const formatCurrency = (val) => {
  if (!val) return "$0.00";
  let num = parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const parseCurrency = (val) => parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;

// ----------------------- Scraper Steps -----------------------
const gc_1 = async (page, account, config) => {
  await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.type("#searchBox", account.replace(/[^A-Za-z0-9]/g, ""));
  await page.click(".btn.btn-success.ml-1");
  await page.waitForSelector(".col-sm.text-center", { timeout: 120000 }).catch(async () => {
    throw new Error("No results page element found with class .col-sm.text-center");
  });
  const gridElement = await page.evaluateHandle((account) => {
    const elements = document.querySelectorAll(".col-sm.text-center");
    for (const el of elements) {
      if (el.innerText.includes(account)) return el;
    }
    return null;
  }, account);
  if (gridElement.asElement()) {
    await gridElement.evaluate((el) => el.scrollIntoView());
    await waitForTimeout(1000);
    await gridElement.click();
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 });
  } else {
    throw new Error("No clickable grid element found for parcel");
  }
};

const gc_2 = async (page, account) => {
  const result = await page.evaluate(() => {
    const clean = (text) => (text ? text.replace(/\s+/g, " ").trim() : "");
    const formatCurrency = (val) => {
      let num = parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    let owner_name = "";
    let property_address = "";
    let land_value = "$0.00";
    let improvements = "$0.00";
    let total_assessed_value = "$0.00";
    let total_taxable_value = "$0.00";

    // Extract owner and address
    const rows = document.querySelectorAll("table tbody tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2) {
        const label = clean(cells[0].innerText).toLowerCase();
        const value = clean(cells[1].childNodes[0]?.textContent || cells[1].innerText);
        if (label === "owner") owner_name = value;
        if (label === "address") property_address = value;
      }
    }

    // Extract valuation data - find the most recent year
    const valuationTable = document.querySelector("table[title='Valuation']");
    if (valuationTable) {
      const valuationRows = Array.from(valuationTable.querySelectorAll("tbody tr"));
      // Sort rows by year descending to get the most recent
      const sortedRows = valuationRows.sort((a, b) => {
        const yearA = parseInt(clean(a.cells[0]?.innerText)) || 0;
        const yearB = parseInt(clean(b.cells[0]?.innerText)) || 0;
        return yearB - yearA;
      });

      if (sortedRows.length > 0) {
        const cells = Array.from(sortedRows[0].querySelectorAll("td")).map(cell => clean(cell.innerText));
        if (cells.length >= 7) {
          land_value = formatCurrency(cells[2]); // Appraised Land
          improvements = formatCurrency(cells[3]); // Appraised Improvements
          total_assessed_value = formatCurrency(cells[6]); // Assessed Total
          total_taxable_value = formatCurrency(cells[6]); // Same as Assessed Total
        }
      }
    }

    return { owner_name, property_address, land_value, improvements, total_assessed_value, total_taxable_value };
  });

  if (!result.owner_name || !result.property_address) {
    // Warning removed
  }

  return result;
};

const gc_paid = async (page, overview, account, years = 1, client = "default", county = "hocking") => {
  const config = counties[county];
  const normalizedClient = client ? client.toLowerCase().trim() : "default";
  
  await page.waitForSelector("#taxBill-content", { timeout: 30000 }).catch(() => {});

  const currentDate = new Date();
  
  const taxData = await page.evaluate((yearsRequested, currentDateIso, config) => {
    const clean = (text) => (text ? text.replace(/\s+/g, " ").trim() : "");
    const formatCurrency = (val) => {
      let num = Math.abs(parseFloat(val?.toString().replace(/[^0-9.-]+/g, "")) || 0);
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const parseCurrency = (val) => parseFloat(val?.toString().replace(/[^0-9.-]+/g, "")) || 0;

    const result = {
      taxHistory: [],
      allYearsPaid: true,
      delinquentYears: []
    };

    // 1. Extract Payment Records once
    const paymentRecords = [];
    const paymentTable = document.querySelector("table[title='Tax Payments']");
    if (paymentTable) {
      const rows = Array.from(paymentTable.querySelectorAll("tbody tr"));
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll("td")).map(c => clean(c.innerText));
        if (cells.length >= 3) {
          paymentRecords.push({
            date: cells[0],
            year: cells[1],
            amount: parseCurrency(cells[2]),
            sortDate: row.querySelector("td[data-sort]")?.getAttribute("data-sort")
          });
        }
      });
    }

    // 2. Extract Year Columns and Net Annual from Tax History Table
    const taxHistoryTable = document.querySelector("table[title='Tax History']");
    if (!taxHistoryTable) return result;

    const headers = Array.from(taxHistoryTable.querySelectorAll("thead tr th")).map(th => clean(th.innerText));
    const yearCols = headers.slice(1).filter(h => /^\d{4}$/.test(h));
    const yearsToProcess = yearCols.slice(0, yearsRequested);

    const rows = Array.from(taxHistoryTable.querySelectorAll("tbody tr"));
    const netAnnualRow = rows.find(r => clean(r.cells[0]?.innerText).toLowerCase() === "net annual");
    const netAnnualMap = {};

    if (netAnnualRow) {
      yearsToProcess.forEach(year => {
        const idx = headers.indexOf(year);
        if (idx !== -1) {
          netAnnualMap[year] = parseCurrency(netAnnualRow.cells[idx]?.innerText);
        }
      });
    }

    // 3. Process each year
    yearsToProcess.forEach(year => {
      const annualTax = netAnnualMap[year] || 0;
      const halfTax = annualTax / 2;
      const nextYear = (parseInt(year) + 1).toString();
      
      const due1 = `${config.first_due}/${nextYear}`;
      const due2 = `${config.second_due}/${nextYear}`;
      const delq1 = `${config.first_delq}/${nextYear}`;
      const delq2 = `${config.second_delq}/${nextYear}`;

      // Check payments for this year
      const yearPayments = paymentRecords.filter(p => p.year === year).sort((a, b) => new Date(a.sortDate || a.date) - new Date(b.sortDate || b.date));
      
      let status1 = "Due", status2 = "Due";
      let paid1 = 0, paid2 = 0;
      let date1 = "-", date2 = "-";

      const totalPaid = yearPayments.reduce((sum, p) => sum + p.amount, 0);
      
      if (totalPaid >= annualTax - 0.01 && annualTax > 0) {
        status1 = status2 = "Paid";
        paid1 = paid2 = halfTax;
        date1 = yearPayments[0]?.date || "N/A";
        date2 = yearPayments[1]?.date || date1;
      } else if (totalPaid >= halfTax - 0.01 && annualTax > 0) {
        status1 = "Paid";
        paid1 = halfTax;
        date1 = yearPayments[0]?.date || "N/A";
        
        const now = new Date(currentDateIso);
        const [m2, d2] = config.second_delq.split("/").map(Number);
        const delqDate2 = new Date(parseInt(nextYear), m2 - 1, d2);
        status2 = now >= delqDate2 ? "Delinquent" : "Due";
      } else {
        const now = new Date(currentDateIso);
        const [m1, d1] = config.first_delq.split("/").map(Number);
        const delqDate1 = new Date(parseInt(nextYear), m1 - 1, d1);
        const [m2, d2] = config.second_delq.split("/").map(Number);
        const delqDate2 = new Date(parseInt(nextYear), m2 - 1, d2);
        
        status1 = now >= delqDate1 ? "Delinquent" : "Due";
        status2 = now >= delqDate2 ? "Delinquent" : "Due";
      }

      if (status1 === "Delinquent" || status2 === "Delinquent") {
        result.allYearsPaid = false;
        result.delinquentYears.push(year);
      }

      // Installment 1
      result.taxHistory.push({
        jurisdiction: "County",
        year,
        payment_type: "Semi-Annual",
        installment: "1st Half",
        status: status1,
        base_amount: formatCurrency(halfTax),
        amount_paid: formatCurrency(paid1),
        amount_due: status1 === "Paid" ? "$0.00" : formatCurrency(halfTax - paid1),
        mailing_date: "N/A",
        due_date: due1,
        delq_date: delq1,
        paid_date: date1,
        good_through_date: ""
      });

      // Installment 2
      result.taxHistory.push({
        jurisdiction: "County",
        year,
        payment_type: "Semi-Annual",
        installment: "2nd Half",
        status: status2,
        base_amount: formatCurrency(halfTax),
        amount_paid: formatCurrency(paid2),
        amount_due: status2 === "Paid" ? "$0.00" : formatCurrency(halfTax - paid2),
        mailing_date: "N/A",
        due_date: due2,
        delq_date: delq2,
        paid_date: date2,
        good_through_date: ""
      });
    });

    return result;
  }, years, currentDate.toISOString(), config);

  // Note Generation Logic (Client-Specific)
  const uniqueYears = [...new Set(taxData.taxHistory.map(h => h.year))].sort((a, b) => b - a);
  const currentYear = uniqueYears[0] || new Date().getFullYear().toString();
  const currentYearLabel = `${currentYear}-${parseInt(currentYear) + 1}`;
  
  let priorNote = normalizedClient.includes("accurate")
    ? "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE."
    : taxData.allYearsPaid
    ? "ALL PRIOR YEARS ARE PAID."
    : `PRIOR YEARS (${taxData.delinquentYears.map(y => `${y}-${parseInt(y) + 1}`).join(", ")}) ARE DELINQUENT.`;

  let notes = priorNote;
  if (uniqueYears.length > 0) {
    const cyItems = taxData.taxHistory.filter(h => h.year === currentYear);
    const s1 = cyItems.find(i => i.installment === "1st Half")?.status.toUpperCase() || "DUE";
    const s2 = cyItems.find(i => i.installment === "2nd Half")?.status.toUpperCase() || "DUE";
    notes += ` ${currentYearLabel} 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.first_due} & ${config.second_due}.`;
  }

  return {
    processed_date: new Date().toISOString().split('T')[0],
    order_number: "",
    borrower_name: "",
    owner_name: [overview.owner_name || ""],
    property_address: overview.property_address || "",
    parcel_number: account,
    land_value: overview.land_value,
    improvements: overview.improvements,
    total_assessed_value: overview.total_assessed_value,
    exemption: "",
    total_taxable_value: overview.total_taxable_value,
    taxing_authority: config.taxing_authority,
    notes,
    delinquent: taxData.delinquentYears.length > 0 ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
    tax_history: taxData.taxHistory
  };
};

// ----------------------- Main Account Search -----------------------
const account_search = async (page, account, county, years, client) => {
  const config = counties[county];
  if (!config) throw new Error(`Unsupported county: ${county}`);
  await gc_1(page, account, config);
  const overview = await gc_2(page, account);
  return await gc_paid(page, overview, account, years, client, county);
};

// ----------------------- Express Controller -----------------------
const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body;
    if (!account) throw new Error("account is not defined");
    if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");

    const finalYears = getOHCompanyYears(client);

    const pathParts = req.path.split("/").filter(Boolean);
    const county = pathParts[pathParts.length - 1].toLowerCase();
    if (!counties[county]) throw new Error(`Unsupported county: ${county}`);

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["stylesheet", "image", "font"].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, county, finalYears, client);

    if (fetch_type === "api") {
      res.status(200).json({ result: data });
    } else {
      res.status(200).render("parcel_data_official", data);
    }
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  } finally {
    if (context) {
      await context.close();
    }
  }
};

export { search };