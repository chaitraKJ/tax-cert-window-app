// Author:Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Search and validate parcel
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = "https://app.lincoln.ne.gov/aspx/cnty/cto/default.aspx";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Select the "By Parcel" tab
      const parcelTab = await page.$("#__tab_ctl00_ctl00_cph1_cph1_tcOptions_tpParcel");
      if (!parcelTab) {
        return reject({ error: true, message: "Parcel search tab not found" });
      }
      await parcelTab.click();

      // Enter parcel ID
      const parcelInput = await page.$("#ctl00_ctl00_cph1_cph1_tcOptions_tpParcel_txtParcel");
      if (!parcelInput) {
        return reject({ error: true, message: "Parcel input field not found" });
      }
      await page.type("#ctl00_ctl00_cph1_cph1_tcOptions_tpParcel_txtParcel", account, { delay: 50 });
      const inputValue = await page.$eval(
        "#ctl00_ctl00_cph1_cph1_tcOptions_tpParcel_txtParcel",
        (el) => el.value
      );
      if (inputValue !== account) {
        return reject({ error: true, message: "Failed to fully type parcel ID" });
      }

      // Click search button and wait for navigation
      await Promise.all([
        page.click("#ctl00_ctl00_cph1_cph1_tcOptions_tpParcel_btnParcel"),
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
      ]);

      // Check for search results table
      const resultsTable = await page.$("#ctl00_ctl00_cph1_cph1_gvProperty");

      // Click the "View" button to access detailed information
      const viewButton = await page.$("#ctl00_ctl00_cph1_cph1_gvProperty_ctl02_btnSelect");
      if (!viewButton) {
        return reject({ error: true, message: "Invalid Parcel Number or No Records Found" });
      }
      await Promise.all([
        page.click("#ctl00_ctl00_cph1_cph1_gvProperty_ctl02_btnSelect"),
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      ]);

      // Check if payment calculator table exists and no "No Payment is Due" message
      const hasCurrentTax =
        (await page.$("#ctl00_ctl00_cph1_cph1_rpPaymentYears_ctl01_gvPaymentOptions") !== null) &&
        (await page.$("#ctl00_ctl00_cph1_cph1_rpPaymentYears_ctl01_lblNotFound") === null);

      // Read amount due from payment calculator
      const paidAmount = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        let amount = "$0.00";
        const rows = document.querySelectorAll(
          "#ctl00_ctl00_cph1_cph1_rpPaymentYears_ctl01_gvPaymentOptions tbody tr"
        );
        if (rows && rows.length) {
          for (const r of rows) {
            const tds = r.querySelectorAll("td");
            if (tds.length < 13) continue;
            const desc = clean(tds[1]?.textContent);
            const totalDue = clean(tds[7]?.textContent);
            if (desc === "Full") {
              amount = totalDue || "$0.00";
              break;
            }
          }
        }
        return amount.replace(/[()]/g, "");
      });

      resolve({ paidAmount, hasCurrentTax });
    } catch (error) {
      console.log(error);
      reject({ error: true, message: error.message });
    }
  });
};

// Parcel and owner info
const ac_2 = async (page, ac1_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const page_data = await page.evaluate((account) => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const datum = {
          processed_date: new Date().toISOString().slice(0, 10),
          order_number: "",
          borrower_name: "",
          owner_name: [""],
          property_address: "",
          parcel_number: account,
          land_value: "",
          improvements: "",
          total_assessed_value: "",
          exemption: "",
          total_taxable_value: "",
          taxing_authority:
            "Lancaster County Treasurer, 555 S 10th St, Lincoln, NE 68508, Ph: 402-441-7425",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        // Parcel number
        const parcelEl = document.querySelector("#ctl00_ctl00_cph1_cph1_fvProperty_lblParcel");
        if (parcelEl) {
          datum.parcel_number = clean(parcelEl.textContent);
        }

        // Property address
        const addressEl = document.querySelector("#ctl00_ctl00_cph1_cph1_fvProperty_lblSsAddr");
        const cityEl = document.querySelector("#ctl00_ctl00_cph1_cph1_fvProperty_lblSSCity");
        if (addressEl && cityEl) {
          datum.property_address = clean(`${addressEl.textContent} ${cityEl.textContent}`);
        }

        // Owner name
        const ownerEl = document.querySelector("#ctl00_ctl00_cph1_cph1_fvProperty_lblPowner");
        if (ownerEl) {
          datum.owner_name = [clean(ownerEl.textContent)];
        }

        // Extract Tax Value for the latest year from gvHistory
        const rows = document.querySelectorAll("#ctl00_ctl00_cph1_cph1_gvHistory tbody tr");
        let latestYear = 0;
        let taxValue = "";
        rows.forEach((r) => {
          const tds = r.querySelectorAll("td");
          if (tds.length < 10) return;
          const year = parseInt(clean(tds[0]?.textContent));
          if (year > latestYear) {
            latestYear = year;
            taxValue = clean(tds[3]?.textContent);
          }
        });
        if (taxValue) {
          datum.total_taxable_value = `$${taxValue}`;
          datum.total_assessed_value = `$${taxValue}`;
        }

        // Update notes
        datum.notes += "Valuation details extracted from tax history. Check Assessor's Information for land value, improvements, and exemptions.";

        return datum;
      }, account);

      resolve({ data: page_data, paid_status: ac1_data.paidAmount, hasCurrentTax: ac1_data.hasCurrentTax });
    } catch (error) {
      console.log(error);
      reject({ error: true, message: error.message });
    }
  });
};

