// author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const timeout_option = { timeout: 90000 };

function getTaxStatus(record) {
  const today = new Date();
  const dueDate = new Date(record.due_date);
  const delqDate = new Date(record.delq_date);
  const amountDue = parseFloat((record.amount_due || "0").replace(/[$,]/g, ""));

  if (amountDue === 0) return "Paid";
  if (isNaN(dueDate.getTime()) || isNaN(delqDate.getTime())) return "Due";
  return today <= delqDate ? "Due" : "Delinquent";
}

function updateTaxNotes(data) {
  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes = "ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/15";
    data.delinquent = "NONE";
    return data;
  }

  const sortedHistory = [...data.tax_history].sort((a, b) => parseInt(b.year) - parseInt(a.year));
  const latest = sortedHistory[0];
  const priorUnpaid = sortedHistory.slice(1).some(r => r.status === "Delinquent");

  switch (latest.status) {
    case "Paid":
      data.notes = priorUnpaid
        ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`
        : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`;
      data.delinquent = priorUnpaid ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
      break;
    case "Due":
      data.notes = priorUnpaid
        ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`
        : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`;
      data.delinquent = "YES";
      break;
    case "Delinquent":
      data.notes = priorUnpaid
        ? `PRIORS ARE DELINQUENT, ${latest.year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`
        : `ALL PRIORS ARE PAID, ${latest.year} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15`;
      data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
      break;
    default:
      data.notes = `${latest.year} TAX STATUS UNKNOWN, PLEASE VERIFY MANUALLY.`;
      data.delinquent = "UNKNOWN";
  }

  return data;
}

// --- Step 1: Search by Account Number ---
const ac_1 = async (page, url, accountNumber) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#searchDropdown", { visible: true, timeout: 20000 });
    await page.click("#searchDropdown");
    await page.click("#AccountNumber");

    await page.waitForSelector("#searchTextBox", { visible: true });
    await page.type("#searchTextBox", accountNumber.toString());
    await page.keyboard.press("Enter");

    await page.waitForSelector("tbody tr td a[href*='/PropertyAccountInformation/Account/']", { visible: true, timeout: 30000 });
    return await page.$eval("tbody tr td a[href*='/PropertyAccountInformation/Account/']", el => el.href);
  } catch (err) {
    console.error(`ac_1 failed: ${err.message}`);
    throw err;
  }
};

