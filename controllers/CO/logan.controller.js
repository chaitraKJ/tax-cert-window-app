//author: Harsh jha - Fixed by Assistant
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

// Helper function to clean dollar amounts
const cleanAmount = (str) => {
  if (!str) return 0;
  return parseFloat(str.replace(/[$,]/g, "")) || 0;
};

// Helper function to format amounts as currency
const formatDollar = (amount) => {
  const num = typeof amount === 'string' ? cleanAmount(amount) : amount;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ac_1 = async (page, url, account) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", ...timeout_option });
    await page.waitForSelector(".submitButton.btn.btn-primary", {
      ...timeout_option,
    });
    await page.click(".submitButton.btn.btn-primary");

    await page.waitForSelector("#primary_search", { ...timeout_option });
    await page.type("#primary_search", account, { delay: 100 });

    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        ...timeout_option,
      }),
      page.keyboard.press("Enter"),
    ]);

    await page.waitForSelector("#prccontent", { ...timeout_option });

    const data = await page.evaluate(() => {
      const header = document.querySelector("header.record-card-header");
      if (!header) return {};

      // Extract header information
      const parcelNumber =
        header.querySelector(".owner .value")?.textContent.trim() || "N/A";
      const propertyAddress =
        header.querySelector(".location .value")?.textContent.trim() || "N/A";
      const totalValue =
        header
          .querySelector(".valuation .text-highlight .value")
          ?.textContent.trim() || "N/A";

      // Extract all data lists
      const dataLists = document.querySelectorAll(".data-list");

      // Owner information from first data list (Overview section)
      const ownerValue =
        dataLists[0]?.querySelectorAll("li .value")[2]?.textContent.trim() ||
        "N/A";

      // Assessment values from second data list (Assessment Information section)
      let landValueActual = "";
      let landValueAssessed = "";
      let improvementActual = "";
      let improvementAssessed = "";
      let totalActual = "";
      let totalAssessed = "";

      if (dataLists[1]) {
        const assessmentRows =
          dataLists[1].querySelectorAll("li.data-list-row");
        assessmentRows.forEach((row) => {
          const title = row.querySelector(".title")?.textContent.trim();
          const values = row.querySelectorAll(".value");

          if (title === "Land" && values.length >= 2) {
            landValueActual = values[0]?.textContent.trim() || "";
            landValueAssessed = values[1]?.textContent.trim() || "";
          } else if (title === "Improvement" && values.length >= 2) {
            improvementActual = values[0]?.textContent.trim() || "";
            improvementAssessed = values[1]?.textContent.trim() || "";
          } else if (title === "Total" && values.length >= 2) {
            totalActual = values[0]?.textContent.trim() || "";
            totalAssessed = values[1]?.textContent.trim() || "";
          }
        });
      }

      // Tax Information from Tax Information section
      let taxYear = "";
      let statementNumber = "";
      let totalTaxes = "";
      let firstHalfDue = "";
      let secondHalfDue = "";

      const taxSection = document.querySelector("#TaxInformation");
      if (taxSection) {
        const taxDataList = taxSection.querySelector(".data-list");
        if (taxDataList) {
          const taxRows = taxDataList.querySelectorAll("li.data-list-row");
          taxRows.forEach((row) => {
            const title = row.querySelector(".title")?.textContent.trim();
            const value = row.querySelector(".value")?.textContent.trim();

            if (title === "Tax Year") taxYear = value || "";
            else if (title === "Statement #") statementNumber = value || "";
            else if (title === "Total Taxes") totalTaxes = value || "";
            else if (title === "First Half Due") firstHalfDue = value || "";
            else if (title === "Second Half Due") secondHalfDue = value || "";
          });
        }
      }

      // Build tax history
      const tax_history = [];
      if (taxYear && totalTaxes) {
        const firstHalfAmount =
          parseFloat(firstHalfDue.replace(/[$,]/g, "")) || 0;
        const secondHalfAmount =
          parseFloat(secondHalfDue.replace(/[$,]/g, "")) || 0;
        const totalAmount = parseFloat(totalTaxes.replace(/[$,]/g, "")) || 0;

        // Determine status based on amounts due
        const isPaid = firstHalfAmount === 0 && secondHalfAmount === 0;
        dueYear=parseInt(taxYear)+1;

        if (firstHalfAmount > 0) {
          tax_history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: "Due",
            base_amount: firstHalfDue,
            amount_paid: "$0.00",
            amount_due: firstHalfDue,
            mailing_date: "N/A",
            due_date: "02/28/" + dueYear,
            delq_date: "03/01/" + dueYear,
            paid_date: "-",
            good_through_date: "",
            link: "-",
          });
        }

        if (secondHalfAmount > 0) {
          tax_history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: "Due",
            base_amount: secondHalfDue,
            amount_paid: "$0.00",
            amount_due: secondHalfDue,
            mailing_date: "N/A",
            due_date: "06/15/" + dueYear,
            delq_date: "06/16/" + dueYear,
            paid_date: "-",
            good_through_date: "",
            link: "-",
          });
        }

        if (isPaid) {
          tax_history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Annual",
            status: "Paid",
            base_amount: totalTaxes,
            amount_paid: totalTaxes,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: "10/01/" + dueYear,
            delq_date: "12/31/" + dueYear,
            paid_date: "N/A",
            good_through_date: "",
            link: "-",
          });
        }
      }

      // Determine delinquency status
      const delinquent =
        parseFloat(firstHalfDue.replace(/[$,]/g, "")) > 0 ||
        parseFloat(secondHalfDue.replace(/[$,]/g, "")) > 0
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

      // Build notes
      let notes = "";

      if (delinquent === "NONE") {
        notes = `ALL PRIOR YEARS ARE PAID. ${taxYear}: ANNUAL TAX STATUS IS PAID, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 10/01`;
      } else {
        // Only build dynamic notes if tax is due
        notes = `${taxYear}: TOTAL TAXES ARE ${totalTaxes}, STATUS IS DUE.`;

        if (parseFloat(firstHalfDue.replace(/[$,]/g, "")) > 0) {
          notes += ` FIRST HALF DUE: ${firstHalfDue}.`;
        }

        if (parseFloat(secondHalfDue.replace(/[$,]/g, "")) > 0) {
          notes += ` SECOND HALF DUE: ${secondHalfDue}.`;
        }
        
        notes += ` NORMAL DUE DATE IS 10/01, DELINQUENT AFTER 12/31.`;
      }

      return {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: ownerValue
          ? ownerValue.split(";").map((name) => name.trim())
          : [],
        property_address: propertyAddress,
        parcel_number: parcelNumber,
        land_value: landValueActual || totalValue,
        improvements: improvementActual || "",
        total_assessed_value: totalAssessed || "",
        exemption: "",
        total_taxable_value: totalAssessed || "",
        taxing_authority:
          "LOGAN COUNTY TREASURER, 315 Main Street Suite 4, Sterling, CO 80751",
        notes: notes,
        delinquent: delinquent,
        tax_history: tax_history,
      };
    });

    return data;
  } catch (error) {
    console.error("Error in ac_1:", error);
    throw new Error(error.message);
  }
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account)
        .then((data) => {
          resolve(data);
        })
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
  try {
    const url = "https://property.spatialest.com/co/logan#/";

    if (!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
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

    page.setDefaultNavigationTimeout(90000);

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
