// Author: SANAM POOJITHA
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";
import fs from "fs";
import path from "path";
import os from "os";
import PDFParser from "pdf2json";

const TIME = { NAVIGATE: 90000, SELECTOR: 30000 };

// ============================================================
// PDF DOWNLOAD SETUP
// ============================================================
const DOWNLOAD_DIR = path.join(os.tmpdir(), "polk_downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const enablePdfDownloads = async (page) => {
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });
};

const waitForPdfDownload = async (timeout = 45000) => {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const pdfs = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith(".pdf"));
    if (pdfs.length) return path.join(DOWNLOAD_DIR, pdfs[0]);
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error("PDF download timeout");
};

// ============================================================
// PDF PARSING
// ============================================================
const parsePdfLines = (pdfPath) =>
  new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on("pdfParser_dataError", reject);
    parser.on("pdfParser_dataReady", pdf => {
      const lines = [];
      pdf.Pages.forEach(p =>
        p.Texts.forEach(t => {
          const txt = decodeURIComponent(t.R.map(r => r.T).join("")).trim();
          if (txt) lines.push(txt);
        })
      );
      resolve(lines);
    });

    parser.loadPDF(pdfPath);
  });

const extractTaxFromPdf = (lines) => {
  let year = "";
  let base = 0;
  let paid_date = "";
  let paid_amt = 0;

  for (const l of lines) {
    if (!year) {
      const y = l.match(/\b(20\d{2})\b/);
      if (y) year = y[1];
    }

    const paid = l.match(/PAID\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\$([\d,]+\.\d{2})/i);
    if (paid) {
      paid_date = paid[1];
      paid_amt = Number(paid[2].replace(/,/g, ""));
    }

    const amt = l.match(/\$([\d,]+\.\d{2})/);
    if (amt) base = Math.max(base, Number(amt[1].replace(/,/g, "")));
  }

  return {
    year,
    base_amount: `$${base.toFixed(2)}`,
    status: paid_amt ? "Paid" : "Due",
    paid_date,
    amount_paid: `$${paid_amt.toFixed(2)}`,
  };
};

// ============================================================
// NOTES + DELINQUENCY
// ============================================================
const updateTaxNotes = (data) => {
  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes = "";
    return data;
  }

  // newest record
  const latest = data.tax_history[0];

  // any PRIOR year delinquent?
  const priorDelinquent = data.tax_history
    .slice(1)
    .some(r => r.status === "Delinquent");

  if (latest.status === "Paid") {
    data.notes =
      `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE PAID, ` +
      `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`;

  } else if (latest.status === "Due") {
    data.notes = priorDelinquent
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DUE, ` +
      `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DUE, ` +
      `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`;

  } else if (latest.status === "Delinquent") {
    data.notes = priorDelinquent
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DELINQUENT, ` +
      `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DELINQUENT, ` +
      `NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`;
  }

  return data;
};
const setDelinquentFlag = (data) => {
  data.delinquent = data.tax_history.some(
    h => h.status && h.status.toLowerCase() === "delinquent"
  )
    ? "TAXES ARE DELINQUENT, CALL FOR PAYOFF"
    : "NONE";

  return data;
};


// ============================================================
// STEP 1 — SEARCH
// ============================================================
const cl_1 = async (page, url, accountNumber) => {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIME.NAVIGATE });

  const inputSel = 'input[formcontrolname="lookupQuery"]';
  await page.waitForSelector(inputSel, { visible: true });
  await page.$eval(inputSel, (el) => (el.value = ""));
  await page.type(inputSel, String(accountNumber), { delay: 50 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => { }),
    page.click('button[type="submit"]'),
  ]);

  const resultSel = "li.parcel-result-item.clickable";
  await page.waitForSelector(resultSel, { visible: true, timeout: TIME.SELECTOR });
  await page.click(resultSel);
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: TIME.NAVIGATE });

  const parcel = await page.$eval("p.account-number", (el) => el.innerText.trim());
  const finalUrl = `https://polk.payfltaxes.com/property-tax/bill/${parcel}`;
  await page.goto(finalUrl, { waitUntil: "networkidle0", timeout: TIME.NAVIGATE });

  return finalUrl;
};

