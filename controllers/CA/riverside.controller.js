// author: Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#dnn_ctr413_ContentPane table tbody tr", {
        timeout: 30000,
      });

      const dataAndAssesedUrl = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
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
            "Riverside County Treasurer ,P.O. Box 12005, Riverside, CA 92502-2205",
          tax_history: [],
        };

        document
          .querySelectorAll("#dnn_ctr413_ContentPane table tbody tr")
          .forEach((tr, i) => {
            if (i === 0) {
              data.parcel_number =
                tr.querySelector("td")?.textContent.trim() || "";
            }
            if (i === 1) {
              const ownerEl = tr.querySelector("h2");
              if (ownerEl) {
                const ownerText = ownerEl.textContent
                  .replace("Current Owner:", "")
                  .trim();
                data.owner_name.push(ownerText);
              }
            }
          });

        const dueTable = document.querySelector(
          "#dnn_ctr414_ContentPane tbody"
        );

        if (dueTable) {
          const taxYear =
            dueTable.previousElementSibling
              ?.querySelector("th")
              ?.textContent.match(/\d{4}/)?.[0] || "";

          dueTable.querySelectorAll("tr").forEach((tr, i) => {
            if (i >= 2) return;

            const tds = tr.querySelectorAll("td");
            const installmentNo = tds[0]?.textContent.trim() || "";
            const basePay = tds[1]?.textContent.trim() || "";
            const totalPaid =
              tds[3]?.textContent.replace(/[()]/g, "").trim() || "";
            const amount = tds[4]?.textContent.trim() || "";
            const dueDate = tds[5]?.textContent.trim() || "";
            const status = "Due";

            if (installmentNo.includes("#1")) {
              data.tax_history.push({
                jurisdiction: "County",
                year: taxYear || dueDate.split("/")[2],
                payment_type: "1st Installment",
                status,
                base_amount: basePay,
                amount_paid: totalPaid,
                amount_due: amount,
                mailing_date: "N/A",
                due_date: dueDate,
                delq_date: "",
                paid_date: "N/A",
                good_through_date: "",
                link: "",
              });
            }

            if (installmentNo.includes("#2")) {
              data.tax_history.push({
                jurisdiction: "County",
                year: taxYear || `${Number(dueDate.split("/")[2]) - 1}`,
                payment_type: "2nd Installment",
                status,
                base_amount: basePay,
                amount_paid: totalPaid,
                amount_due: amount,
                mailing_date: "N/A",
                due_date: dueDate,
                delq_date: "",
                paid_date: "N/A",
                good_through_date: "",
                link: "",
              });
            }
          });
        }

        if (!dueTable || data.tax_history.length < 2) {
          const paidTable = document.querySelector(
            "#collapsePaid .table tbody"
          );

          if (paidTable) {
            const taxYear =
              paidTable.previousElementSibling
                ?.querySelector("th")
                ?.textContent.match(/\d{4}/)?.[0] || "";

            paidTable.querySelectorAll("tr").forEach((tr) => {
              const tds = tr.querySelectorAll("td");
              const installmentNo = tds[0]?.textContent.trim() || "";
              const basePay = tds[1]?.textContent.trim() || "";
              const totalPaid =
                tds[3]?.textContent.replace(/[()]/g, "").trim() || "";
              const amount = tds[4]?.textContent.trim() || "";
              const dueDate = tds[5]?.textContent.trim() || "";
              const status = tds[7]?.textContent.trim() || "Due";
              const paidDate = tds[6]?.textContent.trim() || "N/A";

              if (installmentNo.includes("#1")) {
                data.tax_history.push({
                  jurisdiction: "County",
                  year: taxYear || dueDate.split("/")[2],
                  payment_type: "1st Installment",
                  status,
                  base_amount: basePay,
                  amount_paid: totalPaid,
                  amount_due: amount,
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: "",
                  paid_date: paidDate,
                  good_through_date: "",
                  link: "",
                });
              }

              if (installmentNo.includes("#2")) {
                data.tax_history.push({
                  jurisdiction: "County",
                  year: taxYear || `${Number(dueDate.split("/")[2]) - 1}`,
                  payment_type: "2nd Installment",
                  status,
                  base_amount: basePay,
                  amount_paid: totalPaid,
                  amount_due: amount,
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
        }

        const defaultedSecured = document.querySelector(
          "#accordionDefault table tbody"
        );

        if (defaultedSecured) {
          const taxYear =
            defaultedSecured.previousElementSibling
              ?.querySelector("th")
              ?.textContent.match(/\d{4}/)?.[0] || "";

          defaultedSecured.querySelectorAll("tr").forEach((tr, i) => {
            if (i >= 2) return;

            const tds = tr.querySelectorAll("td");
            const installmentNo = tds[0]?.textContent.trim() || "";
            const basePay = tds[1]?.textContent.trim() || "";
            const totalPaid =
              tds[3]?.textContent.replace(/[()]/g, "").trim() || "";
            const amount = tds[4]?.textContent.trim() || "";
            const dueDate = tds[5]?.textContent.trim() || "";
            const rawStatus = tds[6]?.textContent.trim() || "";
            const status = rawStatus === "In Plan" ? "Delinquent" : rawStatus;

            if (installmentNo.includes("#1")) {
              data.tax_history.push({
                jurisdiction: "County",
                year: taxYear || dueDate.split("/")[2],
                payment_type: "1st Installment",
                status,
                base_amount: basePay,
                amount_paid: totalPaid,
                amount_due: amount,
                mailing_date: "N/A",
                due_date: dueDate,
                delq_date: "",
                paid_date: "N/A",
                good_through_date: "",
                link: "",
              });
            }

            if (installmentNo.includes("#2")) {
              data.tax_history.push({
                jurisdiction: "County",
                year: taxYear || `${Number(dueDate.split("/")[2]) - 1}`,
                payment_type: "2nd Installment",
                status,
                base_amount: basePay,
                amount_paid: totalPaid,
                amount_due: amount,
                mailing_date: "N/A",
                due_date: dueDate,
                delq_date: "",
                paid_date: "N/A",
                good_through_date: "",
                link: "",
              });
            }
          });
        }

        data.tax_history.forEach((el) => {
          const year = Number(el.year);

          if (el.payment_type === "1st Installment") {
            el.due_date = `11/01/${year}`;
            el.delq_date = `12/10/${year}`;
          } else if (el.payment_type === "2nd Installment") {
            el.due_date = `02/01/${year + 1}`;
            el.delq_date = `04/10/${year + 1}`;
          }

          el.year = `${year}`;
        });
        data.tax_history.sort((a, b) => {
  // sort by year DESC (latest year first)
  if (Number(a.year) !== Number(b.year)) {
    return Number(b.year) - Number(a.year);
  }

  // within same year → 1st installment first
  if (a.payment_type.includes("1st")) return -1;
  if (b.payment_type.includes("1st")) return 1;

  return 0;
});


        const maxYear = Math.max(
          ...data.tax_history.map((el) => Number(el.year))
        );

        const priorDelinquent = data.tax_history.some(
          (el) =>
            Number(el.year) < maxYear &&
            el.status.toLowerCase() === "delinquent"
        );

        data.delinquent = priorDelinquent
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        const firstInstallment = data.tax_history.find(
          (el) => Number(el.year) === maxYear && el.payment_type.includes("1st")
        );
        const secondInstallment = data.tax_history.find(
          (el) => Number(el.year) === maxYear && el.payment_type.includes("2nd")
        );

        const firstStatus = firstInstallment
          ? firstInstallment.status.toUpperCase()
          : "N/A";
        const secondStatus = secondInstallment
          ? secondInstallment.status.toUpperCase()
          : "N/A";

        if (!secondInstallment) {
          data.notes = `${
            priorDelinquent
              ? "PRIOR YEARS ARE DELINQUENT"
              : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: ANNUAL TAX STATUS IS ${firstStatus}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 11/01.`;
        } else {
          data.notes = `${
            priorDelinquent
              ? "PRIOR YEARS ARE DELINQUENT"
              : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 11/01 AND 02/01.`;
        }

        const assessedUrl = document.querySelector(
          ".btn-group  a[role='button']"
        ).href;

        return { data, assessedUrl };
      });

      
      resolve(dataAndAssesedUrl);
    } catch (error) {
      console.error("❌ ERROR in ac_1:", error);
      reject(new Error("Record not found"));
    }
  });
};

