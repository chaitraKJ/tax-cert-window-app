//Author:Dhanush

// Import browser launch utility
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// Puppeteer timeout options
const timeout_option = {
  timeout: 90000
};

// Format number/string into USD format
const formatDollar = (v) => {
  const cleaned = (v || "0").toString().replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "$0.00";
};

// Convert MM/DD/YYYY string → JS Date object
const toDate = (str) => {
  if (!str) return null;
  const [m, d, y] = str.split("/").map(Number);
  const dObj = new Date(y, m - 1, d);
  return isNaN(dObj.getTime()) ? null : dObj;
};


//Basic parcel existence check
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Load main property page
      const url = `https://www.to.pima.gov/propertyInquiry/?stateCode=${account}`;
      await page.goto(url, { waitUntil: "domcontentloaded",timeout_option });
      // CHECK IF PARCEL IS INVALID
      const isInvalidParcel = await page.evaluate(() => {
        const divs = document.querySelector("#warning_content");
        return divs?.textContent?.includes("RECORD NOT FOUND");
      });
      if (isInvalidParcel) {
        return reject({
          error: true,
          message: `Parcel is invalid: No records found in the database.`
        });
      }
      
      const parcelEl=await page.waitForSelector("#propertyDetails", timeout_option);
      if (!parcelEl) {
        reject(new Error("Record does not exist or parcel number is invalid"));
      } else {
        resolve(true);
      }
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Fetch current year + balance
const ac_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Extract current tax year from UI buttons
      const currentYear = await page.evaluate(() => {
        const btn = document.querySelector('button.propInqData span.pull-left');
        if (btn) {
          const year = parseInt(btn.textContent.trim());
          if (!isNaN(year)) return year;
        }

        // Fallback: find max year among all buttons
        const years = Array.from(document.querySelectorAll('button.propInqData span.pull-left'))
          .map(el => parseInt(el.textContent.trim()))
          .filter(y => !isNaN(y));

        return years.length > 0 ? Math.max(...years) : new Date().getFullYear();
      });

      // Extract current year balance
      const balance = await page.evaluate(() => {
        const el = document.querySelector("#lblBalDue");
        return el ? el.textContent.trim() : "$0.00";
      });

      const balanceNum = parseFloat(balance.replace(/[^\d.-]/g, "")) || 0;

      resolve({
        currentYear,
        balance: formatDollar(balance),
        balanceNum
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Get assessed values for given year
const ac_3 = async (page, account, currentYear) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Load tax statement page for selected year
      const stmtUrl = `https://www.to.pima.gov/taxStatement/?stateCode=${account}&taxYear=${currentYear}`;
      await page.goto(stmtUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(".card-body", timeout_option);

      // Extract assessed values (Real + Personal)
      const assessedValues = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        // Find table containing assessed value text
        const table = Array.from(document.querySelectorAll("table"))
          .find(t => t.innerHTML.includes("TAXABLE NET<br>ASSESSED VALUE"));

        if (!table) return { real: "0", personal: "0" };

        const rows = table.querySelectorAll("tbody tr");
        const real = clean(rows[0]?.querySelector("td:nth-child(2)")?.textContent) || "0";
        const personal = clean(rows[1]?.querySelector("td:nth-child(2)")?.textContent) || "0";

        return { real, personal };
      });

      // Convert to number
      const totalAssessed = parseInt(assessedValues.real.replace(/,/g, "")) || 0;

      resolve({
        total_assessed_value: totalAssessed.toLocaleString(),
        total_taxable_value: totalAssessed.toLocaleString(),
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Basic property info (owner, address, legal)
const ac_4 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Reload property tax page
      await page.goto(`https://www.to.pima.gov/propertyInquiry/?stateCode=${account}`, {
        waitUntil: "domcontentloaded"
      });

      // Extract key card values
      const details = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        // Helper: find card by heading text
        const findCard = (title) => {
          const titles = Array.from(document.querySelectorAll(".card-title.text-primary"));
          return titles.find((el) => el.textContent.includes(title));
        };

        const result = {
          taxpayer_name: "",
          taxpayer_address: [],
          property_address: "",
          legal_description: "",
        };

        // Taxpayer card
        const taxCard = findCard("TAXPAYER NAME");
        if (taxCard) {
          const p = taxCard.parentElement.querySelector("p");
          if (p) {
            const lines = p.innerHTML.split("<br>").map(clean).filter(Boolean);
            result.taxpayer_name = lines[0] || "";
            result.taxpayer_address = lines.slice(1);
          }
        }

        // Property address card
        const addrCard = findCard("PROPERTY ADDRESS");
        if (addrCard) {
          const p = addrCard.parentElement.querySelector("p");
          if (p) result.property_address = clean(p.textContent);
        }

        // Legal description card
        const legalCard = findCard("LEGAL DESCRIPTION");
        if (legalCard) {
          const p = legalCard.parentElement.querySelector("p");
          if (p) result.legal_description = clean(p.textContent);
        }

        return result;
      });

      resolve(details);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

//Fetch year-by-year payment history
const ac_5 = async (page, currentYear) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Extract history of all years
      const allYearsData = await page.evaluate(() => {
        const history = {};

        // Loop all year buttons that toggle yearly data
        document.querySelectorAll('.propInqData[onclick*="toggleYear"]').forEach(btn => {
          const yrText = btn.querySelector("h5 span.pull-left")?.textContent.trim();
          const year = parseInt(yrText);
          if (!year) return;

          // Find corresponding expandable panel
          const panelId = btn.getAttribute("data-target");
          const panel = document.querySelector(panelId);
          if (!panel) return;

          // Extract rows from summary table
          const table = panel.querySelector(".tblYearlySummary");
          const rows = table ? Array.from(table.querySelectorAll("tbody tr")).map(tr => {
            const td = tr.querySelectorAll("td");
            if (td.length < 5) return null;

            const paymentDateRaw = td[0].textContent.trim();
            const paymentDate = paymentDateRaw && !["", "N/A"].includes(paymentDateRaw) ? paymentDateRaw : null;

            const due = parseFloat(td[2].textContent.replace(/[^\d.-]/g, "")) || 0;
            const paid = parseFloat(td[3].textContent.replace(/[^\d.-]/g, "")) || 0;

            return { due, paid, paymentDate, status: paid >= due ? "Paid" : "Due" };
          }).filter(Boolean) : [];

          // Extract total remaining footer
          let totalRemaining = 0;
          const allTables = panel.querySelectorAll('table');
          allTables.forEach(tbl => {
            const footer = tbl.querySelector('tfoot.table-active');
            if (footer) {
              const cells = footer.querySelectorAll('th');
              cells.forEach(cell => {
                if (cell.textContent.includes('TOTAL REMAINING')) {
                  const amountCell = cell.nextElementSibling;
                  if (amountCell) {
                    const link = amountCell.querySelector('a');
                    if (link) {
                      const amountText = link.textContent.replace(/[^\d.-]/g, "");
                      totalRemaining = parseFloat(amountText) || 0;
                    }
                  }
                }
              });
            }
          });

          history[year] = { rows, totalRemaining };
        });

        return history;
      });

      resolve(allYearsData);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};


