// author: dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const fultonConfig = {
  urlBase: "https://qpublic.schneidercorp.com/Application.aspx?AppID=1083&LayerID=26530&PageTypeID=4&PageID=10778&KeyValue=",
  taxing_authority: "Fulton County, OH 152 S Fulton St. Suite 165 Wauseon, OH 43567",
  dueDates: {
    due1: "02/05",
    delq1: "02/06",
    due2: "07/20",
    delq2: "07/21"
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatDollar = (value) => {
  if (!value || value === "") return "$0.00";
  const num = parseFloat(value.toString().replace(/[$ ,()]/g, ""));
  return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const parseDollar = (str) => {
  if (!str) return 0;
  return parseFloat(str.toString().replace(/[$ ,()]/g, "")) || 0;
};

// Extract data from page
const ac_1 = async (page, account, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `${fultonConfig.urlBase}${account}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

      // Handle disclaimer if present
      const agreeBtn = await page.$('a.btn.btn-primary[data-dismiss="modal"]');
      if (agreeBtn) {
        await Promise.all([
          agreeBtn.click(),
          page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
        ]);
        await delay(1000);
      }

      const data = await page.evaluate((account, config, yearsRequested) => {
        const result = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "$0.00",
          improvements: "$0.00",
          total_assessed_value: "$0.00",
          total_taxable_value: "$0.00",
          taxing_authority: config.taxing_authority,
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

        const parseDollar = (str) => {
          if (!str) return 0;
          return parseFloat(str.toString().replace(/[$ ,()]/g, "")) || 0;
        };

        const formatMoney = (num) => {
          if (!num && num !== 0) return "$0.00";
          const n = typeof num === "string" ? parseFloat(num.replace(/[$,()]/g, "")) || 0 : num;
          return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };

        // Owner & Address
        const ownerEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch") ||
                        document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
        result.owner_name = ownerEl ? [ownerEl.textContent.trim()] : ["N/A"];

        const addrEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_lblOwnerAddress");
        result.property_address = addrEl ? addrEl.textContent.trim().replace(/\s+/g, " ") : "N/A";

        const parcelEl = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span");
        result.parcel_number = parcelEl ? parcelEl.textContent.trim() : account;

        // GET LATEST YEAR VALUATION
        const valTable = document.querySelector("#ctlBodyPane_ctl11_ctl01_grdValuation_grdYearData");
        if (valTable) {
          const years = Array.from(valTable.querySelectorAll("thead th")).slice(1).map(th => th.textContent.trim());
          
          let latestYearCol = -1;
          let latestYear = 0;
          
          years.forEach((yearStr, idx) => {
            const y = parseInt(yearStr);
            if (y && y > latestYear) {
              latestYear = y;
              latestYearCol = idx + 1;
            }
          });

          if (latestYearCol > 0) {
            const rows = valTable.querySelectorAll("tbody tr");
            rows.forEach(r => {
              const label = r.querySelector("th")?.textContent.trim();
              const val = r.querySelectorAll("td")[latestYearCol - 1]?.textContent.trim();
              
              if (label?.includes("Land Value") && !label?.includes("Total")) {
                result.land_value = val || "$0.00";
              }
              if (label?.includes("Improvements Value")) {
                result.improvements = val || "$0.00";
              }
              if (label?.includes("Total Value (Assessed 35%)")) {
                result.total_assessed_value = val || "$0.00";
                result.total_taxable_value = val || "$0.00";
              }
            });
          }
        }

        // TAX HISTORY + PAYMENTS
        const taxTable = document.querySelector("#ctlBodyPane_ctl12_ctl01_grdTaxHistory_grdYearData");
        const paymentRows = document.querySelectorAll("#ctlBodyPane_ctl15_ctl01_grdTaxPayments_grdFlat tbody tr");

        const headers = taxTable ? Array.from(taxTable.querySelectorAll("thead th")).slice(1).map(h => h.textContent.trim()) : [];

        // Build payment map
        const paymentMap = {};
        paymentRows.forEach(row => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length >= 2) {
            const taxYear = cells[0].textContent.trim();
            const paymentDate = cells[1].textContent.trim();
            
            if (taxYear && paymentDate && paymentDate.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              const parts = taxYear.match(/(\d{4})\s+Pay\s+(\d{4})/);
              if (parts) {
                const key1 = `${parts[1]} Pay ${parts[2]} 1st Half`;
                const key2 = `${parts[1]} Pay ${parts[2]} 2nd Half`;
                
                if (!paymentMap[key2]) {
                  paymentMap[key2] = paymentDate;
                } else if (!paymentMap[key1]) {
                  paymentMap[key1] = paymentDate;
                }
              }
            }
          }
        });

        // Parse ALL tax history first
        const allTaxHistory = [];
        let latestTaxYear = "";
        const currentDate = new Date();

        headers.forEach(header => {
          const m = header.match(/^(\d{4})\s+Pay\s+(\d{4})\s+(1st|2nd)\s+Half/);
          if (!m) return;
          const [_, taxYear, payYear, half] = m;
          
          const idx = headers.indexOf(header);
          const charge = taxTable.querySelector(`tbody tr:nth-child(1) td:nth-child(${idx + 2})`)?.textContent.trim() || "$0.00";
          const netTax = taxTable.querySelector(`tbody tr:nth-child(6) td:nth-child(${idx + 2})`)?.textContent.trim() || "$0.00";
          const netPaid = taxTable.querySelector(`tbody tr:nth-child(13) td:nth-child(${idx + 2})`)?.textContent.trim() || "$0.00";
          const netDue = taxTable.querySelector(`tbody tr:nth-child(14) td:nth-child(${idx + 2})`)?.textContent.trim() || "$0.00";

          const chargeAmt = parseDollar(charge);
          const base = parseDollar(netTax);
          const paid = Math.abs(parseDollar(netPaid));
          const due = parseDollar(netDue);
          
          // Skip if both Charge and Net Tax are $0.00
          if (chargeAmt === 0 && base === 0) return;
          
          const dueDate = half === "1st" ? `${config.dueDates.due1}/${payYear}` : `${config.dueDates.due2}/${payYear}`;
          const delqDate = half === "1st" ? `${config.dueDates.delq1}/${payYear}` : `${config.dueDates.delq2}/${payYear}`;
          
          const delqDateObj = new Date(delqDate);
          const status = due > 0.01 
            ? (currentDate >= delqDateObj ? "Delinquent" : "Due")
            : "Paid";
          
          const key = `${taxYear} Pay ${payYear} ${half} Half`;
          const paidDate = status === "Paid" 
            ? (paymentMap[key] || "N/A") 
            : (paymentMap[key] || "-");

          // Track latest year - use format "taxYear-payYear"
          const yearLabel = `${taxYear}-${payYear}`;
          if (taxYear > latestTaxYear) {
            latestTaxYear = yearLabel;
          }

          allTaxHistory.push({
            jurisdiction: "County",
            year: yearLabel,
            payment_type: "Semi-Annual",
            installment: half === "1st" ? "1" : "2",
            status,
            base_amount: formatMoney(base),
            amount_paid: formatMoney(paid),
            amount_due: due > 0.01 ? formatMoney(due) : "$0.00",
            due_date: dueDate,
            delq_date: delqDate,
            paid_date: paidDate,
            good_through_date: "",
            mailing_date: "N/A",
          });
        });

        // Sort all history in ascending order
        allTaxHistory.sort((a, b) => {
          const [aYear] = a.year.split('-').map(Number);
          const [bYear] = b.year.split('-').map(Number);
          const yearCompare = aYear - bYear;
          if (yearCompare !== 0) return yearCompare;
          return (a.installment === "1" ? -1 : 1);
        });

        // Get unique years and filter for requested years + delinquent
        const uniqueYears = [...new Set(allTaxHistory.map(h => h.year.split('-')[0]))].sort();
        const latestNYears = uniqueYears.slice(-yearsRequested);
        
        const delinquentInstallments = allTaxHistory.filter(h => h.status === "Delinquent");
        
        let filteredHistory = allTaxHistory.filter(h => latestNYears.includes(h.year.split('-')[0]));
        
        // Add any delinquent installments not already included
        delinquentInstallments.forEach(delq => {
          if (!filteredHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
            filteredHistory.push(delq);
          }
        });

        // Sort final history
        filteredHistory.sort((a, b) => {
          const [aYear] = a.year.split('-').map(Number);
          const [bYear] = b.year.split('-').map(Number);
          const yearCompare = aYear - bYear;
          if (yearCompare !== 0) return yearCompare;
          return (a.installment === "1" ? -1 : 1);
        });

        result.tax_history = filteredHistory;

        // NOTES LOGIC (Trumbull style)
        const noteParts = [];

        if (latestTaxYear) {
          const yearItems = filteredHistory.filter(t => t.year === latestTaxYear);
          const first = yearItems.find(t => t.installment === "1");
          const second = yearItems.find(t => t.installment === "2");

          // Check if there are prior year delinquents
          const latestYearNum = parseInt(latestTaxYear.split('-')[0]);
          const hasPriorDelq = allTaxHistory.some(t => {
            const tYearNum = parseInt(t.year.split('-')[0]);
            return tYearNum < latestYearNum && t.status === "Delinquent";
          });

          if (hasPriorDelq) {
            noteParts.push("PRIOR YEARS TAXES ARE DELINQUENT");
          } else {
            noteParts.push("ALL PRIORS ARE PAID");
          }

          if (first && second) {
            const s1 = first.status.toUpperCase();
            const s2 = second.status.toUpperCase();
            noteParts.push(`${latestTaxYear}: 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`);
          } else if (first) {
            noteParts.push(`${latestTaxYear}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}`);
          } else if (second) {
            noteParts.push(`${latestTaxYear}: 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
          } else {
            noteParts.push(`${latestTaxYear}: NO TAXES DUE, POSSIBLY EXEMPT`);
          }
        } else {
          noteParts.push("NO TAX DATA AVAILABLE");
        }

        noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE ${config.dueDates.due1} & ${config.dueDates.due2}`);
        result.notes = noteParts.join(", ");

        result.delinquent = delinquentInstallments.length > 0
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        return result;
      }, account, fultonConfig, yearsRequested);

      resolve(data);
    } catch (err) {
      console.error("Error:", err);
      reject(new Error("Record not found"));
    }
  });
};

const account_search = async (page, account, yearsRequested) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account, yearsRequested)
        .then((data) => {
          resolve(data);
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

    let yearsRequested = getOHCompanyYears(client);

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, account, yearsRequested)
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
        });
    } else if (fetch_type === "api") {
      account_search(page, account, yearsRequested)
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
        });
    }

  } catch (error) {
    console.log(error);
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