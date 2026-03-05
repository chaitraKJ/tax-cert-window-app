// Author: Manjunadh
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// ────────────────────────────── UTILITIES ──────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const num = Math.max(0, parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const parseCurrency = (str) => {
  if (!str) return 0;
  return Math.max(0, parseFloat(str.toString().replace(/[^0-9.-]+/g, "")) || 0);
};

const trumbullConfig = {
  reportUrlBase: "https://beacon.schneidercorp.com/Application.aspx?AppID=1121&LayerID=28255&PageTypeID=4&PageID=11611&KeyValue=",
  taxing_authority: "Trumbull County Auditor — 160 High Street, Warren, OH 44481",
  dueDates: { 
    due1: "03/07", 
    delq1: "03/08", 
    due2: "08/01", 
    delq2: "08/02" 
  },
  selectors: {
    parcelInput: "#ctlBodyPane_ctl02_ctl01_txtParcelID",
    searchBtn: "#ctlBodyPane_ctl02_ctl01_btnSearch",
    ownerName: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
    ownerAddress: "#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_lblOwnerAddress",
    propertyAddress: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl02_pnlSingleValue span",
    valuationTable: "#ctlBodyPane_ctl02_ctl01_grdValuation_grdYearData",
    taxHistoryTable: "#ctlBodyPane_ctl12_ctl01_gvwTaxHistory",
    paymentsTable: "#ctlBodyPane_ctl19_ctl01_grdPayments"
  }
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

const trumbull_navigate = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const reportUrl = `${trumbullConfig.reportUrlBase}${account}`;  
      await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

      

      const noRecord = await page.evaluate(() => {
       
        const hasSummaryDiv = document.querySelector('#ctlBodyPane_ctl00_ctl01_dynamicSummary_divSummary') !== null;

        return !hasSummaryDiv;  
      });

      if (noRecord) {
        return reject({ error: true, message: "Record not found or invalid parcel: " + account });
      }

      resolve(true);
    } catch (err) {
      reject({ error: true, message: "Navigation failed: " + err.message });
    }
  });
};

// ────────────────────────────── STEP 2: EXTRACT BASIC INFO ──────────────────────────────

const trumbull_extract_basic = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const basicData = await page.evaluate((account, config) => {
        const data = {
          processed_date: new Date().toISOString().slice(0, 10),
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: account,
          land_value: "$0.00",
          improvements: "$0.00",
          total_assessed_value: "$0.00",
          exemption: "",
          total_taxable_value: "$0.00",
          taxing_authority: config.taxing_authority,
          notes: "",
          delinquent: "NONE",
          tax_history: []
        };

        // Extract Owner Name
        const ownerEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl01_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch")||
                        document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
        if (ownerEl) {
          const ownerText = ownerEl.textContent.trim();
          data.owner_name = ownerText ? [ownerText] : [];
        }

        // Extract Property Address
        const propAddrEl = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl02_pnlSingleValue span");
        if (propAddrEl) {
          data.property_address = propAddrEl.textContent.trim().replace(/\s+/g, " ");
        }

        // Extract Valuation - Get latest year (2024)
        const valTable = document.querySelector("#ctlBodyPane_ctl02_ctl01_grdValuation_grdYearData");
        if (valTable) {
          const rows = valTable.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const label = row.querySelector("th")?.textContent.trim();
            const latestVal = row.querySelectorAll("td")[0]?.textContent.trim(); // First column is latest year

            if (label === "Land Value") data.land_value = latestVal || "$0.00";
            if (label === "Improvements Value") data.improvements = latestVal || "$0.00";
            if (label === "Total Value (Assessed 35%)") {
              data.total_assessed_value = latestVal || "$0.00";
              data.total_taxable_value = latestVal || "$0.00";
            }
          });
        }

        return data;
      }, account, trumbullConfig);

      resolve(basicData);
    } catch (err) {
      reject({ error: true, message: "Basic extraction failed: " + err.message });
    }
  });
};

// ────────────────────────────── STEP 3: EXTRACT TAX HISTORY ──────────────────────────────

