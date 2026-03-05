// author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs/promises";

const timeout_option = { timeout: 90000 };

// Helper: wait for any of a set of selectors (replaces ad-hoc sleeps / timeouts)
function waitForSelectors(page, selectors = [], options = { timeout: 30000 }) {
  return new Promise(async (resolve, reject) => {
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: options.timeout });
        return resolve(sel);
      } catch (err) {
        // try next selector
      }
    }
    return reject(new Error(`None of the selectors were found: ${selectors.join(" | ")}`));
  });
}
function getTaxStatus(record) {
  try {
    const today = new Date();
    const dueDate = new Date(record.due_date);
    const delqDate = new Date(record.delq_date);
    const amountDue = parseFloat((record.amount_due || "0").replace(/[$,]/g, ""));

    if (isNaN(dueDate.getTime()) || isNaN(delqDate.getTime())) {
      return amountDue === 0 ? "Paid" : "Due";
    }
    if (amountDue === 0) return "Paid";
    if (today <= delqDate) return "Due";
    if (today > delqDate) return "Delinquent";
    return "Unknown";
  } catch (err) {
    console.log("getTaxStatus error:", err.message);
    return "Unknown";
  }
}

const updateTaxNotes = (data) => {
  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes = "ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/15";
    data.delinquent = "NONE";
    return data;
  }

  const sortedHistory = [...data.tax_history].sort((a, b) => parseInt(b.year) - parseInt(a.year));
  const latest = sortedHistory[0];

  const isRecordDelinquent = (record) => ["Unpaid", "Delinquent"].includes(record.status);
  const latestStatus = latest.status;
  const priorUnpaid = sortedHistory.slice(1).some(r => isRecordDelinquent(r));

  if (latestStatus === "Paid") {
    data.notes = priorUnpaid
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`;
    data.delinquent = priorUnpaid ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
  } else if (latestStatus === "Due" || latestStatus === "Unpaid") {
    const hasDelq = priorUnpaid;
    data.notes = hasDelq
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`;
    data.delinquent = hasDelq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "YES";
  } else if (latestStatus === "Delinquent") {
    data.notes = priorUnpaid
      ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`
      : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, 05/15`;
    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  }

  return data;
}

