// Author: Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout_option = { timeout: 120000 };

// San Bernardino County Configuration
const COUNTY_CONFIG = {
  'sanbernardino': {
    name: 'San Bernardino',
    fullName: 'SAN BERNARDINO',
    urlPath: 'tax-services/property-tax',
    baseUrl: 'https://www.sbcountyatc.gov',
    iframeBase: 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax'
  }
};

const is_delq = (dateStr) => {
  if (!dateStr || dateStr === "-") return false;
  const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!parts) return false;
  const [_, m, d, y] = parts.map(Number);
  const delqDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= delqDate;
}

// Step 1: Accept cookies and search for account
const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      console.log("Page loaded successfully");
      
      
      // Accept cookies
      try {
        await page.waitForSelector('button[aria-label="Accept cookies"]', { timeout: 10000 });
        await page.click('button[aria-label="Accept cookies"]');
        await delay(1000);
      } catch (e) {
        // Cookie banner not found, continue
      }

      // Wait for the main iframe to load
      await page.waitForSelector('iframe#gsg-public-site', { timeout: 90000 });
      console.log("Main iframe found");
      await delay(3000);
      
      
      const iframeElement = await page.$('iframe#gsg-public-site');
      const iframe = await iframeElement.contentFrame();
      
      if (!iframe) throw new Error("Could not access iframe");

      await iframe.waitForSelector('input[id^="typeahead-input-"]', { timeout: 70000 });
      
      await iframe.type('input[id^="typeahead-input-"]', account, { delay: 100 });
      await delay(5000);

      const selector_promise = iframe.waitForSelector('.vbt-autcomplete-list a', { timeout: 70000 }).then(() => ({ id: 1 }));
      const nested_iframe_promise = iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 70000 }).then(() => ({ id: 2 }));
      
      Promise.any([selector_promise, nested_iframe_promise])
        .then(async (data) => {
          if (data['id'] == 1) {
            console.log("Autocomplete results found, clicking first result");
            // Click first autocomplete result
            Promise.all([
              iframe.click('.vbt-autcomplete-list a'),
              iframe.waitForSelector('iframe[title="Main Content"]', timeout_option)
            ])
              .then(async () => {
                await delay(1000);
                const src = await iframe.evaluate(() => {
                  return document.querySelector('iframe[title="Main Content"]').src;
                });
                console.log(`Found iframe src: ${src}`);
                resolve(src);
              })
              .catch((error) => {
                console.log("Error clicking autocomplete:", error);
                reject(new Error("No Record Found"));
              });
          } else if (data['id'] == 2) {
            console.log("Direct navigation detected");
            await delay(5000);
            const src = await iframe.evaluate(() => {
              return document.querySelector('iframe[title="Main Content"]').src;
            });
            console.log(`Found iframe src: ${src}`);
            resolve(src);
          }
        })
        .catch((error) => {
          console.log("Error waiting for results:", error);
          reject(new Error("No Record Found"));
        });
    } catch (error) {
      console.log("Error in ac_1:", error);
      reject(new Error("No Record Found: " + error.message));
    }
  });
}

