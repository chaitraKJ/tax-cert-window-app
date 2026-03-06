//Author:Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

const parseMoney = (raw = '') => {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned) || 0;
  return Number(num.toFixed(2));          
};

// Helper: format a number → "$1,234.56"
const fmtMoney = (num = 0) => {
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Check if given date is delinquent
const is_delq = (date) => {
  const today = new Date();
  const delq_date = new Date(date);
  return today >= delq_date;
};

// Counties configuration
const counties = {
  lyon: {
    tax_url: 'https://gsaportal.lyon-county.org/tax/',
    parcel_url: 'https://gsaportal.lyon-county.org/parcel/',
    taxing_authority: 'Lyon County Treasurer, 27 S Main St, Yerington, NV 89447, Ph: (775) 463-6500',
  },
  douglas: {
    tax_url: 'https://douglasnv-search.gsacorp.io/tax/',
    parcel_url: 'https://douglasnv-search.gsacorp.io/parcel/',
    taxing_authority: 'Douglas County Treasurer, 1616 8th St, Minden, NV 89423, Ph: (775) 782-9017',
  },
};

// Step 1: Validate parcel by checking tax page first
const dc_1 = async (page, account, countyConfig) => {
  return new Promise(async (resolve, reject) => {
    try {
      const parcelNumber = account.replace(/-/g, "");
      if (!parcelNumber) return reject(new Error("Invalid Account Number"));

      // FIRST: CHECK TAX PAGE
      const taxUrl = `${countyConfig.tax_url}${parcelNumber}`;
      await page.goto(taxUrl, { waitUntil: "domcontentloaded" });

      const taxMainText = await page.evaluate(() => {
        return document.querySelector("main")?.innerText || "";
      });

      if (taxMainText.includes("No tax record found for account id")) {
        return reject(new Error("No Record Found"));
      }

      // SECOND: LOAD PARCEL PAGE
      const parcelUrl = `${countyConfig.parcel_url}${parcelNumber}`;
      const response = await page.goto(parcelUrl, { waitUntil: "domcontentloaded" });

      if (!response || response.status() === 404 || !response.ok()) {
        return reject(new Error("No Record Found"));
      }

      await page.waitForSelector("section.parcel-info", timeout_option);
      resolve(true);
    } catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
  });
};

// Step 2: Extract parcel owner details & property values
const dc_2 = async (page, account, countyConfig) => {
  return new Promise(async (resolve, reject) => {
    try {
      const page_data = await page.evaluate(() => {
        const datum = {
          processed_date: new Date().toISOString().split('T')[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "-",
          total_assessed_value: "",
          exemption: "",
          total_taxable_value: "",
          taxing_authority: "",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

        // EXTRACT OWNER NAMES
        const ownerDiv = document.querySelector(".ownership div");
        if (ownerDiv) {
          const lines = ownerDiv.innerHTML
            .split("<br>")
            .map(l => l.trim())
            .filter(l => l && !l.includes("<p>"));

          const addressLine = ownerDiv.querySelector("p")?.textContent.trim();
          datum.property_address = addressLine || "N/A";

          lines.forEach(line => {
            const clean = line.replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").trim();
            if (clean) datum.owner_name.push(clean);
          });
        }

        // FALLBACK: EXTRACT PROPERTY ADDRESS FROM PARCEL-DETAIL
        if (!datum.property_address || datum.property_address === "N/A") {
          const locationRow = Array.from(
            document.querySelectorAll(".parcel-detail table tr")
          ).find((tr) => tr.querySelector("th")?.textContent.trim() === "Location");
          datum.property_address = locationRow?.querySelector("td")?.textContent.trim() || "N/A";
        }

        // EXTRACT VALUE HISTORY (LATEST YEAR)
        const valueTable = document.querySelector(".value-summary table.grid-transposed");
        if (valueTable) {
          const rows = Array.from(valueTable.querySelectorAll("tbody tr"));
          const latestYearIndex = 1; // Second column (index 1)

          rows.forEach((row) => {
            const label = row.querySelector("th")?.textContent.trim();
            const cells = row.querySelectorAll("td");

            if (label === "New Improvements") {
              datum.improvements = cells[latestYearIndex - 1]?.textContent.trim() || "$0";
            } else if (label === "Total Land Value") {
              datum.land_value = cells[latestYearIndex - 1]?.textContent.trim() || "$0";
            } else if (label === "Taxable Value") {
              datum.total_taxable_value = cells[latestYearIndex - 1]?.textContent.trim() || "$0";
            } else if (label === "Net Exemptions Value") {
              datum.exemption = cells[latestYearIndex - 1]?.textContent.trim() || "$0";
            } else if (label === "Net Assessed Value") {
              datum.total_assessed_value = cells[latestYearIndex - 1]?.textContent.trim() || "$0";
            }
          });
        }

        return datum;
      });

      page_data.parcel_number = account;
      page_data.taxing_authority = countyConfig.taxing_authority;
      resolve(page_data);
    } catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
  });
};

// Step 3: Extract full tax section (current year + outstanding + past years)
const dc_3 = async (page, data, account, countyConfig) => {
  return new Promise(async (resolve, reject) => {
    try {
      // NAVIGATE TO TAX PAGE
      const parcelNumber = account.replace(/-/g, "");
      const taxUrl = `${countyConfig.tax_url}${parcelNumber}`;
      await page.goto(taxUrl, { waitUntil: "domcontentloaded" });

      // WAIT FOR TAX SECTION
      await page.waitForSelector("section.tax-current_yr", timeout_option);

      const tax_data = await page.evaluate(() => {
        const result = {
          current_year: {},
          installments: [],
          outstanding: [],
          past_years: [],
        };

        // CURRENT YEAR TAX INFO
        const curSec = document.querySelector("section.tax-current_yr");
        if (curSec) {
          const rows = curSec.querySelectorAll("table.grid-1d tr");
          rows.forEach(r => {
            const th = r.querySelector("th")?.textContent.trim();
            const td = r.querySelector("td")?.textContent.trim();
            if (th === "Description") result.current_year.description = td;
            if (th === "Original") result.current_year.original = td;
            if (th === "Balance") result.current_year.balance = td;
            if (th === "Due") result.current_year.due = td;
          });

          // INSTALLMENTS
          const instTbl = curSec.querySelector(".installments table.grid2");
          if (instTbl) {
            instTbl.querySelectorAll("tbody tr").forEach(row => {
              const c = row.querySelectorAll("td");
              if (c.length >= 10) {
                result.installments.push({
                  number: c[0].textContent.trim(),
                  due_date: c[1].textContent.trim(),
                  penalty_date: c[2].textContent.trim(),
                  status: c[3].textContent.trim(),
                  original: c[4].textContent.trim(),
                  penalty: c[5].textContent.trim(),
                  interest: c[6].textContent.trim(),
                  total: c[7].textContent.trim(),
                  paid: c[8].textContent.trim(),
                  total_due: c[9].textContent.trim(),
                });
              }
            });
          }
        }

        // OUTSTANDING TAXES
        const outSec = document.querySelector("section.tax-outstanding");
        if (outSec) {
          outSec.querySelectorAll("table.grid2 tbody tr").forEach(row => {
            const c = row.querySelectorAll("td");
            if (c.length >= 7) {
              result.outstanding.push({
                description: c[0].textContent.trim(),
                original: c[1].textContent.trim(),
                penalty: c[2].textContent.trim(),
                interest: c[3].textContent.trim(),
                paid: c[4].textContent.trim(),
                balance: c[5].textContent.trim(),
                due: c[6].textContent.trim(),
              });
            }
          });
        }

        // PAST DUE TAXES
        const pastSec = document.querySelector("section.tax-pastdue");
        if (pastSec) {
          pastSec.querySelectorAll("table.grid2 tbody tr").forEach(row => {
            const c = row.querySelectorAll("td");
            if (c.length >= 9) {
              result.past_years.push({
                description: c[0].textContent.trim(),
                original: c[1].textContent.trim(),
                penalty: c[2].textContent.trim(),
                interest: c[3].textContent.trim(),
                paid: c[4].textContent.trim(),
                balance: c[5].textContent.trim(),
                due: c[6].textContent.trim(),
              });
            }
          });
        }

        return result;
      });

      resolve({ data, tax_data });
    } catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
  });
};

// Step 4: Convert raw tax info into final tax history output
const dc_4 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { data, tax_data } = main_data;
      const tax_history = [];

      // ───── CURRENT YEAR ─────
      const curMatch = tax_data.current_year.description?.match(/(\d{4})\/(\d{4})/);
      const currentYear = curMatch ? curMatch[1] : new Date().getFullYear().toString();

      let anyDelinquent = false;
      const installmentNotes = [];

      tax_data.installments.forEach((inst, i) => {
        const lc = inst.status.toLowerCase();
        const paid = lc.includes('paid');
        const past = lc.includes('past due');
        const isDelinquent = past || is_delq(inst.penalty_date);

        const orig = parseMoney(inst.original);
        const pen  = parseMoney(inst.penalty);
        const int  = parseMoney(inst.interest);
        const totalDue = (orig + pen + int).toFixed(2);

        const rec = {
          jurisdiction: 'County',
          year: currentYear,
          payment_type: `Installment ${i + 1}`,
          status: paid ? 'Paid' : isDelinquent ? 'Delinquent' : 'Due',
          base_amount: fmtMoney(orig),
          amount_paid: fmtMoney(parseMoney(inst.paid)),
          amount_due: fmtMoney(parseFloat(totalDue)),
          mailing_date: 'N/A',
          due_date: inst.due_date || '',
          delq_date: inst.penalty_date || '',
          paid_date: '-',
          good_through_date: '',
        };

        if (rec.status === 'Delinquent') anyDelinquent = true;
        installmentNotes.push(`INSTALLMENT ${i + 1} IS ${rec.status.toUpperCase()}`);
        tax_history.push(rec);
      });

      // ───── PRIOR YEAR DELINQUENCIES ─────
      const priorMap = new Map();

      const addToMap = (item) => {
        const yearMatch = item.description?.match(/(\d{4})/);
        const year = yearMatch ? yearMatch[1] : 'Unknown';
        if (!priorMap.has(year)) priorMap.set(year, { orig:0, pen:0, int:0, paid:0, bal:0 });

        const b = priorMap.get(year);
        b.orig += parseMoney(item.original);
        b.pen  += parseMoney(item.penalty);
        b.int  += parseMoney(item.interest);
        b.paid += parseMoney(item.paid);
        b.bal  += parseMoney(item.balance);
      };

      tax_data.outstanding.forEach(addToMap);
      tax_data.past_years.forEach(addToMap);

      priorMap.forEach((totals, year) => {
        if (totals.bal <= 0) return;
        const totalDue = (totals.orig + totals.pen + totals.int - totals.paid).toFixed(2);

        const rec = {
          jurisdiction: 'County',
          year,
          payment_type: 'Annual',
          status: 'Delinquent',
          base_amount: fmtMoney(totals.orig),
          amount_paid: fmtMoney(totals.paid),
          amount_due: fmtMoney(parseFloat(totalDue)),
          mailing_date: 'N/A',
          due_date: '',
          delq_date: '',
          paid_date: '',
          good_through_date: '',
        };
        anyDelinquent = true;
        tax_history.push(rec);
      });

      // ───── SORT & NOTES ─────
      tax_history.sort((a, b) => {
        const ya = Number(a.year), yb = Number(b.year);
        if (ya !== yb) return ya - yb;
        if (a.payment_type.includes('Installment') && b.payment_type.includes('Installment')) {
          const na = Number(a.payment_type.match(/Installment (\d+)/)?.[1] || 0);
          const nb = Number(b.payment_type.match(/Installment (\d+)/)?.[1] || 0);
          return na - nb;
        }
        return 0;
      });

      const hasPriorDelq = [...priorMap.values()].some(t => t.bal > 0);
      const priorNote = hasPriorDelq
        ? 'PRIOR-YEAR TAXES ARE DELINQUENT'
        : 'ALL PRIOR-YEAR TAXES ARE PAID';
      const dueDates = 'NORMAL TAXES ARE PAID QUARTERLY.NORMAL DUE DATES FOR INSTALLMENTS: 08/18, 10/06, 01/05, 03/02';

      data.notes = `${priorNote}, ${currentYear} TAXES: ${installmentNotes.join(', ')}. ${dueDates}`;
      data.delinquent = anyDelinquent
        ? 'TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF'
        : 'NONE';
      data.tax_history = tax_history;

      resolve(data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// MAIN search workflow with .then() chains like Maricopa
const account_search = async (page, account, countyConfig) => {
  return new Promise(async (resolve, reject) => {
    try {
      dc_1(page, account, countyConfig)
      .then((data) => {

        dc_2(page, account, countyConfig)
        .then((data1) => {

          dc_3(page, data1, account, countyConfig)
          .then((data2) => {

            dc_4(page, data2, account)
            .then((data3) => {
              resolve(data3);
            })
            .catch((error) => {
              console.log(error);
              reject(error);
            })

          })
          .catch((error) => {
            console.log(error);
            reject(error);
          })

        })
        .catch((error) => {
          console.log(error);
          reject(error);
        })

      })
      .catch((error) => {
        console.log(error);
        reject(error);
      })

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Express handler to serve parcel data (HTML or API)
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const countyKey = req.path.replace(/^\/+/, "").split("/")[0]; 
  const countyConfig = counties[countyKey];

  if (!countyConfig) {
    return res.status(400).json({ error: true, message: "Invalid county" });
  }

  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

    if (fetch_type == "html") {
      // FRONTEND POINT
      account_search(page, account, countyConfig)
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
      })
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page, account, countyConfig)
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
      })
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