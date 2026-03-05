// AUTHOR: POOJITHA

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import PDFParser from "pdf2json";
import fetch from "node-fetch";

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
  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes =
      "ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE LAST DAY OF FEB & 06/15";
    data.delinquent = "NONE";
    return data;
  }

  data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

  const latest = data.tax_history.at(-1);
  const priorDelq = data.tax_history
    .slice(0, -1)
    .some((r) => r.status === "Delinquent");

  const NOTE =
    ", NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE 02/28 & 06/16 FOR SEMI-ANNUAL, 04/30 & 05/01 FOR ANNUAL";

  if (latest.status === "Paid") {
    data.notes = priorDelq
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE PAID${NOTE}`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE PAID${NOTE}`;
    data.delinquent = priorDelq
      ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
      : "NONE";
    return data;
  }

  if (latest.status === "Due") {
    data.notes = priorDelq
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DUE${NOTE}`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DUE${NOTE}`;
    data.delinquent = "NONE";
    return data;
  }

  data.notes = `${latest.year} TAXES ARE DELINQUENT${NOTE}`;
  data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
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
    page.waitForNavigation({ waitUntil: "networkidle2" }, timeout_option),
    page.click("button[type='submit']"),
  ]);

  if (!page.url().includes("/TaxAccount/List")) {
    throw new Error("Account not found");
  }

  return page.url();
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

      return Array.from(document.querySelectorAll(".ctrlHolder"))
        .map((row) => {
          const l = row.querySelectorAll("ul.alternate label");
          if (l.length < 6) return null;

          const year = parseInt(l[0].innerText, 10);
          if (!year) return null;

          const total = clean(l[2].innerText);
          const paid = clean(l[5].innerText);
          const delqDate = new Date(`${year + 1}-05-01`);

          let status = "Due";
          if (paid >= total) status = "Paid";
          else if (today > delqDate) status = "Delinquent";

          return {
            jurisdiction: "County",
            year: String(year),
            payment_type: "Annual",
            status,
            base_amount: `$${total.toFixed(2)}`,
            amount_paid: `$${paid.toFixed(2)}`,
            amount_due: paid >= total ? "$0.00" : `$${(total - paid).toFixed(2)}`,
            due_date: `04/30/${year + 1}`,
            delq_date: `05/01/${year + 1}`,
            paid_date: "-",
            good_through_date: "",
            mailing_date: "N/A",
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 1);
    });

    // -------------------------------------------------
    // IF PAID, FETCH PDF IN MEMORY ONLY
    // -------------------------------------------------
    if (tax_history[0].status === "Paid") {
      const pdfUrl = countyData.pdfUrl(account);
      const pdfBuffer = Buffer.from(await fetch(pdfUrl).then((res) => res.arrayBuffer()));

      const pdfText = await new Promise((resolve) => {
        const parser = new PDFParser();
        parser.on("pdfParser_dataReady", (data) => {
          try {
            const text = data.Pages.flatMap((p) =>
              p.Texts.map((t) => decodeURIComponent(t.R[0].T))
            ).join(" ");
            resolve(text);
          } catch {
            resolve("");
          } finally {
            parser.removeAllListeners();
          }
        });
        parser.on("pdfParser_dataError", () => resolve(""));
        parser.parseBuffer(pdfBuffer); // parse directly in memory
      });

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
  await gunn_1(page, countyData.url, account);
  return TaxNotes(await gunn_2(page, countyData.billUrl(account), countyData, account));
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

export { search };