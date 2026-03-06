//Author:Dhanush

// controllers/HI/tax.controller.js
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//counties having same ui with different selectors and some different tables
const countyConfig = {
  maui: {
    baseUrl: "https://qpublic.schneidercorp.com/Application.aspx?AppID=1029&LayerID=21689&PageTypeID=4&PageID=9251&Q=139990018&KeyValue=",
    currentTaxBillSelector: "#ctlBodyPane_ctl07_ctl01_gvwCurrentTaxBill tbody tr",
    historicalTaxSelector: "#ctlBodyPane_ctl08_ctl01_gvwHistoricalTax tbody > tr",
    parcelSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span",
    addressSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl01_pnlSingleValue span",
    ownerSpanSelector: "#ctlBodyPane_ctl02_ctl01_lblOtherNames",
    ownerTableSelector: "#ctlBodyPane_ctl02_ctl01_gvwAllOwners tbody tr",
    valuationSelector: "#ctlBodyPane_ctl05_ctl01_gvValuation tbody tr",
    valuationIndices: { land_value: 2, improvements: 5, total_assessed_value: 6, exemption: 7, total_taxable_value: 8 },
    taxingAuthority: "Maui County Treasurer, 200 S. High Street, Wailuku, HI 96793, Ph: 808-270-8200",
  },
  kauai: {
    baseUrl: "https://qpublic.schneidercorp.com/Application.aspx?AppID=986&LayerID=20101&PageTypeID=4&PageID=8744&KeyValue=",
    currentTaxBillSelector: "#ctlBodyPane_ctl14_ctl01_gvwCurrentTaxBill tbody tr",
    historicalTaxSelector: "#ctlBodyPane_ctl15_ctl01_gvwHistoricalTax tbody > tr",
    parcelSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue span",
    addressSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl01_pnlSingleValue span",
    ownerSpanSelector: "#ctlBodyPane_ctl01_ctl01_lblOtherNames",
    ownerTableSelector: "#ctlBodyPane_ctl01_ctl01_gvwAllOwners tbody tr",
    valuationSelector: "#ctlBodyPane_ctl04_ctl01_gvValuation tbody tr",
    valuationIndices: { land_value: 2, improvements: null, total_assessed_value: 3, exemption: 4, total_taxable_value: 5 },
    taxingAuthority: "County of Kaua'i – Real Property Tax Collection, 4444 Rice Street, Suite A-454, Līhu'e, HI 96766, Ph: 808-241-4272",
  },
  hawaii: {
    baseUrl: "https://qpublic.schneidercorp.com/Application.aspx?AppID=1048&LayerID=23618&PageTypeID=4&PageID=9878&KeyValue=",
    currentTaxBillSelector: "#ctlBodyPane_ctl13_ctl01_gvwCurrentTaxBill tbody tr",
    historicalTaxSelector: "#ctlBodyPane_ctl14_ctl01_gvwHistoricalTax tbody > tr",
    parcelSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue span",
    addressSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl01_pnlSingleValue span",
    ownerSpanSelector: "#ctlBodyPane_ctl01_ctl01_lblOtherNames",
    ownerTableSelector: "#ctlBodyPane_ctl01_ctl01_pnlAllOwners tbody tr",
    valuationSelector: "#ctlBodyPane_ctl03_ctl01_gvValuation tbody tr",
    valuationIndices: { land_value: 7, improvements: null, total_assessed_value: 8, exemption: 9, total_taxable_value: 10 },
    taxingAuthority: "County of Hawaii – Real Property Tax Office, Aupuni Center, 101 Pauahi Street, Suite 4, Hilo, HI 96720, Ph: 808-961-8282",
  },
  honolulu: {
    baseUrl: "https://qpublic.schneidercorp.com/Application.aspx?AppID=1045&LayerID=23342&PageTypeID=4&PageID=9746&Q=1620964739&KeyValue=",
    currentTaxBillSelector: "#ctlBodyPane_ctl17_ctl01_gvwCurrentTaxBill tbody tr",
    historicalTaxSelector: "#ctlBodyPane_ctl19_ctl01_gvwHistoricalTax tbody > tr",
    parcelSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue span",
    addressSelector: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl01_pnlSingleValue span",
    ownerSpanSelector: "#ctlBodyPane_ctl01_ctl01_lblOtherNames",
    ownerTableSelector: "#ctlBodyPane_ctl01_ctl01_pnlAllOwners tbody tr",
    valuationSelector: "#ctlBodyPane_ctl03_ctl01_gvValuation tbody tr",
    valuationIndices: { land_value: 2, improvements: null, total_assessed_value: 9, exemption: 10, total_taxable_value: 11 },
    taxingAuthority: "City & County of Honolulu – Real Property Tax Division, 715 S. King Street, Room 505, Honolulu, HI 96813, Ph: 808-768-3980",
  },
};