//Build final merged data object

const ac_6 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Build processed date
      const now = new Date();
      const processed_date = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

      // Current year + payment history
      const currentYear = main_data.balanceData.currentYear;
      const allYearsData = main_data.historyData;

      // Check prior unpaid taxes
      let hasPriorUnpaid = false;
      const delinquentYears = [];

      for (const yr in allYearsData) {
        const year = parseInt(yr);
        if (year >= currentYear) continue;
        if (allYearsData[yr].totalRemaining > 0) {
          hasPriorUnpaid = true;
          delinquentYears.push(year);
        }
      }

      // Current year rows
      const currentYearData = allYearsData[currentYear]?.rows || [];
      const isAnnual = currentYearData.length <= 1;

      const taxHistory = [];
      let hasDue = false;

      // Annual version
      if (isAnnual) {
        const r = currentYearData[0] || { due: 0, paid: 0, paymentDate: null, status: "Due" };
        const status = r.status;
        if (status === "Due") hasDue = true;

        taxHistory.push({
          jurisdiction: "County",
          year: currentYear.toString(),
          installment: "Annual",
          mailing_date: "N/A",
          good_through_date: "",
          payment_type: "Annual",
          status,
          base_amount: formatDollar(r.due),
          amount_paid: formatDollar(r.paid),
          amount_due: formatDollar(r.due - r.paid),
          interest_paid: "$0.00",
          total_paid: formatDollar(r.paid),
          paid_date: r.paymentDate || (r.paid > 0 ? "Paid" : "-"),
          due_date: `12/31/${currentYear}`,
          delq_date: `01/01/${currentYear + 1}`,
        });
      }

      // Semi-annual version
      else {
        currentYearData.forEach((r, idx) => {
          const isFirst = idx === 0;
          const installment = isFirst ? "1" : "2";

          const dueDate = isFirst ? `10/01/${currentYear}` : `03/02/${currentYear + 1}`;
          const delqDate = isFirst ? `11/01/${currentYear}` : `05/01/${currentYear + 1}`;

          const status = r.status;
          if (status === "Due") hasDue = true;

          taxHistory.push({
            jurisdiction: "County",
            year: currentYear.toString(),
            installment,
            mailing_date: "N/A",
            good_through_date: "",
            payment_type: "Semi-Annual",
            status,
            base_amount: formatDollar(r.due),
            amount_paid: formatDollar(r.paid),
            amount_due: formatDollar(r.due - r.paid),
            interest_paid: "$0.00",
            total_paid: formatDollar(r.paid),
            paid_date: r.paymentDate || (r.paid > 0 ? "Paid" : "-"),
            due_date: dueDate,
            delq_date: delqDate,
          });
        });
      }

      // Check delinquency by cutoff time
      const cutoff = new Date(now);
      cutoff.setHours(17, 0, 0, 0);

      // Apply delinquency logic
      const enriched = taxHistory
        .map((item) => {
          if (item.status === "Paid") return { ...item, delinquent: "NONE" };

          const due = toDate(item.due_date);
          const delq = toDate(item.delq_date);

          if (!due) return { ...item, status: "Due", delinquent: "NONE" };

          const isTodayDue = due.toDateString() === now.toDateString();
          const pastCutoff = isTodayDue && now > cutoff;

          if (pastCutoff || (delq && now > delq)) {
            return { ...item, status: "Delinquent", delinquent: "YES" };
          }

          return { ...item, status: "Due", delinquent: "NONE" };
        })
        .sort((a, b) => {
          if (a.installment === "Annual") return -1;
          return a.installment - b.installment;
        });

      // Build notes
      let currentParts = enriched.map(i => {
        return i.installment === "Annual"
          ? i.status.toUpperCase()
          : `${i.installment === "1" ? "1ST" : "2ND"} INSTALLMENT ${i.status.toUpperCase()}`;
      });

      let notes = hasPriorUnpaid
        ? `PRIOR TAXES ARE DELINQUENT FOR YEARS: ${delinquentYears.sort().join(", ")}. `
        : `ALL PRIOR TAXES ARE PAID. `;

      notes += `${currentYear}: ${currentParts.join(", ")}. `;
      notes += isAnnual
        ? "TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 12/31."
        : "NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 10/01 AND 03/02.";

      // Build final output object
      const finalDatum = {
        processed_date,
        order_number: "",
        borrower_name: "",
        parcel_number: account,
        owner_name: main_data.details.taxpayer_name ? [main_data.details.taxpayer_name] : [],
        property_address: main_data.details.property_address || "",
        land_value: "-",
        improvements: "-",
        total_assessed_value: "$" + main_data.assessedData.total_assessed_value,
        exemption: "-",
        total_taxable_value: "$" + main_data.assessedData.total_taxable_value,
        taxing_authority: "Pima County Treasurer, 115 N Church Ave, Tucson, AZ 85701, Ph: (520) 724-8341",
        notes,
        delinquent:
          hasPriorUnpaid || enriched.some(i => i.delinquent === "YES")
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE",
        tax_history: enriched,
      };

      resolve(finalDatum);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};


