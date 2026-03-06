//Author: Dhanush 

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");
const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, account,yearsRequested) => {
  try {
    const url = `https://beacon.schneidercorp.com/Application.aspx?AppID=1148&LayerID=30658&PageTypeID=4&PageID=12423&Q=2073515622&KeyValue=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout_option });
    const data = await page.evaluate((yearsRequested) => {
      let data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: "",
        land_value: "$0.00",
        improvements: "$0.00",
        total_assessed_value: "$0.00",
        exemption: "",
        total_taxable_value: "$0.00",
        taxing_authority: "Auglaize County Treasurer, OH - 209 S. Blackhoof St., Wapakoneta, OH 45895",
        notes: "",
        delinquent: "NONE",
        tax_history: [],
      };

      // Helper functions
      const formatMoney = (num) => {
        if (!num && num !== 0) return "$0.00";
        const n = typeof num === "string" ? parseFloat(num.replace(/[$,()]/g, "")) || 0 : num;
        return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const parseDollar = (str) => {
        if (!str) return 0;
        return parseFloat(str.toString().replace(/[$,()]/g, "")) || 0;
      };

      const isDelinquent = (dateStr) => {
        if (!dateStr || dateStr === "-" || dateStr === "N/A") return false;
        const today = new Date();
        const delqDate = new Date(dateStr);
        return today >= delqDate;
      };

      // Extract parcel number
      const parcelElement = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span").textContent.trim() ||"N/A";
      if(parcelElement==="N/A"){
        throw new Error("No Record Found");
      }
      data.parcel_number=parcelElement
      // Extract property address
      const propertyElement = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl01_pnlSingleValue span");
      data.property_address = propertyElement ? propertyElement.textContent.trim() : "N/A";

      // Extract owner name
      let ownerElement =
        document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch") ||
        document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch");
      data.owner_name = ownerElement ? [ownerElement.textContent.trim()] : ["N/A"];


      const valuationTable = document.querySelector("#ctlBodyPane_ctl02_ctl01_grdValuation_grdYearData");
      
      if (valuationTable) {
        const yearTh = valuationTable.querySelector("thead tr th:nth-child(2)");
        if (yearTh) {
          const yearText = yearTh.textContent.trim();
          const yearMatch = yearText.match(/\d{4}/);
          if (yearMatch) valuationYear = parseInt(yearMatch[0], 10);
        }

        const rows = [...valuationTable.querySelectorAll("tbody tr")];
        rows.forEach(row => {
          const th = row.querySelector("th");
          const td = row.querySelector("td");
          if (th && td) {
            const label = th.textContent.trim();
            const value = td.textContent.trim();
            if (label === "Land Value") {
              data.land_value = value;
            } else if (label === "Building Value") {
              data.improvements = value;
            } else if (label === "Total Value (Appraised 35%)") {
              data.total_assessed_value = value;
              data.total_taxable_value = value;
            }
          }
        });
      }

      // Calculate tax year (previous year of valuation year)
      const taxYear = valuationYear;
      const payableYear = valuationYear+1;
      const taxYearDur=`${taxYear}-${payableYear}`;

      // Extract current tax bill data
      const taxBillTable = document.querySelector("#ctlBodyPane_ctl05_ctl01_lstReport .tabular-data");
      let currentNetTaxes = 0;
      let halfYearDue = 0;
      let fullYearDue = 0;
      let payments = 0;

      if (taxBillTable) {
        const billRows = [...taxBillTable.querySelectorAll("tr")];
        billRows.forEach(row => {
          const td1 = row.querySelector("td:first-child");
          const td2 = row.querySelector("td:last-child");
          if (td1 && td2) {
            const label = td1.textContent.trim();
            const value = td2.textContent.trim();
            
            if (label === "Current Net Taxes") {
              currentNetTaxes = parseDollar(value);
            } else if (label === "Half Year Due") {
              halfYearDue = parseDollar(value);
            } else if (label === "Full Year Due") {
              fullYearDue = parseDollar(value);
            } else if (label === "Payments") {
              payments = parseDollar(value);
            }
          }
        });
      }

      // Extract payment history
      const paymentTable = document.querySelector("#ctlBodyPane_ctl06_ctl01_grdTaxHistories_grdFlat");
      const paymentRecords = [];
      
      if (paymentTable) {
        const paymentRows = [...paymentTable.querySelectorAll("tbody tr")];
        paymentRows.forEach(row => {
          const th = row.querySelector("th");
          const td = row.querySelector("td");
          if (th && td) {
            const paymentDate = th.textContent.trim();
            let amountPaid = td.textContent.trim();

            // Fix negative amounts in parentheses
            if (amountPaid.startsWith("($") && amountPaid.endsWith(")")) {
              amountPaid = amountPaid.replace("($", "$").replace(")", "");
            }
            amountPaid = amountPaid.replace(/\s+/g, "").trim();

            if (parseDollar(amountPaid) > 0) {
              paymentRecords.push({
                date: paymentDate,
                amount: parseDollar(amountPaid)
              });
            }
          }
        });
      }

      // Sort payments by date
      paymentRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Determine tax structure and create tax history
      if (currentNetTaxes > 0) {
        const totalPaid = paymentRecords.reduce((sum, p) => sum + p.amount, 0);
        const totalDue = halfYearDue + fullYearDue;

        // Determine if annual or semi-annual
        if (paymentRecords.length === 1 && Math.abs(totalPaid - currentNetTaxes) < 1) {
          // Annual payment
          data.tax_history.push({
            jurisdiction: "County",
            year: taxYearDur.toString(),
            payment_type: "Annual",
            status: "Paid",
            base_amount: formatMoney(currentNetTaxes),
            amount_paid: formatMoney(totalPaid),
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `07/15/${payableYear}`,
            delq_date: `07/16/${payableYear}`,
            paid_date: paymentRecords[0].date,
            good_through_date: "",
          });
        } else {
          // Semi-annual payments
          const halfAmount = currentNetTaxes / 2;
          
          // First half
          const firstPaid = paymentRecords[0] ? paymentRecords[0].amount : 0;
          const firstDue = halfYearDue > 0 ? halfYearDue : Math.max(0, halfAmount - firstPaid);
          const firstStatus = firstDue > 0.01 ? (isDelinquent(`02/16/${payableYear}`) ? "Delinquent" : "Due") : "Paid";
          
          data.tax_history.push({
            jurisdiction: "County",
            year: taxYearDur.toString(),
            payment_type: "Semi-Annual",
            status: firstStatus,
            base_amount: formatMoney(halfAmount),
            amount_paid: formatMoney(firstPaid),
            amount_due: formatMoney(firstDue),
            mailing_date: "N/A",
            due_date: `02/15/${payableYear}`,
            delq_date: `02/16/${payableYear}`,
            paid_date: paymentRecords[0] ? paymentRecords[0].date : "-",
            good_through_date: "",
          });

          // Second half
          const secondPaid = paymentRecords[1] ? paymentRecords[1].amount : 0;
          const secondDue = fullYearDue > 0 ? (fullYearDue - halfYearDue) : Math.max(0, halfAmount - secondPaid);
          const secondStatus = secondDue > 0.01 ? (isDelinquent(`07/16/${payableYear}`) ? "Delinquent" : "Due") : "Paid";
          
          data.tax_history.push({
            jurisdiction: "County",
            year: taxYearDur.toString(),
            payment_type: "Semi-Annual",
            status: secondStatus,
            base_amount: formatMoney(halfAmount),
            amount_paid: formatMoney(secondPaid),
            amount_due: formatMoney(secondDue),
            mailing_date: "N/A",
            due_date: `07/15/${payableYear}`,
            delq_date: `07/16/${payableYear}`,
            paid_date: paymentRecords[1] ? paymentRecords[1].date : "-",
            good_through_date: "",
          });
        }
      }

      // Check for delinquency
      const hasDelinquent = data.tax_history.some(t => t.status === "Delinquent");
      const hasDue = data.tax_history.some(t => t.status === "Due");

      if (hasDelinquent) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      } else if (hasDue) {
        data.delinquent = "NONE";
      } else {
        data.delinquent = "NONE";
      }
      if(yearsRequested>1){
        data.notes="AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE.";
      }

      // Generate notes
      if (data.tax_history.length > 0) {
        const yearRecords = data.tax_history.filter(t => t.year === taxYearDur.toString());
        
        if (yearRecords.length === 1) {
          const status = yearRecords[0].status.toUpperCase();
          data.notes += `ALL PRIOR YEARS ARE PAID. ${taxYearDur}: ANNUAL TAX IS ${status}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 07/15.`;
        } else if (yearRecords.length === 2) {
          const firstStatus = yearRecords[0].status.toUpperCase();
          const secondStatus = yearRecords[1].status.toUpperCase();
          
          if (hasDelinquent) {
            data.notes += `PRIOR YEARS TAXES ARE DELINQUENT. ${taxYearDur}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}. NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/15 AND 07/15.`;
          } else if (firstStatus === "PAID" && secondStatus === "PAID") {
            data.notes += `ALL PRIORS ARE PAID. ${taxYearDur}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}. NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/15 AND 07/15.`;
          } else {
            data.notes += `ALL PRIORS ARE PAID. ${taxYearDur}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}. NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/15 AND 07/15.`;
          }
        }
      } else {
        data.notes += `${taxYear}: NO PAYMENT OR TAX HISTORY FOUND – ASSUMED CURRENT.`;
      }

      return data;
    },yearsRequested);

    return data;
  } catch (error) {
    console.error(`Error processing account ${account}:`, error);
    throw new Error("Record not found");
  }
};

const account_search = async (page, account,yearsRequested=1) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account,yearsRequested)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          console.log(error);
          reject(error);
        });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};


const search = async (req, res) => {
  const { fetch_type, account,client} = req.body;
  try {
    if (account.trim() == '' || !account) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }
    const yearsRequested = getOHCompanyYears(client);

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
      account_search(page,account,yearsRequested)
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
      account_search(page,account,yearsRequested)
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