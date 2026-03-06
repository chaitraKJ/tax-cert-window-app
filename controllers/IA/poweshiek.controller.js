// AUTHOR: DHANUSH
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const calculateTaxStatus = (taxHistory, currentDate = new Date()) => {
  return taxHistory.map((item) => {
    if (item.status === "Paid") {
      return { ...item, status: "Paid", delinquent: "NONE" };
    }

    const dueParts = item.due_date?.split("/") ?? [];
    const delqParts = item.delq_date?.split("/") ?? [];

    let dueDate = null;
    let delqDate = null;

    if (dueParts.length === 3) {
      const [mm, dd, yyyy] = dueParts.map(Number);
      dueDate = new Date(yyyy, mm - 1, dd);
    }
    if (delqParts.length === 3) {
      const [mm, dd, yyyy] = delqParts.map(Number);
      delqDate = new Date(yyyy, mm - 1, dd);
    }

    if (!dueDate || isNaN(dueDate.getTime())) {
      return { ...item, status: "Unpaid", delinquent: "NONE" };
    }

    if (!delqDate || isNaN(delqDate.getTime())) {
      delqDate = new Date(dueDate);
      delqDate.setDate(dueDate.getDate() + 1);
    }

    const isDelinquent = delqDate <= currentDate;
    return {
      ...item,
      status: isDelinquent ? "Delinquent" : "Due",
      delinquent: isDelinquent ? "YES" : "NONE",
    };
  });
};

const countyConfig = {
  poweshiek: {
    baseUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=135&LayerID=1603&PageTypeID=4&PageID=842&KeyValue=",
    parcelSelector: "#ctlBodyPane_ctl00_ctl01_lblParcelID",
    addressSelector: "#ctlBodyPane_ctl00_ctl01_lblPropertyAddress",
    ownerSelector: "#ctlBodyPane_ctl01_ctl01_lstDeed tbody tr",
    valuationYearSelector: "#ctlBodyPane_ctl10_ctl01_grdValuation thead th.value-column",
    valuationRowsSelector: "#ctlBodyPane_ctl10_ctl01_grdValuation tbody tr",
    taxHistorySelector: "#ctlBodyPane_ctl12_ctl01_gvwTaxHistory tbody tr",
    taxingAuthority: "Poweshiek County Treasurer, P O Box 57, Montezuma, IA 50171, Ph: (641) 623-5128",
  },
};

