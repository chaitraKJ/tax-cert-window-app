//Author:Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout_option = { timeout: 90000 };

// County configuration
const COUNTY_CONFIG = {
  'sanmateo': {
    name: 'San Mateo',
    fullName: 'SAN MATEO',
    urlPath: 'ca-sanmateo/services/property-tax',
    iframeCounty: 'sanmateo'
  },
  'sanfrancisco': {
    name: 'San Francisco',
    fullName: 'SAN FRANCISCO',
    urlPath: 'ca-sanfrancisco/property-tax',
    iframeCounty: 'sanfrancisco'
  },
  'sacramento': {
    name: 'Sacramento',
    fullName: 'SACRAMENTO',
    urlPath: 'sacramento/property-tax',
    iframeCounty: 'sacramento'
  }
};

const replace_link = (url, config) => {
  if (!url) return null;

  // Correct prefix based on actual bill URLs: single county segment
  const prefix = `https://county-taxes.net/${config.urlPath}/`;

  if (url.startsWith(prefix)) {
    let id = url.substring(prefix.length);

    // Remove any #fragment (e.g., #parcel)
    if (id.includes('#')) {
      id = id.split('#')[0];
    }

    // Remove trailing query params if any
    if (id.includes('?')) {
      id = id.split('?')[0];
    }

    // Use county-ca for the iframe domain as per site structure
    return `https://county-taxes.net/iframe-taxsys/${config.iframeCounty}-ca.county-taxes.com/govhub/property-tax/${id}?search_query=&search_target=&search_category=property-tax`;
  }

  // Fallback: if pattern doesn't match, return null
  return null;
};

const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  return today >= delq_date;
}

// Step 1: Search for account and get iframe URL
const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('input[role="searchbox"]', timeout_option);
      await page.locator('input[role="searchbox"]').fill(account);
      await delay(5000);
      
      const selector_promise = page.waitForSelector('.vbt-autcomplete-list a', timeout_option).then(() => ({ id: 1 }));
      const iframe_promise = page.waitForSelector('iframe[title="Main Content"]', timeout_option).then(() => ({ id: 2 }));
      
      Promise.any([selector_promise, iframe_promise])
        .then(async (data) => {
          if (data['id'] == 1) {
            Promise.all([
              page.locator('.vbt-autcomplete-list a').click(),
              page.waitForSelector('iframe[title="Main Content"]', timeout_option)
            ])
              .then(async () => {
                const src = await page.evaluate(() => {
                  return document.querySelector('iframe[title="Main Content"]').src;
                });
                resolve(src);
              })
              .catch((error) => {
                console.log(error);
                reject(new Error("No Record Found"));
              });
          } else if (data['id'] == 2) {
            const src = await page.evaluate(() => {
              return document.querySelector('iframe[title="Main Content"]').src;
            });
            resolve(src);
          }
        })
        .catch((error) => {
          console.log(error);
          reject(new Error("No Record Found"));
        });
    } catch (error) {
      console.log(error);
      reject(new Error("No Record Found"));
    }
  })
}

