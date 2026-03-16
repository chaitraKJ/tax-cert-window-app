//Author:Sanam Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const PDFParser = require("pdf2json");
const fs = require("fs");
const base64 = require("base64topdf");
const path = require("node:path");
const electron = require('electron');

const TIMEOUT = 90000;

/* ============================================================
   Helpers
============================================================ */

const extractActualValueFromPdf = (lines) => {
  for (let i = 0; i < lines.length; i++) {
    if (/actual value/i.test(lines[i])) {
      const valLine = lines.slice(i, i + 5).find((l) => /^\$[\d,]+$/.test(l));
      if (valLine) return parseFloat(valLine.replace(/[$,]/g, ""));
    }
  }
  return null;
};

const getElPasoDelqDate = (dueDateStr) => {
  const d = new Date(dueDateStr);
  if (isNaN(d)) return "";
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month <= 3 ? `03/03/${year}` : `06/16/${year}`;
};

const formatToMMDDYYYY = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}/${d.getFullYear()}`;
};

const determineStatusByDate = (dueDateStr, delqDateStr) => {
  const today = new Date();
  const dueDate = new Date(dueDateStr);
  const delqDate = new Date(delqDateStr);
  if (today < dueDate) return "Due";
  if (today >= dueDate && today < delqDate) return "Due";
  return "Delinquent";
};

const money = (v) =>
  "$" +
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ============================================================
   Notes & Tax History
============================================================ */
function updateTaxNotes(data, numPayments = 2) {

  let yearForDue;
  if (data.tax_history && data.tax_history.length) {
    const last = data.tax_history[data.tax_history.length - 1].due_date;
    const d = new Date(last);
    yearForDue = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  } else {
    yearForDue = new Date().getFullYear();
  }

  const dueText = `03/02/${yearForDue} AND 06/15/${yearForDue}`;

  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes = `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;
    data.delinquent = "NONE";
    return data;
  }

  // sort by year
  data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

  const latestYear = data.tax_history[data.tax_history.length - 1].year;

  const latestYearRecords = data.tax_history.filter(r => r.year == latestYear);

  const firstHalf = latestYearRecords.find(r => r.due_date.includes("03") || r.payment_type === "Semi-Annual");
  const secondHalf = latestYearRecords.find(r => r.due_date.includes("06"));

  let firstStatus = firstHalf ? firstHalf.status : "Unknown";
  let secondStatus = secondHalf ? secondHalf.status : "Unknown";

  const priorDelinquentExists = data.tax_history
    .filter(r => r.year != latestYear)
    .some(r => r.status === "Delinquent");

  // build note text
  if (firstStatus === "Paid" && secondStatus === "Due") {

    data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES 1ST INSTALLMENT IS PAID 2ND INSTALLMENT IS DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

  } 
  else if (firstStatus === "Paid" && secondStatus === "Paid") {

    data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

  } 
  else if (firstStatus === "Due" && secondStatus === "Due") {

    data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

  } 
  else if (firstStatus === "Delinquent" || secondStatus === "Delinquent") {

    data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;


  } 
  else {

    data.notes = `${latestYear} TAX STATUS UNKNOWN`;

  }

 if (priorDelinquentExists || firstStatus === "Delinquent" || secondStatus === "Delinquent") {
  data.delinquent = "TAXES ARE DELINQUENT, CALL FOR PAYOFF";
} else {
  data.delinquent = "NONE";
}

  return data;
}
/* ============================================================
   HTML Scraper
============================================================ */
const EL_1 = async (page, account) => {
  const url = `https://www.paydici.com/el-paso-county-treasurer/search/tax-search-group`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

  await page.waitForSelector("#on_mobile_select", { timeout: TIMEOUT });
  await page.select("#on_mobile_select", "id");
  await page.locator("input#q").fill(account);
  await page.click("#search-button input[type=submit]", { timeout: TIMEOUT });
  await page.waitForSelector(".tw-grow", { timeout: TIMEOUT });

  const data = await page.evaluate(() => {
    let owner_name = "N/A";
    let property_address = "N/A";
let tax_year = null;
    const grow = document.querySelector(".tw-grow");
    if (grow) {
      const textBlocks = Array.from(grow.querySelectorAll("div"))
        .map((d) => d.innerText.trim())
        .filter((t) => t && !/validate/i.test(t));

      const addrRegex = /\d+.*\bOR\s+\d{5}$/i;

      const ownerLine = textBlocks.find((t) => !addrRegex.test(t));
      const addressLine = textBlocks.find((t) => addrRegex.test(t));

      if (ownerLine) owner_name = ownerLine.trim();
      if (addressLine) property_address = addressLine.trim();
    }

    const parcel = Array.from(document.querySelectorAll("div.tw-text-lg"))
      .map((d) => d.innerText.trim())
      .find(Boolean) || "N/A";

let firstHalfPaid = false;
let secondHalfDue = false;

const messages = document.querySelectorAll(".bill-message");

messages.forEach(m => {
  const txt = m.innerText.toLowerCase();

  if (txt.includes("1st half") && txt.includes("paid")) {
    firstHalfPaid = true;
  }
});

const secondHalf = document.querySelector('label[for*="second_half"]');

if (secondHalf) {
  secondHalfDue = true;
}

   return {
  owner_name: [owner_name],
  property_address,
  parcel_number: parcel.replace(/[^0-9]/g, ""),
  firstHalfPaid,
  secondHalfDue,
  tax_year
};
  });

  return {
    ...data,
    total_assessed_value: "N/A",
    total_taxable_value: "N/A",
    tax_history: [],
    taxing_authority: `El Paso County Treasurer, CO`,
    delinquent: "",
    notes: "",
    property_description: "N/A",
  };
};

