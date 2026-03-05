// Author : Manjunadh

// Author: Corrected Sandusky County Controller (Union Style)
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

// ────────────────────────────── UTILITIES ──────────────────────────────

const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const num = Math.max(0, parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


const parseCurrency = (str) => {
  if (!str) return 0;
  return Math.max(0, parseFloat(str.toString().replace(/[^0-9.-]+/g, "")) || 0);
};

const sanduskyConfig = {
  reportUrlBase: "https://beacon.schneidercorp.com/Application.aspx?AppID=1101&LayerID=27241&PageTypeID=4&PageID=15826&KeyValue=",
  taxing_authority: "Sandusky County Auditor — 100 N. Park Ave., Room 109, Fremont, OH 43420",
  dueDates: { 
    due1: "02/14", 
    delq1: "02/15", 
    due2: "07/11", 
    delq2: "07/12" 
  },
  selectors: {
    ownerName: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch",
    ownerAddress: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl01_lblOwnerAddress",
    valuationTable: "#ctlBodyPane_ctl03_ctl01_grdValuation_grdYearData",
    taxHistory: "#ctlBodyPane_ctl12_ctl01_grdTableViewer",
    taxDetail: "#ctlBodyPane_ctl13_ctl01_grdTaxHistory_grdYearData",
    previousTaxHistory: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory",
    paymentsTable: "#ctlBodyPane_ctl17_ctl01_grdTableViewer"
  }
};

// ────────────────────────────── STEP 1: NAVIGATE ──────────────────────────────

const sandusky_navigate = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const reportUrl = `${sanduskyConfig.reportUrlBase}${account}`;
      await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      // Handle disclaimer
      const agreeBtn = await page.$('a.btn.btn-primary[data-dismiss="modal"]');
      if (agreeBtn) {
        await Promise.all([
          agreeBtn.click(),
          page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => { }),
        ]);
        await delay(1000);
      }

      const noRecord = await page.evaluate(() => {
        return document.querySelector('#ctlBodyPane_ctl01_ctl01_lstReport') === null;
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

const sandusky_extract_basic = async (page, account) => {
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
        const ownerEl = document.querySelector("#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch")||
                         document.querySelector("#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
        if (ownerEl) {
          const ownerText = ownerEl.textContent.trim();
          data.owner_name = ownerText ? [ownerText] : [];
        }

        // Extract Property Address
        const addrEl = document.querySelector("#ctlBodyPane_ctl02_ctl01_rptOwner_ctl01_lblOwnerAddress");
        if (addrEl) {
          data.property_address = addrEl.textContent.trim().replace(/\s+/g, " ");
        }

        // Extract Valuation - Get latest year (first column after "Year")
        const valTable = document.querySelector("#ctlBodyPane_ctl03_ctl01_grdValuation_grdYearData");
        if (valTable) {
          const rows = valTable.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const label = row.querySelector("th")?.textContent.trim();
            const latestVal = row.querySelectorAll("td")[0]?.textContent.trim();

            if (label === "Total Value (Appraised 100%)") {
              data.total_assessed_value = latestVal || "$0.00";
              data.total_taxable_value = latestVal || "$0.00";
            }
          });
        }

        return data;
      }, account, sanduskyConfig);

      resolve(basicData);
    } catch (err) {
      reject({ error: true, message: "Basic extraction failed: " + err.message });
    }
  });
};

// ────────────────────────────── STEP 3: EXTRACT TAX HISTORY ──────────────────────────────

