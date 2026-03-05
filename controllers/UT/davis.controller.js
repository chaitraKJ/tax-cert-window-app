// Author: Dhanush

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Clean string values
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

// Helper: Format dollar amounts
const formatDollar = (value) => {
  if (!value || value === "") return "$0.00";
  const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
  return Number.isFinite(num)
    ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "$0.00";
};

// Helper: Calculate tax status based on due dates
const calculateTaxStatus = (taxHistory, now = new Date()) => {
  return taxHistory.map((item) => {
    if (item.status === "Paid") return { ...item, delinquent: "NONE" };

    const [mmD, ddD, yyyyD] = item.due_date.split("/").map(Number);
    const [mmQ, ddQ, yyyyQ] = item.delq_date.split("/").map(Number);

    const dueDate = new Date(yyyyD, mmD - 1, ddD);
    const delqDate = new Date(yyyyQ, mmQ - 1, ddQ);

    if (now < delqDate) {
      return { ...item, status: "Due", delinquent: "NONE" };
    } else {
      return { ...item, status: "Delinquent", delinquent: "YES" };
    }
  });
};

// Step 0: Map search and popup data extraction - CORRECTED
const dc_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = "https://webportal.daviscountyutah.gov/App/PropertySearch/esri/map";
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await delay(5000);

      // 1. Handle possible terms modal
      const termsCheckbox = '#terms-agreement-dialog-checkbox input';
      const okBtn = '#terms-agreement-dialog-ok-btn';
      
      try {
        const hasTerms = await page.evaluate(sel => !!document.querySelector(sel), termsCheckbox);
        if (hasTerms) {
          await page.click(termsCheckbox);
          await delay(1000);
          await page.click(okBtn);
          await delay(3000);
        }
      } catch (e) {
        console.log("No terms modal or already accepted");
      }

      // 2. Find and use search input
      const searchInputSelector = 'input.esri-search__input';
      await page.waitForSelector(searchInputSelector, { visible: true, timeout: 15000 });

      // Clear and type
      await page.click(searchInputSelector, { clickCount: 3 });
      await delay(500);
      await page.type(searchInputSelector, account);
      await delay(2000);

      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      try {
        await page.waitForSelector('.property-section .property-row', { timeout: 30000 });
      } catch {
        reject(new Error("No Record Found"));
      }
      await delay(5000);
      // 5. Extract data from popup - FIXED SELECTORS
      const popupData = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        const data = {
          owner_name: [],
          property_address: ""
        };

        // Find all property rows in the popup
        const rows = document.querySelectorAll('.property-section .property-row');
        
        rows.forEach(row => {
          const labelEl = row.querySelector('.label');
          const valueEl = row.querySelector('.value');
          
          if (!labelEl || !valueEl) return;
          
          const label = clean(labelEl.textContent);
          const value = clean(valueEl.textContent);
          
          // Map each field
          if (label === "Owner") {
            data.owner_name = [value];
          } else if (label === "Site Address") {
            data.property_address = value;
          }
        });

        return data;
      });

      // 6. Click "View Parcel Detail" button - FIXED
      await delay(3000);
      
      const clicked = await page.evaluate(() => {
        // Find the button by looking for action text
        const actions = Array.from(document.querySelectorAll('.esri-popup__action'));
        const detailAction = actions.find(action => {
          const textEl = action.querySelector('.esri-popup__action-text');
          return textEl && textEl.textContent.includes('View Parcel Detail');
        });
        
        if (detailAction) {
          detailAction.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 50000 });
      } else {
        console.warn("Could not find View Parcel Detail button");
      }
      await page.waitForSelector('.prop-table, .widget, .parcel-id-value', { timeout:50000 })
      .then(() => {
        if(page.url() == url){
					reject(new Error("No Record Found"));
				}
				else{
					resolve(popupData);
				}
      })
      .catch((error) => {
        console.log(error);
        reject(new Error(error.message));
      });
    } catch (err) {
      console.error("Map search failed:", err);
      reject(err);
    }
  });
};

