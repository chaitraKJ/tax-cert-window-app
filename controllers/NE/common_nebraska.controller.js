//Author:Dhansuh
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// Utility for checking if string is a real date (MM/DD/YYYY or M/D/YYYY)
const isDate = (str) => {
  const trimmed = str.trim();
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed);
};

// Utility to normalize date to MM/DD/YYYY
const normalizeDate = (str) => {
  const trimmed = str.trim();
  if (!isDate(trimmed)) return "";
  const [month, day, year] = trimmed.split("/");
  return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
};

// Utility to safely format numbers to locale string
const formatCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return "$0.00";
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `-$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${formatted}`;
};

// --- Nebraska county config ---
const countyUrls = {
  boone: "Boone",
  nemaha: "Nemaha",
  cass: "Cass"
};
const countyAuthorities = {
  boone: "Boone County Treasurer, Boone County Courthouse, 222 S 4th St, Albion, NE 68620, Ph: 402-395-2512",
  nemaha: "Nemaha County Treasurer, Nemaha County Courthouse, 1824 N St #201, Auburn, NE 68305, Ph: 402-274-3319",
  cass: "Cass County Treasurer, Cynthia A. Fenton, 346 Main Street, Room 203/204, Plattsmouth, NE 68048, Ph: (402) 296-9511"
};

