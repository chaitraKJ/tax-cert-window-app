//Author -->  Harsh Jha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const ac_1 = async (page, url, account) => {
  try {
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.waitForSelector("input#SearchText");
    await page.click("input#SearchText", { clickCount: 3 });
    await page.type("input#SearchText", account, { delay: 100 });

    await Promise.all([
      page.keyboard.press("Enter"),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);

    await page.waitForSelector(".k-selectable tr");
    await page.click(".k-selectable tr");
    await page.waitForSelector(
      "#dnn_ctr484_WashingtonGuestView_tdPropertyAddress"
    );
    await page.waitForSelector("#tblPaymentHistory tbody tr:not(.tableHeaders)")

    const data = await page.evaluate(() => {
      const getText = (sel, splitBy = null) => {
        const el = document.querySelector(sel);
        if (!el) return "";
        let text = el.textContent.trim();
        if (splitBy && text.includes(splitBy)) text = text.split(splitBy)[1];
        return text.trim();
      };

      const data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: getText(
          "#dnn_ctr484_WashingtonGuestView_tdPropertyAddress",
          ": "
        ),
        parcel_number: getText(
          "#dnn_ctr484_WashingtonGuestView_tdPropertyID",
          ": "
        ),
        land_value: "",
        improvements: "",
        total_assessed_value: "$0.00",
        exemption: "",
        total_taxable_value: "$0.00",
        taxing_authority:
          "Washington County Assessment and Taxation, 155 N. First Ave., Suite 130, Hillsboro, Oregon 97124",
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      // Owner
      const ownerEl = document.querySelector(
        "#dnn_ctr484_WashingtonGuestView_divOwnersLabel"
      );
      if (ownerEl) data.owner_name.push(ownerEl.textContent.trim());

      // Values
      const valueRows = document.querySelectorAll(
        "#dnn_ctr484_WashingtonGuestView_tblValueHistoryDataRP tr"
      );
      if (valueRows.length > 1) {
        const val = valueRows[1].lastElementChild?.textContent
          ?.trim()
          .split(": ")
          .pop();
        if (val) {
          data.total_assessed_value = val;
          data.total_taxable_value = val;
        }
      }

      // Tax history - with deduplication tracking
      const seenPayments = new Set();
      const rows = document.querySelectorAll(
        "#tblPaymentHistory tbody tr:not(.tableHeaders)"
      );
      
      rows.forEach((row) => {
        const text = row.textContent.trim().replace(/\s+/g, " ");
        if (text.includes("VOIDED: Yes") || /\(\$\d/.test(text)) return;

        const year = text.match(/TAXYEAR:\s*(\d{4})/i)?.[1];
        const date = text.match(/TRANSACTION DATE:\s*([\d-]+)/i)?.[1];
        const amount = text.match(/PAYMENT AMOUNT:\s*(\$[\d,]+\.\d{2})/i)?.[1];

        if (year && amount) {
          // Create unique key to detect duplicates
          const uniqueKey = `${year}-${date}-${amount}`;
          
          // Only add if we haven't seen this exact payment before
          if (!seenPayments.has(uniqueKey)) {
            seenPayments.add(uniqueKey);
            data.tax_history.push({
              jurisdiction: "County",
              year,
              payment_type: "",
              status: "Paid",
              base_amount: amount,
              amount_paid: amount,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: date || "N/A",
              good_through_date: "",
              link: "-",
            });
          }
        }
      });

      return data;
    });

    // Count payments per year
    const yearCount = new Map();
    data.tax_history.forEach((t) => {
      yearCount.set(t.year, (yearCount.get(t.year) || 0) + 1);
    });

    // Enrich each tax record with payment type and dates
    data.tax_history.forEach((t, outerIdx) => {
      const c = yearCount.get(t.year);
      if (c === 1) {
        t.payment_type = "Annual";
        t.due_date = `11/17/${t.year}`;
        t.delq_date = `11/18/${t.year}`;
      } else {
        t.payment_type = "Semi-Annual";
        // Count how many records with the same year come before this one
        const idx = data.tax_history
          .slice(0, outerIdx)
          .filter((r) => r.year === t.year).length;
        
        if (idx === 0) {
          // First installment
          t.due_date = `11/17/${t.year}`;
          t.delq_date = `11/18/${t.year}`;
        } else {
          // Second installment
          t.due_date = `05/15/${parseInt(t.year) + 1}`;
          t.delq_date = `05/16/${parseInt(t.year) + 1}`;
        }
      }
    });

    if (data.tax_history.length > 0) {
      const today = new Date();

      // Find latest year
      const maxYear = Math.max(
        ...data.tax_history.map((el) => Number(el.year))
      );

      // Update each record's final status
      data.tax_history = data.tax_history.map((el) => {
        const paid =
          el.status.toLowerCase() === "paid" || el.amount_paid !== "$0.00";
        const dueDate = el.due_date ? new Date(el.due_date) : null;
        const delqDate = el.delq_date ? new Date(el.delq_date) : null;

        if (paid) el.status = "Paid";
        else if (dueDate && today < dueDate) el.status = "Due";
        else if (delqDate && today > delqDate) el.status = "Delinquent";
        else el.status = " ";

        return el;
      });

      // Sort by year, then by due date
      data.tax_history.sort((a, b) => {
        if (Number(a.year) !== Number(b.year)) {
          return Number(a.year) - Number(b.year);
        }

        const da = new Date(a.due_date || "01/01/1900");
        const db = new Date(b.due_date || "01/01/1900");

        return da - db;
      });

      // Keep latest year and any unpaid prior years
      data.tax_history = data.tax_history.filter((el) => {
        if (Number(el.year) === maxYear) return true;
        return data.tax_history.some(
          (r) => r.year === el.year && r.status !== "Paid"
        );
      });

      // Mark delinquent status
      const hasDelinquent = data.tax_history.some(
        (el) => el.status === "Delinquent"
      );
      data.delinquent = hasDelinquent 
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
        : "NONE";

      // Prepare summary notes
      const priorUnpaid = data.tax_history.some(
        (el) => Number(el.year) < maxYear && el.status !== "Paid"
      );

      const maxYearRecords = data.tax_history.filter(
        (el) => Number(el.year) === maxYear
      );

      let firstStatus = "";
      let secondStatus = "";

      maxYearRecords.forEach((el, i) => {
        if (i === 0) firstStatus = el.status.toUpperCase();
        else if (i === 1) secondStatus = el.status.toUpperCase();
      });

      // Build notes based on payment type
      if (maxYearRecords.length === 1) {
        data.notes = `${
          priorUnpaid
            ? "PRIOR YEARS ARE DELINQUENT"
            : "ALL PRIOR YEARS ARE PAID"
        }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 11/17.`;
      } else {
        data.notes = `${
          priorUnpaid
            ? "PRIOR YEARS ARE DELINQUENT"
            : "ALL PRIOR YEARS ARE PAID"
        }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 11/16 AND 05/15.`;
      }
    }

    return data;
  } catch (err) {
    console.error("❌ Scraper failed:", err.message);
    throw err;
  }
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await ac_1(page, url, account);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(500).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const url = "https://washcotax.co.washington.or.us/";

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
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page, url, account)
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
      account_search(page, url, account)
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