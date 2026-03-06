// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// Global timeout for waiting selectors
const timeout_option = {
  timeout: 90000
};

// Helper to format currency properly
const toCurrency = (value) => {
  const num = parseFloat(String(value).replace(/[$,]/g, "") || "0");
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
};

// Helper function – converts raw tax entries to current status (Paid / Due / Delinquent)
const calculateTaxStatus = (taxHistory, currentDate = new Date()) => {
  return taxHistory.map((item) => {
    if (item.status === "Paid") {
      return { ...item, status: "Paid", delinquent: "NONE" };
    }

    const dueParts = item.due_date ? item.due_date.split("/") : null;
    const delqParts = item.delq_date ? item.delq_date.split("/") : null;

    let dueDate = null;
    let delqDate = null;

    if (dueParts && dueParts.length === 3) {
      const [mm, dd, yyyy] = dueParts.map(Number);
      dueDate = new Date(yyyy, mm - 1, dd);
    }

    if (delqParts && delqParts.length === 3) {
      const [mm, dd, yyyy] = delqParts.map(Number);
      delqDate = new Date(yyyy, mm - 1, dd);
    }

    if (!delqDate || isNaN(delqDate.getTime())) {
      delqDate = new Date(dueDate);
      delqDate.setDate(delqDate.getDate() + 1);
    }

    if (delqDate > currentDate) {
      return { ...item, status: "Due", delinquent: "NONE" };
    } else {
      return { ...item, status: "Delinquent", delinquent: "YES" };
    }
  });
};