// --- Step 1: Search page ---
const ac_1 = async (page, county, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const accountStr = String(account || "");
      if (!accountStr) return reject(new Error("account number is required"));

      const url = `https://nebraskataxesonline.us/search.aspx?county=${countyUrls[county]}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Fill and submit search
      await page.type("#txtParcel", accountStr);
      await page.click("#btnSubmit2");

      // Wait for either results table or no records message
      await page.waitForSelector("#dtaResults, #dtaMobile, div.noluck", { timeout: 35000 });

      // Check for "No Records" message
      const noRecords = await page.evaluate(() => {
        return !!document.querySelector("div.noluck");
      });
      if (noRecords) return reject(new Error("account number is invalid"));

      // Scrape owner/address
      const { ownerNames, propertyAddress, parcelLink } = await page.evaluate(() => {
        const table = document.querySelector("#dtaResults") || document.querySelector("#dtaMobile");
        const ownerNames = [];
        let propertyAddress = "";
        let parcelLink = null;

        if (table) {
          const rows = table.querySelectorAll("tr:not(.dataheader)");
          if (rows.length > 0) {
            const cells = rows[0].querySelectorAll("td");
            if (cells.length >= 3) {
              const ownerNode = cells[1]?.childNodes[0];
              const owner = ownerNode?.textContent?.trim() || "";
              if (owner) {
                ownerNames.push(...owner.split(",").map((n) => n.trim()));
              }
              propertyAddress = cells[2]?.innerText?.trim().replace(/\s+/g, " ") || "";
              const linkEl = cells[0].querySelector("a");
              if (linkEl) parcelLink = linkEl.href;
            }
          }
        }
        return { ownerNames, propertyAddress, parcelLink };
      });

      if (!parcelLink) return reject(new Error("account number is invalid"));

      // Go to parcel detail page
      await page.goto(parcelLink, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("#dtaResults, table.datagrid", { timeout: 40000 });

      const { taxHistoryEntries, latestValue } = await page.evaluate(() => {
        const table = document.querySelector("#dtaResults") || document.querySelector("table.datagrid");
        const entries = [];
        let latestValue = "";

        if (table) {
          const rows = Array.from(table.querySelectorAll("tr:not(.dataheader)"));
          rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 7) {
              const year = cells[0].innerText.trim();
              const statement = cells[1].innerText.trim();
              const value = cells[2].innerText.trim();
              const netTax = cells[5].innerText.trim();
              const balanceDue = cells[6].innerText.trim();
              const linkEl = cells[1].querySelector("a");
              const href = linkEl ? linkEl.href : "";
              entries.push({ year, statement, value, netTax, balanceDue, href });
            }
          });
          if (entries.length > 0) {
            latestValue = entries[0].value; // most recent
          }
        }
        return { taxHistoryEntries: entries, latestValue };
      });

      if (taxHistoryEntries.length === 0)
        return reject(new Error("No tax data found on parcel page"));

      // Compute balance
      let totalBalance = 0;
      taxHistoryEntries.forEach((e) => {
        const balance = parseFloat(e.balanceDue.replace(/[$,]/g, "")) || 0;
        totalBalance += balance;
      });

      resolve({
        balanceStr: formatCurrency(totalBalance),
        ownerNames,
        propertyAddress,
        parcelLink,
        taxHistoryEntries,
        latestValue,
      });
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// --- Step 2: Basic parcel data ---
const ac_2 = async (page, ac1Data, account, county) => {
  return new Promise((resolve, reject) => {
    try {
      const { balanceStr, ownerNames, propertyAddress, latestValue, taxHistoryEntries } = ac1Data;
      const today = new Date();
      const processed_date = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      const datum = {
        processed_date,
        order_number: "",
        borrower_name: "",
        owner_name: ownerNames.length > 0 ? ownerNames : [],
        property_address: propertyAddress,
        parcel_number: String(account),
        land_value: "",
        improvements: "",
        total_assessed_value: latestValue || "",
        exemption: "",
        total_taxable_value: latestValue || "",
        taxing_authority: countyAuthorities[county.toLowerCase()],
        notes: "",
        delinquent: "",
        tax_history: [],
      };
      resolve({ data: datum, balance: balanceStr });
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// Utility for checking if a date is past due
const isDatePastDue = (dateStr, currentDate) => {
  if (!isDate(dateStr)) return false;
  const [month, day, year] = dateStr.split("/").map(Number);
  const dueDate = new Date(year, month - 1, day);
  return dueDate < currentDate;
};

// --- Build Tax History ---
const buildTaxHistory = async (page, taxHistoryEntries) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      // Sort: year desc, statement asc
      const sortedEntries = [...taxHistoryEntries].sort((a, b) => {
        const yearDiff = parseInt(b.year) - parseInt(a.year);
        if (yearDiff !== 0) return yearDiff;
        return a.statement.localeCompare(b.statement);
      });

      const entries = [];
      for (const entry of sortedEntries) {
        const yearNum = parseInt(entry.year);
        await page.goto(entry.href, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector("#dtaPayment, #dtaPaymentMobile", { timeout: 30000 });

        const payments = await page.evaluate(() => {
          const arr = [];
          const table = document.querySelector("#dtaPayment") || document.querySelector("#dtaPaymentMobile");
          if (table) {
            const rows = table.querySelectorAll("tr:not(.dataheader)");
            rows.forEach(row => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 3) {
                const label = cells[0].innerText.trim();
                const amount = cells[1].innerText.trim().replace(/\s+/g, " ");
                const receipt = cells[2].innerText.trim();
                if (/First Payment/i.test(label) || /First Half/i.test(label)) {
                  arr.push({
                    installment: 1,
                    paid: receipt.includes("Receipt Date"),
                    paid_date: receipt.replace("Receipt Date", "").trim() || "",
                    amount
                  });
                } else if (/Second Payment/i.test(label) || /Second Half/i.test(label)) {
                  arr.push({
                    installment: 2,
                    paid: receipt.includes("Receipt Date"),
                    paid_date: receipt.replace("Receipt Date", "").trim() || "",
                    amount
                  });
                }
              }
            });
          }
          return arr;
        });

        const netTax = parseFloat(entry.netTax.replace(/[$,]/g, "")) || 0;
        const balance = parseFloat(entry.balanceDue.replace(/[$,]/g, "")) || 0;
        let base = netTax / 2;

        let paidDate1 = "";
        let paidAmount1 = 0;
        let amountDue1 = base;
        let status1 = "Due"; // Default to Due if not past due
        let delqDate1 = `05/02/${yearNum + 1}`;
        let dueDate1 = `05/01/${yearNum + 1}`;
        const p1 = payments.find((p) => p.installment === 1);
        if (p1 && p1.paid && isDate(p1.paid_date)) {
          paidDate1 = normalizeDate(p1.paid_date);
          status1 = "Paid";
          paidAmount1 = parseFloat(p1.amount.replace(/[$,]/g, "")) || base;
          amountDue1 = 0;
        } else if (balance <= 0) {
          status1 = "Paid";
          paidAmount1 = base;
          amountDue1 = 0;
        } else {
          const isPastDue1 = isDatePastDue(dueDate1, currentDate);
          const isPastDelq1 = isDatePastDue(delqDate1, currentDate);
          status1 = isPastDelq1 ? "Delinquent" : (isPastDue1 ? "Due" : "Due");
        }

        let paidDate2 = "";
        let paidAmount2 = 0;
        let amountDue2 = base;
        let status2 = "Due"; // Default to Due if not past due
        let delqDate2 = `09/02/${yearNum + 1}`;
        let dueDate2 = `09/01/${yearNum + 1}`;
        const p2 = payments.find((p) => p.installment === 2);
        if (p2 && p2.paid && isDate(p2.paid_date)) {
          paidDate2 = normalizeDate(p2.paid_date);
          status2 = "Paid";
          paidAmount2 = parseFloat(p2.amount.replace(/[$,]/g, "")) || base;
          amountDue2 = 0;
        } else if (balance <= 0) {
          status2 = "Paid";
          paidAmount2 = base;
          amountDue2 = 0;
        } else {
          const isPastDue2 = isDatePastDue(dueDate2, currentDate);
          const isPastDelq2 = isDatePastDue(delqDate2, currentDate);
          status2 = isPastDelq2 ? "Delinquent" : (isPastDue2 ? "Due" : "Due");
        }

        const isAnnual = status1 === "Paid" && status2 === "Paid" && paidDate1 && paidDate2 && paidDate1 === paidDate2;

        if (isAnnual) {
          const totalBase = base * 2;
          const totalPaid = paidAmount1 + paidAmount2;
          const totalDue = amountDue1 + amountDue2;
          const isPastDueAnnual = isDatePastDue(dueDate2, currentDate); // Use second due for annual
          const isPastDelqAnnual = isDatePastDue(delqDate2, currentDate);
          const annualStatus = (status1 === "Paid" && status2 === "Paid") ? "Paid" : (isPastDelqAnnual ? "Delinquent" : (isPastDueAnnual ? "Due" : "Due"));
          const annual = {
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Annual",
            status: annualStatus,
            base_amount: formatCurrency(totalBase),
            amount_paid: formatCurrency(totalPaid),
            amount_due: formatCurrency(totalDue),
            mailing_date: "N/A",
            due_date: `09/01/${yearNum + 1}`,
            delq_date: `09/02/${yearNum + 1}`,
            paid_date: paidDate1,
            good_through_date: "",
            delinquent: isPastDelqAnnual && annualStatus !== "Paid" ? "YES" : "NONE"
          };
          entries.push(annual);
        } else {
          const semi1 = {
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Installment #1",
            status: status1,
            base_amount: formatCurrency(base),
            amount_paid: formatCurrency(paidAmount1),
            amount_due: formatCurrency(amountDue1),
            mailing_date: "N/A",
            due_date: dueDate1,
            delq_date: delqDate1,
            paid_date: paidDate1,
            good_through_date: "",
            delinquent: status1 === "Delinquent" ? "YES" : "NONE"
          };
          entries.push(semi1);

          const semi2 = {
            jurisdiction: "County",
            year: yearNum,
            payment_type: "Installment #2",
            status: status2,
            base_amount: formatCurrency(base),
            amount_paid: formatCurrency(paidAmount2),
            amount_due: formatCurrency(amountDue2),
            mailing_date: "N/A",
            due_date: dueDate2,
            delq_date: delqDate2,
            paid_date: paidDate2,
            good_through_date: "",
            delinquent: status2 === "Delinquent" ? "YES" : "NONE"
          };
          entries.push(semi2);
        }
      }

      resolve(entries);
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// --- Process PaidTaxes ---
const ac_paid = async (page, data, taxHistoryEntries) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Sort entries by year descending
      taxHistoryEntries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      const latestYear = taxHistoryEntries[0].year;
      const latestEntries = taxHistoryEntries.filter(e => e.year === latestYear);
      const taxHistoryProcessed = await buildTaxHistory(page, latestEntries);
      if (taxHistoryProcessed.length === 0) return reject(new Error("No tax data"));

      const latestYearNum = parseInt(latestYear);
      data.tax_history = taxHistoryProcessed;
      const isAnnual = taxHistoryProcessed.some(entry => entry.year === latestYearNum && entry.payment_type === "Annual");
      const paymentTypeNote = isAnnual ? "ANNUALLY" : "SEMI-ANNUALLY";
      if (paymentTypeNote === "ANNUALLY") {
        data.notes = `ALL PRIORS ARE PAID, ${latestYearNum} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, BUT HERE PAID ANNUALLY, NORMAL DUE DATES ARE 05/01 & 09/01`;
      } else {
        data.notes = `ALL PRIORS ARE PAID, ${latestYearNum} TAXES ARE PAID, 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 05/01 & 09/01`;
      }
      data.delinquent = "NONE";

      resolve(data);
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// --- Process Unpaid Taxes ---
const ac_unpaid = async (page, data, taxHistoryEntries) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentDate = new Date();
      let currentTaxYear = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      if (month < 5) currentTaxYear -= 1; // Adjust for Nebraska tax year (starts May 1)

      // Sort tax history entries by year descending
      taxHistoryEntries.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      const unpaidEntries = taxHistoryEntries.filter(entry => parseFloat(entry.balanceDue.replace(/[$,]/g, "")) > 0);
      const unpaidYears = [...new Set(unpaidEntries.map(e => e.year))];
      const allRelevantEntries = taxHistoryEntries.filter(e => unpaidYears.includes(e.year));
      const taxHistoryProcessed = await buildTaxHistory(page, allRelevantEntries);
      if (taxHistoryProcessed.length === 0) return reject(new Error("No tax data"));

      // Sort tax history by year ascending, then payment_type
      data.tax_history = taxHistoryProcessed.sort((a, b) => {
        const yearDiff = a.year - b.year;
        if (yearDiff !== 0) return yearDiff;
        return a.payment_type.localeCompare(b.payment_type);
      });

      const years = Array.from(new Set(taxHistoryProcessed.map(e => parseInt(e.year)))).sort((a, b) => a - b);

      // Determine delinquent status
      const hasDelinquent = taxHistoryProcessed.some((entry) => entry.delinquent === "YES");
      data.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      // Build notes
      let notes = "";
      if (unpaidYears.length === 0) {
        // No unpaid taxes
        const latestYear = Math.max(...taxHistoryProcessed.map(h => h.year));
        const isAnnual = taxHistoryProcessed.some(entry => entry.year === latestYear && entry.payment_type === "Annual");
        const paymentTypeNote = isAnnual ? "ANNUALLY" : "SEMI-ANNUALLY";
        notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentTypeNote}, NORMAL DUE DATES ARE 05/01 & 09/01`;
      } else {
        // Check if prior years have unpaid taxes
        const priorYearsUnpaid = taxHistoryEntries.some(
          entry => parseInt(entry.year) < currentTaxYear-1 && parseFloat(entry.balanceDue.replace(/[$,]/g, "")) > 0
        );
        let priorNote = priorYearsUnpaid ? "ALL PRIORS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ";
        const yearNotes = [];

        for (const year of years) {
          const yearPayments = taxHistoryProcessed.filter(p => p.year === year);
          const isAnnual = yearPayments.some(entry => entry.payment_type === "Annual");

          if (isAnnual) {
            const annualEntry = yearPayments.find(entry => entry.payment_type === "Annual");
            yearNotes.push(`${year} ANNUAL TAXES ARE ${annualEntry.status.toUpperCase()}`);
          } else {
            const first = yearPayments.find(p => p.payment_type === "Installment #1") || { status: "Due" };
            const second = yearPayments.find(p => p.payment_type === "Installment #2") || { status: "Due" };
            let yearNote = `${year} `;
            if (first.status === "Paid" && second.status === "Paid") {
              yearNote += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
            } else if (first.status === "Paid" && second.status !== "Paid") {
              yearNote += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
            } else if (first.status !== "Paid" && second.status === "Paid") {
              yearNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS PAID`;
            } else {
              yearNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
            }
            yearNotes.push(yearNote);
          }
        }

        // Include current year if not already included
        if (!years.includes(currentTaxYear)) {
          const currentYearPayments = taxHistoryProcessed.filter(p => p.year === currentTaxYear);
          if (currentYearPayments.length > 0) {
            const isCurrentAnnual = currentYearPayments.some(entry => entry.payment_type === "Annual");
            if (isCurrentAnnual) {
              const annualEntry = currentYearPayments.find(entry => entry.payment_type === "Annual");
              yearNotes.push(`${currentTaxYear} ANNUAL TAXES ARE ${annualEntry.status.toUpperCase()}`);
            } else {
              const first = currentYearPayments.find(p => p.payment_type === "Installment #1") || { status: "Due" };
              const second = currentYearPayments.find(p => p.payment_type === "Installment #2") || { status: "Due" };
              let currentNote = `${currentTaxYear} `;
              if (first.status === "Paid" && second.status === "Paid") {
                currentNote += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
              } else if (first.status === "Paid" && second.status !== "Paid") {
                currentNote += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
              } else if (first.status !== "Paid" && second.status === "Paid") {
                currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS PAID`;
              } else {
                currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
              }
              yearNotes.push(currentNote);
            }
          }
        }

        // Combine notes
        const paymentTypeNote = taxHistoryProcessed.some(entry => entry.payment_type === "Annual") ? "ANNUALLY" : "SEMI-ANNUALLY";
        notes = `${priorNote}${yearNotes.join(", ")}, NORMALLY TAXES ARE PAID ${paymentTypeNote}, NORMAL DUE DATES ARE 05/01 & 09/01`;
      }

      data.notes = notes;
      resolve(data);
    } catch (err) {
      reject(new Error(err.message));
    }
  });
};