const sandusky_extract_tax_history = async (page, basicData, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      const allHistory = [];
      const delinquentInstallments = [];
      let latestTaxYear = "";

      // Get current year tax history from Tax History table
      const currentYearData = await page.evaluate(() => {
        const table = document.querySelector("#ctlBodyPane_ctl12_ctl01_grdTableViewer");
        if (!table) return null;

        const rows = table.querySelectorAll("tbody tr");
        const data = {};
        rows.forEach(row => {
          const yearCell = row.querySelector("th");
          const descCell = row.querySelectorAll("td")[0];
          const amtCell = row.querySelectorAll("td")[1];

          if (yearCell && descCell && amtCell) {
            const yearText = yearCell.textContent.trim();
            const match = yearText.match(/(\d{4})\s+Pay\s+(\d{4})/);
            if (match) {
              const year = match[1];
              const desc = descCell.textContent.trim();
              const amt = amtCell.textContent.trim();

              if (!data[year]) data[year] = {};
              if (desc.includes("First Half")) data[year].first = amt;
              if (desc.includes("Second Half")) data[year].second = amt;
            }
          }
        });

        return data;
      });

      // Get tax detail for current year
      const taxDetail = await page.evaluate(() => {
        const table = document.querySelector("#ctlBodyPane_ctl13_ctl01_grdTaxHistory_grdYearData");
        if (!table) return null;

        const data = {};
        const rows = table.querySelectorAll("tbody tr");
        rows.forEach(row => {
          const label = row.querySelector("th")?.textContent.trim();
          const val = row.querySelector("td")?.textContent.trim();
          if (label && val) data[label] = val;
        });
        return data;
      });

      // Get payment dates
      const paymentMap = await page.evaluate(() => {
        const map = {};
        const table = document.querySelector("#ctlBodyPane_ctl17_ctl01_grdTableViewer");
        if (!table) return map;

        const rows = table.querySelectorAll("tbody tr");
        rows.forEach(row => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length >= 5) {
            const yearText = cells[0].textContent.trim();
            const date = cells[1].textContent.trim();
            const amount = cells[4].textContent.trim();

            const match = yearText.match(/(\d{4})\s+Pay\s+(\d{4})/);
            if (match && date.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              const key = `${match[1]}-${match[2]}`;
              if (!map[key]) map[key] = [];
              map[key].push({ date, amount });
            }
          }
        });
        return map;
      });

      // Process current year
      if (currentYearData && Object.keys(currentYearData).length > 0) {
        const years = Object.keys(currentYearData).sort((a, b) => parseInt(b) - parseInt(a));
        const currentTaxYear = years[0];
        const payYear = parseInt(currentTaxYear) + 1;
        latestTaxYear = currentTaxYear;

        const yearLabel = `${currentTaxYear}-${payYear}`;
        const firstHalf = parseCurrency(currentYearData[currentTaxYear]?.first || "$0.00");
        const secondHalf = parseCurrency(currentYearData[currentTaxYear]?.second || "$0.00");
        const totalDue = taxDetail ? parseCurrency(taxDetail["Due"] || "$0.00") : 0;

        const baseFirst = firstHalf;
        const baseSecond = secondHalf;

        let paidFirst = 0;
        let paidSecond = 0;
        let dueFirst = totalDue / 2;
        let dueSecond = totalDue / 2;

        if (totalDue === 0) {
          paidFirst = baseFirst;
          paidSecond = baseSecond;
          dueFirst = 0;
          dueSecond = 0;
        }

        // Get payment dates for current year
        const payKey = yearLabel;
        const payments = paymentMap[payKey] || [];
        let paidDateFirst = "-";
        let paidDateSecond = "-";

        if (payments.length > 0) {
          payments.sort((a, b) => new Date(a.date) - new Date(b.date));
          if (payments.length >= 2) {
            paidDateFirst = payments[1].date;
            paidDateSecond = payments[0].date;
          } else if (payments.length === 1) {
            const singleAmt = parseCurrency(payments[0].amount);
            if (Math.abs(singleAmt - (baseFirst + baseSecond)) < 0.01) {
              paidDateFirst = payments[0].date;
              paidDateSecond = payments[0].date;
            }
          }
        }

        // Determine status
        const due1Date = new Date(`${sanduskyConfig.dueDates.due1}/${payYear}`);
        const delq1Date = new Date(`${sanduskyConfig.dueDates.delq1}/${payYear}`);
        const due2Date = new Date(`${sanduskyConfig.dueDates.due2}/${payYear}`);
        const delq2Date = new Date(`${sanduskyConfig.dueDates.delq2}/${payYear}`);

        const status1 = dueFirst > 0.01 
          ? (currentDate >= delq1Date ? "Delinquent" : "Due") 
          : "Paid";
        const status2 = dueSecond > 0.01 
          ? (currentDate >= delq2Date ? "Delinquent" : "Due") 
          : "Paid";

        const inst1 = {
          jurisdiction: "County",
          year: yearLabel,
          payment_type: "Semi-Annual",
          installment: "1st Half",
          status: status1,
          base_amount: formatCurrency(baseFirst),
          amount_paid: formatCurrency(paidFirst),
          amount_due: formatCurrency(dueFirst),
          due_date: `${sanduskyConfig.dueDates.due1}/${payYear}`,
          delq_date: `${sanduskyConfig.dueDates.delq1}/${payYear}`,
          paid_date: status1 === "Paid" ? paidDateFirst : "-",
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
          due_date: `${sanduskyConfig.dueDates.due2}/${payYear}`,
          delq_date: `${sanduskyConfig.dueDates.delq2}/${payYear}`,
          paid_date: status2 === "Paid" ? paidDateSecond : "-",
          mailing_date: "N/A",
          good_through_date: ""
        };

        allHistory.push(inst1, inst2);
        if (status1 === "Delinquent") delinquentInstallments.push(inst1);
        if (status2 === "Delinquent") delinquentInstallments.push(inst2);
      }

      // Get available prior years from Previous Tax System History
      const priorYears = await page.evaluate(() => {
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

      // Process each prior year
      for (let i = 0; i < priorYears.length; i++) {
        const { taxYear: ty, payYear: py, btnId } = priorYears[i];
        const yearLabel = `${ty}-${py}`;

        // Click to expand
        try {
          await page.click(`#${btnId}`);
          await delay(500);
        } catch (e) {}

        // Extract detail data
        const detailData = await page.evaluate((idx) => {
          const ctlNum = String(idx + 2).padStart(2, '0');
          const table = document.querySelector(`#ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl${ctlNum}_gvwTaxHistory_Detail_Total`);
          if (!table) return null;

          const data = {};
          const rows = table.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const label = row.querySelector("td")?.textContent.trim();
            const val = row.querySelectorAll("td")[1]?.textContent.trim();
            if (label && val) data[label] = val;
          });
          return data;
        }, i);

        if (!detailData) continue;

        const netOwed = parseCurrency(detailData["Net Owed"] || "$0.00");
        const netPaid = Math.abs(parseCurrency(detailData["Net Paid"] || "$0.00"));
        const netDue = parseCurrency(detailData["Net Due"] || "$0.00");

        const baseFirst = netOwed / 2;
        const baseSecond = netOwed / 2;

        let paidFirst = 0;
        let paidSecond = 0;
        let dueFirst = netDue / 2;
        let dueSecond = netDue / 2;

        if (netDue === 0) {
          paidFirst = baseFirst;
          paidSecond = baseSecond;
          dueFirst = 0;
          dueSecond = 0;
        }

        // Get payment dates
        const payKey = yearLabel;
        const payments = paymentMap[payKey] || [];
        let paidDateFirst = "-";
        let paidDateSecond = "-";

        if (payments.length > 0 && netDue === 0) {
          payments.sort((a, b) => new Date(a.date) - new Date(b.date));
          if (payments.length >= 2) {
            paidDateFirst = payments[1].date;
            paidDateSecond = payments[0].date;
          }
        }

        // Determine status
        const due1Date = new Date(`${sanduskyConfig.dueDates.due1}/${py}`);
        const delq1Date = new Date(`${sanduskyConfig.dueDates.delq1}/${py}`);
        const due2Date = new Date(`${sanduskyConfig.dueDates.due2}/${py}`);
        const delq2Date = new Date(`${sanduskyConfig.dueDates.delq2}/${py}`);

        const status1 = dueFirst > 0.01 
          ? (currentDate >= delq1Date ? "Delinquent" : "Due") 
          : "Paid";
        const status2 = dueSecond > 0.01 
          ? (currentDate >= delq2Date ? "Delinquent" : "Due") 
          : "Paid";

        const inst1 = {
          jurisdiction: "County",
          year: yearLabel,
          payment_type: "Semi-Annual",
          installment: "1st Half",
          status: status1,
          base_amount: formatCurrency(baseFirst),
          amount_paid: formatCurrency(paidFirst),
          amount_due: formatCurrency(dueFirst),
          due_date: `${sanduskyConfig.dueDates.due1}/${py}`,
          delq_date: `${sanduskyConfig.dueDates.delq1}/${py}`,
          paid_date: status1 === "Paid" ? paidDateFirst : "-",
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
          due_date: `${sanduskyConfig.dueDates.due2}/${py}`,
          delq_date: `${sanduskyConfig.dueDates.delq2}/${py}`,
          paid_date: status2 === "Paid" ? paidDateSecond : "-",
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

      noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${sanduskyConfig.dueDates.due1} AND ${sanduskyConfig.dueDates.due2}`);

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

const sandusky_search = async (page, account, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      await sandusky_navigate(page, account);
      const basicData = await sandusky_extract_basic(page, account);
      const finalData = await sandusky_extract_tax_history(page, basicData, yearsRequested);
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
      sandusky_search(page, account, yearsRequested)
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
      sandusky_search(page, account, yearsRequested)
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