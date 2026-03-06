// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//TIMEOUT 900000
const timeout_option = {
  timeout: 90000
};

// Check if a date is past due
const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  if (today >= delq_date) {
    return true;
  }
  return false;
}

//HELPER FOR PARSE THE CURRENCY
const parseCurrency = (currencyStr) => {
  if (!currencyStr) return 0;
  return parseFloat(currencyStr.replace(/[$,]/g, "")) || 0;
};
//HELPER FOR FORMATING THE CURRENCY
const formatCurrency = (amount) => {
  return `$${amount.toFixed(2)}`;
};

// Get due and delinquent dates for a tax year
const calculateDueDates = (taxYear) => {
  const year = parseInt(taxYear);
  return {
    first_half_due: `10/01/${year}`,
    first_half_delq: `11/03/${year}`,
    second_half_due: `03/01/${year + 1}`,
    second_half_delq: `05/01/${year + 1}`,
    annual_due: `12/31/${year}`,
    annual_delq: `01/01/${year + 1}`
  };
};

// SEARCH FOR PARCEL
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      //goto the url 
      const url = "https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      //WAIT FOR THE SELECTOR TO TYPE
      await page.waitForSelector("#txtParcelNumber", timeout_option);
      await page.type("#txtParcelNumber", account);
      //SUBMIT AND GET RESULTS
      Promise.all([
        page.click("#btnFindAccount"),
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 })
      ])
      .then(async () => {
        //CHECKING FOR THE PARCEL IS VALID OR NOT
        const noResults = await page.$("#staticBackdrop3");
        if (!noResults) {
          reject(new Error("Invalid Parcel Number or No Records Found"));
        } else {
          //GO TO THE NEXT 
          resolve(true);
        }
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

//  EXTRACT PROPERTY INFO
const ac_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#divNextYear", timeout_option);
      // TODAY DATE 
      const today = new Date();
      const processed_date = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      //PARCEL DATA 
      const page_data = await page.evaluate(() => {
        const datum = {
          processed_date: "",
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
          taxing_authority: "Navajo County Treasurer, 100 East Code Talkers Drive, Holbrook, AZ 86025, Ph: 928-524-4188",
          notes: "",
          delinquent: "NONE",
          tax_history: []
        };
        //OWNER NAME 
        const ownershipText = document.querySelector("#lblOwnership_NextYear")?.innerText || "";
        const ownerLines = ownershipText.split("\n").map(line => line.trim()).filter(Boolean);
        if (ownerLines.length > 0) {
          datum.owner_name = [ownerLines[0]];
          datum.property_address = ownerLines.slice(1).join(" ");
        }

        datum.land_value = document.querySelector("#lblLandValue_NextYear")?.innerText.trim() || "-";//LAND VALUE
        datum.improvements = document.querySelector("#lblImprovement_NextYear")?.innerText.trim() || "-";//IMPROVEMENTS
        datum.total_assessed_value = document.querySelector("#lblFullCashVal_NextYear")?.innerText.trim() || "-";//TOTAL ASSSESED VALUE
        datum.exemption = document.querySelector("#lblExemptAmount_NextYear")?.innerText.trim() || "-";//EXEMPTION
        datum.total_taxable_value = document.querySelector("#lblLimValAssessed_NextYear")?.innerText.trim() || "-";//TOTAL TAXABLE VALUE
        //RETURNING TO DATA 
        return datum;
      });
      //IF THERE WILL BE HAVING THE ALL VALUES EMPTY THEN WE TAKING AS INVALID
      const allEmpty = [
        page_data.land_value,
        page_data.improvements,
        page_data.total_assessed_value,
        page_data.exemption,
        page_data.total_taxable_value
      ].every(v => v === "-" || v === "");

      if (allEmpty) {
        return reject(new Error("Invalid Parcel Number or No Records Found"));
      }

      page_data.processed_date = processed_date;
      page_data.parcel_number = account;

      resolve(page_data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// GET TAX HISTORY FROM TAX REPORT
const ac_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      //DIRECTLY TO GET THE PAYMENT DATA 
      const taxReportUrl = `https://apps.navajocountyaz.gov/NavajoWebPayments/TaxReport?taxid=${account}`;
      await page.goto(taxReportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("#grdChargeHistory", timeout_option);

      const page_data = await page.evaluate(() => {
        const chargeRows = Array.from(document.querySelectorAll("#grdChargeHistory tbody tr"));
        const paymentRows = Array.from(document.querySelectorAll("#grdPaymentHistory tbody tr"));

        const status_data = {};
        let max_year = 0;
        //TAKING THE DATA FOR MAX YEAR AND INFORMATION OF TAXES
        chargeRows.forEach((row, i) => {
          if (i === 0) return;
          const cells = row.querySelectorAll("td");
          if (cells.length >= 8) {
            const year = cells[0].innerText.trim();
            max_year = (year > max_year) ? year : max_year;

            status_data[year] = {
              roll_number: cells[1].innerText.trim(),
              status: cells[2].innerText.trim(),
              taxes: cells[3].innerText.trim(),
              interest: cells[4].innerText.trim(),
              fees: cells[5].innerText.trim(),
              payments: cells[6].innerText.trim(),
              balance: cells[7].innerText.trim(),
              payment_details: []
            };
          }
        });
        //PAYMENT TABLE
        paymentRows.forEach((row, i) => {
          if (i === 0) return;
          const cells = row.querySelectorAll("td");
          if (cells.length >= 7) {
            const year = cells[0].innerText.trim();
            if (status_data[year]) {
              status_data[year].payment_details.push({
                amount: cells[2].innerText.trim(),
                payment_date: cells[3].innerText.trim(),
                remitter: cells[4].innerText.trim()
              });
            }
          }
        });
        //RETURNING THE DATA AND MAX YEAR OR LATEST YEAR
        return { status_data, max_year };
      });

      resolve({
        data: data,
        status_data: page_data.status_data,
        max_year: page_data.max_year
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//  PROCESS TAX HISTORY INTO INSTALLMENTS
const ac_4 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      //TAX DATA FROM AC-3 FUNCTION PARCEL REPORT CARD 
      const status_data = main_data.status_data;
      const processed_data = {};
      //CREATING THE TAX HISTORY
      for (const year in status_data) {
        const tax = status_data[year];
        const totalTax = parseCurrency(tax.taxes);
        const totalPaid = parseCurrency(tax.payments);
        const balance = parseCurrency(tax.balance);
        const half = totalTax / 2;

        const payments = tax.payment_details.sort((a, b) => 
          new Date(a.payment_date) - new Date(b.payment_date)
        );

        processed_data[year] = {
          base_amount: formatCurrency(totalTax),
          history: []
        };

        // CHECK: If total tax is below $100, must be paid annually only
        const isAnnualOnly = totalTax < 100;

        // Determine payment structure
        if (isAnnualOnly) {
          // ANNUAL ONLY (below $100)
          if (balance <= 0.01) {
            processed_data[year].history.push({
              jurisdiction: "County",
              year: year,
              installment: "Annual",
              roll_number: tax.roll_number,
              payment_type: "Annual",
              status: "Paid",
              base_amount: formatCurrency(totalTax),
              amount_paid: tax.payments,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: payments[0]?.payment_date || "-",
              good_through_date: ""
            });
          } else {
            processed_data[year].history.push({
              jurisdiction: "County",
              year: year,
              installment: "Annual",
              roll_number: tax.roll_number,
              payment_type: "Annual",
              status: "Due",
              base_amount: formatCurrency(totalTax),
              amount_paid: tax.payments,
              amount_due: formatCurrency(balance),
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: payments[0]?.payment_date || "-",
              good_through_date: ""
            });
          }
        } else if (balance <= 0.01) {
          // FULLY PAID
          if (payments.length === 2) {
            // Two installments
            processed_data[year].history.push({
              jurisdiction: "County",
              year: year,
              installment: "1",
              roll_number: tax.roll_number,
              payment_type: "Semi-Annual",
              status: "Paid",
              base_amount: formatCurrency(half),
              amount_paid: payments[0].amount,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: payments[0].payment_date,
              good_through_date: ""
            });

            processed_data[year].history.push({
              jurisdiction: "County",
              year: year,
              installment: "2",
              roll_number: tax.roll_number,
              payment_type: "Semi-Annual",
              status: "Paid",
              base_amount: formatCurrency(half),
              amount_paid: payments[1].amount,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: payments[1].payment_date,
              good_through_date: ""
            });
          } else {
            // Single annual payment
            processed_data[year].history.push({
              jurisdiction: "County",
              year: year,
              installment: "Annual",
              roll_number: tax.roll_number,
              payment_type: "Annual",
              status: "Paid",
              base_amount: formatCurrency(totalTax),
              amount_paid: tax.payments,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: payments[0]?.payment_date || "-",
              good_through_date: ""
            });
          }
        } else if (totalPaid >= half * 0.90) {
          // FIRST INSTALLMENT PAID, SECOND DUE
          processed_data[year].history.push({
            jurisdiction: "County",
            year: year,
            installment: "1",
            roll_number: tax.roll_number,
            payment_type: "Semi-Annual",
            status: "Paid",
            base_amount: formatCurrency(half),
            amount_paid: payments[0]?.amount || "$0.00",
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: payments[0]?.payment_date || "-",
            good_through_date: ""
          });

          processed_data[year].history.push({
            jurisdiction: "County",
            year: year,
            installment: "2",
            roll_number: tax.roll_number,
            payment_type: "Semi-Annual",
            status: "Due",
            base_amount: formatCurrency(half),
            amount_paid: "$0.00",
            amount_due: formatCurrency(balance),
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: "-",
            good_through_date: ""
          });
        } else {
          // NO PAYMENT OR INSUFFICIENT PAYMENT - BOTH DUE
          processed_data[year].history.push({
            jurisdiction: "County",
            year: year,
            installment: "1",
            roll_number: tax.roll_number,
            payment_type: "Semi-Annual",
            status: "Due",
            base_amount: formatCurrency(half),
            amount_paid: totalPaid > 0 ? tax.payments : "$0.00",
            amount_due: formatCurrency(Math.max(half - totalPaid, 0)),
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: payments[0]?.payment_date || "-",
            good_through_date: ""
          });

          processed_data[year].history.push({
            jurisdiction: "County",
            year: year,
            installment: "2",
            roll_number: tax.roll_number,
            payment_type: "Semi-Annual",
            status: "Due",
            base_amount: formatCurrency(half),
            amount_paid: "$0.00",
            amount_due: formatCurrency(Math.max(balance - Math.max(half - totalPaid, 0), 0)),
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: "-",
            good_through_date: ""
          });
        }
      }

      resolve({
        data: main_data.data,
        history_data: processed_data,
        max_year: main_data.max_year
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//  ADD DUE DATES AND CALCULATE DELINQUENCY
const ac_5 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      let history_data = main_data.history_data;
      let max_year = main_data.max_year;

      const main_history_data = [];
      let has_prior_delq = false;
      const delq_years = [];

      for (const year in history_data) {
        let history = history_data[year].history;
        const dueDates = calculateDueDates(year);
        //ADDING THE DUE DATES AND DELQ DATES
        history.forEach((h, i) => {
          if (h.installment === "Annual") {
            h.due_date = dueDates.annual_due;
            h.delq_date = dueDates.annual_delq;
          } else if (h.installment === "1") {
            h.due_date = dueDates.first_half_due;
            h.delq_date = dueDates.first_half_delq;
          } else if (h.installment === "2") {
            h.due_date = dueDates.second_half_due;
            h.delq_date = dueDates.second_half_delq;
          }

          if (h.status === "Due") {
            if (is_delq(h.delq_date)) {
              h.status = "Delinquent";
              main_data.data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
              
              if (parseInt(year) < parseInt(max_year)) {
                has_prior_delq = true;
                if (!delq_years.includes(year)) {
                  delq_years.push(year);
                }
              }
            }
          }

          main_history_data.push(h);
        });
      }

      // Build notes
      let priorNote = has_prior_delq 
        ? `PRIORS YEAR(S) TAXES ARE DELINQUENT ${delq_years.sort().join(", ")}` 
        : "ALL PRIORS YEAR(S) TAXES ARE PAID";
      
      let currentNote = "";
      let dueNote = "";

      // Check if all entries are Annual or if there are Semi-Annual
      const hasAnyInstallments = main_history_data.some(h => h.installment === "1" || h.installment === "2");

      if (history_data[max_year]) {
        const currentHistory = history_data[max_year].history;
        const currentTotalTax = parseCurrency(history_data[max_year].base_amount);
        
        if (currentHistory.length === 1 && currentHistory[0].installment === "Annual") {
          currentNote = `, ${max_year} TAXES ARE ${currentHistory[0].status.toUpperCase()}`;
        } else if (currentHistory.length === 2) {
          currentNote = `, ${max_year} 1ST INSTALLMENT IS ${currentHistory[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${currentHistory[1].status.toUpperCase()}`;
        }
      }

      // Set due date note based on payment type
      if (hasAnyInstallments) {
        dueNote = `. NORMALLY TAXES ARE PAID IN SEMI-ANNUAL, NORMAL DUE DATES ARE 10/01 & 03/01`;
      } else {
        dueNote = `. NORMAL DUE DATE FOR ANNUAL IS 12/31`;
      }

      main_data.data.notes = priorNote + currentNote + dueNote;

      // FILTER LOGIC: Show latest year + any years with Due/Delinquent
      const latestYear = parseInt(max_year);
      
      // Get years that have any Due or Delinquent entries
      const yearsWithUnpaid = new Set(
        main_history_data
          .filter(t => t.status === "Delinquent" || t.status === "Due" || parseCurrency(t.amount_due) > 0.01)
          .map(t => parseInt(t.year))
      );

      // Always include the latest year
      yearsWithUnpaid.add(latestYear);

      // Filter to show only relevant years
      main_data.data.tax_history = main_history_data.filter(t => 
        yearsWithUnpaid.has(parseInt(t.year))
      );

      resolve(main_data.data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// MAIN ACCOUNT SEARCH FUNCTION
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
        .then((data) => {
          ac_2(page, account)
            .then((data1) => {
              ac_3(page, data1, account)
                .then((data2) => {
                  ac_4(page, data2, account)
                    .then((data3) => {
                      ac_5(page, data3, account)
                        .then((data4) => {
                          resolve(data4);
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

// MAIN SEARCH FUNCTION
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if(account.trim()==''||!account){
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      account_search(page, account)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render('error_data', {
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type == "api") {
      account_search(page, account)
        .then((data) => {
          res.status(200).json({
            result: data
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type == "html") {
      res.status(200).render('error_data', {
        error: true,
        message: error.message
      });
    } else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
};

module.exports = { search };