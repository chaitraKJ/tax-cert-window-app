//author ->  Harsh Jha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const TIMEOUT_OPTIONS = { timeout: 90000 };

const ac_1 = async (page, url, account, years = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Agree button
      await Promise.all([
        page.waitForSelector("button[id='btAgree']"),
        page.click("button[id='btAgree']"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);

      // Search parcel
      await page.waitForSelector("input[id=inpParid]");
      await page.type("input[id=inpParid]", account);
      
      await Promise.all([
        page.keyboard.press("Enter"),
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_OPTIONS.timeout,
        }),
      ]);

      // Ensure panels loaded
      await page.waitForSelector("div[name='SUMMIT_PARCEL']");
      await page.waitForSelector("div[name='LAND_SUMMARY_PROFILE']");
      await page.waitForSelector("div[name='ASSESSVALUE']");
      await page.waitForSelector("div[name='TAXES_DUE']");
      await page.waitForSelector("div[name='SUMMIT_OWNER4']");

      // Extract main data
      const data = await page.evaluate(() => {
        let data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "$0.00",
          exemption: "",
          total_taxable_value: "$0.00",
          taxing_authority:
            "Summit County Fiscal Office, 175 South Main Street, Akron, OH 44308",
          notes: "",
          delinquent: "",
          tax_history: [],
          tax_year_detailes: {},
        };
        data.parcel_number = document
          .querySelector(".DataletHeaderTop > .DataletHeaderTop")
          .textContent.trim()
          .split(":")[1]
          .trim();

        data.property_address = document
          .querySelector(
            "table[id='Basic Information'] tr:nth-of-type(2) td:nth-of-type(2)"
          )
          .textContent.trim()
          .replace(/,\s*,/g, ",")
          .replace(/-$/, "")
          .replace(/\s+/g, " ")
          .trim();

        // Owner names
        const ownerRows = document.querySelectorAll(
          "div[name='SUMMIT_OWNER4'] table[id='Owner(s)'] tr"
        );
        ownerRows.forEach((tr, i) => {
          if (i === 0 || i === ownerRows.length - 1) return;
          const td = tr.querySelector("td");
          if (td) data.owner_name.push(td.textContent.trim());
        });

        // Land value
        const landEl = document.querySelector(
          "div[name='LAND_SUMMARY_PROFILE'] td.DataletData:nth-of-type(5)"
        );
        data.land_value = landEl ? "$" + landEl.textContent.trim() : "$0.00";

        // Total assessed & taxable value
        const assessed = Array.from(
          document.querySelectorAll(
            "div[name='ASSESSVALUE'] .DataletSideHeading"
          )
        )
          .find((el) => el.textContent.trim() === "Assessed Total")
          ?.nextElementSibling?.textContent.trim();

        if (assessed) {
          data.total_assessed_value = assessed;
          data.total_taxable_value = assessed;
        }

        // TAX YEAR DETAILS
        const rows = document.querySelectorAll(
          "div[name='TAXES_DUE'] table[id='Taxes Due'] tbody tr"
        );
        rows.forEach((tr) => {
          const label = tr
            .querySelector(".DataletSideHeading")
            ?.textContent.trim();
          const value = tr.querySelector(".DataletData")?.textContent.trim();
          if (!label || !value) return;

          if (label === "Tax Year") data.tax_year_detailes.tax_year = value;
          if (label === "Prior Due") data.tax_year_detailes.prior_due = value;
          if (label === "First Half Due")
            data.tax_year_detailes.first_half_due = value;
          if (label === "1st Half Due Date")
            data.tax_year_detailes.first_half_due_date = value;
          if (label === "Second Half Due")
            data.tax_year_detailes.second_half_due = value;
          if (label === "2nd Half Due Date")
            data.tax_year_detailes.second_half_due_date = value;
          if (label === "Total Due") data.tax_year_detailes.total_due = value;
        });

        return data;
      });

      // Sidebar click functions
      const clickPaymentHistory = async () =>
        await page.$$eval(".contentpanel #sidemenu li", (items) => {
          items.forEach((li) => {
            const span = li.querySelector("span");
            if (span && span.textContent.trim() === "Payment History") {
              li.querySelector("a")?.click();
            }
          });
        });

      // Navigate to Payment History
      await Promise.all([
        clickPaymentHistory(),
        page.waitForNavigation(),
        page.waitForSelector("table[id='Payment History']"),
      ]);

      // Extract payment history
      const taxHistory = await page.evaluate(() => {
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr === "N/A") return "";
          try {
            const months = {
              JAN: "01",
              FEB: "02",
              MAR: "03",
              APR: "04",
              MAY: "05",
              JUN: "06",
              JUL: "07",
              AUG: "08",
              SEP: "09",
              OCT: "10",
              NOV: "11",
              DEC: "12",
            };
            const parts = dateStr.split("-");
            if (parts.length !== 3) return dateStr;

            const day = parts[0].padStart(2, "0");
            const month = months[parts[1].toUpperCase()] || parts[1];
            let year = parts[2];

            if (year.length === 2) {
              const y = parseInt(year);
              year = y <= 50 ? "20" + year : "19" + year;
            }

            return `${month}/${day}/${year}`;
          } catch {
            return dateStr;
          }
        };

        const history = [];
        const table = document.querySelector(
          "div[name='TAXPAYMENTS'] table[id='Payment History']"
        );

        if (!table) return [];

        const trs = table.querySelectorAll("tbody tr");

        trs.forEach((tr, i) => {
          if (i === 0) return;

          const tds = tr.querySelectorAll("td");
          if (tds.length < 7) return;

          const taxYear = tds[1]?.textContent.trim();
          const paymentType = tds[3]?.textContent.trim();
          const paidDate = tds[4]?.textContent.trim();
          const amount = tds[6]?.textContent.trim();

          if (paymentType !== "PRE") {
            history.push({
              jurisdiction: "County",
              year: taxYear,
              payment_type: "Semi-annual",
              status: "Paid",
              base_amount: amount,
              amount_paid: amount,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: formatDate(paidDate),
              good_through_date: "",
              link: "",
            });
          }
        });

        return history;
      });

      // Filter based on years parameter (like Ashtabula)
      const currentYear = Number(data.tax_year_detailes.tax_year);
      
      // Filter to get only the requested number of years
      const yearNumbers = [...new Set(taxHistory.map(el => Number(el.year)))]
        .sort((a, b) => b - a)
        .slice(0, years);
      
      data.tax_history = taxHistory.filter(el => 
        yearNumbers.includes(Number(el.year))
      );

      // Add due + delq dates
      data.tax_history.forEach((item) => {
        if (!item.paid_date) return;

        const year = parseInt(item.year);
        if (!year) return;

        const nextYear = year + 1;

        const dueDate = new Date(`${nextYear}-02-28`);
        const delqDate = new Date(`${nextYear}-07-18`);

        const format = (date) => {
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          const dd = String(date.getDate()).padStart(2, "0");
          const yyyy = date.getFullYear();
          return `${mm}/${dd}/${yyyy}`;
        };

        item.due_date = format(dueDate);
        item.delq_date = format(delqDate);
      });

      // Fix delinquent flag
      let delinquent = false;
      if (
        data.tax_year_detailes.prior_due &&
        data.tax_year_detailes.prior_due !== "$.00"
      ) {
        delinquent = true;
      }

      // NOTES generation - Updated to handle multiple years like Ashtabula
      let notes = "";
      const priorYearsStatus = delinquent
        ? "PRIOR YEARS ARE DELINQUENT"
        : "ALL PRIOR YEARS ARE PAID";

      // Get unique years from tax history
      const uniqueYears = [...new Set(data.tax_history.map(item => item.year))];
      
      // Sort years in descending order
      uniqueYears.sort((a, b) => parseInt(b) - parseInt(a));

      notes = `${priorYearsStatus}.`;

      // Build status for each year
      uniqueYears.forEach((year) => {
        const yearItems = data.tax_history.filter(item => item.year === year);
        
        if (yearItems.length >= 2) {
          notes += ` ${year}: 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID,`;
        } else if (yearItems.length === 1) {
          notes += ` ${year}: TAX STATUS IS PAID,`;
        }
      });

      // Remove trailing comma and add final statement
      notes = notes.replace(/,$/, "");
      notes += " NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 03/05 AND 07/16.";

      data.notes = notes;

      data.delinquent = delinquent
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      resolve(data);
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};

