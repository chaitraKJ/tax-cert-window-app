// Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Puppeteer timeout configuration
const TIMEOUT_OPTIONS = { timeout: 90000 };

// Date formatting utility - ensures MM/DD/YYYY format
const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "N/A" || dateStr.trim() === "") return "N/A";
  
  // Remove any extra whitespace, newlines, and text after the date
  dateStr = dateStr.trim().split('\n')[0].trim();
  
  // Remove any text that appears after common separators (like "TCP:", "Counter", etc.)
  // Keep only the date portion
  const dateMatch = dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (dateMatch) {
    dateStr = dateMatch[0];
  }
  
  // Handle MM/DD/YYYY format
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const month = parts[0].padStart(2, "0");
      const day = parts[1].padStart(2, "0");
      let year = parts[2];
      if (year.length === 2) {
        year = parseInt(year) > 50 ? "19" + year : "20" + year;
      }
      return `${month}/${day}/${year}`;
    }
  }
  
  // Handle YYYY-MM-DD format
  if (dateStr.includes("-") && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, "0");
      const day = parts[2].padStart(2, "0");
      return `${month}/${day}/${year}`;
    }
  }
  
  return dateStr;
};

// Parse currency string to float
const parseCurrency = (str) => {
  if (!str) return 0;
  return parseFloat(str.replace(/[$,]/g, "")) || 0;
};