// --- Step 2: Fetch Account Details ---
const ac_2 = async (page, accountOrUrl) => {
  try {
    let selector = accountOrUrl.startsWith("http")
      ? `a[href$="${accountOrUrl.split("/").pop()}"]`
      : `a[href="/PropertyAccountInformation/Account/${accountOrUrl}"]`;

    await page.waitForSelector(selector, { timeout: 15000 });
    await page.click(selector);
    await page.waitForSelector("#AccountDetailsDiv", { timeout: 15000 });

    const data = await page.evaluate(() => {
      const getText = (id) => document.querySelector(id)?.innerText.trim() || "";
      const ownerName = getText("#MainContentPlaceHolder_AccountInformationView_TaxPayerNameLabel");
      const propertyAddress = getText("#MainContentPlaceHolder_AccountInformationView_SitusLine1Label");
      const parcelNumber = getText("#MainContentPlaceHolder_AccountInformationView_AccountNumberLabel");

      let latestYearValue = "";
      const table = document.querySelector("#ctl00_MainContentPlaceHolder_valuesGrid_ctl00_DataZone_DT");
      if (table) {
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const dataRow = rows.find(r => r.querySelectorAll("td").length > 1);
        if (dataRow) {
          const cells = Array.from(dataRow.querySelectorAll("td"));
          latestYearValue = cells.map(c => c.innerText.trim()).filter(Boolean).pop() || "";
        }
      }

      return {
        owner_name: [ownerName],
        property_address: propertyAddress,
        parcel_number: parcelNumber,
        total_assessed_value: latestYearValue,
        total_taxable_value: latestYearValue,
        taxing_authority: "Lane County Tax Collector, Oregon",
        tax_history: [],
        notes: "",
        delinquent: "N/A"
      };
    });

    // Open current balance if available
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("a")].find(a => a.innerText.includes("Get the Current Balance Due"));
      if (btn) btn.click();
    });

    // --- Tax grid check ---
    let taxGridFound = false;
    try {
      await page.waitForSelector("#ctl00_MainContentPlaceHolder_TaxesDueGrid_ctl00 tbody tr.rgRow", { timeout: 12000 });
      taxGridFound = true;
    } catch {
      const rowCount = await page.$$eval(
        "#ctl00_MainContentPlaceHolder_TaxesDueGrid_ctl00 tbody tr.rgRow",
        rows => rows.length
      ).catch(() => 0);
      if (rowCount > 0) taxGridFound = true;
    }

    // --- Payment history fallback ---
    if (!taxGridFound) {
      const hasPaymentHistory = await page.$("#ctl00_MainContentPlaceHolder_RadGrid1_ctl00");
      if (hasPaymentHistory) {
        const paymentAnalysis = await page.evaluate(() => {
          const cleanMoney = v => parseFloat((v || "").replace(/[^0-9.]/g, "")) || 0;
          const rows = Array.from(document.querySelectorAll("#ctl00_MainContentPlaceHolder_RadGrid1_ctl00 tbody tr"));
          if (!rows.length) return null;

          const payments = rows.map(r => {
            const dateStr = r.querySelector("td:nth-child(1)")?.innerText.trim();
            const amount = cleanMoney(r.querySelector("td:nth-child(2)")?.innerText);
            const tax = cleanMoney(r.querySelector("td:nth-child(3)")?.innerText);
            const discount = cleanMoney(r.querySelector("td:nth-child(4)")?.innerText);
            return { date: new Date(dateStr), dateStr, amount, tax, discount };
          }).filter(p => !isNaN(p.date.getTime()));

          if (!payments.length) return null;
          payments.forEach(p => p.taxYear = p.date.getMonth() >= 9 ? p.date.getFullYear() : p.date.getFullYear() - 1);

          const latestPayment = payments.sort((a, b) => b.date - a.date)[0];
          const year = latestPayment.taxYear;

          const list = payments.filter(p => p.taxYear === year);
          const today = new Date();
          const due1 = new Date(`11/15/${year}`);
          const due2 = new Date(`02/15/${year + 1}`);
          const due3 = new Date(`05/15/${year + 1}`);
          const delinquentDate = new Date(`05/16/${year + 1}`);

          let paymentType = "Trimester", status = "Paid", delinquent = "NONE";
          if (list.length === 1 && Math.abs(list[0].tax - list[0].amount) < 0.5 && latestPayment.date <= delinquentDate) {
            paymentType = "Annual";
            status = "Paid";
          } else if (list.length < 3 && today > due3) {
            status = "Delinquent";
            delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
          } else if (list.length < 3) {
            status = "Due";
            delinquent = "YES";
          }

          return { year: year.toString(), paymentType, status, delinquent, latestPayment };
        });

        if (paymentAnalysis) {
          const { year, paymentType, status, delinquent, latestPayment } = paymentAnalysis;
          const taxRecord = {
            jurisdiction: "County",
            year,
            base_amount: `$${latestPayment?.amount?.toFixed(3) || "0.00"}`,
            amount_due: "0.00",
            mailing_date: "N/A",
            due_date: `11/15/${year}`,
            delq_date: `05/16/${parseInt(year) + 1}`,
            paid_date: latestPayment?.dateStr || "",
            good_through_date: "",
            amount_paid: `$${latestPayment?.amount?.toFixed(2) || "0.00"}`,
            payment_type: paymentType,
            status
          };
          data.tax_history = [taxRecord];
          return updateTaxNotes(data);
        }
      }

      data.notes = `ALL PRIORS ARE PAID, TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY`;
      data.delinquent = "NONE";
      return data;
    }

    // --- Extract totals from tax grid ---
    const totals = await page.evaluate(() => {
      const cleanMoney = str => str?.replace(/[^0-9.\-]/g, "") || "0";
      const footerCells = Array.from(document.querySelectorAll(
        "#ctl00_MainContentPlaceHolder_TaxesDueGrid_ctl00 tfoot tr.rgFooter td"
      ));
      let assessed_total = "0", balance_due_total = "0";
      if (footerCells.length >= 6) {
        assessed_total = cleanMoney(footerCells[3]?.innerText || "0");
        balance_due_total = cleanMoney(footerCells[5]?.innerText || "0");
      }
      const year = document.querySelector(
        "#ctl00_MainContentPlaceHolder_TaxesDueGrid_ctl00 tbody tr.rgRow td:nth-child(2)"
      )?.innerText.trim() || new Date().getFullYear().toString();
      return { assessed_total, balance_due_total, year };
    });

    const year = totals.year || new Date().getFullYear().toString();
    const taxRecord = {
      jurisdiction: "County",
      year,
      base_amount: `$${totals.assessed_total}`,
      amount_due: `$${totals.balance_due_total}`,
      mailing_date: "N/A",
      due_date: `11/15/${year}`,
      delq_date: `05/16/${parseInt(year) + 1}`,
      paid_date: "",
      good_through_date: "",
      amount_paid: "$0.00",
      payment_type: "Annual",
      status: getTaxStatus({ amount_due: totals.balance_due_total, due_date: `11/15/${year}`, delq_date: `05/16/${parseInt(year) + 1}` })
    };

    data.tax_history = [taxRecord];
    return updateTaxNotes(data);
  } catch (err) {
    console.error(`ac_2 failed for ${accountOrUrl}: ${err.message}`);
    throw err;
  }
};

// --- Lane County Account Search ---
const lane_account_search = async (page, url, account) => {
  const startTime = Date.now();
  try {
    const data1 = await ac_1(page, url, account);
    let data2;

    try {
      data2 = await ac_2(page, data1);
    } catch (err) {
      console.warn(`Retrying ac_2 due to error: ${err.message}`);
      data2 = await ac_2(page, data1);
    }

    console.log(`Lane County scraping completed in ${(Date.now() - startTime) / 1000}s`);
    return data2;
  } catch (err) {
    console.error(`Lane County scraping failed for account ${account}: ${err.message}`);
    throw err;
  }
};

// --- Express Route ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  let browser;

  if (!account) return res.status(400).json({ error: "account must be provided" });
  if (!["html", "api"].includes(fetch_type)) return res.status(400).json({ error: "Invalid fetch_type, must be 'html' or 'api'" });

  try {
    browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");
    await page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", req => ["image", "font"].includes(req.resourceType()) ? req.abort() : req.continue());

    const data = await lane_account_search(page, "https://apps.lanecounty.org/propertyaccountinformation/", account);

    if (fetch_type === "html") res.status(200).render("parcel_data_official", data);
    else res.status(200).json({ result: data });

    await context.close();
  } catch (error) {
    console.error(`Search route failed: ${error.message}`);
    if (fetch_type === "html") res.status(200).render("error_data", { error: true, message: error.message });
    else res.status(500).json({ error: true, message: error.message });
  }
};

export { search };