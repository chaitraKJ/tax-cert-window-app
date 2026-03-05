// Author: Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };

// Check if a date is delinquent (past due)
const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Navigate and search
const stl_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://taxpayments.stlouiscountymo.gov/parcel/view/${account}`;

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await delay(4000);
      
      // CHECK IF PARCEL IS INVALID
      const isInvalidParcel = await page.evaluate(() => {
        const isValid = document.querySelector("main")?.textContent ?? document.querySelector("body").textContent;
        if (isValid?.includes("Not Found") || isValid?.includes("Server Error")) {
            return true;
        }
        return false;
      });
      
      if (isInvalidParcel) {
        return reject({
            error: true,
            message: "Account is invalid: No records found in the database.Try again"
        });
      }
      
      await page.waitForSelector("#OverviewSTLCounty", timeout_option);

      const currentUrl = page.url();
      if (currentUrl.includes("/Search/") && !currentUrl.includes("/Parcel/View")) {
        reject(new Error("No Record Found"));
      } else {
        const hasPropertyData = await page.evaluate(() => {
          return document.querySelector("#OverviewSTLCounty") !== null;
        });

        if (!hasPropertyData) {
          reject(new Error("Property details page not loaded"));
        } else {
          resolve(true);
        }
      }
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Extract overview
const stl_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#OverviewSTLCounty", timeout_option);

      const page_data = await page.evaluate((account) => {
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
          taxing_authority: "St. Louis County Collector of Revenue, 41 South Central Avenue, Clayton, MO 63105, Ph: 314-615-5500",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

        const overviewTable = document.querySelector("#OverviewSTLCounty tbody");
        if (overviewTable) {
          const rows = overviewTable.querySelectorAll("tr");

          const parcelDiv = rows[0]?.querySelectorAll("td")[0]?.querySelector(".inner-value")?.textContent.trim();
          datum.parcel_number = parcelDiv;
          
          // Extract owner name and address
          const ownerAddressDiv = rows[0]?.querySelectorAll("td")[2]?.querySelector(".inner-value");
          if (ownerAddressDiv) {
            const ownerLines = ownerAddressDiv.textContent.trim().split('\n');
            const ownerName = ownerLines[0]?.trim();
            const property = ownerLines[1]?.trim();
            
            if (ownerName && ownerName !== " ") {
              datum.owner_name.push(ownerName);
            } else {
              datum.owner_name.push("N/A");
            }
            
            if (property && property !== "N/A") {
              datum.property_address = property;
            } else {
              datum.property_address = "N/A";
            }
          }

          // Extract assessed value
          const assessedValue = rows[2]?.querySelectorAll("td")[1]?.querySelector(".inner-value");
          if (assessedValue) {
            const value = assessedValue.textContent.trim();
            datum.total_assessed_value = "$" + value;
            datum.total_taxable_value = "$" + value;
          } else {
            datum.total_assessed_value = "N/A";
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

// Extract payment history from current table only
const stl_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#PaymentHistoryNF", timeout_option);

      const allYearsData = await page.evaluate(() => {
        const yearsMap = {};

        const historyTable = document.querySelector("#PaymentHistoryNF tbody");
        if (!historyTable) {
          return false;
        }

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
            
            let datePaid = "";
            const nextRow = row.nextElementSibling;
            if (nextRow && nextRow.hasAttribute('data-subrow')) {
              const paymentTable = nextRow.querySelector('table tbody');
              if (paymentTable) {
                const paymentRow = paymentTable.querySelector('tr');
                if (paymentRow) {
                  const dateCell = paymentRow.querySelectorAll('td')[2];
                  if (dateCell) {
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
              date_paid: datePaid
            };
          }
        });

        return yearsMap;
      });
      
      if (!allYearsData) {
        return reject({
            error: true,
            message: "Tax History Not Available"
        });
      }

      resolve({ data, allYearsData });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Format final data
const stl_4 = async (main_data, account) => {
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
        // Include all delinquent prior years + current
        yearsToProcess = years.filter((yr) => allYearsData[yr].amount_unpaid !== "$0.00");
        if (!yearsToProcess.includes(currentYear)) {
          yearsToProcess.push(currentYear);
        }
        yearsToProcess.sort((a, b) => b - a);
      } else {
        // Only show current year if no prior delinquencies
        yearsToProcess = [currentYear];
      }

      yearsToProcess.forEach((year) => {
        const yearData = allYearsData[year];
        
        const historyEntry = {
          jurisdiction: "County",
          year: year,
          payment_type: "Annual",
          status: yearData.status,
          base_amount: yearData.base_amount,
          penalty: "$0.00",
          interest: "$0.00",
          costs: "$0.00",
          fees: "$0.00",
          amount_paid: yearData.total_paid,
          amount_due: yearData.amount_unpaid,
          mailing_date: "N/A",
          due_date: `12/31/${year}`,
          delq_date: `01/01/${parseInt(year) + 1}`,
          paid_date: yearData.date_paid || "-",
          good_through_date: "-",
        };

        // Update status to Delinquent if past due date
        if (historyEntry.status === "Due") {
          if (is_delq(historyEntry.delq_date)) {
            historyEntry.status = "Delinquent";
            anyDelinquent = true;
          }
        }

        tax_history.push(historyEntry);
      });

      const priorNote = hasPriorUnpaid ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" : "ALL PRIOR YEAR(S) TAXES ARE PAID";
      const currentYearData = allYearsData[currentYear];
      const currentStatus = currentYearData ? currentYearData.status.toUpperCase() : "-";
      const dueDates = "NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/31";

      data.notes = `${priorNote}, ${currentYear} TAXES ARE ${currentStatus}. ${dueDates}`;
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
      stl_1(page, account)
        .then(() => {
          stl_2(page, account)
            .then((data2) => {
              stl_3(page, data2, account)
                .then((data3) => {
                  stl_4(data3, account)
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
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    if (!account || account.trim() === '') {
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

export { search };
