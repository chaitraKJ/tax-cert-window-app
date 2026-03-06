//author-> Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "networkidle2" });

      await page.waitForSelector("input[name='mParcelID']");
      await page.click("input[name='mParcelID']");
      await page.type("input[name='mParcelID']", account);

      page.waitForSelector("input#mPayTaxes");

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.locator("input#mPayTaxes").click(),
      ])
        .then(async () => {
          const data = await page.evaluate(() => {
            let data = {
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
                "Snohomish County, 3000 Rockefeller Avenue, Everett, WA 98201 ",
              notes: "-",
              delinquent: "-",
              tax_history: [],
            };

            data["parcel_number"] = document
              .getElementById("mParcelNumber")
              .textContent.trim();
            data["property_address"] = document
              .getElementById("mSitusAddress")
              .textContent.trim();

            document
              .querySelectorAll("#mPropertyValues tr")
              .forEach((tr, i) => {
                if (i === 1) {
                  data["total_taxable_value"] = tr
                    .querySelectorAll("td")[1]
                    .textContent.trim();
                  data["total_assessed_value"] = tr
                    .querySelectorAll("td")[1]
                    .textContent.trim();
                }
              });

            data["owner_name"].push(
              document
                .querySelectorAll("#mParties tr")[2]
                .querySelectorAll("td")[2]
                .textContent.trim()
            );

            return data;
          });
          resolve(data);
        })
        .catch((error) => reject(new Error("Record not found")));
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};

