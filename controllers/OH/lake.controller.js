// Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Puppeteer timeout configuration
const TIMEOUT_OPTIONS = { timeout: 90000 };

// Tax year due dates configuration
const TAX_DUE_DATES = {
  firstHalfDue: "02/25",
  firstHalfDelq: "03/10",
  secondHalfDue: "07/22",
  secondHalfDelq: "08/05"
};

// Date formatting utility
const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "N/A" || dateStr.trim() === "") return "N/A";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const monthMap = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04",
      MAY: "05", JUN: "06", JUL: "07", AUG: "08",
      SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const month = monthMap[parts[1].toUpperCase()];
    let year = parts[2];
    if (year.length === 2) {
      year = "20" + year;
    }
    if (month) {
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

// Helper function to check if all tax years are paid
const areAllYearsPaid = (taxHistory) => {
  return taxHistory.every(h => h.status === "Paid" || h.year === "Prior");
};

// Main scraping function
const lc_1 = (page, url, parcelId, clientType) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: TIMEOUT_OPTIONS.timeout,
      });

      await page.waitForSelector("input#inpParid", TIMEOUT_OPTIONS);
      await page.type("input#inpParid", parcelId);

      try {
        await Promise.all([
          page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 30000,
          }),
          page.click("button#btSearch")
        ]);
      } catch (error) {
        console.error("Method 1 failed, trying method 2:", error.message);
        await page.click("button#btSearch");
        await new Promise(resolve => setTimeout(resolve, 2000));
        const hasResults = await page.$("table#searchResults");
        if (!hasResults) {
          await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 30000,
          });
        }
      }

      await page.waitForSelector("table#searchResults", { timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await page.waitForSelector("table#searchResults tbody tr.SearchResults", { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

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
        return reject("No search results found");
      }

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
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const isDetailsPage = await page.evaluate(() => {
        return document.querySelector(".DataletHeaderTop") !== null;
      });

      if (!isDetailsPage) {
        const linkClicked = await page.evaluate(() => {
          const row = document.querySelector("table#searchResults tbody tr.SearchResults");
          if (row) {
            const link = row.querySelector("a");
            if (link) {
              link.click();
              return true;
            }
          }
          return false;
        });

        if (linkClicked) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        } else {
          throw new Error("Failed to navigate to property details page");
        }
      }

      await page.waitForSelector(".DataletHeaderTop", TIMEOUT_OPTIONS);

      const headerData = await page.evaluate(() => {
        const data = {};
        const headers = document.querySelectorAll(".DataletHeaderTop");
        headers.forEach((header) => {
          const text = header.textContent.trim();
          if (text.includes("Parcel Owner:")) {
            data.ownerName = text.replace("Parcel Owner:", "").trim();
          }
          if (text.includes("Parcel Address:")) {
            data.propertyAddress = text.replace("Parcel Address:", "").trim();
          }
        });
        return data;
      });

      const assessedValues = await page.evaluate(() => {
        const data = {
          land_value: "N/A",
          improvements: "N/A",
          total_assessed_value: "N/A"
        };

        let table = document.querySelector('table#Assessed\\ Value\\ \\(35\\%\\)');

        if (!table) {
          const datalet = document.querySelector('div[name="VALUES_ASSD"]');
          if (datalet) {
            table = datalet.querySelector('table');
          }
        }

        if (!table) {
          const allTables = document.querySelectorAll('table');
          for (const t of allTables) {
            const headerCell = t.querySelector('.DataletTitleColor');
            if (headerCell && headerCell.textContent.includes('Assessed Value')) {
              table = t.parentElement.querySelector('table:last-of-type');
              break;
            }
          }
        }

        if (table) {
          const rows = table.querySelectorAll('tr');
          for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 5) {
              const firstCellText = cells[0].textContent.trim();
              if (firstCellText.match(/^\d{4}$/) && !firstCellText.toLowerCase().includes('total')) {
                data.land_value = cells[2].textContent.trim();
                data.improvements = cells[3].textContent.trim();
                data.total_assessed_value = cells[4].textContent.trim();
                break;
              }
            }
          }
        }
        return data;
      });

      const taxSummaryClicked = await page.evaluate(() => {
        const links = document.querySelectorAll("li a");
        for (const link of links) {
          const text = link.textContent.toLowerCase();
          if (text.includes("tax summary") || text.includes("tax info")) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (!taxSummaryClicked) {
        return reject("Could not find Tax Summary tab");
      }

      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: TIMEOUT_OPTIONS.timeout,
      });

      await page.waitForSelector("table#Taxes\\ Owed", TIMEOUT_OPTIONS);

      const taxData = await page.evaluate(() => {
        const data = {};
        const rows = document.querySelectorAll("table#Taxes\\ Owed tr");
        rows.forEach((row) => {
          const heading = row.querySelector(".DataletSideHeading");
          const dataCell = row.querySelector(".DataletData");
          if (heading && dataCell) {
            const key = heading.textContent.trim();
            const value = dataCell.textContent.trim();
            if (key === "Tax Year") data.taxYear = value;
            if (key === "Current Net Taxes & Asmts (YEAR)") data.yearTotal = value;
            if (key === "Current Net Taxes & Asmts (1st HALF)") data.firstHalf = value;
            if (key === "Current Net Taxes & Asmts (2nd HALF)") data.secondHalf = value;
            if (key === "Total Penalties") data.penalties = value;
            if (key === "Total Interest") data.interest = value;
            if (key === "Delinquent Real Estate Taxes") data.delinquentRE = value;
            if (key === "Delinquent Special Assessment") data.delinquentSA = value;
            if (key === "Full Year Owed") data.fullYearOwed = value;
            if (key === "1st Half Owed") data.firstHalfOwed = value;
            if (key === "2nd Half Owed") data.secondHalfOwed = value;
            if (key === "Payments") data.payments = value;
          }
        });
        return data;
      });

      const paymentHistoryClicked = await page.evaluate(() => {
        const links = document.querySelectorAll("li a");
        for (const link of links) {
          const text = link.textContent.toLowerCase();
          if (text.includes("payment history") || text.includes("pay history")) {
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
          await page.waitForSelector("table#Payment\\ History", TIMEOUT_OPTIONS);
          paymentHistory = await page.evaluate(() => {
            const payments = [];
            const rows = document.querySelectorAll("table#Payment\\ History tr");
            rows.forEach((row, index) => {
              if (index === 0) return;
              const cells = row.querySelectorAll("td");
              if (cells.length >= 8) {
                const year = cells[1].textContent.trim();
                const effectiveDate = cells[3].textContent.trim();
                const amount = cells[7].textContent.trim();
                payments.push({
                  year: year,
                  effectiveDate: effectiveDate,
                  amount: amount,
                });
              }
            });
            return payments;
          });
        } catch (err) {
          console.error("Payment History error:", err);
        }
      }

      const taxYear = parseInt(taxData.taxYear);
      const yearsWantedCount = getOHCompanyYears(clientType);
      
      // Navigate back to Tax Summary first
      const backToTaxSummary = await page.evaluate(() => {
        const links = document.querySelectorAll("li a");
        for (const link of links) {
          const text = link.textContent.toLowerCase();
          if (text.includes("tax summary") || text.includes("tax info")) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (backToTaxSummary) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector("table#Taxes\\ Owed", TIMEOUT_OPTIONS);
      }

      const taxHistory = [];
      const paymentYear = taxYear + 1;
      
      // Process current year first to determine if we need historical years
      const firstHalfBase = parseCurrency(taxData.firstHalf);
      const secondHalfBase = parseCurrency(taxData.secondHalf);
      const firstHalfDue = parseCurrency(taxData.firstHalfOwed);
      const secondHalfDue = parseCurrency(taxData.secondHalfOwed);
      const fullYearBase = parseCurrency(taxData.yearTotal);
      const delinquentRE = parseCurrency(taxData.delinquentRE);
      const delinquentSA = parseCurrency(taxData.delinquentSA);
      const totalPriorDelinquent = delinquentRE + delinquentSA;
      
      let consumedPaymentIds = new Set();
      
      let allPayments = paymentHistory.map((p, index) => ({
        id: `pay_${index}`,
        year: p.year,
        date: formatDate(p.effectiveDate),
        amount: parseCurrency(p.amount),
        sortDate: new Date(formatDate(p.effectiveDate)).getTime()
      })).filter(p => p.amount > 0);

      allPayments.sort((a, b) => a.sortDate - b.sortDate);

      const firstHalfPaidAmount = Math.max(0, firstHalfBase - firstHalfDue);
      const secondHalfPaidAmount = Math.max(0, secondHalfBase - secondHalfDue);

      let firstHalfPaidDate = "";
      let secondHalfPaidDate = "";

      // Match payments for current tax year
      const yearPayments = allPayments.filter(p => p.year === taxData.taxYear);
      
      if (yearPayments.length === 1 && firstHalfPaidAmount > 0 && secondHalfPaidAmount > 0) {
        const p = yearPayments[0];
        if (Math.abs(p.amount - (firstHalfPaidAmount + secondHalfPaidAmount)) < 5.00) {
          firstHalfPaidDate = p.date;
          secondHalfPaidDate = p.date;
          consumedPaymentIds.add(p.id);
        }
      }

      if (secondHalfPaidAmount > 0 && !secondHalfPaidDate) {
        const match = yearPayments.find(p => !consumedPaymentIds.has(p.id) && Math.abs(p.amount - secondHalfPaidAmount) < 1.00);
        if (match) {
          secondHalfPaidDate = match.date;
          consumedPaymentIds.add(match.id);
        } else {
          const lastP = yearPayments.filter(p => !consumedPaymentIds.has(p.id)).pop();
          if (lastP) {
            secondHalfPaidDate = lastP.date;
            consumedPaymentIds.add(lastP.id);
          }
        }
      }

      if (firstHalfPaidAmount > 0 && !firstHalfPaidDate) {
        const match = yearPayments.find(p => !consumedPaymentIds.has(p.id) && Math.abs(p.amount - firstHalfPaidAmount) < 1.00);
        if (match) {
          firstHalfPaidDate = match.date;
          consumedPaymentIds.add(match.id);
        } else {
          const firstP = yearPayments.find(p => !consumedPaymentIds.has(p.id));
          if (firstP) {
            firstHalfPaidDate = firstP.date;
            consumedPaymentIds.add(firstP.id);
          }
        }
      }

      const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
      const firstDelqDate = `${TAX_DUE_DATES.firstHalfDelq}/${paymentYear}`;
      const secondDelqDate = `${TAX_DUE_DATES.secondHalfDelq}/${paymentYear}`;
      const isFirstDelq = new Date() >= new Date(firstDelqDate);
      const isSecondDelq = new Date() >= new Date(secondDelqDate);

      // Add current year to tax history
      if (fullYearBase > 0) {
        if (isAnnual) {
          let status = (firstHalfDue + secondHalfDue) > 0.01 ? (isFirstDelq ? "Delinquent" : "Due") : "Paid";
          taxHistory.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Annual",
            status: status,
            base_amount: formatCurrency(fullYearBase),
            amount_paid: formatCurrency(firstHalfPaidAmount + secondHalfPaidAmount),
            amount_due: status === "Paid" ? "$0.00" : formatCurrency(firstHalfDue + secondHalfDue),
            mailing_date: "N/A",
            due_date: `${TAX_DUE_DATES.firstHalfDue}/${paymentYear}`,
            delq_date: firstDelqDate,
            paid_date: firstHalfPaidDate || (status === "Paid" ? "N/A" : ""),
            good_through_date: ""
          });
        } else {
          let fStatus = firstHalfDue > 0.01 ? (isFirstDelq ? "Delinquent" : "Due") : "Paid";
          let sStatus = secondHalfDue > 0.01 ? (isSecondDelq ? "Delinquent" : "Due") : "Paid";

          taxHistory.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: fStatus,
            base_amount: formatCurrency(firstHalfBase),
            amount_paid: formatCurrency(firstHalfPaidAmount),
            amount_due: fStatus === "Paid" ? "$0.00" : formatCurrency(firstHalfDue),
            mailing_date: "N/A",
            due_date: `${TAX_DUE_DATES.firstHalfDue}/${paymentYear}`,
            delq_date: firstDelqDate,
            paid_date: firstHalfPaidDate || (fStatus === "Paid" ? "N/A" : ""),
            good_through_date: ""
          });

          taxHistory.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: sStatus,
            base_amount: formatCurrency(secondHalfBase),
            amount_paid: formatCurrency(secondHalfPaidAmount),
            amount_due: sStatus === "Paid" ? "$0.00" : formatCurrency(secondHalfDue),
            mailing_date: "N/A",
            due_date: `${TAX_DUE_DATES.secondHalfDue}/${paymentYear}`,
            delq_date: secondDelqDate,
            paid_date: secondHalfPaidDate || (sStatus === "Paid" ? "N/A" : ""),
            good_through_date: ""
          });
        }
      }

      // Check if current year is fully paid
      const currentYearFullyPaid = (firstHalfDue <= 0.01 && secondHalfDue <= 0.01);
      const hasPriorDelinquent = totalPriorDelinquent > 0.01;
      
      // Determine how many historical years to fetch based on client type
      let yearsToFetch = 0;
      
      // Identify client type clearly
      const clientStr = String(clientType || '').toLowerCase().trim();
      const isAccurateClient = yearsWantedCount >= 2 || clientStr.includes('accurate');
      
      if (isAccurateClient) {
        // Accurate client: 2 years minimum if paid, 3 years if unpaid
        yearsToFetch = (!currentYearFullyPaid || hasPriorDelinquent) ? 2 : 1;
      } else {
        // Normal client: 1 year only if paid, 2 years if unpaid
        yearsToFetch = (!currentYearFullyPaid || hasPriorDelinquent) ? 1 : 0;
      }
      
      // Fetch historical years if needed
      if (yearsToFetch > 0) {
        try {
          for (let i = 0; i < yearsToFetch; i++) {
            // Check for NavArrow link
            const arrowSelector = 'a.NavArrows[title="next page"]';
            const hasNavArrow = await page.evaluate((sel) => {
              const arrow = document.querySelector(sel);
              return !!arrow;
            }, arrowSelector);

            if (!hasNavArrow) {
              console.log(`No NavArrow found for year ${i + 1}, stopping historical fetch`);
              break;
            }

            // Click the NavArrow
            const arrowClicked = await page.evaluate((sel) => {
              const arrow = document.querySelector(sel);
              if (arrow) {
                arrow.click();
                return true;
              }
              return false;
            }, arrowSelector);

            if (!arrowClicked) {
              console.log("Failed to click NavArrow");
              break;
            }

            // Wait for navigation and ensure content is updated
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
              page.waitForFunction((oldYear) => {
                const yearCell = document.querySelector("table#Taxes\\ Owed tr .DataletData");
                return yearCell && yearCell.textContent.trim() !== oldYear;
              }, { timeout: 10000 }, taxData.taxYear)
            ]);
            
            await page.waitForSelector("table#Taxes\\ Owed", TIMEOUT_OPTIONS);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract tax data for this historical year
            const yrTaxData = await page.evaluate(() => {
              const data = {};
              const rows = document.querySelectorAll("table#Taxes\\ Owed tr");
              rows.forEach((row) => {
                const heading = row.querySelector(".DataletSideHeading");
                const dataCell = row.querySelector(".DataletData");
                if (heading && dataCell) {
                  const key = heading.textContent.trim();
                  const value = dataCell.textContent.trim();
                  if (key === "Tax Year") data.taxYear = value;
                  if (key === "Current Net Taxes & Asmts (YEAR)") data.yearTotal = value;
                  if (key === "Current Net Taxes & Asmts (1st HALF)") data.firstHalf = value;
                  if (key === "Current Net Taxes & Asmts (2nd HALF)") data.secondHalf = value;
                  if (key === "1st Half Owed") data.firstHalfOwed = value;
                  if (key === "2nd Half Owed") data.secondHalfOwed = value;
                }
              });
              return data;
            });

            if (yrTaxData.taxYear) {
              // Prevent adding the same year multiple times if navigation didn't work as expected
              if (taxHistory.some(h => h.year === parseInt(yrTaxData.taxYear))) {
                console.log(`Year ${yrTaxData.taxYear} already exists in history, skipping`);
                continue;
              }

              const yr = parseInt(yrTaxData.taxYear);
              const fBase = parseCurrency(yrTaxData.firstHalf);
              const sBase = parseCurrency(yrTaxData.secondHalf);
              const fOwed = parseCurrency(yrTaxData.firstHalfOwed);
              const sOwed = parseCurrency(yrTaxData.secondHalfOwed);

              const fPaid = Math.max(0, fBase - fOwed);
              const sPaid = Math.max(0, sBase - sOwed);
              const fStatus = fOwed > 0.01 ? "Due" : "Paid";
              const sStatus = sOwed > 0.01 ? "Due" : "Paid";

              // Try to find paid dates from payment history for this year
              const yrPayments = paymentHistory.filter(p => p.year === yrTaxData.taxYear);
              const fPaidDate = yrPayments.length > 0 ? formatDate(yrPayments[0].effectiveDate) : "N/A";
              const sPaidDate = yrPayments.length > 1 ? formatDate(yrPayments[1].effectiveDate) : fPaidDate;

              taxHistory.push({
                jurisdiction: "County",
                year: yr,
                payment_type: "Semi-Annual",
                status: fStatus,
                base_amount: formatCurrency(fBase),
                amount_paid: formatCurrency(fPaid),
                amount_due: formatCurrency(fOwed),
                mailing_date: "N/A",
                due_date: `${TAX_DUE_DATES.firstHalfDue}/${yr + 1}`,
                delq_date: `${TAX_DUE_DATES.firstHalfDelq}/${yr + 1}`,
                paid_date: fStatus === "Paid" ? fPaidDate : "",
                good_through_date: ""
              });

              taxHistory.push({
                jurisdiction: "County",
                year: yr,
                payment_type: "Semi-Annual",
                status: sStatus,
                base_amount: formatCurrency(sBase),
                amount_paid: formatCurrency(sPaid),
                amount_due: formatCurrency(sOwed),
                mailing_date: "N/A",
                due_date: `${TAX_DUE_DATES.secondHalfDue}/${yr + 1}`,
                delq_date: `${TAX_DUE_DATES.secondHalfDelq}/${yr + 1}`,
                paid_date: sStatus === "Paid" ? sPaidDate : "",
                good_through_date: ""
              });
            }
          }
        } catch (err) {
          console.error("Error fetching historical years:", err);
        }
      }

      // Sort tax history by year descending
      taxHistory.sort((a, b) => {
        if (a.year === "Prior") return 1;
        if (b.year === "Prior") return -1;
        return parseInt(b.year) - parseInt(a.year);
      });

      // Add prior delinquent entry if exists
      if (totalPriorDelinquent > 0.01) {
        taxHistory.push({
          jurisdiction: "County",
          year: "Prior",
          payment_type: "-",
          status: "Delinquent",
          base_amount: formatCurrency(totalPriorDelinquent),
          amount_paid: "$0.00",
          amount_due: formatCurrency(totalPriorDelinquent),
          mailing_date: "N/A",
          due_date: "N/A",
          delq_date: "N/A",
          paid_date: "N/A",
          good_through_date: ""
        });
      }

      const delinquentStatus = (totalPriorDelinquent > 0.01 || taxHistory.some(h => h.status === "Delinquent"))
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      let notes = "";
      const priorYearsNote = totalPriorDelinquent > 0.01 ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID";
      
      if (fullYearBase === 0) {
        notes = `${priorYearsNote}, CURRENT YEAR (${taxYear}) TAXES NOT YET ASSESSED, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${TAX_DUE_DATES.firstHalfDue} AND ${TAX_DUE_DATES.secondHalfDue}`;
      } else {
        const uniqueYears = [...new Set(taxHistory.filter(h => typeof h.year === 'number').map(h => h.year))].sort((a, b) => b - a);
        let yearNotes = [];
        
        uniqueYears.forEach(yr => {
          const yrItems = taxHistory.filter(h => h.year === yr && h.payment_type === "Semi-Annual");
          if (yrItems.length >= 2) {
            const fStatus = yrItems.find(h => h.due_date.includes(TAX_DUE_DATES.firstHalfDue))?.status.toUpperCase() || "N/A";
            const sStatus = yrItems.find(h => h.due_date.includes(TAX_DUE_DATES.secondHalfDue))?.status.toUpperCase() || "N/A";
            yearNotes.push(`${yr} TAXES: 1ST INSTALLMENT IS ${fStatus}, 2ND INSTALLMENT IS ${sStatus}`);
          } else {
            const yrItem = taxHistory.find(h => h.year === yr);
            if (yrItem) {
              yearNotes.push(`${yr} TAXES ARE ${yrItem.status.toUpperCase()}`);
            }
          }
        });
        
        notes = `${priorYearsNote}, ${yearNotes.join(", ")}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${TAX_DUE_DATES.firstHalfDue} AND ${TAX_DUE_DATES.secondHalfDue}`;
      }
      notes = notes.toUpperCase().trim();

      const data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: headerData.ownerName ? [headerData.ownerName] : [],
        property_address: headerData.propertyAddress || "",
        parcel_number: parcelId,
        land_value: assessedValues.land_value,
        improvements: assessedValues.improvements,
        total_assessed_value: assessedValues.total_assessed_value,
        exemption: "",
        total_taxable_value: "N/A",
        taxing_authority: "Lake County Treasurer, 105 Main St, Painesville, Ohio.",
        notes: notes,
        delinquent: delinquentStatus,
        tax_history: taxHistory,
      };

      resolve(data);
    } catch (error) {
      console.error("Error in extractPropertyData:", error);
      reject("Record Not Found: " + error.message);
    }
  });
};

// Wrapper function for account search
const accountSearch = (page, url, account, clientType) => {
  return new Promise(async (resolve, reject) => {
    try {
      lc_1(page, url, account, clientType)
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
    const url = `https://auditor.lakecountyohio.gov/search/commonsearch.aspx?mode=realprop`;
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