// Step 2: Navigate to iframe and extract account summary
const ac_2 = async (page, iframeUrl, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Navigating to iframe URL:", iframeUrl);
      await page.goto(iframeUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#bill-history-content', { timeout: 90000 });
      console.log("Bill history content loaded");
      
      const result = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split('T')[0],
          order_number: "",
          borrower_name: "",
          owner_name: ["N/A"],
          property_address: "",
          parcel_number: "",
          land_value: "$0.00",
          improvements: "$0.00",
          total_assessed_value: "$0.00",
          exemption: "$0.00",
          total_taxable_value: "$0.00",
          taxing_authority: "",
          notes: "",
          delinquent: "NONE",
          tax_history: []
        };
        
        let bill_detail_links = [];
        let max_year = 0;
        let has_priors_unpaid = false;

        // Extract parcel & address from header
        const headerSpan = document.querySelector('h1 span[translate="no"]');
        if (headerSpan) {
          const text = headerSpan.textContent.trim();
          const parts = text.split('—');
          if (parts.length >= 1) data.parcel_number = parts[0].trim();
          if (parts.length >= 2) data.property_address = parts[1].trim();
        }

        // Fallback address extraction
        document.querySelectorAll(".account-detail").forEach(row => {
          const label = row.querySelector('div:first-child')?.textContent.trim();
          const valueDiv = row.querySelector('.value');
          if (label === 'Address:' && valueDiv) {
            const value = valueDiv.textContent.trim().replace(/\s+/g, ' ');
            if (value && value !== data.property_address) {
              data.property_address = value;
            }
          }
        });

        // Check "Amount due" section for DEFAULTED bills
        const amountDueBills = document.querySelectorAll('#amount-due-content .bill');
        
        amountDueBills.forEach(bill => {
          const billTitle = bill.querySelector('.bill-link a')?.textContent.trim() || '';
          const amountDueEl = bill.querySelector('.amount-due .amount');
          const amountDueText = amountDueEl ? amountDueEl.textContent.trim() : '$0.00';
          const amountDueNum = parseFloat(amountDueText.replace(/[^0-9.]/g, '')) || 0;

          const isDefaultBill = 
            /default/i.test(billTitle) || 
            /defaulted property taxes/i.test(billTitle) ||
            /tax default/i.test(billTitle);

          if (isDefaultBill && amountDueNum > 0) {
            has_priors_unpaid = true;
          }

          const yearMatch = billTitle.match(/(\d{4})/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            if (year < new Date().getFullYear() - 1 && amountDueNum > 0) {
              has_priors_unpaid = true;
            }
          }
        });

        // Bill history extraction
        const billRows = document.querySelectorAll('#bill-history-content tbody[data-bill-number]');
        
        billRows.forEach(tbody => {
          const billNumber = tbody.getAttribute('data-bill-number');
          const billLink = tbody.querySelector('th.year-header a');
          
          if (!billLink) return;
          
          const billText = billLink.textContent.trim();
          const yearMatch = billText.match(/(\d{4})/);
          if (!yearMatch) return;
          
          const year = parseInt(yearMatch[1]);
          max_year = Math.max(max_year, year);
          
          // Only process regular/annual bills, not installment rows
          if (!tbody.classList.contains('installment') && 
              !tbody.classList.contains('grouped')) {
            
            const billUrl = billLink.href;
            let billType = "Annual";
            if (/unsecured/i.test(billText)) billType = "Unsecured Annual";
            
            bill_detail_links.push({
              year: year,
              type: billType,
              url: billUrl,
              billNumber: billNumber
            });
          }
        });

        // Check installment history for unpaid priors
        const installmentRows = document.querySelectorAll('#bill-history-content tbody.installment');
        installmentRows.forEach(tbody => {
          const balanceTd = tbody.querySelector('td.balance');
          const amount = balanceTd?.textContent.trim() || '$0.00';
          const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
          
          // Find parent year
          const parentTbody = tbody.previousElementSibling;
          if (parentTbody && parentTbody.hasAttribute('data-bill-number')) {
            const parentLink = parentTbody.querySelector('th.year-header a');
            if (parentLink) {
              const parentYear = parseInt(parentLink.textContent.match(/(\d{4})/)?.[1] || '0');
              if (amountNum > 0 && parentYear > 0 && parentYear < max_year) {
                has_priors_unpaid = true;
              }
            }
          }
        });

        return { data, bill_detail_links, max_year, has_priors_unpaid };
      });

      result.data.taxing_authority = `${config.fullName} COUNTY TAX COLLECTOR`;
      console.log("Data extracted successfully");
      // At the end of ac_2, instead of just returning result:
      resolve(result);

      
    } catch (error) {
      console.error("Error in ac_2:", error);
      reject(new Error(error.message || "Failed to extract account data"));
    }
  });
};