const benton_1 = (page, accountNumber) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!accountNumber) throw new Error("Account number empty");

      const baseurl = "https://assessment.bentoncountyor.gov/property-account-search/";
      // Use networkidle2 to ensure the JS that renders the search box has run
      await page.goto(baseurl, { waitUntil: "networkidle2", timeout: 90000 });

      // Increase timeout for server environments and add more generic selectors if they exist
      const searchTypeSelector = await waitForSelectors(page, [
        "#bcaps-search-type", 
        'input[name="searchTerm"]',
        'input[id*="search"]',
        'select[id*="search"]'
      ], { timeout: 30000 }).catch(() => null);
      if (!searchTypeSelector) {
        console.log(`benton_1: no known search input found for account ${accountNumber}`);
        throw new Error("Search input not found");
      }

      if (searchTypeSelector === "#bcaps-search-type") {
        await page.waitForFunction((sel) => {
          const el = document.querySelector(sel);
          return el && window.getComputedStyle(el).display !== 'none';
        }, { timeout: 30000 }, "#bcaps-search-type");

        await page.evaluate(() => {
          const select = document.querySelector("#bcaps-search-type");
          if (select) {
            select.value = "account";
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        await page.waitForFunction(() => {
          const el = document.querySelector("#bcaps-search-value");
          return el && window.getComputedStyle(el).display !== 'none';
        }, { timeout: 30000 });

        await page.evaluate((val) => {
          const input = document.querySelector("#bcaps-search-value");
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, accountNumber.toString());
      } else {
        await page.evaluate((val) => {
          const input = document.querySelector('input[name="searchTerm"]');
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, accountNumber.toString());
      }

      // Click Submit
      const submitSel = await waitForSelectors(page, ['input[name="bcaps-search-submitted"]', 'button[type="submit"]'], { timeout: 30000 }).catch(() => null);
      if (submitSel) {
        await page.evaluate((sel) => {
          const btn = document.querySelector(sel);
          if (btn) btn.click();
        }, submitSel);
      }

      const accordionButton = `#accordion-button-${accountNumber}`;
      await waitForSelectors(page, [accordionButton, `#bcaps-collapse${accountNumber}`], { timeout: 20000 });

      const collapseId = `#bcaps-collapse${accountNumber}`;
      const isExpanded = await page.$eval(collapseId, el => el.classList.contains("show")).catch(() => false);

      if (!isExpanded) {
        await page.evaluate((sel) => {
          const btn = document.querySelector(sel);
          if (btn) btn.click();
        }, accordionButton);
        await waitForSelectors(page, [`${collapseId}.show`], { timeout: 20000 });
      }

      // TAX LINK
      const taxButtonSelector = `#bcapsBtnLoadOverlayTAX-${accountNumber}`;
      await waitForSelectors(page, [taxButtonSelector], { timeout: 20000 });

      const taxLinkHref = await page.$eval(taxButtonSelector, el => {
        const a = el.closest("a");
        return a ? a.href : null;
      }).catch(() => null);

      if (!taxLinkHref) {
        console.log(`benton_1: tax link not found for ${accountNumber}`);
        throw new Error("Tax link not found");
      }

      const browser = page.browser();
      // Optimization: We don't need to open a new page just to get the URL.
      // We can use the href directly or let the next step handle navigation.
      
      resolve({
        taxSummaryUrl: taxLinkHref,
        accountNumber
      });
    } catch (err) {
      console.log(`BENTON_1_ERROR for account ${accountNumber}:`, err.message);
      try { await page.screenshot({ path: `/tmp/benton_error_1_${accountNumber}.png`, fullPage: true }); } catch (e) {}
      reject(new Error(err.message));
    }
  });
};

const benton_2 = (page, step1_data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { taxSummaryUrl, accountNumber } = step1_data || {};
      if (!taxSummaryUrl) throw new Error("Missing tax summary URL from step1");

      await page.goto(taxSummaryUrl, { waitUntil: "networkidle2", timeout: 90000 });
      await waitForSelectors(page, ['a[href*="download/?report=TaxSummaryAll"]', 'body'], { timeout: 30000 }).catch(() => {});

      // Click the "Taxes" tab explicitly to ensure the tax information is loaded/visible
      const taxesTabSelector = '#taxes-tab';
      const taxesTabExists = await page.$(taxesTabSelector);
      if (taxesTabExists) {
        await page.evaluate((sel) => {
          const tab = document.querySelector(sel);
          if (tab) {
            tab.scrollIntoView({ behavior: 'auto', block: 'center' });
            tab.click();
          }
        }, taxesTabSelector);
        // Short wait for tab content to transition
        await new Promise(r => setTimeout(r, 1000));
      }

      const accountData = await page.$eval("body", container => {
        const getAccountNumber = () => {
          const h3 = Array.from(document.querySelectorAll("h3")).find(h => h.textContent.includes("Account"));
          if (!h3) return "N/A";
          const text = h3.textContent.replace(/\u00A0/g, ' ').trim();
          const match = text.match(/Account\s+(\d+)/);
          return match ? match[1] : "N/A";
        };

        const getText = label => {
          const el = Array.from(container.querySelectorAll('span.font-weight-bold, p.font-weight-bold'))
            .find(e => e.textContent.trim() === label);
          return el?.nextElementSibling?.textContent.trim() || "N/A";
        };

        const getAssessedValue = () => {
          const table = container.querySelector('table.table.border');
          if (table) {
            const totalRow = table.querySelector('tr.table-secondary');
            if (totalRow) {
              const avCell = totalRow.querySelectorAll('td.text-right.font-weight-bold')[2];
              if (avCell) return avCell.innerText.trim();
            }
          }
          try {
            const labelSpan = Array.from(container.querySelectorAll('span.font-weight-bold'))
              .find(s => s.textContent.trim() === 'Assessed Value');
            if (labelSpan) {
              const valueCol = labelSpan.closest('.row')?.querySelector('.col-6:last-child');
              return valueCol?.querySelector('span.d-inline-block')?.innerText.trim() || '$0.00';
            }
          } catch (e) {}
          return '$0.00';
        };

        const getAmountDueFromSummary = () => {
          const divs = Array.from(document.querySelectorAll('div.border-primary.bg-light'));
          for (const div of divs) {
            const pTags = Array.from(div.querySelectorAll('p'));
            const isAmountDue = pTags.some(p => p.textContent.trim() === 'Amount Due');
            if (isAmountDue) {
              const amountP = pTags.find(p => p.classList.contains('font-weight-bold'));
              return amountP ? amountP.textContent.trim() : "$0.00";
            }
          }
          return "$0.00";
        };

        return {
          owner_name: [getText("Owner")],
          property_address: getText("Situs Address"),
          parcel_number: getAccountNumber(),
          total_assessed_value: getAssessedValue(),
          total_taxable_value: getAssessedValue(),
          taxing_authority: "Benton County Tax Collector, Oregon",
          tax_history: [],
          summary_amount_due: getAmountDueFromSummary(),
          notes: "",
          delinquent: "N/A"
        };
      });

      // Fetch modal data first to determine the latest year
      let modalData = await parsePaymentHistoryModal(page);
      let latestPaidYear = 0;
      if (modalData && modalData.length > 0) {
        latestPaidYear = Math.max(...modalData.map(r => parseInt(r.year)));
      }

      const summaryAmountDueVal = parseFloat(accountData.summary_amount_due.replace(/[$,]/g, "") || "0");
      
      if (summaryAmountDueVal > 0) {
        // If there is an amount due, create a record for the next year
        const nextYear = latestPaidYear > 0 ? latestPaidYear + 1 : new Date().getFullYear();
        const delqDateStr = `11/16/${nextYear}`;
        const delqDate = new Date(delqDateStr);
        const today = new Date();
        
        const status = today > delqDate ? "Delinquent" : "Due";

        accountData.tax_history = [{
          jurisdiction: "County",
          year: nextYear.toString(),
          base_amount: accountData.summary_amount_due,
          amount_paid: "$0.00",
          amount_due: accountData.summary_amount_due,
          mailing_date: "N/A",
          paid_date: "N/A",
          due_date: `11/15/${nextYear}`,
          delq_date: delqDateStr,
          good_through_date: "",
          status: status,
          payment_type: "Annual"
        }];
      } else {
        // No amount due, return the latest paid record from history
        if (modalData && modalData.length > 0) {
          const sortedModal = modalData.sort((a, b) => parseInt(b.year) - parseInt(a.year));
          accountData.tax_history = [sortedModal[0]];
        } else {
          accountData.tax_history = [];
        }
      }

      // Cleanup: remove temporary field
      delete accountData.summary_amount_due;

      if (!accountData.tax_history || accountData.tax_history.length === 0) {
        accountData.notes = "TAX HISTORY UNAVAILABLE";
        accountData.delinquent = "N/A";
        return resolve(accountData);
      }

      updateTaxNotes(accountData);
      resolve(accountData);
    } catch (err) {
      console.log(`BENTON_2_ERROR:`, err.message);
      if (page) {
        try { await page.screenshot({ path: `/tmp/benton_tax_summary_error_${Date.now()}.png`, fullPage: true }); } catch (e) {}
      }
      reject(new Error(err.message));
    }
  });
};