/* ============================================================
   PDF Parser
============================================================ */
const extractTaxYearFromPdf = (lines) => {
  const currentYear = new Date().getFullYear();
    // detect "2025 TAXES PAYABLE 2026"
  for (const l of lines) {
    const m = l.match(/\b(20\d{2})\s+taxes\s+payable\s+20\d{2}/i);
    if (m) return Number(m[1]);
  }
  for (const l of lines) {
    const m = l.match(/tax\s*year\s*(20\d{2})/i);
    if (m) return Number(m[1]);
  }
  for (const l of lines) {
    const m = l.match(/(20\d{2})\s*-\s*20\d{2}/);
    if (m) return Number(m[1]);
  }
  for (const l of lines) {
    const m = l.match(/\b(20\d{2})\b/);
    if (m) {
      const y = Number(m[1]);
      if (y >= currentYear - 5 && y <= currentYear + 1) return y;
    }
  }
  return currentYear;
};

const extractPropertyAddressFromPdf = (lines) => {

  const looksLikeAddress = (text) => {
    // a number followed by a word (e.g. "3458 BERG") or any street-type
    if (/\d+\s+\w+/.test(text)) return true;
    if (/(rd|st|ave|blvd|dr|ln|pt|way)\b/i.test(text)) return true;
    return false;
  };

  const looksLikeCode = (text) => {
    // single token of letters+digits with no spaces is likely an account
    return /^[A-Z0-9]+$/i.test(text) && !/\s/.test(text);
  };

  for (let i = 0; i < lines.length; i++) {
    if (/property location/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (!candidate) continue;
        if (/property description/i.test(candidate)) continue;
        if (looksLikeCode(candidate)) continue;
        if (looksLikeAddress(candidate)) {
          return decodeURIComponent(candidate.replace(/\s+/g, " "));
        }
       
      }
    }
  }
  return "N/A";
};

// helper to get the description text following the PROPERTY DESCRIPTION label
const extractPropertyDescriptionFromPdf = (lines) => {
  for (let i = 0; i < lines.length; i++) {
    if (/property description/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next) return next;
      }
    }
  }
  return "N/A";
};