// Step 3: Extract bill details and build tax history
const ac_3 = async (page, main_data, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { data, bill_detail_links, max_year, has_priors_unpaid } = main_data;

      console.log("=== AC_3 START ===");
      console.log("Bill detail links:", JSON.stringify(bill_detail_links, null, 2));
      console.log("Max year:", max_year);
      console.log("Has priors unpaid:", has_priors_unpaid);

      const latestBill = bill_detail_links.find(b => b.year === max_year);
      if (!latestBill) {
        console.error("No latest bill found for year:", max_year);
        reject(new Error("No latest bill found in bill_detail_links"));
        return;
      }

      console.log("Latest bill URL:", latestBill.url);

      // Navigate with generous timeout
      console.log("Navigating to bill detail page...");
      await page.goto(latestBill.url, { 
        waitUntil: "domcontentloaded", 
        timeout: 90000 
      });
      console.log("Bill detail page loaded (domcontentloaded)");

      // Wait a bit for dynamic content
      await delay(3000);

      // Check if there are iframes on this page
      console.log("Checking for iframes on bill detail page...");
      const iframeCount = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        console.log("Found", iframes.length, "iframes");
        return iframes.length;
      });
      console.log("Number of iframes found:", iframeCount);

      // Log page structure
      console.log("Checking page structure...");
      const pageStructure = await page.evaluate(() => {
        const body = document.body;
        const allDivs = document.querySelectorAll('div');
        const allRows = document.querySelectorAll('.row, .row.no-gutters, .row.detail .row');
        const allClasses = Array.from(new Set(
          Array.from(document.querySelectorAll('*'))
            .filter(el => el.className && typeof el.className === 'string')
            .flatMap(el => el.className.split(' '))
            .filter(cls => cls.trim())
        )).slice(0, 50); // First 50 unique classes

        return {
          bodyHTML: body ? body.innerHTML.substring(0, 500) : "No body found",
          divCount: allDivs.length,
          rowCount: allRows.length,
          sampleClasses: allClasses
        };
      });
      console.log("Page structure:", JSON.stringify(pageStructure, null, 2));

      // Try to wait for the selector with extended logging
      console.log("Waiting for bill detail selectors...");
      try {
        await page.waitForSelector(".row, .row.no-gutters, .row.detail .row", { timeout: 70000 });
        console.log("Found bill detail selectors in main page");
      } catch (selectorError) {
        console.error("Selector not found in main page, checking frames...");
        
        // Check all frames
        const frames = page.frames();
        console.log("Total frames available:", frames.length);
        
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          console.log(`Checking frame ${i}, URL:`, frame.url());
          
          try {
            const frameContent = await frame.evaluate(() => {
              const rows = document.querySelectorAll('.row, .row.no-gutters, .row.detail .row');
              const bodyText = document.body ? document.body.innerText.substring(0, 300) : '';
              return {
                rowCount: rows.length,
                bodyPreview: bodyText
              };
            });
            console.log(`Frame ${i} content:`, frameContent);
            
            if (frameContent.rowCount > 0) {
              console.log(`Found ${frameContent.rowCount} rows in frame ${i}`);
            }
          } catch (frameError) {
            console.log(`Could not evaluate frame ${i}:`, frameError.message);
          }
        }
        
        console.error("Selector '.row, .row.no-gutters, .row.detail .row' not found in any frame");
        console.log("Attempting alternative extraction methods...");
      }

      const pollFrames = async () => {
        console.log("=== STARTING POLLFRAMES ===");
        
        const extractionScript = async (year) => {
          const clean = (t) => t?.replace(/\s+/g, ' ').trim() || "";
          
          const extractFromDocument = (doc) => {
            console.log("Running extraction on document...");
            
            const values = {
              land_value: "$0.00",
              improvements: "$0.00",
              exemption: "$0.00",
              total_taxable_value: "$0.00",
              total_assessed_value: "$0.00"
            };

            const rows = doc.querySelectorAll('.row, .row.no-gutters, .row.detail .row');
            console.log("Found rows for extraction:", rows.length);
            
            if (rows.length === 0) {
              console.log("No rows found, returning null");
              return null;
            }

            rows.forEach((row, idx) => {
              const labelEl = row.querySelector('.label');
              const valueEl = row.querySelector('.value');
              if (!labelEl || !valueEl) return;

              const label = clean(labelEl.textContent).toLowerCase();
              const val = clean(valueEl.textContent);
              
              console.log(`Row ${idx}: ${label} = ${val}`);
              
              if (label && val && val !== "") {
                if (label.includes('land')) values.land_value = val;
                if (label.includes('improvement')) values.improvements = val;
                if (label.includes('exemption')) values.exemption = val;
                if (label.includes('taxable value')) values.total_taxable_value = val;
              }
            });

            console.log("Extracted values:", values);

            // Fallback for taxable value
            if (values.total_taxable_value === "$0.00" || values.total_taxable_value === "") {
              console.log("Attempting fallback taxable value extraction...");
              const allElements = Array.from(doc.querySelectorAll('div, span, p, td'));
              for (const el of allElements) {
                const text = clean(el.textContent).toLowerCase();
                if (text === "total taxable value:" || text === "taxable value:") {
                  const nextEl = el.nextElementSibling || el.parentElement?.querySelector('.value');
                  if (nextEl) {
                    values.total_taxable_value = clean(nextEl.textContent);
                    console.log("Found taxable value via fallback:", values.total_taxable_value);
                    break;
                  }
                }
              }
            }

            values.total_assessed_value = values.total_taxable_value || values.land_value;

            const installments = [];
            const instRows = doc.querySelectorAll('.row.installment, .installment');
            console.log("Found installment rows:", instRows.length);
            
            instRows.forEach((row, idx) => {
              const labelText = clean(row.querySelector('.label')?.textContent);
              if (!labelText) return;

              const instMatch = labelText.match(/(1st|2nd|first|second)/i);
              if (!instMatch) return;

              const instNum = instMatch[0].toLowerCase().includes('1') || instMatch[0].toLowerCase().includes('first') ? 1 : 2;

              const delqDateEl = row.querySelector('.installment-date span, .installment-date');
              const delqDate = clean(delqDateEl?.textContent.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || "");
              
              const statusEl = row.querySelector('.installment-paid, .paid-status, .status');
              const statusRaw = clean(statusEl?.textContent) || "Due";
              
              const amountEl = row.querySelector('.amount-due') || row.querySelector('.amount');
              let amount = clean(amountEl?.textContent) || "$0.00";
              
              if (amount.includes('$')) {
                amount = '$' + amount.split('$')[1].trim().split(' ')[0];
              } else {
                const match = amount.match(/[\d,.]+/);
                amount = match ? `$${match[0]}` : "$0.00";
              }
              
              const paidDateEl = row.querySelector('.paid-date, .payment-date');
              const paidDate = clean(paidDateEl?.textContent) || "-";
              
              console.log(`Installment ${idx}:`, {instNum, status: statusRaw, amount, delqDate, paidDate});
              
              installments.push({
                installmentNum: instNum,
                status: statusRaw.toUpperCase().includes("PAID") ? "Paid" : (statusRaw.toUpperCase().includes("DELINQUENT") ? "Delinquent" : "Due"),
                amountDue: amount,
                paid_date: paidDate,
                delq_date: delqDate
              });
            });

            console.log("Total installments extracted:", installments.length);
            return { values, installments };
          };

          return extractFromDocument(document);
        };

        // Poll for up to 30 seconds
        console.log("Starting frame polling (60 iterations x 500ms = 30s)...");
        for (let i = 0; i < 60; i++) {
          console.log(`Poll iteration ${i + 1}/60`);
          
          const allFrames = page.frames();
          console.log(`Processing ${allFrames.length} frames...`);
          
          const results = await Promise.all(allFrames.map(async (frame, idx) => {
            try {
              const result = await frame.evaluate(extractionScript, max_year);
              if (result) {
                console.log(`Frame ${idx} returned result:`, result);
              }
              return result;
            } catch (e) {
              console.log(`Frame ${idx} evaluation failed:`, e.message);
              return null;
            }
          }));

          const validResult = results.find(r => r && r.installments.length > 0);
          if (validResult) {
            console.log("Found valid result with installments!");
            return validResult;
          }
          
          await delay(500);
        }
        
        console.log("Polling completed without finding installments");
        return { values: {}, installments: [] };
      };

      pollFrames()
        .then(async (billDetail) => {
          console.log("=== POLLFRAMES COMPLETED ===");
          console.log("Bill detail result:", JSON.stringify(billDetail, null, 2));
          
          // Final fallback to regex on full page text if no installments found
          if (billDetail.installments.length === 0) {
            console.log("No installments found, attempting regex fallback...");
            const pageText = await page.evaluate(() => document.body.innerText);
            console.log("Page text preview:", pageText.substring(0, 500));
            
            const instRegex = /(1st|2nd|first|second)\s*installment.*?(?:\$?([\d,]+\.?\d{2})).*?(paid|due|paid\s*\$?[\d,.]+).*?(\d{1,2}\/\d{1,2}\/\d{4}|-)/gi;
            let match;
            let regexCount = 0;
            while ((match = instRegex.exec(pageText)) !== null) {
              regexCount++;
              console.log(`Regex match ${regexCount}:`, match);
              
              const instNum = match[1].toLowerCase().includes('1') ? 1 : 2;
              const amount = match[2] ? `$${match[2]}` : "$0.00";
              const statusRaw = match[3] || "";
              const paidDate = match[4] || "-";
              const isPaid = statusRaw.toLowerCase().includes('paid') || amount === '$0.00';

              billDetail.installments.push({
                installmentNum: instNum,
                status: isPaid ? "Paid" : "Due",
                amountDue: amount,
                paid_date: paidDate,
                delq_date: ""
              });
            }
            console.log(`Regex extraction found ${regexCount} matches`);
          }

          // Remove duplicates
          const unique = [];
          const seen = new Set();
          billDetail.installments.forEach(i => {
            if (!seen.has(i.installmentNum)) {
              seen.add(i.installmentNum);
              unique.push(i);
            }
          });
          billDetail.installments = unique;
          console.log("Unique installments after deduplication:", billDetail.installments.length);

          // Merge assessed values
          Object.assign(data, billDetail.values);
          console.log("Merged assessed values into data");

          // Build tax history
          let has_delinquent = false;
          const tax_history = [];

          billDetail.installments.forEach((inst, idx) => {
            console.log(`Processing installment ${idx} for tax history:`, inst);
            
            let dueDate = inst.installmentNum === 1 ? `12/10/${max_year}` : `04/10/${max_year + 1}`;
            let delqDate = inst.delq_date || (inst.installmentNum === 1 ? `12/11/${max_year}` : `04/11/${max_year + 1}`);

            let status = inst.status;
            if (status === "Delinquent") {
              has_delinquent = true;
            } else if (status === "Due" && is_delq(delqDate)) {
              status = "Delinquent";
              has_delinquent = true;
            }

            tax_history.push({
              jurisdiction: "County",
              year: max_year,
              payment_type: `${inst.installmentNum}${inst.installmentNum === 1 ? 'st' : 'nd'} Installment`,
              status: status.toUpperCase() === "PAID" ? "Paid" : status,
              base_amount: inst.amountDue,
              amount_paid: status.toUpperCase() === "PAID" ? inst.amountDue : "$0.00",
              amount_due: status.toUpperCase() === "PAID" ? "$0.00" : inst.amountDue,
              paid_date: inst.paid_date,
              mailing_date: "N/A",
              due_date: dueDate,
              delq_date: delqDate,
              good_through_date: "-"
            });
          });

          data.tax_history = tax_history;
          console.log("Tax history built:", JSON.stringify(tax_history, null, 2));

          // Delinquent flag & notes
          data.delinquent = (has_priors_unpaid || has_delinquent)
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

          const priorsMsg = has_priors_unpaid ? "PRIORS ARE DELINQUENT." : "ALL PRIORS ARE PAID.";
          const instMsg = tax_history.length
            ? tax_history.map(i => `${i.payment_type} IS ${i.status.toUpperCase()}`).join(", ")
            : "NO INSTALLMENTS FOUND";

          data.notes = `${priorsMsg} ${max_year} ${instMsg}. NORMALLY TAXES ARE PAID IN TWO INSTALLMENTS. NORMAL DUE DATES ARE 12/10 (1ST) & 04/10 (2ND).`.toUpperCase();

          console.log("=== AC_3 COMPLETED SUCCESSFULLY ===");
          console.log("Final data:", JSON.stringify(data, null, 2));
          resolve(data);
        })
        .catch((error) => {
          console.error("=== ERROR IN POLLFRAMES ===");
          console.error("Error:", error);
          reject(new Error(`Bill detail extraction failed: ${error.message}`));
        });

    } catch (error) {
      console.error("=== ERROR IN AC_3 ===");
      console.error("Error:", error);
      reject(new Error(error.message));
    }
  });
};

