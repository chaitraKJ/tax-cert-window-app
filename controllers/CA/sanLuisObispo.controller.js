//author: Harsh jha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

//timed option
const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#tblInstallmentInfo2", timeout_option);

      console.log("going to data");
      const data = await page.evaluate(() => {
        const data = {
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
          taxing_authority:
            "County of San Luis Obispo, CA, Auditor - Controller - Treasurer - Tax Collector - Public Administrator",
          tax_history: [],
        };

        // OWNER NAME
        try {
          const ownerEl = document.querySelector(
            'table[width="625"] + table[width="625"] tr td'
          );
          if (ownerEl) {
            const owner = ownerEl.textContent.trim();
            if (owner) data.owner_name = [owner];
          }

          const billText = document
            .querySelector("table tbody tr td[align='right']")
            ?.textContent.trim();

          // Extract the year part using regex
          const yearMatch = billText.match(/(\d{4})\/(\d{2})/);

          let maxYear = "";

          if (yearMatch) {
            const startYear = yearMatch[1];
            const endYear = "20" + yearMatch[2];
            maxYear = `${startYear}-${endYear}`;
          }

          data.property_address = document
            .querySelectorAll('table[width="625"]')[3]
            .querySelector("tr")
            .nextElementSibling.textContent.replace(/\s+/g, " ")
            .split("Assessment Number:")[0]
            .trim();

          data.parcel_number = document
            .querySelectorAll('table[width="625"]')[3]
            .querySelector("tr")
            .nextElementSibling.textContent.replace(/\s+/g, " ")
            .split("Assessment Number:")[1]
            .trim();

          // Assume `document` context (browser)
          const rows = Array.from(
            document.querySelectorAll("#tblInstallmentInfo2 tr")
          );

          // Extract values by row
          const getCell = (rowIndex, colIndex) =>
            rows[rowIndex]
              ?.querySelectorAll("td")
              [colIndex]?.textContent.trim() || "";

          // Common fields
          const jurisdiction = "County";
          const taxYear = maxYear;
          const mailing_date = "N/A";
          const good_through_date = "";
          const link = "";

          // Helper to parse MM/DD/YYYY string into Date
          const parseDate = (str) => {
            if (!str) return null;
            const [month, day, year] = str.split("/").map(Number);
            return new Date(year, month - 1, day);
          };

          // Helper to calculate status
          const getStatus = (dueDateStr, delqDateStr, paidDateStr) => {
            if (paidDateStr && paidDateStr.trim() !== "") return "Paid";

            const dueDate = parseDate(dueDateStr);
            const delqDate = parseDate(delqDateStr);
            const today = new Date();

            if (!dueDate || !delqDate) return "Due";

            if (today > delqDate) return "Delinquent";
            return "Due";
          };

          // First Installment
          const firstInstallment = {
            jurisdiction,
            year: taxYear,
            payment_type: "1st Installment",
            status: getStatus(getCell(1, 1), getCell(2, 1), getCell(10, 1)),
            base_amount: getCell(3, 1),
            amount_paid: getCell(9, 1),
            amount_due: getCell(8, 1),
            mailing_date,
            due_date: getCell(1, 1),
            delq_date: getCell(2, 1),
            paid_date: getCell(10, 1),
            good_through_date,
            link,
          };

          // Second Installment
          const secondInstallment = {
            jurisdiction,
            year: taxYear,
            payment_type: "2nd Installment",
            status: getStatus(getCell(1, 2), getCell(2, 2), getCell(10, 2)),
            base_amount: getCell(3, 2),
            amount_paid: getCell(9, 2),
            amount_due: getCell(8, 2),
            mailing_date,
            due_date: getCell(1, 2),
            delq_date: getCell(2, 2),
            paid_date: getCell(10, 2),
            good_through_date,
            link,
          };

          data.tax_history.push(firstInstallment, secondInstallment);
        } catch {}
        data.tax_history.forEach((el) => {
          if (!el.year) return; // skip if year missing
          const yearNum = Number(el.year.split("-")[0]);
          if (isNaN(yearNum)) return;

          if (el.payment_type?.trim() === "2nd Installment") {
            el.delq_date = `04/11/${yearNum + 1}`;
          } else if (el.payment_type?.trim() === "1st Installment") {
            el.delq_date = `12/11/${yearNum}`;
          }
        });

        // Sort tax history in ascending order by year (e.g., 2019-2020 → 2025-2026)
        data.tax_history.sort((a, b) => {
          const yearA = Number(a.year.split("-")[0]);
          const yearB = Number(b.year.split("-")[0]);
          return yearA - yearB;
        });

        // Find the most recent tax year
        const maxYear = Math.max(
          ...data.tax_history.map((el) => Number(el.year.split("-")[0]))
        );

        // Check if any prior year (before maxYear) has delinquent status
        const priorDelinquent = data.tax_history.some(
          (el) =>
            Number(el.year.split("-")[0]) < maxYear &&
            el.status.toLowerCase() === "delinquent"
        );

        // Assign delinquent message
        data.delinquent = priorDelinquent
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        // Filter current year records
        const currentYearRecords = data.tax_history.filter(
          (el) => Number(el.year.split("-")[0]) === maxYear
        );

        // Prepare notes based on installment count
        let notes = priorDelinquent
          ? "PRIOR YEARS ARE DELINQUENT"
          : "ALL PRIOR YEARS ARE PAID";

        if (currentYearRecords.length === 1) {
          const first = currentYearRecords[0];
          notes += `. ${maxYear}: ANNUAL TAX STATUS IS ${first.status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS ${
            first.due_date
          }.`;
        } else if (currentYearRecords.length >= 2) {
          currentYearRecords.sort((a, b) =>
            a.payment_type.localeCompare(b.payment_type)
          );

          const first = currentYearRecords[0];
          const second = currentYearRecords[1];

          notes += `. ${maxYear}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE ${
            first.due_date
          } AND ${second.due_date}.`;
        }

        data.notes = notes;

        return data;
      });

      resolve(data);
    } catch (error) {
      console.error("❌ ERROR in ac_1:", error);
      reject(new Error("Record Not Found"));
    }
  });
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

  const urlAccount = account
    .replace(/[^\d]/g, "")
    .replace(/(\d{3})(?=\d)/g, "$1,");

  try {
    const url = `https://services.slocountytax.org/Detail.aspx?lblBillnum=${urlAccount}&csus=0`;

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

    page.setDefaultNavigationTimeout(90000);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        // req.resourceType() === "stylesheet" ||
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