async function parsePaymentHistoryModal(page) {
  try {
    const modalButtonSelector = 'button[data-target="#paymentHistoryModal"]';
    const modalSelector = '#paymentHistoryModal';
    
    const hasButton = await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
    }, { timeout: 30000 }, modalButtonSelector).catch(() => null);
    
    if (!hasButton) {
      console.log("parsePaymentHistoryModal: Button not found or not visible");
      return null;
    }

    await page.evaluate((sel) => {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.scrollIntoView({ behavior: 'auto', block: 'center' });
        btn.click();
      }
    }, modalButtonSelector);
    
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el && (el.classList.contains('show') || window.getComputedStyle(el).display !== 'none');
    }, { timeout: 30000 }, modalSelector).catch(() => {});

    await new Promise(r => setTimeout(r, 1500));

    const modalData = await page.evaluate((modalSel) => {
      const modal = document.querySelector(modalSel);
      if (!modal) return null;

      const table = modal.querySelector('table');
      if (!table) return null;

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      if (rows.length === 0) return null;

      const results = [];
      
      const getRowData = (row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 4) return null;

        const year = cells[0].textContent.trim();
        const date = cells[2].textContent.trim();
        const amount = cells[3].textContent.trim();

        if (!year || !/^\d{4}$/.test(year)) return null;

        const finalAmount = amount || "$0.00";

        return {
          jurisdiction: "County",
          year: year,
          base_amount: finalAmount,
          amount_paid: finalAmount,
          amount_due: "$0.00",
          mailing_date: "N/A",
          paid_date: date || "N/A",
          due_date: `11/15/${year}`,
          delq_date: `11/16/${year}`,
          good_through_date: "",
          status: "Paid",
          payment_type: "Annual"
        };
      };

      for (const row of rows) {
        const data = getRowData(row);
        if (data) results.push(data);
      }
      return results.length > 0 ? results : null;
    }, modalSelector);

    // Close modal
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    return modalData;
  } catch (err) {
    console.log("CRITICAL_MODAL_ERROR:", err.message);
    return null;
  }
}

const account_search = async (browser, account) => {
  let context;
  let mainPage;

  try {
    if (!account) throw new Error("Account parameter empty");

    context = await browser.createBrowserContext();
    mainPage = await context.newPage();
    mainPage.setDefaultNavigationTimeout(90000);
    await mainPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    await mainPage.setRequestInterception(true);
    mainPage.on("request", (req) => {
      const resourceType = req.resourceType();
      // Only block font and image to allow essential scripts/styles to load on the search page
      if (["font", "image"].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const step1_data = await benton_1(mainPage, account);
    const final_data = await benton_2(mainPage, step1_data);

    return final_data;
  } catch (err) {
    console.log(`account_search error for account ${account}:`, err.message);
    throw new Error(err.message);
  } finally {
    try { if (mainPage && !mainPage.isClosed()) await mainPage.close(); } catch (_) {}
    try { if (context) await context.close(); } catch (_) {}
  }
};


const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    //  FIXED fetch_type validation
    if (!["html", "api"].includes(fetch_type)) {
      return res.status(400).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const browser = await getBrowserInstance();

    const result = await account_search(browser, account);

    if (fetch_type === "html") {
      return res.status(200).render("parcel_data_official", result);
    }

    if (fetch_type === "api") {
      return res.status(200).json({ result });
    }

  } catch (error) {
    console.log("search error:", error.message);

    const errOut = {
      error: true,
      message: error.message,
    };

    if (fetch_type === "html") {
      return res.status(500).render("error_data", errOut);
    }
    return res.status(500).json(errOut);
  }
};

export { search };