// Main orchestration with proper chaining
const account_search = async (page, url, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account)
        .then((iframeUrl) => {
          ac_2(page, iframeUrl, account, config)
            .then((summary) => {
              ac_3(page, summary, config)
                .then((final) => {
                  resolve(final);
                })
                .catch((error) => {
                  console.log("Error in ac_3:", error);
                  reject(error);
                });
            })
            .catch((error) => {
              console.log("Error in ac_2:", error);
              reject(error);
            });
        })
        .catch((error) => {
          console.log("Error in ac_1:", error);
          reject(error);
        });
    } catch (error) {
      console.log("Error in account_search:", error);
      reject(error);
    }
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  
  try {
    if (!account || account.trim() === '') {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    
    const config = COUNTY_CONFIG['sanbernardino'];
    
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(500).render('error_data', { 
        error: true, 
        message: "Invalid Access" 
      });
    }
    
    const url = `${config.baseUrl}/${config.urlPath}`;
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.setDefaultNavigationTimeout(120000);
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    if (fetch_type === "html") {
      account_search(page, url, account, config)
        .then((result) => {
          res.status(200).render('parcel_data_official', result);
        })
        .catch((error) => {
          console.log("Error in search:", error);
          res.status(500).render('error_data', { 
            error: true, 
            message: error.message 
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type === "api") {
      account_search(page, url, account, config)
        .then((result) => {
          res.status(200).json({ result });
        })
        .catch((error) => {
          console.log("Error in search:", error);
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
    console.log("Error in search handler:", error);
    if (fetch_type === "html") {
      res.status(500).render('error_data', { 
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
}

export { search };
