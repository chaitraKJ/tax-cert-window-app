// author: Harsha 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout_option = { timeout: 90000 };

const counties = [
  {
    county: "sutter",
    url: "https://ca-sutter.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    taxing_authority: "Sutter County Treasurer-Tax Collector,1160 Civic Center Blvd, Suite E, Yuba City, CA 95993",
  },
  {
    county: "mendocino",
    url: "https://ca-mendocino.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    taxing_authority: "Mendocino County Treasurer-Tax Collector,501 Low Gap Road, Room 1060, Ukiah, CA 95482",
  },
  {
    county: "inyo",
    url: "https://ca-inyo.publicaccessnow.com/Treasurer/TaxSearch.aspx",
    taxing_authority: "Inyo County Treasurer-Tax Collector,168 N. Edwards Street, Independence, CA 93526",
  },
  {
    county: "solano",
    url: "https://ca-solano.publicaccessnow.com/TaxCollector/TaxSearch.aspx",
    taxing_authority: "Solano County Treasurer-Tax Collector,675 Texas Street, Suite 1900, Fairfield, CA 94533",
  },
];

const get_detail_url = async (page, url, account) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".panel-h3.w-100.ml-3.ng-star-inserted", timeout_option);

    await page.evaluate(() => {
      const el = document.querySelector(".panel-h3.w-100.ml-3.ng-star-inserted");
      const next = el?.closest("kendo-panelbar-item")?.querySelector(".k-content");
      if (el && next && next.offsetHeight === 0) el.click();
    });

    const possibleSelectors = [
      "input[title='PIN/Assessor Parcel Number']",
      "input[title='PIN']",
      "input[title='Enter Parcel Number or Assessment Number']",
      "input[title='Parcel / Account Number']",
    ];

    let foundSelector = null;
    for (const selector of possibleSelectors) {
      if (await page.$(selector)) {
        foundSelector = selector;
        break;
      }
    }

    if (!foundSelector) throw new Error("No valid parcel input found");

    await page.click(foundSelector, { clickCount: 3 });
    await page.type(foundSelector, account.trim());

    const searchButtonSelector = "button[title='Search']";
    await page.waitForSelector(searchButtonSelector, timeout_option);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click(searchButtonSelector),
    ]);

    const samePagePromise = page
      .waitForSelector("div[type='text/x-handlebars-template'] .row a", timeout_option)
      .then(() => ({ id: 1 }));

    const nextPagePromise = page
      .waitForSelector(".bill-content", timeout_option)
      .then(() => ({ id: 2 }));

    const data = await Promise.any([samePagePromise, nextPagePromise]);

    let detailLink;
    if (data.id === 1) {
      detailLink = await page.evaluate(() => {
        const link = document.querySelector("div[type='text/x-handlebars-template'] .row a");
        return link ? link.href : null;
      });
    } else if (data.id === 2) {
      detailLink = page.url();
    }

    if (!detailLink) throw new Error("No Record Found");
    return detailLink;
  } catch (error) {
    console.log("❌ get_detail_url error:", error.message);
    throw new Error("Record Not Found");
  }
};

