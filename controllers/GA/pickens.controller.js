//author: Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// Puppeteer timeout configuration
const timeout_option = { timeout: 90000 };

// Helper function to wait/delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatValue = (val) => {
  if (!val || val === "N/A") return "N/A";
  const num = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? "N/A" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ac_1 = async (page, url, account, clientType) => {
  try {
    // Navigate to the search page
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for the search form to load
    await page.waitForSelector("#searchform", { timeout: 60000 });

      // Select the "Parcel" radio button
      await page.click('input[name="PropertySearchType"][value="parcel"]');

      // Wait a moment for UI to update
      await delay(500);

      // Enter the parcel number in the search field
      await page.waitForSelector("#pt-search-editor-1");
      await page.type("#pt-search-editor-1", account);

      // Click the search button
      await page.click("#pt-search-button");

      // Wait for the results table to load
      await page.waitForSelector(".k-grid-table", timeout_option);

      // Wait a moment for the table to fully populate
      await delay(1000);

      // Change page size to 50 to show all results on one page
      try {
        // Wait for the page size dropdown to be visible
        await page.waitForSelector('.k-pager-sizes select[data-role="dropdownlist"]', { timeout: 5000 });
        
        // Select 50 items per page
        await page.select('.k-pager-sizes select[data-role="dropdownlist"]', '50');
        
        // Wait for the table to reload with all items
        await delay(2000);
      } catch (error) {
        console.log("Page size selector not found or already showing all items:", error.message);
        // Continue anyway - might already be showing all items
      }

      // Extract data from the search results table
      const searchResults = await page.evaluate(() => {
        const rows = document.querySelectorAll(".k-grid-table tbody tr");
        const results = [];

        rows.forEach((row) => {
          const year = row.querySelector('td[role="gridcell"]:nth-child(6)')?.textContent.trim();
          const account = row.querySelector('td[role="gridcell"]:nth-child(4)')?.textContent.trim();
          const parcel = row.querySelector('td[role="gridcell"]:nth-child(5)')?.textContent.trim();
          const billNum = row.querySelector('td[role="gridcell"]:nth-child(9)')?.textContent.trim();
          const totalTax = row.querySelector('.pt-sr-baldue')?.textContent.trim();
          const balanceDue = row.querySelector('.pt-sr-baldue-paid')?.textContent.trim();
          const ownerName = row.querySelector('.pt-sr-name')?.textContent.trim();
          const address = row.querySelector('.pt-sr-address')?.textContent.trim();
          const detailsLink = row.querySelector('a[href*="/Property/Summary"]')?.getAttribute('href');

          // Determine if this year is paid or unpaid
          const isPaid = balanceDue && balanceDue.toLowerCase().includes("paid");

          results.push({
            year: year || "",
            account: account || "",
            parcel: parcel || "",
            billNum: billNum || "",
            totalTax: totalTax || "",
            balanceDue: balanceDue || "",
            isPaid: isPaid,
            ownerName: ownerName || "",
            address: address || "",
            detailsLink: detailsLink || ""
          });
        });

        return results;
      });

      // Sort by year descending to get the latest year first
      searchResults.sort((a, b) => parseInt(b.year) - parseInt(a.year));

      if (searchResults.length === 0) {
        throw new Error("No results found for this parcel number");
      }

      // Get the latest year
      const latestYear = searchResults[0];

      // Determine client type and how many years to show
      const yearsWantedCount = getOHCompanyYears(clientType);
      const clientStr = String(clientType || "").toLowerCase().trim();
      const isAccurateClient =
        yearsWantedCount >= 2 || clientStr.includes("accurate");

      const unpaidYears = searchResults.filter((record) => !record.isPaid);
      const latestYearNum = parseInt(searchResults[0].year);
      const hasUnpaidTaxes = unpaidYears.length > 0;

      let yearsToProcess = [];

      // Check if current year is unpaid and last year is paid
      const isCurrentYearUnpaid = unpaidYears.some(
        (record) => parseInt(record.year) === latestYearNum
      );
      const sortedResults = [...searchResults].sort(
        (a, b) => parseInt(b.year) - parseInt(a.year)
      );
      const lastYearRecord = sortedResults.length > 1 ? sortedResults[1] : null;
      const lastYearPaid = lastYearRecord && lastYearRecord.isPaid;

      if (unpaidYears.length > 1) {
        // Multiple unpaid years - show ALL unpaid years for BOTH clients
        yearsToProcess = unpaidYears;
      } else if (isCurrentYearUnpaid && lastYearPaid) {
        // Current year unpaid, last year paid
        if (isAccurateClient) {
          // Accurate: Show current + previous (2 years)
          yearsToProcess = [sortedResults[0], sortedResults[1]];
        } else {
          // Normal: Show only current (1 year)
          yearsToProcess = [sortedResults[0]];
        }
      } else if (!hasUnpaidTaxes) {
        // All paid
        if (isAccurateClient) {
          // Accurate: Show 2 most recent years
          yearsToProcess = sortedResults.slice(0, 2);
        } else {
          // Normal: Show only latest year
          yearsToProcess = [sortedResults[0]];
        }
      } else {
        // Single unpaid year (current or other)
        yearsToProcess = unpaidYears;
      }

      // Initialize the final data structure
      let finalData = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: "",
        account_number: "",
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A",
        exemption: "N/A",
        total_taxable_value: "N/A",
        notes: "",
        delinquent: "",
        taxing_authority: "Pickens County Tax Collector, South Carolina",
        tax_history: [],
      };

      // Process each year that needs to be opened
      for (let i = 0; i < yearsToProcess.length; i++) {
        const record = yearsToProcess[i];

        // Navigate to the details page for this year
        const detailsUrl = `https://pickensproperty.assurancegov.com${record.detailsLink}`;
        await page.goto(detailsUrl, { waitUntil: "domcontentloaded" });

        // Wait for tax information section to load
        await page.waitForSelector("#collapseTaxInfo", timeout_option);

        // Extract detailed tax information for this year
        const yearData = await page.evaluate((record) => {
          const data = {
            ownerName: record.ownerName,
            address: record.address,
            parcel: record.parcel,
            account: record.account,
            appraised: "N/A",
            assessed: "N/A",
            taxRecords: []
          };

          function formatDateMDY(dateStr) {
            const d = new Date(dateStr);
            if (isNaN(d)) return "";
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
          }

          function addOneDay(dateStr) {
            if (!dateStr) return "";
            const d = new Date(dateStr);
            d.setDate(d.getDate() + 1);
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
          }

          function parseAmount(amountStr) {
            if (!amountStr) return "$0.00";
            const cleaned = amountStr.replace(/[^0-9.-]/g, "");
            const num = parseFloat(cleaned);
            return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
          }

          // Extract assessed and appraised values from the assessment history table
          // Look for the table with YEAR, OWNER(S), TOTAL TAX, etc. headers
          const assessmentRows = document.querySelectorAll("table tr");
          assessmentRows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 7) {
              const yearCell = cells[0]?.textContent.trim();
              // Check if this row matches the current year we're processing
              if (yearCell === record.year) {
                const appraisedValue = cells[5]?.textContent.trim() || "N/A";
                const assessedValue = cells[6]?.textContent.trim() || "N/A";
                
                data.appraised = appraisedValue;
                data.assessed = assessedValue;
              }
            }
          });

          // Extract due date from alert message
          let dueDate = "";
          const alertDiv = document.querySelector(".alert.alert-info");
          if (alertDiv) {
            const alertText = alertDiv.textContent.trim();
            const dueDateMatch = alertText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dueDateMatch) {
              dueDate = dueDateMatch[0];
            }
          }

          // Extract last payment date and paid by info
          let lastPaymentDate = "";
          let paidBy = "";
          const paymentInfoDiv = document.querySelector(".pt-summary-payment-info");
          if (paymentInfoDiv) {
            const paymentText = paymentInfoDiv.textContent.trim();
            const dateMatch = paymentText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dateMatch) {
              lastPaymentDate = dateMatch[0];
            }
          }

          const paidByDiv = paymentInfoDiv?.nextElementSibling;
          if (paidByDiv) {
            paidBy = paidByDiv.textContent.trim();
          }

          // Extract tax information from the table
          const taxTable = document.querySelector(".pt-taxinfo-table tbody");
          if (taxTable) {
            const rows = taxTable.querySelectorAll("tr");

            rows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 8) {
                const billNumber = cells[0]?.textContent.trim() || "";
                const year = cells[1]?.textContent.trim() || "";
                const taxType = cells[2]?.textContent.trim() || "";
                const taxes = cells[3]?.textContent.trim() || "$0.00";
                const penalties = cells[4]?.textContent.trim() || "$0.00";
                const subtotal = cells[5]?.textContent.trim() || "$0.00";
                const amountPaid = cells[6]?.textContent.trim() || "$0.00";
                const balanceDue = cells[7]?.textContent.trim() || "$0.00";

                // Only include records for the specific year we are currently processing
                if (year !== record.year) {
                  return;
                }

                // Determine status
                let status = "";
                const balanceAmount = parseFloat(balanceDue.replace(/[^0-9.-]/g, ""));
                const taxAmount = parseFloat(taxes.replace(/[^0-9.-]/g, ""));

                if (balanceAmount === 0 && taxAmount > 0) {
                  status = "Paid";
                } else if (balanceAmount > 0) {
                  // Check if delinquent based on due date
                  if (dueDate) {
                    const dueDateTime = new Date(dueDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    dueDateTime.setHours(0, 0, 0, 0);

                    if (today > dueDateTime) {
                      status = "Delinquent";
                    } else {
                      status = "Due";
                    }
                  } else {
                    status = "Due";
                  }
                } else {
                  status = "N/A";
                }

                const delqDate = dueDate ? addOneDay(dueDate) : "";

                data.taxRecords.push({
                  jurisdiction: "County",
                  year: year,
                  bill_number: billNumber,
                  tax_type: taxType,
                  payment_type: "Annual",
                  status: status,
                  base_amount: parseAmount(taxes),
                  penalties_interest: parseAmount(penalties),
                  subtotal: parseAmount(subtotal),
                  amount_paid: parseAmount(amountPaid),
                  amount_due: parseAmount(balanceDue),
                  mailing_date: "N/A",
                  due_date: dueDate,
                  delq_date: delqDate,
                  paid_date: status === "Paid" ? lastPaymentDate : "",
                  paid_by: status === "Paid" ? paidBy : "",
                  good_through_date: "",
                  link: "",
                });
              }
            });
          }

          return data;
        }, record);

        // Add the tax records from this year to the final data
        finalData.tax_history.push(...yearData.taxRecords);

        // Set property info from the first record (they should all be the same)
        if (i === 0) {
          finalData.owner_name = [yearData.ownerName || "N/A"];
          finalData.property_address = yearData.address || "N/A";
          finalData.parcel_number = yearData.parcel || "N/A";
          finalData.account_number = yearData.account || "N/A";
          
          // Set the assessed and appraised values from the latest year
          finalData.total_assessed_value = formatValue(yearData.assessed);
          finalData.total_taxable_value = finalData.total_assessed_value;
          finalData.land_value = formatValue(yearData.appraised); // Using land_value field for appraised value
        }
      }

      // Sort tax history by year descending
      finalData.tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

      // Check for delinquency
      const hasDelinquent = finalData.tax_history.some(
        (rec) => rec.status.toLowerCase() === "delinquent"
      );

      finalData.delinquent = hasDelinquent
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      // Generate  with the specific format
      if (finalData.tax_history.length > 0) {
        const currentYearRecord = finalData.tax_history[0];
        const currentYear = currentYearRecord.year;

        // Determine if there are prior years and their status
        const allYears = searchResults
          .map((t) => parseInt(t.year))
          .sort((a, b) => b - a);
        const latestYearNum = allYears[0];
        const priorYears = allYears.filter((y) => y < latestYearNum);

        let allPriorsArePaid = true;
        if (priorYears.length > 0) {
          priorYears.forEach((priorYear) => {
            const priorRecord = searchResults.find(
              (t) => parseInt(t.year) === priorYear
            );
            if (priorRecord && !priorRecord.isPaid) {
              allPriorsArePaid = false;
            }
          });
        }

        const priorStatusText = allPriorsArePaid
          ? "ALL PRIORS ARE PAID"
          : "PRIOR YEARS ARE DELINQUENT";
        const currentYearStatus = currentYearRecord.status.toUpperCase();
        const dueDate = currentYearRecord.due_date || "12/10";

        finalData.notes = `${priorStatusText}, ${currentYear} TAXES ARE ${currentYearStatus}, TAXES ARE PAID ANNUALLY, DUE DATE IS ${dueDate}, CITY TAX NEED TO CONFIRM`;
        finalData.notes = finalData.notes.toUpperCase().trim();
      }

      return finalData;
    } catch (error) {
      throw error;
    }
};