// ============================================================
// STEP 2 — PRINT → PDF → PARSE
// ============================================================
const cl_2 = async (page, url, client) => {

  try {
    await page.goto(url, { waitUntil: "networkidle0", timeout: TIME.NAVIGATE });
    await page.waitForSelector(".data-field", { timeout: TIME.SELECTOR });

    // -------------------------
    // CLICK “ALL BILLS” TAB
    // -------------------------
    try {
      const tabs = await page.$$("div.mat-tab-labels div.mat-tab-label");
      if (tabs.length > 1) await tabs[1].click();
    } catch (_) { }

    await page.waitForSelector("tbody tr", { timeout: 10000 }).catch(() => { });

    // -------------------------
    // SCRAPE HTML DATA (BASE)
    // -------------------------
    const data = await page.evaluate(() => {
      const out = {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        mailing_address: "",
        parcel_number: "",
        total_assessed_value: "",
        total_taxable_value: "",
        taxing_authority: "Polk County Tax Collector, Florida",
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      const fields = {};
      document.querySelectorAll(".data-field").forEach(node => {
        const label = node.querySelector(".label")?.textContent.trim();
        const value = node.querySelector(".content")?.innerText.trim();
        if (label) fields[label] = value;
      });

      out.parcel_number =
        fields["Parcel Number"] ||
        fields["Folio"] ||
        document.querySelector("h1 span")?.innerText.trim() ||
        "";

      if (fields["Owner"]) {
        const owner = fields["Owner"]
          .split("\n")
          .map(s => s.trim())
          .filter(Boolean);
        out.owner_name = [owner[0] || ""];
      }

      out.property_address = fields["Situs"] || "";

      const total = document.querySelector("div.total.flex .value")?.innerText.trim();
      if (total) {
        out.total_assessed_value = total;
        out.total_taxable_value = total;
      }

      // -------------------------
      // TAX HISTORY (HTML)
      // -------------------------
      document.querySelectorAll("tbody tr").forEach(row => {
        const yearCell = row.querySelector("td.tax-year")?.innerText.trim();
        const amountCell = row.querySelector("td.amount")?.innerText.trim() || "$0.00";
        if (!yearCell) return;

        const year = Number(yearCell.split("-")[0]);
        const amountNum = Number(amountCell.replace(/[^0-9.-]+/g, ""));
        const dueYear = year + 1;

        let status = "Paid";
        if (amountNum > 0) status = "Due";
        if (amountNum > 0 && new Date() > new Date(`${dueYear}-04-01`)) {
          status = "Delinquent";
        }

        out.tax_history.push({
          jurisdiction: "County",
          year,
          payment_type: "Annual",
          status,
          base_amount: amountCell,
          amount_paid: status === "Paid" ? amountCell : "$0.00",
          amount_due: status !== "Paid" ? amountCell : "$0.00",
          paid_date: "",
          mailing_date: "N/A",
          due_date: `03/31/${dueYear}`,
          delq_date: `04/01/${dueYear}`,
          good_through_date: "",
        });
      });

      out.tax_history.sort((a, b) => b.year - a.year);
      return out;
    });

    // -------------------------
    // SAFETY CHECK
    // -------------------------
    if (!data.tax_history || data.tax_history.length === 0) {
      return updateTaxNotes(data);
    }

    const latest = data.tax_history[0];

    // -------------------------
    // UNPAID → HTML ONLY
    // -------------------------
    if (latest.status !== "Paid") {
      data.tax_history = data.tax_history.filter(h =>
        ["due", "delinquent"].includes(h.status.toLowerCase())
      );
      setDelinquentFlag(data);
      return updateTaxNotes(data);
    }

    // -------------------------
    // PAID → FETCH 2 YEARS PDF
    // -------------------------
    const parcel = data.parcel_number;
    const yearsWanted = getOHCompanyYears(client); // 1 or 2
    const latestYear = latest.year;

    const yearsToFetch = Array.from(
      { length: yearsWanted },
      (_, i) => latestYear - i
    );

    const paidHistory = [];

    for (const year of yearsToFetch) {
      const billUrl = `https://polk.payfltaxes.com/property-tax/bill/${parcel}/${year}`;

      await page.goto(billUrl, {
        waitUntil: "networkidle0",
        timeout: TIME.NAVIGATE,
      });

      // clear old PDFs
      fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.endsWith(".pdf"))
        .forEach(f => fs.unlinkSync(path.join(DOWNLOAD_DIR, f)));

      // click PRINT
      await page.evaluate(() => {
        const icon = [...document.querySelectorAll("mat-icon")]
          .find(i => i.innerText.trim().toLowerCase() === "print");
        icon?.click();
      });

      const pdfPath = await waitForPdfDownload();
      const lines = await parsePdfLines(pdfPath);
      const parsed = extractTaxFromPdf(lines);

      try { fs.unlinkSync(pdfPath); } catch { }

      const dueYear = Number(parsed.year) + 1;

      paidHistory.push({
        jurisdiction: "County",
        year: Number(parsed.year),
        payment_type: "Annual",
        status: "Paid",
        base_amount: parsed.base_amount,
        amount_paid: parsed.amount_paid,
        amount_due: "$0.00",
        paid_date: parsed.paid_date,
        mailing_date: "N/A",
        due_date: `03/31/${dueYear}`,
        delq_date: `04/01/${dueYear}`,
        good_through_date: "",
      });

    }

    paidHistory.sort((a, b) => b.year - a.year);
    data.tax_history = paidHistory;
    data.delinquent = data.tax_history.some(
      h => h.status && h.status.toLowerCase() === "delinquent"
    )
      ? "TAXES ARE DELINQUENT, CALL FOR PAYOFF"
      : "NONE";
setDelinquentFlag(data);

    return updateTaxNotes(data);

  } catch (err) {
    throw new Error(`cl_2 failed: ${err.message}`);
  }
};




// ============================================================
// CONTROLLER
// ============================================================
const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;
  const url = "https://polk.payfltaxes.com/lookup/property-tax";

  const browser = await getBrowserInstance();
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); 
  
  await enablePdfDownloads(page);
 
  try {
    const detail = await cl_1(page, url, account);

    // pass client
    const result = await cl_2(page, detail, client);

    fetch_type === "html"
      ? res.render("parcel_data_official", result)
      : res.json({ result });

  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  } finally {
    await context.close();
  }
};


export { search };