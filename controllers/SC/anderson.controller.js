//Author:- Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const CONFIG = {
  DISCLAIMER_URL: "https://acpass.andersoncountysc.org/loginreg3/login.php",
  AUTHORITY: "Anderson County Treasurer, Anderson, SC",
  CURRENT_YEAR: new Date().getFullYear(),
  MAX_YEARS_BACK: 10,
  TIMEOUTS: {
    PAGE_LOAD: 60000,
    NAVIGATION: 30000,
    SELECTOR: 30000,
    SHORT: 30000,
  },
  CREDENTIALS: {
    EMAIL: "demo@123.com",
    PASSWORD: "12345678",
  },
  SELECTORS: {
    LOGIN_EMAIL: "input[name='email']",
    LOGIN_PASSWORD: "input[name='password']",
    LOGIN_SUBMIT: "input[name='login']",
    ACCEPT_BTN: "img[src*='accept.gif'], input[value*='Accept'], button, a.btn, a[href*='welcome.htm'], a[href*='index2.htm']",
    REAL_PROP_MENU: "a[href*='real_prop'], a[href='real_prop.htm'], area[href*='real_prop'], a[href*='Real_Prop'], a[href*='realprop'], a[href*='REAL_PROP']",
    PROP_INFO_LINK: "a[href*='search'], a[href*='real_prop_search'], area[href*='search'], a[href*='Search'], a[href*='prop_info'], a[href*='SEARCH']",
    MAP_INPUT: "input[name='QryMapNo'], input[id*='MapNo'], input[name*='Map'], input[name*='map']",
    SEARCH_BTN: "input[name='Sumbit'], input[value*='Search'], input[type='submit']",
    TAX_LINK: "img[src*='taxes.gif']",
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * ERRORS & LOGGING
 * ═══════════════════════════════════════════════════════════════════════ */
class AndersonScraperError extends Error {
  constructor(message, code, retryable = false, context = {}) {
    super(message);
    this.name = "AndersonScraperError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
  }
}

class NoRecordsError extends AndersonScraperError {
  constructor(mapNo) {
    super(`No records found for Map No ${mapNo}`, "NO_RECORDS", false, { mapNo });
  }
}

const log = (level, mapNo, step, msg = "", meta = {}) => {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  const line = `[${level.toUpperCase()}] ${time} [MAP:${mapNo}] ${step} ${msg}`;
  console[level in console ? level : "error"](line, meta.error ? { error: meta.error } : "");
};

/* ═══════════════════════════════════════════════════════════════════════
 * UTILS
 * ═══════════════════════════════════════════════════════════════════════ */
const validateMapNo = (mapNo) => {
  if (!mapNo || typeof mapNo !== "string") throw new AndersonScraperError("Invalid Map No", "VALIDATION", false);
  const clean = mapNo.replace(/[-\s]/g, "");
  if (!/^\d+$/.test(clean)) throw new AndersonScraperError("Map No must be numeric", "VALIDATION", false);
  return clean.padStart(11, "0");
};

const formatCurrency = (v) => {
  if (!v || v === "N/A") return "$0.00";
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
};

const clickWhenReady = async (page, sel, mapNo, step) => {
  try {
    await page.waitForSelector(sel, { visible: true, timeout: CONFIG.TIMEOUTS.SELECTOR });
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {}),
      page.click(sel),
    ]);
    return response;
  } catch (e) {
    log("error", mapNo, step, `Click failed: ${e.message}`);
    throw new AndersonScraperError(`Selector not found: ${sel}`, "SELECTOR", true, { sel, mapNo, step });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * NAVIGATION HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */
const clickSelectorInAnyFrame = async (page, selector, mapNo, step) => {
  const clicked = await page.evaluate((sel) => {
    const findAndClick = (doc) => {
      if (!doc) return false;
      const elements = Array.from(doc.querySelectorAll(sel));
      const el = elements.find(e => {
        const style = window.getComputedStyle(e);
        return style && style.display !== 'none' && style.visibility !== 'hidden' && e.offsetParent !== null;
      });
      if (el) {
        el.scrollIntoView();
        el.click();
        return true;
      }
      return false;
    };
    if (findAndClick(document)) return true;
    const frames = Array.from(document.querySelectorAll('iframe, frame'));
    for (const f of frames) {
      try { if (findAndClick(f.contentDocument)) return true; } catch(e) {}
    }
    return false;
  }, selector);

  if (clicked) {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {});
    return true;
  }
  return false;
};

