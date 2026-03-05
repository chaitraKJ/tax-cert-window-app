//Authot:Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };


// Check if a date is delinquent (past due)
const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
};

//COUNTY CONFIG 
const COUNTY = {
  churchill: {
    baseUrl: "https://churchillnv.devnetwedge.com",
    taxing_authority: "Churchill County Treasurer, 155 N Taylor St Suite 110, Fallon, NV 89406, Ph: 775-423-6028",
  },
  nye: {
    baseUrl: "https://nyenv.devnetwedge.com",
    taxing_authority: "Nye County Treasurer, 101 Radar Rd, P.O. Box 473, Tonopah, NV 89049-0473, Ph: 775 482-8147",
  },
  carson_city: {
    baseUrl: "https://carsoncitynv.devnetwedge.com",
    taxing_authority: "Carson City Treasurer, 885 E Musser St #1025, Carson City, NV 89701, Ph: 775-887-2130",
  },
};

// Navigate to search page and search for parcel
const ac_1 = async (page, account, cfg) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `${cfg.baseUrl}`;

      // Navigate to the main page
      await page.goto(url, { waitUntil: "domcontentloaded" });
      
      // Wait for search input field
      await page.waitForSelector("#parcel-search-property-key", timeout_option);
      
      // Fill in the parcel number
      await page.locator("#parcel-search-property-key").fill(account);

      // Click search button and wait for navigation
      await page.waitForSelector('.flex button[type="submit"]', timeout_option);
      
      await Promise.all([
        page.locator('.flex button[type="submit"]').click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" })
      ]);
     

      // Check if we got results or error page
      const noRecord = await page.evaluate(() => {
        const txt = document.body.textContent;
        return txt.includes("No Results Found") || txt.includes("Error");
      });

      if (noRecord) {
        reject(new Error("No Record Found"));
      } else {
        // Verify we're on the property details page
        const hasPropertyData = await page.evaluate(() => {
          return document.querySelector("#property-page") !== null || 
                 document.querySelector("#Names1") !== null;
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

//parcel number information
const ac_2 = async (page, account, cfg) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("#Assessments1", timeout_option);

      const page_data = await page.evaluate((cfg) => {

        const datum = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "",
          exemption: "0",
          total_taxable_value: "",
          taxing_authority: cfg.taxing_authority,
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

       

        //OWNER NAMES
        document.querySelectorAll('#Names1 .border.p-2.rounded').forEach((el, i) => {
          if (i < 2) {
            const name = el.querySelector('.md\\:w-2\\/3')?.textContent?.trim();
            if (name) datum.owner_name.push(name);
          }
        });

        // ADDRESS 
        datum.property_address =
          document.querySelectorAll("#Overview1 div")[26]?.textContent?.trim() || "N/A";

        //  MAIN COMBINED TABLE
        const table = document.querySelector("#Assessments1 table");
        if (!table) return null;

        const rows = Array.from(table.querySelectorAll("tbody tr"));

        let mode = "taxable"; 
        rows.forEach((row) => {
          const tds = row.querySelectorAll("td");

          // Divider row switches mode
          if (tds.length === 1 && tds[0].classList.contains("bg-wedge-panel-heading-bg")) {
            mode = "assessed";
            return;
          }

          const label = (tds[0]?.textContent || "").trim().toLowerCase();

          // TAXABLE VALUE SECTION
          if (mode === "taxable") {
            if (label === "total") {
              datum.land_value = tds[1]?.textContent.trim();
              datum.improvements = tds[2]?.textContent.trim();
              datum.total_taxable_value =tds[4]?.textContent.trim();
            }

            if (label === "exempt") {
              datum.exemption = tds[4]?.textContent.trim();
            }
          }

          //  ASSESSED VALUE SECTION 
          if (mode === "assessed") {
            if (label === "total") {
              datum.total_assessed_value =tds[4]?.textContent.trim();
            }
          }
        });

        return datum;
      }, cfg);

      if (!page_data) {
        reject(new Error("Failed to parse assessments"));
        return;
      }

    //  FORMAT CURRENCY 
    //   const fmt = (v) => {
    //     if (!v || v === "0") return "$0.00";
    //     return Number(v).toLocaleString("en-US", {
    //       style: "currency",
    //       currency: "USD",
    //     });
    //   };

      page_data.land_value = "$"+page_data.land_value;
      page_data.improvements = "$"+page_data.improvements;
      page_data.exemption = "$"+page_data.exemption;
      page_data.total_taxable_value = "$"+page_data.total_taxable_value;
      page_data.total_assessed_value = "$"+page_data.total_assessed_value;

      page_data.parcel_number = account;

      resolve(page_data);

    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};


// Extract payment history for all years
const ac_3 = async (page, data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Wait for payment history section
      await page.waitForSelector("#PaymentHistory1", timeout_option);

      // Expand all year rows to see installment details
      await page.evaluate(() => {
        const expandButtons = document.querySelectorAll('#PaymentHistory1 .row-toggle button');
        expandButtons.forEach((btn) => btn.click());
      });

      await page.waitForSelector('#PaymentHistory1 [data-subrow] .panel.panel-info', timeout_option);

      // Expand all installment panels to see payment details
      await page.evaluate(() => {
        const installmentButtons = document.querySelectorAll(
          '#PaymentHistory1 [data-subrow] .panel-toggle-button'
        );
        installmentButtons.forEach((btn) => btn.click());
      });

      
      await page.waitForSelector('#PaymentHistory1 .panel-body table tbody tr', timeout_option);

      // Extract all years data from the page
      const allYearsData = await page.evaluate(() => {
        const yearsMap = {};
        
        // Get all main year rows
        const mainRows = document.querySelectorAll(
          '#PaymentHistory1 > .panel-body > .overflow-auto > table > tbody > tr.text-center'
        );

        mainRows.forEach((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 5) return;

          // Extract year from text like "Tax Year (2024 - 2025)"
          const yearMatch = cells[1].textContent.trim().match(/\((\d{4})\s*-\s*(\d{4})\)/);
          const year = yearMatch ? yearMatch[1] : null;
          if (!year) return;

          // Store year summary data
          yearsMap[year] = {
            year: parseInt(year),
            total_due: cells[2].textContent.trim(),
            total_paid: cells[3].textContent.trim(),
            total_unpaid: cells[4].textContent.trim(),
            status: cells[4].textContent.trim() === "$0.00" ? "Paid" : "Unpaid",
            installments: [],
          };

          // Get the sub-row containing installment details
          const subRow = row.nextElementSibling;
          if (!subRow?.hasAttribute("data-subrow")) return;

          // Process each installment panel
          subRow.querySelectorAll('.panel.panel-info').forEach((panel) => {
            const header = panel.querySelector('.panel-heading h2')?.textContent;
            const instMatch = header?.match(/Installment (\d+)/);
            const instNum = instMatch ? instMatch[1] : null;
            if (!instNum) return;

            const installment = {
              installment_number: instNum,
              due_date: "",
              tax_billed: "",
              cost_billed: "",
              penalty_interest: "",
              total_due: "",
              total_paid: "",
              total_unpaid: "",
              status: "Unknown",
              payments: [],
            };

            // Extract installment detail table data
            const detailTable = panel.querySelector('.panel-body > .overflow-auto > table');
            if (detailTable) {
              const detailRow = detailTable.querySelector('tbody tr.text-center');
              if (detailRow) {
                const detailCells = detailRow.querySelectorAll('td');
                if (detailCells.length >= 7) {
                  installment.due_date = detailCells[0].textContent.trim();
                  installment.tax_billed = detailCells[1].textContent.trim();
                  installment.cost_billed = detailCells[2].textContent.trim();
                  installment.penalty_interest = detailCells[3].textContent.trim();
                  installment.total_due = detailCells[4].textContent.trim();
                  installment.total_paid = detailCells[5].textContent.trim();
                  installment.total_unpaid = detailCells[6].textContent.trim();

                  // Determine installment status
                  if (installment.total_unpaid === "$0.00") {
                    installment.status = "Paid";
                  } else if (installment.due_date) {
                    const dueDate = new Date(installment.due_date);
                    installment.status = new Date() > dueDate ? "Delinquent" : "Due";
                  }
                }
              }
            }

            // Extract payment records for this installment
            const paymentSection = panel.querySelector('[data-toggle-section]');
            if (paymentSection) {
              const paymentTable = paymentSection.querySelector('table');
              if (paymentTable) {
                paymentTable.querySelectorAll('tbody tr').forEach((payRow) => {
                  const payCells = payRow.querySelectorAll('td');
                  if (payCells.length >= 3) {
                    installment.payments.push({
                      paid_by: payCells[0].textContent.trim(),
                      receipt_date: payCells[1].textContent.trim(),
                      amount_paid: payCells[2].textContent.trim(),
                    });
                  }
                });
              }
            }

            yearsMap[year].installments.push(installment);
          });
        });

        return yearsMap;
      });

      resolve({ data, allYearsData });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Format extracted data into final structure with proper notes
const ac_4 = async (main_data, account) => {
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
      const hasPriorUnpaid = priorYears.some((yr) => allYearsData[yr].total_unpaid !== "$0.00");
      
      let yearsToProcess = [];
      
      if (hasPriorUnpaid) {
        // If prior years have unpaid amounts, include all unpaid years
        yearsToProcess = years.filter((yr) => allYearsData[yr].total_unpaid !== "$0.00");
        // Always include current year
        if (!yearsToProcess.includes(currentYear)) {
          yearsToProcess.push(currentYear);
        }
        yearsToProcess.sort((a, b) => b - a);
      } else {
        // If all priors are paid, only include current year
        yearsToProcess = [currentYear];
      }

      // Process selected years and build tax history
      yearsToProcess.forEach((year) => {
        const yearData = allYearsData[year];

        yearData.installments.forEach((inst) => {
          const historyEntry = {
            jurisdiction: "County",
            year: year,
            payment_type: `Installment ${inst.installment_number}`,
            status: inst.status,
            base_amount: inst.tax_billed || "$0.00",
            amount_paid: inst.total_paid || "$0.00",
            amount_due: inst.total_unpaid || "$0.00",
            mailing_date: "N/A",
            due_date: inst.due_date || "",
            delq_date: inst.due_date || "",
            paid_date: "",
            good_through_date: "",
          };

          // Add 30 day grace period for Nevada (delinquency date)
          if (inst.due_date) {
            const dueDate = new Date(inst.due_date);
            dueDate.setDate(dueDate.getDate() + 30);
            historyEntry.delq_date = dueDate.toLocaleDateString("en-US");
          }

          // Set paid date from latest payment record
          if (inst.payments.length > 0) {
            historyEntry.paid_date = inst.payments[inst.payments.length - 1].receipt_date;
            historyEntry.status = "Paid";
          }

          // Check if installment is delinquent
          if (historyEntry.status === "Due" && historyEntry.delq_date && is_delq(historyEntry.delq_date)) {
            historyEntry.status = "Delinquent";
          }

          if (historyEntry.status === "Delinquent") {
            anyDelinquent = true;
          }

          tax_history.push(historyEntry);
        });
      });

      // Build comprehensive notes (ALL CAPS for consistency)
      const priorNote = hasPriorUnpaid ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" : "ALL PRIOR YEAR(S) TAXES ARE PAID";

      const currentInst = allYearsData[currentYear]?.installments || [];
      const installmentNotes = currentInst.map((inst) => 
        `INSTALLMENT ${inst.installment_number} IS ${inst.status.toUpperCase()}`
      );

      const dueDates = "NORMAL TAXES ARE PAID QUARTERLY. NORMAL DUE DATES FOR INSTALLMENTS: 08/18, 10/06, 01/05, 03/02";

      // Combine all notes
      data.notes = `${priorNote}, ${currentYear} TAXES: ${installmentNotes.join(", ")}. ${dueDates}`;
      data.delinquent = anyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
      // Sort tax_history: First by year (asc), then by installment number (asc)
      data.tax_history = tax_history.sort((a, b) => {
        if (a.year !== b.year) {
            return a.year - b.year; // Ascending by year
        }
        const instA = parseInt(a.payment_type.match(/\d+/)?.[0] || 0);
        const instB = parseInt(b.payment_type.match(/\d+/)?.[0] || 0);
        return instA - instB; // Then by installment number
       });

      resolve(data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};


// Orchestrate the entire search process
const account_search = async (page, account, countyKey) => {
  return new Promise(async (resolve, reject) => {
    try {
      const cfg = COUNTY[countyKey];
      if (!cfg) {
        reject(new Error("Unsupported county"));
        return;
      }
      // Chain all steps using promises
      //Navigate & Search 
      ac_1(page, account, cfg)
        .then((data1) => {
            //Basic Property Data 
          ac_2(page, account, cfg)
            .then((data2) => {
              // Extract All Years Tax Data 
              ac_3(page, data2, account)
                .then((data3) => {
                  //Format Tax History & Build Notes   
                  ac_4(data3, account)
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
    const pathKey = req.path.replace(/^\/+/, "").split("/")[0].toLowerCase();
    const URL_TO_COUNTY_KEY = {
      churchill: "churchill",
      nye: "nye",
       "carson-city": "carson_city",   // carson-city → carson_city
    };
    const countyKey = URL_TO_COUNTY_KEY[pathKey];
  try{
    // Validate county
    if (!countyKey) {
      return res.status(400).json({ error: true, message: "Invalid county" });
    }

    if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    // await page.setViewport({ width: 1366, height: 768});
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

    page.setDefaultNavigationTimeout(90000);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    if(fetch_type == "html"){
      // FRONTEND POINT
      account_search(page, account, countyKey)
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
      })
    }
    else if(fetch_type == "api"){
      // API ENDPOINT
      account_search(page, account, countyKey)
      .then((data) => {
        res.status(200).json({
          result: data
        })
      })
      .catch((error) => {
        console.log(error)
        res.status(500).json({
          error: true,
          message: error.message
        })
      })
      .finally(async () => {
        await context.close();
      })
    }

  }
  catch(error){
    console.log(error);
    if(fetch_type == "html"){
      res.status(200).render('error_data', {
        error: true,
        message: error.message
      });
    }
    else if(fetch_type == "api"){
      res.status(500).json({
        error: true,
        message: error.message
      });
    }
  }
}

export { search };