// Step 1 – Search by account number and get current year + total due amount
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://docs.oklahomacounty.org/treasurer/AccountNumberResults.asp?PropertyID=${account}`;
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });

      page.waitForSelector("table[width='640'] tbody tr", timeout_option)
        .then(() => {
          return page.evaluate(() => {
            const firstRow = document.querySelector("table[width='640'] tbody tr");
            if (!firstRow) return { error: true, message: "No Records Available" };
            const tds = firstRow.querySelectorAll("td");
            return {
              totalDue: tds[0]?.textContent.trim() ?? "N/A",
              year: tds[1]?.textContent.trim() ?? "N/A",
              yearLink: tds[1]?.querySelector("a")?.href ?? "",
              ownerName: tds[3]?.textContent.trim() ?? "N/A"
            };
          });
        })
        .then((data) => {
          if (data.error || !data.yearLink) {
            reject(new Error("No Tax Year Data Found"));
          } else {
            resolve(data);
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

// Step 2 – Go to current year bill page and extract owner, address, assessed values
const ac_2 = async (page, ac1_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!ac1_data.yearLink) {
        reject(new Error("No year link"));
        return;
      }

      const status = await page.goto(ac1_data.yearLink, { waitUntil: "domcontentloaded" });

      const today = new Date();
      const processed_date = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

      const datum = {
        processed_date,
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        parcel_number: account,
        land_value: "",
        improvements: "",
        total_assessed_value: "",
        exemption: "",
        total_taxable_value: "",
        taxing_authority:
          "Oklahoma County Treasurer, 320 Robert S Kerr Ave #307, Oklahoma City, OK 73102, Ph: 405-713-1300",
        notes: "",
        delinquent: "",
        tax_history: []
      };

      page.evaluate(() => {
        function getValueByLabel(labelText) {
          const tds = Array.from(document.querySelectorAll("#TABLE1 td table td"));
          const target = tds.find((td) => td.innerText.trim().includes(labelText));
          if (target && target.nextElementSibling) {
            return target.nextElementSibling.innerText.trim().replace(/[$,]/g, "");
          }
          return "0";
        }

        const ownerBlock = document.querySelector("#TABLE1 td")?.innerText.split("\n") || [];
        const owner = ownerBlock[0]?.trim() || "N/A";
        const address = ownerBlock.slice(1).map(line => line.trim()).filter(Boolean).join(" ") || "N/A";

        return {
          owner_name: [owner],
          property_address: address,
          land_value: getValueByLabel("Assessed Value Land") || "0",
          improvements: getValueByLabel("Assessed Value Improvements") || "0",
          total_assessed_value: getValueByLabel("Assessed Value") || "0",
          exemption: getValueByLabel("Exempt Amount") || "0",
          total_taxable_value: getValueByLabel("Net Value") || "0"
        };
      })
        .then((propertyData) => {
          propertyData.land_value = toCurrency(propertyData.land_value);
          propertyData.improvements = toCurrency(propertyData.improvements);
          propertyData.total_assessed_value = toCurrency(propertyData.total_assessed_value);
          propertyData.exemption = toCurrency(propertyData.exemption);
          propertyData.total_taxable_value = toCurrency(propertyData.total_taxable_value);

          Object.assign(datum, propertyData);

          if (ac1_data.totalDue === "0.00" || ac1_data.totalDue === "$0.00") {
            datum.notes = `ALL PRIORS ARE PAID, ${ac1_data.year} ANNUAL TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31.`;
            datum.delinquent = "NONE";
          } else {
            datum.notes = `TAXES DUE FOR ${ac1_data.year}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31.`;
            datum.delinquent = "YES";
          }

          resolve({
            data: datum,
            paid_status: ac1_data.totalDue,
            year: ac1_data.year
          });
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

// Handle case: Current year is fully PAID – extract payment details
const ac_paid = async (page, data, year) => {
  return new Promise(async (resolve, reject) => {
    try {
      page.waitForSelector("#TABLE1", timeout_option)
        .then(() => {
          return page.evaluate((year) => {
            const results = [];
            const baseInfo = {
              jurisdiction: "County",
              year,
              mailing_date: "N/A",
              good_through_date: "",
              payment_type: "",
              status: "Paid",
              base_amount: "",
              amount_paid: "",
              amount_due: "$0.00",
              paid_date: "",
              due_date: "",
              delq_date: ""
            };

            // Find base tax amount
            const rows = Array.from(document.querySelectorAll("#TABLE1 table tr"));
            let base_amount = "0";
            rows.forEach((r) => {
              const tds = r.querySelectorAll("td");
              if (!tds.length) return;
              const key = tds[0].innerText.trim();
              const val = tds[1]?.innerText.trim() || "";
              if (key.includes("TAX AMOUNT")) {
                base_amount = val.replace(/[$,]/g, "");
              }
            });

            const paymentsText = document.querySelector("#TABLE1 td[width='353']")?.innerText || "";
            const paymentLines = paymentsText.split("\n").filter((l) =>
              l.startsWith("P") && l.includes("$") && /\d{2}\/\d{2}\/\d{4}/.test(l)
            );

            if (paymentLines.length >= 2) {
              // Semi-annual payments
              const semiAmount = (parseFloat(base_amount) / 2).toFixed(2);
              paymentLines.forEach((line, idx) => {
                const parts = line.trim().split(/\s+/);
                const paid_date = parts[2] || "";
                const amt = parts[parts.length - 1] || "";
                results.push({
                  ...baseInfo,
                  payment_type: "Semi-Annual",
                  base_amount: `$${semiAmount}`,
                  amount_paid: amt.startsWith("$") ? amt : `$${amt}`,
                  paid_date,
                  due_date: idx === 0 ? `12/31/${year}` : `03/31/${parseInt(year) + 1}`,
                  delq_date: idx === 0 ? `01/01/${parseInt(year) + 1}` : `04/01/${parseInt(year) + 1}`
                });
              });
            } else if (paymentLines.length === 1) {
              // Annual payment
              const parts = paymentLines[0].trim().split(/\s+/);
              const paid_date = parts[2] || "";
              const amt = parts[parts.length - 1] || "";
              results.push({
                ...baseInfo,
                payment_type: "Annual",
                base_amount: `$${parseFloat(base_amount).toFixed(2)}`,
                amount_paid: amt.startsWith("$") ? amt : `$${amt}`,
                paid_date,
                due_date: `12/31/${year}`,
                delq_date: `01/01/${parseInt(year) + 1}`
              });
            }
            return { results, paymentLinesCount: paymentLines.length };
          }, year);
        })
        .then((tax_history) => {
          data.tax_history = calculateTaxStatus(tax_history.results);

          if (tax_history.paymentLinesCount >= 2) {
            data.notes = `ALL PRIORS ARE PAID, ${year} 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID, NORMAL DUE DATES ARE 12/31.`;
            data.delinquent = data.tax_history.some(entry => entry.delinquent === "YES") ? "YES" : "NONE";
          } else {
            data.notes = `ALL PRIORS ARE PAID, ${year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31.`;
            data.delinquent = data.tax_history.some(entry => entry.delinquent === "YES") ? "YES" : "NONE";
          }

          resolve(data);
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

// Handle case: Taxes are UNPAID – scrape all delinquent years
const ac_unpaid = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://docs.oklahomacounty.org/treasurer/AccountNumberResults.asp?PropertyId=${account}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.waitForSelector("table[width='640'] tbody tr", timeout_option);

      const rawRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table[width='640'] tbody tr"));
        const results = [];
        for (const row of rows) {
          const tds = row.querySelectorAll("td");
          const totalDue = tds[0]?.textContent.trim() || "";
          if (totalDue === "$0.00" || totalDue === "0.00") break;

          const year = tds[1]?.textContent.trim();
          const yearLink = tds[1]?.querySelector("a")?.href || "";

          if (year && yearLink) {
            results.push({ 
              year, 
              yearLink, 
              totalDue: totalDue.startsWith("$") ? totalDue : `$${totalDue}` 
            });
          }
        }
        return results;
      });

      if (rawRows.length === 0) {
        data.tax_history = [];
        data.delinquent = "NONE";
        data.notes = "No unpaid tax years found.";
        return resolve(data);
      }

      const tax_history = [];

      for (const row of rawRows) {
        await page.goto(row.yearLink, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#TABLE1", timeout_option);

        const details = await page.evaluate((year, totalDue) => {
          // Find base tax amount
          let base_amount = "0";
          const rows = Array.from(document.querySelectorAll("#TABLE1 table tr"));
          rows.forEach(r => {
            const tds = r.querySelectorAll("td");
            if (tds.length >= 2 && tds[0].innerText.includes("TAX AMOUNT")) {
              base_amount = tds[1].innerText.trim().replace(/[$,]/g, "");
            }
          });

          const paymentsText = document.querySelector("#TABLE1 td[width='353']")?.innerText || "";
          const paymentLines = paymentsText.split("\n")
            .map(l => l.trim())
            .filter(l => l.startsWith("P") && /\d{2}\/\d{2}\/\d{4}/.test(l));

          // No payments → simple annual unpaid
          if (paymentLines.length === 0) {
            return [{
              jurisdiction: "County",
              year,
              mailing_date: "N/A",
              good_through_date: "",
              payment_type: "Annual",
              status: "Due",
              base_amount: `$${parseFloat(base_amount).toFixed(2)}`,
              amount_paid: "$0.00",
              amount_due: totalDue,
              paid_date: "",
              due_date: `12/31/${year}`,
              delq_date: `01/01/${parseInt(year) + 1}`
            }];
          }

          // Has payments → check if partial or full
          const entries = [];
          const semiAmount = (parseFloat(base_amount) / 2).toFixed(2);
          
          const isFirstHalf = (line) => {
            const date = line.split(/\s+/)[2] || "";
            const month = parseInt(date.split("/")[0]);
            return month <= 6;
          };

          paymentLines.forEach((line, idx) => {
            const parts = line.split(/\s+/);
            const paidDate = parts[2] || "";
            const paidAmt = parts[parts.length - 1];

            const isFirst = idx === 0 || isFirstHalf(line);
            entries.push({
              jurisdiction: "County",
              year,
              mailing_date: "N/A",
              good_through_date: "",
              payment_type: "Semi-Annual",
              status: "Paid",
              base_amount: `$${semiAmount}`,
              amount_paid: paidAmt.startsWith("$") ? paidAmt : `$${paidAmt}`,
              amount_due: "$0.00",
              paid_date: paidDate,
              due_date: isFirst ? `12/31/${year}` : `03/31/${parseInt(year) + 1}`,
              delq_date: isFirst ? `01/01/${parseInt(year) + 1}` : `04/01/${parseInt(year) + 1}`
            });
          });

          // Add missing half if only one payment
          if (entries.length === 1) {
            const existing = entries[0];
            const isFirst = existing.due_date.includes("12/31");
            entries.push({
              ...existing,
              status: "Due",
              amount_paid: "$0.00",
              amount_due: totalDue,
              paid_date: "",
              due_date: isFirst ? `03/31/${parseInt(year) + 1}` : `12/31/${year}`,
              delq_date: isFirst ? `04/01/${parseInt(year) + 1}` : `01/01/${parseInt(year) + 1}`
            });
          }

          return entries;
        }, row.year, row.totalDue);

        tax_history.push(...details);
      }

      const allEntries = tax_history;
      const updatedEntries = calculateTaxStatus(allEntries);
      data.tax_history = updatedEntries.sort((a, b) => parseInt(a.year) - parseInt(b.year));

      const years = [...new Set(updatedEntries.map(e => e.year))];
      const maxYear = Math.max(...years.map(y => parseInt(y)));

      const priorYearsUnpaid = updatedEntries
        .filter(e => parseInt(e.year) < maxYear)
        .some(e => e.status !== "Paid" && parseFloat(e.amount_due.replace(/[$,]/g, "")) > 0);

      const currentYearEntries = updatedEntries.filter(e => parseInt(e.year) === maxYear);

      data.delinquent = priorYearsUnpaid ? "YES" : "NONE";

      if (priorYearsUnpaid) {
        const delqYears = years.filter(y => parseInt(y) < maxYear).join(", ");
        data.notes = `PRIOR YEAR(S) TAXES ARE DELINQUENT, ${currentYearEntries[0].year} ANNUAL TAXES ARE ${currentYearEntries[0].status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31.`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      } else {
        if (currentYearEntries.length === 1 && currentYearEntries[0].payment_type === "Annual") {
          data.notes = `ALL PRIOR YEARS PAID, ${maxYear} ANNUAL TAXES IS ${currentYearEntries[0].status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/31.`;
          if (currentYearEntries[0].status === "Delinquent") {
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
          }
        } else {
          const first = currentYearEntries.find(e => e.due_date.includes("12/31")) || currentYearEntries[0];
          const second = currentYearEntries.find(e => e.due_date.includes("03/31")) || currentYearEntries[1];
          const firstStatus = first?.status === "Paid" ? "PAID" : "DUE";
          const secondStatus = second?.status === "Paid" ? "PAID" : "DUE";
          data.notes = `ALL PRIOR YEARS PAID, ${maxYear} 1ST INSTALLMENT IS  ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, , NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATES ARE 12/31 & 3/31.`;
        }
      }

      resolve(data);

    } catch (error) {
      console.log("ac_unpaid error:", error);
      reject(error);
    }
  });
};

// Main function – decides whether taxes are paid or unpaid
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
        .then((ac1_data) => {
          ac_2(page, ac1_data, account)
            .then((data2) => {
              const paidStatus = String(data2.paid_status).replace(/[$,]/g, "").trim();
              if (paidStatus === "0.00") {
                ac_paid(page, data2.data, data2.year)
                  .then((data3) => {
                    resolve(data3);
                  })
                  .catch((error) => {
                    console.log(error);
                    reject(error);
                  });
              } else {
                ac_unpaid(page, data2.data, account)
                  .then((data3) => {
                    resolve(data3);
                  })
                  .catch((error) => {
                    console.log(error);
                    reject(error);
                  });
              }
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

// Express route – main entry point
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (account.trim() == '' || !account) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    
    if (!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
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

module.exports = { search };