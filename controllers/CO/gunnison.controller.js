// AUTHOR: POOJITHA
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const fs = require("fs");
const PDFParser = require("pdf2json");
const base64 = require("base64topdf");
const path = require("node:path");
const electron = require('electron');

const timeout_option = { timeout: 90000 };

// -------------------------------------------------------------
// COUNTY CONFIG
// -------------------------------------------------------------
const counties = [
  {
    county: "gunnison",
    url: "https://taxsearch.gunnisoncounty.org/prod/propertytaxsearchwebsite",
    taxing_authority:
      "Gunnison County Treasurer, 221 N Wisconsin St, Gunnison, CO 81230",

    pdfUrl: (account) =>
      `https://taxsearch.gunnisoncounty.org/Prod/PropertyTaxSearchWebsite/TaxAccount/AccountPaymentHistory?accountNo=${account}`,

    billUrl: (account) =>
      `https://taxsearch.gunnisoncounty.org/Prod/PropertyTaxSearchWebsite/TaxAccount/BillHistory/${account}`,
  },
  {
    county: "eagle",
    url: "https://propertytax.eaglecounty.us/PropertyTaxSearch/",
    taxing_authority:
      "Eagle County Treasurer, 500 Broadway St, Eagle, CO 81631, (970) 328-8860",

    pdfUrl: (account) =>
      `https://propertytax.eaglecounty.us/PropertyTaxSearch/TaxAccount/AccountPaymentHistory?accountNo=${account}`,

    billUrl: (account) =>
      `https://propertytax.eaglecounty.us/PropertyTaxSearch/TaxAccount/BillHistory/${account}`,
  },
];

