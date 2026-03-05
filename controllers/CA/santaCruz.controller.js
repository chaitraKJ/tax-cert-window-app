//author: Harsh jha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Puppeteer timeout configuration
const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        ...timeout_option,
      });

      await Promise.all([
        page.waitForSelector("input[name='Parcel']", timeout_option),
        page.waitForSelector("input[name='submitbutton']", timeout_option),
      ]);

      // Fill parcel number
      await page.$eval(
        "input[name='Parcel']",
        (el, val) => (el.value = val),
        account
      );

      // ✅ Safe click + wait for navigation
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.click("input[name='submitbutton']"),
      ]);

      // Wait until bills appear
      await page.waitForSelector(".TaxBillContainer tbody", timeout_option);
      await page.waitForSelector(
        ".TTCButton[value='Show Tax Bill History']",
        timeout_option
      );
      await page.waitForSelector(".TaxBillContainer tbody", timeout_option);
      await page.waitForSelector(".TaxBillContainer a", timeout_option);

      const data = await page.evaluate(() => {
        let data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "-",
          borrower_name: "-",
          owner_name: ["N/A"],
          property_address: "N/A",
          parcel_number: "N/A",
          land_value: "-",
          improvements: "-",
          total_assessed_value: "N/A",
          exemption: "-",
          total_taxable_value: "N/A",
          notes: "-",
          delinquent: "-",
          taxing_authority:
            "Santa Cruz CA 95060 , 701 Ocean Street, RM 150",
          tax_history: [],
        };

        let deliquent = false;

        document.querySelectorAll(".BigText").forEach((el) => {
          const text = el.textContent.trim().toLowerCase();

          if (text.includes("parcel")) {
            data.parcel_number =
              el.nextElementSibling?.textContent.trim() || "";
          }

          if (text.includes("situs")) {
            data.property_address =
              el.nextElementSibling?.textContent.trim() || "";
          }
        });

        const TaxHistoryBody = document.querySelectorAll(
          ".TaxBillContainer tbody"
        );

        if (TaxHistoryBody.length > 1) {
          deliquent = true;
        }

        if (TaxHistoryBody) {
          TaxHistoryBody.forEach((tbody) => {
            const trs = tbody.querySelectorAll("tr");
            let year = "";

            trs.forEach((tr, j) => {
              if (j === 0) {
                const headerEl = tr.querySelector(".TaxBillHeader");
                if (headerEl)
                  year = headerEl.textContent.trim().split(" Annual")[0].trim();
                return;
              }

              if (tr.querySelector("th")) return;

              const tds = tr.querySelectorAll("td");
              if (tds.length >= 4) {
                const installment = tds[0].textContent.trim();
                if (/both/i.test(installment)) return;

                const dueDate = tds[1].textContent.trim() || "N/A";

                let delqDate = "N/A";

                if (dueDate !== "N/A") {
                  const date = new Date(dueDate);
                  date.setDate(date.getDate() + 1); 

                  const month = String(date.getMonth() + 1).padStart(2, "0"); 
                  const day = String(date.getDate()).padStart(2, "0");
                  const year = date.getFullYear();

                  delqDate = `${month}/${day}/${year}`;
                }

                const paidDateText = tds[2].textContent.trim();
                const paidDate = paidDateText.toLowerCase().includes("not")
                  ? ""
                  : paidDateText || "N/A";
                const amount = tds[3].textContent.trim() || "$0.00";
                const status =
                  paidDate === "" || paidDate === "N/A" ? "Due" : "Paid";

                let payment_type = "Other";
                const lower = installment.toLowerCase();
                if (lower.includes("first")) payment_type = "1st Installment";
                else if (lower.includes("second"))
                  payment_type = "2nd Installment";
                else if (lower.includes("annual")) payment_type = "Annual";

                data.tax_history.push({
                  jurisdiction: "County",
                  year,
                  payment_type,
                  status,
                  base_amount: amount,
                  amount_paid: status === "Paid" ? amount : "$0.00",
                  amount_due: status === "Due" ? amount : "$0.00",
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: delqDate || "N/A",
                  paid_date: paidDate,
                  good_through_date: "",
                  link: tr.querySelector("a")?.href || "",
                });
              }
            });
          });
        }

        // Handle delinquent label
        data.delinquent = deliquent
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        // Build detailed notes logic
        const priorDelinquent = deliquent;

        // Extract numeric years safely from things like "2025 - 2026"
        const numericYears = data.tax_history.map((el) => {
          const match = el.year.match(/\d{4}/);
          return match ? parseInt(match[0]) : 0;
        });

        const maxYear = Math.max(...numericYears);

        const currentYearRecords = data.tax_history.filter((el) =>
          el.year.includes(maxYear)
        );

        let notes = priorDelinquent
          ? "PRIOR YEARS ARE DELINQUENT"
          : "ALL PRIOR YEARS ARE PAID";

        if (currentYearRecords.length === 1) {
          const first = currentYearRecords[0];
          notes += `. ${
            first.year
          }: ANNUAL TAX STATUS IS ${first.status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS ${
            first.due_date
          }.`;
        } else if (currentYearRecords.length >= 2) {
          currentYearRecords.sort((a, b) =>
            a.payment_type.localeCompare(b.payment_type)
          );

          const first = currentYearRecords[0];
          const second = currentYearRecords[1];

          notes += `. ${
            first.year
          }: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE ${
            first.due_date
          } AND ${second.due_date}.`;
        }

        data.notes = notes;

        return data;
      });

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.click(".TaxBillContainer a"),
      ]);

      const val = await page.evaluate(() => {
        return document
          .querySelector(".TBorderIndentRAlign")
          .textContent.trim();
      });
      data.total_assessed_value = val;
      data.total_taxable_value = val;

      resolve(data);
    } catch (error) {
      console.error("Error in ac_1:", error);
      reject(error);
    }
  });
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account)
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

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  // Basic validation for account number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid account number",
    });
  }

  try {
    // Construct target URL dynamically
    const url = `https://ttc.co.santa-cruz.ca.us/taxbills/`;

    // Reject unknown request type
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
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
    if (fetch_type == "html") {
      account_search(page, url, account)
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
    } else if (fetch_type == "api") {
      account_search(page, url, account)
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
