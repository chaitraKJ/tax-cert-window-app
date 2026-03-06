// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const timeout_option = { timeout: 90000 };
const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};
// Navigate and search
const jc_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      
      const url = `https://jeffersonmo.devnetwedge.com`;
     
      // Navigate to main page
      await page.goto(url, { waitUntil: "domcontentloaded", timeout_option });
      await page.waitForSelector('li:first-child button[role="tab"]',{timeout_option});
     
      // Click first tab (Parcel Search)
      await page.click('li:first-child button[role="tab"]');
      await page.waitForSelector("#parcel-search-property-key", timeout_option);
     
      // Fill account
      await page.locator("#parcel-search-property-key").fill(account);
      await page.waitForSelector("#parcel-search-include-all-years", timeout_option);
      const checkbox = await page.$("#parcel-search-include-all-years");
      const isChecked = await checkbox.evaluate(el => el.checked);
      if (!isChecked) {
        // Ensure "Include All Years" is checked
        await checkbox.click();
      }
      await page.waitForSelector('button[type="submit"]', timeout_option);
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "domcontentloaded" })
      ]);
      const currentUrl = page.url();
      if (currentUrl.includes("/Search/") && currentUrl.includes("Search/SearchResults") && !currentUrl.includes("/parcel/view/")) {
        // No parcel found — reject
        reject(new Error("No Record Found"));
      } else {
        const hasPropertyData = await page.evaluate(() => {
          return document.querySelector("#OverviewJefferson") !== null;
        });
        if (!hasPropertyData) {
          // Details page failed to load
          reject(new Error("Property details page not loaded"));
        } else {
          // Success — proceed
          resolve(true);
        }
      }
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
// STEP 2: Extract overview
const jc_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#OverviewJefferson", timeout_option);
      const page_data = await page.evaluate(() => {
        // Initialize result object
        const datum = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number:"",
          land_value: "N/A",
          improvements: "N/A",
          total_assessed_value: "",
          exemption: "N/A",
          total_taxable_value: "",
          taxing_authority: "Jefferson County Collector of Revenue, 729 Maple Street, Suite 36, Hillsboro, MO 63050, Ph: 636-797-5406",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };
        const overviewTable = document.querySelector("#OverviewJefferson tbody");
        if (overviewTable) {
          const rows = overviewTable.querySelectorAll("tr");
          const accountNumber = rows[0]?.querySelectorAll("td")[0]?.querySelector(".inner-value");
          if (accountNumber) {
            // Extract parcel number
            datum.parcel_number = accountNumber.textContent.trim();
          }
         
          const addressDiv = rows[0]?.querySelectorAll("td")[1]?.querySelector(".inner-value");
          if (addressDiv) {
            // Extract property address
            datum.property_address = addressDiv.textContent.trim().replace(/\n/g, ' ');
          }else{
            datum.property_address="N/A";
          }
          const assessedValue = rows[1]?.querySelectorAll("td")[2]?.querySelector(".inner-value");
          if (assessedValue) {
            // Extract total assessed/taxable value
            datum.total_assessed_value = "$" + assessedValue.textContent.trim();
            datum.total_taxable_value = "$" + assessedValue.textContent.trim();
          }else{
            datum.total_assessed_value = "N/A";
            datum.total_taxable_value = "N/A";
          }
        }
        // Try to get owner name from Names section
        document.querySelector("#Names4 div .inner-label").nextElementSibling.textContent.trim();
        const ownerDiv = document.querySelectorAll("#Names4 div .inner-label");
        if (ownerDiv) {
          const ownerText = ownerDiv[0]?.nextElementSibling;
          const Address=ownerDiv[1]?.nextElementSibling?.textContent.trim();
          if (ownerText) {
            // Add owner name
            datum.owner_name.push(ownerText.textContent.trim());
          }
          if(Address && datum.property_address===""){
            // Fallback address if not found earlier
            datum.property_address=Address ;
          }
        }
        return datum;
      });
      resolve(page_data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
// Extract payment history AND detailed billing for unpaid years
const jc_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#PaymentHistory1", timeout_option);
      // Get basic payment history for all years
      const allYearsData = await page.evaluate(() => {
        const yearsMap = {};
        const historyTable = document.querySelector("#PaymentHistory1 tbody");
        if (historyTable) {
          const rows = historyTable.querySelectorAll("tr");
         
          rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            const yearLink = cells[0]?.querySelector("a");
            const year = yearLink?.textContent.trim();
           
            if (year) {
              const totalDue = cells[1]?.textContent.trim() || "$0.00";
              const totalPaid = cells[2]?.textContent.trim() || "$0.00";
              const amountUnpaid = cells[3]?.textContent.trim() || "$0.00";
              const datePaid = cells[4]?.textContent.trim() || "";
              const isPaid = amountUnpaid === "$0.00";
             
              yearsMap[year] = {
                year: parseInt(year),
                status: isPaid ? "Paid" : "Due",
                base_amount: totalDue,
                total_paid: totalPaid,
                amount_unpaid: amountUnpaid,
                date_paid: datePaid,
                tax_billed: "",
                penalty_billed: "",
                cost_billed: "",
                total_billed: ""
              };
            }
          });
        }else{
          return false;
        }
        return yearsMap;
      });
      if(!allYearsData){
        return reject({
          error: true,
          message: "Tax History Not Available"
        });
      }
      // Fetch detailed billing for ALL unpaid years (including current year)
      const unpaidYears = Object.keys(allYearsData).filter(
        (year) => allYearsData[year].amount_unpaid !== "$0.00"
      );
      for (const year of unpaidYears) {
        try {
          const currentUrl = page.url();
          const parcelMatch = currentUrl.match(/\/parcel\/view\/([^\/]+)/);
          const parcelId = parcelMatch ? parcelMatch[1] : account.replace(/[^0-9]/g, '');
         
          // Navigate to specific year detail page
          await page.goto(`https://jeffersonmo.devnetwedge.com/parcel/view/${parcelId}/${year}`, {
            waitUntil: "domcontentloaded"
          });
          await page.waitForSelector("#Billing1", timeout_option);
          const billingDetails = await page.evaluate(() => {
            const billingTable = document.querySelector("#Billing1 table tbody");
            if (!billingTable) return null;
            const rows = billingTable.querySelectorAll("tr");
            const details = {};
            rows.forEach(row => {
              const cells = row.querySelectorAll("th, td");
              if (cells.length === 2) {
                const label = cells[0]?.textContent.trim();
                const value = cells[1]?.textContent.trim();
                if (label === "Tax Billed") details.tax_billed = value;
                if (label === "Penalty Billed") details.penalty_billed = value;
                if (label === "Cost Billed") details.cost_billed = value;
                if (label === "Total Billed") details.total_billed = value;
              }
            });
            return details;
          });
          if (billingDetails) {
            // Merge detailed billing into main year data
            allYearsData[year] = {
              ...allYearsData[year],
              ...billingDetails
            };
          
          }
        } catch (error) {
          console.log("Error fetching billing details ", error.message);
        }
      }
      resolve({ data, allYearsData });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