const clickLinkByText = async (page, text, mapNo, step) => {
  const clicked = await page.evaluate((txt) => {
    const findLink = (doc) => {
      if (!doc) return false;
      const links = Array.from(doc.querySelectorAll('a, button, input[type="button"], area, img'));
      for (const a of links) {
        const style = window.getComputedStyle(a);
        const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && (a.tagName === 'AREA' || a.offsetParent !== null);
        if (!isVisible) continue;

        const content = a.tagName === 'INPUT' ? a.value : (a.tagName === 'IMG' ? a.alt || a.src : a.textContent);
        if ((content || "").trim().toLowerCase().includes(txt.toLowerCase())) {
          a.scrollIntoView();
          a.click();
          return true;
        }
        if (a.href && a.href.toLowerCase().includes(txt.toLowerCase())) {
          a.scrollIntoView();
          a.click();
          return true;
        }
      }
      return false;
    };

    if (findLink(document)) return true;
    const iframes = Array.from(document.querySelectorAll('iframe, frame'));
    for (const frame of iframes) {
      try { if (findLink(frame.contentDocument)) return true; } catch (e) {}
    }
    return false;
  }, text);

  if (clicked) {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {});
    return true;
  }
  return false;
};

/* ═══════════════════════════════════════════════════════════════════════
 * NAVIGATION
 * ═══════════════════════════════════════════════════════════════════════ */
const login = async (page, mapNo) => {
  try {
    await page.goto(CONFIG.DISCLAIMER_URL, { waitUntil: "networkidle2", timeout: CONFIG.TIMEOUTS.PAGE_LOAD });
    
    // Check if login form exists
    const emailInput = await page.$(CONFIG.SELECTORS.LOGIN_EMAIL);
    if (emailInput) {
      await page.type(CONFIG.SELECTORS.LOGIN_EMAIL, CONFIG.CREDENTIALS.EMAIL, { delay: 50 });
      await page.type(CONFIG.SELECTORS.LOGIN_PASSWORD, CONFIG.CREDENTIALS.PASSWORD, { delay: 50 });
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {}),
        page.click(CONFIG.SELECTORS.LOGIN_SUBMIT),
      ]);
      
      // Extra wait for any post-login redirects or session setup
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    // Keep failure logic silent if login isn't needed
  }
};

const acceptDisclaimer = async (page, mapNo) => {
  try {
    const currentUrl = page.url();

    // 1. If we are on index.htm or similar landing pages, we MUST click through
    if (currentUrl.includes("index.htm") || currentUrl.endsWith(".org/")) {
      const selectorsToTry = [
        CONFIG.SELECTORS.ACCEPT_BTN,
        "img[src*='accept']",
        "img[src*='agree']",
        "a[href*='welcome']",
        "a[href*='index2']",
        "input[value*='Accept']",
        "button"
      ];

      for (const sel of selectorsToTry) {
        const clicked = await clickSelectorInAnyFrame(page, sel, mapNo, "ACCEPT_DISCLAIMER_STEP");
        if (clicked) {
          await new Promise(r => setTimeout(r, 2000));
          if (!page.url().includes("index.htm")) return; // Success
        }
      }

      // Try text-based clicks
      for (const text of ["Accept", "Agree", "Enter", "Continue", "I Agree"]) {
        const clicked = await clickLinkByText(page, text, mapNo, "ACCEPT_DISCLAIMER_TEXT");
        if (clicked) {
          await new Promise(r => setTimeout(r, 2000));
          if (!page.url().includes("index.htm")) return; // Success
        }
      }

      // Final fallback for index.htm: Force navigation to welcome.htm
      await page.goto("https://acpass.andersoncountysc.org/welcome.htm", { waitUntil: "networkidle2" }).catch(() => {});
      return;
    }

    // 2. Check if we are already where we need to be
    const hasMenu = await page.evaluate((sel) => {
      const find = (doc) => doc && doc.querySelector(sel);
      if (find(document)) return true;
      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      for (const f of frames) {
        try { if (find(f.contentDocument)) return true; } catch(e) {}
      }
      return false;
    }, CONFIG.SELECTORS.REAL_PROP_MENU);

    if (hasMenu) return;

    // 3. Try clicking general accept buttons in any frame if we aren't on index.htm but still see a disclaimer
    const acceptClicked = await clickSelectorInAnyFrame(page, CONFIG.SELECTORS.ACCEPT_BTN, mapNo, "ACCEPT_DISCLAIMER");
    if (acceptClicked) {
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    // Silent skip
  }
};

const goToSearch = async (page, mapNo) => {
  try {
    // If on welcome.htm, give frames a moment to load
    if (page.url().includes("welcome.htm")) {
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // 1. Check if we are already on the search page (MAP_INPUT exists)
    const onSearchPage = await page.evaluate((selectors) => {
      const findInDoc = (doc) => {
        const selArray = selectors.split(', ');
        for (const sel of selArray) {
          if (doc.querySelector(sel)) return true;
        }
        return false;
      };
      if (findInDoc(document)) return true;
      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      for (const f of frames) {
        try { if (findInDoc(f.contentDocument)) return true; } catch(e) {}
      }
      return false;
    }, CONFIG.SELECTORS.MAP_INPUT);

    if (onSearchPage) return;

    // 2. Navigate through the menu
    const menuClicked = await clickSelectorInAnyFrame(page, CONFIG.SELECTORS.REAL_PROP_MENU, mapNo, "REAL_PROP_MENU");
    if (!menuClicked) {
      await clickLinkByText(page, "Real Property", mapNo, "GOTO_SEARCH_TEXT");
    }

    // 3. Navigate to the search page
    const searchClicked = await clickSelectorInAnyFrame(page, CONFIG.SELECTORS.PROP_INFO_LINK, mapNo, "PROP_SEARCH_LINK");
    if (!searchClicked) {
      const textClicked = await clickLinkByText(page, "Search", mapNo, "GOTO_SEARCH_TEXT");
      if (!textClicked) {
        await clickLinkByText(page, "Information", mapNo, "GOTO_SEARCH_TEXT");
      }
    }

    // 4. Final check
    const mapInputSelectors = CONFIG.SELECTORS.MAP_INPUT.split(', ');
    let foundInput = await page.evaluate((selectors) => {
      const findInDoc = (doc) => {
        const selArray = selectors.split(', ');
        for (const sel of selArray) {
          if (doc.querySelector(sel)) return true;
        }
        return false;
      };
      if (findInDoc(document)) return true;
      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      for (const f of frames) {
        try { if (findInDoc(f.contentDocument)) return true; } catch(e) {}
      }
      return false;
    }, CONFIG.SELECTORS.MAP_INPUT);

    if (!foundInput) {
      // Fallback: search for any input that might be the map search
      const alternativeFound = await page.evaluate(() => {
        const findInDoc = (doc) => {
          const inputs = Array.from(doc.querySelectorAll('input[type="text"], input:not([type])'));
          const mapInput = inputs.find(i => 
            (i.name?.toLowerCase().includes('map') || i.id?.toLowerCase().includes('map')) &&
            i.offsetParent !== null // ensure it's visible
          );
          if (mapInput) {
            mapInput.scrollIntoView();
            if (!mapInput.id) mapInput.id = 'temp_map_input_' + Date.now();
            return mapInput.id;
          }
          return null;
        };

        const foundId = findInDoc(document);
        if (foundId) return foundId;

        const iframes = Array.from(document.querySelectorAll('iframe, frame'));
        for (const frame of iframes) {
          try {
            const frameId = findInDoc(frame.contentDocument);
            if (frameId) return frameId;
          } catch (e) {}
        }
        return null;
      });

      if (!alternativeFound) {
        // Final Diagnostic: Log what we see
        const pageDiagnostics = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent.trim(), href: a.href })).slice(0, 10);
          const frames = Array.from(document.querySelectorAll('iframe, frame')).map(f => f.src);
          return { links, frames, title: document.title, url: window.location.href };
        });
        log("error", mapNo, "GOTO_SEARCH", `Search input not found. Diagnostics: ${JSON.stringify(pageDiagnostics)}`);
        throw new Error(`Search input not found on ${page.url()}. Check logs for diagnostics.`);
      }
    }
  } catch (e) {
    log("error", mapNo, "GOTO_SEARCH", `Navigation failed. Current URL: ${page.url()}. Error: ${e.message}`);
    throw e;
  }
};