const trumbull_extract_tax_history = async (page, basicData, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const taxYear = currentYear - 1; // 2024 for year 2025

      // Get payment dates first
      const paymentMap = await page.evaluate(() => {
        const map = {};
        const table = document.querySelector("#ctlBodyPane_ctl19_ctl01_grdPayments");
        if (!table) return map;

        const rows = table.querySelectorAll("tbody tr");
        rows.forEach(row => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length >= 5) {
            const taxYearText = cells[0].textContent.trim(); // "2024 Pay 2025"
            const paidDate = cells[1].textContent.trim();
            const firstPaid = cells[3].textContent.trim();
            const secondPaid = cells[4].textContent.trim();

            const match = taxYearText.match(/(\d{4})\s+Pay\s+(\d{4})/);
            if (match && paidDate.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              const key = `${match[1]}-${match[2]}`;
              if (!map[key]) map[key] = {};
              
              // Determine if this is 1st or 2nd half based on amounts
              if (firstPaid && firstPaid !== "$0.00") {
                map[key].first = paidDate;
              }
              if (secondPaid && secondPaid !== "$0.00") {
                map[key].second = paidDate;
              }
            }
          }
        });
        return map;
      });

      // Extract tax history from detail tables
      const allHistory = [];
      const delinquentInstallments = [];
      let latestTaxYear = "";

      // Get available tax years
      const taxYears = await page.evaluate(() => {
        const years = [];
        document.querySelectorAll('[id^="btndiv"]').forEach(btn => {
          const text = btn.textContent.trim();
          const match = text.match(/(\d{4})\s+Pay\s+(\d{4})/);
          if (match) {
            years.push({ taxYear: match[1], payYear: match[2], btnId: btn.id });
          }
        });
        return years;
      });

      // Process each tax year
      for (let i = 0; i < taxYears.length; i++) {
        const { taxYear: ty, payYear: py, btnId } = taxYears[i];
        const yearLabel = `${ty}-${py}`;

        if (ty > latestTaxYear) latestTaxYear = ty;

        // Click to expand the detail if not already expanded
        try {
          await page.click(`#${btnId}`);
          await delay(500);
        } catch (e) {
          // Already expanded or error
        }

        // Extract detail data
        const detailData = await page.evaluate((idx) => {
          const ctlNum = String(idx + 2).padStart(2, '0');
          const table = document.querySelector(`#ctlBodyPane_ctl12_ctl01_gvwTaxHistory_ctl${ctlNum}_gvwTaxHistory_Detail_Total`);
          if (!table) return null;

          const data = {
            charge: "$0.00",
            netTax: "$0.00",
            netOwed: "$0.00",
            netPaid: "$0.00",
            netDue: "$0.00"
          };

          const rows = table.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const label = row.querySelector("td")?.textContent.trim();
            const val = row.querySelectorAll("td")[1]?.textContent.trim();

            if (label === "Charge") data.charge = val;
            if (label === "Net Tax") data.netTax = val;
            if (label === "Net Owed") data.netOwed = val;
            if (label === "Net Paid") data.netPaid = val;
            if (label === "Net Due") data.netDue = val;
          });

          return data;
        }, i);

        if (!detailData) continue;

        // Calculate amounts
        const totalOwed = parseCurrency(detailData.netOwed);
        const totalPaid = Math.abs(parseCurrency(detailData.netPaid));
        const totalDue = parseCurrency(detailData.netDue);

        // Split into halves
        const baseFirst = totalOwed / 2;
        const baseSecond = totalOwed / 2;

        let paidFirst = 0;
        let paidSecond = 0;
        let dueFirst = totalDue / 2;
        let dueSecond = totalDue / 2;

        // Adjust based on actual payments
        if (totalPaid > 0) {
          if (totalPaid >= baseFirst) {
            paidFirst = baseFirst;
            paidSecond = Math.min(totalPaid - baseFirst, baseSecond);
            dueFirst = 0;
            dueSecond = Math.max(0, totalDue - dueFirst);
          } else {
            paidFirst = totalPaid;
            paidSecond = 0;
            dueFirst = Math.max(0, baseFirst - paidFirst);
            dueSecond = baseSecond;
          }
        }

        // Get payment dates
        const payKey = `${ty}-${py}`;
        const paidDateFirst = paymentMap[payKey]?.first || (paidFirst > 0 ? "N/A" : "-");
        const paidDateSecond = paymentMap[payKey]?.second || (paidSecond > 0 ? "N/A" : "-");

        // Determine status
        const due1Date = new Date(`${trumbullConfig.dueDates.due1}/${py}`);
        const delq1Date = new Date(`${trumbullConfig.dueDates.delq1}/${py}`);
        const due2Date = new Date(`${trumbullConfig.dueDates.due2}/${py}`);
        const delq2Date = new Date(`${trumbullConfig.dueDates.delq2}/${py}`);

        const status1 = dueFirst > 0.01 
          ? (currentDate >= delq1Date ? "Delinquent" : "Due") 
          : "Paid";
        const status2 = dueSecond > 0.01 
          ? (currentDate >= delq2Date ? "Delinquent" : "Due") 
          : "Paid";

        // Create installments
        const inst1 = {
          jurisdiction: "County",
          year: yearLabel,
          payment_type: "Semi-Annual",
          installment: "1st Half",
          status: status1,
          base_amount: formatCurrency(baseFirst),
          amount_paid: formatCurrency(paidFirst),
          amount_due: formatCurrency(dueFirst),
          due_date: `${trumbullConfig.dueDates.due1}/${py}`,
          delq_date: `${trumbullConfig.dueDates.delq1}/${py}`,
          paid_date: paidDateFirst,
          mailing_date: "N/A",
          good_through_date: ""
        };

        const inst2 = {
          jurisdiction: "County",
          year: yearLabel,
          payment_type: "Semi-Annual",
          installment: "2nd Half",
          status: status2,
          base_amount: formatCurrency(baseSecond),
          amount_paid: formatCurrency(paidSecond),
          amount_due: formatCurrency(dueSecond),
          due_date: `${trumbullConfig.dueDates.due2}/${py}`,
          delq_date: `${trumbullConfig.dueDates.delq2}/${py}`,
          paid_date: paidDateSecond,
          mailing_date: "N/A",
          good_through_date: ""
        };

        allHistory.push(inst1, inst2);

        if (status1 === "Delinquent") delinquentInstallments.push(inst1);
        if (status2 === "Delinquent") delinquentInstallments.push(inst2);
      }

      // Sort all history: oldest → newest
      allHistory.sort((a, b) => {
        const ya = parseInt(a.year.split('-')[0]);
        const yb = parseInt(b.year.split('-')[0]);
        if (ya !== yb) return ya - yb;
        return a.installment === "1st Half" ? -1 : 1;
      });

      // Determine which years to keep: latest N + any delinquent
      const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))].sort();
      const latestNYears = uniqueYears.slice(-yearsRequested);

      let finalHistory = allHistory.filter(h => latestNYears.includes(h.year.split('-')[0]));

      // Add any delinquent installments not already included
      for (const delq of delinquentInstallments) {
        if (!finalHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
          finalHistory.push(delq);
        }
      }

      // Re-sort final
      finalHistory.sort((a, b) => {
        const ya = parseInt(a.year.split('-')[0]);
        const yb = parseInt(b.year.split('-')[0]);
        if (ya !== yb) return ya - yb;
        return a.installment === "1st Half" ? -1 : 1;
      });

      basicData.tax_history = finalHistory;

      // Build notes (Union County style)
      const currentYearLabel = latestTaxYear ? `${latestTaxYear}-${parseInt(latestTaxYear) + 1}` : "";
      const currentEntries = finalHistory.filter(i => i.year === currentYearLabel);

      let noteParts = [];
      if (currentEntries.length > 0) {
        const first = currentEntries.find(i => i.installment === "1st Half") || { status: "Paid" };
        const second = currentEntries.find(i => i.installment === "2nd Half") || { status: "Paid" };
        const fStat = first.status.toUpperCase();
        const sStat = second.status.toUpperCase();

        if (first.status === "Paid" && second.status === "Paid") {
          noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID`);
        } else {
          noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`);
        }
      } else if (latestTaxYear) {
        noteParts.push(`${currentYearLabel}: NO TAXES DUE, POSSIBLY EXEMPT`);
      } else {
        noteParts.push("NO TAX DATA AVAILABLE");
      }

      const hasPriorDelq = allHistory.some(i => {
        const y = parseInt(i.year.split('-')[0]);
        return y < parseInt(latestTaxYear || 0) && i.status === "Delinquent";
      });

      if (hasPriorDelq) {
        noteParts.unshift("PRIOR YEARS TAXES ARE DELINQUENT");
      } else {
        noteParts.unshift("ALL PRIORS ARE PAID");
      }

      noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${trumbullConfig.dueDates.due1} AND ${trumbullConfig.dueDates.due2}`);

      basicData.notes = noteParts.join(". ");
      basicData.delinquent = delinquentInstallments.length > 0 
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
        : "NONE";

      resolve(basicData);
    } catch (err) {
      reject({ error: true, message: "Tax history extraction failed: " + err.message });
    }
  });
};

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────

const trumbull_search = async (page, account, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      await trumbull_navigate(page, account);
      const basicData = await trumbull_extract_basic(page, account);
      const finalData = await trumbull_extract_tax_history(page, basicData, yearsRequested);
      resolve(finalData);
    } catch (error) {
      reject(error);
    }
  });
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────

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
      if (['stylesheet', 'font', 'image'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      trumbull_search(page, account, yearsRequested)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.error(error);
          res.status(200).render('error_data', { error: true, message: error.message || error });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type === "api") {
      trumbull_search(page, account, yearsRequested)
        .then((data) => {
          res.status(200).json({ result: data });
        })
        .catch((error) => {
          console.error(error);
          res.status(500).json({ error: true, message: error.message || "Server Error" });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.error(error);
    if (fetch_type === "html") {
      res.status(200).render('error_data', { error: true, message: error.message || "Server Error" });
    } else {
      res.status(500).json({ error: true, message: error.message || "Server Error" });
    }
  }
};

export { search };