const ac_1 = async (page, detailLink) => {
  return new Promise(async (resolve, reject) => {
    try {
      const countyInfo = counties.find((el) => detailLink.includes(el.county));

      await page.goto(detailLink, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".bill-content", { timeout: 45000 });

      // Expand ALL collapsible sections
      await page.evaluate(() => {
        document.querySelectorAll('button[title="Expand"], .expandable-header[title="Expand"]').forEach(btn => {
          if (!btn.classList.contains('collapsed') && btn.offsetParent !== null) {
            btn.click();
          }
        });
      });

      await delay(1200);

      const main_data = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: ["N/A"],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "N/A",
          exemption: "",
          total_taxable_value: "N/A",
          notes: "",
          delinquent: "",
          taxing_authority: "",
          tax_history: [],
        };

        document.querySelectorAll(".DNNModuleContent.ModPublicAccessPaymentsAccountSummaryC .font-weight-bold").forEach((el) => {
          const label = el.textContent.trim().toLowerCase();
          if (label.includes("property id") || label.includes("parcel") || label.includes("pin")) {
            data.parcel_number = el.nextElementSibling?.textContent.trim() || "";
          }
          if (label.includes("property address")) {
            data.property_address = el.parentElement?.querySelector(".text-capitalize")?.textContent.trim() || "";
          }
        });

        return data;
      });

      const history = await page.evaluate(() => {
        const year_map = {};
        let max_year = 0;

        const calculateDates = (dueStr, year, inst) => {
          const fmt = (dt) => `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
          
          // Parse due date
          let dueDate;
          if (dueStr && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dueStr)) {
            let [m, d, y] = dueStr.split("/").map(Number);
            if (y < 100) y += 2000;
            dueDate = new Date(y, m - 1, d);
          } else {
            // Default due dates based on installment
            if (inst.includes("1")) {
              dueDate = new Date(Number(year), 11, 10); // Dec 10
            } else if (inst.includes("2")) {
              dueDate = new Date(Number(year) + 1, 3, 10); // Apr 10 next year
            } else {
              dueDate = new Date(Number(year), 11, 31); // Dec 31 for annual
            }
          }

          // Calculate delinquency date
          let delqDate;
          if (inst.includes("1")) {
            delqDate = new Date(Number(year), 11, 11); // Dec 11
          } else if (inst.includes("2")) {
            delqDate = new Date(Number(year) + 1, 3, 11); // Apr 11 next year
          } else {
            delqDate = new Date(Number(year) + 1, 0, 1); // Jan 1 next year for annual
          }

          return {
            due_date: fmt(dueDate),
            delq_date: fmt(delqDate)
          };
        };

        document.querySelectorAll(".bill-content").forEach(billContent => {
          const isPaidSection = billContent.querySelector("header label")?.textContent?.toLowerCase().includes("paid");

          billContent.querySelectorAll(".mb-4").forEach(yearDiv => {
            const yearEl = yearDiv.querySelector(".tile-header__value");
            if (!yearEl) return;

            const yearText = yearEl.textContent.trim();
            const yearMatch = yearText.match(/\b(20\d{2})\b/);
            if (!yearMatch) return;
            const year = yearMatch[1];
            max_year = Math.max(max_year, Number(year));

            if (!year_map[year]) year_map[year] = [];

            yearDiv.querySelectorAll("table tbody tr").forEach(tr => {
              const tds = tr.querySelectorAll("td");
              if (tds.length < 5 || tds[0].hasAttribute("colspan")) return;

              let installment = "", dueDate = "", baseAmount = "", amountPaid = "$0.00", amountDue = "$0.00", paidDate = "-";

              if (isPaidSection) {
                installment = tds[0]?.textContent?.trim() || "";
                dueDate = tds[1]?.textContent?.trim() || "";
                const taxCell = tds[2];
                baseAmount = taxCell.querySelector('.total-values__currency b')?.textContent?.trim() ||
                  taxCell.textContent.trim().replace(/[^0-9.$]/g, '') || "$0.00";
                amountPaid = tds[3]?.textContent?.trim().replace('-', '').trim() || "$0.00";
                paidDate = tds[4]?.textContent?.trim() || "N/A";
                amountDue = "$0.00";
              } else {
                installment = tds[1]?.textContent?.trim() || "";
                dueDate = tds[2]?.textContent?.trim() || "";
                const taxCell = tds[3];
                const netTaxEl = taxCell.querySelector('.total-values .total-values__currency');
                baseAmount = netTaxEl?.textContent?.trim() ||
                  taxCell.querySelector('b')?.textContent?.trim() ||
                  taxCell.textContent.trim().replace(/[^0-9.$]/g, '') || "$0.00";
                amountPaid = tds[4]?.textContent?.trim() || "$0.00";
                amountDue = tds[5]?.textContent?.trim() || "$0.00";
                paidDate = "-";
              }

              const paymentType = installment.includes("1") ? "Installment 1" :
                installment.includes("2") ? "Installment 2" : "Annual";

              // Calculate dates for both paid and unpaid
              const dates = calculateDates(dueDate, year, paymentType);
              
              // Determine status for unpaid items
              let status = "Paid";
              if (!isPaidSection) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const [dm, dd, dy] = dates.delq_date.split("/").map(Number);
                const delqDateObj = new Date(dy, dm - 1, dd);
                status = today >= delqDateObj ? "Delinquent" : "Due";
              }

              year_map[year].push({
                jurisdiction: "County",
                year,
                payment_type: paymentType,
                status: status,
                base_amount: baseAmount,
                amount_paid: amountPaid,
                amount_due: amountDue,
                mailing_date: "N/A",
                due_date: dates.due_date,
                delq_date: dates.delq_date,
                paid_date: paidDate,
                good_through_date: "",
                link: "",
              });
            });
          });
        });

        return { year_map, max_year };
      });

      resolve({
        data: main_data,
        year_map: history.year_map,
        max_year: history.max_year.toString(),
        county: countyInfo ? countyInfo.taxing_authority : "Taxing authority not available",
      });
    } catch (error) {
      console.error("❌ ac_1 error:", error);
      reject(error);
    }
  });
};

const ac_2 = async (main_data) => {
  const data = main_data.data;
  const year_map = main_data.year_map;
  const max_year = main_data.max_year;

  const allYears = Object.keys(year_map).sort((a, b) => Number(b) - Number(a));
  
  // Find all delinquent items across all years
  const delinquentItems = [];
  allYears.forEach(year => {
    year_map[year].forEach(item => {
      if (item.status.toLowerCase() === "delinquent") {
        delinquentItems.push({ year, item });
      }
    });
  });

  // Set delinquent status
  data.delinquent = delinquentItems.length > 0
    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
    : "NONE";

  data.taxing_authority = main_data.county;

  // Build tax_history: Include max_year entries + all delinquent entries from prior years
  data.tax_history = [];

  // Always include current year (max_year) entries
  if (year_map[max_year]) {
    const currentYearEntries = year_map[max_year];
    currentYearEntries.forEach(entry => {
      data.tax_history.push(entry);
    });
  }

  // Add all delinquent entries from prior years
  allYears.forEach(year => {
    if (year === max_year) return; // Skip current year (already added)
    
    year_map[year].forEach(entry => {
      if (entry.status.toLowerCase() === "delinquent") {
        data.tax_history.push(entry);
      }
    });
  });

  // Build notes
  const currentYearEntries = year_map[max_year] || [];
  const hasDelinquentCurrent = currentYearEntries.some(e => e.status.toLowerCase() === "delinquent");
  const hasDelinquentPrior = delinquentItems.some(d => d.year !== max_year);

  let notes = "";

  // Prior years status
  if (hasDelinquentPrior) {
    const priorDelinqYears = [...new Set(delinquentItems.filter(d => d.year !== max_year).map(d => d.year))].sort();
    notes = `PRIORS ARE DELINQUENT (${priorDelinqYears.join(", ")})`;
  } else {
    notes = "ALL PRIORS ARE PAID";
  }

  // Current year status
  if (currentYearEntries.length > 0) {
    const inst1 = currentYearEntries.find(e => e.payment_type.includes("1"));
    const inst2 = currentYearEntries.find(e => e.payment_type.includes("2"));

    if (inst1 && inst2) {
      notes += `, ${max_year} 1ST INSTALLMENT IS ${inst1.status.toUpperCase()}, 2ND INSTALLMENT IS ${inst2.status.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY`;
    } else if (currentYearEntries.length === 1) {
      notes += `, ${max_year} TAXES ARE ${currentYearEntries[0].status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY`;
    }
  }

  notes += `. NORMAL DUE DATES ARE 12/10 AND 04/10 FOR SEMI-ANNUAL`;
  
  data.notes = notes;
  const getPaymentPriority = (paymentType = "") => {
    if (paymentType.toLowerCase().includes("installment 1")) return 1;
    if (paymentType.toLowerCase().includes("installment 2")) return 2;
    return 3; 
  };
  data.tax_history.sort((a, b) => {
    // Sort by year DESC
    if (Number(a.year) !== Number(b.year)) {
      return Number(b.year) - Number(a.year);
    }
    // Same year → sort by installment order
    return getPaymentPriority(a.payment_type) - getPaymentPriority(b.payment_type);
  });



  return data;
};

const account_search = async (page, url, account) => {
  try {
    const detailLink = await get_detail_url(page, url, account);
    const data1 = await ac_1(page, detailLink);
    const finalData = await ac_2(data1);
    return finalData;
  } catch (err) {
    console.error("account_search error:", err);
    throw err;
  }
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const county = req.path.replace(/^\/+/, "").toLowerCase();
    const url = counties.find(el => el.county === county)?.url || "";

    if (!account?.trim()) {
      return res.status(400).json({ message: "Please enter a valid account number" });
    }
    if (!url) {
      return res.status(400).json({ status: "failed", message: "Invalid Route" });
    }
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
      return res.status(400).json({ error: true, message: "Invalid Access" });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["font", "image", "stylesheet"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const data = await account_search(page, url, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }

    await context.close();
  } catch (error) {
    console.error(error);
    const msg = error.message || "Internal server error";
    if (fetch_type === "html") {
      res.status(500).render("error_data", { error: true, message: msg });
    } else {
      res.status(500).json({ error: true, message: msg });
    }
  }
};

export { search };