const typeAndSubmit = async (page, mapNo) => {
  const mapInputSelectors = CONFIG.SELECTORS.MAP_INPUT.split(', ');
  let targetSelector = null;

  for (const sel of mapInputSelectors) {
    try {
      await page.waitForSelector(sel, { visible: true, timeout: 5000 });
      targetSelector = sel;
      break;
    } catch (e) {}
  }

  if (!targetSelector) {
    // Attempt to find it via JS if selector fails (including frames)
    const foundByJs = await page.evaluate(() => {
      const findInDoc = (doc) => {
        const inputs = Array.from(doc.querySelectorAll('input[type="text"], input:not([type])'));
        const mapInput = inputs.find(i => 
          (i.name?.toLowerCase().includes('map') || i.id?.toLowerCase().includes('map')) &&
          i.offsetParent !== null
        );
        if (mapInput) {
          if (!mapInput.id) mapInput.id = 'temp_map_input_' + Date.now();
          return '#' + mapInput.id;
        }
        return null;
      };

      const id = findInDoc(document);
      if (id) return id;

      const iframes = Array.from(document.querySelectorAll('iframe, frame'));
      for (const frame of iframes) {
        try {
          const fid = findInDoc(frame.contentDocument);
          if (fid) return fid;
        } catch (e) {}
      }
      return null;
    });
    targetSelector = foundByJs;
  }

  if (!targetSelector) throw new Error("Could not find Map No input field");

  await page.click(targetSelector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(mapNo);
  
  const searchBtnSelectors = CONFIG.SELECTORS.SEARCH_BTN.split(', ');
  for (const sel of searchBtnSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await clickWhenReady(page, sel, mapNo, "SEARCH_SUBMIT");
        return;
      }
    } catch (e) {}
  }
};

