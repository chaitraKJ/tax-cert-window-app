//author:SANAM POOJITHA
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const timeout_option = { timeout: 90000 };

// STEP 1: Go to search page and find parcel
const cl_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://taxes.clevelandcountytreasurer.org/AccountSearch?s=pt`;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.waitForSelector("#MainContent_txtSearchCriteria");
      await page.locator("#MainContent_txtSearchCriteria").fill(account);

      await Promise.all([
        page.locator("#MainContent_btnSearch").click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);

      // Check if directly on detail page
      const onDetailPage = await page.$("#MainContent_lblAccountBanner");
      if (onDetailPage) return resolve(page.url());

      const detailUrl = await page.evaluate(() => {
        const link = document.querySelector("table a[href*='PropertyDetail']");
        return link ? link.href : null;
      });

      if (!detailUrl)
        throw new Error("No property detail found for account " + account);

      resolve(detailUrl);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
// STEP 2: Scrape general info + assessments
const cl_2 = async (page, detailUrl, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(detailUrl, { waitUntil: "domcontentloaded" });

      const data = await page.evaluate(() => {
        const datum = {
          processed_date: "",
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "",
          exemption: "",
          total_taxable_value: "",
          taxing_authority:
            "Cleveland County Treasurer, 201 S Jones Ave #100, Norman, OK 73069",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        datum.owner_name = [
          document
            .querySelector("#MainContent_lblGIOwnerNameBanner")
            ?.textContent.replace("Owner:", "").trim() ?? "",
        ];

        datum.property_address =
          document
            .querySelector("#MainContent_lblGIPhysicalAddress")
            ?.innerText?.replace("PROPERTY ADDRESS:", "")
            .trim() ?? "";
        datum.parcel_number =
          document
            .querySelector("#MainContent_lblAccountBanner font")
            ?.textContent.trim() ?? "";

        // Assessments grid
        // Get total assessed value
        const rows = document.querySelectorAll(
          "#MainContent_PropertyContainer_tpAssessments_AssessmentsGrid tr"
        );
        rows.forEach((row) => {
          const tds = row.querySelectorAll("td");
          if (tds.length) {
            const label = tds[1].innerText.trim();
            let val = tds[2].innerText.trim();
            if (!val.startsWith("$")) {
              val = "$" + val;
            }
            if (label === "TOTAL") {
              datum.total_assessed_value = val;
              datum.total_taxable_value = val; //  taxable = assessed
            }
          }
        });
        return datum;
      });

      resolve(data);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

// STEP 3: Scrape paid transactions
const cl_paid = async (page, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const recent = await page.evaluate(() => {
        const transTable = document.querySelector(
          "#MainContent_PropertyContainer_tpTransactionHistory_TransactionHistoryGrid"
        );
        const taxTable = document.querySelector(
          "#MainContent_PropertyContainer_tpTaxes_TaxesGrid"
        );

        if (!transTable || !taxTable) return null;

        const tds = transTable.querySelectorAll("tr")[1].querySelectorAll("td");

        // Extract year
        const taxYear = tds[1].innerText.trim();

        // Get base amount from taxes grid TOTAL row
        const taxRows = taxTable.querySelectorAll("tr");
        let base_amount = "";
        for (let i = taxRows.length - 1; i >= 0; i--) {
          const row = taxRows[i];
          const cells = row.querySelectorAll("td");
          if (cells.length >= 6 && cells[1].innerText.includes("TOTAL")) {
            base_amount = cells[3].innerText.trim();
            break;
          }
        }

        // Construct due/delinquent dates
        const yearInt = parseInt(taxYear) || new Date().getFullYear();
        const due_date = `12/31/${yearInt}`;
        const delq_date = `01/31/${yearInt + 1}`;

        return {
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Annual",
          status: "Paid",
          amount_paid: tds[6].innerText.trim(),
          paid_date: tds[5].innerText.trim(),
          mailing_date: "N/A",
          good_through_date: "",
          base_amount,
          due_date,
          delq_date,
          amount_due: "$0.00",
        };
      });

      data.tax_history = recent ? [recent] : [];
      data.notes = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 12/31`;

      data.delinquent = recent ? "NONE" : "N/A";

      resolve(data);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

// STEP 4: Most recent unpaid tax
const cl_unpaid = async (page, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const unpaidTaxes = await page.evaluate(() => {
        const table = document.querySelector("#MainContent_tblLinks");
        if (!table) return [];

        const rows = table.querySelectorAll("tr");
        const results = [];

        for (let i = 1; i < rows.length; i++) {
          const tds = rows[i].querySelectorAll("td");
          if (tds.length < 2) continue;

          const year = tds[0].innerText.trim();
          const dueAmount = tds[1].innerText.trim();

          if (dueAmount === "$0.00") continue; // Skip fully paid years

          const yearInt = parseInt(year);
          const due_date = `12/31/${yearInt}`;
          const delq_date = `01/31/${yearInt + 1}`;

          results.push({
            jurisdiction: "County",
            year,
            payment_type: "Annual",
            status: "",   // set later
            base_amount: dueAmount,
            amount_paid: "$0.00",
            amount_due: dueAmount,
            mailing_date: "N/A",
            due_date,
            delq_date,
            paid_date: "",
            good_through_date: ""
          });
        }

        return results;
      });

      // Sort
      unpaidTaxes.sort((a, b) => parseInt(a.year) - parseInt(b.year));

      // Assign status
      const today = new Date();

      unpaidTaxes.forEach(t => {
        const delq = new Date(t.delq_date);
        if (today >= delq) {
          t.status = "Delinquent";
        } else {
          t.status = "Due";
        }
      });

      data.tax_history = unpaidTaxes;

      // Determine delinquent / due / none
      const hasDelq = unpaidTaxes.some(t => t.status === "Delinquent");
      const hasDue = unpaidTaxes.some(t => t.status === "Due");

      if (hasDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      } else if (hasDue) {
        data.delinquent = "YES";
      } else {
        data.delinquent = "NONE";
      }

      // Notes
      if (unpaidTaxes.length > 0) {
        const years = unpaidTaxes.map(t => parseInt(t.year));
        const latest = Math.max(...years);

        const hasPriorDue = years.some(y => y < latest);

        if (hasPriorDue) {
          data.notes = `PRIORS ARE DELINQUENT, ${latest} TAXES ARE ${hasDelq ? "DELINQUENT" : "DUE"}, NORMAL DUE DATE IS 12/31, NORMAL DELINQUENT DATE IS 01/31.`;
        } else {
          data.notes = `ALL PRIORS ARE PAID, ${latest} TAXES ARE ${hasDelq ? "DELINQUENT" : "DUE"}, NORMAL DUE DATE IS 12/31, NORMAL DELINQUENT DATE IS 01/31.`;
        }
      } else {
        data.notes = "ALL TAXES ARE PAID, NO TAXES DUE";
      }

      resolve(data);

    } catch (error) {
      reject(new Error(error.message));
    }
  });
};


// Orchestrator
const cl_account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const detailUrl = await cl_1(page, account);
      const data = await cl_2(page, detailUrl, account);

      // Decide if paid or unpaid
      const unpaid_due = await page.$eval("#MainContent_tblLinks", (table) => {
        const rows = table.querySelectorAll("tr");
        for (let i = 1; i < rows.length; i++) {
          const tds = rows[i].querySelectorAll("td");
          if (tds.length >= 2) {
            const dueAmount = tds[1].innerText.trim();
            if (dueAmount !== "$0.00") {
              return true;
            }
          }
        }
        return false;
      });


      if (unpaid_due) {
        resolve(await cl_unpaid(page, data)); // uses updated notes logic
      } else {
        resolve(await cl_paid(page, data));
      }

    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

// Express API handler
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent("Mozilla/5.0");
    page.setDefaultNavigationTimeout(90000);

    const result = await cl_account_search(page, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", result);
    } else {
      res.status(200).json({ result });
    }

    await context.close();
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = { search };