const ac_1 = async (page, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `${config.baseUrl}${encodeURIComponent(account)}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      const parcelEl = await page.$(config.parcelSelector);
      if (!parcelEl) return reject({ error: true, message: "Parcel not found" });

      const paidAmount = await page.evaluate((cfg) => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        let totalDue = 0;
        const rows = document.querySelectorAll(cfg.taxHistorySelector);

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length < 6) return;

          const amt1 = clean(cells[2].querySelector("[id$='FirstHalfBilled']")?.textContent || "");
          const amt2 = clean(cells[2].querySelector("[id$='SecondHalfBilled']")?.textContent || "");
          const paid1 = clean(cells[3].querySelector("[id$='FirstHalfPaid']")?.textContent || "");
          const paid2 = clean(cells[3].querySelector("[id$='SecondHalfPaid']")?.textContent || "");

          if (amt1 && paid1.toLowerCase() !== "yes") {
            totalDue += parseFloat(amt1.replace(/[$,]/g, "") || 0);
          }
          if (amt2 && paid2.toLowerCase() !== "yes") {
            totalDue += parseFloat(amt2.replace(/[$,]/g, "") || 0);
          }
        });

        return totalDue === 0 ? "$0.00" : `$${totalDue.toFixed(2)}`;
      }, config);

      resolve(paidAmount);
    } catch (err) {
      reject({ error: true, message: err.message });
    }
  });
};


const ac_2 = async (page, paid_status, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await page.evaluate((cfg, acct) => {
        const clean = (s) => (s || "").replace(/<br>/gi, ", ").replace(/\s+/g, " ").trim();

        const datum = {
          processed_date: new Date().toISOString().slice(0, 10),
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: acct,
          legal_description: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "",
          exemption: "",
          total_taxable_value: "",
          taxing_authority: cfg.taxingAuthority,
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        // Basic info
        datum.parcel_number = clean(document.querySelector(cfg.parcelSelector)?.textContent);
        datum.property_address = clean(document.querySelector(cfg.addressSelector)?.innerHTML);

        document.querySelectorAll(cfg.ownerSelector).forEach((row) => {
          let name = "";
          const span = row.querySelector("span[id*='sprOwnerName']");
          if (span) {
            name = clean(span.textContent);
          } else {
            const link = row.querySelector("a");
            name = link ? clean(link.textContent) : "";
          }
          if (name && !datum.owner_name.includes(name)) {
            datum.owner_name.push(name);
          }
        });

        datum.legal_description = clean(
          document.querySelector("#ctlBodyPane_ctl00_ctl01_lblLegalDescription")?.textContent
        );

        // Valuation
        const yearThs = document.querySelectorAll(cfg.valuationYearSelector);
        const years = Array.from(yearThs).map((th) => clean(th.textContent)).filter(Boolean);
        if (years.length) {
          const rows = document.querySelectorAll(cfg.valuationRowsSelector);
          const labelMap = {};

          rows.forEach((row) => {
            const cells = row.querySelectorAll("td, th");
            if (cells.length < 2) return;
            const label = clean(cells[1].textContent);
            if (!label) return;

            const values = [];
            for (let i = 0; i < years.length; i++) {
              const td = cells[2 + i];
              values.push(td ? clean(td.textContent) : "");
            }
            labelMap[label] = values;
          });

          const cur = 0;
          const get = (key) => labelMap[key]?.[cur] ?? "";

          datum.land_value = get("Assessed Land Value");
          datum.improvements = get("Assessed Building Value") || get("Assessed Dwelling Value");
          datum.total_assessed_value = get("Gross Assessed Value");
          datum.exemption = get("Exempt Value");
          datum.total_taxable_value = get("Net Assessed Value");
        }

        return datum;
      }, config, account);

      resolve({ data, paid_status });
    } catch (err) {
      reject({ error: true, message: err.message });
    }
  });
};

const ac_paid = async (page, inputData, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();

      const rawHistory = await page.evaluate((cfg) => {
        const clean = (s) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        const rows = document.querySelectorAll(cfg.taxHistorySelector);
        const history = [];

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td, th");
          if (cells.length < 6) return;

          const year = clean(cells[0].textContent);
          if (!/^\d{4}$/.test(year)) return;

          const dueMonth1 = clean(cells[1].querySelector("[id$='FirstHalfDueMonth']")?.textContent);
          const dueYear1 = clean(cells[1].querySelector("[id$='FirstHalfDueYear']")?.textContent);
          const dueMonth2 = clean(cells[1].querySelector("[id$='SecondHalfDueMonth']")?.textContent);
          const dueYear2 = clean(cells[1].querySelector("[id$='SecondHalfDueYear']")?.textContent);

          const amt1 = clean(cells[2].querySelector("[id$='FirstHalfBilled']")?.textContent);
          const amt2 = clean(cells[2].querySelector("[id$='SecondHalfBilled']")?.textContent);

          const paid1 = clean(cells[3].querySelector("[id$='FirstHalfPaid']")?.textContent);
          const paid2 = clean(cells[3].querySelector("[id$='SecondHalfPaid']")?.textContent);

          const paidDate1 = clean(cells[4].querySelector("[id$='FirstHalfDatePaid']")?.textContent);
          const paidDate2 = clean(cells[4].querySelector("[id$='SecondHalfDatePaid']")?.textContent);

          const makeItem = (half, monthName, yearNum, amount, isPaid, paidDt) => {
            if (!amount || amount === "$0" || amount === "$0.00") return null;

            const paymentType = half === 1 ? "Installment #1" : "Installment #2";
            let dueDateStr = "";
            let delqDateStr = "";

            if (monthName && yearNum) {
              const monthMap = { September: { m: 9, d: 30 }, March: { m: 3, d: 31 } };
              const info = monthMap[monthName];
              if (info) {
                const due = new Date(parseInt(yearNum), info.m - 1, info.d);
                dueDateStr = `${String(due.getMonth() + 1).padStart(2, "0")}/${String(due.getDate()).padStart(2, "0")}/${due.getFullYear()}`;

                const delq = new Date(due);
                delq.setMonth(delq.getMonth() + 1);
                delq.setDate(1);
                delqDateStr = `${String(delq.getMonth() + 1).padStart(2, "0")}/${String(delq.getDate()).padStart(2, "0")}/${delq.getFullYear()}`;
              }
            }

            return {
              jurisdiction: "County",
              year,
              payment_type: paymentType,
              status: (isPaid || "").toLowerCase() === "yes" ? "Paid" : "Unpaid",
              base_amount: amount,
              amount_paid: (isPaid || "").toLowerCase() === "yes" ? amount : "$0.00",
              amount_due: (isPaid || "").toLowerCase() === "yes" ? "$0.00" : amount,
              mailing_date: "N/A",
              due_date: dueDateStr,
              delq_date: delqDateStr,
              paid_date: paidDt || "-",
              good_through_date: "",
            };
          };

          const i1 = makeItem(1, dueMonth1, dueYear1, amt1, paid1, paidDate1);
          const i2 = makeItem(2, dueMonth2, dueYear2, amt2, paid2, paidDate2);
          if (i1) history.push(i1);
          if (i2) history.push(i2);
        });

        return history;
      }, config);

      const processed = calculateTaxStatus(rawHistory, currentDate);

      const byYear = {};
      processed.forEach((item) => {
        if (item.base_amount && item.base_amount !== "$0.00") {
          if (!byYear[item.year]) byYear[item.year] = [];
          byYear[item.year].push(item);
        }
      });

      if (Object.keys(byYear).length === 0) {
        inputData.tax_history = [];
        inputData.delinquent = "NONE";
        inputData.notes = "NO TAX DATA AVAILABLE YET. 2025 TAXES NOT RELEASED.";
        return resolve({ data: inputData, balance: "$0.00" });
      }

      const allYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);
      const latestYear = allYears[0];
      const latestItems = byYear[latestYear] || [];

      const inst1Item = latestItems.find((i) => i.payment_type === "Installment #1");
      const inst2Item = latestItems.find((i) => i.payment_type === "Installment #2");
      const baseAmountLatest = inst1Item?.base_amount || inst2Item?.base_amount || "$0.00";

      const finalHistory = [];

      const addInstallment = (type) => {
        const existing = latestItems.find((i) => i.payment_type === type);
        if (existing) {
          finalHistory.push(existing);
        } else {
          const isFirst = type === "Installment #1";
          const due = isFirst ? `09/30/${latestYear}` : `03/31/${latestYear + 1}`;
          const delq = isFirst ? `10/01/${latestYear}` : `04/01/${latestYear + 1}`;
          const fake = {
            jurisdiction: "County",
            year: latestYear.toString(),
            payment_type: type,
            status: "Unpaid",
            base_amount: baseAmountLatest,
            amount_paid: "$0.00",
            amount_due: baseAmountLatest,
            mailing_date: "N/A",
            due_date: due,
            delq_date: delq,
            paid_date: "-",
            good_through_date: "",
          };
          finalHistory.push(calculateTaxStatus([fake], currentDate)[0]);
        }
      };

      addInstallment("Installment #1");
      addInstallment("Installment #2");


      const delinquentPriorYears = [];
      allYears.slice(1).forEach((year) => {
        const items = byYear[year];
        const hasUnpaid = items.some((i) => i.amount_due && i.amount_due !== "$0.00");
        if (hasUnpaid) {
          delinquentPriorYears.push(year);
          items.forEach((item) => finalHistory.push(item));
        }
      });
        finalHistory.sort((a, b) => {
            const ya = Number(a.year);
            const yb = Number(b.year);
            if (ya !== yb) return ya - yb;               
        
            return a.payment_type.includes("#1") ? -1 : 1;
        });


      const hasDelinquent = finalHistory.some((i) => i.delinquent === "YES");
      const delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      const inst1 = finalHistory.find(
        (i) => i.year === latestYear.toString() && i.payment_type === "Installment #1"
      ) || { status: "Unpaid" };
      const inst2 = finalHistory.find(
        (i) => i.year === latestYear.toString() && i.payment_type === "Installment #2"
      ) || { status: "Unpaid" };

      let notes = "";
      if (delinquentPriorYears.length > 0) {
        notes += `PRIOR YEAR${delinquentPriorYears.length > 1 ? "S" : ""} ${delinquentPriorYears
          .sort((a, b) => b - a)
          .join(", ")} ${delinquentPriorYears.length > 1 ? "ARE" : "IS"} DELINQUENT.`;
      } else {
        notes += "ALL PRIOR YEARS ARE PAID.";
      }
      notes += ` ${latestYear} 1ST INSTALLMENT IS ${inst1.status.toUpperCase()} 2ND INSTALLMENT IS ${inst2.status.toUpperCase()} NORMALLY TAXES ARE PAID IN INSTALLMENTS. NORMAL DUE DATES ARE 09/30 AND 03/31.`;

      inputData.tax_history = finalHistory;
      inputData.delinquent = delinquent;
      inputData.notes = notes.trim();

      const unpaid = finalHistory
        .filter((i) => i.amount_due && i.amount_due !== "$0.00")
        .reduce((sum, i) => sum + parseFloat(i.amount_due.replace(/[$,]/g, "")), 0);
      const balance = unpaid === 0 ? "$0.00" : `$${unpaid.toFixed(2)}`;

      resolve({ data: inputData, balance });
    } catch (err) {
      reject({ error: true, message: err.message });
    }
  });
};


const ac_unpaid = async (page, inputData, config) => {
  return ac_paid(page, inputData, config);
};


const account_search = async (page, account, config) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account, config)
        .then((paid_status) => {
          ac_2(page, paid_status, account, config)
            .then((data2) => {
              if ((data2.paid_status || "").trim() === "$0.00") {
                ac_paid(page, data2.data, config).then(resolve).catch(reject);
              } else {
                ac_unpaid(page, data2.data, config).then(resolve).catch(reject);
              }
            })
            .catch(reject);
        })
        .catch(reject);
    } catch (error) {
      reject(new Error(error.message));
    }
  });
};


const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (fetch_type !== "html" && fetch_type !== "api") {
      return res.status(200).render("error_data", { error: true, message: "Invalid Access" });
    }
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    
    const config = countyConfig.poweshiek;
    
    if (fetch_type === "html") {
      account_search(page, account, config)
        .then((result) => res.status(200).render("parcel_data_official", { ...result.data}))
        .catch((error) => res.status(200).render("error_data", { error: true, message: error.message }))
        .finally(() => context.close());
    } else if (fetch_type === "api") {
      account_search(page, account, config)
        .then((result) => res.status(200).json({ result }))
        .catch((error) => res.status(500).json({ error: true, message: error.message }))
        .finally(() => context.close());
    }
  } catch (error) {
    if (fetch_type === "html") res.status(200).render("error_data", { error: true, message: error.message });
    else if (fetch_type === "api") res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = { search };