const account_search = async (page, url, account, clientType) => {
  try {
    const data = await ac_1(page, url, account, clientType);
    return data;
  } catch (error) {
    console.error("Error in account_search:", error);
    throw error;
  }
};

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account, clientName, selectedClientType, client } = req.body;
  const clientType = selectedClientType || clientName || client || 'others';

  // Basic validation for account/parcel number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid parcel number",
    });
  }

  try {
    // Target URL
    const url = `https://pickensproperty.assurancegov.com/Property/Search`;

    // Validate fetch_type
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(400).json({
        error: true,
        message: "Invalid fetch_type. Must be 'html' or 'api'",
      });
    }

    // Launch Chromium instance
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(60000);

    // Optimize requests: block unnecessary resources
    await page.setRequestInterception(true);
    await page.setCacheEnabled(false);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (
        resourceType === "stylesheet" ||
        resourceType === "font" ||
        resourceType === "image" ||
        resourceType === "media" ||
        resourceType === "manifest" ||
        resourceType === "other" ||
        resourceType === "texttrack" ||
        resourceType === "object" ||
        resourceType === "beacon" ||
        resourceType === "csp_report" ||
        resourceType === "imageset"
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let data;
    try {
      data = await account_search(page, url, account, clientType);
      
      if (fetch_type === "html") {
        res.status(200).render("parcel_data_official", data);
      } else {
        res.status(200).json({ result: data });
      }
    } catch (error) {
      console.error("Scraping error:", error);
      if (fetch_type === "html") {
        res.status(200).render("error_data", {
          error: true,
          message: error.message,
        });
      } else {
        res.status(500).json({
          error: true,
          message: error.message,
        });
      }
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  } catch (error) {
    console.error("Controller error:", error);
    if (!res.headersSent) {
      if (fetch_type === "html") {
        res.status(200).render("error_data", {
          error: true,
          message: error.message,
        });
      } else {
        res.status(500).json({
          error: true,
          message: error.message,
        });
      }
    }
  }
};

export { search };
