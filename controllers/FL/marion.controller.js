//Author : Manjunadh
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 };

const formatCurrency = (num, withDollarSign = true) => {
  if (num === undefined || num === null || num === "" || num === "N/A") {
    return withDollarSign ? "$0.00" : "0.00";
  }
  const cleanNum = num.toString().replace(/[^0-9.]/g, '');
  const number = parseFloat(cleanNum);
  if (isNaN(number)) return withDollarSign ? "$0.00" : "0.00";
  const formatted = number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return withDollarSign ? `$${formatted}` : formatted;
};

const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};

/* -------------------- Step 1 -------------------- */
const levy_1 = async (page, account) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const url = "https://www.mariontax.com/itm/PropertySearchAccount.aspx";
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
        });
        if (response.status() === 403) {
          console.error(
            "Error in levy_1: Access Denied (403) - Ensure VPN is active and using a USA server."
          );
          throw new Error(
            "Access Denied: Please ensure a USA-based VPN is active."
          );
        }

        // Click the disclaimer "Agree" button if it exists
        const disclaimerBtn = await page.$("#btnAgree");
        if (disclaimerBtn) {
          await Promise.all([
            disclaimerBtn.click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          ]);
        }

        // Enter parcel number and search
        await page.waitForSelector(
          "#ctl00_ContentPlaceHolder1_txtAccount",
          timeout_option
        );
        await page.$eval(
          "#ctl00_ContentPlaceHolder1_txtAccount",
          (el) => (el.value = "")
        );
        await page.type(
          "#ctl00_ContentPlaceHolder1_txtAccount",
          String(account.replace(" ", "+"))
        );

        const searchBtn = await page.$("#ctl00_ContentPlaceHolder1_btnSearch");
        if (searchBtn) {
          await Promise.all([
            searchBtn.click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          ]);
        } else {
          await page.keyboard.press("Enter");
          await page.waitForNavigation({ waitUntil: "domcontentloaded" });
        }

        resolve(true);
      } catch (error) {
        console.error(`Error in levy_1: ${error.message}`);
        reject(new Error(`Failed in step 1: ${error.message}`));
      }
    })();
  });
};

