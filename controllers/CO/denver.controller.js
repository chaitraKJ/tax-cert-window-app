//author: Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      page
        .waitForSelector("#PropertyTaxes table tbody tr", timeout_option)
        .then(async () => {
          await page.waitForSelector(".data-list-section");
          const data = await page.evaluate(() => {
            const safeText = (el) => el?.textContent?.trim() ?? "";

            let maxYear = "";

            document.querySelectorAll(".data-list-section li").forEach((li) => {
              const title = li.querySelector(".title");
              const value = li.querySelector(".value");

              if (title?.textContent.trim() === "Tax Year") {
                maxYear = value.textContent.trim();
              }
            });

            if (!/^\d{4}$/.test(maxYear)) {
              maxYear = new Date().getFullYear().toString();
            }

            let data = {
              processed_date: new Date().toISOString().split("T")[0],
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
              notes: "",
              delinquent: "",
              taxing_authority:
                "The Denver Treasury Division of the Department of Finance , 201 W Colfax Ave #1009 Denver, CO 80202",
              tax_history: [],
            };

            //taking base data
            // --------------------
            // Base property data
            // --------------------
            document
              .querySelectorAll(".data-list-section .data-list")
              .forEach((ul, i) => {
                if (i === 0) {
                  let lis = ul.querySelectorAll("li p");
                  lis.forEach((p, j) => {
                    let lisData = p.querySelector(".value");
                    if (j === 0) data.parcel_number = safeText(lisData);
                    if (j === 1) data.property_address = safeText(lisData);
                    if (j === 2) data.owner_name.push(safeText(lisData));
                  });
                }
              });

            // --------------------
            // Extract Tax Year (CORRECT PLACE)
            // --------------------
            document.querySelectorAll(".data-list-section li").forEach((li) => {
              const title = li.querySelector(".title");
              const value = li.querySelector(".value");

              if (title && value && title.textContent.trim() === "Tax Year") {
                maxYear = value.textContent.trim();
              }
            });

            // Fallback safety
            if (!maxYear) {
              maxYear = new Date().getFullYear().toString();
            }


            document
              .querySelector(".table-responsive")
              .querySelectorAll("tbody tr")
              .forEach((tr, i) => {
                const tds = tr.lastElementChild.textContent;
                if (i === 4) {
                  data["total_taxable_value"] = tds;
                  data["total_assessed_value"] = tds;
                }
              });
            const taxYear = Number(maxYear);
            const nextYear = taxYear + 1;
            const parseMDY = (str) => {
              const [mm, dd, yyyy] = str.split("/").map(Number);
              return new Date(yyyy, mm - 1, dd, 23, 59, 59);
            };


            //tax-value
            let firstInstallment = {
              jurisdiction: "County",
              year: taxYear,
              payment_type: "",
              status: "",
              base_amount: "",
              amount_paid: "$0.00",
              amount_due: "$0.00",
              mailing_date: "N/A",

              due_date: `02/28/${nextYear}`,
              delq_date: `03/01/${nextYear}`,

              paid_date: "",
              good_through_date: "",
              link: "",
            };
            let secondInstallment = {
              jurisdiction: "County",
              year: taxYear,
              payment_type: "",
              status: "",
              base_amount: "$0.00",
              amount_paid: "$0.00",
              amount_due: "$0.00",
              mailing_date: "N/A",

              due_date: `06/15/${nextYear}`,
              delq_date: `06/16/${nextYear}`,

              paid_date: "",
              good_through_date: "",
              link: "",
            };
            const bill_table = document.querySelector("#PropertyTaxes table");
            bill_table
              .querySelector("tbody")
              .querySelectorAll("tr")
              .forEach((tr, i) => {
                const tds = tr.querySelectorAll("td");
                tds.forEach((td, j) => {
                  let text = td.textContent.trim();
                  if (i == 0) {
                    if (j == 1) {
                      firstInstallment.paid_date = safeText(tds[j]);
                      // firstInstallment.year = safeText(tds[j]).split("/")[2];
                    } else if (j == 2) {
                      secondInstallment.paid_date = safeText(tds[j]);
                      // secondInstallment.year = safeText(tds[j]).split("/")[2];
                    }
                  }
                  if (i == 1) {
                    if (j == 1) {
                      firstInstallment.base_amount = safeText(tds[j]);
                    } else if (j == 2) {
                      secondInstallment.base_amount = safeText(tds[j]);
                    }
                  }
                  if (i == 4) {
                    if (j == 1) {
                      firstInstallment.amount_paid = safeText(tds[j]);
                    } else if (j == 2) {
                      secondInstallment.amount_paid = safeText(tds[j]);
                    }
                  }
                  if (i == 5) {
                    if (j == 1) {
                      firstInstallment.amount_due = safeText(tds[j]);
                    } else if (j == 2) {
                      secondInstallment.amount_due = safeText(tds[j]);
                    }
                  }
                });
              });

            [firstInstallment, secondInstallment].forEach((inst) => {
              inst.status = inst.amount_due !== "$0.00" ? "Unpaid" : "Paid";
            });

            [firstInstallment, secondInstallment].forEach((inst) => {
              if (inst.due_date.startsWith("02/28")) {
                inst.payment_type = "Installment 1";
              } else if (inst.due_date.startsWith("06/15")) {
                inst.payment_type = "Installment 2";
              } else {
                inst.payment_type = "Annual";
              }
            });

            data.tax_history.push(firstInstallment, secondInstallment);

            if (data.tax_history.length > 0) {
              const today = new Date();

              // Find latest year
              const latestYear = Math.max(...data.tax_history.map((el) => Number(el.year)));


              // Update each record’s final status
              data.tax_history = data.tax_history.map((el) => {
                const paid =
                  el.status.toLowerCase() === "paid" || el.amount_paid !== "$0.00";
                const dueDate = el.due_date ? parseMDY(el.due_date) : null;
                const delqDate = el.delq_date ? parseMDY(el.delq_date) : null;


                if (paid) {
                  el.status = "Paid";
                } else if (delqDate && today >= delqDate) {
                  el.status = "Delinquent";
                } else if (dueDate && today <= dueDate) {
                  el.status = "Due";
                } else {
                  el.status = "Due";
                }

                return el;
              });

              // Sort by year (desc) and due date
              data.tax_history.sort((a, b) => {
                if (a.year !== b.year) return Number(b.year) - Number(a.year);
                return new Date(a.due_date) - new Date(b.due_date);
              });

              // Keep latest year and any unpaid prior years
              data.tax_history = data.tax_history.filter((el) => {
                if (Number(el.year) === latestYear) return true;
                return data.tax_history.some(
                  (r) => r.year === el.year && r.status !== "Paid"
                );
              });

              // ---- Mark delinquent status ----
              const hasDelinquent = data.tax_history.some(
                (el) => el.status === "Delinquent"
              );
              data.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT,NEED TO CALL FOR PAYOFF" : "NONE";

              // ---- Prepare summary notes ----
              const priorUnpaid = data.tax_history.some(
                (el) => Number(el.year) < latestYear && el.status !== "Paid"
              );

              const maxYearRecords = data.tax_history.filter(
                (el) => Number(el.year) === latestYear
              );

              let firstStatus = "";
              let secondStatus = "";

              maxYearRecords.forEach((el, i) => {
                if (i === 0) firstStatus = el.status.toUpperCase();
                else if (i === 1) secondStatus = el.status.toUpperCase();
              });

              // Build notes based on payment type
              if (maxYearRecords.length === 1) {
                data.notes = `${priorUnpaid
                  ? "PRIOR YEARS ARE DELINQUENT"
                  : "ALL PRIOR YEARS ARE PAID"
                  }. ${latestYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 02/28.`;
              } else {
                data.notes = `${priorUnpaid
                  ? "PRIOR YEARS ARE DELINQUENT"
                  : "ALL PRIOR YEARS ARE PAID"
                  }. ${latestYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/28 AND 06/15.`;
              }
            }

            return data;
          });
          resolve(data);
        })
        .catch((error) => {
          console.error(error);
          reject(new Error("No Record Found"));
        });

    } catch (error) {
      console.error(error);
      reject(new Error(error.message));
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
  try {
    const url = `https://property.spatialest.com/co/denver#/property/${account}`;

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