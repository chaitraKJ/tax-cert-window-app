//author ->  Harsh Jha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = {
  timeout: 90000,
};

// Main scraping function - extracts all property data
const ac_1 = async (page, url, account, years = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

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
          "Richland County, OH, 50 Park Avenue East, Mansfield, OH 44902",
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      data = await page.evaluate((data) => {
        const ownerElem = document.querySelector(
          "#ctlBodyPane_ctl01_ctl01_sprLblOwnerTitle_lblSuppressed"
        );

        if (ownerElem && ownerElem.nextElementSibling) {
          const ownerName =
            ownerElem.nextElementSibling.textContent.trim() || "";
          if (ownerName) data.owner_name.push(ownerName);
        }

        data.property_address = document
          .querySelector(
            "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl01_pnlSingleValue"
          )
          .textContent.trim();

        document.querySelectorAll("tr").forEach((tr) => {
          const th = tr.querySelector("th");
          const tds = tr.querySelectorAll("td");

          // Extract Assessed Value from "Total Value (Assessed 35%)" row
          if (th && th.textContent.trim().includes("Total Value (Assessed 35%)")) {
            // Usually the first td after the th in this specific grid structure
            if (tds.length > 0) {
              const val = tds[0].textContent.trim();
              data.total_assessed_value = val;
              data.total_taxable_value = val;
            }
          }

          if (
            tds.length > 0 &&
            tds[0].textContent.trim() === "Charge (Use for Payments only)"
          ) {
            const delinquent = tds[4]?.textContent.trim() || "$0.00";

            if (delinquent !== "$0.00") {
              data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            } else {
              data.delinquent = "NONE";
            }

            const baseOrPaid =
              tds[5]?.textContent.trim() !== "$0.00"
                ? tds[5]?.textContent.trim()
                : tds[6]?.textContent.trim() !== "$0.00"
                ? tds[6]?.textContent.trim()
                : "$0.00";

            const cleanAmount = baseOrPaid.replace(/[()]/g, " ").trim();

            const year =
              Number(tds[2]?.textContent.trim().split("/")[2]) - 1 || "";

            data.tax_history.push({
              jurisdiction: "County",
              year,
              payment_type: "",
              status: "",
              base_amount: cleanAmount,
              amount_paid: cleanAmount || "-",
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: tds[2]?.textContent.trim() || "-",
              good_through_date: "",
              link: "-",
            });
          }
        });

        data.tax_history.forEach((el) => {
          if (el.amount_due !== "$0.00") {
            el.status = "Due";
          } else {
            el.status = "Paid";
          }
        });

        const yearCount = new Map();
        data.tax_history.forEach((h) => {
          yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
        });
        data.tax_history.forEach((h) => {
          const countForYear = yearCount.get(h.year);
          if (countForYear === 1) {
            h.payment_type = "Annual";
            h.due_date = `01/31/${h.year}`;
            h.delq_date = `02/01/${h.year}`;
          } else {
            h.payment_type = "Semi-Annual";

            const isFirstInstallment =
              data.tax_history.filter((t) => t.year === h.year).indexOf(h) ===
              0;

            if (isFirstInstallment) {
              h.due_date = `01/31/${h.year}`;
              h.delq_date = `02/01/${h.year}`;
            } else {
              h.due_date = `07/31/${h.year}`;
              h.delq_date = `08/01/${h.year}`;
            }
          }
        });

        data.tax_history.sort((a, b) => {
          return (
            a["year"] - b["year"] ||
            new Date(a["due_date"]) - new Date(b["due_date"])
          );
        });

        return data;
      }, data);

      const taxDistributionPage = await page.evaluate(() => {
        const link = document.querySelector("#taxdistribution20249 a");
        return link ? link.href : null;
      });

      if (!taxDistributionPage) {
        console.log("Tax Distribution link not found.");
        return resolve(data);
      }

      await page.goto(taxDistributionPage, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      const finaldata = await page.evaluate((data) => {
        const rows = document.querySelectorAll(".tabular-data-two-column tr");

        rows.forEach((tr) => {
          const th = tr.querySelector("th");
          const td = tr.querySelector("td");
          if (!th || !td) return;

          const label = th.textContent.trim().replace(/[:]/g, "");
          const value = td.textContent.trim();

          if (label.includes("Property Address")) data.property_address = value;
          else if (label.includes("Total Appraised Value"))
            data.land_value = value;
          else if (label.includes("Total Assessed Value")) {
            // Only update if not already set by the specific grid logic in ac_1
            if (!data.total_assessed_value || data.total_assessed_value === "$0.00") {
              data.total_assessed_value = value;
              data.total_taxable_value = value;
            }
          }
          else if (label.includes("Estimated Yearly Taxes"))
            data.total_taxable_value = value;
        });

        return data;
      }, data);

      // Filter tax history based on years parameter (like Ashtabula & Summit)
      if (finaldata.tax_history.length > 0) {
        // Get unique years and sort descending
        const uniqueYears = [
          ...new Set(finaldata.tax_history.map((el) => Number(el.year))),
        ].sort((a, b) => b - a);

        // Get the requested number of most recent years
        const selectedYears = uniqueYears.slice(0, years);

        // Filter tax history to only include selected years
        finaldata.tax_history = finaldata.tax_history.filter((el) =>
          selectedYears.includes(Number(el.year))
        );

        // Update status to Delinquent if past delq_date
        finaldata.tax_history.forEach((el) => {
          if (el.status === "Due" && el.delq_date) {
            const today = new Date();
            const delinquentDate = new Date(el.delq_date);

            if (today > delinquentDate) {
              el.status = "Delinquent";
            }
          }
        });

        // Build notes dynamically for all years (like Ashtabula)
        const maxYear = Math.max(...selectedYears);
        const priorUnpaid = finaldata.delinquent !== "NONE";

        // Get unique years from filtered tax history for notes
        const noteYears = [
          ...new Set(finaldata.tax_history.map((el) => Number(el.year))),
        ].sort((a, b) => b - a);

        let notes = `${
          priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"
        }.`;

        // Build status for each year
        noteYears.forEach((year) => {
          const yearRecords = finaldata.tax_history.filter(
            (el) => Number(el.year) === year
          );

          if (yearRecords.length === 1) {
            // Annual payment
            const status = yearRecords[0].status.toUpperCase();
            notes += ` ${year}: ANNUAL TAX IS ${status},`;
          } else if (yearRecords.length >= 2) {
            // Semi-annual payments
            const firstStatus = yearRecords[0].status.toUpperCase();
            const secondStatus = yearRecords[1].status.toUpperCase();
            notes += ` ${year}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus},`;
          }
        });

        // Remove trailing comma
        notes = notes.replace(/,$/, "");

        // Add payment type info based on most recent year
        const mostRecentYearRecords = finaldata.tax_history.filter(
          (el) => Number(el.year) === maxYear
        );

        if (mostRecentYearRecords.length === 1) {
          notes += " NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 01/31.";
        } else {
          notes +=
            " NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 01/31 AND 07/31.";
        }

        finaldata.notes = notes;
      }

      finaldata.parcel_number = account;
      resolve(finaldata);
    } catch (error) {
      reject("Scraping failed: " + error.message);
    }
  });
};

const account_search = (page, url, account, years) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url, account, years)
      .then((finaldata) => {
        resolve(finaldata);
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
    const url = `https://beacon.schneidercorp.com/Application.aspx?AppID=1067&LayerID=25465&PageTypeID=4&PageID=10349&Q=1107177421&KeyValue=${account}`;

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(timeout_option.timeout);

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