// Step 2: Extract account summary data + improved prior delinquency detection
const ac_2 = async (page, url, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#bill-history-content', { timeout: 30000 });
      
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

        // ── 1. Extract parcel & address ───────────────────────────────────────
        const headerSpan = document.querySelector('h1 span[translate="no"]');
        if (headerSpan) {
          const text = headerSpan.textContent.trim();
          const parts = text.split('—');
          if (parts.length >= 1) data.parcel_number = parts[0].trim();
          if (parts.length >= 2) data.property_address = parts[1].trim();
        }

        // Fallback address from details
        document.querySelectorAll(".account-detail").forEach(row => {
          const label = row.querySelector('div:first-child')?.textContent.trim();
          const value = row.querySelector('.value')?.textContent.trim();
          if (label === 'Address:' && value) {
            data.property_address = value;
          }
        });

        // ── 2. Very important: Check "Amount due" section for DEFAULTED bills ──
        const amountDueBills = document.querySelectorAll('#amount-due-content .bill');
        
        amountDueBills.forEach(bill => {
          const billTitle = bill.querySelector('.bill-link a')?.textContent.trim() || '';
          const amountDueEl = bill.querySelector('.amount-due .amount');
          const amountDueText = amountDueEl ? amountDueEl.textContent.trim() : '$0.00';
          const amountDueNum = parseFloat(amountDueText.replace(/[^0-9.]/g, '')) || 0;

          // Strong indicators of prior/defaulted delinquency
          const isDefaultBill = 
            /default/i.test(billTitle) || 
            /defaulted property taxes/i.test(billTitle) ||
            /tax default/i.test(billTitle);

          if (isDefaultBill && amountDueNum > 0) {
            has_priors_unpaid = true;
          }

          // Also catch any suspicious very old year with balance > 0 in amount due
          const yearMatch = billTitle.match(/(\d{4})/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            if (year < new Date().getFullYear() - 1 && amountDueNum > 0) {
              has_priors_unpaid = true;
            }
          }
        });

        // ── 3. Bill history extraction (for regular bills) ─────────────────────
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
          
          // Only collect main/annual bills (not just installments)
          if (tbody.classList.contains('regular') || 
              !tbody.classList.contains('installment') &&
              !/installment/i.test(billText)) {
            
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

        // Optional: extra safety check in history table (less reliable than amount-due)
        const installmentRows = document.querySelectorAll('#bill-history-content tbody.installment');
        installmentRows.forEach(tbody => {
          const balanceTd = tbody.querySelector('td.balance');
          const amount = balanceTd?.textContent.trim() || '$0.00';
          const amountNum = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
          
          // Try to get parent year
          const parentTbody = tbody.closest('table')?.querySelector('tbody[data-bill-number]');
          const parentYear = parentTbody ? 
            parseInt(parentTbody.querySelector('th.year-header')?.textContent.match(/(\d{4})/)?.[1] || '0') : 0;
          
          if (amountNum > 0 && parentYear > 0 && parentYear < max_year) {
            has_priors_unpaid = true;
          }
        });

        return { data, bill_detail_links, max_year, has_priors_unpaid };
      });

      result.data.taxing_authority = `${config.fullName} COUNTY TAX COLLECTOR`;
      
      // Optional: you can store the raw delinquency info for debugging/notes
      result.data.has_priors_unpaid_debug = result.has_priors_unpaid;

      resolve(result);
    } catch (error) {
      console.error("Error in ac_2:", error);
      reject(new Error(error.message || "Failed to extract account data"));
    }
  });
};