const scrapeSearchResults = async (page, mapNo) => {
 
  
  return page.evaluate(() => {
      const trim = (s) => (s || "").toString().replace(/\s+/g, " ").trim() || "N/A";
      const num = (s) => {
        const m = trim(s).match(/[\d,]+\.?\d*/);
        if (!m) return "0.00";
        const n = parseFloat(m[0].replace(/,/g, ""));
        const parts = n.toFixed(2).split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
      };
      
      // Find owner name - red font
      let ownerName = "N/A";
      const ownerFont = document.querySelector('td font[color="#FF0000"][size="2"]');
      if (ownerFont) {
        ownerName = trim(ownerFont.textContent)
          .replace(/\+/g, " & ")
          .replace(/LUIB.?$/gi, "LUIBRAND")
          .replace(/TRUS$/gi, "TRUST");
      }
      
      const allTds = Array.from(document.querySelectorAll('td'));
      
      // Find Physical Address from Property Information table
      let propertyAddress = "N/A";
      for (const td of allTds) {
        const font = td.querySelector('font[color="#000000"][size="2"]');
        if (font) {
          const val = trim(font.textContent);
          // Look for something that looks like an address (starts with digits, doesn't have breadcrumbs)
          if (val.match(/^\d+/) && !val.includes("=>") && !val.includes(">") && val.length < 100) {
            propertyAddress = val;
            break;
          }
        }
      }
      
      // Fallback for address if not found by font pattern
      if (propertyAddress === "N/A") {
        const allRows = Array.from(document.querySelectorAll('tr'));
        for (const row of allRows) {
          const cells = row.querySelectorAll('td');
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const labelFont = cell.querySelector('font[color="#FFFFFF"][size="2"]');
            if (labelFont && trim(labelFont.textContent) === "Physical Address") {
              const valueCell = cells[i + 1];
              if (valueCell) {
                const addressFont = valueCell.querySelector('font[color="#000000"][size="2"]');
                if (addressFont) {
                  propertyAddress = trim(addressFont.textContent);
                  break;
                }
              }
            }
          }
          if (propertyAddress !== "N/A") break;
        }
      }
      
      // Find Tax Value from Property Information table
      let taxableValue = "$0.00";
      const labels = ["tax value", "taxable value", "assessed value", "market value"];
      
      for (const label of labels) {
        for (const td of allTds) {
          const text = trim(td.textContent).toLowerCase();
          if (text === label || (text.includes(label) && td.getAttribute('bgcolor') === "#003300")) {
            const row = td.closest('tr');
            if (row) {
              const cells = Array.from(row.querySelectorAll('td'));
              const idx = cells.indexOf(td);
              if (cells[idx + 1]) {
                const valText = trim(cells[idx + 1].textContent);
                if (valText.match(/[\d,]+/)) {
                  taxableValue = "$" + num(valText);
                  break;
                }
              }
            }
          }
        }
        if (taxableValue !== "$0.00") break;
      }
      
      return {
        owner_name: ownerName,
        property_address: propertyAddress,
        taxable_value: taxableValue
      };
    });
};

const goToTaxList = async (page, mapNo) => {
  await page.waitForSelector(CONFIG.SELECTORS.TAX_LINK, { timeout: CONFIG.TIMEOUTS.SHORT });
  await clickWhenReady(page, CONFIG.SELECTORS.TAX_LINK, mapNo, "TAX_LINK");
 
};

/* ═══════════════════════════════════════════════════════════════════════
 * DATA EXTRACTION - ROBUST WITH DEBUG
 * ═══════════════════════════════════════════════════════════════════════ */