// --- Orchestrator ---
const account_search = async (page, county, account) => {
  return new Promise((resolve, reject) => {
    ac_1(page, county, account)
      .then((ac1Data) => {
        ac_2(page, ac1Data, account, county)
          .then((ac2Data) => {
            const { data, balance } = ac2Data;
            const totalBalance = parseFloat(balance.replace(/[$,-]/g, "")) * (balance.startsWith("-") ? -1 : 1);
            if (totalBalance <= 0) {
              ac_paid(page, data, ac1Data.taxHistoryEntries).then(resolve).catch(reject);
            } else {
              ac_unpaid(page, data, ac1Data.taxHistoryEntries).then(resolve).catch(reject);
            }
          })
          .catch(reject);
      })
      .catch(reject);
  });
};

// --- Express Controller ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const county = req.path.replace(/^\/+/, ""); // extract /nemaha etc.

  if (!countyUrls[county]) {
    return res.status(400).json({ error: true, message: "Invalid county" });
  }

  try {
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (reqInt) => {
      if (["stylesheet", "font", "image"].includes(reqInt.resourceType())) {
        reqInt.abort();
      } else {
        reqInt.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, county, account)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) =>
          res.status(200).render("error_data", { error: true, message: error.message })
        )
        .finally(async () => await context.close());
    } else if (fetch_type === "api") {
      account_search(page, county, account)
        .then((data) => res.status(200).json({ error: false, result: data }))
        .catch((error) => res.status(500).json({ error: true, message: error.message }))
        .finally(async () => await context.close());
    } else {
      res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = { search };