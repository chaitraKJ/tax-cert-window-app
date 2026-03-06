// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

// Check if a date is delinquent (past due)
const is_delq = (date) => {
  // Compare today's date with delinquency date
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};

//Navigate to search page and search for parcel
const stl_city_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Clean account number by removing dots, commas, dashes for URL
      const account_valid = account.replace(/[.,-]/g, '');
      const url = `https://property.stlouis-mo.gov/parcel/view/${account_valid}`;
      
      // Navigate to the main page
      await page.goto(url, { waitUntil: "domcontentloaded" });
      
      // CHECK IF PARCEL IS INVALID
      const isInvalidParcel = await page.evaluate(() => {
        const isValid = document.querySelector("main")?.textContent ?? document.querySelector("body").textContent;
        if (isValid?.includes("Not Found") || isValid?.includes("Server Error")) {
            return true;
        }
        return false;
      });
      if (isInvalidParcel) {
        // Reject with clear message if parcel doesn't exist
        return reject({
            error: true,
            message: "Account is invalid: No records found in the database.Try again"
        });
      }

      // Wait for property page to load
      await page.waitForSelector("#OverviewStLouisCity", timeout_option);

      // Check if we got results or error page
      const currentUrl = page.url();
      if (currentUrl.includes("/Search/") && !currentUrl.includes("/parcel/view/")) {
        // Should not happen with direct URL, but safety check
        reject(new Error("No Record Found"));
      } else {
        // Verify we're on the property details page
        const hasPropertyData = await page.evaluate(() => {
          return document.querySelector("#OverviewStLouisCity") !== null;
        });

        if (!hasPropertyData) {
          // Page loaded but overview section missing
          reject(new Error("Property details page not loaded"));
        } else {
          // Successfully loaded — proceed
          resolve(true);
        }
      }
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Extract property overview data
const stl_city_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#OverviewStLouisCity", timeout_option);

      const page_data = await page.evaluate((account) => {
        // ---------- BASE OBJECT ----------
        const datum = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "N/A",
          improvements: "N/A",
          total_assessed_value: "",
          exemption: "N/A",
          total_taxable_value: "",
          taxing_authority: "City of St. Louis Collector of Revenue, 1200 Market Street, Room 410, St. Louis, MO 63103, Ph: 314-622-4105.",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

        // Extract overview table data
        const overviewTable = document.querySelector("#OverviewStLouisCity tbody");
        if (overviewTable) {
          const rows = overviewTable.querySelectorAll("tr");
          
          // Row 0: Collector Number, Mailing Name & Address, Owner Name & Address
          const ownerAddressDiv = rows[0]?.querySelectorAll("td")[2]?.querySelector(".inner-value");
          if (ownerAddressDiv) {
            const ownerLines = ownerAddressDiv.textContent.trim().split('\n');
            const ownerName = ownerLines[0]?.trim();
            // Set property address from second line
            datum.property_address = ownerLines[1]?.trim() ?? "N/A";
            if (ownerName && ownerName!=" ") {
              // Add primary owner name
              datum.owner_name.push(ownerName);
            }else{
              datum.owner_name.push("N/A");
            }
          }

          // Row 2: Parcel Number, Assessed Value, Acreage
          const parcelNumber = rows[2]?.querySelectorAll("td")[0]?.querySelector(".inner-value");
          if(parcelNumber){
            datum.parcel_number=parcelNumber?.textContent.trim()??"N/A";
          }
          const assessedValue = rows[2]?.querySelectorAll("td")[1]?.querySelector(".inner-value");
          if (assessedValue) {
            // Extract total assessed value
            datum.total_assessed_value = "$" + assessedValue.textContent.trim();
          }else{
            datum.total_assessed_value = "N/A";
          }

          // Row 6: Total Tax Due 2023, Tax Rate, Net Taxable Value
          const netTaxableValue = rows[5]?.querySelectorAll("td")[2]?.querySelector(".inner-value");
          if (netTaxableValue) {
            // Extract net taxable value (after exemptions)
            datum.total_taxable_value = "$" + netTaxableValue.textContent.trim();
          }else{
            datum.total_taxable_value = "N/A";
          }
        }

        return datum;
      }, account);

      resolve(page_data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Extract payment history and detailed billing for unpaid years (including current year)
const stl_city_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#PaymentHistoryNF", timeout_option);

      // First, get basic payment history
      const allYearsData = await page.evaluate(() => {
        const yearsMap = {};

        const historyTable = document.querySelector("#PaymentHistoryNF tbody");
        if (historyTable) {
          const rows = historyTable.querySelectorAll("tr:not([data-subrow])");
          
          rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 4) return;
            
            const yearLink = cells[1]?.querySelector("a");
            const year = yearLink?.textContent.trim();
            
            if (year) {
              const totalDue = cells[2]?.textContent.trim() || "$0.00";
              const totalPaid = cells[3]?.textContent.trim() || "$0.00";
              const amountUnpaid = cells[4]?.textContent.trim() || "$0.00";

              const isPaid = amountUnpaid === "$0.00";
              
              // Try to get payment date from subrow if it exists
              let datePaid = "";
              const nextRow = row.nextElementSibling;
              if (nextRow && nextRow.hasAttribute('data-subrow')) {
                const paymentTable = nextRow.querySelector('table tbody');
                if (paymentTable) {
                  const paymentRow = paymentTable.querySelector('tr');
                  if (paymentRow) {
                    const dateCell = paymentRow.querySelectorAll('td')[2];
                    if (dateCell) {
                      // Extract actual payment date from subrow
                      datePaid = dateCell.textContent.trim();
                    }
                  }
                }
              }
              
              yearsMap[year] = {
                year: parseInt(year),
                status: isPaid ? "Paid" : "Due",
                base_amount: totalDue,
                total_paid: totalPaid,
                amount_unpaid: amountUnpaid,
                date_paid: datePaid,
                tax_billed: "",
                penalty_billed: "",
                interest_billed: "",
                cost_billed: "",
                fees_billed: ""
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

      // Now fetch detailed billing for ALL UNPAID years (including current year)
      const unpaidYears = Object.keys(allYearsData).filter(
        (year) => allYearsData[year].amount_unpaid !== "$0.00"
      );

      for (const year of unpaidYears) {
        try {
          // Clean account for URL usage
          const url_account = account.replace(/[.,-]/g, '');
          // Navigate to the specific year page
          await page.goto(`https://property.stlouis-mo.gov/parcel/view/${url_account}/${year}`, {
            waitUntil: "domcontentloaded"
          });

          await page.waitForSelector("#Billing1", timeout_option);

          // Extract detailed billing information
          const billingDetails = await page.evaluate(() => {
            const billingPanel = document.querySelector("#Billing1");
            if (!billingPanel) return null;

            // Trigger Alpine.js to show current year billing
            const currentYearBtn = billingPanel.querySelector('button[x-on\\:click*="showCurrentYear = true"]');
            if (currentYearBtn) {
              currentYearBtn.click();
            }

            // Get the visible billing table
            const billingTable = billingPanel.querySelector('div[x-show="showCurrentYear"]:not([style*="display: none"]) table tbody');
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
                if (label === "Interest Billed") details.interest_billed = value;
                if (label === "Cost Billed") details.cost_billed = value;
                if (label.includes("Fees Billed")) details.fees_billed = value;
                if (label === "Total Billed") details.total_billed = value;
              }
            });

            return details;
          });

          if (billingDetails) {
            // Merge detailed breakdown into year data
            allYearsData[year] = {
              ...allYearsData[year],
              ...billingDetails
            };
          }
        } catch (error) {
          console.log("Error fetching billing details", error.message);
        }
      }

      resolve({ data, allYearsData });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Format extracted data - now includes detailed breakdown for all unpaid years
const stl_city_4 = async (main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { data, allYearsData } = main_data;
      const tax_history = [];
      let anyDelinquent = false;

      // Sort years in descending order
      const years = Object.keys(allYearsData).map(Number).sort((a, b) => b - a);
      const currentYear = years[0];

      // Determine which years to include in tax history
      const priorYears = years.filter((y) => y < currentYear);
      const hasPriorUnpaid = priorYears.some((yr) => allYearsData[yr].amount_unpaid !== "$0.00");
      
      let yearsToProcess = [];
      
      if (hasPriorUnpaid) {
        // Show all delinquent prior years + current
        yearsToProcess = years.filter((yr) => allYearsData[yr].amount_unpaid !== "$0.00");
        // Always include current year
        if (!yearsToProcess.includes(currentYear)) {
          yearsToProcess.push(currentYear);
        }
        yearsToProcess.sort((a, b) => b - a);
      } else {
        // Only show current year if no prior delinquencies
        yearsToProcess = [currentYear];
      }

      // Process selected years and build tax history
      yearsToProcess.forEach((year) => {
        const yearData = allYearsData[year];
        
        // Prefer exact tax_billed, otherwise calculate base from total
        let baseTax = "$0.00";
        if (yearData.tax_billed && yearData.tax_billed !== "") {
          baseTax = yearData.tax_billed;
        } else {
          if (yearData.total_billed) {
            const total = parseFloat(yearData.total_billed.replace(/[$,]/g, ''));
            const penalty = parseFloat((yearData.penalty_billed || "$0.00").replace(/[$,]/g, ''));
            const interest = parseFloat((yearData.interest_billed || "$0.00").replace(/[$,]/g, ''));
            const cost = parseFloat((yearData.cost_billed || "$0.00").replace(/[$,]/g, ''));
            const fees = parseFloat((yearData.fees_billed || "$0.00").replace(/[$,]/g, ''));
            
            const calculatedBase = total - penalty - interest - cost - fees;
            baseTax = "$" + calculatedBase.toFixed(2);
          } else {
            // Final fallback to original base amount
            baseTax = yearData.base_amount;
          }
        }

        const historyEntry = {
          jurisdiction: "City",
          year: year,
          payment_type: "Annual",
          status: yearData.status,
          base_amount: baseTax,
          penalty: yearData.penalty_billed || "$0.00",
          interest: yearData.interest_billed || "$0.00",
          costs: yearData.cost_billed || "$0.00",
          fees: yearData.fees_billed || "$0.00",
          amount_paid: yearData.total_paid,
          amount_due: yearData.amount_unpaid,
          mailing_date: "N/A",
          due_date: `12/31/${year}`,
          delq_date: `01/01/${parseInt(year) + 1}`,
          paid_date: yearData.date_paid || "-",
          good_through_date: "",
        };

        // Mark as delinquent if past January 1st of following year
        if (historyEntry.status === "Due") {
          if (is_delq(historyEntry.delq_date)) {
            historyEntry.status = "Delinquent";
            anyDelinquent = true;
          } else {
            historyEntry.status = "Due";
          }
        }

        tax_history.push(historyEntry);
      });

      // Build comprehensive notes (ALL CAPS for consistency)
      const priorNote = hasPriorUnpaid ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" : "ALL PRIOR YEAR(S) TAXES ARE PAID";
      const currentYearData = allYearsData[currentYear];
      const currentStatus = currentYearData ? currentYearData.status.toUpperCase() : "-";
      const dueDates = "NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/31";

      // Combine all notes
      data.notes = `${priorNote}, ${currentYear} TAXES ARE ${currentStatus}. ${dueDates}`;
      data.delinquent = anyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
      
      // Sort tax_history ascending by year
      data.tax_history = tax_history.sort((a, b) => a.year - b.year);

      resolve(data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Orchestrate the entire search process
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      stl_city_1(page, account)
        .then(() => {
          stl_city_2(page, account)
            .then((data2) => {
              stl_city_3(page, data2, account)
                .then((data3) => {
                  stl_city_4(data3, account)
                    .then((data4) => {
                      // Final resolved result
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
      // Missing parcel number
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
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
          res.status(200).render('error_data', {
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type === "api") {
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