const ac_1 = async (page, url, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const check_space = account.trim();
      if (!check_space) {
        return reject({
          error: true,
          message: "Enter account number"
        });
      }
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Handle modal if exists
      try {
        const agreeButton = await page.waitForSelector(".modal-footer .btn.btn-primary.button-1", { timeout: 10000 });
        if (agreeButton) {
          await agreeButton.click();
        }
      } catch (e) {
        console.log(e.message);
      }

      // Check if parcel exists
      await page.waitForSelector(config.parcelSelector, { timeout: 30000 });

      const data = await page.evaluate((config) => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        const result = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "-",
          borrower_name: "-",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "-",
          improvements: "-",
          total_assessed_value: "-",
          exemption: "-",
          total_taxable_value: "-",
          taxing_authority: config.taxingAuthority,
          notes: "-",
          delinquent: "NONE",
          tax_history: [],
        };

        // Get current tax year from website
        let currentTaxYear = null;
        const yearRows = document.querySelectorAll(config.historicalTaxSelector);
        for (const row of yearRows) {
          const yearBtn = row.querySelector("a[id^='btndiv']");
          const yearText = clean(yearBtn?.textContent || "");
          if (/^\d{4}$/.test(yearText)) {
            const year = parseInt(yearText);
            if (!currentTaxYear || year > currentTaxYear) {
              currentTaxYear = year;
            }
          }
        }

        // Fallback to current date if no year found
        if (!currentTaxYear) {
          const today = new Date();
          currentTaxYear = today.getFullYear();
          if (today.getMonth() < 6) currentTaxYear -= 1;
        }

        // Parcel number
        const parcelEl = document.querySelector(config.parcelSelector);
        result.parcel_number = parcelEl ? clean(parcelEl.textContent) : "-";

        // Property address
        const addressEl = document.querySelector(config.addressSelector);
        result.property_address = addressEl ? clean(addressEl.textContent) : "-";

        // Owner names
        const ownerSpan = document.querySelector(config.ownerSpanSelector);
        if (ownerSpan) {
          const raw = ownerSpan.textContent.replace("Owner Names", "").trim();
          const names = raw.split("Fee Owner").map((n) => n.trim()).filter((n) => n);
          result.owner_name = names.length ? names : ["-"];
        } else {
          const tableRows = document.querySelectorAll(config.ownerTableSelector);
          tableRows.forEach((row) => {
            const name = row.querySelector("th")?.textContent.trim() || "";
            if (name) result.owner_name.push(name);
          });
          if (result.owner_name.length === 0) result.owner_name = ["-"];
        }

        // Valuation
        const valuationRow = document.querySelector(config.valuationSelector);
        if (valuationRow) {
          const tds = valuationRow.querySelectorAll("td, th");
          const indices = config.valuationIndices;

          if (indices.land_value !== null && tds[indices.land_value]) {
            result.land_value = clean(tds[indices.land_value].textContent);
          }
          if (indices.improvements !== null && tds[indices.improvements]) {
            result.improvements = clean(tds[indices.improvements].textContent);
          }
          if (tds[indices.total_assessed_value]) {
            result.total_assessed_value = clean(tds[indices.total_assessed_value].textContent);
          }
          if (tds[indices.exemption]) {
            result.exemption = clean(tds[indices.exemption].textContent);
          }
          if (tds[indices.total_taxable_value]) {
            result.total_taxable_value = clean(tds[indices.total_taxable_value].textContent);
          }
        }

        // Current tax bill (unpaid items)
        const currentBillRows = document.querySelectorAll(config.currentTaxBillSelector);
        currentBillRows.forEach((row) => {
          const tds = row.querySelectorAll("td, th");
          if (tds.length < 10) return;

          const period = clean(tds[0]?.textContent || "");
          const desc = clean(tds[1]?.textContent || "");

          // Skip totals and irrelevant rows
          if (/Tax Bill with Interest/i.test(desc) || !/^\d{4}-\d+$/.test(period)) return;

          const year = period.split("-")[0];
          const dueDate = clean(tds[2]?.textContent || "");
          const baseAmount = clean(tds[5]?.textContent || "").replace(/[()]/g, "");
          const amountDue = clean(tds[9]?.textContent || "").replace(/[()]/g, "");

          const numDue = parseFloat(amountDue.replace(/[^\d.\-]/g, "")) || 0;
          const paymentType = period.endsWith("-1") ? "Semi-Annual" :
            period.endsWith("-2") ? "Semi-Annual" : "Annual";

          // Calculate delq_date
          let delqDate = "";
          if (dueDate) {
            const [mm, dd, yyyy] = dueDate.split("/").map((x) => parseInt(x));
            const d = new Date(yyyy, mm - 1, dd);
            d.setDate(d.getDate() + 1);
            delqDate = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
          }

          result.tax_history.push({
            jurisdiction: "County",
            year: year,
            payment_type: paymentType,
            status: numDue > 0 ? "Unpaid" : "Paid",
            base_amount: baseAmount || "$0.00",
            amount_paid: numDue > 0 ? "$0.00" : baseAmount || "$0.00",
            amount_due: `$${numDue.toFixed(2)}`,
            mailing_date: "N/A",
            due_date: dueDate || "-",
            delq_date: delqDate || "-",
            paid_date: numDue > 0 ? "-" : clean(tds[4]?.textContent) || "-",
            good_through_date: "-",
          });
        });

        // Historical tax (paid items for current year)
        const detailRow = document.querySelector(`#tr${currentTaxYear}`);
        if (detailRow) {
          const paymentsTable = detailRow.querySelector(`#div${currentTaxYear} table[id*="_gvwHistoricalTax_Payments"]`);

          if (paymentsTable) {
            const trs = paymentsTable.querySelectorAll("tbody tr");
            trs.forEach((tr, idx) => {
              const tds = tr.querySelectorAll("td");
              if (tds.length < 3) return;

              const label = clean(tds[0]?.textContent);
              if (/^Totals:$/i.test(label)) return;

              const paidDate = clean(tds[1]?.textContent);
              const paidAmt = clean(tds[2]?.textContent).replace(/[()]/g, "");

              result.tax_history.push({
                jurisdiction: "County",
                year: String(currentTaxYear),
                payment_type: idx === 0 ? "Semi-Annual" : "Semi-Annual",
                status: "Paid",
                base_amount: paidAmt || "$0.00",
                amount_paid: paidAmt || "$0.00",
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: "-",
                delq_date: "-",
                paid_date: paidDate || "-",
                good_through_date: "-",
              });
            });
          } else {
            const detailTable = detailRow.querySelector(`#div${currentTaxYear} table[id*="_gvwHistoricalTax_Detail"]`);
            if (detailTable) {
              const trs = detailTable.querySelectorAll("tbody tr");
              let periodPayments = {};

              trs.forEach((tr) => {
                const tds = tr.querySelectorAll("td");
                if (tds.length < 7) return;

                const period = clean(tds[0].textContent);
                const desc = clean(tds[1].textContent);
                const tax = parseFloat(clean(tds[2].textContent).replace(/[^0-9.]/g, "")) || 0;
                const payCred = parseFloat(clean(tds[3].textContent).replace(/[()$,]/g, "").trim()) || 0;

                if (period === "Totals:") return;

                if (!periodPayments[period]) {
                  periodPayments[period] = { base: 0, paid: 0, paidDate: "", isAdjusted: false };
                }

                if (desc === "Beginning Tax") {
                  periodPayments[period].base = tax;
                } else if (desc === "Adjustment") {
                  periodPayments[period].paid += payCred;
                  periodPayments[period].isAdjusted = true;
                } else if (desc === "Payment") {
                  periodPayments[period].paid += payCred;
                  periodPayments[period].paidDate = clean(tds[4]?.textContent) || "";
                }
              });

              for (const period in periodPayments) {
                const p = periodPayments[period];
                if (Math.abs(p.base + p.paid) < 0.01) {
                  let paymentType = "Annual";
                  if (period.endsWith("-1")) paymentType = "1st Installment";
                  else if (period.endsWith("-2")) paymentType = "2nd Installment";

                  result.tax_history.push({
                    jurisdiction: "County",
                    year: String(currentTaxYear),
                    payment_type: paymentType === "Annual" ? "Annual" : "Semi-Annual",
                    status: "Paid",
                    base_amount: `${p.base.toFixed(2)}`,
                    amount_paid: `${Math.abs(p.paid).toFixed(2)}`,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: "-",
                    delq_date: "-",
                    paid_date: p.isAdjusted ? "Adjusted" : p.paidDate,
                    good_through_date: "-",
                  });
                }
              }
            }
          }
        }

        // Determine if semi-annual or annual
        const yearCount = new Map();
        result.tax_history.forEach((item) => {
          yearCount.set(item.year, (yearCount.get(item.year) || 0) + 1);
        });

        result.tax_history.forEach((item) => {
          const countForYear = yearCount.get(item.year);

          // If only 1 payment for the year, it's Annual
          if (countForYear === 1) {
            item.payment_type = "Annual";
          } else {
            // Multiple payments = Semi-Annual
            if (item.payment_type.includes("1st")) {
              item.payment_type = "Semi-Annual";
            } else if (item.payment_type.includes("2nd")) {
              item.payment_type = "Semi-Annual";
            }
          }
        });

        // Assign due dates for items missing them
        result.tax_history.forEach((item) => {
          if (item.due_date !== "-") return;

          const year = parseInt(item.year);
          let dueDate;

          if (item.payment_type === "Semi-Annual") {
            // For semi-annual, first payment is Aug 20, second is Feb 20
            const idx = result.tax_history.filter(x => x.year === item.year).indexOf(item);
            if (idx === 0) {
              dueDate = new Date(year, 7, 20); // August 20
            } else {
              dueDate = new Date(year + 1, 1, 20); // February 20 next year
            }
          } else {
            // Annual payment due Feb 20
            dueDate = new Date(year + 1, 1, 20);
          }

          // Adjust for weekends
          if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
          else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);

          const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
          item.due_date = fmt(dueDate);

          const delq = new Date(dueDate);
          delq.setDate(delq.getDate() + 1);
          item.delq_date = fmt(delq);
        });

        // Update statuses based on dates
        const today = new Date();
        result.tax_history.forEach((item) => {
          if (item.status === "Paid") return;

          const [mm, dd, yyyy] = item.delq_date.split("/").map(Number);
          const delqDate = new Date(yyyy, mm - 1, dd);
          const [dmm, ddd, dyyyy] = item.due_date.split("/").map(Number);
          const dueDate = new Date(dyyyy, dmm - 1, ddd);

          if (today < dueDate) {
            item.status = "Due";
          } else if (today >= delqDate) {
            item.status = "Delinquent";
          } else {
            item.status = "Due";
          }
        });

        // Sort by year and payment type
        result.tax_history.sort((a, b) => {
          if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
          return a.payment_type.localeCompare(b.payment_type);
        });

        // Build notes
        const currentYearItems = result.tax_history.filter((x) => x.year === String(currentTaxYear));
        const priorYears = result.tax_history.filter((x) => parseInt(x.year) < currentTaxYear);
        const priorDelinquent = priorYears.some((x) => x.status === "Delinquent" || x.status === "Unpaid");

        if (currentYearItems.length === 0) {
          result.notes = "NO TAX HISTORY FOUND FOR CURRENT YEAR.";
          result.delinquent = "NONE";
        } else {
          let priorNote = priorDelinquent ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID";
          let currentNote = "";

          const isSemiAnnual = currentYearItems.some(x => x.payment_type === "Semi-Annual");
          const isAnnual = currentYearItems.some(x => x.payment_type === "Annual");

          if (isAnnual && currentYearItems.length === 1) {
            const status = currentYearItems[0].status.toUpperCase();
            currentNote = `${currentTaxYear}: ANNUAL TAX STATUS IS ${status}, NORMAL TAXES ARE PAID ANNUALLY, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 08/20 AND 02/20.`;
          } else if (isSemiAnnual) {
            const first = currentYearItems[0];
            const second = currentYearItems[1];
            const firstStatus = first ? first.status.toUpperCase() : "UNKNOWN";
            const secondStatus = second ? second.status.toUpperCase() : "UNKNOWN";
            currentNote = `${currentTaxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 08/20 AND 02/20.`;
          } else {
            currentNote = `${currentTaxYear}: TAX STATUS UNKNOWN.`;
          }

          result.notes = `${priorNote}. ${currentNote}`;

          const hasDelinquent = result.tax_history.some((x) => x.status === "Delinquent");
          result.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
        }

        return result;
      }, config);

      resolve(data);
    } catch (error) {
      console.log("Error in ac_1:", error);
      reject(new Error("Record Not Found"));
    }
  })
};

const account_search = async (page, url, account, config) => {
  return new Promise((resolve, reject) => {
    try{
      ac_1(page,url,account,config)
      .then((data)=>{
        resolve(data);
      })
      .catch((error)=>{
        console.log(error);
        reject(error);
      })
    }
    catch(error){
      console.log(error);
      reject(new Error(error.message));
    }
    
  })
}

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const county = req.path.replace(/^\/+/, "");
  
  try {
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    if (!county || !countyConfig[county]) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid County",
      });
    }

    const config = countyConfig[county];
    const url = `${config.baseUrl}${account}`;

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(90000);

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
      account_search(page, url, account, config)
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
      account_search(page, url, account, config)
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

module.exports = { search };