const account_search = (page, url, account, years) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url, account, years)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        console.error(err);
        reject(err);
      });
  });
};

const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;

  // Get years configuration from company settings (like Ashtabula)
  const finalYears = getOHCompanyYears(client);

  // Validate account number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      error: true,
      message: "Please enter a valid account number",
    });
  }

  // Validate fetch_type
  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    const errorResponse = {
      error: true,
      message: "Invalid Access. fetch_type must be 'html' or 'api'",
    };

    return fetch_type === "html"
      ? res.status(400).render("error_data", errorResponse)
      : res.status(400).json(errorResponse);
  }

  let context;

  try {
    const url = `https://propertyaccess.summitoh.net/search/commonsearch.aspx?mode=realprop`;

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(TIMEOUT_OPTIONS.timeout);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        req.resourceType() === "stylesheet" ||
        req.resourceType() === "font" ||
        req.resourceType() === "image"
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      // FRONTEND ENDPOINT
      account_search(page, url, account, finalYears)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", {
            error: true,
            message: error.message || error,
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });
    } else if (fetch_type === "api") {
      // API ENDPOINT
      account_search(page, url, account, finalYears)
        .then((data) => {
          res.status(200).json({
            result: data,
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message || error,
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (context) await context.close();

    if (fetch_type === "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message || "An error occurred during the search",
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message || "An error occurred during the search",
      });
    }
  }
};

export { search };