const scrapeTaxDetail = async (page) => {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes('Payment History') || text.includes('Tax Year');
  }, { timeout: CONFIG.TIMEOUTS.SHORT }).catch(() => {});

  return page.evaluate(() => {
    const trim = (s) => (s || "").toString().replace(/\s+/g, " ").trim() || "N/A";
    const num = (s) => {
      const m = trim(s).match(/[\d,]+\.?\d*/);
      if (!m) return "0.00";
      const n = parseFloat(m[0].replace(/,/g, ""));
      const parts = n.toFixed(2).split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    };

    const allTds = Array.from(document.querySelectorAll('td'));

    const findLabelCell = (label) => {
      return allTds.find((td) => {
        const text = td.querySelector('div') ? trim(td.querySelector('div').textContent) : trim(td.textContent);
        return text.toLowerCase().includes(label.toLowerCase());
      });
    };

    const getNextCellText = (labelCell, offset = 1) => {
      if (!labelCell) return "N/A";
      const row = labelCell.closest("tr");
      const cells = row ? Array.from(row.cells) : [];
      const idx = cells.indexOf(labelCell);
      const target = cells[idx + offset] || cells[cells.length - 1];
      const div = target?.querySelector('div');
      const text = div ? trim(div.textContent) : trim(target?.textContent);
      return text !== "" ? text : "N/A";
    };

    // === PAID DATE ===
    let paidDate = "N/A";
    const paidDateEl = document.querySelector('td[bgcolor="#FFFFFF"] font[color="#000000"] strong');
    if (paidDateEl) {
      const text = trim(paidDateEl.textContent);
      if (text.match(/\d+[\/\-]\d+[\/\-]\d+/)) {
        paidDate = text;
      }
    }

    // === BASE AMOUNT (Total) ===
    let baseAmount = "0.00";
    const totalCell = findLabelCell("Total:");
    if (totalCell) {
      const row = totalCell.closest("tr");
      const cells = Array.from(row.cells);
      const totalDiv = cells[1]?.querySelector('div[align="center"] strong');
      if (totalDiv) {
        baseAmount = num(totalDiv.textContent);
      }
    }
    if (baseAmount === "0.00") {
      const totalRowAlt = Array.from(document.querySelectorAll("tr")).find(tr =>
        tr.querySelector('td[bgcolor="#003300"]')?.textContent.includes("Total:")
      );
      if (totalRowAlt) {
        const amountCell = totalRowAlt.querySelector('td div[align="center"] strong');
        if (amountCell) {
          baseAmount = num(amountCell.textContent);
        }
      }
    }

    // === AMOUNT PAID ===
    let amountPaid = "0.00";
    
    // Find the Total row and get the Payments column value
    const totalRow = Array.from(document.querySelectorAll("tr")).find(tr => {
      const firstCell = tr.querySelector('td[bgcolor="#003300"]');
      return firstCell && trim(firstCell.textContent).includes("Total:");
    });
    
    if (totalRow) {
      const cells = Array.from(totalRow.querySelectorAll('td'));
      // The Payments column is typically the 3rd column (index 2)
      // Structure: [Total label, Charges, Payments, Refunds, ...]
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const strongFont = cell.querySelector('div[align="center"] strong font[color="#000000"]');
        if (strongFont) {
          const text = trim(strongFont.textContent);
          // Match currency format like "2,485.80"
          if (text.match(/^\d{1,3}(,\d{3})*\.\d{2}$/)) {
            amountPaid = num(text);
            break;
          }
        }
      }
    }
    
    // Fallback: Try to find Payments header and use column index
    if (amountPaid === "0.00") {
      const paymentsHeader = Array.from(document.querySelectorAll('td')).find(td =>
        td.textContent.includes('Payments') && td.querySelector('font[color="#FFFFFF"]')
      );

      if (paymentsHeader) {
        const headerRow = paymentsHeader.closest('tr');
        const headerCells = Array.from(headerRow.cells);
        const paymentsColIndex = headerCells.indexOf(paymentsHeader);

        const totalRowAlt = Array.from(document.querySelectorAll("tr")).find(tr =>
          tr.querySelector('td[bgcolor="#003300"]')?.textContent.includes("Total:")
        );

        if (totalRowAlt && paymentsColIndex >= 0) {
          const totalCells = Array.from(totalRowAlt.cells);
          const paymentCell = totalCells[paymentsColIndex];

          const paymentFont = paymentCell?.querySelector('div[align="center"] strong font[color="#000000"]');
          if (paymentFont) {
            amountPaid = num(paymentFont.textContent);
          } else {
            const paymentStrong = paymentCell?.querySelector('div[align="center"] strong');
            if (paymentStrong) {
              amountPaid = num(paymentStrong.textContent);
            }
          }
        }
      }
    }

    // === BALANCE DUE ===
    let balanceDue = "0.00";
    const balCell = findLabelCell("Balance Due:");
    if (balCell) {
      const row = balCell.closest("tr");
      const cells = Array.from(row.cells);
      const balIndex = cells.indexOf(balCell);
      const balValueCell = cells[balIndex + 1];

      if (balValueCell) {
        const balStrong = balValueCell.querySelector('strong');
        if (balStrong) {
          balanceDue = num(balStrong.textContent);
        } else {
          balanceDue = num(balValueCell.textContent);
        }
      }
    }

    if (balanceDue === "0.00") {
      const balRow = Array.from(document.querySelectorAll("tr")).find(tr =>
        tr.textContent.includes("Balance Due")
      );
      if (balRow) {
        const rowspanCell = balRow.querySelector('td[rowspan="2"] strong');
        if (rowspanCell) {
          balanceDue = num(rowspanCell.textContent);
        }
      }
    }

    // === CITY & COUNTY TAX ===
    let cityTax = "0.00";
    const cityRow = Array.from(document.querySelectorAll("tr")).find(tr => {
      return tr.textContent.includes("City") && tr.querySelector('td[bgcolor="#FFFFFF"]') && !tr.textContent.includes("County");
    });
    if (cityRow) {
      const cellText = cityRow.querySelector('td[bgcolor="#FFFFFF"]')?.textContent || "";
      const match = cellText.match(/City\s*([\d,]+\.?\d*)/);
      if (match) cityTax = num(match[1]);
    }

    let countyTax = "0.00";
    const countyRow = Array.from(document.querySelectorAll("tr")).find(tr => {
      return tr.textContent.includes("County") && tr.querySelector('td[bgcolor="#FFFFFF"]') && tr.textContent.match(/[\d,]+\.?\d*/);
    });
    if (countyRow) {
      const cellText = countyRow.querySelector('td[bgcolor="#FFFFFF"]')?.textContent || "";
      const match = cellText.match(/County\s*([\d,]+\.?\d*)/);
      if (match) countyTax = num(match[1]);
    }

    // === FEE ===
    let fee = "0.00";
    const feeCell = findLabelCell("Fee:");
    if (feeCell) {
      const row = feeCell.closest("tr");
      const cells = Array.from(row.cells);
      const feeValue = cells[1]?.querySelector('div strong')?.textContent || cells[1]?.textContent || "0.00";
      fee = num(feeValue);
    }

    // === TAX EXEMPT ===
    let taxExempt = "0.00";
    const exemptCell = findLabelCell("Tax Exempt:");
    if (exemptCell) {
      taxExempt = num(getNextCellText(exemptCell));
    }

    // === INTEREST CHARGE ===
    let interestCharge = "0.00";
    const interestCell = findLabelCell("Interest Charge:");
    if (interestCell) {
      interestCharge = num(getNextCellText(interestCell));
    }

    // === PRORATE ===
    let prorate = "0.00";
    const prorateCell = findLabelCell("Prorate:");
    if (prorateCell) {
      prorate = num(getNextCellText(prorateCell));
    }

    // === ASSESSED VALUE (TAXABLE VALUE) ===
    let assessment = "$0.00";
    
    // Priority 1: Look for labels in all cells
    const labels = ["tax value", "taxable value", "assessed value", "market value"];
    
    for (const label of labels) {
      for (const td of allTds) {
        const text = trim(td.textContent).toLowerCase();
        if (text === label || (text.includes(label) && td.getAttribute('bgcolor') === "#003300")) {
          const row = td.closest("tr");
          if (row) {
            const cells = Array.from(row.querySelectorAll('td'));
            const idx = cells.indexOf(td);
            if (cells[idx + 1]) {
              const valText = trim(cells[idx + 1].textContent);
              if (valText.match(/[\d,]+/)) {
                assessment = "$" + num(valText);
                break;
              }
            }
          }
        }
      }
      if (assessment !== "$0.00") break;
    }

    // Priority 2: Look for any font size="2" containing a property-like value (e.g., 231,386)
    if (assessment === "$0.00" || assessment === "$N/A") {
      const fonts = Array.from(document.querySelectorAll('font[size="2"]'));
      for (const f of fonts) {
        const text = trim(f.textContent);
        if (text.match(/^\d{1,3}(,\d{3})+$/)) { // Matches "231,386" or "1,231,386"
          assessment = "$" + num(text);
          break;
        }
      }
    }

    if (assessment === "$0.00") {
      const assessEl = document.querySelector('td[colspan="4"] div[align="left"]') ||
                       document.querySelector('td[colspan] div');
      if (assessEl) {
        assessment = "$" + num(assessEl.textContent);
      }
    }

    // === OWNER NAME ===
    let ownerName = "N/A";
    const ownerNameFont = document.querySelector('td font[color="#FF0000"][size="2"]');
    if (ownerNameFont) {
      ownerName = trim(ownerNameFont.textContent)
        .replace(/LUIB.?$/gi, "LUIBRAND")
        .replace(/TRUS$/gi, "TRUST")
        .replace(/\+/g, " & ")
        .trim();
    } else {
      const nameCell = findLabelCell("Name");
      if (nameCell) {
        ownerName = getNextCellText(nameCell, nameCell.colSpan ? 0 : 1);
        ownerName = ownerName
          .replace(/LUIB.?$/gi, "LUIBRAND")
          .replace(/TRUS$/gi, "TRUST")
          .replace(/\+/g, " & ")
          .trim();
      }
    }

    // === PROPERTY ADDRESS ===
    let propertyAddress = "N/A";
    
    // 1. Look for label "Physical Address" or "Address"
    const addrLabels = ["physical address", "address"];
    
    for (const label of addrLabels) {
      for (const td of allTds) {
        const text = trim(td.textContent).toLowerCase().replace(/\s+/g, ' ');
        if (text.includes(label)) {
          const row = td.closest('tr');
          if (row) {
            const cells = Array.from(row.querySelectorAll('td'));
            const idx = cells.indexOf(td);
            if (cells[idx + 1]) {
              const val = trim(cells[idx + 1].textContent);
              if (val !== "N/A" && val !== "" && !val.includes("=>") && !val.includes(">")) {
                propertyAddress = val;
                break;
              }
            }
          }
        }
      }
      if (propertyAddress !== "N/A") break;
    }

    // 2. Fallback: look for specific font pattern but exclude breadcrumbs
    if (propertyAddress === "N/A") {
      for (const td of allTds) {
        const font = td.querySelector('font[color="#000000"][size="2"]');
        if (font) {
          const val = trim(font.textContent);
          if (val !== "N/A" && val !== "" && val.match(/\d+/) && !val.includes("=>") && !val.includes(">") && val.length < 100) {
            propertyAddress = val;
            break;
          }
        }
      }
    }

    // === CITY / STATE / ZIP ===
    const city = getNextCellText(findLabelCell("City")) || "N/A";
    const state = getNextCellText(findLabelCell("State")) || "SC";
    const zip = getNextCellText(findLabelCell("Zip:")) || "N/A";

    const fullOwnerAddress = propertyAddress !== "N/A" && city !== "N/A"
      ? `${propertyAddress}, ${city}, ${state} ${zip}`
      : "N/A";

    // === DISTRICT ===
    const district = getNextCellText(findLabelCell("District:")) || "N/A";

    // === COUNTY LEVY ===
    let countyLevy = "0.00000";
    const levyCell = Array.from(document.querySelectorAll("td")).find(td =>
      td.textContent.includes("County:") && td.textContent.includes(".") && !td.textContent.includes("Balance")
    );
    if (levyCell) {
      countyLevy = trim(levyCell.textContent.match(/[\d.]+/)?.[0]) || "0.00000";
    }

    // === TRANSACTION DATE ===
    const transactionDate = getNextCellText(findLabelCell("Transaction Date:")) || "N/A";

    // Calculate total tax
    const totalTax = (parseFloat(cityTax) + parseFloat(countyTax)).toFixed(2);

    return {
      amount_due: balanceDue,
      amount_paid: amountPaid,
      date_paid_raw: paidDate,
      city_tax: `${cityTax}`,
      county_tax: `${countyTax}`,
      total_tax: `${totalTax}`,
      base_amount: baseAmount,
      fee: `${fee}`,
      tax_exempt: `${taxExempt}`,
      interest_charge: `${interestCharge}`,
      prorate: `${prorate}`,
      assessment,
      district,
      county_levy: countyLevy,
      transaction_date: transactionDate,
      owner_name_clean: ownerName,
      property_address: propertyAddress,
      owner_address_full: fullOwnerAddress,
      city,
      state,
      zip,
    };
  });
};

