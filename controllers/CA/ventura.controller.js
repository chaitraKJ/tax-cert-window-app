//Author: Dhanush

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Puppeteer timeout configuration
const timeout_option = { timeout: 90000 };

// Check if a date is delinquent (past due)
const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  if (today >= delq_date) {
    return true;
  }
  return false;
};
const vc_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Use current official Ventura County tax payment portal URL
      const baseUrl = "https://taxpayment.venturacounty.gov/webtaxonline/index.html";

      await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 60000 });

      // Clean the APN: remove dashes, spaces, dots, anything that's not a digit
      const cleanAccount = account.replace(/[^0-9]/g, "").trim();

      if (!cleanAccount || cleanAccount.length < 6) {
        return resolve({
          found: false,
          message: "Invalid property number format. Please enter a valid APN (digits only).",
          property_address: "N/A",
          parcel_number: cleanAccount || account,
          status_data: {},
          max_year: 0
        });
      }

      // Wait for the input field
      await page.waitForSelector("#textfield-1024-inputEl", { timeout: 30000 });
      await page.locator("#textfield-1024-inputEl").fill(cleanAccount);

      // Click the Search button
      await page.locator("#button-1037").click();

      // Wait and see what appears: grid (success) OR message box (failure)
      let gridAppeared = false;
      let messageAppeared = false;

      try {
        await Promise.race([
          page.waitForSelector(".x-grid-item", { timeout: 40000 })
            .then(() => { gridAppeared = true; }),
          page.waitForSelector("#messagebox-1001-msg", { timeout: 40000 })
            .then(() => { messageAppeared = true; })
        ]);
      } catch (e) {
        // Neither appeared in time → likely network/site issue
        throw new Error("Timeout waiting for search results or error message");
      }
      

      if (messageAppeared) {
        const errorText = await page.evaluate(() => {
          const el = document.querySelector("#messagebox-1001-msg");
          return el ? el.textContent.trim() : "";
        });

        if (errorText.includes("did not find any bills") || 
            errorText.includes("no bills that are available for online payment")) {
          return resolve({
            found: false,
            message: errorText || "No tax bills found for this property number.",
            property_address: "N/A",
            parcel_number: cleanAccount,
            status_data: {},
            max_year: 0
          });
        }
      }

      if (!gridAppeared) {
        throw new Error("No results grid appeared after search");
      }

      // Grid exists → scrape the data (your original logic)
      const rawData = await page.evaluate(() => {
        let data = {
          found: true,
          property_address: "",
          parcel_number: "",
          status_data: {},
          max_year: 0,
        };

        const addressEl = document.querySelector(".x-grid-cell-gridcolumn-1047 .x-grid-cell-inner");
        if (addressEl) data.property_address = addressEl.textContent.trim();

        const parcelEl = document.querySelector(".x-grid-cell-gridcolumn-1051 .x-grid-cell-inner");
        if (parcelEl) data.parcel_number = parcelEl.textContent.trim();

        const rows = document.querySelectorAll(".x-grid-item");
        rows.forEach((row) => {
          const cells = row.querySelectorAll(".x-grid-cell .x-grid-cell-inner");
          if (cells.length < 16) return;

          const taxYear = cells[3].textContent.trim() || cells[4].textContent.trim();
          const inst = cells[7].textContent.trim();
          const statusText = cells[10].textContent.trim();
          const base_amount = cells[11].textContent.trim();
          const amount_due = cells[15].textContent.trim();

          const yearMatch = taxYear.match(/(\d{4})/);
          const yearNum = yearMatch ? parseInt(yearMatch[1]) : 0;
          data.max_year = Math.max(data.max_year, yearNum);

          if (!data.status_data[taxYear]) {
            data.status_data[taxYear] = {
              status: statusText,
              base_amount: base_amount,
              history: []
            };
          }

          data.status_data[taxYear].history.push({
            inst,
            statusText,
            base_amount,
            amount_due,
            taxYear
          });
        });

        return data;
      });

      resolve(rawData);

    } catch (error) {
      console.error("vc_1 error:", error);
      reject(error);
    }
  });
};
const vc_2 = async (page, rawData) => {
  return new Promise(async (resolve, reject) => {
    try {
      let data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: ["N/A"],
        property_address: rawData.property_address,
        parcel_number: rawData.parcel_number,
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A",
        exemption: "N/A",
        total_taxable_value: "N/A",
        notes: "",
        delinquent: "NONE",
        taxing_authority: "Ventura County Treasurer-Tax Collector, 800 S. Victoria Avenue, Ventura, CA 93009-1290",
        tax_history: [],
      };

      const status_data = rawData.status_data;
      const max_year = rawData.max_year;
      let has_prior_delinq = false;
      let current_year_status_parts = [];
      let current_year_records = [];

      // Format currency helper
      const formatCurrency = (amt) => {
        if (!amt || amt === "") return "$0.00";
        const num = parseFloat(amt.replace(/[$,]/g, '')) || 0;
        return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // Process each year
      for (const year in status_data) {
        const yearData = status_data[year];
        const base_amt_str = formatCurrency(yearData.base_amount);
        const history = yearData.history;
        const len = history.length;

        // Sort history by inst (1 before 2)
        history.sort((a, b) => parseInt(a.inst) - parseInt(b.inst));

        const [startYearStr] = year.split(" - ");
        const fiscalStart = parseInt(startYearStr);
        const isCurrentYear = fiscalStart === max_year;

        let year_has_delinq = false;
        let year_payments = [];

        history.forEach((h) => {
          let th_data = {
            jurisdiction: "County",
            year: year,
            payment_type: "",
            status: "",
            base_amount: base_amt_str,
            amount_paid: "$0.00",
            amount_due: "",
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: "N/A",
            good_through_date: "",
          };

          // Set payment type and dates
          if (len === 1) {
            th_data.payment_type = "Annual";
            if (h.inst === "1") {
              th_data.due_date = `11/01/${fiscalStart}`;
              th_data.delq_date = `12/10/${fiscalStart}`;
            } else {
              th_data.due_date = `02/03/${fiscalStart + 1}`;
              th_data.delq_date = `04/10/${fiscalStart + 1}`;
            }
          } else {
            th_data.payment_type = h.inst === "1" ? "1st Installment" : "2nd Installment";
            if (h.inst === "1") {
              th_data.due_date = `11/01/${fiscalStart}`;
              th_data.delq_date = `12/10/${fiscalStart}`;
            } else {
              th_data.due_date = `02/03/${fiscalStart + 1}`;
              th_data.delq_date = `04/10/${fiscalStart + 1}`;
            }
          }

          // Status & amounts
          if (h.statusText === "Paid") {
            th_data.status = "Paid";
            th_data.amount_paid = base_amt_str;
            th_data.amount_due = "$0.00";
          } else {
            th_data.status = "Due";
            th_data.amount_due = formatCurrency(h.amount_due);
            if (is_delq(th_data.delq_date)) {
              th_data.status = "Delinquent";
              year_has_delinq = true;
            }
          }

          year_payments.push(th_data);
        });

        // Decide whether to include this year
        if (isCurrentYear) {
          // Always include current year
          current_year_records = year_payments;
          // Build current year note part
          if (len === 1) {
            const st = year_payments[0].status.toUpperCase();
            current_year_status_parts.push(`${year} IS ${st}, NORMALLY TAXES ARE PAID ANNUALLY`);
          } else {
            const first = year_payments.find(p => p.payment_type.includes("1st")) || year_payments[0];
            const second = year_payments.find(p => p.payment_type.includes("2nd")) || year_payments[1];
            current_year_status_parts.push(`${year} 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY`);
          }
        } else {
          // Prior year: only include if has delinquency
          if (year_has_delinq) {
            has_prior_delinq = true;
            data.tax_history.push(...year_payments);
          }
        }
      }

      // Always add current year records (sorted: 1st before 2nd)
      current_year_records.sort((a, b) => {
        if (a.payment_type.includes("1st")) return -1;
        if (b.payment_type.includes("1st")) return 1;
        return 0;
      });
      data.tax_history.unshift(...current_year_records);  // Put current at top (newest first)

      // Overall delinquency
      let has_any_delinq = data.tax_history.some(r => r.status === "Delinquent");
      if (has_any_delinq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      }

      // Notes
      let notesParts = [];
      if (has_prior_delinq) {
        notesParts.push("PRIOR YEARS ARE DELINQUENT");
      } else {
        notesParts.push("ALL PRIOR YEARS ARE PAID");
      }
      if (current_year_status_parts.length > 0) {
        notesParts.push(current_year_status_parts[0]);
      }
      notesParts.push("NORMAL DUE DATES ARE 11/01 AND 02/03, DELINQUENT DATES ARE 12/10 AND 04/10");

      data.notes = notesParts.join(", ");

      resolve(data);
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
};
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      vc_1(page, account)
        .then((rawData) => {
          vc_2(page, rawData)
            .then((data) => resolve(data))
            .catch((error) => reject(error));
        })
        .catch((error) => reject(new Error(error.message)));
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid property number (APN)",
    });
  }

  try {
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, account)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) => res.status(200).render("error_data", { error: true, message: error.message }))
        .finally(async () => await context.close());
    } else if (fetch_type === "api") {
      account_search(page, account)
        .then((data) => res.status(200).json({ result: data }))
        .catch((error) => res.status(500).json({ error: true, message: error.message }))
        .finally(async () => await context.close());
    } else {
      await context.close();
      return res.status(400).json({ message: "Invalid fetch_type" });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };
