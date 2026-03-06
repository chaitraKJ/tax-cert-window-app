//Author Nithyananda R S 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const BEAUFORT_CONFIG = {
  url: "https://sc-beaufort.publicaccessnow.com/Searches/Real.aspx",
  authority: "Beaufort County Treasurer, Beaufort, SC"
};

const SELECTORS = {
  SEARCH_INPUT: 'input[type="text"][placeholder="Search..."]',
  SEARCH_BUTTON: 'button.btn.btn-outline-primary.btn-icon[title="Search"]',
  VIEW_ACCOUNT_LINK: 'a.k-button-icontext.k-button.k-primary[title*="View Account"]',
  OWNER_NAME: '.row.m-3 .col.col-md:first-child .font-weight-bold.text-uppercase',
  PROPERTY_ADDRESS: '.row.m-3 .col.col-md:nth-child(2) > div:nth-child(2) .font-weight-bold.text-uppercase',
  PROPERTY_ID: '.row.m-3 .col.col-md:nth-child(2) > div:nth-child(1) .font-weight-bold',
  BILL_GROUPS: 'payment-bill-group',
  FUNDS_BREAKDOWN_BUTTON: 'button.btn.tile-header-link',
  AMOUNT_DUE_MODAL: 'td.text-center span',
  PAYMENT_HISTORY_TABLE: 'display-data table.table-striped.table-bordered tbody tr'
};