/* ═══════════════════════════════════════════════════════════════════════
 * CORE SCRAPING LOGIC
 * ═══════════════════════════════════════════════════════════════════════ */
const getTaxData = async (page, rawMapNo) => {
  const mapNo = validateMapNo(rawMapNo);
  const records = [];
  let latestTaxDetail = null;
  let searchResultsData = null;

  try {
    await login(page, mapNo);
    await acceptDisclaimer(page, mapNo);
    await goToSearch(page, mapNo);
    await typeAndSubmit(page, mapNo);
    
    // Extract data from search results table
    searchResultsData = await scrapeSearchResults(page, mapNo);
    await goToTaxList(page, mapNo);

    const yearRows = await page.$$eval('table tbody tr', rows => {
      return rows
        .filter(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return false;
          const yearText = cells[2].textContent.trim();
          return /^\d{4}$/.test(yearText);
        })
        .map(row => {
          const cells = row.querySelectorAll('td');
          const year = cells[2].textContent.trim();
          const nameLink = cells[1].querySelector('a');
          return {
            year: parseInt(year),
            href: nameLink ? nameLink.getAttribute('href') : null,
          };
        })
        .filter(x => x.href)
        .sort((a, b) => b.year - a.year);
    });

 
    if (yearRows.length === 0) throw new NoRecordsError(mapNo);

    for (const yearData of yearRows) {
      const year = yearData.year;
      try {
        const fullUrl = new URL(yearData.href, page.url()).href;
       
        await page.goto(fullUrl, { waitUntil: "networkidle0", timeout: CONFIG.TIMEOUTS.NAVIGATION });
        const tax = await scrapeTaxDetail(page);

        const due = parseFloat(tax.amount_due) || 0;
        const isPaid = due === 0;
        
        records.push({
          jurisdiction: "County",
          year: year.toString(),
          status: isPaid ? "PAID" : new Date() > new Date(year + 1, 0, 17) ? "DELINQUENT" : "DUE",
          payment_type: "Annual",
          base_amount: `$${tax.base_amount}`,
          amount_paid: `$${tax.amount_paid}`,
          amount_due: `$${tax.amount_due}`,
          paid_date: tax.date_paid_raw,
          due_date: `01/16/${year + 1}`,
          delq_date: `01/17/${year + 1}`,
          total_assessed_value: tax.assessment,
          city_tax: `$${tax.city_tax}`,
          county_tax: `$${tax.county_tax}`,
          fee: `$${tax.fee}`,
          tax_exempt: `$${tax.tax_exempt}`,
          district: tax.district,
          county_levy: tax.county_levy,
          transaction_date: tax.transaction_date,
          owner_name_clean: tax.owner_name_clean,
          owner_address_full: tax.owner_address_full,
        });

        if (!latestTaxDetail) latestTaxDetail = tax;
        
        if (isPaid) break;
        
        await page.goBack({ waitUntil: "networkidle0" });
        await page.waitForSelector(CONFIG.SELECTORS.TAX_LINK, { timeout: CONFIG.TIMEOUTS.SHORT });
      } catch (e) {
        // Skip year on failure
      }
    }

    if (records.length === 0) throw new NoRecordsError(mapNo);

    // Filter logic: Show only relevant years
    const sortedDesc = records.sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const latestYear = sortedDesc[0];
    let filteredRecords;
    let notes;
    const NOTE = "NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 01/15";

    if (latestYear.status === "PAID") {
      filteredRecords = [latestYear];
      notes = `ALL PRIORS ARE PAID, ${latestYear.year} TAXES ARE PAID, ${NOTE}`;
      
    } else {
      const unpaidYears = sortedDesc.filter(r => r.status === "DUE" || r.status === "DELINQUENT");

      if (unpaidYears.length === 1) {
        filteredRecords = [latestYear];
        notes = `ALL PRIORS ARE PAID, ${latestYear.year} TAXES ARE ${latestYear.status}, ${NOTE}`;
        
      } else {
        filteredRecords = unpaidYears;
        const hasDelinquent = unpaidYears.some(r => r.status === "DELINQUENT");
        const yearsList = unpaidYears.map(r => r.year).join(', ');
        notes = hasDelinquent
          ? `MULTIPLE YEARS DELINQUENT (${yearsList}), ${NOTE}`
          : `MULTIPLE YEARS DUE (${yearsList}), ${NOTE}`;
       
      }
    }

    const finalRecords = filteredRecords.sort((a, b) => parseInt(a.year) - parseInt(b.year));
    

    const tax = latestTaxDetail || {};
    const cleanParcel = mapNo.replace(/^0+/, "");
    const formattedParcel = cleanParcel.replace(/(\d{3})(\d{2})(\d{2})(\d{3})/, "$1-$2-$3-$4");

    const hasAnyDelinquent = finalRecords.some(r => r.status === "DELINQUENT");
    
    // Use search results data if available, otherwise fall back to scraped tax detail
    const finalOwnerName = searchResultsData?.owner_name && searchResultsData.owner_name !== "N/A" 
      ? searchResultsData.owner_name 
      : (tax.owner_name_clean && tax.owner_name_clean !== "N/A" ? tax.owner_name_clean : "N/A");
    
    const formattedOwnerName = finalOwnerName !== "N/A" 
      ? (finalOwnerName.includes("TRUST") ? finalOwnerName : finalOwnerName + " TRUST")
      : "N/A";
    
    const finalPropertyAddress = searchResultsData?.property_address && searchResultsData.property_address !== "N/A"
      ? searchResultsData.property_address
      : (tax.property_address || "N/A");
    
    const finalTaxableValue = searchResultsData?.taxable_value && searchResultsData.taxable_value !== "$0.00"
      ? searchResultsData.taxable_value
      : (tax.assessment || "$0.00");

    return {
      processed_date: new Date().toISOString().split("T")[0],
      owner_name: [formattedOwnerName],
      property_address: finalPropertyAddress,
      owner_address: tax.owner_address_full || "N/A",
      parcel_number: formattedParcel,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: finalTaxableValue,
      exemption: tax.tax_exempt,
      total_taxable_value: finalTaxableValue,
      taxing_authority: CONFIG.AUTHORITY,
      notes,
      delinquent: hasAnyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE",
      tax_history: finalRecords,
    };
  } catch (e) {
    if (e instanceof NoRecordsError) throw e;
    log("error", mapNo, "FATAL", e.message);
    throw e;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
 * API HANDLER
 * ═══════════════════════════════════════════════════════════════════════ */
const search = async (req, res) => {
  const { fetch_type = "api", account } = req.body || {};
  let browserContext = null;

  try {
    const mapNo = validateMapNo(account);
    const browser = await getBrowserInstance();
    browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();
    await page.setDefaultNavigationTimeout(CONFIG.TIMEOUTS.PAGE_LOAD);
    await page.setRequestInterception(true);
    page.on("request", r => ["stylesheet", "font", "image"].includes(r.resourceType()) ? r.abort() : r.continue());

    const data = await getTaxData(page, mapNo);

    fetch_type === "html"
      ? res.status(200).render("parcel_data_official", data)
      : res.status(200).json({ result: data });
  } catch (e) {
    const mapNo = req.body?.account || "unknown";
    const isNo = e instanceof NoRecordsError;
    const payload = isNo ? {
      processed_date: new Date().toISOString().split("T")[0],
      owner_name: ["No records found"],
      property_address: "No records found",
      owner_address: "No records found",
      parcel_number: mapNo,
      land_value: "N/A",
      improvements: "N/A",
      total_assessed_value: "N/A",
      exemption: "$0.00",
      total_taxable_value: "N/A",
      taxing_authority: CONFIG.AUTHORITY,
      notes: "No tax records found.",
      delinquent: "N/A",
      tax_history: [],
    } : { error: true, message: e.message || "Internal error", code: e.code || "UNKNOWN" };

   

    fetch_type === "html"
      ? res.status(isNo ? 200 : 500).render(isNo ? "parcel_data_official" : "error_data", payload)
      : res.status(isNo ? 200 : 500).json(isNo ? { result: payload } : payload);
  } finally {
    if (browserContext) await browserContext.close().catch(() => {});
  }
};

module.exports = { search };