// Helper: Generate notes for tax summary
const generateNotes = (taxHistory) => {
  if (!taxHistory?.length) return "NO TAX PAYMENT HISTORY AVAILABLE.";

  const sorted = [...taxHistory].sort((a, b) => parseInt(a.year) - parseInt(b.year));
  const latest = sorted[sorted.length - 1];
  const currentYear = latest.year;

  let curNote = "";
  if (latest.delinquent === "YES") {
    curNote = `${currentYear} ANNUAL TAXES ARE DELINQUENT`;
  } else if (latest.status === "Due") {
    curNote = `${currentYear} ANNUAL TAXES ARE DUE`;
  } else {
    curNote = `${currentYear} TAXES ARE PAID IN FULL`;
  }

  const hasDelinquentPrior = sorted.slice(0, -1).some(t => t.delinquent === "YES");
  let priorNote = hasDelinquentPrior 
    ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" 
    : "PRIOR YEAR(S) TAXES ARE PAID";

  const hasInstallments = taxHistory.some(t => t.payment_type === "Installment");
  const suffix = `, NORMALLY TAXES ARE PAID ANNUALLY${
    hasInstallments ? ", SOME INSTALLMENT PAYMENTS DETECTED" : ""
  }, NORMAL DUE DATE IS 11/30.`;

  return `${priorNote}, ${curNote}${suffix}`;
};


// Step 2: Extract basic property information
const dc_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const propertyData = await page.evaluate((parcel) => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        const data = {
          processed_date: new Date().toISOString().slice(0, 10),
          order_number: "",
          borrower_name: "",
          owner_name: [""],
          property_address: "",
          parcel_number: parcel,
          land_value: "-",
          improvements: "-",
          total_assessed_value: "",
          exemption: "-",
          total_taxable_value: "",
          taxing_authority: "Davis County Treasurer, 28 S State St, Farmington, UT 84025, Ph: 801-451-3372",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
          property_details: {},
        };

        // Get parcel number
        const parcelEl = document.querySelector('.parcel-id-value, #parcel-info');
        if (parcelEl) data.parcel_number = clean(parcelEl.textContent);

        return data;
      }, account);

      resolve(propertyData);
    } catch (error) {
      console.error("Property extraction failed:", error);
      reject(new Error(`Failed to extract property data: ${error.message}`));
    }
  });
};

// Step 3: Extract valuation data
const dc_3 = async (page, mainData) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Click Valuation section
      await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('.action-section'));
        const valuationBtn = sections.find(el => el.textContent.includes('Valuation'));
        if (valuationBtn) valuationBtn.click();
      });

      await delay(2000);
      await page.waitForSelector('.drawer-content', { visible: true, timeout: 50000 });

      const valuationData = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        
        const valuation = {
          market_value: "",
          taxable_value: "",
          valuation_history: []
        };

        // Find the valuation table
        const tables = document.querySelectorAll('table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr');
          
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const year = clean(cells[0].textContent);
              const market = clean(cells[1].textContent);
              const taxable = clean(cells[2].textContent);
              
              if (year && !isNaN(parseInt(year)) && market.includes('$')) {
                valuation.valuation_history.push({
                  year: year,
                  market_value: market,
                  taxable_value: taxable
                });
              }
            }
          });
          
          if (valuation.valuation_history.length > 0) break;
        }

        if (valuation.valuation_history.length > 0) {
          valuation.market_value = valuation.valuation_history[0].market_value;
          valuation.taxable_value = valuation.valuation_history[0].taxable_value;
        }

        return valuation;
      });

      mainData.land_value=valuationData.market_value;
      mainData.total_assessed_value = valuationData.market_value;
      mainData.total_taxable_value = valuationData.taxable_value;
      mainData.valuation_history = valuationData.valuation_history;
      resolve(mainData);
    } catch (error) {
      console.error("Valuation extraction failed:", error);
      reject(new Error(`Failed to extract valuation: ${error.message}`));
    }
  });
};