// Format with detailed breakdown
const jc_4 = async (main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { data, allYearsData } = main_data;
      const tax_history = [];
      let anyDelinquent = false;
      const years = Object.keys(allYearsData).map(Number).sort((a, b) => b - a);
      const currentYear = years[0];
      const priorYears = years.filter((y) => y < currentYear);
      const hasPriorUnpaid = priorYears.some((yr) => allYearsData[yr].amount_unpaid !== "$0.00");
     
      let yearsToProcess = [];
     
      if (hasPriorUnpaid) {
        // Include all unpaid + current year
        yearsToProcess = years.filter((yr) => allYearsData[yr].amount_unpaid !== "$0.00");
        if (!yearsToProcess.includes(currentYear)) {
          yearsToProcess.push(currentYear);
        }
        yearsToProcess.sort((a, b) => b - a);
      } else {
        // Only current year
        yearsToProcess = [currentYear];
      }
      yearsToProcess.forEach((year) => {
        const yearData = allYearsData[year];
       
        let baseTax = "$0.00";
        if (yearData.tax_billed && yearData.tax_billed !== "") {
          // Use direct tax_billed if available
          baseTax = yearData.tax_billed;
        } else {
          if (yearData.total_billed) {
            const total = parseFloat(yearData.total_billed.replace(/[$,]/g, ''));
            const penalty = parseFloat((yearData.penalty_billed || "$0.00").replace(/[$,]/g, ''));
            const cost = parseFloat((yearData.cost_billed || "$0.00").replace(/[$,]/g, ''));
           
            const calculatedBase = total - penalty - cost;
            baseTax = "$" + calculatedBase.toFixed(2);
          } else {
            // Fallback to base_amount from history
            baseTax = yearData.base_amount;
          }
        }
        const historyEntry = {
          jurisdiction: "County",
          year: year,
          payment_type: "Annual",
          status: yearData.status,
          base_amount: baseTax,
          penalty: yearData.penalty_billed || "$0.00",
          costs: yearData.cost_billed || "$0.00",
          amount_paid: yearData.total_paid,
          amount_due: yearData.amount_unpaid,
          mailing_date: "N/A",
          due_date: `12/31/${year}`,
          delq_date: `01/01/${parseInt(year) + 1}`,
          paid_date: yearData.date_paid || "-",
          good_through_date: "",
        };
        if (historyEntry.status === "Due") {
          if (is_delq(historyEntry.delq_date)) {
            // Mark as delinquent if past due date
            historyEntry.status = "Delinquent";
            anyDelinquent = true;
          } else {
            historyEntry.status = "Due";
          }
        }
        tax_history.push(historyEntry);
      });
      const priorNote = hasPriorUnpaid ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" : "ALL PRIOR YEAR(S) TAXES ARE PAID";
      const currentYearData = allYearsData[currentYear];
      const currentStatus = currentYearData ? currentYearData.status.toUpperCase() : "UNKNOWN";
      const dueDates = "NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/31";
      data.notes = `${priorNote}, ${currentYear} ANNUAL TAXES ARE ${currentStatus}. ${dueDates}`;
      data.delinquent = anyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
     
      data.tax_history = tax_history.sort((a, b) => a.year - b.year);
      resolve(data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
// Main search orchestrator
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      jc_1(page, account)
        .then(() => {
          jc_2(page, account)
            .then((data2) => {
              jc_3(page, data2, account)
                .then((data3) => {
                  jc_4(data3, account)
                    .then((data4) => {
                      // Final resolved data
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
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};
const search = async (req, res) => {
  // Main Express route handler
  const { fetch_type, account } = req.body;
 
  try {
    if (!account || account.trim() === '') {
      // Missing account number
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      // Invalid fetch type
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }
    // Launch browser
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      // Block unnecessary resources
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });
    if (fetch_type === "html") {
      // HTML render response
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
    } else if (fetch_type === "api") {
      // JSON API response
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
    if (fetch_type === "html") {
      res.status(200).render('error_data', {
        error: true,
        message: error.message
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
};
module.exports = { search };