const EL_2 = async (main_data, page, account) => {
  try {

    const pdfLink = await page.evaluate(() =>
      document.querySelector('a[aria-label="Download Bill PDF Button"]')?.getAttribute("href")
    );

    if (!pdfLink) return main_data;

    const pdfUrl = `https://www.paydici.com${pdfLink}`;

    // ------------------------------------
    // DOWNLOAD PDF USING BROWSER
    // ------------------------------------
    const pdfBase64 = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });
    }, pdfUrl);

    if (!pdfBase64) return main_data;

    // ------------------------------------
    // CONVERT BASE64 → PDF FILE
    // ------------------------------------
    // const pdfPath = `/tmp/${account}.pdf`;
    const file_name = Date.now() + "-" + account;
    const pdfPath = path.join(electron.app.getPath('userData'), `${file_name}.pdf`);

    await base64.base64Decode(pdfBase64, pdfPath);

    // ------------------------------------
    // PARSE PDF
    // ------------------------------------
    const lines = await new Promise((resolve) => {

      const parser = new PDFParser();

      parser.on("pdfParser_dataReady", (pdf) => {

        const out = [];

        try {

          pdf.Pages.forEach((p) =>
            p.Texts.forEach((t) => {
              const txt = decodeURIComponent(t.R[0].T).trim();
              if (txt) out.push(txt);
            })
          );

        } catch {}

        parser.removeAllListeners();
        resolve(out);

      });

      parser.on("pdfParser_dataError", () => {
        parser.removeAllListeners();
        resolve([]);
      });

      parser.loadPDF(pdfPath);

    });

    // ------------------------------------
    // DELETE TEMP FILE
    // ------------------------------------
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    if (!lines.length) return main_data;

    // continue your existing logic
    main_data.property_address = extractPropertyAddressFromPdf(lines);
    main_data.property_description = extractPropertyDescriptionFromPdf(lines);

   

    // remaining code unchanged

    const taxYear = main_data.tax_year || extractTaxYearFromPdf(lines);
    const installments = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isFirst = /first half amount due by/i.test(line);
      const isSecond = /second half amount due by/i.test(line);
      if (!isFirst && !isSecond) continue;

      const dateMatch = line.match(
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}/i
      );
      const amountLine = lines.slice(i, i + 12).find((l) => /^\$[\d,]+\.\d{2}$/.test(l));
      if (!dateMatch || !amountLine) continue;

      installments.push({
        label: isFirst ? "FIRST HALF" : "SECOND HALF",
        due_date: dateMatch[0],
        amount: parseFloat(amountLine.replace(/[$,]/g, "")),
      });
    }

    main_data.tax_history = installments.map((inst) => {
      const dueDate = formatToMMDDYYYY(inst.due_date);
      const delq_date = getElPasoDelqDate(dueDate);
      let status = determineStatusByDate(dueDate, delq_date);
      let amount_paid = "$0.00";
      let amount_due = money(inst.amount);
if (inst.label === "FIRST HALF" && main_data.firstHalfPaid) {
  status = "Paid";
  amount_paid = money(inst.amount);
  amount_due = "$0.00";
}

if (inst.label === "SECOND HALF" && main_data.secondHalfDue) {
  status = determineStatusByDate(dueDate, delq_date);
  amount_paid = "$0.00";
  amount_due = money(inst.amount);
}

      return {
        jurisdiction: "County",
        year: taxYear,
        payment_type: "Semi-Annual",
        status,
        base_amount: money(inst.amount),
        amount_paid,
        amount_due,
        mailing_date: "N/A",
        due_date: dueDate,
        delq_date,
        paid_date: "",
        good_through_date: "",
      };
    });

    main_data.tax_history.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const actualValue = extractActualValueFromPdf(lines);
    if (actualValue) {
      main_data.total_assessed_value = money(actualValue);
      main_data.total_taxable_value = money(actualValue);
    }

    return updateTaxNotes(main_data, 2);
  } catch (err) {
    console.log("EL_2 error:", err);
    return main_data;
  }
};

/* ============================================================
   Chain
============================================================ */
const account_search = async (page, account) => {
  const htmlData = await EL_1(page, account);
  return await EL_2(htmlData, page, account);
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(500).render("error_data", { error: true, message: "Invalid Access" });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(TIMEOUT);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "image") req.abort();
      else req.continue();
    });

    const handler = async () => {
      const result = await account_search(page, account);
      return result;
    };

    if (fetch_type === "html") {
      handler()
        .then((result) => res.status(200).render("parcel_data_official", result))
        .catch((error) => res.status(500).render("error_data", { error: true, message: error.message }))
        .finally(async () => await context.close());
    } else {
      handler()
        .then((result) => res.status(200).json({ result }))
        .catch((error) => res.status(500).json({ error: true, message: error.message }))
        .finally(async () => await context.close());
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = { search };