const ac_3 = async (page, main_data, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const data = main_data.data;
      const bill_detail_links = main_data.bill_detail_links;
      const max_year = main_data.max_year;
      const has_priors_unpaid = main_data.has_priors_unpaid;
      
      let has_delinquent = false;
      const all_installments = [];

      // ALWAYS process the latest year bill
      const latestBill = bill_detail_links.find(b => b.year === max_year);
      if (!latestBill) {
        throw new Error("No latest bill found");
      }

      const latestUrl = replace_link(latestBill.url, config);
      if (!latestUrl) {
        throw new Error("Failed to generate URL for latest bill");
      }

      await page.goto(latestUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('.bills', { timeout: 30000 });

      const latestBillData = await page.evaluate((billYear) => {
        let landValue = "$0.00";
        let improvements = "$0.00";
        let exemption = "$0.00";
        let totalTaxable = "$0.00";

        // Extract assessed values from the parcel details section
        document.querySelectorAll('.parcel .detail .row.no-gutters.px-1').forEach(row => {
          const label = row.querySelector('.label')?.textContent.trim()?.toLowerCase() || "";
          const value = row.querySelector('.value')?.textContent.trim() || "$0.00";

          if (label.includes('land')) landValue = value;
          if (label.includes('improvements')) improvements = value;
          if (label.includes('exemptions')) exemption = value;
          if (label.includes('total taxable value')) totalTaxable = value;
        });

        // Extract installment data from the bill details page
        const installments = [];
        const installmentRows = document.querySelectorAll('.row.installment');
        
        installmentRows.forEach((row) => {
          const labelEl = row.querySelector('.details .label');
          if (!labelEl) return;

          const labelText = labelEl.textContent.trim();

          // Skip "Full Amount" row completely
          if (labelText === "Full Amount") return;

          // Only process 1st and 2nd installments
          const installmentMatch = labelText.match(/(\d+)(st|nd|rd|th)\s+Installment/i);
          if (!installmentMatch) return;

          const installmentNum = parseInt(installmentMatch[1]);
          if (installmentNum > 2 || installmentNum < 1) return;

          // Extract delinquent date
          const installmentDateText = row.querySelector('.installment-date')?.textContent.trim() || "";
          let delqDate = "";
          const delqMatch = installmentDateText.match(/Delinquent [Aa]fter[\s\n]+(\d{2}\/\d{2}\/\d{4})/i);
          if (delqMatch) delqDate = delqMatch[1];

          // Extract amount due
          let amountDueText = row.querySelector('.amount-due')?.textContent.trim() || "$0.00";
          if (amountDueText.startsWith('Amount due:')) {
            amountDueText = amountDueText.substring(11).trim();
          }

          // Check if paid
          const paidLabel = row.querySelector('.installment-paid.label')?.textContent.trim() || "";
          const isPaid = paidLabel === "PAID";

          // Extract paid date
          const paidDate = row.querySelector('.paid-date')?.textContent.trim() || "-";

          installments.push({
            installmentNum,
            status: isPaid ? "Paid" : (amountDueText === "$0.00" ? "Paid" : "Due"),
            amountDue: amountDueText,
            paidDate,
            delqDate
          });
        });

        return { landValue, improvements, exemption, totalTaxable, installments };
      }, max_year);

      // Set assessed values
      data.land_value = latestBillData.landValue;
      data.improvements = latestBillData.improvements;
      data.exemption = latestBillData.exemption;
      data.total_taxable_value = latestBillData.totalTaxable;
      data.total_assessed_value = latestBillData.totalTaxable;

      // Process installments
      for (const inst of latestBillData.installments) {
        let dueDate = "";
        let delqDate = inst.delqDate || "";

        // Set standard due dates
        if (inst.installmentNum === 1) {
          dueDate = `12/10/${max_year}`;
          if (!delqDate) delqDate = `12/11/${max_year}`;
        } else if (inst.installmentNum === 2) {
          dueDate = `04/10/${max_year + 1}`;
          if (!delqDate) delqDate = `04/11/${max_year + 1}`;
        }

        let status = inst.status;
        
        // Check if delinquent based on current date
        if (status === "Due" && is_delq(delqDate)) {
          status = "Delinquent";
          has_delinquent = true;
        }

        const payment_type = `${inst.installmentNum}${inst.installmentNum === 1 ? 'st' : 'nd'} Installment`;

        all_installments.push({
          jurisdiction: "County",
          year: max_year,
          payment_type: payment_type,
          status: status,
          base_amount: inst.amountDue,
          amount_paid: status === "Paid" ? inst.amountDue : "$0.00",
          amount_due: status === "Paid" ? "$0.00" : inst.amountDue,
          paid_date: inst.paidDate,
          mailing_date: "N/A",
          due_date: dueDate,
          delq_date: delqDate,
          good_through_date: "-"
        });
      }

      // Sort: 1st then 2nd
      all_installments.sort((a, b) => {
        const aNum = parseInt(a.payment_type) || 0;
        const bNum = parseInt(b.payment_type) || 0;
        return aNum - bNum;
      });

      data.tax_history = all_installments;

      // Set delinquent status
      if (has_priors_unpaid || has_delinquent) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      } else {
        data.delinquent = "NONE";
      }

      // Build notes with installment statuses
      const priors_status = has_priors_unpaid ? "PRIORS ARE DELINQUENT." : "ALL PRIORS ARE PAID.";
      let installment_status = "";
      
      all_installments.forEach((inst, idx) => {
        if (idx > 0) installment_status += ", ";
        installment_status += `${inst.payment_type} IS ${inst.status.toUpperCase()}`;
      });

      data.notes = `${priors_status} ${max_year} ${installment_status.toUpperCase()}. NORMALLY TAXES ARE PAID IN TWO INSTALLMENTS. NORMAL DUE DATES ARE 12/10 (1ST) & 04/10 (2ND).`;

      resolve(data);
    } catch (error) {
      console.error("Error in ac_3:", error);
      reject(new Error("Failed to extract bill details: " + error.message));
    }
  });
};
// Main search orchestration
const account_search = async (page, url, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const data1 = await ac_1(page, url, account);
      const data2 = await ac_2(page, data1, account, config);
      const data3 = await ac_3(page, data2, config);
      resolve(data3);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
}

// Express route handler
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const countyKey = req.path.replace(/^\/+/, "").replace(/-/g, '');
  
  try {
    // Validate account number is provided
    if (!account || account.trim() === '') {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }
    const config = COUNTY_CONFIG[countyKey];
    if (!config) {
      return res.status(500).json({ error: true, message: "Invalid county configuration" });
    }
    
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(500).render('error_data', { error: true, message: "Invalid Access" });
    }
    
    if (!account || account === "") {
      if (fetch_type === "html") {
        return res.status(200).render('error_data', { error: true, message: "Please provide the parcel number" });
      } else if (fetch_type === "api") {
        return res.status(500).json({ error: true, message: "Please provide the parcel number" });
      }
    }
    
    const url = `https://county-taxes.net/${config.urlPath}`;
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')
    
    page.setDefaultNavigationTimeout(90000);
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'font' || req.resourceType() === 'image') {
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
          res.status(500).render('error_data', { error: true, message: error.message });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type === "api") {
      account_search(page, url, account, config)
        .then((result) => {
          return res.status(200).json({ result });
        })
        .catch((error) => {
          return res.status(500).json({ error: true, message: error.message });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type === "html") {
      res.status(500).render('error_data', { error: true, message: error.message });
    } else if (fetch_type === "api") {
      res.status(500).json({ error: true, message: error.message });
    }
  }
}

module.exports = { search } 