/* -------------------- Step 2 -------------------- */
const levy_2 = async (page, account, yearsRequested) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        // Wait for mini detail page and click account/parcel number
        await page.waitForSelector(
          "#ctl00_ContentPlaceHolder1_rptSummary_ctl00_lnkDetails1",
          { ...timeout_option, state: "visible" }
        );
        const accountLink = await page.$(
          "#ctl00_ContentPlaceHolder1_rptSummary_ctl00_lnkDetails1"
        );
        if (!accountLink) {
          console.error(
            "Error in levy_2: Account link not found. Page HTML:",
            await page.content()
          );
          throw new Error("Account link not found");
        }
        await Promise.all([
          accountLink.click(),
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]).catch((err) => {
          console.error(
            "Error in levy_2: Failed to click account link:",
            err.message
          );
          throw err;
        });

        // Collect data from tables
        await page.waitForSelector(
          "#ctl00_ContentPlaceHolder1_tblSummary",
          timeout_option
        );
        const page_data = await page.evaluate((account, yearsRequested,) => {
          const formatCurrency = (num, withDollarSign = true) => {
            if (num === undefined || num === null || num === "" || num === "N/A") {
              return withDollarSign ? "$0.00" : "0.00";
            }
            const cleanNum = num.toString().replace(/[^0-9.]/g, '');
            const number = parseFloat(cleanNum);
            if (isNaN(number)) return withDollarSign ? "$0.00" : "0.00";
            const formatted = number.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
            return withDollarSign ? `$${formatted}` : formatted;
          };
          const getText = (sel) => {
            const element = document.querySelector(sel);
            if (!element) {
              console.log(`Selector ${sel} not found`);
              return "N/A";
            }
            const text = element.textContent.replace(/\u00A0/g, " ").trim();
            return text || "N/A";
          };

          // Helper function to get ordinal suffix
          const getOrdinal = (num) => {
            const n = parseInt(num);
            if (isNaN(n)) return num;
            if (n === 1) return "1ST";
            if (n === 2) return "2ND";
            if (n === 3) return "3RD";
            if (n >= 4 && n <= 10) return `${n}TH`;
            return num.toString();
          };

          // Extract tax year from lblDetTaxYear if available
          const taxYear = getText("#ctl00_ContentPlaceHolder1_lblDetTaxYear") || "2025";

          const tbl4 = document.querySelector("#tbl4");
          let owner_name = [];
          let property_address = "N/A";
          let parcel_number = account;
          let total_assessed_value = "N/A";
          let total_taxable_value = "N/A";
          let base_amount = "N/A";

          if (tbl4) {
            // Extract owner_name and property_address from Table2b dynamically
            const table2b = document.querySelector("#Table2b");
            if (table2b) {
              const rows = table2b.querySelectorAll("tr");
              let addressStarted = false;
              rows.forEach((row) => {
                const tds = row.querySelectorAll("td");
                tds.forEach((td) => {
                  const text = td.textContent.replace(/\u00A0/g, " ").trim();
                  if (text.match(/\d+/)) {
                    addressStarted = true;
                    if (property_address === "N/A") property_address = text;
                    else property_address += " " + text;
                  } else if (!addressStarted) {
                    if (text && owner_name.length === 0) owner_name = [text];
                    else if (text && !owner_name.includes(text))
                      owner_name.push(text);
                  } else {
                    if (text && !property_address.includes(text))
                      property_address += " " + text;
                  }
                });
              });
              property_address =
                property_address.replace(/N\/A/g, "").trim() || "N/A";
            }

            // Extract taxable value from Table2c dynamically
            const table2c = document.querySelector("#Table2c");
            if (table2c) {
              let taxableValue = null;
              for (const row of table2c.querySelectorAll("tr")) {
                const text = row.textContent.toUpperCase();
                if (text.includes("TXBL") || text.includes("TAXABLE")) {
                  const match = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
                  if (match) {
                    taxableValue = "$" + match[0];
                    break;
                  }
                }
              }
              if (taxableValue) {
                total_taxable_value = taxableValue;
                total_assessed_value = taxableValue;
              }
            }

            // Extract base_amount from Table2d dynamically
            const table2d = document.querySelector("#Table2d");
            if (table2d) {
              const rows = table2d.querySelectorAll("tr");
              rows.forEach((row) => {
                const text = row.textContent
                  .replace(/\u00A0/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                const match = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
                if (text.includes("TAXES") && match) {
                  base_amount = "$" + match[0];
                }
              });
            }
          }

          const tblSummary = document.querySelector(
            "#ctl00_ContentPlaceHolder1_tblSummary"
          );
          const tblInstallSched = document.querySelector(
            "#ctl00_ContentPlaceHolder1_tblInstallSched"
          );
          let tax_history = [];
          let all_years = [];
          let max_year = 0;

          if (tblSummary) {
            const summaryRows = tblSummary.querySelectorAll("tr");
            let hasInstallment = false;
            
            // First pass: collect all years and check for installments
            summaryRows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 7) {
                const yearStr = cells[0]?.textContent.trim() || "0";
                const year = parseInt(yearStr);
                if (!isNaN(year) && year >= 1900) {
                  all_years.push(year);
                  if (year > max_year) max_year = year;
                }
                const status = cells[3]?.textContent.trim();
                if (status === "INST DUE" || status === "INST F-PD") {
                  hasInstallment = true;
                }
              }
            });

            all_years.sort((a, b) => b - a);

            // Determine years to include
            const years_to_include = all_years.slice(0, yearsRequested);
            const delinquent_years = [];

            if (hasInstallment && tblInstallSched) {
              // Handle installment data
              const installRows = tblInstallSched.querySelectorAll("tr");
              const currentDate = new Date("2025-09-15");

              installRows.forEach((row, index) => {
                if (index > 1) {
                  const cells = row.querySelectorAll("td");
                  if (cells.length >= 4) {
                    const installmentText = cells[0]?.textContent.trim() || "";
                    const discountDate = cells[1]?.textContent.trim().replace(/-/g, "/") || "";
                    const amount = cells[2]?.textContent.trim().replace(/^\$/, "").trim() || "0.00";
                    const paidStatus = cells[3]?.textContent.trim() || "";
                    const dueDateObj = new Date(discountDate);
                    let due_date = discountDate;
                    let delq_date = new Date(dueDateObj);
                    delq_date.setDate(dueDateObj.getDate() + 1);
                    delq_date = delq_date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$1/$2/$3');

                    let standardizedInstallment = "";
                    const month = dueDateObj.getMonth() + 1;
                    if (month === 6) standardizedInstallment = "1";
                    else if (month === 9) standardizedInstallment = "2";
                    else if (month === 12) standardizedInstallment = "3";
                    else if (month === 3) standardizedInstallment = "4";
                    else {
                      const match = installmentText.match(/(\d+)(st|nd|rd|th)/i);
                      standardizedInstallment = match ? match[1] : "1";
                    }

                    let processedStatus = paidStatus === "Unpaid" ? "Unpaid" : "Paid";
                    if (paidStatus === "Unpaid") {
                      if (currentDate < new Date(delq_date)) {
                        processedStatus = "Due";
                      } else {
                        processedStatus = "Delinquent";
                        delinquent_years.push(parseInt(taxYear));
                      }
                    }

                    tax_history.push({
                      jurisdiction: "County",
                      year: taxYear,
                      payment_type: `${getOrdinal(standardizedInstallment)} installment`,
                      installment: standardizedInstallment,
                      status: processedStatus,
                      base_amount: base_amount,
                      amount_paid: processedStatus === "Paid" ? "$" + amount : "$0.00",
                      amount_due: ["Due", "Unpaid", "Delinquent"].includes(processedStatus) ? "$" + amount : "$0.00",
                      mailing_date: "N/A",
                      due_date: due_date,
                      delq_date: delq_date,
                      paid_date: processedStatus === "Paid" ? discountDate : "-",
                      good_through_date: "",
                    });
                  }
                }
              });
            } else {
              // Handle annual data - process only selected years
              const currentDate = new Date("2025-09-15");
              
              summaryRows.forEach((row) => {
                const cells = row.querySelectorAll("td");
                if (cells.length >= 7) {
                  const yearStr = cells[0]?.textContent.trim() || "0";
                  const year = parseInt(yearStr);
                  if (isNaN(year) || year < 1900) return;

                  // Check if this year should be included
                  const isUnpaid = cells[3]?.textContent.trim() === "UNPAID";
                  const shouldInclude = years_to_include.includes(year) || isUnpaid;
                  
                  if (!shouldInclude) return;

                  let shift = 0;
                  if (cells.length >= 8 && cells[1].textContent.trim() === account) shift = 1;
                  if (cells.length >= 9 && cells[2].textContent.trim() === yearStr + " " + account) shift = 2;

                  let isMinTaxFormat = false;
                  if (cells[3]?.className === "MINTAX" || cells[3]?.textContent.trim() === "MINTAX") {
                    isMinTaxFormat = true;
                  }

                  let baseIdx, statusIdx, paidDateIdx, amountPaidIdx, amountDueIdx;
                  if (isMinTaxFormat) {
                    baseIdx = -1;
                    statusIdx = 3;
                    paidDateIdx = 4;
                    amountPaidIdx = 5;
                    amountDueIdx = 6;
                  } else {
                    baseIdx = 2 + shift;
                    statusIdx = 3 + shift;
                    paidDateIdx = 4 + shift;
                    amountPaidIdx = 5 + shift;
                    amountDueIdx = 6 + shift;
                  }

                  const status = cells[statusIdx]?.textContent.trim();
                  const amountPaid = cells[amountPaidIdx]?.textContent.trim().replace(/[\$,]/g, "") || "0.00";
                  const amountDue = cells[amountDueIdx]?.textContent.trim().replace(/[\$,]/g, "") || "0.00";
                  
                  // Calculate base amount: use paid amount if paid, otherwise use due amount
                  let baseAmount = "N/A";
                  if (status === "PAID" && parseFloat(amountPaid) > 0) {
                    baseAmount = amountPaid;
                  } else if (status === "UNPAID" && parseFloat(amountDue) > 0) {
                    baseAmount = amountDue;
                  } else if (!isMinTaxFormat && baseIdx >= 0) {
                    const extracted = cells[baseIdx]?.textContent.trim().replace(/[\$,]/g, "") || "N/A";
                    if (extracted !== "N/A" && /^\d+(?:\.\d+)?$/.test(extracted)) {
                      baseAmount = extracted;
                    }
                  }
                  
                  const paid_date = status === "UNPAID" || status === "MINTAX" || status === "No Tax Due" ? "-" : cells[paidDateIdx]?.textContent.trim() || "-";

                  let processedStatus = status;
                  if (status === "UNPAID") {
                    const dueDate = new Date(`03/31/${parseInt(yearStr) + 1}`);
                    const delqDate = new Date(`04/01/${parseInt(yearStr) + 1}`);
                    if (currentDate < dueDate) {
                      processedStatus = "Due";
                    } else if (currentDate >= dueDate && currentDate < delqDate) {
                      processedStatus = "Unpaid";
                    } else {
                      processedStatus = "Delinquent";
                      delinquent_years.push(year);
                    }
                  }

                  if (processedStatus && ["UNPAID", "PAID", "MINTAX", "No Tax Due", "Due", "Unpaid", "Delinquent"].includes(processedStatus)) {
                    // Format base amount as currency
                    const formattedBaseAmount = baseAmount !== "N/A" ? formatCurrency(baseAmount) : "N/A";
                    
                    tax_history.push({
                      jurisdiction: "County",
                      year: yearStr,
                      payment_type: "Annual",
                      installment: "",
                      status: processedStatus === "UNPAID" ? "Unpaid" : processedStatus === "PAID" ? "Paid" : processedStatus,
                      base_amount: formattedBaseAmount,
                      amount_paid: "$" + (["Due", "Unpaid", "Delinquent", "MINTAX", "No Tax Due"].includes(processedStatus) ? "0.00" : formatCurrency(amountPaid, false)),
                      amount_due: "$" + (["Due", "Unpaid", "Delinquent", "MINTAX", "No Tax Due"].includes(processedStatus) ? formatCurrency(amountDue, false) : "0.00"),
                      mailing_date: "N/A",
                      due_date: `03/31/${parseInt(yearStr) + 1}`,
                      delq_date: `04/01/${parseInt(yearStr) + 1}`,
                      paid_date: processedStatus === "PAID" ? paid_date : "-",
                      good_through_date: "",
                    });
                  }
                }
              });
            }

            // Sort by year descending
            tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
          }

          // Generate notes
          const isQuarterly = tax_history.some(row => row.payment_type.includes("installment"));
          const paymentFrequency = isQuarterly ? "INSTALLMENTS" : "ANNUALLY";
          const dueDates = isQuarterly ? "06/30, 09/30, 12/31 & 03/31" : "03/31";
          let notes = "";

          if (tax_history.length === 0) {
            notes = `NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID ${paymentFrequency}, NORMALLY DUE DATES ARE ${dueDates}.`;
          } else {
            const latestYear = tax_history[0]?.year || "UNKNOWN";
            const latestStatus = tax_history[0]?.status || "UNKNOWN";
            
            // Check if prior years (excluding latest) are all paid
            const priorYears = tax_history.filter(row => parseInt(row.year) < parseInt(latestYear));
            const allPriorsPaid = priorYears.length === 0 || priorYears.every(row => row.status === "Paid");

            if (isQuarterly) {
              const unpaidInstallments = tax_history
                .filter(row => ["Unpaid", "Due", "Delinquent"].includes(row.status) && row.installment)
                .map(row => `${getOrdinal(row.installment)} INSTALLMENT`);
              const paidInstallments = tax_history
                .filter(row => row.status === "Paid" && row.installment)
                .map(row => `${getOrdinal(row.installment)} INSTALLMENT`);
              
              if (unpaidInstallments.length > 0) {
                const paidText = paidInstallments.length > 0 ? `${paidInstallments.join(" & ")} ARE PAID` : "";
                const unpaidText = `${unpaidInstallments.join(" & ")} ARE ${["Due"].includes(latestStatus) ? "DUE" : "UNPAID"}`;
                const priorText = allPriorsPaid ? "PRIOR YEAR(S) ARE PAID" : "PRIOR YEAR(S) ARE UNPAID";
                notes = `${priorText}, ${latestYear} ${[paidText, unpaidText].filter(Boolean).join(", ")}, NORMALLY TAXES ARE PAID IN INSTALLMENTS, NORMALLY DUE DATES ARE ${dueDates}.`;
              } else {
                notes = `ALL PRIOR INSTALLMENTS ARE PAID, ${latestYear} ${paidInstallments.join(" & ")} ARE PAID, NORMALLY TAXES ARE PAID IN INSTALLMENTS, NORMALLY DUE DATES ARE ${dueDates}.`;
              }
            } else {
              if (!allPriorsPaid) {
                notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}.`;
              } else {
                notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}.`;
              }
            }
          }

          const hasDelinquent = tax_history.some(row => row.status === "Delinquent");

          return {
            processed_date: new Date().toISOString(),
            order_number: "",
            borrower_name: "",
            owner_name: owner_name.length ? owner_name : ["N/A"],
            property_address: property_address !== "N/A" ? property_address : "N/A",
            parcel_number,
            land_value: "",
            improvements: "",
            total_assessed_value: total_assessed_value !== "N/A" ? total_assessed_value : "N/A",
            exemption: "",
            total_taxable_value: total_taxable_value !== "N/A" ? total_taxable_value : "N/A",
            taxing_authority: "Office of the Marion County Tax Collector PO BOX 63 Ocala, Florida 34478-0063",
            notes,
            delinquent: hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
            tax_history,
            years_requested: yearsRequested,
            years_returned: tax_history.length > 0 ? [...new Set(tax_history.map(r => r.year))].length : 0,
            has_delinquent: hasDelinquent,
            max_year: max_year
          };
        }, account, yearsRequested);

        resolve(page_data);
      } catch (error) {
        console.error(`Error in levy_2: ${error.message}`);
        reject(new Error(`Failed to collect assessor data: ${error.message}`));
      }
    })();
  });
};

/* -------------------- Wrapper -------------------- */
const account_search = async (page, account, yearsRequested = 2) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await levy_1(page, account);
        const data2 = await levy_2(page, account, yearsRequested);
        resolve(data2);
      } catch (error) {
        console.error(`Error in account_search: ${error.message}`);
        reject(new Error(`Account search failed: ${error.message}`));
      }
    })();
  });
};

/* -------------------- Endpoint -------------------- */
const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body;
    
    if (!account || account.trim() === '') {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid fetch_type. Must be 'html' or 'api'.",
      });
    }

    // Get years requested from config (same as Putnam)
    let yearsRequested = getOHCompanyYears(client);

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Safari/537.36"
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
      const data = await account_search(page, account, yearsRequested);
      res.status(200).render("parcel_data_official", data);
    } else if (fetch_type === "api") {
      const data = await account_search(page, account, yearsRequested);
      res.status(200).json({ result: data });
    }
  } catch (error) {
    console.error(`Error in search endpoint: ${error.message}`);
    if (req.body.fetch_type === "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message,
      });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  } finally {
    if (context) {
      await context.close();
    }
  }
};

module.exports = { search };