// Step 4: Extract tax history
const dc_4 = async (page, mainData) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Click Tax History section
      await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('.action-section'));
        const taxBtn = sections.find(el => el.textContent.includes('Tax History'));
        if (taxBtn) taxBtn.click();
      });

      await delay(2000);
      await page.waitForSelector('.tax-history-table', { visible: true, timeout: 50000 });

      const taxHistory = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const fmt = (v) => {
          if (!v) return "$0.00";
          const n = parseFloat(v.replace(/[$ ,]/g, ""));
          return Number.isFinite(n)
            ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "$0.00";
        };

        const history = [];
        const taxRows = document.querySelectorAll('.tax-history-table tbody tr');
        
        taxRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const year = clean(cells[0].textContent);
            const taxes = clean(cells[1].textContent);
            const adjustments = clean(cells[2].textContent);
            const paid = clean(cells[3].textContent);
            const due = clean(cells[4].textContent);

            const dueNum = parseFloat(due.replace(/[$ ,]/g, ""));
            const isPaid = dueNum <= 0;

            history.push({
              jurisdiction: "County",
              year: year,
              payment_type: "Annual",
              status: isPaid ? "Paid" : "Due",
              base_amount: fmt(taxes),
              amount_paid: fmt(paid),
              amount_due: fmt(due),
              adjustments: fmt(adjustments),
              mailing_date: "N/A",
              due_date: `11/30/${year}`,
              delq_date: `12/01/${year}`,
              paid_date: isPaid ? "N/A" : "-",
              good_through_date: ""
            });
          }
        });

        return history;
      });

      mainData.tax_history = taxHistory;
      resolve(mainData);
    } catch (error) {
      console.error("Tax history extraction failed:", error);
      reject(new Error(`Failed to extract tax history: ${error.message}`));
    }
  });
};

// Step 5: Finalize data
const dc_5 = async (page, mainData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const fullHistoryWithStatus = calculateTaxStatus(mainData.tax_history);
      fullHistoryWithStatus.sort((a, b) => parseInt(a.year) - parseInt(b.year));

      if (fullHistoryWithStatus.length === 0) {
        mainData.tax_history = [];
        mainData.delinquent = "NONE";
        mainData.notes = "NO TAX PAYMENT HISTORY AVAILABLE.";
        resolve(mainData);
        return;
      }

      const latestEntry = fullHistoryWithStatus[fullHistoryWithStatus.length - 1];
      const delinquentPriorYears = fullHistoryWithStatus
        .slice(0, -1)
        .filter(t => t.delinquent === "YES");

      const displayedTaxHistory = [...delinquentPriorYears, latestEntry];
      mainData.tax_history = displayedTaxHistory;

      const hasAnyDelinquent = fullHistoryWithStatus.some(t => t.delinquent === "YES");
      mainData.delinquent = hasAnyDelinquent
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      mainData.notes = generateNotes(fullHistoryWithStatus);

      resolve(mainData);
    } catch (error) {
      console.error("Finalization failed:", error);
      reject(new Error(`Failed to finalize: ${error.message}`));
    }
  });
};
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Map search + popup
      dc_1(page, account)
        .then((popupData) => {
          // Step 2: Property data
          dc_2(page, account)
            .then((data) => {
              // merge popup data
              if (popupData?.owner_name?.length) {
                data.owner_name = popupData.owner_name;
              }
              if (popupData?.property_address) {
                data.property_address = popupData.property_address;
              }
              // Step 3: Valuation
              dc_3(page, data)
                .then((data1) => {
                  // Step 4: Tax history
                  dc_4(page, data1)
                    .then((data2) => {
                      // Step 5: Finalize
                      dc_5(page, data2)
                        .then((finalData) => {
                          resolve(finalData);
                        })
                        .catch(err => reject(err));
                    })
                    .catch(err => reject(err));
                })
                .catch(err => reject(err));
            })
            .catch(err => reject(err));
        })
        .catch(err => reject(err));
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
};

// API ROUTE HANDLER
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  
  try {
    if (!account || account.trim() === '') {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Parcel Number..."
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
    page.setDefaultNavigationTimeout(120000);

    if (fetch_type === "html") {
      account_search(page, account)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.error(error);
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
          console.error(error);
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
    console.error(error);
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