// Merged history extraction for both paid and unpaid cases
const ac_history = async (page, data, hasCurrentTax) => {
  return new Promise(async (resolve, reject) => {
    try {
      const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return "$0.00";
        const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return num < 0 ? `-$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${formatted}`;
      };
      const currentDate = new Date();
      let currentTaxYear = currentDate.getFullYear() - 1; // Tax year is previous year (2024)

      // Helper function to format amount as dollar string
      const formatDollar = (value) => {
        if (!value || value === "") return "$0.00";
        const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
        return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
      };

      // Helper function to parse mm/dd/yyyy to Date
      const parseDate = (str) => {
        if (!str || str === "") return null;
        const [month, day, year] = str.split('/').map(Number);
        return new Date(year, month - 1, day);
      };

      // Expand the tax history section
      await page.click("#shHist");

      // Extract tax amounts from gvHistory
      const taxAmounts = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const rows = document.querySelectorAll("#ctl00_ctl00_cph1_cph1_gvHistory tbody tr");
        const taxAmounts = {};
        rows.forEach((r) => {
          const tds = r.querySelectorAll("td");
          if (tds.length < 10) return;
          const year = clean(tds[0]?.textContent);
          const taxAmount = clean(tds[4]?.textContent).replace(/[()]/g, "");
          taxAmounts[year] = taxAmount;
        });
        return taxAmounts;
      });

      // Format tax amounts and convert to numbers for calculations
      const formattedTaxAmounts = {};
      const numericTaxAmounts = {};
      for (const [year, amount] of Object.entries(taxAmounts)) {
        const num = parseFloat(amount.replace(/[$ ,]/g, ""));
        formattedTaxAmounts[year] = formatDollar(amount);
        numericTaxAmounts[year] = Number.isFinite(num) ? num : 0;
      };

      // Extract unpaid installments from all payment years in the repeater
      const unpaid = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const unpaid = [];
        const tables = document.querySelectorAll('table[id$="_gvPaymentOptions"]');
        for (const table of tables) {
          const rows = table.querySelectorAll("tbody tr");
          let year = "";
          rows.forEach((r) => {
            const tds = r.querySelectorAll("td");
            if (tds.length < 13) return;
            if (!year) year = clean(tds[0]?.textContent);
            const desc = clean(tds[1]?.textContent);
            if (desc === "Full") return;
            const totalDue = clean(tds[7]?.textContent).replace(/[()]/g, "");
            const numDue = parseFloat(totalDue.replace(/[^\d.-]/g, ""));
            const base = clean(tds[2]?.textContent).replace(/[()]/g, "");
            const numBase = parseFloat(base.replace(/[^\d.-]/g, ""));
            // Skip entries with zero or invalid base_amount
            if (!Number.isFinite(numBase) || numBase <= 0) return;
            if (!Number.isFinite(numDue) || numDue <= 0) return;
            const payment_type = desc.includes("First Half") ? "Installment #1" : "Installment #2";
            const due_year = parseInt(year) + 1;
            const due_month_day = payment_type === "Installment #1" ? "03/31" : "07/31";
            const delq_month_day = payment_type === "Installment #1" ? "04/01" : "08/01";
            const dueDate = `${due_month_day}/${due_year}`;
            const delqDate = `${delq_month_day}/${due_year}`;
            unpaid.push({
              jurisdiction: "County",
              year,
              payment_type,
              status: "Unpaid",
              base_amount: base,
              amount_paid: "$0.00",
              amount_due: totalDue,
              mailing_date: "N/A",
              due_date: dueDate,
              delq_date: delqDate,
              paid_date: "-",
              good_through_date: "",
            });
          });
        }
        return unpaid;
      });

      // Format unpaid amounts
      const formattedUnpaid = unpaid.map((p) => ({
        ...p,
        base_amount: formatDollar(p.base_amount),
        amount_paid: formatDollar(p.amount_paid),
        amount_due: formatDollar(p.amount_due),
      }));

      // Navigate to payment history page
      const paymentHistoryLink = await page.$('a[href="payhistory.aspx"]');
      if (paymentHistoryLink) {
        await Promise.all([
          paymentHistoryLink.click(),
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]);
      }

      // Extract payment history from payhistory.aspx
      const paymentHistory = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const rows = document.querySelectorAll("#ctl00_ctl00_cph1_cph1_gvReceiptMaster tbody tr");
        const payments = [];
        rows.forEach((r) => {
          const tds = r.querySelectorAll("td");
          if (tds.length < 8) return;
          const year = clean(tds[2]?.textContent);
          const paidAmount = clean(tds[4]?.textContent).replace(/[()]/g, "");
          let paidDate = clean(tds[7]?.textContent).split(" ")[0];
          const [month, day, yearStr] = paidDate.split("/");
          paidDate = `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${yearStr}`;
          const payment_type = "TBD";
          payments.push({
            jurisdiction: "County",
            year,
            payment_type,
            status: "Paid",
            base_amount: paidAmount,
            amount_paid: paidAmount,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: paidDate,
            good_through_date: "",
          });
        });
        return payments;
      });

      // Format payment history amounts
      const formattedPaymentHistory = paymentHistory.map((p) => ({
        ...p,
        base_amount: formatDollar(p.base_amount),
        amount_paid: formatDollar(p.amount_paid),
        amount_due: formatDollar(p.amount_due),
      }));

      // Group unpaid and paid by year
      const unpaidByYear = {};
      formattedUnpaid.forEach((p) => {
        if (!unpaidByYear[p.year]) unpaidByYear[p.year] = [];
        unpaidByYear[p.year].push(p);
      });

      const paidByYear = {};
      formattedPaymentHistory.forEach((p) => {
        if (!paidByYear[p.year]) paidByYear[p.year] = [];
        paidByYear[p.year].push(p);
      });

      // Determine latest year
      const allYears = Object.keys(taxAmounts);
      const latestYear = allYears.length > 0 ? Math.max(...allYears.map(Number)).toString() : currentTaxYear.toString();

      // Initialize tax_history with all prior unpaid installments
      let tax_history = [];
      Object.entries(unpaidByYear).forEach(([y, payments]) => {
        if (parseInt(y) < currentTaxYear) {
          tax_history.push(...payments);
        }
      });

      // Process current/latest year
      const taxAmount = numericTaxAmounts[latestYear] || 0;
      const halfTax = taxAmount / 2;
      const minValidPayment = halfTax * 0.1;

      const yearUnpaid = unpaidByYear[latestYear] || [];
      const yearPaid = paidByYear[latestYear] || [];
      const yearAll = [...yearUnpaid, ...yearPaid];

      let isAnnual = false;
      const currentProcessed = [];

      yearAll.forEach((p) => {
        const pAmount = parseFloat(p.base_amount.replace(/[$ ,]/g, ""));
        if (p.status === "Paid" && Math.abs(pAmount) < minValidPayment) {
          return;
        }
        const dueYear = parseInt(latestYear) + 1;
        if (p.status === "Paid" && Math.abs(pAmount - taxAmount) < 0.01) {
          p.payment_type = "Annual";
          p.due_date = `07/31/${dueYear}`;
          p.delq_date = `08/01/${dueYear}`;
          isAnnual = true;
          currentProcessed.push(p);
        } else if (Math.abs(pAmount - halfTax) < 0.01 || p.status === "Unpaid") {
          if (p.status === "Paid") {
            const paidMonth = p.paid_date !== "-" ? parseInt(p.paid_date.split("/")[0]) : 0;
            p.payment_type = paidMonth <= 6 ? "Installment #1" : "Installment #2";
            p.due_date = p.payment_type === "Installment #1" ? `03/31/${dueYear}` : `07/31/${dueYear}`;
            p.delq_date = p.payment_type === "Installment #1" ? `04/01/${dueYear}` : `08/01/${dueYear}`;
          }
          currentProcessed.push(p);
        }
      });

      // If not annual, add missing installments for current year
      if (!isAnnual) {
        const existingTypes = currentProcessed.map((p) => p.payment_type);
        const requiredTypes = ["Installment #1", "Installment #2"];
        const missingTypes = requiredTypes.filter((t) => !existingTypes.includes(t));
        for (const missingType of missingTypes) {
          const dueYear = parseInt(latestYear) + 1;
          const dueMonthDay = missingType === "Installment #1" ? "03/31" : "07/31";
          const delqMonthDay = missingType === "Installment #1" ? "04/01" : "08/01";
          const base = formatDollar(halfTax);
          currentProcessed.push({
            jurisdiction: "County",
            year: latestYear,
            payment_type: missingType,
            status: "Unpaid",
            base_amount: base,
            amount_paid: "$0.00",
            amount_due: base,
            mailing_date: "N/A",
            due_date: `${dueMonthDay}/${dueYear}`,
            delq_date: `${delqMonthDay}/${dueYear}`,
            paid_date: "-",
            good_through_date: "",
          });
        }
      }

      tax_history.push(...currentProcessed);

      // Sort tax_history by year ascending, then payment_type
      tax_history.sort((a, b) => {
        if (a.year !== b.year) {
          return parseInt(a.year) - parseInt(b.year); // Ascending year order
        }
        return a.payment_type.localeCompare(b.payment_type);
      });

      // Update statuses for unpaid entries based on current date
      tax_history = tax_history.map((entry) => {
        if (entry.status === "Unpaid") {
          const dueDate = parseDate(entry.due_date);
          const delqDate = parseDate(entry.delq_date);
          if (dueDate && delqDate) {
            if (currentDate < delqDate) {
              entry.status = "Due";
            } else {
              entry.status = "Delinquent";
            }
          }
        }
        return entry;
      });

      data.tax_history = tax_history;

      // Handle exempt case
      if (taxAmount === 0 || !formattedTaxAmounts[latestYear]) {
        data.notes = `ALL PRIORS ARE PAID, ${latestYear} NO TAXES DUE, POSSIBLY EXEMPT.`;
        data.delinquent = "NONE";
        data.tax_history = [];
      } else {
        // Set notes and delinquent status
        const hasPriorDelinquent = tax_history.some(p => parseInt(p.year) < currentTaxYear && p.status === "Delinquent");
        let priorNote = hasPriorDelinquent ? "PRIOR YEARS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ";

        let currentNote = `${latestYear} `;
        const currentPayments = data.tax_history.filter((p) => p.year === latestYear);
        const annual = currentPayments.find((x) => x.payment_type === "Annual");
        if (annual) {
          currentNote += `TAXES ARE ${annual.status.toUpperCase()} ANNUALLY`;
        } else {
          const first = currentPayments.find((x) => x.payment_type === "Installment #1") || { status: "Paid" };
          const second = currentPayments.find((x) => x.payment_type === "Installment #2") || { status: "Paid" };
          currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
        }
        currentNote += ", NORMALLY PAID IN INSTALLMENTS,NORMAL DUE DATES ARE 03/31 & 07/31.";
        data.notes = priorNote + currentNote;

        const hasDelinquent = tax_history.some(p => p.status === "Delinquent");
        data.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
      }

      resolve(data);
    } catch (error) {
      console.log(error);
      reject({ error: true, message: error.message });
    }
  });
};

// Account search flow
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
        .then((ac1_data) => {
          if (ac1_data.error) {
            resolve(ac1_data);
          } else {
            ac_2(page, ac1_data, account)
              .then((data2) => {
                ac_history(page, data2.data, data2.hasCurrentTax)
                  .then((data3) => {
                    resolve(data3);
                  })
                  .catch((error) => {
                    console.log(error);
                    reject(error);
                  });
              })
              .catch((error) => {
                console.log(error);
                reject(error);
              });
          }
        })
        .catch((error) => {
          console.log(error);
          reject(error);
        });
    } catch (error) {
      console.log(error);
      reject({ error: true, message: error.message });
    }
  });
};

// API + HTML routes
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
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

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["stylesheet", "font", "image"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, account)
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
    } else if (fetch_type === "api") {
      account_search(page, account)
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

export { search };