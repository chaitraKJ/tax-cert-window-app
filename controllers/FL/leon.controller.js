//Author : Manjunadh
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 };

/* -------------------- Step 1 -------------------- */
const lc_1 = async (page, account) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const url =
          "https://wwwtax2.leoncountyfl.gov/itm/PropertySearchAccount.aspx";
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
        });
        if (response.status() === 403) {
          console.error(
            "Error in lc_1: Access Denied (403) - Ensure VPN is active and using a USA server."
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
          "#_ctl0_ContentPlaceHolder1_txtAccount",
          timeout_option
        );
        await page.$eval(
          "#_ctl0_ContentPlaceHolder1_txtAccount",
          (el) => (el.value = "")
        );
        await page.type(
          "#_ctl0_ContentPlaceHolder1_txtAccount",
          String(account.replace(" ", "+"))
        );

        const searchBtn = await page.$("#_ctl0_ContentPlaceHolder1_btnSearch");
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
        console.error(`Error in lc_1: ${error.message}`);
        reject(new Error(`Failed in step 1: ${error.message}`));
      }
    })();
  });
};

/* -------------------- Step 2 -------------------- */
const lc_2 = async (page, account, yearsRequested = 1) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        // Wait for mini detail page and click account/parcel number
        await page.waitForSelector(
          "#_ctl0_ContentPlaceHolder1_rptSummary__ctl0_lnkDetails1",
          { ...timeout_option, state: "visible" }
        );
        const accountLink = await page.$(
          "#_ctl0_ContentPlaceHolder1_rptSummary__ctl0_lnkDetails1"
        );
        if (!accountLink) {
          console.error(
            "Error in lc_2: Account link not found. Page HTML:",
            await page.content()
          );
          throw new Error("Account link not found");
        }
        await Promise.all([
          accountLink.click(),
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]).catch((err) => {
          console.error(
            "Error in lc_2: Failed to click account link:",
            err.message
          );
          throw err;
        });

        // Collect data from tables
        await page.waitForSelector(
          "#_ctl0_ContentPlaceHolder1_tblSummary",
          timeout_option
        );
        const page_data = await page.evaluate((account, yearsRequested = 1) => {
          const getText = (sel) => {
            const element = document.querySelector(sel);
            if (!element) {
              console.log(`Selector ${sel} not found`);
              return "N/A";
            }
            const text = element.textContent.replace(/\u00A0/g, " ").trim();
            return text || "N/A";
          };

          // Helper function to get ordinal suffix - enhanced for robustness
          const getOrdinal = (num) => {
            const n = parseInt(num);
            if (isNaN(n)) return num;
            
            if (n === 1) return "1ST";
            if (n === 2) return "2ND";
            if (n === 3) return "3RD";
            if (n >= 4 && n <= 10) return `${n}TH`;
            return num.toString();
          };

          // Extract tax year from lblDetTaxYear
          const taxYear = getText("#_ctl0_ContentPlaceHolder1_lblDetTaxYear") || "2025";

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
                    // Start of address
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
              // Clean up property_address
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
                total_assessed_value = taxableValue; // Assume they are the same unless differentiated
              }
              // Fallback to tax_history if values are still "N/A"
              if (
                total_assessed_value === "N/A" &&
                window.History &&
                window.History.length
              ) {
                const fallbackValue =
                  "$" +
                  Math.round(
                    parseFloat(
                      window.History[0].amount_due.replace(/[\$,]/g, "")
                    ) / 0.0224
                  ).toLocaleString(); // 2.24% tax rate
                total_assessed_value = total_taxable_value = fallbackValue;
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
                if (text.includes("TOTAL") && match) {
                  base_amount = "$" + match[0];
                }
              });
            }
            // Fallback to tax_history amount_due if base_amount is still "N/A"
            if (
              base_amount === "N/A" &&
              window.History &&
              window.History.length > 0
            ) {
              base_amount = window.History[0].amount_due;
            }
          } else {
            console.log("Table #tbl4 not found");
          }

          // Determine if installment data should be used
          const tblSummary = document.querySelector(
            "#_ctl0_ContentPlaceHolder1_tblSummary"
          );
          const tblInstallSched = document.querySelector(
            "#_ctl0_ContentPlaceHolder1_tblInstallSched"
          );
          let tax_history = [];
          let delinquentInstallments = []; // Track delinquent installments

          if (tblSummary) {
            const summaryRows = tblSummary.querySelectorAll("tr");
            let hasInstallment = false;
            summaryRows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 7) {
                const status = cells[3]?.textContent.trim();
                if (status === "INST DUE" || status === "INST F-PD") {
                  hasInstallment = true;
                }
              }
            });

            if (hasInstallment && tblInstallSched) {
              // Extract data from installment table
              const installRows = tblInstallSched.querySelectorAll("tr");
              const currentDate = new Date("2025-09-15");

              installRows.forEach((row, index) => {
                if (index > 1) { // Skip header rows
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

                    // Derive installment (1st, 2nd, 3rd, 4th) based on due_date month with fallback
                    let standardizedInstallment = "";
                    const month = dueDateObj.getMonth() + 1; // 0-based to 1-based
                    if (month === 6) standardizedInstallment = "1";  // June
                    else if (month === 9) standardizedInstallment = "2"; // September
                    else if (month === 12) standardizedInstallment = "3"; // December
                    else if (month === 3) standardizedInstallment = "4";  // March
                    else {
                      // Fallback: try to extract from installmentText
                      const match = installmentText.match(/(\d+)(st|nd|rd|th)/i);
                      standardizedInstallment = match ? match[1] : "1";
                    }

                    // Enhanced status processing for installments
                    let processedStatus = paidStatus === "Unpaid" ? "Unpaid" : "Paid";
                    if (paidStatus === "Unpaid") {
                      if (currentDate < dueDateObj) {
                        processedStatus = "Due";
                      } else if (currentDate >= dueDateObj && currentDate < new Date(delq_date)) {
                        processedStatus = "Unpaid";
                      } else {
                        processedStatus = "Delinquent";
                      }
                    }

                    // Dynamic base amount
                    let baseAmount = amount;
                    if (window.History?.length) {
                      const taxSummaryRow = window.History.find(r => r.installment?.toLowerCase().includes(standardizedInstallment.toLowerCase()));
                      if (taxSummaryRow) baseAmount = taxSummaryRow.base_amount.replace(/^\$/, "");
                    }

                    // Check if installment is delinquent (unpaid and past delq_date)
                    if (processedStatus === "Delinquent") {
                      delinquentInstallments.push({ year: taxYear, delq_date, installment: standardizedInstallment });
                    }

                    tax_history.push({
                      jurisdiction: "County",
                      year: taxYear, // Use taxYear from lblDetTaxYear
                      payment_type: `${getOrdinal(standardizedInstallment)} installment`,
                      installment: standardizedInstallment,
                      status: processedStatus,
                      base_amount: base_amount,
                      amount_paid: processedStatus === "Paid" ? "$" + baseAmount : "$0.00",
                      amount_due: ["Due", "Unpaid", "Delinquent"].includes(processedStatus) ? "$" + baseAmount : "$0.00",
                      mailing_date: "N/A",
                      due_date: due_date,
                      delq_date: delq_date,
                      paid_date: processedStatus === "Paid" ? discountDate : "-",
                      good_through_date: "",
                    });
                  }
                }
              });
            } else if (tblSummary) {
              // Extract from tax history table if no installment - WITH STATUS UPDATE FIX
              let latestYear = 0;
              const currentDate = new Date("2025-09-15");
              summaryRows.forEach((row) => {
                const cells = row.querySelectorAll("td");
                if (cells.length >= 7) {
                  const yearStr = cells[0]?.textContent.trim() || "0";
                  const year = parseInt(yearStr);
                  if (isNaN(year) || year < 1900) return;

                  let shift = 0;
                  if (
                    cells.length >= 8 &&
                    cells[1].textContent.trim() === account
                  )
                    shift = 1;
                  if (
                    cells.length >= 9 &&
                    cells[2].textContent.trim() === yearStr + " " + account
                  )
                    shift = 2;

                  let isMinTaxFormat = false;
                  if (cells[3]?.className === "MINTAX" || cells[3]?.textContent.trim() === "MINTAX") {
                    isMinTaxFormat = true;
                  }

                  let baseIdx, statusIdx, paidDateIdx, amountPaidIdx, amountDueIdx;
                  if (isMinTaxFormat) {
                    baseIdx = -1; // No base amount in MINTAX format
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
                  let baseAmount = isMinTaxFormat
                    ? "N/A"
                    : cells[baseIdx]?.textContent.trim().replace(/[\$,]/g, "") ||
                      "N/A";
                  if (
                    !isMinTaxFormat &&
                    baseAmount !== "N/A" &&
                    !/^\d+(?:\.\d+)?$/.test(baseAmount)
                  ) {
                    baseAmount = "N/A";
                  }
                  const amountPaid =
                    cells[amountPaidIdx]?.textContent
                      .trim()
                      .replace(/[\$,]/g, "") || "0.00";
                  const amountDue =
                    cells[amountDueIdx]?.textContent
                      .trim()
                      .replace(/[\$,]/g, "") || "0.00";
                  const paid_date =
                    status === "UNPAID" || status === "MINTAX" || status === "No Tax Due"
                      ? "-"
                      : cells[paidDateIdx]?.textContent.trim() || "-";

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
                    }
                  }

                  if (year > latestYear) latestYear = year;

                  if (
                    processedStatus &&
                    ["UNPAID", "PAID", "MINTAX", "No Tax Due", "Due", "Unpaid", "Delinquent", "DELINQUENT"].includes(processedStatus)
                  ) {
                    tax_history.push({
                      jurisdiction: "County",
                      year: yearStr,
                      payment_type: "Annual",
                      installment: "", // Empty for annual payments
                      status:
                        processedStatus === "UNPAID"
                          ? "Unpaid"
                          : processedStatus === "PAID"
                            ? "Paid"
                            : processedStatus === "MINTAX"
                              ? "MINTAX"
                              : processedStatus === "No Tax Due"
                                ? "No Tax Due"
                                : processedStatus === "Due"
                                  ? "Due"
                                  : processedStatus === "Unpaid"
                                    ? "Unpaid"
                                    : "Delinquent",
                      base_amount: base_amount !== "N/A" ? base_amount : "N/A",
                      amount_paid:
                        "$" + (["Due", "Unpaid", "Delinquent", "MINTAX", "No Tax Due"].includes(processedStatus) ? "0.00" : amountPaid),
                      amount_due:
                        "$" + (["Due", "Unpaid", "Delinquent", "MINTAX", "No Tax Due"].includes(processedStatus) ? amountDue : "0.00"),
                      mailing_date: "N/A",
                      due_date: `03/31/${parseInt(yearStr) + 1}`,
                      delq_date: `04/01/${parseInt(yearStr) + 1}`,
                      paid_date: processedStatus === "PAID" ? paid_date : "-",
                      good_through_date: "",
                    });
                  }
                }
              });

              // Sort by year descending
              tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
            }
          } else {
            console.log(
              "Table #_ctl0_ContentPlaceHolder1_tblSummary not found"
            );
          }

          // --- COMMON FILTERING LOGIC START ---
          if (tax_history.length > 0) {
              // Sort by year descending (ensure sorted)
              tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

              // Identify unique years in descending order
              const uniqueYears = [...new Set(tax_history.map((h) => h.year))];
              const topYears = uniqueYears.slice(0, yearsRequested);

              // Filter for requested years OR unpaid/delinquent years
              tax_history = tax_history.filter((record) => {
                const isTopYear = topYears.includes(record.year);
                const statusLower = record.status.toLowerCase();
                const isUnpaid =
                  statusLower === "unpaid" ||
                  statusLower === "due" ||
                  statusLower === "delinquent";
                return isTopYear || isUnpaid;
              });
          }
          // --- COMMON FILTERING LOGIC END ---

          // Store tax_history in window for fallback use
          window.History = tax_history;

          // Check for delinquent annual taxes
          const currentDate = new Date("2025-09-15");
          const delinquentAnnual = tax_history.some(
            (record) =>
              record.status === "Delinquent" &&
              record.delq_date &&
              new Date(record.delq_date) < currentDate
          );

          // Generate notes based on payment status (updated for new statuses)
          const isQuarterly = tax_history.some(row => row.payment_type.includes("installment"));
          const paymentFrequency = isQuarterly ? "INSTALLMENTS" : "ANNUALLY";
          const dueDates = isQuarterly ? "06/30, 09/30, 12/31 & 03/31" : "03/31";
          let notes = "";

          if (tax_history.length === 0) {
            notes = `NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID ${paymentFrequency}, NORMALLY DUE DATES ARE ${dueDates}.`;
          } else {
            // Sort by year descending to identify the latest year
            const sortedHistory = [...tax_history].sort(
              (a, b) => parseInt(b.year) - parseInt(a.year)
            );
            const latestYear = sortedHistory[0]?.year || "UNKNOWN";

            // Filter history for the latest year to use in current year note
            const latestYearHistory = sortedHistory.filter(
              (h) => h.year === latestYear
            );

            // Check for any delinquent years (excluding latest year)
            const delinquentYears = [
              ...new Set(
                tax_history
                  .filter((h) => (h.status === "Delinquent" || h.status === "Unpaid" || h.status === "Due") && h.year !== latestYear)
                  .map((h) => h.year)
              ),
            ].sort();

            const priorNote =
              delinquentYears.length > 0
                ? `PRIOR YEARS (${delinquentYears.join(
                    ", "
                  )}) TAXES ARE DELINQUENT, `
                : `ALL PRIORS ARE PAID, `;

            if (isQuarterly) {
              const unpaidInstallments = latestYearHistory
                .filter(
                  (row) =>
                    (row.status === "Unpaid" ||
                      row.status === "Due" ||
                      row.status === "Delinquent") &&
                    row.installment
                )
                .map((row) => `${getOrdinal(row.installment)} INSTALLMENT`);
              const paidInstallments = latestYearHistory
                .filter((row) => row.status === "Paid" && row.installment)
                .map((row) => `${getOrdinal(row.installment)} INSTALLMENT`);

              if (unpaidInstallments.length > 0) {
                const paidText =
                  paidInstallments.length > 0
                    ? `${paidInstallments.join(" & ")} ARE PAID`
                    : "";
                const unpaidText =
                  unpaidInstallments.length > 0
                    ? `${unpaidInstallments.join(" & ")} ARE UNPAID`
                    : "";
                notes = `${priorNote}${latestYear} ${[paidText, unpaidText]
                  .filter(Boolean)
                  .join(
                    ", "
                  )}, NORMALLY TAXES ARE PAID IN INSTALLMENTS, NORMALLY DUE DATES ARE ${dueDates}.`;
              } else {
                notes = `${priorNote}${latestYear} ${paidInstallments.join(
                  " & "
                )} ARE PAID, NORMALLY TAXES ARE PAID IN INSTALLMENTS, NORMALLY DUE DATES ARE ${dueDates}.`;
              }
            } else {
              const latestStatus = latestYearHistory[0]?.status || "UNKNOWN";
              const latestStatusNote =
                latestStatus === "Unpaid" || latestStatus === "Due"
                  ? "DUE"
                  : latestStatus === "Delinquent"
                  ? "DELINQUENT"
                  : latestStatus.toUpperCase();
              notes = `${priorNote}${latestYear} TAXES ARE ${latestStatusNote}, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}.`;
            }
          }

          return {
            processed_date: new Date().toISOString(),
            order_number: "",
            borrower_name: "",
            owner_name: owner_name.length ? owner_name : ["N/A"],
            property_address:
              property_address !== "N/A" ? property_address : "N/A",
            parcel_number,
            land_value: "",
            improvements: "",
            total_assessed_value:
              total_assessed_value !== "N/A" ? total_assessed_value : "N/A",
            exemption: "",
            total_taxable_value:
              total_taxable_value !== "N/A" ? total_taxable_value : "N/A",
            taxing_authority:
              "Leon County Tax Collector, 1276 Metropolitan Blvd, Tallahassee, FL 32312, Ph: 850-606-4700",
            notes,
            delinquent: delinquentInstallments.length > 0 || delinquentAnnual ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
            tax_history,
          };
        }, account, yearsRequested);

        resolve(page_data);
      } catch (error) {
        console.error(`Error in lc_2: ${error.message}`);
        reject(new Error(`Failed to collect assessor data: ${error.message}`));
      }
    })();
  });
};

/* -------------------- Wrapper -------------------- */
const account_search = async (page, account, yearsRequested = 1) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await lc_1(page, account);
        const data2 = await lc_2(page, account, yearsRequested);
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
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid fetch_type. Must be 'html' or 'api'.",
      });
    }

    // Identify years requested based on client
    const yearsRequested = getOHCompanyYears(client);

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