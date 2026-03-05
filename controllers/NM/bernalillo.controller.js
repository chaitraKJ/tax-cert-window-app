//Author --> Harsh Jha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Fill input
      await page.waitForSelector("input#inpSuf", timeout_option);
      await page.type("input#inpSuf", account);
      await page.keyboard.press("Enter");

      // Wait for either search results OR error <p>
      const result = await Promise.race([
        page
          .waitForSelector("tr.SearchResults", { timeout: 8000 })
          .then(() => "results"),
        page.waitForSelector("p", { timeout: 8000 }).then(() => "error"),
      ]);

      if (result === "error") {
        const msg = await page.$eval("p", (el) => el.innerText.trim());
       reject(new Error("Record not found"));
      }

      // RESULT FOUND → CLICK FIRST ROW
      const firstRow = await page.$("tr.SearchResults");
      if (!firstRow) {
        return reject({
          account,
          error: true,
          message: "SearchResults table found but no rows",
        });
      }

      await firstRow.click();
      await page.waitForNavigation({ waitUntil: "domcontentloaded" });

      // Verify we're on the details page
      try {
        await page.waitForSelector(".DataletHeaderTop", { timeout: 5000 });
      } catch (e) {
        return reject({
          account,
          error: true,
          message: "Failed to load property details page",
        });
      }

      // Wait for the datalet header to load
      await page.waitForSelector(".DataletHeaderTop", timeout_option);

      // Extract Data
      const data = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "N/V",
          exemption: "",
          total_taxable_value: "N/V",
          taxing_authority: "Bernalillo County Treasurer , 415 Silver Avenue SW Albuquerque, NM 87102",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        //Parcel no:
        const headerTop = document.querySelector(".DataletHeaderTop");
        if (!headerTop) {
          throw new Error("DataletHeaderTop not found");
        }

        const headerText = headerTop.textContent;
        if (headerText && headerText.includes(": ")) {
          data.parcel_number = headerText.split(": ")[1];
        }

        //owner and address
        const headerBottoms = document.querySelectorAll(".DataletHeaderBottom");
        headerBottoms.forEach((tr, i) => {
          if (i === 0) {
            data.owner_name.push(tr.textContent.trim());
          }
          if (i === 1) {
            data.property_address = tr.textContent.trim();
          }
        });

        return data;
      });

      //Tax Calculation page
      const clickTaxCalculation = async () =>
        await page.$$eval(".contentpanel #sidemenu li", (items) => {
          items.forEach((li) => {
            const span = li.querySelector("span");
            if (span && span.textContent.trim() === "Tax Calculation") {
              li.querySelector("a")?.click();
            }
          });
        });

      const clickBalDue = async () =>
        await page.$$eval(".contentpanel #sidemenu li", (items) => {
          items.forEach((li) => {
            const span = li.querySelector("span");
            if (span && span.textContent.trim() === "Balance Due") {
              li.querySelector("a")?.click();
            }
          });
        });

      await Promise.all([
        clickTaxCalculation(),
        page.waitForNavigation(),
        page.waitForSelector("table[id='Tax Amount Calculation']"),
      ]);

      const taxableVal = await page.evaluate(() => {
        const el = document.querySelector(
          "table[id='Tax Amount Calculation'] tbody tr:nth-of-type(3) td:nth-of-type(2)"
        );
        return el ? el.textContent.trim() : "";
      });

      if (taxableVal.length !== 0) {
        data.total_assessed_value = `$${taxableVal}`;
        data.total_taxable_value = `$${taxableVal}`;
      }

      await Promise.all([
        clickBalDue(),
        page.waitForNavigation(),
        page.waitForSelector("table[id='Payment History']"),
        page.waitForSelector("table[id='Current Amount Due']"),
      ]);

      const currentDueHistort = await page.evaluate(() => {
        const currenthistory = [];
        const currentYear = new Date().getFullYear();

        const trs = document.querySelectorAll(
          "table[id='Current Amount Due'] tbody tr"
        );

        trs.forEach((tr, i) => {
          // skip first and last row
          if (i === 0 || i === trs.length - 1) return;

          const tds = tr.querySelectorAll("td");
          if (tds.length === 0) return;

          const insst = tds[0].textContent.trim().toLowerCase();
          const amount = tds[1].textContent.trim();
          const paidAmount = tds[5].textContent.trim();
          const dueAmount = tds[6].textContent.trim();

          if (!insst.includes("total")) {
            const isPaid = dueAmount === ".00";
            let paymentType = "";
            let dueDate = "";
            let delqDate = "";

            // Determine installment type and dates
            if (insst.includes("1st")) {
              paymentType = "1st Installment";
              dueDate = `11/10/${currentYear}`;
              delqDate = `12/10/${currentYear}`;
            } else if (insst.includes("2nd")) {
              paymentType = "2nd Installment";
              dueDate = `04/10/${currentYear}`;
              delqDate = `05/10/${currentYear}`;
            }

            currenthistory.push({
              jurisdiction: "County",
              year: "",
              payment_type: paymentType,
              status: isPaid ? "Paid" : "Due",
              base_amount: `$${amount}`,
              amount_paid: `$${
                paidAmount.replace("-", "") === ".00"
                  ? "0.00"
                  : paidAmount.replace("-", "")
              }`,
              amount_due: isPaid ? "$0.00" : `$${dueAmount}`,
              mailing_date: "N/A",
              due_date: dueDate,
              delq_date: delqDate,
              paid_date: "N/A",
              good_through_date: "",
              link: "-",
            });
          }
        });

        return currenthistory;
      });

      let currentTwo = currentDueHistort.slice(0, 2);

      const PrioHistory = await page.evaluate(() => {
        const priorPayments = [];

        const trs = document.querySelectorAll(
          "table[id='Payment History'] tbody tr"
        );

        trs.forEach((tr, i) => {
          if (i === 0 || i === trs.length - 1) return;

          const tds = tr.querySelectorAll("td");
          if (tds.length === 0) return;

          const year = tds[0].textContent.trim();
          const dueAmount = tds[6].textContent.trim();

          priorPayments.push({
            year,
            due: dueAmount,
          });
        });

        return priorPayments;
      });

      let years = PrioHistory.map((r) => parseInt(r.year)).filter(
        (n) => !isNaN(n)
      );

      let latestYear = years.length
        ? Math.max(...years)
        : new Date().getFullYear();

      const delinquentYears = [];
      PrioHistory.forEach((record) => {
        const yr = parseInt(record.year);

        if (!isNaN(yr) && yr < latestYear && record.due !== ".00") {
          delinquentYears.push(yr);
        }
      });

      // Assign year to current installments
      currentTwo.forEach((r) => {
        r.year = latestYear.toString();
      });

      // Set tax history to current year only
      data.tax_history = currentTwo;

      // Set delinquency status
      if (delinquentYears.length > 0) {
        data.delinquent = `TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF`;
      } else {
        data.delinquent = "NONE";
      }

      // Build notes based on installment count
      const priorStatus =
        delinquentYears.length > 0
          ? "PRIOR YEARS ARE DELINQUENT"
          : "ALL PRIOR YEARS ARE PAID";

      if (currentTwo.length === 1) {
        // Annual payment
        data.notes = `${priorStatus}. ${latestYear}: ANNUAL TAX STATUS IS ${currentTwo[0].status.toUpperCase()}, DUE DATE IS 11/10.`;
      } else if (currentTwo.length === 2) {
        // Semi-annual payments
        const firstStatus = currentTwo[0].status.toUpperCase();
        const secondStatus = currentTwo[1].status.toUpperCase();

        data.notes = `${priorStatus}. ${latestYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, DUE DATES ARE 11/10 AND 04/10.`;
      } else {
        // Fallback
        data.notes = `${priorStatus}. ${latestYear}: TAX STATUS UNKNOWN.`;
      }

      resolve(data);
    } catch (err) {
      console.log("Error in ac_1:", err);
      reject(new Error("Record not found"));
    }
  });
}

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
    const url = `https://treasurer.bernco.gov/public.access/search/commonsearch.aspx?mode=realprop`;

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