function log(level, message, meta = {}) {
  if (level === "info") return;
  console[level]?.(JSON.stringify({ level, timestamp: new Date().toISOString(), message, ...meta }));
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeParcelNumber(input) {
  const plain = (input || "").toString().trim().toUpperCase();
  return { plain, formatted: plain };
}

function formatCurrency(str) {
  if (!str) return "$0.00";
  const cleaned = str.replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? "$0.00" : `$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function parseDateString(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "N/A") return null;
  
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    let [month, day, year] = parts;
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      year = yearNum >= 0 && yearNum <= 50 ? `20${year}` : `19${year}`;
    }
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
  }
  
  return dateStr;
}

function calculateDelqDate(dueDate) {
  if (!dueDate) return "N/A";
  
  const parts = dueDate.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    date.setDate(date.getDate() + 1);
    
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  }
  
  return "N/A";
}

async function performSearch(page, parcelInfo) {
  const { plain } = parcelInfo;

  await page.goto(BEAUFORT_CONFIG.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(SELECTORS.SEARCH_INPUT, { timeout: 30000 });
  
  await page.click(SELECTORS.SEARCH_INPUT, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(SELECTORS.SEARCH_INPUT, plain, { delay: 100 });
  
  await page.evaluate((val) => {
    const input = document.querySelector('input[type="text"][placeholder="Search..."]');
    if (input) {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, plain);

  await page.evaluate(() => {
    const btn = document.querySelector('button.btn.btn-outline-primary.btn-icon[title="Search"]');
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
    page.click(SELECTORS.SEARCH_BUTTON)
  ]);
}

async function clickViewAccount(page) {
  await page.waitForSelector(SELECTORS.VIEW_ACCOUNT_LINK, { timeout: 30000 });
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click(SELECTORS.VIEW_ACCOUNT_LINK)
  ]);
}

async function extractAccountInfo(page) {
  await page.waitForSelector('.row.m-3', { timeout: 30000 });
  
  return await page.evaluate(() => {
    // Extract Owner Name
    const ownerEl = document.querySelector('.row.m-3 .col.col-md:first-child .font-weight-bold.text-uppercase');
    let ownerName = "N/A";
    if (ownerEl) {
      ownerName = ownerEl.textContent.trim().replace(/,\s*$/, '');
    }
    
    // Extract Property Address
    const addressContainers = document.querySelectorAll('.row.m-3 .col.col-md:nth-child(2) > div');
    let propertyAddress = "N/A";
    for (let container of addressContainers) {
      const label = container.querySelector('.breakRow');
      if (label && label.textContent.includes('Property Address:')) {
        const addressEl = container.querySelector('.font-weight-bold.text-uppercase');
        if (addressEl) {
          propertyAddress = addressEl.textContent.trim();
          break;
        }
      }
    }
    
    // Extract Property ID (Parcel Number)
    const propertyIdContainers = document.querySelectorAll('.row.m-3 .col.col-md:nth-child(2) > div');
    let parcelNumber = "N/A";
    for (let container of propertyIdContainers) {
      const label = container.querySelector('.breakRow');
      if (label && label.textContent.includes('Property ID:')) {
        const idEl = container.querySelector('.font-weight-bold');
        if (idEl) {
          parcelNumber = idEl.textContent.trim();
          break;
        }
      }
    }
    
    return {
      owner_name: ownerName,
      property_address: propertyAddress,
      parcel_number: parcelNumber
    };
  });
}

async function extractBillsDue(page) {
  try {
    await page.waitForSelector('payment-bill-group', { timeout: 10000 });
    
    const bills = await page.evaluate(() => {
      const bills = [];
      const billGroups = document.querySelectorAll('payment-bill-group');
      
      billGroups.forEach(group => {
        const tileHeader = group.querySelector('.tile-header');
        if (!tileHeader) return;
        
        const yearMatch = tileHeader.textContent.match(/Tax Year:\s*(\d{4})/);
        const billNumberMatch = tileHeader.textContent.match(/Bill Number\s*:\s*(\d+)/);
        
        const grid = group.nextElementSibling;
        if (!grid || !grid.tagName.toLowerCase().includes('payment-bill-grid')) return;
        
        const statusEl = grid.querySelector('.status span:last-child');
        const dueDateEl = grid.querySelector('.col-sm-6:nth-child(3) .grid-item');
        const paidEl = grid.querySelector('.col-sm-6:nth-child(5) .grid-item');
        const owedEl = grid.querySelector('.col-sm-6:nth-child(6) .grid-item');
        
        const statusText = statusEl ? statusEl.textContent.trim() : "N/A";
        
        bills.push({
          year: yearMatch ? yearMatch[1] : "N/A",
          bill_number: billNumberMatch ? billNumberMatch[1] : "N/A",
          status: statusText,
          due_date: dueDateEl ? dueDateEl.textContent.trim() : "N/A",
          paid: paidEl ? paidEl.textContent.trim() : "-",
          owed: owedEl ? owedEl.textContent.trim() : "-",
          isPastDue: statusText.toLowerCase().includes("past due")
        });
      });
      
      return bills;
    });
    
    log("info", "Bills due extracted", { count: bills.length, bills });
    return bills;
  } catch (err) {
    log("info", "No unpaid bills section found - taxes may be fully paid", { error: err.message });
    return [];
  }
}

async function clickFundsBreakdownAndGetAmount(page, billIndex) {
  try {
    await page.waitForSelector('payment-bill-group', { timeout: 10000 }).catch(() => {});
    await delay(500);
    
    // Click the Funds Breakdown button
    const clicked = await page.evaluate((index) => {
      // Find all potential breakdown buttons
      const buttons = Array.from(document.querySelectorAll('button.btn.tile-header-link, button.btn[title*="Breakdown"], button.btn:has(i.k-i-file-txt)'));
      
      // Filter buttons that actually contain "Breakdown" text if multiple found
      const breakdownButtons = buttons.filter(b => b.textContent.toLowerCase().includes('breakdown') || b.title.toLowerCase().includes('breakdown'));
      
      const targetButton = breakdownButtons.length > index ? breakdownButtons[index] : buttons[index];
      
      if (targetButton) {
        targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetButton.click();
        return true;
      }
      
      // Final fallback: try to find by bill group again but more flexibly
      const groups = document.querySelectorAll('payment-bill-group');
      if (index < groups.length) {
        const btn = groups[index].querySelector('button');
        if (btn) {
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          btn.click();
          return true;
        }
      }
      
      return false;
    }, billIndex);
    
    if (!clicked) {
      log("warn", `Funds breakdown button not found for bill index ${billIndex}`);
      return null;
    }
    
    // Wait for either the breakdown table or a common element on that page
    try {
      await page.waitForSelector('table', { timeout: 10000 });
    } catch (e) {
      log("warn", "Breakdown table not loaded within 10s");
    }
    
    await delay(500); 
    
    // Extract amount from the breakdown table
    const extractedAmount = await page.evaluate((selector) => {
      // Look for the specific selector provided by the user
      const spans = Array.from(document.querySelectorAll(selector));
      
      // If there are multiple, usually the total is the last one or in a row with 'Total'
      if (spans.length > 0) {
        // First, check if any span is in a row containing "Total"
        for (let span of spans) {
          const row = span.closest('tr');
          if (row && row.textContent.toLowerCase().includes('total')) {
            const text = span.textContent.trim();
            if (text.match(/[\d,]+\.\d{2}/)) return text;
          }
        }
        
        // If no "Total" row found, try to find the one that looks most like a total (often the last one)
        for (let i = spans.length - 1; i >= 0; i--) {
          const text = spans[i].textContent.trim();
          if (text.match(/[\d,]+\.\d{2}/)) {
            const val = parseFloat(text.replace(/,/g, ''));
            if (val > 0) return text;
          }
        }
      }

      // Fallback: look for any cell that contains a currency amount
      const cells = Array.from(document.querySelectorAll('td'));
      
      // Try to find "Total" or similar row first
      const rows = Array.from(document.querySelectorAll('tr'));
      for (let row of rows) {
        if (row.textContent.toLowerCase().includes('total')) {
          const amountCell = row.querySelector('td:last-child');
          if (amountCell) {
            const text = amountCell.textContent.trim();
            if (text.match(/[\d,]+\.\d{2}/)) return text;
          }
        }
      }

      // Fallback: look for any cell with a currency-like amount > 0
      for (let cell of cells) {
        const text = cell.textContent.trim().replace('$', '').replace(',', '');
        if (text.match(/^\d+\.\d{2}$/) && parseFloat(text) > 0) {
          return cell.textContent.trim();
        }
      }
      
      return null;
    }, SELECTORS.AMOUNT_DUE_MODAL);
    
    // Click the Return button to go back
    await delay(200);
    
    const returnClicked = await page.evaluate(() => {
      const selectors = [
        'button.k-button.k-primary[title="Return"]',
        'button[aria-label="Return"]',
        'button.k-button:has(.k-i-undo)',
        'button:has(.k-icon.k-i-undo)'
      ];
      
      for (let selector of selectors) {
        const button = document.querySelector(selector);
        if (button) {
          button.click();
          return true;
        }
      }
      
      // Fallback: find button with "Return" text
      const allButtons = Array.from(document.querySelectorAll('button'));
      const returnBtn = allButtons.find(b => b.textContent.includes('Return'));
      if (returnBtn) {
        returnBtn.click();
        return true;
      }
      
      return false;
    });
    
    if (returnClicked) {
      await page.waitForSelector(SELECTORS.BILL_GROUPS, { timeout: 10000 }).catch(() => {});
    } else {
      log("warn", "Return button not found - trying to navigate back");
      await page.goBack();
      await page.waitForSelector(SELECTORS.BILL_GROUPS, { timeout: 10000 }).catch(() => {});
    }
    
    return extractedAmount;
  } catch (err) {
    log("warn", "Could not extract amount from funds breakdown", { error: err.message });
    return null;
  }
}

async function extractAssessedValues(page) {
  try {
    await page.waitForSelector('display-data table.table-striped.table-bordered', { timeout: 10000 }).catch(() => {});
    await delay(500);
    
    return await page.evaluate(() => {
      const tables = document.querySelectorAll('display-data table.table-striped.table-bordered');
      let landValue = "N/A";
      let improvements = "N/A";
      let totalAssessed = "N/A";
      let exemption = "N/A";
      let taxableValue = "N/A";
      
      for (let table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        
        for (let row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 4) {
            const label1 = cells[0].textContent.trim();
            const value1 = cells[1].textContent.trim();
            const label2 = cells[2].textContent.trim();
            const value2 = cells[3].textContent.trim();
            
            // Check Current Year column (index 2,3)
            if (label2.includes('Appraised Value Land')) {
              landValue = value2;
            }
            if (label2.includes('Appraised Value Improvements')) {
              improvements = value2;
            }
            if (label2.includes('Assessed Value') && !label2.includes('Total')) {
              totalAssessed = value2;
            }
            if (label2.includes('Exemption Amount')) {
              exemption = value2;
            }
            if (label2.includes('Taxable Value')) {
              taxableValue = value2;
            }
          }
        }
      }
      
      return {
        land_value: landValue,
        improvements: improvements,
        total_assessed_value: totalAssessed,
        exemption: exemption,
        taxable_value: taxableValue
      };
    });
  } catch (err) {
    log("warn", "Could not extract assessed values", { error: err.message });
    return {
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: "N/A",
      exemption: "N/A",
      taxable_value: "N/A"
    };
  }
}

async function extractPaymentHistory(page) {
  try {
    await page.waitForSelector(SELECTORS.PAYMENT_HISTORY_TABLE, { timeout: 10000 });
    await delay(500);
    
    const history = await page.evaluate(() => {
      const rows = document.querySelectorAll('display-data table.table-striped.table-bordered tbody tr');
      const history = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          // Extract year from the span with title attribute
          const yearCell = cells[0].querySelector('span.thumbnail');
          const year = yearCell ? yearCell.textContent.trim() : cells[0].textContent.trim();
          
          history.push({
            year: year,
            bill_number: cells[1].textContent.trim(),
            paid_date: cells[2].textContent.trim(),
            receipt_number: cells[3].textContent.trim(),
            amount_paid: cells[4].textContent.trim()
          });
        }
      });
      
      return history;
    });
    
    log("info", "Payment history extracted", { count: history.length, latest: history[0] });
    return history;
  } catch (err) {
    log("warn", "Payment history not found", { error: err.message });
    return [];
  }
}

function getStatus(bill, currentDate = new Date()) {
  const statusText = (bill.status || "").toLowerCase();
  
  // If explicitly says paid, it's paid
  if (statusText === "paid") {
    return "Paid";
  }

  // If we are here, we assume it's unpaid because it's from the extractBillsDue list
  const taxYear = parseInt(bill.year);
  if (!isNaN(taxYear)) {
    const dueDate = new Date(taxYear + 1, 0, 15); // Jan 15th of next year
    const delinquencyDate = new Date(taxYear + 1, 0, 16); // Jan 16th of next year

    if (currentDate > delinquencyDate) {
      return "Delinquent";
    } else if (currentDate > dueDate) {
      return "Due";
    }
  }

  return "Due";
}

function determineDelinquencyAndNotes(billsDue, paymentHistory) {
  const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/15';
  
  // If no unpaid bills, all taxes are paid
  if (!billsDue || billsDue.length === 0) {
    if (paymentHistory && paymentHistory.length > 0) {
      // Sort payment history by year descending
      const sortedHistory = [...paymentHistory].sort((a, b) => parseInt(b.year) - parseInt(a.year));
      const latestYear = sortedHistory[0].year;
      return {
        delinquent: "NONE",
        notes: `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}`,
        allPaid: true,
        latestBill: null
      };
    }
    return {
      delinquent: "NONE",
      notes: `ALL PRIORS ARE PAID, ${ANNUAL_PAYMENT_NOTE}`,
      allPaid: false,
      latestBill: null
    };
  }

  // Sort bills by year descending to find latest
  const sortedBills = [...billsDue].sort((a, b) => parseInt(b.year) - parseInt(a.year));
  
  // Evaluate status for each bill
  const billsWithStatus = sortedBills.map(bill => ({
    ...bill,
    evaluatedStatus: getStatus(bill)
  }));
  
  const latest = billsWithStatus[0];
  const latestYear = latest.year;
  const latestStatus = latest.evaluatedStatus.toUpperCase();
  
  // Get prior years (all except the latest)
  const priorBills = billsWithStatus.slice(1);

  // Check for delinquent bills
  const hasAnyDelinquent = billsWithStatus.some(b => b.evaluatedStatus === "Delinquent");
  const hasPriorDelinquent = priorBills.some(b => b.evaluatedStatus === "Delinquent");

  let notes;
  let delinquent = hasAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

  if (hasPriorDelinquent) {
    notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus}, ${ANNUAL_PAYMENT_NOTE}`;
  } else {
    notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestStatus}, ${ANNUAL_PAYMENT_NOTE}`;
  }

  log("info", "Delinquency analysis complete", { 
    delinquent, 
    notes,
    hasAnyDelinquent,
    hasPriorDelinquent,
    latestYear, 
    latestStatus,
    totalBills: billsDue.length 
  });

  return { delinquent, notes, allPaid: false, latestBill: latest };
}

function buildTaxHistory(billsDue, paymentHistory, allPaid, assessedValues) {
  const history = [];
  
  // If all taxes are paid, return only the latest year from payment history
  if (allPaid && paymentHistory && paymentHistory.length > 0) {
    // Sort payment history by year descending to ensure we get the latest
    const sortedHistory = [...paymentHistory].sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const latest = sortedHistory[0];
    
    log("info", "Building paid tax history for latest year", { year: latest.year, amount: latest.amount_paid });
    
    const paidDate = parseDateString(latest.paid_date);
    const baseAmount = formatCurrency(latest.amount_paid);
    
    // Calculate due date and delinquent date for the paid year
    const yearNum = parseInt(latest.year);
    const dueDate = `01/15/${yearNum + 1}`;
    const delqDate = `01/16/${yearNum + 1}`;
    
    history.push({
      jurisdiction: "County",
      year: latest.year,
      status: "Paid",
      payment_type: "Annual",
      base_amount: baseAmount,
      county_tax: baseAmount,
      city_tax: "N/A",
      fees: "N/A",
      penalty: "N/A",
      cost: "N/A",
      amount_paid: baseAmount,
      amount_due: "$0.00",
      paid_date: paidDate || " ",
      due_date: dueDate,
      delq_date: delqDate,
      land_value: assessedValues.land_value || "N/A",
      improvements: assessedValues.improvements || "N/A",
      total_assessed_value: assessedValues.total_assessed_value || "N/A",
      exemptions_breakdown: {
        residential_exemption: "N/A",
        homestead_exemption: "N/A",
        other_exemptions: "N/A",
        local_option_credit: "N/A"
      }
    });
    
    log("info", "Paid tax history built", { year: latest.year, status: "Paid" });
    return history;
  }
  
  // If there are unpaid bills, add all of them
  log("info", "Building unpaid tax history", { billsCount: billsDue.length });
  
  billsDue.forEach(bill => {
    const status = getStatus(bill);
    
    // Parse the due date from the bill
    let dueDate = "N/A";
    let delqDate = "N/A";
    
    if (bill.due_date && bill.due_date !== "-" && bill.due_date !== "N/A") {
      // Due date is already in the bill (e.g., "1/15/25")
      dueDate = parseDateString(bill.due_date);
      delqDate = calculateDelqDate(dueDate);
    } else {
      // If no due date in bill, calculate it as 01/15 of the tax year + 1
      const yearNum = parseInt(bill.year);
      dueDate = `01/15/${yearNum + 1}`;
      delqDate = `01/16/${yearNum + 1}`;
    }
    
    const amountDue = bill.owed && bill.owed !== "-" ? formatCurrency(bill.owed) : "N/A";
    const baseAmount = bill.base_amount ? formatCurrency(bill.base_amount) : amountDue;
    
    log("info", `Building history for year ${bill.year}`, { 
      status, 
      dueDate, 
      delqDate, 
      amountDue,
      baseAmount
    });
    
    history.push({
      jurisdiction: "County",
      year: bill.year,
      status: status,
      payment_type: "Annual",
      base_amount: baseAmount,
      county_tax: baseAmount,
      city_tax: "N/A",
      fees: "N/A",
      penalty: "N/A",
      cost: "N/A",
      amount_paid: "$0.00",
      amount_due: amountDue,
      paid_date: " ",
      due_date: dueDate,
      delq_date: delqDate,
      land_value: assessedValues.land_value || "N/A",
      improvements: assessedValues.improvements || "N/A",
      total_assessed_value: assessedValues.total_assessed_value || "N/A",
      exemptions_breakdown: {
        residential_exemption: "N/A",
        homestead_exemption: "N/A",
        other_exemptions: "N/A",
        local_option_credit: "N/A"
      }
    });
  });
  
  // Sort by year descending
  history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
  
  log("info", "Unpaid tax history sorted", { 
    years: history.map(h => ({ 
      year: h.year, 
      status: h.status, 
      dueDate: h.due_date, 
      delqDate: h.delq_date 
    })) 
  });
  
  return history;
}

function safeResponse(accountInfo, notes, delinquent, history, authority, assessedValues) {
  return {
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: Array.isArray(accountInfo.owner_name) ? accountInfo.owner_name : [accountInfo.owner_name],
    property_address: accountInfo.property_address,
    parcel_number: accountInfo.parcel_number,
    land_value: assessedValues.land_value || "N/A",
    improvements: assessedValues.improvements || "N/A",
    total_assessed_value: assessedValues.total_assessed_value || "N/A",
    exemption: assessedValues.exemption || "N/A",
    total_taxable_value: assessedValues.taxable_value || "N/A",
    taxing_authority: authority,
    notes,
    delinquent,
    tax_history: history,
    property_details: {}
  };
}

function handleNotFound(parcel, authority) {
  const emptyAssessedValues = {
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    taxable_value: "N/A"
  };
  
  return safeResponse(
    { owner_name: ["NO RECORDS FOUND"], property_address: "NO RECORDS FOUND", parcel_number: parcel },
    "NO TAX RECORDS FOUND.",
    "N/A",
    [],
    authority,
    emptyAssessedValues
  );
}

const getTaxData = async (page, parcelInput, config) => {
  const parcelInfo = sanitizeParcelNumber(parcelInput);
  const { authority } = config;

  try {
    await performSearch(page, parcelInfo);
    await clickViewAccount(page);
    
    // Extract account info (owner, address, parcel)
    const accountInfo = await extractAccountInfo(page);
    log("info", "Account info extracted", accountInfo);
    
    // Extract assessed values
    const assessedValues = await extractAssessedValues(page);
    log("info", "Assessed values extracted", assessedValues);
    
    // Extract bills due (unpaid)
    const billsDue = await extractBillsDue(page);
    
    // Extract payment history
    const paymentHistory = await extractPaymentHistory(page);
    
    // If no bills and no payment history, not found
    if (billsDue.length === 0 && paymentHistory.length === 0) {
      log("warn", "No bills or payment history found");
      return handleNotFound(parcelInfo.plain, authority);
    }

    // Try to get amounts from Funds Breakdown for unpaid bills BEFORE determining delinquency
    for (let i = 0; i < billsDue.length; i++) {
      const breakdownAmount = await clickFundsBreakdownAndGetAmount(page, i);
      if (breakdownAmount) {
        billsDue[i].base_amount = breakdownAmount;
        // If owed amount is missing or zero, use the breakdown amount
        if (billsDue[i].owed === "-" || billsDue[i].owed === "N/A" || billsDue[i].owed === "$0.00" || billsDue[i].owed === "0.00") {
          billsDue[i].owed = breakdownAmount;
        }
        log("info", `Amounts updated for year ${billsDue[i].year}`, { base: billsDue[i].base_amount, owed: billsDue[i].owed });
      }
    }

    // Determine if all taxes are paid
    const { delinquent, notes, allPaid, latestBill } = determineDelinquencyAndNotes(billsDue, paymentHistory);
    log("info", "Delinquency determined", { delinquent, allPaid, billsDueCount: billsDue.length, paymentHistoryCount: paymentHistory.length });

    const taxHistory = buildTaxHistory(billsDue, paymentHistory, allPaid, assessedValues);
    log("info", "Tax history built", { historyCount: taxHistory.length, allPaid });

    return safeResponse(accountInfo, notes, delinquent, taxHistory, authority, assessedValues);
  } catch (err) {
    log("error", "Scraping failed", { error: err.message, stack: err.stack, parcel: parcelInfo?.plain });
    return handleNotFound(parcelInfo.plain, authority);
  }
};

const search = async (req, res) => {
  if (!req.body?.account) {
    return res.status(400).json({ error: true, message: "Parcel number required" });
  }

  const parcelInput = req.body.account.trim();
  let browserContext = null;
  let page = null;

  try {
    const browser = await getBrowserInstance();
    // Using a new context for isolation, but ensuring strict cleanup
    browserContext = await browser.createBrowserContext();
    page = await browserContext.newPage();
    
    // Strict memory limits and timeouts
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    
    // Memory Optimization: Block EVERYTHING except essential scripts and document
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url().toLowerCase();
      
      // Block common heavy third-party scripts and all non-essential assets
      if (
        ['image', 'stylesheet', 'font', 'media', 'manifest', 'other', 'texttrack', 'eventsource', 'websocket'].includes(resourceType) ||
        url.includes('google-analytics') || 
        url.includes('doubleclick') || 
        url.includes('facebook') || 
        url.includes('fontawesome')
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.setCacheEnabled(false);
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");
    
    // Minimal viewport to save memory on rendering
    await page.setViewport({ width: 800, height: 600 });

    const data = await getTaxData(page, parcelInput, BEAUFORT_CONFIG);

    if (req.body.fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (err) {
    log("error", "Server error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: true, message: "Server error" });
  } finally {
    if (page) {
      // Clear page content and navigate to about:blank to free memory before closing
      await page.evaluate(() => { document.body.innerHTML = ""; }).catch(() => {});
      await page.goto('about:blank').catch(() => {});
      await page.close().catch(() => {});
    }
    if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }
};
module.exports = { search };