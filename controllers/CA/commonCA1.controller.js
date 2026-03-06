//author: Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// County configuration 
const counties = [
  {
    county: "alpine",
    url: "https://countytaxretriever.com/bills/bill_detailed/16",
    taxing_authority:
      "Alpine County, Treasurer - Tax Collector, 99 Water Street, P.O. Box 217 Markleeville, CA, 96120",
  },
  {
    county: "lassen",
    url: "https://countytaxretriever.com/bills/bill_detailed/4", 
    taxing_authority:
      "Lassen County, 220 S. Lassen St. Ste. 3, Susanville, CA, 96130",
  },
  {
    county: "sierra",
    url: "https://countytaxretriever.com/bills/bill_detailed/15",
    taxing_authority:
      "Sierra County Treasurer, P.O. Drawer D, Downieville, CA, 96119",
  },
];

// Puppeteer timeout 
const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account, taxing_authority) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Load tax bill details page
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#overview-count", { ...timeout_option });

      const data = await page.evaluate((authority) => {
        let data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: ["N/A"],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "N/A",
          exemption: "",
          total_taxable_value: "N/A",
          notes: "",
          delinquent: "",
          taxing_authority: authority,
          tax_history: [],
        };

        // Extract due amounts from summary sections
        const historyCheacker = {
          SecuredAmountDue:
            "$" +
              document
                .querySelector("#overview-count p")
                ?.textContent.split("$")[1]
                ?.trim() || "",
          SupplementalAmountDue:
            "$" +
              document
                .querySelector("#supplemental")
                ?.textContent.split("$")[1]
                ?.trim() || "",
          DelinquentAmountDue:
            "$" +
              document
                .querySelector("#delinquent")
                ?.textContent.split("$")[1]
                ?.trim() || "",
        };

        // Extract parcel number from title
        data.parcel_number =
          document.querySelector("h1")?.textContent.split(":")[1]?.trim() || "";

        // Parse secured bills table for installment details
        document
          .querySelectorAll(
            ".bills.bs-label.bs-label-secured.span12 form table tr"
          )
          .forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (!tds.length) return;

            const title = tds[0].textContent.trim();

            // --- 1st Installment ---
            if (title.startsWith("1st")) {
              const amount = tds[1]?.textContent.trim() || "";
              const statusText =
                tds[2]?.querySelector("strong")?.textContent.trim() || "";

              // Extract payment or due date from last text line
              const allLines =
                tds[2]?.innerText
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean) || [];
              const date = allLines.pop();
              const year = date?.split("/")?.[2]?.trim() || "";

              const isPaid = statusText.includes("Paid");
              const isDue = !isPaid && statusText.includes("Due");

              // Add 1st installment entry
              data.tax_history.push({
                jurisdiction: "County",
                year,
                payment_type: "1st Installment",
                status: isPaid ? "Paid" : "Due",
                base_amount: amount,
                amount_paid: isPaid ? amount : "$0.00",
                amount_due: isPaid ? "$0.00" : amount,
                mailing_date: "N/A",
                due_date: isDue ? date : "",
                delq_date: "",
                paid_date: isPaid ? date : "",
                good_through_date: "",
                link: "",
              });
            }

            // --- 2nd Installment ---
            if (title.startsWith("2nd")) {
              const amount = tds[1]?.textContent.trim() || "";
              const statusText =
                tds[2]?.querySelector("strong")?.textContent.trim() || "";

              // Extract payment or due date from last text line
              const allLines =
                tds[2]?.textContent
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean) || [];
              const date = allLines.pop();
              const year = date?.split("/")?.[2]?.trim() || "";

              const isPaid = statusText.includes("Paid");
              const isDue = !isPaid && statusText.includes("Due");

              // Add 2nd installment entry
              data.tax_history.push({
                jurisdiction: "County",
                year,
                payment_type: "2nd Installment",
                status: isPaid ? "Paid" : "Due",
                base_amount: amount,
                amount_paid: isPaid ? amount : "$0.00",
                amount_due: isPaid ? "$0.00" : amount,
                mailing_date: "N/A",
                due_date: isDue ? date : "",
                delq_date: "",
                paid_date: isPaid ? date : "",
                good_through_date: "",
                link: "",
              });
            }
          });

        // Adjust years and assign default due/delinquent dates
        data.tax_history.forEach((el) => {
          if (el.payment_type === "2nd Installment" && el.status !== "Paid") {
            el.year = `${Number(el.year) - 1}`;
          }

          // Set due and delinquent dates if missing
          if (!el.due_date && el.payment_type === "1st Installment") {
            el.due_date = `11/01/${el.year}`;
            el.delq_date = `12/11/${el.year}`;
          } else if (!el.due_date && el.payment_type === "2nd Installment") {
            const nextYear = Number(el.year) + 1;
            el.due_date = `02/01/${nextYear}`;
            el.delq_date = `04/10/${nextYear}`;
          } else {
            el.delq_date =
              el.payment_type === "1st Installment"
                ? `12/11/${el.year}`
                : `04/10/${Number(el.year) + 1}`;
          }
        });

        // Determine latest tax year and delinquency status
        const maxYear = Math.max(
          ...data.tax_history.map((el) => Number(el.year))
        );

        data.delinquent =
          historyCheacker.DelinquentAmountDue &&
          historyCheacker.DelinquentAmountDue.trim() !== "$0.00"
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        // Capture status summary for notes
        let firstStatus = "";
        let secondStatus = "";

        data.tax_history.forEach((el, i) => {
          if (i === 0) firstStatus = el.status.toUpperCase();
          else if (i === 1) secondStatus = el.status.toUpperCase();
        });

        // Build human-readable notes summary
        if (data.tax_history.length === 1) {
          data.notes = `${
            historyCheacker.DelinquentAmountDue &&
            historyCheacker.DelinquentAmountDue.trim() !== "$0.00"
              ? "PRIOR YEARS ARE DELINQUENT"
              : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: ANNUAL TAX STATUS IS ${data.tax_history[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 11/01.`;
        } else {
          data.notes = `${
            historyCheacker.DelinquentAmountDue &&
            historyCheacker.DelinquentAmountDue.trim() !== "$0.00"
              ? "PRIOR YEARS ARE DELINQUENT"
              : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 11/01 AND 02/01.`;
        }
        return data;
      }, taxing_authority);

      resolve(data);
    } catch (error) {
      console.log("Error in ac_1:", error);
      reject("Record Not Found");
    }
  });
};

// Wrapper to handle the async scraping call and propagate errors
const account_search = async (page, url, account, taxing_authority) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account, taxing_authority)
        .then((data) => resolve(data))
        .catch((error) => {
          console.log(error);
          reject(new Error(error.message));
        });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  // Basic validation for account number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid account number",
    });
  }

  try {
    // Extract county from route path
    const county = req.path.replace(/^\/+/, "").toLowerCase();

    // Find county configuration
    const countyConfig = counties.find((el) => el.county === county);

    if (!countyConfig) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid county route",
      });
    }

    // Construct target URL dynamically with county ID
    const url = `${countyConfig.url}/${account.replace(/-/g, "")}`;

    // Reject unknown request type
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    // Launch Chromium instance
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    // Optimize requests: block unnecessary resources
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

    // Handle frontend rendering requests
    if (fetch_type === "html") {
      account_search(page, url, account, countyConfig.taxing_authority)
        .then((data) => res.status(200).render("parcel_data_official", data))
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

      // Handle API responses (JSON format)
    } else if (fetch_type === "api") {
      account_search(page, url, account, countyConfig.taxing_authority)
        .then((data) => {
          res.status(200).json({ result: data });
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
    if (fetch_type === "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message,
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};

module.exports = { search };

