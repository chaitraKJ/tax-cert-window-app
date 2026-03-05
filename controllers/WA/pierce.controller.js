//Author-> Harsh 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("input#parcelSearchInput");
      await page.locator("input#parcelSearchInput").fill(account);

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.keyboard.press("Enter"),
      ]);

      const links = await page.evaluate(() => {
        let links = {
          summary: "",
          taxes: "",
        };

        document.querySelectorAll(".pc-tabset ul li").forEach((li, i) => {
          if (i < 2) {
            if (i === 0) {
              links.summary = li.querySelector("a").href;
            }
            if (i === 1) {
              links.taxes = li.querySelector("a").href;
            }
          }
        });

        return links;
      });

      resolve(links);
    } catch (error) {
      console.log(error);
      reject(new Error("Record Not Found"));
    }
  });
};
const ac_2 = async (page, links) => {
  return new Promise(async (resolve, reject) => {
    try {
      // --------- STEP 1: Grab Summary Info ---------
      await page.goto(links.summary, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".panel-body");

      const BaseData = await page.evaluate(() => {
        const result = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "-",
          borrower_name: "-",
          owner_name: [],
          property_address: "-",
          parcel_number: "-",
          land_value: "-",
          improvements: "-",
          total_assessed_value: "$0.00",
          exemption: "-",
          total_taxable_value: "$0.00",
          taxing_authority:
            "Pierce County Assessor-Treasurer,Marty Campbell,2401 South 35th St Room 142,Tacoma, Washington 98409",
          notes: "-",
          delinquent: "-",
          tax_history: [],
        };

        const tables = document.querySelectorAll(".panel-body table");
        tables.forEach((table, i) => {
          const rows = [...table.querySelectorAll("tr")].map(tr =>
            tr.querySelectorAll("td")
          );

          if (i === 0) {
            result.parcel_number = rows[0][1]?.textContent.trim() || "-";
            result.property_address = rows[1][1]?.textContent.trim() || "-";
          }
          if (i === 1) {
            result.owner_name.push(rows[0][1]?.textContent.trim() || "-");
          }
          if (i === 5) {
            result.total_taxable_value = "$" + (rows[0][1]?.textContent.trim() || "0.00");
            result.total_assessed_value = "$" + (rows[1][1]?.textContent.trim() || "0.00");
          }
        });

        return result;
      });

      // --------- STEP 2: Scrape Tax History ---------
      await page.goto(links.taxes, { waitUntil: "domcontentloaded" });

      // Wait for the table that contains history rows
      await page.waitForSelector(".pc-responsive-table", { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000)); // ensure table is rendered

      const taxHistory = await page.evaluate(() => {
        const history = [];

        const tables = document.querySelectorAll(".pc-responsive-table");
        if (!tables || tables.length === 0) return history;

        // The last table usually contains full paid history
        const taxTable = tables[tables.length - 1];
        const rows = Array.from(taxTable.querySelectorAll("tr")).slice(1); // skip header

        rows.forEach(tr => {
          const tds = tr.querySelectorAll("td");
          if (tds.length >= 3) {
            const paidDate = tds[0]?.textContent.trim() || "-";
            const yearMatch = paidDate.match(/\d{4}$/);
            const year = yearMatch ? yearMatch[0] : "-";

            const amount = tds[2]?.textContent.trim() || "$0.00";

            history.push({
              jurisdiction: "County",
              year,
              payment_type: "-", // will calculate later
              status: "Paid",
              base_amount: amount.startsWith("$") ? amount : "$" + amount,
              amount_paid: amount.startsWith("$") ? amount : "$" + amount,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "-",
              delq_date: "-",
              paid_date: paidDate,
              good_through_date: "-",
              link: "-",
            });
          }
        });

        // Determine payment_type dynamically
        const yearCounts = {};
        history.forEach(h => yearCounts[h.year] = (yearCounts[h.year] || 0) + 1);
        history.forEach(h => {
          h.payment_type = yearCounts[h.year] === 1 ? "Annual" : "Semi-Annual";

          if (h.payment_type === "Annual") {
            h.due_date = `04/30/${h.year}`;
            h.delq_date = `05/01/${h.year}`;
          } else {
            const paid = new Date(h.paid_date);
            if (!isNaN(paid)) {
              // First half: before July => April, Second half: after July => October
              if (paid.getMonth() < 6) {
                h.due_date = `04/30/${h.year}`;
                h.delq_date = `05/01/${h.year}`;
              } else {
                h.due_date = `10/31/${h.year}`;
                h.delq_date = `11/01/${h.year}`;
              }
            } else {
              // fallback
              h.due_date = `04/30/${h.year}`;
              h.delq_date = `05/01/${h.year}`;
            }
          }
        });


        return history;
      });

      BaseData.tax_history = taxHistory;

      // --------- STEP 3: Delinquent & Notes ---------
      if (taxHistory.length) {
        const today = new Date();
        const maxYear = Math.max(...taxHistory.map(t => Number(t.year)));

        BaseData.tax_history.forEach(t => {
          if (t.amount_paid !== "$0.00") t.status = "Paid";
          else if (t.due_date && today < new Date(t.due_date)) t.status = "Due";
          else if (t.delq_date && today > new Date(t.delq_date)) t.status = "Delinquent";
        });

        // Keep latest year + any unpaid prior years
        BaseData.tax_history = BaseData.tax_history.filter(
          t => Number(t.year) === maxYear || t.status !== "Paid"
        );

        BaseData.delinquent = BaseData.tax_history.some(t => t.status === "Delinquent")
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        const priorUnpaid = BaseData.tax_history.some(t => Number(t.year) < maxYear && t.status !== "Paid");
        const maxYearRecords = BaseData.tax_history.filter(t => Number(t.year) === maxYear);

        let firstStatus = maxYearRecords[0]?.status.toUpperCase() || "";
        let secondStatus = maxYearRecords[1]?.status.toUpperCase() || "";

        if (maxYearRecords.length === 1) {
          BaseData.notes = `${priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${maxYear}: ANNUAL TAX STATUS IS ${firstStatus}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 04/30.`;
        } else {
          BaseData.notes = `${priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
        }
      }

      resolve(BaseData);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};




const account_search = (page, url, account) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url, account)
      .then((links) => ac_2(page, links))
      .then((data) => {
        resolve(data);
      })
      .catch((error) => reject(error));
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const url = "https://atip.piercecountywa.gov/app/v2/parcelSearch/search";

    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render("error_data", {
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

    // page.setDefaultNavigationTimeout(90000);

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

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page, url, account)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", {
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
        .then((data) => {
          res.status(200).json({
            result: data,
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
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
      res.status(200).render("error_data", {
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

export { search };