const formatCurrency = (str) => {
  if (!str) return "$0.00";
  const num = Math.abs(parseFloat(str.toString().replace(/[^0-9.-]+/g, "")));
  return Number.isFinite(num) ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

// Main scraping function
const gc_1 = (page, url, parcelId, clientType) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Navigate to search page
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: TIMEOUT_OPTIONS.timeout,
      });

      // Check for and handle Agree/Disagree popup if it appears
      try {
        const agreeButton = await page.$("#btAgree");
        if (agreeButton) {
          await Promise.all([
            page.waitForNavigation({
              waitUntil: "domcontentloaded",
              timeout: 10000,
            }).catch(() => {}), // Ignore timeout if no navigation occurs
            page.click("#btAgree")
          ]);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        // No popup found, continue normally
      }

      // Wait for and fill the parcel ID input
      await page.waitForSelector("input#inpParid", TIMEOUT_OPTIONS);
      await page.type("input#inpParid", parcelId);

      // Click search button and wait for results
      try {
        await Promise.all([
          page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 30000,
          }),
          page.click("button#btSearch")
        ]);
      } catch (error) {
        console.error("Navigation method 1 failed, trying method 2:", error.message);
        await page.click("button#btSearch");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Wait for search results table
      await page.waitForSelector("table#searchResults", { timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if results exist
      const rowInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll("table#searchResults tbody tr.SearchResults");
        if (rows.length > 0) {
          const firstRow = rows[0];
          return {
            exists: true,
            count: rows.length,
            hasOnClick: firstRow.hasAttribute('onclick'),
            onclick: firstRow.getAttribute('onclick')
          };
        }
        return { exists: false, count: 0 };
      });

      if (!rowInfo.exists) {
        return reject("No search results found for parcel: " + parcelId);
      }

      // Extract owner name and address from search results table
      const searchResultData = await page.evaluate(() => {
        const row = document.querySelector("table#searchResults tbody tr.SearchResults");
        if (!row) return {};
        
        const cells = row.querySelectorAll("td");
        return {
          parcelNumber: cells[0] ? cells[0].textContent.trim() : "",
          ownerName: cells[1] ? cells[1].textContent.trim() : "",
          propertyAddress: cells[2] ? cells[2].textContent.trim() : "",
          taxYear: cells[3] ? cells[3].textContent.trim() : ""
        };
      });

      // Click on the search result row to navigate to details
      let navigationSuccess = false;

      if (rowInfo.hasOnClick && rowInfo.onclick) {
        try {
          await Promise.all([
            page.waitForNavigation({
              waitUntil: "domcontentloaded",
              timeout: 30000,
            }),
            page.evaluate((onclickCode) => {
              const row = document.querySelector("table#searchResults tbody tr.SearchResults");
              if (row && row.onclick) {
                row.onclick();
              } else if (onclickCode) {
                eval(onclickCode);
              }
            }, rowInfo.onclick)
          ]);
          navigationSuccess = true;
        } catch (error) {
          console.error("Onclick navigation failed:", error.message);
        }
      }

      if (!navigationSuccess) {
        try {
          await Promise.all([
            page.waitForNavigation({
              waitUntil: "domcontentloaded",
              timeout: 30000,
            }),
            page.evaluate(() => {
              const row = document.querySelector("table#searchResults tbody tr.SearchResults");
              if (row) {
                row.click();
              }
            })
          ]);
          navigationSuccess = true;
        } catch (error) {
          console.error("Standard click navigation failed:", error.message);
        }
      }

      if (!navigationSuccess) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Wait for details page to load
      await page.waitForSelector(".DataletHeaderTop, .DataletHeader", { timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Extract tax data from the "Tax (Penalties and Interest Included through Current Date)" table
      const taxTableData = await page.evaluate(() => {
        const taxData = [];
        
        // Find the tax table by ID
        const taxTable = document.querySelector('table[id*="Tax"][id*="Penalties"]');
        
        if (!taxTable) {
          return taxData;
        }

        const rows = taxTable.querySelectorAll("tbody tr");
        
        rows.forEach((row, index) => {
          // Skip header row and total row
          const cells = row.querySelectorAll("td");
          if (cells.length >= 5) {
            const yearText = cells[0].textContent.trim();
            
            // Skip header and total rows
            if (yearText && yearText !== "Year" && yearText !== "Total:") {
              const year = yearText;
              const cycle = cells[1].textContent.trim();
              const billed = cells[2].textContent.trim();
              const paid = cells[3].textContent.trim();
              const due = cells[4].textContent.trim();
              
              taxData.push({
                year: year,
                cycle: cycle,
                billed: billed,
                paid: paid,
                due: due
              });
            }
          }
        });
        
        return taxData;
      });

      // Click on Payment History link
      const paymentHistoryClicked = await page.evaluate(() => {
        const links = document.querySelectorAll("li a, a");
        for (const link of links) {
          const text = link.textContent.toLowerCase();
          if (text.includes("payment history") || text.includes("payment information")) {
            link.click();
            return true;
          }
        }
        return false;
      });

      let paymentHistory = [];
      if (paymentHistoryClicked) {
        try {
          await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: TIMEOUT_OPTIONS.timeout,
          });
          
          await page.waitForSelector('table[id*="Payment"]', { timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          paymentHistory = await page.evaluate(() => {
            const payments = [];
            const paymentTable = document.querySelector('table[id*="Payment"]');
            
            if (!paymentTable) return payments;
            
            const rows = paymentTable.querySelectorAll("tbody tr");
            
            rows.forEach((row, index) => {
              const cells = row.querySelectorAll("td");
              
              // Skip header row
              if (cells.length >= 6 && !cells[0].classList.contains("DataletTopHeading")) {
                const effectiveDateCell = cells[1].textContent.trim();
                // Extract only the date part (first line before any newline or other text)
                const effectiveDateLines = effectiveDateCell.split('\n');
                const effectiveDate = effectiveDateLines[0].trim();
                const totalPayment = cells[5].textContent.trim();
                
                payments.push({
                  effectiveDate: effectiveDate,
                  amount: totalPayment
                });
              }
            });
            
            return payments;
          });
          
        } catch (err) {
          console.error("Payment History error:", err.message);
        }
      }

      // Navigate to Value History to get assessed values
      const valueHistoryClicked = await page.evaluate(() => {
        const links = document.querySelectorAll("li a, a");
        for (const link of links) {
          const text = link.textContent.toLowerCase();
          if (text.includes("value history")) {
            link.click();
            return true;
          }
        }
        return false;
      });

      let assessedValues = {
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A"
      };

      if (valueHistoryClicked) {
        try {
          await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: TIMEOUT_OPTIONS.timeout,
          });
          
          await page.waitForSelector('table', { timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          assessedValues = await page.evaluate(() => {
            const data = {
              land_value: "N/A",
              improvements: "N/A",
              total_assessed_value: "N/A"
            };
            
            // Look for value history table
            const tables = document.querySelectorAll('table');
            
            for (const table of tables) {
              const rows = table.querySelectorAll('tr');
              
              for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                
                // Look for the most recent year (first data row after header)
                if (cells.length >= 4) {
                  const firstCell = cells[0].textContent.trim();
                  
                  // Check if this is a year row (4 digits)
                  if (firstCell.match(/^\d{4}$/)) {
                    // Assuming columns are: Year, Land, Buildings/Improvements, Total
                    data.land_value = cells[1] ? cells[1].textContent.trim() : "N/A";
                    data.improvements = cells[2] ? cells[2].textContent.trim() : "N/A";
                    data.total_assessed_value = cells[3] ? cells[3].textContent.trim() : "N/A";
                    break;
                  }
                }
              }
              
              if (data.total_assessed_value !== "N/A") break;
            }
            
            return data;
          });
          
        } catch (err) {
          console.error("Value History error:", err.message);
        }
      }

      // Process tax history based on client type and requirements
      const taxHistory = [];
      let hasUnpaidTaxes = false;
      let latestYear = null;
      let unpaidYears = [];

      // Check for unpaid taxes and find latest year
      taxTableData.forEach(taxRecord => {
        const dueAmount = parseCurrency(taxRecord.due);
        const yearNum = parseInt(taxRecord.year);
        
        if (dueAmount > 0.01) {
          hasUnpaidTaxes = true;
          unpaidYears.push(yearNum);
        }
        
        if (!latestYear || yearNum > latestYear) {
          latestYear = yearNum;
        }
      });

      // Determine client type and how many years to show
      const yearsWantedCount = getOHCompanyYears(clientType);
      const clientStr = String(clientType || '').toLowerCase().trim();
      const isAccurateClient = yearsWantedCount >= 2 || clientStr.includes('accurate');
      
      let yearsToShow = [];
      
      // Check if current year is unpaid and last year is paid
      const isCurrentYearUnpaid = unpaidYears.includes(latestYear);
      const sortedYears = taxTableData.map(t => parseInt(t.year)).sort((a, b) => b - a);
      const lastYear = sortedYears.length > 1 ? sortedYears[1] : null;
      const lastYearPaid = lastYear && !unpaidYears.includes(lastYear);
      
      if (unpaidYears.length > 1) {
        // Multiple unpaid years - show ALL unpaid years for BOTH clients
        yearsToShow = unpaidYears.sort((a, b) => b - a);
      } else if (isCurrentYearUnpaid && lastYearPaid) {
        // Current year unpaid, last year paid
        if (isAccurateClient) {
          // Accurate: Show current + previous (2 years)
          yearsToShow = [latestYear, lastYear];
        } else {
          // Normal: Show only current (1 year)
          yearsToShow = [latestYear];
        }
      } else if (!hasUnpaidTaxes) {
        // All paid
        if (isAccurateClient) {
          // Accurate: Show 2 most recent years
          yearsToShow = sortedYears.slice(0, 2);
        } else {
          // Normal: Show only latest year
          yearsToShow = [latestYear];
        }
      } else {
        // Single unpaid year (current or other)
        yearsToShow = unpaidYears;
      }
      
      // Build tax history based on logic:
      // - Multiple unpaid: Show ALL unpaid years (both clients)
      // - Current unpaid + last paid: Accurate shows 2, Normal shows 1
      // - All paid: Accurate shows 2, Normal shows 1
      
      // Glynn County, GA Tax Deadlines:
      // Due Date: 60 days after billing (bills typically mailed mid-September)
      // This results in due dates around mid-November
      // Delinquent Date: Day after due date
      
      // Track consumed payments to avoid duplicate matching
      let consumedPaymentIndices = new Set();
      
      taxTableData.forEach(taxRecord => {
        const year = parseInt(taxRecord.year);
        
        // Only include years that should be shown based on client type
        if (!yearsToShow.includes(year)) {
          return;
        }
        
        const billed = parseCurrency(taxRecord.billed);
        const paid = Math.abs(parseCurrency(taxRecord.paid)); // Paid is negative in table
        const due = parseCurrency(taxRecord.due);
        
        // Find matching payment date (avoid already consumed payments)
        let paidDate = "";
        if (paid > 0) {
          // Try to match payment from payment history
          for (let i = 0; i < paymentHistory.length; i++) {
            if (consumedPaymentIndices.has(i)) {
              continue; // Skip already used payments
            }
            
            const payment = paymentHistory[i];
            const paymentAmount = parseCurrency(payment.amount);
            
            // Check if amounts match (within $1 tolerance)
            if (Math.abs(paymentAmount - paid) < 1.00) {
              paidDate = formatDate(payment.effectiveDate);
              consumedPaymentIndices.add(i); // Mark this payment as consumed
              break;
            }
          }
          
          // If no exact match found, set to N/A
          if (!paidDate) {
            paidDate = "N/A";
          }
        }
        
        // Calculate due date and delinquent date
        // Bills typically mailed mid-September, due 60 days later (mid-November)
        // For 2025: Due November 17, 2025; Delinquent November 18, 2025
        // Using November 17 as standard due date (adjusts by year)
        const dueDate = `11/17/${year}`;
        const delqDate = `11/18/${year}`;
        
        // Determine status based on Glynn County deadlines
        let status = "Paid";
        if (due > 0.01) {
          const delinquentDate = new Date(delqDate);
          const today = new Date();
          status = today >= delinquentDate ? "Delinquent" : "Due";
        }
        
        taxHistory.push({
          jurisdiction: "County",
          year: year,
          payment_type: "Annual",
          status: status,
          base_amount: formatCurrency(billed),
          amount_paid: formatCurrency(paid),
          amount_due: formatCurrency(due),
          mailing_date: "N/A",
          due_date: dueDate,
          delq_date: delqDate,
          paid_date: paidDate,
          good_through_date: ""
        });
      });

      // Sort tax history by year descending
      taxHistory.sort((a, b) => {
        if (typeof a.year === 'string') return 1;
        if (typeof b.year === 'string') return -1;
        return b.year - a.year;
      });

      // Determine delinquent status
      const hasDelinquent = taxHistory.some(h => h.status === "Delinquent");
      const delinquentStatus = hasDelinquent
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      // Build notes with detailed status breakdown
      let notes = "";
      
      // Determine if there are prior years and their status
      const allYears = taxTableData.map(t => parseInt(t.year)).sort((a, b) => b - a);
      const currentYear = latestYear;
      const priorYears = allYears.filter(y => y < currentYear);
      
      // Check prior years status
      let allPriorsArePaid = true;
      if (priorYears.length > 0) {
        priorYears.forEach(priorYear => {
          const priorRecord = taxTableData.find(t => parseInt(t.year) === priorYear);
          if (priorRecord && parseCurrency(priorRecord.due) > 0.01) {
            allPriorsArePaid = false;
          }
        });
      }
      
      // Get current year status
      const currentYearRecord = taxTableData.find(t => parseInt(t.year) === currentYear);
      let currentYearStatus = "PAID";
      let currentYearUnpaid = 0;
      
      if (currentYearRecord) {
        currentYearUnpaid = parseCurrency(currentYearRecord.due);
        if (currentYearUnpaid > 0.01) {
          const currentYearItem = taxHistory.find(h => h.year === currentYear);
          if (currentYearItem && currentYearItem.status === "Delinquent") {
            currentYearStatus = "DELINQUENT";
          } else {
            currentYearStatus = "DUE";
          }
        }
      }
      
      // Build notes based on prior and current year status
      const priorStatusText = allPriorsArePaid ? "ALL PRIORS ARE PAID" : "PRIOR YEARS ARE UNPAID";
      
      if (currentYearStatus === "PAID") {
        notes = `${priorStatusText}, ${currentYear} TAXES ARE PAID, TAXES ARE PAID ANNUALLY, DUE DATE IS 11/17, CITY TAX NEED TO CONFIRM`;
      } else if (currentYearStatus === "DELINQUENT") {
        notes = `${priorStatusText}, ${currentYear} TAXES ARE DELINQUENT, TAXES ARE PAID ANNUALLY, DUE DATE IS 11/17, CITY TAX NEED TO CONFIRM`;
      } else {
        notes = `${priorStatusText}, ${currentYear} TAXES ARE DUE, TAXES ARE PAID ANNUALLY, DUE DATE IS 11/17, CITY TAX NEED TO CONFIRM`;
      }
      
      notes = notes.toUpperCase().trim();

      // Build final response
      const data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: searchResultData.ownerName ? [searchResultData.ownerName] : [],
        property_address: searchResultData.propertyAddress || "",
        parcel_number: searchResultData.parcelNumber || parcelId,
        land_value: formatCurrency(assessedValues.land_value),
        improvements: formatCurrency(assessedValues.improvements),
        total_assessed_value: formatCurrency(assessedValues.total_assessed_value),
        exemption: "",
        total_taxable_value: "N/A",
        taxing_authority: "Glynn County Tax Commissioner, 1725 Reynolds Street, Brunswick, GA 31520",
        notes: notes,
        delinquent: delinquentStatus,
        tax_history: taxHistory,
      };

      resolve(data);
      
    } catch (error) {
      console.error("Error in gc_1:", error);
      reject("Record Not Found: " + error.message);
    }
  });
};

