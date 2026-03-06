//author: Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//timed option
const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Navigate to the tax bill page
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("mat-card", { ...timeout_option });

      await page.waitForSelector("app-search-result", { ...timeout_option });
      const data = await page.evaluate(() => {
        // Initialize data structure for tax information
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
            "County of Santa Clara , Department of Tax and Collections,110 West Tasman Drive , CA 95134",
          tax_history: [],
        };

        const cards = document
          .querySelector("#main-content-focus")
          .nextElementSibling.querySelectorAll("mat-card");

        cards.forEach((el, i) => {
          const cardHeading = el.querySelector("h2")?.textContent.trim() || "";

          // 1️Parcel info
          if (i === 0) {
            data.parcel_number =
              el.querySelector("h2")?.textContent.split(":")[1].trim() || null;

            // Find all rows inside the card
            const rows = el.querySelectorAll(
              ".mat-line.search-result__single-line"
            );

            rows.forEach((row) => {
              const label = row.querySelector(".label")?.textContent.trim();
              const value = row
                .querySelector("span:not(.label)")
                ?.textContent.trim();

              if (label === "Property Address") {
                data.property_address = value || null;
              }
            });
            console.log(cardHeading);
          }

          // Tax history (Installments)
          if (i === 1) {
            el.querySelectorAll("app-search-result").forEach((block, j) => {
              if (j === 0) return;
              const heading = block.querySelector("h2")?.textContent.trim();

              // Check for the specific installment
              if (heading === "Installment 1") {
                let taxYear = "",
                  baseAmount = "",
                  amountPaid = "",
                  dueAmount = "",
                  dueDate = "",
                  status = "",
                  paidDate = "";

                block.querySelectorAll("mat-list-item").forEach((tr) => {
                  const labelEl = tr.querySelector(".label");
                  if (!labelEl) return;

                  const label = labelEl.textContent.trim();
                  // find the value span (not the label)
                  const valueEl = tr.querySelector(
                    ".mat-line span:not(.label)"
                  );
                  const value = valueEl?.textContent.trim() || "";

                  switch (label) {
                    case "Tax Year":
                      taxYear = value;
                      break;
                    case "Tax Amount":
                      baseAmount = value;
                      break;
                    case "Amount Paid To Date":
                      amountPaid = value;
                      break;
                    case "Balance Due":
                      dueAmount = value;
                      break;
                    case "Pay By Date":
                      dueDate = value;
                      break;
                    case "Status":
                      status = value;
                      break;
                    case "Last Payment Date":
                      paidDate = value;
                      break;
                  }
                });

                if (!data.tax_history) data.tax_history = [];

                data.tax_history.push({
                  jurisdiction: "County",
                  year: taxYear?.replace("/", "-") || "",
                  payment_type: "1st Installment",
                  status,
                  base_amount: baseAmount,
                  amount_paid: amountPaid,
                  amount_due: dueAmount,
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: "",
                  paid_date: paidDate,
                  good_through_date: "",
                  link: "",
                });
              }
              if (heading === "Installment 2") {
                let taxYear = "",
                  baseAmount = "",
                  amountPaid = "",
                  dueAmount = "",
                  dueDate = "",
                  status = "",
                  paidDate = "";

                block.querySelectorAll("mat-list-item").forEach((tr) => {
                  const labelEl = tr.querySelector(".label");
                  if (!labelEl) return;

                  const label = labelEl.textContent.trim();
                  // find the value span (not the label)
                  const valueEl = tr.querySelector(
                    ".mat-line span:not(.label)"
                  );
                  const value = valueEl?.textContent.trim() || "";

                  switch (label) {
                    case "Tax Year":
                      taxYear = value;
                      break;
                    case "Tax Amount":
                      baseAmount = value;
                      break;
                    case "Amount Paid To Date":
                      amountPaid = value;
                      break;
                    case "Balance Due":
                      dueAmount = value;
                      break;
                    case "Pay By Date":
                      dueDate = value;
                      break;
                    case "Status":
                      status = value;
                      break;
                    case "Last Payment Date":
                      paidDate = value;
                      break;
                  }
                });

                if (!data.tax_history) data.tax_history = [];

                data.tax_history.push({
                  jurisdiction: "County",
                  year: taxYear?.replace("/", "-") || "",
                  payment_type: "2nd Installment",
                  status,
                  base_amount: baseAmount,
                  amount_paid: amountPaid,
                  amount_due: dueAmount,
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: "",
                  paid_date: paidDate,
                  good_through_date: "",
                  link: "",
                });
              }
            });
          }

          //Delinquent section
          if (i === 2) {
            el.querySelectorAll("app-search-result").forEach((block, j) => {
              if (j === 0) return;

              const heading =
                block.querySelector("h2")?.textContent.trim() || "";

              let taxYear = "",
                baseAmount = "",
                amountPaid = "",
                dueAmount = "",
                dueDate = "",
                status = "",
                paidDate = "";

              block.querySelectorAll("mat-list-item").forEach((tr) => {
                const labelEl = tr.querySelector(".label");
                if (!labelEl) return;

                const label = labelEl?.textContent.trim();
                const valueEl = tr.querySelector(".mat-line span:not(.label)");
                const value = valueEl?.textContent.trim() || "";

                switch (label) {
                  case "Tax Year":
                    taxYear = value;
                    break;
                  case "Tax Amount":
                    baseAmount = value;
                    break;
                  case "Amount Paid To Date":
                    amountPaid = value;
                    break;
                  case "Balance Due":
                    dueAmount = value;
                    break;
                  case "Pay By Date":
                    dueDate = value;
                    break;
                  case "Status":
                    status = value;
                    break;
                  case "Last Payment Date":
                    paidDate = value;
                    break;
                }
              });

              // Determine payment type based on heading
              let paymentType = "";
              if (heading.toLowerCase().includes("installment 1")) {
                paymentType = "1st Installment";
              } else if (heading.toLowerCase().includes("installment 2")) {
                paymentType = "2nd Installment";
              }

              // Only add if we found a valid payment type
              if (paymentType && status !== "PAID") {
                data.tax_history.push({
                  jurisdiction: "County",
                  year: taxYear?.replace("/", "-") || "",
                  payment_type: paymentType,
                  status: status === "PAID" ? "Paid" : "Delinquent",
                  base_amount: baseAmount,
                  amount_paid: amountPaid,
                  amount_due: dueAmount,
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: "",
                  paid_date: paidDate,
                  good_through_date: "",
                  link: "",
                });
              }
            });
          }
        });

        //seting delquentDate
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
      console.log("Error in ac_1:", error);
      reject(error.message || "Record Not Found");
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

  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid account number",
    });
  }
  try {
    const url = `https://santaclaracounty.telleronline.net/search/1/details?APN=${account}`;

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

module.exports = { search };
