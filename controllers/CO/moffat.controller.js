//author:DHANUSH
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Default timeout for waiting selectors
const timeout_option = {
  timeout: 90000
};

// Helper: Format any amount string to proper $X,XXX.XX format
const formatDollar = (amountStr) => {
  if (!amountStr || amountStr === "") return "$0.00";
  const num = parseFloat(amountStr.replace(/[^\d.]/g, ""));
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Search by schedule number and extract all tax bill links for all years
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Navigate to search page
      const url = "http://moffat.visualgov.com/ScheduleSearch.aspx";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout_option });

      // Wait for input field
      await page.waitForSelector("#ctl00_ContentPlaceHolder1_txtScheduleNumber", timeout_option);
      // Fill schedule number
      await page.locator("#ctl00_ContentPlaceHolder1_txtScheduleNumber").fill(account);

      // Set dropdowns
      await page.select("#ctl00_ContentPlaceHolder1_ddlRollType", "All");
      await page.select("#ctl00_ContentPlaceHolder1_ddlYear", "0");

      // Click search and wait for navigation
      Promise.all([
        page.click("#ctl00_ContentPlaceHolder1_btnSearch"),
        page.waitForNavigation()
      ])
      .then(async () => {
        // Check if results table exists
        const resultsTable = await page.$("#ctl00_ContentPlaceHolder1_grdResults");
        if (!resultsTable) {
          reject(new Error("Invalid Schedule Number or No Records Found"));
        }

        // Check for "No records found" message
        const noResults = await page.evaluate(() => {
          const body = document.body.textContent;
          return body.includes("No records found") || body.includes("invalid");
        });

        if (noResults) {
          reject(new Error("Invalid Schedule Number or No Records Found"));
        }

        // Extract all tax bill links with year
        const { taxBills, maxYear } = await page.evaluate(() => {
          const bills = [];
          const rows = document.querySelectorAll("#ctl00_ContentPlaceHolder1_grdResults tbody tr");
          
          rows.forEach((row, idx) => {
            if (idx === 0) return; // Skip header
            const link = row.querySelector("td:first-child a");
            if (link) {
              const href = link.getAttribute("href");
              const text = link.textContent.trim();
              const match = text.match(/\((\d{4})\)/); // Extract year from (2024)
              if (match && href) {
                bills.push({
                  year: match[1],
                  url: href
                });
              }
            }
          });
          
          const years = bills.map(b => parseInt(b.year));
          const maxYear = years.length > 0 ? Math.max(...years) : null;

          // Sort bills by year descending to ensure we process newest first
          bills.sort((a, b) => parseInt(b.year) - parseInt(a.year));

          return { taxBills: bills, maxYear };
        });

        if (taxBills.length === 0) {
          reject(new Error("No tax bills found"));
        }

        resolve({ taxBills, maxYear });
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

// Visit each bill page + print page and collect all property & tax data
const ac_2 = async (page, ac1_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      let allBillsData = [];
      
      // Recursive function to process each year's bill
      const processBills = async (bills, index = 0) => {
        if (index >= bills.length) {
          return allBillsData;
        }

        const bill = bills[index];
        const billUrl = `http://moffat.visualgov.com/${bill.url}`;
        
        // Go to main tax bill page
        await page.goto(billUrl, { waitUntil: "domcontentloaded" });
        
        // Scrape main bill data
        return page.evaluate((year) => {
          const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
          
          let propertyAddress = "";
          const addrEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblPropertyAddress");
          if (addrEl) propertyAddress = clean(addrEl.textContent);

          const ownerLines = [];
          const ownerEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblAddress");
          if (ownerEl) {
            const html = ownerEl.innerHTML;
            const lines = html.split("<br>").map(l => clean(l.replace(/<[^>]*>/g, "")));
            ownerLines.push(...lines.filter(l => l));
          }

          let taxableValue = "";
          const taxableEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTaxableValue");
          if (taxableEl) taxableValue = clean(taxableEl.textContent);

          let actualValue = "";
          const actualEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblActualValue");
          if (actualEl) actualValue = clean(actualEl.textContent);

          let tax = "", interest = "", fee = "", total = "", unpaidBalance = "";
          const taxEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTax");
          if (taxEl) tax = clean(taxEl.textContent);

          const interestEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblInterest");
          if (interestEl) interest = clean(interestEl.textContent);

          const feeEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblPenalty");
          if (feeEl) fee = clean(feeEl.textContent);

          const totalEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblTotal");
          if (totalEl) total = clean(totalEl.textContent);

          const unpaidEl = document.querySelector("#ctl00_ContentPlaceHolder1_lblUnpaidBalance");
          if (unpaidEl) unpaidBalance = clean(unpaidEl.textContent);

          let status = "Due";
          const unpaidNum = parseFloat(unpaidBalance.replace(/[^\d.]/g, ""));
          if (unpaidNum === 0 || unpaidBalance.includes("Paid")) status = "Paid";

          return {
            year, propertyAddress, ownerLines, taxableValue, actualValue,
            tax, interest, fee, total, unpaidBalance, status
          };
        }, bill.year)
        .then(async (billData) => {
          // Go to print version to get last paid date and amount
          const printUrl = billUrl.replace("TaxBill.aspx", "PrintBill.aspx") + "&Status=BL";
          
          return page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
            .then(() => {
              return page.evaluate(() => {
                const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
                let lastPaidDate = "", amountPaid = "";
                
                const lastPaidEl = document.querySelector("#lblLastPaid");
                if (lastPaidEl) lastPaidDate = clean(lastPaidEl.textContent);
                
                const amountPaidEl = document.querySelector("#lblAmountPaid");
                if (amountPaidEl) amountPaid = clean(amountPaidEl.textContent);
                
                return { lastPaidDate, amountPaid };
              });
            })
            .then((paymentData) => {
              billData.lastPaidDate = paymentData.lastPaidDate;
              billData.amountPaid = paymentData.amountPaid;
              allBillsData.push(billData);
              
              // Stop processing if this year is Paid (assume older years are also paid)
              if (billData.status === "Paid") {
                return allBillsData;
              }
              
              return processBills(bills, index + 1);
            })
            .catch((printError) => {
              console.log("Print page failed:", printError.message);
              billData.lastPaidDate = "";
              billData.amountPaid = billData.status === "Paid" ? billData.tax : "$0.00";
              allBillsData.push(billData);

              // Stop processing if this year is Paid
              if (billData.status === "Paid") {
                return allBillsData;
              }

              return processBills(bills, index + 1);
            });
        });
      };

      // Start processing all bills
      processBills(ac1_data.taxBills)
        .then(() => {
          if (allBillsData.length === 0) {
            reject(new Error("No tax data found"));
          }

          // Pick the bill with owner/address info (most recent usually)
          const primaryBill = allBillsData.find(bill => 
            (bill.ownerLines && bill.ownerLines.length > 0) || 
            (bill.propertyAddress && bill.propertyAddress !== "")
          ) || allBillsData[0];
          
          // Build final data object
          const datum = {
            max_tax_year: ac1_data.maxYear,
            processed_date: new Date().toISOString().slice(0, 10),
            order_number: "",
            borrower_name: "",
            owner_name: primaryBill.ownerLines.length > 0 ? [primaryBill.ownerLines[0]] : [""],
            mailing_address: primaryBill.ownerLines.length > 1 ? primaryBill.ownerLines.slice(1).join(", ") : "",
            property_address: primaryBill.propertyAddress,
            parcel_number: account,
            land_value: "",
            improvements: "",
            total_assessed_value: formatDollar(primaryBill.actualValue),
            exemption: "",
            total_taxable_value: formatDollar(primaryBill.taxableValue),
            taxing_authority: "Moffat County Treasurer, 221 W Victory Way Suite 130, Craig, CO 81625, Ph: 970-824-9111",
            notes: "",
            delinquent: "NONE",
            tax_history: [],
            all_bills: allBillsData
          };

          resolve(datum);
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

// Step 3 – Build tax history with correct due/delq dates (April 30 due date)
const ac_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      let currentTaxYear = data.max_tax_year;

      
      const taxHistory = [];
      const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

      // Process each bill
      data.all_bills.forEach((bill) => {
        const yearNum = parseInt(bill.year);
        const taxRaw = bill.tax || "$0.00";
        const unpaidRaw = bill.unpaidBalance || "$0.00";
        const paidRaw = bill.amountPaid || "$0.00";

        const baseAmount = formatDollar(taxRaw);
        const baseNum = parseFloat(taxRaw.replace(/[^\d.]/g, ""));
        const unpaidNum = parseFloat(unpaidRaw.replace(/[^\d.]/g, ""));
        const paidNum = parseFloat(paidRaw.replace(/[^\d.]/g, ""));
        
        const status = (unpaidNum === 0 || paidNum >= baseNum) ? "Paid" : "Due";
        const amountPaid = status === "Paid" ? baseAmount : "$0.00";
        const amountDue = status === "Paid" ? "$0.00" : formatDollar(unpaidRaw);

        // Due date: April 30 of following year
        const annualDueDate = new Date(yearNum + 1, 3, 30);
        if (annualDueDate.getDay() === 0) annualDueDate.setDate(annualDueDate.getDate() + 1); // Skip Sunday
        if (annualDueDate.getDay() === 6) annualDueDate.setDate(annualDueDate.getDate() + 2); // Skip Saturday
        const annualDelqDate = new Date(annualDueDate);
        annualDelqDate.setDate(annualDueDate.getDate() + 1);

        taxHistory.push({
          jurisdiction: "County",
          year: bill.year,
          payment_type: "Annual",
          status,
          base_amount: baseAmount,
          amount_paid: amountPaid,
          amount_due: amountDue,
          mailing_date: "N/A",
          due_date: fmt(annualDueDate),
          delq_date: fmt(annualDelqDate),
          paid_date: bill.lastPaidDate || "-",
          good_through_date: ""
        });
      });

      // Sort newest first
      taxHistory.sort((a, b) => b.year - a.year);

      resolve({
        data: data,
        tax_history: taxHistory,
        current_tax_year: currentTaxYear
      });

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Step 4 – Filter history and mark delinquent based on delq date
const ac_4 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      const taxHistory = main_data.tax_history;
      const currentTaxYear = main_data.current_tax_year;

      const hasUnpaid = taxHistory.some(p => p.status === "Due");
      
      let filteredHistory = [];
      if (!hasUnpaid) {
        filteredHistory = [taxHistory[0]]; // Only show current year if all paid
      } else {
        filteredHistory = taxHistory.filter(p => p.status === "Due"); // Show only Due
      }

      // Mark delinquent if past delq date
      filteredHistory.forEach((item) => {
        if (item.status === "Paid") {
          item.delinquent = "NONE";
          return;
        }

        const delqParts = item.delq_date ? item.delq_date.split("/") : null;
        let delqDate = null;

        if (delqParts && delqParts.length === 3) {
          const [mm, dd, yyyy] = delqParts.map(Number);
          delqDate = new Date(yyyy, mm - 1, dd);
        }

        if (delqDate && delqDate > currentDate) {
          item.status = "Due";
          item.delinquent = "NONE";
        } else {
          item.status = "Delinquent";
          item.delinquent = "YES";
        }
      });

      resolve({
        data: main_data.data,
        filtered_history: filteredHistory,
        current_tax_year: currentTaxYear
      });

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Step 5 – Final notes and delinquent flag
const ac_5 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const filteredHistory = main_data.filtered_history;
      const currentTaxYear = main_data.current_tax_year;
      const data = main_data.data;

      const currentYear = currentTaxYear.toString();
      const currentYearPayment = filteredHistory.find(p => p.year === currentYear);

      let currentNote = "";
      if (currentYearPayment) {
        if (currentYearPayment.status === "Delinquent") {
          currentNote = `${currentYear} ANNUAL TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 30/04`;
        } else if (currentYearPayment.status === "Due") {
          currentNote = `${currentYear} ANNUAL PAYMENT IS DUE, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 30/04`;
        } else {
          currentNote = `${currentYear} ANNUAL TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 30/04`;
        }
      } else {
        currentNote = `${currentYear} NO TAXES FOUND, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 30/04`;
      }

      // Check for prior year delinquencies
      const priorDelinquent = filteredHistory.some(p => p.status === "Delinquent" && parseInt(p.year) < parseInt(currentYear));
      const priorUnpaid = filteredHistory.some(p => p.status === "Due" && parseInt(p.year) < parseInt(currentYear));
      const priorNote = priorDelinquent 
        ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" 
        : priorUnpaid 
          ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" 
          : "PRIOR YEAR(S) TAXES ARE PAID";

      data.notes = `${priorNote}, ${currentNote}`;

      const isDelinquent = filteredHistory.some(record => record.delinquent === "YES");
      data.delinquent = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      data.tax_history = filteredHistory;
      delete data.all_bills;

      resolve(data);

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Main orchestrator – chain all steps
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
        .then((data) => {
          ac_2(page, data, account)
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

// Express route handler
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    // Validate account number
    if(account.trim()==''||!account){
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }

    // Validate fetch_type
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
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

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Run search
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
    }
    else if (fetch_type == "api") {
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
    }
    else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
};

export { search };