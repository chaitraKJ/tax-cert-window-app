//Author:Dhansuh
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = {
  timeout: 90000
};

const is_delq = (date) => {
  let today = new Date();
  let delq_date = new Date(date);
  if (today >= delq_date) {
    return true;
  }
  return false;
}

const formatCurrency = (num, withDollarSign = true) => {
  if (num === undefined || num === null || num === "" || num === "N/A") {
    return withDollarSign ? "$0.00" : "0.00";
  }

  const cleanNum = num.toString().replace(/[^0-9.]/g, '');
  const number = parseFloat(cleanNum);

  if (isNaN(number)) return withDollarSign ? "$0.00" : "0.00";

  const formatted = number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return withDollarSign ? `$${formatted}` : formatted;
};

// Step 1: Search by account number
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `https://ptaxweb.putnamtax.com/ptaxweb/editPropertySearch2.action?action=list`;
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.waitForSelector("#searchValue", timeout_option);
      await page.waitForSelector("#taxYear", timeout_option);

      await page.select("#taxYear", "ALL");
      await page.locator("#searchValue").fill(account.trim());

      Promise.all([
        page.locator("#propertySearchButtonId").click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" })
      ])
      .then(async () => {
        const nothingFound = await page.evaluate(() => {
          const red = document.querySelector('div[style*="color:red"]');
          return red && /nothing found|no records/i.test(red.textContent || "");
        });

        if (nothingFound) {
          reject(new Error("No Record Found"));
        } else {
          resolve(true);
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

// Step 2: Extract owner info and parcel from table
const ac_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.waitForSelector("table.table-search tbody tr", timeout_option);

      const page_data = await page.evaluate(() => {
        const datum = {
          processed_date: new Date().toISOString().split('T')[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "N/A",
          improvements: "N/A",
          total_assessed_value: "N/A",
          exemption: "N/A",
          total_taxable_value: "N/A",
          taxing_authority: "Putnam County Tax Collector, 2509 Crill Avenue, Suite 300, Palatka FL 32177, Ph: 386-329-0276",
          notes: "",
          delinquent: "NONE",
          tax_history: []
        };

        const firstRow = document.querySelector("table.table-search tbody tr");
        if (firstRow) {
          const accountLink = firstRow.querySelector("td:nth-child(4) a");
          if (accountLink) {
            datum.parcel_number = accountLink.textContent.trim();
          }

          const nameLocationCell = firstRow.querySelector("td:nth-child(5)");
          if (nameLocationCell) {
            const text = nameLocationCell.textContent.trim();
            const parts = text.split(',');
            if (parts.length > 0) {
              datum.owner_name.push(parts[0].trim());
            }
            if (parts.length > 1) {
              datum.property_address = parts.slice(1).join(',').trim();
            }
          }
        }

        return datum;
      });

      page_data['parcel_number'] = account;
      resolve(page_data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Step 3: Get all years status data
const ac_3 = async (page, data, account, yearsRequested) => {
  return new Promise(async (resolve, reject) => {
    try {
      page.waitForSelector("table.table-search tbody tr", timeout_option)
      .then(async () => {
        const page_data = await page.evaluate(() => {
          const status_data = {};
          let max_year = 0;
          const all_years = [];

          const rows = document.querySelectorAll("table.table-search tbody tr");

          for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll("td");
            if (cells.length < 9) continue;

            const yearText = cells[2].textContent.trim();
            const year = parseInt(yearText, 10);
            if (isNaN(year)) continue;

            all_years.push(year);
            max_year = (year > max_year) ? year : max_year;

            const status = cells[5].textContent.trim();
            const amountDue = cells[8].textContent.trim();
            const amountPaid = cells[6].textContent.trim();
            const datePaid = cells[7].textContent.trim();
            const accountLink = cells[3].querySelector("a");
            const accountNumber = accountLink ? accountLink.textContent.trim() : "";

            const td_data = {
              status: status === "Paid" ? "Paid" : "Unpaid",
              base_amount: amountDue !== "0.00" ? amountDue : amountPaid,
              amount_paid: amountPaid || "$0.00",
              amount_due: amountDue || "$0.00",
              date_paid: datePaid !== "-" ? datePaid : "",
              account_number: accountNumber,
              history: []
            };

            status_data[year] = td_data;
          }

          return { status_data, max_year, all_years: all_years.sort((a, b) => b - a) };
        });

        const status_data = page_data['status_data'];
        const all_years = page_data['all_years'];
        const max_year = page_data['max_year'];
        
        // Determine which years to include based on yearsRequested
        const years_to_include = all_years.slice(0, yearsRequested);
        
        // Also include any delinquent years not in the requested range
        const delinquent_years = [];
        for (const year in status_data) {
          if (status_data[year]['status'] === "Unpaid" && !years_to_include.includes(parseInt(year))) {
            delinquent_years.push(parseInt(year));
          }
        }
        
        const final_years = [...new Set([...years_to_include, ...delinquent_years])].sort((a, b) => a - b);

        // Get history for selected years
        for (const year of final_years) {
          if (status_data[year] && status_data[year]['status'] === "Unpaid") {
            const th = await ac_3_helper(page, status_data[year], year);
            page_data['status_data'][year]['history'] = [...th];
          }
        }

        // Check if all years except current are paid
        const prior_years_paid = final_years.filter(y => y < max_year).every(y => 
          status_data[y] && status_data[y]['status'] === "Paid"
        );
        
        data['notes'] = prior_years_paid ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";

        resolve({
          data: data,
          status_data: page_data['status_data'],
          max_year: page_data['max_year'],
          years_to_include: final_years,
          has_delinquent: delinquent_years.length > 0,
          delinquent_years: delinquent_years
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

// Helper: Get detail page info for a specific year
const ac_3_helper = async (page, data, year) => {
  return new Promise(async (resolve, reject) => {
    try {
      const accountNumber = data.account_number;

      const clicked = await page.evaluate((acctNum) => {
        const links = document.querySelectorAll("a[title='View Detailed Account Information']");
        for (let link of links) {
          if (link.textContent.trim() === acctNum) {
            link.click();
            return true;
          }
        }
        return false;
      }, accountNumber);

      if (!clicked) {
        console.log(`Could not find detail link for ${accountNumber}`);
        resolve([]);
        return;
      }

      await page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".Table-row", timeout_option);

      const detailInfo = await page.evaluate(() => {
        const info = {
          assessed_value: "",
          taxable_value: "",
          land_value: "",
          improvements: "",
          market_value: "",
          total_billed: "",
          total_due: "",
          owner_names: [],
          property_address: "",
          exemption: ""
        };

        const firstCol = document.querySelector(".Table-row .Table-col");
        if (firstCol) {
          const text = firstCol.textContent;
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          if (lines.length > 0) {
            info.owner_names.push(lines[0]);
          }
        }

        const allRows = document.querySelectorAll(".Table-row");
        allRows.forEach(row => {
          const text = row.textContent;
          if (text.includes("PROPERTY ADDRESS:")) {
            const match = text.match(/PROPERTY ADDRESS:\s*([^STATUS:]+)/);
            if (match) {
              info.property_address = match[1].trim();
            }
          }
        });

        const spreadTables = document.querySelectorAll(".Spread");
        spreadTables.forEach(table => {
          const rows = table.querySelectorAll("tr");
          rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 2) {
              const label = cells[0].textContent.trim().toUpperCase().replace(/:$/, '');
              const value = cells[1].textContent.trim().replace(/,/g, '');

              if (label.includes("ASSESSED VALUE")) {
                info.assessed_value = value;
              }
              if (label.includes("TAXABLE VALUE")) {
                info.taxable_value = value;
              }
              if (label.includes("LAND VALUE") || label.includes("LAND")) {
                info.land_value = value;
              }
              if (label.includes("BUILDING VALUE") || label.includes("IMPROVEMENT VALUE") || label.includes("BUILDING") || label.includes("IMPROVEMENTS")) {
                info.improvements = value;
              }
              if (label.includes("MARKET VALUE") || label.includes("JUST VALUE")) {
                info.market_value = value;
              }
              if (label.includes("EXEMPTION") || label.includes("TOTAL EXEMPTIONS")) {
                info.exemption = value;
              }
            }
          });
        });

        allRows.forEach(row => {
          const text = row.textContent;
          if (text.includes("GROSS TAX:") && text.includes("$")) {
            const match = text.match(/GROSS TAX:\s*\$?([\d,\.]+)/);
            if (match) {
              info.total_billed = match[1].replace(/,/g, '');
            }
          }
        });

        allRows.forEach(row => {
          const cols = row.querySelectorAll(".Table-col");
          cols.forEach(col => {
            const text = col.textContent;
            if (text.includes("TOTAL:") && !text.includes("TOTAL AD VALOREM") && !text.includes("TOTAL NON-AD")) {
              const match = text.match(/TOTAL:\s*\$?([\d,\.]+)/);
              if (match) {
                info.total_due = match[1].replace(/,/g, '');
              }
            }
          });
        });

        if (!info.assessed_value && info.market_value) {
          info.assessed_value = info.market_value;
        }
        if (!info.taxable_value && info.assessed_value) {
          info.taxable_value = info.assessed_value;
        }

        return info;
      });

      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.table-search", timeout_option);

      const th_data = {
        jurisdiction: "County",
        year: year,
        payment_type: "Annual",
        status: "Due",
        base_amount: detailInfo.total_billed || data.base_amount,
        amount_paid: "$0.00",
        amount_due: detailInfo.total_due || data.amount_due,
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: "",
        good_through_date: "",
        assessed_value: detailInfo.assessed_value || "",
        taxable_value: detailInfo.taxable_value || "",
        land_value: detailInfo.land_value || "",
        improvements: detailInfo.improvements || "",
      };

      resolve([th_data]);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Step 4: Get paid years information - only for selected years
const ac_4 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      page.waitForSelector("table.table-search tbody tr", timeout_option)
      .then(async () => {
        const more_data = await page.evaluate((status_data, years_to_include) => {
          const rows = document.querySelectorAll("table.table-search tbody tr");

          for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll("td");
            if (cells.length < 9) continue;

            const yearText = cells[2].textContent.trim();
            const year = parseInt(yearText, 10);
            if (isNaN(year)) continue;

            // Only process years in our selected list
            if (!years_to_include.includes(year)) continue;

            const status = cells[5].textContent.trim();

            if (status === "Paid" && status_data[year]) {
              const amountPaid = cells[6].textContent.trim();
              const datePaid = cells[7].textContent.trim();

              let th_data = {
                jurisdiction: "County",
                year: year.toString(),
                payment_type: "Annual",
                status: "Paid",
                base_amount: amountPaid,
                amount_paid: amountPaid,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: "",
                delq_date: "",
                paid_date: datePaid !== "-" ? datePaid : "",
                good_through_date: "",
                assessed_value: "",
                land_value: ""
              };
              status_data[year]['history'].unshift(th_data);
            }
          }

          return status_data;
        }, main_data.status_data, main_data.years_to_include);

        resolve({
          data: main_data.data,
          history_data: more_data,
          max_year: main_data.max_year,
          years_to_include: main_data.years_to_include,
          has_delinquent: main_data.has_delinquent,
          delinquent_years: main_data.delinquent_years
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

// Step 4b: Extract max year detail values
const ac_4b_extract_max_year_detail = async (page, main_data, max_year) => {
  return new Promise(async (resolve, reject) => {
    try {
      const clicked = await page.evaluate((targetYear) => {
        const rows = document.querySelectorAll("table.table-search tbody tr");
        for (const row of rows) {
          const yearCell = row.cells[2];
          if (yearCell && yearCell.textContent.trim() === targetYear.toString()) {
            const link = row.querySelector("a[title='View Detailed Account Information']") ||
                         row.querySelector("td:nth-child(4) a");
            if (link) {
              link.click();
              return true;
            }
          }
        }
        return false;
      }, max_year);

      if (!clicked) {
        console.log(`No link found for year ${max_year} - skipping detail fetch`);
        resolve(main_data);
        return;
      }

      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(".Table-row, .Spread, table", { timeout: 20000 });

      const detailData = await page.evaluate(() => {
        const info = {
          assessed_value: "",
          taxable_value: "",
          land_value: "",
          improvements: "",
          market_value: "",
          total_billed: "",
          total_due: "",
          property_address: "",
          owner_names: [],
          exemption: ""
        };

        const allText = document.body.innerText + " " + document.documentElement.innerHTML;
        const lines = allText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

        const ownerMatch = allText.match(/OWNER:\s*([^PROPERTY|STATUS]+)/i) || 
                           allText.match(/([A-Z\s]+[A-Z]{2,})\s*\n/i);
        if (ownerMatch) info.owner_names = [ownerMatch[1].trim()];

        const addrMatch = allText.match(/PROPERTY ADDRESS:\s*([^STATUS|GROSS|TAX]+)/i);
        if (addrMatch) info.property_address = addrMatch[1].trim();

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toUpperCase();
          const next = lines[i+1] || "";
          const val = next.replace(/[^0-9,.]/g, '').replace(/,/g, '');

          if (line.includes("ASSESSED VALUE") || line.includes("ASSESSED:")) {
            info.assessed_value = val || next.match(/\$?([\d,]+\.?\d*)/)?.[1]?.replace(/,/g, '') || "";
          }
          if (line.includes("TAXABLE VALUE") || line.includes("TAXABLE:")) {
            info.taxable_value = val || "";
          }
          if (line.includes("LAND VALUE") || line.includes("LAND:")) {
            info.land_value = val || "";
          }
          if (line.includes("BUILDING VALUE") || line.includes("IMPROVEMENTS") || line.includes("BUILDING:")) {
            info.improvements = val || "";
          }
          if (line.includes("MARKET VALUE") || line.includes("JUST VALUE")) {
            info.market_value = val || "";
          }
          if (line.includes("GROSS TAX") && line.includes("$")) {
            const m = line.match(/\$?([\d,]+\.?\d*)/);
            if (m) info.total_billed = m[1].replace(/,/g, '');
          }
          if (line.includes("EXEMPTION") || line.includes("TOTAL EXEMPTIONS")) {
            info.exemption = val || "";
          }
        }

        if (!info.assessed_value && info.market_value) {
          info.assessed_value = info.market_value;
        }
        if (!info.taxable_value && info.assessed_value) {
          info.taxable_value = info.assessed_value;
        }
        if (!info.land_value && info.market_value) {
          info.land_value = info.market_value;
        }

        return info;
      });

      const d = main_data.data;
      if (detailData.assessed_value) {
        d.total_assessed_value = formatCurrency(detailData.assessed_value);
      }
      if (detailData.taxable_value) {
        d.total_taxable_value = formatCurrency(detailData.taxable_value);
      } else if (detailData.assessed_value) {
        d.total_taxable_value = formatCurrency(detailData.assessed_value);
      }
      if (detailData.land_value) {
        d.land_value = formatCurrency(detailData.land_value);
      }
      if (detailData.improvements) {
        d.improvements = formatCurrency(detailData.improvements);
      } else if (detailData.market_value && detailData.land_value) {
        const mkt = parseFloat(detailData.market_value);
        const land = parseFloat(detailData.land_value);
        if (!isNaN(mkt) && !isNaN(land) && mkt > land) {
          d.improvements = formatCurrency(mkt - land);
        }
      }
      if (detailData.exemption) {
        d.exemption = formatCurrency(detailData.exemption);
      }
      if (detailData.property_address && !d.property_address.includes("Unassigned")) {
        d.property_address = detailData.property_address;
      }

      if (main_data.history_data?.[max_year]?.history?.[0]) {
        const hist = main_data.history_data[max_year].history[0];
        hist.assessed_value = detailData.assessed_value || hist.assessed_value;
        hist.taxable_value = detailData.taxable_value || hist.taxable_value;
        hist.land_value = detailData.land_value || hist.land_value;
        hist.improvements = detailData.improvements || hist.improvements;
      }

      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.table-search", { timeout: 15000 });

      resolve(main_data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Step 5: Format and finalize data - only include selected years
const ac_5 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      let history_data = main_data.history_data;
      let max_year = main_data.max_year;
      let years_to_include = main_data.years_to_include;

      const main_history_data = [];

      for (const year of years_to_include) {
        if (!history_data[year]) continue;
        
        let base_amt = history_data[year]['base_amount']?.replace(/[$,]/g, '') || "0";
        let history = history_data[year]['history'];

        history.forEach((h) => {
          h.payment_type = "Annual";
          h.base_amount = "$" + parseFloat(base_amt).toFixed(2);
          h.base_amount = formatCurrency(h.base_amount);
          h.amount_paid = formatCurrency(h.amount_paid);
          h.amount_due = formatCurrency(h.amount_due);
          h.due_date = `09/01/${year}`;
          h.delq_date = `04/01/${parseInt(year) + 1}`;

          if (h.status === "Due") {
            if (is_delq(h.delq_date)) {
              h.status = "Delinquent";
              main_data.data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            }
          }

          if (year == max_year) {
            if (h.assessed_value) {
              main_data.data.total_assessed_value = formatCurrency(h.assessed_value);
            }
            if (h.taxable_value) {
              main_data.data.total_taxable_value = formatCurrency(h.taxable_value);
            }
            if (h.land_value) {
              main_data.data.land_value = formatCurrency(h.land_value);
            }
            if (h.improvements) {
              main_data.data.improvements = formatCurrency(h.improvements);
            }
          }

          main_history_data.push(h);
        });

        if (year == max_year) {
          main_data.data.notes += `, ${year} TAXES ARE ${history[0].status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY.`;
        }
      }

      main_data.data.notes += ` NORMAL DUE DATE IS 09/01`;
      main_data.data.tax_history = main_history_data;
      
      // Add summary info like Ohio
      main_data.data.years_requested = years_to_include.length;
      main_data.data.years_returned = years_to_include.length;
      main_data.data.has_delinquent = main_data.has_delinquent || false;
      main_data.data.delinquent_years = main_data.delinquent_years || [];
      
      resolve(main_data.data);
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// Main search chain
const account_search = async (page, account, yearsRequested = 2) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
      .then((data) => {
        ac_2(page, account)
        .then((data1) => {
          ac_3(page, data1, account, yearsRequested)
          .then((data2) => {
            ac_4(page, data2, account)
            .then((data3) => {
              ac_4b_extract_max_year_detail(page, data3, data3.max_year)
              .then((data4) => {
                ac_5(page, data4, account)
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
}

// Main export function
const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;
  try {
    if (!account || account.trim() === '') {
      return res.status(200).render("error_data", {
        error: true,
        message: "Enter the Account Number..."
      });
    }

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render('error_data', {
        error: true,
        message: "Invalid Access"
      });
    }

    // Get years requested from config (same as Ohio logic)
    let yearsRequested = getOHCompanyYears(client);

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, account, yearsRequested)
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
      account_search(page, account, yearsRequested)
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