// -------------------------------------------------------------
// TAX NOTES
// -------------------------------------------------------------
function TaxNotes(data) {

  let yearForDue;
  if (data.tax_history && data.tax_history.length) {
    const last = data.tax_history[data.tax_history.length - 1].due_date;
    const d = new Date(last);
    yearForDue = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  } else {
    yearForDue = new Date().getFullYear();
  }

  const dueText = `03/02/${yearForDue} AND 06/15/${yearForDue} FOR SEMI-ANNUAL, 04/30/${yearForDue} FOR ANNUAL`;

  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes =
      `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;
    data.delinquent = "NONE";
    return data;
  }

  // sort by year
  data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

  const latestYear = data.tax_history[data.tax_history.length - 1].year;
  const latestYearRecords = data.tax_history.filter(r => r.year == latestYear);

  const priorDelinquentExists = data.tax_history
    .filter(r => r.year != latestYear)
    .some(r => r.status === "Delinquent");

  const priorText = priorDelinquentExists
    ? "PRIORS ARE DELINQUENT"
    : "ALL PRIORS ARE PAID";

  // --------------------------------------------------
  // ANNUAL PAYMENT (ONLY 1 ROW)
  // --------------------------------------------------
  if (latestYearRecords.length === 1) {

    const status = latestYearRecords[0].status;

    if (status === "Paid") {

      data.notes =
        `${priorText}, ${latestYear} TAXES ARE PAID, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } else if (status === "Due") {

      data.notes =
        `${priorText}, ${latestYear} TAXES ARE DUE, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } else if (status === "Delinquent") {

      data.notes =
        `${latestYear} TAXES ARE DELINQUENT, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } else {

      data.notes = `${latestYear} TAX STATUS UNKNOWN`;

    }

  }

  // --------------------------------------------------
  // SEMI-ANNUAL PAYMENT (2 ROWS)
  // --------------------------------------------------
  else {

    latestYearRecords.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const firstHalf = latestYearRecords[0];
    const secondHalf = latestYearRecords[1];

    const firstStatus = firstHalf ? firstHalf.status : "Unknown";
    const secondStatus = secondHalf ? secondHalf.status : "Unknown";

    if (firstStatus === "Paid" && secondStatus === "Due") {

      data.notes =
        `${priorText}, ${latestYear} TAXES 1ST HALF IS PAID 2ND HALF IS DUE, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } 
    else if (firstStatus === "Paid" && secondStatus === "Paid") {

      data.notes =
        `${priorText}, ${latestYear} TAXES ARE PAID, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } 
    else if (firstStatus === "Due" && secondStatus === "Due") {

      data.notes =
        `${priorText}, ${latestYear} TAXES ARE DUE, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } 
    else if (firstStatus === "Delinquent" || secondStatus === "Delinquent") {

      data.notes =
        `${latestYear} TAXES ARE DELINQUENT, ` +
        `NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE ${dueText}`;

    } 
    else {

      data.notes = `${latestYear} TAX STATUS UNKNOWN`;

    }

  }

  // --------------------------------------------------
  // DELINQUENT FLAG
  // --------------------------------------------------

  if (priorDelinquentExists || data.tax_history.some(r => r.status === "Delinquent")) {
    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  } else {
    data.delinquent = "NONE";
  }

  return data;
}

// -------------------------------------------------------------
// GUNNISON STEP-1
// -------------------------------------------------------------
const gunn_1 = async (page, url, account) => {

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#searchToken", timeout_option);

  await page.evaluate(() => (document.querySelector("#searchToken").value = ""));
  await page.type("#searchToken", String(account), { delay: 50 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click("button[type='submit']")
  ]);

  if (!page.url().includes("/TaxAccount/List")) {
    throw new Error("Account not found");
  }

  // ---------------------------
  // Extract account number
  // ---------------------------
  const accountNumber = await page.evaluate(() => {

    const h3 = Array.from(document.querySelectorAll("h3"))
      .find(el => el.innerText.includes("Account Number"));

    if (!h3) return null;

    return h3.innerText.replace("Account Number:", "").trim();
  });

  if (!accountNumber) {
    throw new Error("Account number not found");
  }

  return accountNumber;
};

// -------------------------------------------------------------
// GUNNISON STEP-2 (Fixed: parse PDF in-memory, no temp file)
// -------------------------------------------------------------
const gunn_2 = async (page, billUrl, countyData, account) => {
  try {
    // -------------------------------------------------
    // LOAD BILL HISTORY PAGE
    // -------------------------------------------------
    await page.goto(billUrl, { waitUntil: "networkidle2" });
    await page.waitForSelector(".ctrlHolder", timeout_option);

    // -------------------------------------------------
    // BASIC INFO
    // -------------------------------------------------
    const basic = await page.evaluate(() => {
      const table = document.querySelector("#main table:nth-child(4)");
      const tds = table ? table.querySelectorAll("td") : [];

      const propLines =
        tds[0]?.innerText
          .replace("Property Information:", "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean) || [];

      const parcelLine = propLines.find((l) => l.startsWith("Parcel:")) || "";

      const ownerLines =
        tds[1]?.innerText
          .replace("Owner Information:", "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean) || [];

      return {
        parcel_number: parcelLine.replace("Parcel:", "").trim(),
        property_address: propLines
          .filter((l) => !l.startsWith("Parcel:"))
          .join(", "),
        owner_name: ownerLines.length ? [ownerLines[0]] : [],
      };
    });

    // -------------------------------------------------
    // ASSESSED VALUE
    // -------------------------------------------------
    const total_assessed_value = await page.evaluate(() => {
      const td = Array.from(document.querySelectorAll("#main table td")).find(
        (x) => /Assessed Value:/i.test(x.innerText)
      );
      return td?.innerText.match(/\$[\d,]+\.\d{2}/)?.[0] || "N/A";
    });

    // -------------------------------------------------
    // TAX HISTORY (LATEST YEAR ONLY)
    // -------------------------------------------------
let tax_history = await page.evaluate(() => {

  const clean = (v) => Number(v.replace(/[^0-9.-]/g, "")) || 0;
  const today = new Date();

  const getStatus = (due, delq, paidAmt, base) => {
    const delqDate = new Date(delq);
    if (paidAmt >= base) return "Paid";
    if (today > delqDate) return "Delinquent";
    return "Due";
  };

  return Array.from(document.querySelectorAll(".ctrlHolder"))
    .flatMap((row) => {

      const l = row.querySelectorAll("ul.alternate label");
      if (l.length < 6) return [];

      const year = parseInt(l[0].innerText, 10);
      if (!year) return [];

      const typeText = l[1].innerText.toLowerCase();

      const total = clean(l[2].innerText);
      const paid = clean(l[5].innerText);

      // -----------------------------
      // SEMI ANNUAL
      // -----------------------------
      if (typeText.includes("1st") || typeText.includes("2nd")) {

        const half = total / 2;

        const due1 = `03/02/${year + 1}`;
        const delq1 = `03/03/${year + 1}`;

        const due2 = `06/15/${year + 1}`;
        const delq2 = `06/16/${year + 1}`;

        const firstPaid = typeText.includes("1st") ? paid : 0;

        const row1 = {
          jurisdiction: "County",
          year: String(year),
          payment_type: "Semi-Annual",
          status: getStatus(due1, delq1, firstPaid, half),
          base_amount: `$${half.toFixed(2)}`,
          amount_paid: `$${firstPaid.toFixed(2)}`,
          amount_due: `$${Math.max(half - firstPaid, 0).toFixed(2)}`,
          due_date: due1,
          delq_date: delq1,
          paid_date: "-",
          good_through_date: "",
          mailing_date: "N/A",
        };

        const row2 = {
          jurisdiction: "County",
          year: String(year),
          payment_type: "Semi-Annual",
          status: getStatus(due2, delq2, 0, half),
          base_amount: `$${half.toFixed(2)}`,
          amount_paid: "$0.00",
          amount_due: `$${half.toFixed(2)}`,
          due_date: due2,
          delq_date: delq2,
          paid_date: "-",
          good_through_date: "",
          mailing_date: "N/A",
        };

        return [row1, row2];
      }

      // -----------------------------
      // ANNUAL (FIXED)
      // -----------------------------
      const due = `04/30/${year + 1}`;
      const delq = `05/01/${year + 1}`;

      return [{
        jurisdiction: "County",
        year: String(year),
        payment_type: "Annual",
        status: getStatus(due, delq, paid, total),
        base_amount: `$${total.toFixed(2)}`,
        amount_paid: `$${paid.toFixed(2)}`,
        amount_due: paid >= total ? "$0.00" : `$${(total - paid).toFixed(2)}`,
        due_date: due,
        delq_date: delq,
        paid_date: "-",
        good_through_date: "",
        mailing_date: "N/A",
      }];

    })
.sort((a, b) => Number(b.year) - Number(a.year))
.filter((r, i, arr) => {
  // If annual → keep only first row
  if (r.payment_type === "Annual") {
    return i === 0;
  }
  // If semi-annual → keep first two rows
  return i < 2;
});  //  FIXED: annual should return only 1 row

});

    // --------------------
    // IF PAID, FETCH 
    // -------------------
    if (tax_history[0].status === "Paid") {

      const pdfUrl = countyData.pdfUrl(account);

      // -----------------------------
      // DOWNLOAD PDF IN BROWSER
      // -----------------------------
      const pdfBase64 = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();

        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(blob);
        });

      }, pdfUrl);

      if (!pdfBase64) return;

      // -----------------------------
      // BASE64 → PDF FILE
      // -----------------------------
      // const pdfPath = `/tmp/${account}_payments.pdf`;
      const file_name = Date.now() + "-" + account;
      const pdfPath = path.join(electron.app.getPath('userData'), `${file_name}.pdf`);

      await base64.base64Decode(pdfBase64, pdfPath);

      // -----------------------------
      // PARSE PDF
      // -----------------------------
      const pdfText = await new Promise((resolve) => {

        const parser = new PDFParser();

        parser.on("pdfParser_dataReady", data => {

          try {

            const text = data.Pages.flatMap(p =>
              p.Texts.map(t => decodeURIComponent(t.R[0].T))
            ).join(" ");

            resolve(text);

          } catch {
            resolve("");
          }

          parser.removeAllListeners();

        });

        parser.on("pdfParser_dataError", () => {
          parser.removeAllListeners();
          resolve("");
        });

        parser.loadPDF(pdfPath);

      });

      // -----------------------------
      // DELETE TEMP FILE
      // -----------------------------
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }

      // -----------------------------
      // EXTRACT DATE
      // -----------------------------
      const allDates = pdfText.match(/\d{2}-\d{2}-\d{4}/g) || [];

      if (allDates.length) {
        tax_history[0].paid_date = allDates[0].replace(/-/g, "/");
      }

    }

    // -------------------------------------------------
    // FINAL RETURN
    // -------------------------------------------------
    return {
      ...basic,
      total_assessed_value,
      total_taxable_value: total_assessed_value,
      tax_history,
      taxing_authority: countyData.taxing_authority,
      delinquent: tax_history.some((r) => r.status === "Delinquent")
        ? "TAXES ARE DELINQUENT"
        : "NONE",
    };
  } catch (err) {
    console.error("gunn_2 error:", err);
    throw err;
  }
};

// -------------------------------------------------------------
// ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, countyData, account) => {

  const accountNumber = await gunn_1(page, countyData.url, account);

  return TaxNotes(
    await gunn_2(
      page,
      countyData.billUrl(accountNumber),
      countyData,
      accountNumber
    )
  );
};
// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const county = req.path.replace(/\//g, "").toLowerCase();
  const countyData = counties.find((c) => c.county === county);

  if (!countyData) {
    return res.status(400).json({ error: "Invalid county" });
  }

  const browser = await getBrowserInstance();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    const data = await account_search(page, countyData, account);
    fetch_type === "html"
      ? res.render("parcel_data_official", data)
      : res.json({ result: data });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  } finally {
    await context.close();
  }
};

module.exports = { search };