// Wrapper function for account search
const accountSearch = (page, url, account, clientType) => {
  return new Promise(async (resolve, reject) => {
    try {
      gc_1(page, url, account, clientType)
        .then((data) => resolve(data))
        .catch((error) => {
          console.error(error);
          reject(error);
        });
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
};

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account, clientName, selectedClientType, client } = req.body;
  const clientType = selectedClientType || clientName || client || 'others';

  if (!account || account.trim() === "") {
    return res.status(400).json({
      error: true,
      message: "Please enter a valid parcel number",
    });
  }

  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    const errorResponse = {
      error: true,
      message: "Invalid Access. fetch_type must be 'html' or 'api'",
    };
    return fetch_type === "html"
      ? res.status(400).render("error_data", errorResponse)
      : res.status(400).json(errorResponse);
  }

  try {
    const url = `https://property.glynncounty-ga.gov/search/commonsearch.aspx?mode=realprop`;
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      if (["stylesheet", "font", "image"].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Start scraping process
    accountSearch(page, url, account, clientType)
      .then(async (data) => {
        await context.close();
        if (fetch_type === "html") {
          res.render("parcel_data_official", data);
        } else {
          res.status(200).json({ result: data });
        }
      })
      .catch(async (error) => {
        await context.close();
        const errorResponse = {
          error: true,
          message: error.message || error,
        };
        if (fetch_type === "html") {
          res.render("error_data", errorResponse);
        } else {
          res.status(400).json(errorResponse);
        }
      });
  } catch (error) {
    console.error(error);
    if (fetch_type === "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message || "An error occurred during the search",
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message || "An error occurred during the search",
      });
    }
  }
};

module.exports = { search };