//Wrapper to chain all AC functions
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1
      ac_1(page, account)
        .then((data) => {

          // Step 2
          ac_2(page, account)
            .then((data1) => {

              // Step 3
              ac_3(page, account, data1.currentYear)
                .then((data2) => {

                  // Step 4
                  ac_4(page, account)
                    .then((data3) => {

                      // Step 5
                      ac_5(page, data1.currentYear)
                        .then((data4) => {

                          // Combine all data
                          const main_data = {
                            balanceData: data1,
                            assessedData: data2,
                            details: data3,
                            historyData: data4
                          };

                          // Step 6 (final builder)
                          ac_6(page, main_data, account)
                            .then((data5) => {
                              resolve(data5);
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


// Main Express controller
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    if(account.trim()==''||!account){
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    // Basic access validation
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    // Launch Puppeteer browser
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
    );

    page.setDefaultNavigationTimeout(90000);

    // Block images/styles/fonts for faster scraping
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Render HTML version
    if (fetch_type == "html") {
      account_search(page, account)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error)
          res.status(200).render('error_data', {
            error: true,
            message: error.message
          });
        })
        .finally(async () => {
          await context.close();
        });
    }

    // JSON API version
    else if (fetch_type == "api") {
      account_search(page, account)
        .then((data) => {
          res.status(200).json({ result: data });
        })
        .catch((error) => {
          console.log(error)
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
    } else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
};

module.exports = { search };