const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const PDFParser = require("pdf2json");
const fetch = require("node-fetch");
const timeout_option = { timeout: 90000 };

/* ============================================================
   Helpers
============================================================ */

// Determine status based on dates
const determineStatusByDate = (dueDateStr, delqDateStr) => {
    const today = new Date();
    const dueDate = new Date(dueDateStr);
    const delqDate = new Date(delqDateStr);

    if (today < dueDate) return "Due";
    if (today >= dueDate && today < delqDate) return "Due";
    return "Delinquent";
};

// How many payments → label
const getPaymentTypeNotes = (numPayments) => {
    if (numPayments === 1) return { type: "Annual", noteText: "ANNUALLY" };
    if (numPayments === 2) return { type: "Semi-Annual", noteText: "SEMI-ANNUALLY" };
    if (numPayments === 3) return { type: "Trimester", noteText: "TRIMESTERLY" };
    return { type: "Unknown", noteText: "ANNUALLY/TRIMESTERLY" };
};

// Add/format notes
function updateTaxNotes(data, numPayments = 1) {
    const { noteText } = getPaymentTypeNotes(numPayments);

    if (!data.tax_history || data.tax_history.length === 0) {
        data.notes = `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = "NONE";
        return data;
    }

    data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));
    const latestRecord = data.tax_history[data.tax_history.length - 1];
    const latestYear = latestRecord.year;
    const latestStatus = latestRecord.status;
    const priorDelinquentExists = data.tax_history.slice(0, -1).some(r => r.status === "Delinquent");

    if (latestStatus === "Paid") {
        data.notes = priorDelinquentExists
            ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`
            : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = priorDelinquentExists ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
    } else if (latestStatus === "Delinquent") {
        data.notes = priorDelinquentExists
            ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ALSO DELINQUENT, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`
            : `PRIOR YEAR TAXES ARE PAID, ${latestYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (latestStatus === "Unpaid" || latestStatus === "Due") {
        data.notes = priorDelinquentExists
            ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`
            : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ${noteText}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = "YES";
    } else {
        data.notes = `${latestYear} TAX STATUS UNKNOWN`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }

    return data;
}

// Dollar formatting
const money = (v) =>
    "$" +
    Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/* ============================================================
   Step 1 — HTML scraper
============================================================ */

const klamath_1 = async (page, account) => {
    const url = `https://www.paydici.com/klamath-county-or/search/property-tax`;
    await page.goto(url, { waitUntil: "domcontentloaded" },timeout_option);

    await page.waitForSelector("#on_mobile_select",{timeout_option});
    await page.select("#on_mobile_select", "id");
    await page.locator("input#q").fill(account);
	
    await page.click("#search-button input[type=submit]",timeout_option);
	await page.waitForSelector(".tw-grow",{timeout_option})

    const data = await page.evaluate(() => {
        let owner_name = "N/A";
        let property_address = "N/A";

        /** ---------------- grab owner + situs ---------------- **/
        const grow = document.querySelector(".tw-grow");
        if (grow) {
            const textBlocks = Array.from(grow.querySelectorAll("div"))
                .map(d => d.innerText.trim())
                .filter(t => t && !/validate/i.test(t));

            const addrRegex = /\d+.*\bOR\s+\d{5}$/i;

            const ownerLine = textBlocks.find(t => !addrRegex.test(t));
            const addressLine = textBlocks.find(t => addrRegex.test(t));

            if (ownerLine) owner_name = ownerLine.trim();
            if (addressLine) property_address = addressLine.trim();
        }

        /** ---------------- parcel number ---------------- **/
        const parcel =
            Array.from(document.querySelectorAll("div.tw-text-lg"))
                .map((d) => d.innerText.trim())
                .find(Boolean) || "N/A";

        /** ---------------- html paid detection ---------------- **/
        let htmlPaid = false;
        const paidEl = document.querySelector('div[id^="description"] span');
        if (paidEl) {
            const t = paidEl.innerText.replace(/\s+/g, "").toLowerCase();
            if (t.includes("taxes$0.00")) htmlPaid = true;
        }

        return {
            owner_name: [owner_name],
            property_address,
            parcel_number: parcel.replace(/[^0-9]/g, ""),
            htmlPaid,
        };
    });

    return {
        ...data,
        total_assessed_value: "N/A",
        total_taxable_value: "N/A",
        tax_history: [],
        taxing_authority: `KLAMATH COUNTY TAX COLLECTOR 305 MAIN STREET, RM 121 KLAMATH FALLS, OR 97601 (541) 883-4297`,
        delinquent: "",
        notes: "",
    };
};


/* ============================================================
   Step 2 — PDF Parser
============================================================ */


const extractTaxYearFromPdf = (lines) => {
  // Priority 1: Explicit "TAX YEAR ####"
  for (const l of lines) {
    const m = l.match(/tax\s*year\s*(20\d{2})/i);
    if (m) return Number(m[1]);
  }

  // Priority 2: Year range "2023-2024"
  for (const l of lines) {
    const m = l.match(/(20\d{2})\s*-\s*20\d{2}/);
    if (m) return Number(m[1]);
  }

  // Priority 3: Any standalone reasonable year
  const currentYear = new Date().getFullYear();
  for (const l of lines) {
    const m = l.match(/\b(20\d{2})\b/);
    if (m) {
      const y = Number(m[1]);
      if (y >= currentYear - 5 && y <= currentYear + 1) {
        return y;
      }
    }
  }

  // Fallback (only if PDF is weird)
  return currentYear;
};


const klamath_2 = async (main_data, page, account) => {
  try {
    const pdfLink = await page.evaluate(() =>
      document
        .querySelector('a[aria-label="Download Bill PDF Button"]')
        ?.getAttribute("href")
    );

    if (!pdfLink) {
      console.log("No PDF link found");
      return main_data;
    }

    const fullPdf = `https://www.paydici.com${pdfLink}`;

    // ------------------------------------
    // DOWNLOAD PDF (IN MEMORY)
    // ------------------------------------
    const res = await fetch(fullPdf);
    if (!res.ok) {
      console.log("ERROR downloading PDF:", res.status);
      return main_data;
    }

    const pdfBuffer = Buffer.from(await res.arrayBuffer());

    // ------------------------------------
    // PARSE PDF BUFFER (NO TEMP FILE)
    // ------------------------------------
    const lines = await new Promise((resolve) => {
      const parser = new PDFParser();

      parser.on("pdfParser_dataReady", (pdfData) => {
        try {
          const extracted = [];
          pdfData.Pages.forEach((p) =>
            p.Texts.forEach((t) => {
              const txt = decodeURIComponent(t.R[0].T).trim();
              if (txt) extracted.push(txt);
            })
          );
          resolve(extracted);
        } catch {
          resolve([]);
        } finally {
          parser.removeAllListeners();
        }
      });

      parser.on("pdfParser_dataError", () => {
        parser.removeAllListeners();
        resolve([]);
      });

      parser.parseBuffer(pdfBuffer); 
    });

    // ------------------------------------
    // EXTRACT VALUES
    // ------------------------------------
    const currencies = lines
      .filter((l) => /^\$?[\d,]+\.\d{2}$/.test(l))
      .map((l) => parseFloat(l.replace(/[$,]/g, "")));

    if (currencies.length) {
      const maxVal = Math.max(...currencies);
      main_data.total_assessed_value = money(maxVal);
      main_data.total_taxable_value = money(maxVal);
    }

    const idx = lines.findIndex((x) =>
      x.toLowerCase().includes("payment schedule")
    );

    let due_date = "";
    if (idx !== -1) {
      for (let i = idx + 1; i < idx + 10 && i < lines.length; i++) {
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(lines[i])) {
          due_date = lines[i];
          break;
        }
      }
    }

    if (due_date.includes("/")) {
      let p = due_date.split("/");
      if (p[2]?.length === 2) p[2] = "20" + p[2];
      due_date = p.join("/");
    }

    const calcDelq = (d) => {
      if (!d) return "";
      const [m, da, y] = d.split("/").map(Number);
      const dt = new Date(y, m - 1, da + 1);
      return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(
        dt.getDate()
      ).padStart(2, "0")}/${dt.getFullYear()}`;
    };

    const delq_date = calcDelq(due_date);

    const paymentAmounts = [];
    if (idx !== -1) {
      for (let i = idx + 1; i < idx + 30 && i < lines.length; i++) {
        if (/^\d{1,3}(,\d{3})*(\.\d{2})?$/.test(lines[i])) {
          paymentAmounts.push(parseFloat(lines[i].replace(/,/g, "")));
        }
      }
    }

    const numPayments = paymentAmounts.length;
    let payment_type = "Annual";
    if (numPayments === 2) payment_type = "Semi-Annual";
    else if (numPayments === 3) payment_type = "Trimester";

    const base_amount_value = Math.max(...paymentAmounts, 0);
    const base_amount = money(base_amount_value);

    let status = determineStatusByDate(due_date, delq_date);
    let amount_paid = "$0.00";
    let amount_due = base_amount;

    if (main_data.htmlPaid) {
      status = "Paid";
      amount_paid = base_amount;
      amount_due = "$0.00";
    }
const taxYear = extractTaxYearFromPdf(lines);

    main_data.tax_history = [
      {
        jurisdiction: "County",
        year: taxYear,
        payment_type,
        status,
        base_amount,
        amount_paid,
        amount_due,
        mailing_date: "N/A",
        due_date,
        delq_date,
        paid_date: status === "Paid" ? "" : "",
        good_through_date: "",
      },
    ];

    return updateTaxNotes(main_data, numPayments);

  } catch (err) {
    console.log("klamath_2 error:", err);
    return main_data;
  }
};



/* ============================================================
   Chain
============================================================ */
const account_search = async (page, account) => {
    const htmlData = await klamath_1(page, account);
    const fullData = await klamath_2(htmlData, page, account);
    return fullData;
};

/* ============================================================
   Controller
============================================================ */
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(500).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(90000);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page,account)
        .then((result) => {
          res.status(200).render("parcel_data_official", result);
        })
        .catch((error) => {
          res.status(500).render("error_data", {
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page,account)
        .then((result) => {
          return res.status(200).json({
            result,
          });
        })
        .catch((error) => {
          return res.status(500).json({
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type == "html") {
      res.status(500).render("error_data", {
        error: true,
        message: error.message,
      });
    } else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};

module.exports = { search };