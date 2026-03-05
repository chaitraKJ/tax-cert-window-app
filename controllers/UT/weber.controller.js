//Author :- Harsh Jha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      (await page.waitForSelector("#desktop-tabs", { timeout: 30000 })) ||
        (await page.waitForSelector(".alert.alert-danger.text-center", {
          timeout: 30000,
        }));


        await page.waitForSelector(".col-md-4 strong", { timeout: 30000 })
        const TaxVal = await page.evaluate(() => {

          const TaxVal = {
            total_assessed_value: "",
            total_taxable_value:""
          }
          document.querySelectorAll(".col-md-4").forEach((div) => {
          div.querySelectorAll("strong").forEach((strong) => {
            if (strong.textContent.trim() === "Taxable") {
              let node = strong.nextSibling;
              while (node && node.textContent.trim() === "") {
                node = node.nextSibling;
              }

              if (node) {
                const val = node.textContent.trim();
                TaxVal.total_assessed_value = val;
                TaxVal.total_taxable_value = val;
              }
            }
          });
        });

         return TaxVal;
        })

      const links = await page.evaluate(() => {
        const linkData = {};
        document.querySelectorAll("#desktop-tabs li a").forEach((a) => {
          const text = a.textContent.trim();
          const href = a.href;
          linkData[text] = href;
        });

          

        return linkData;
      });



      const NoRecord = await page.evaluate(() => {
        if (document.querySelector(".alert.alert-danger.text-center")) {
          return document
            .querySelector(".alert.alert-danger.text-center")
            .textContent.trim();
        } else {
          return "";
        }
      });

      if (NoRecord !== "") {
        reject(new Error("No Record Found"));
      }

      const ownerLink = links["Ownership Info"];
      if (!ownerLink) throw new Error("Ownership Info link not found");

      await page.goto(ownerLink, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForSelector(".panel-body", { timeout: 30000 });

      const ownerAndAddress = await page.evaluate(() => {
        const data = {
          owner_name: "",
          property_address: "",
          parcel_no: "",
        };

        document.querySelectorAll(".panel-body .row").forEach((row) => {
          const label = row.querySelector("strong")?.textContent.trim();
          const valueDiv = row.querySelector(".col-md-8, .panel-body");

          if (label === "Owner" && valueDiv)
            data.owner_name = valueDiv.textContent.trim();

          if (label === "Property" && valueDiv)
            data.property_address = valueDiv.innerText
              .trim()
              .replace(/\s+/g, " ");
        });

        data.parcel_no = document
          .querySelector("h3")
          .textContent.split("#:")[1]
          .trim();


        

        return data;
      });

      const taxLink = links["Tax History"];
      if (!taxLink) throw new Error("Tax History link not found");

      await page.goto(taxLink, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForSelector(".panel-body", { timeout: 30000 });

      const data = await page.evaluate((ownerAndAddress) => {
        const main_data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [ownerAndAddress.owner_name],
          property_address: ownerAndAddress.property_address,
          parcel_number: ownerAndAddress.parcel_no,
          land_value: "",
          improvements: "",
          total_assessed_value: "$0.00",
          exemption: "",
          total_taxable_value: "$0.00",
          taxing_authority:
            "Weber Center ,2380 Washington BlvdOgden, Utah 84401",
          notes: "",
          delinquent: "",
          tax_history: [],
        };
        

        // 🧾 COUNTY TAX HISTORY EXTRACTION
        document
          .querySelectorAll("#payments tr.odd, #payments tr.even")
          .forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 7) return;

            const year = tds[0].textContent.trim();
            const payee = tds[1].textContent.trim();
            const paymentDateText = tds[2].textContent.trim();
            const paymentAmount = tds[3].textContent
              .trim()
              .replace("-", "")
              .trim();
            const totalPaid = tds[4].textContent.trim().replace("-", "").trim();
            const totalDue = tds[5].textContent.trim();
            const yearEndBalance = tds[6].textContent.trim();

            const paymentDate = new Date(paymentDateText);
            const formattedDate = !paymentDateText
              ? ""
              : isNaN(paymentDate)
              ? paymentDateText
              : paymentDate.toLocaleDateString("en-US");

            // Determine if paid or due
            const isPaid =
              yearEndBalance === "$0.00" ||
              (totalPaid !== "" && totalPaid !== "-") ||
              paymentDateText !== "";

            const baseAmount =
              paymentAmount || totalDue || yearEndBalance || "$0.00";
            const amountPaid = isPaid ? totalPaid || paymentAmount : "";
            const amountDue = isPaid
              ? "$0.00"
              : totalDue || yearEndBalance || "$0.00";

            main_data.tax_history.push({
              jurisdiction: "County",
              year,
              payment_type: "Annual",
              status: isPaid ? "Paid" : "Due",
              base_amount: baseAmount,
              amount_paid: amountPaid !== "" ? amountPaid : "$0.00",
              amount_due: amountDue,
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: formattedDate,
              good_through_date: "",
              link: "",
            });
          });

        main_data.tax_history.forEach((h, i) => {
          const year = Number(h.year) || new Date().getFullYear();
          const totalForYear = main_data.tax_history.filter(
            (x) => x.year === h.year
          ).length;

          if (totalForYear === 1) {
            h.payment_type = "Annual";
            h.due_date = `12/01/${year}`;
            h.delq_date = `12/02/${year}`;
          } else {
            h.payment_type = "Semi-Annual";
            if (h.installment_num === 1 || i % 2 === 0) {
              h.due_date = `12/01/${year}`;
              h.delq_date = `12/02/${year}`;
            } else {
              h.due_date = `02/01/${year + 1}`;
              h.delq_date = `02/15/${year + 1}`;
            }
          }
        });

        if (main_data.tax_history.length > 0) {
          const today = new Date();

          // Find latest year
          const maxYear = Math.max(
            ...main_data.tax_history.map((el) => Number(el.year))
          );

          // Update each record’s final status
          main_data.tax_history = main_data.tax_history.map((el) => {
            const paidAmount = parseFloat(
              (el.amount_paid || "0").replace(/[$,]/g, "")
            );
            const paid = el.status.toLowerCase() === "paid" || paidAmount > 0;

            const dueDate = el.due_date ? new Date(el.due_date) : null;
            const delqDate = el.delq_date ? new Date(el.delq_date) : null;

            if (paid) el.status = "Paid";
            else if (dueDate && today < dueDate) el.status = "Due";
            else if (delqDate && today > delqDate) el.status = "Delinquent";
            else el.status = "Due";

            return el;
          });

          main_data.tax_history.sort((a, b) => {
            if (Number(a.year) !== Number(b.year)) {
              return Number(a.year) - Number(b.year);
            }

            const da = new Date(a.due_date || "01/01/1900");
            const db = new Date(b.due_date || "01/01/1900");

            return da - db;
          });

          // Keep latest year and any unpaid prior years
          main_data.tax_history = main_data.tax_history.filter((el) => {
            if (Number(el.year) === maxYear) return true;
            return main_data.tax_history.some(
              (r) => r.year === el.year && r.status !== "Paid"
            );
          });

          // ---- Mark delinquent status ----
          const hasDelinquent = main_data.tax_history.some(
            (el) => el.status === "Delinquent"
          );
          main_data.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

          // ---- Prepare summary notes ----
          const priorUnpaid = main_data.tax_history.some(
            (el) => Number(el.year) < maxYear && el.status !== "Paid"
          );

          const maxYearRecords = main_data.tax_history.filter(
            (el) => Number(el.year) === maxYear
          );

          let firstStatus = "";
          let secondStatus = "";

          maxYearRecords.forEach((el, i) => {
            if (i === 0) firstStatus = el.status.toUpperCase();
            else if (i === 1) secondStatus = el.status.toUpperCase();
          });

          // Build notes based on payment type
          if (maxYearRecords.length === 1) {
            main_data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 12/01.`;
          } else {
            main_data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/01 AND 02/01.`;
          }
        }

        return main_data;
      }, ownerAndAddress);


      data.total_assessed_value = TaxVal.total_assessed_value
      data.total_taxable_value = TaxVal.total_taxable_value
      resolve(data);
    } catch (error) {
      console.error("❌ Scraper error:", error);
      reject("No Data Found");
    }
  });
};

const account_search = (page, url, account) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url, account)
      .then((parcelData) => resolve(parcelData))
      .catch((error) => reject(error));
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const url = `https://webercountyutah.gov/parcelsearch/current-taxes.php?id=${account}`;

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

export { search };