const ac_2 = async (page, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const dataWithTax = await page.evaluate((data) => {
        let dueINstallments = [];

        // Parse due table if it exists
        const dueTable = document.getElementById("mTaxChargesBalancePayment");
        if (dueTable) {
          const rows = dueTable.querySelectorAll("tr");
          rows.forEach((tr, i) => {
            if (i !== 0) {
              const tds = tr.querySelectorAll("td");
              dueINstallments.push({
                installmentNo: tds[1].textContent.trim(),
                year: tds[0].textContent.trim(),
                dueDate: tds[2],
              });

              data.tax_history.push({
                jurisdiction: "County",
                year: tds[0].textContent.trim() || "",
                payment_type: "-",
                status: "-",
                base_amount: tds[3]?.textContent.trim() || "$0.00",
                amount_paid: "$0.00",
                amount_due: tds[5]?.textContent.trim() || "$0.00",
                mailing_date: "N/A",
                due_date: "-",
                delq_date: "-",
                paid_date: "-",
                good_through_date: "-",
                link: "-",
              });
            }
          });
        }

        // Parse receipts table if it exists
        const receiptsTable = document.getElementById("mReceipts");
        if (receiptsTable) {
          const rows = receiptsTable.querySelectorAll("tr");
          rows.forEach((tr, i) => {
            if (i !== 0) {
              const tds = tr.querySelectorAll("td");
              data.tax_history.push({
                jurisdiction: "County",
                year:
                  tds[0]?.textContent.trim().split(" ")[0].split("/")[2] || "",
                payment_type: "-",
                status: "Paid",
                base_amount: tds[2]?.textContent.trim() || "$0.00",
                amount_paid: tds[2]?.textContent.trim() || "$0.00",
                amount_due: tds[5]?.textContent.trim() || "$0.00",
                mailing_date: "N/A",
                due_date: "-",
                delq_date: "-",
                paid_date: tds[0]?.textContent.trim().split(" ")[0] || "-",
                good_through_date: "-",
                link: "-",
              });
            }
          });
        }

        // Group by year
        const grouped = {};
        data.tax_history.forEach((h) => {
          const year = h.year;
          if (!grouped[year]) grouped[year] = [];
          grouped[year].push(h);
        });

        // Assign due dates, payment types, and status
        Object.values(grouped).forEach((installments) => {
          // If only one record → annual
          if (installments.length === 1) {
            const h = installments[0];
            h.due_date = `04/30/${h.year}`;
            h.delq_date = `05/01/${h.year}`;
            h.payment_type = "Annual";
            h.status = h.amount_due !== "$0.00" ? "Unpaid" : "Paid";
          } else {
            const sorted = installments.sort(
              (a, b) => Number(a.amount_due) - Number(b.amount_due)
            );

            const first = sorted[0];
            first.due_date = `04/30/${first.year}`;
            first.delq_date = `05/01/${first.year}`;
            first.payment_type = "Semi-Annual";
            first.status = first.amount_due !== "$0.00" ? "Unpaid" : "Paid";

            const second = sorted[1];
            second.due_date = `10/31/${second.year}`;
            second.delq_date = `11/01/${second.year}`;
            second.payment_type = "Semi-Annual";
            second.status = second.amount_due !== "$0.00" ? "Unpaid" : "Paid";

            // If there are extra dummy rows (like with all $0.00), just ignore them
            for (let i = 2; i < sorted.length; i++) {
              const h = sorted[i];
              h.due_date = `04/30/${h.year}`;
              h.delq_date = `05/01/${h.year}`;
              if (h.amount_due === "$0.00" && h.amount_paid === "$0.00") {
              }
            }
          }
        });

        const maxYear = Math.max(
          ...data.tax_history.map((el) => Number(el.year))
        );

        // Keep only max year + prior unpaid
        data.tax_history = data.tax_history.filter((el) => {
          if (Number(el.year) === maxYear) return true;
          return data.tax_history.some(
            (r) => r.year === el.year && r.status === "Unpaid"
          );
        });

        // Determine first/second installment status
        let firstStatus = "PAID";
        let secondStatus = "PAID";

        if (dueINstallments.length) {
          dueINstallments.forEach((el) => {
            if (el.installmentNo === "1") firstStatus = "UNPAID";
            if (el.installmentNo === "2") secondStatus = "UNPAID";
          });
        } else {
          // fallback for receipts only
          const semiAnnualUnpaid = data.tax_history.filter(
            (h) => h.payment_type === "Semi-Annual" && h.status === "Unpaid"
          );
          if (semiAnnualUnpaid.some((h) => h.due_date.includes("04/30")))
            firstStatus = "UNPAID";
          if (semiAnnualUnpaid.some((h) => h.due_date.includes("10/31")))
            secondStatus = "UNPAID";
        }

        data.delinquent =
          firstStatus === "UNPAID" || secondStatus === "UNPAID"
            ? "YES"
            : "NONE";

        // Prior unpaid years
        const priorUnpaid = data.tax_history.some(
          (el) => Number(el.year) < maxYear && el.status === "Unpaid"
        );

        data.notes = `${
          priorUnpaid ? "PRIOR YEARS ARE UNPAID" : "ALL PRIOR YEARS ARE PAID"
        }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;

        data.tax_history = data.tax_history.sort((a, b) => {
          const yearA = Number(a.year);
          const yearB = Number(b.year);

          if (yearA !== yearB) {
            return yearA - yearB;
          }

          const dateA = new Date(a.due_date);
          const dateB = new Date(b.due_date);
          return dateA - dateB;
        });

        return data;
      }, data);

      resolve(dataWithTax);
    } catch (error) {
      console.error("Scraping failed:", error);
      reject(error);
    }
  });
};

const account_search = (page, url, account) => {
  return ac_1(page, url, account)
    .then((data) => {
      return ac_2(page, data)
        .then((result) => result)
        .catch((error) => {
          console.error("Error inside ac_2:", error);
          throw error;
        });
    })
    .catch((error_1) => {
      console.error("Error inside ac_1:", error_1);
      throw error_1;
    });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    const url =
      "https://www.snoco.org/proptax/(S(d115ztirtxzhwxeki3n25exy))/default.aspx";

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
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

    // Intercept requests and block certain resource types
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
      // Frontend endpoint
      account_search(page, url, account)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) =>
          res
            .status(200)
            .render("error_data", { error: true, message: error.message })
        )
        .finally(async () => await context.close());
    } else if (fetch_type === "api") {
      // API endpoint
      account_search(page, url, account)
        .then((data) => res.status(200).json({ result: data }))
        .catch((error) => {
          console.log(error);
          res.status(500).json({ error: true, message: error.message });
        })
        .finally(async () => await context.close());
    }
  } catch (error) {
    console.log(error);

    if (fetch_type === "html") {
      res
        .status(200)
        .render("error_data", { error: true, message: error.message });
    } else if (fetch_type === "api") {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

module.exports = { search };