const ac_2 = async (page, dataAndAssesedUrl) => {
  return new Promise(async (resolve, reject) => {
    try {
   
      await page.goto(dataAndAssesedUrl.assessedUrl, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(
        "input[title='Search...'] , .ml-2.btn.btn-outline-primary.btn-icon",
        {
          timeout: 30000,
        }
      );

      await page.waitForSelector("input[title='Search...']", timeout_option);
      await page
        .locator("input[title='Search...']")
        .fill(dataAndAssesedUrl.data.parcel_number);
      await Promise.all([
        page.locator(".ml-2.btn.btn-outline-primary.btn-icon").click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.waitForSelector("table.table-condensed tr", timeout_option),
      ]).then(async () => {
       

        const data = await page.evaluate((dataAndAssesedUrl) => {
          const trs = document.querySelectorAll("table.table-condensed tr");

          trs.forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 2) return;

            if (
              tds[0].textContent.trim().toLowerCase().includes("assessment")
            ) {
              dataAndAssesedUrl.data.property_address = tds[1].textContent
                .split(".")[1]
                .trim();
            }

            if (tds[0].textContent.trim().toLowerCase().includes("assessed")) {
              const val = tds[1].textContent.trim();
              dataAndAssesedUrl.data.total_assessed_value = val;
              dataAndAssesedUrl.data.total_taxable_value = val;
            }
          });

          return dataAndAssesedUrl.data;
        }, dataAndAssesedUrl);
        resolve(data);
      });
    } catch (error) {
      console.error("❌ ERROR in ac_2:", error);
      reject(new Error("Record not found"));
    }
  });
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Call main tax extraction function
      ac_1(page, url, account)
        .then((dataAndAssesedUrl) => {
          ac_2(page, dataAndAssesedUrl)
            .then((data) => resolve(data))
            .catch((error) => {
              console.log(error);
              reject(new Error(error.message));
            });
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
    const url = `https://ca-riverside-ttc.publicaccessnow.com/AccountSearch/AccountSummary.aspx?p=${account}&a=${account}`;

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

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
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