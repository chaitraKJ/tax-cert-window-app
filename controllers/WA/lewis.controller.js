// Author:Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const logError = (scope, err) => {
  console.error(`[${scope}]`, err?.message || err);
};

const softWait = async (page, selector, timeout = 15000) => {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
};

// --- TAX NOTES LOGIC ---
const applyTaxNotes = (data) => {
  const suffix = ", NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY, NORMAL DUE DATES ARE 4/30 10/31";
  const list = Array.isArray(data.tax_history) ? data.tax_history : [];

  if (!list.length) {
    data.notes = "NO TAX HISTORY FOUND" + suffix;
    data.delinquent = "UNKNOWN";
    return data;
  }

  list.sort((a, b) => +a.year - +b.year);
  const latest = list.at(-1);
  const priors = list.filter((x) => x.year < latest.year);
  const anyDelq = list.some((x) => x.status === "Delinquent");
  const priorsDelq = priors.some((x) => ["Delinquent", "Due"].includes(x.status));

  const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

  switch (latest.status) {
    case "Paid":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
      break;
    case "Due":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DUE${suffix}`;
      break;
    case "Delinquent":
      data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
      break;
    default:
      data.notes = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY${suffix}`;
  }

  if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
  else data.delinquent = "NONE";

  return data;
};

// --- AC-1: Search Parcel ---
async function ac_1(page, parcel) {
  try {
    const url = "https://parcels.lewiscountywa.gov/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Enter parcel number in search input and submit
    await page.type("#q", String(parcel), { delay: 30 });
    await page.keyboard.press("Enter");

    const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 });
    await navigationPromise;

    // Check if no results
    const noResult = await page.$(".no-results, .alert-danger");
    if (noResult) throw new Error("Parcel not found");
  } catch (err) {
    logError("AC_1", err);
    throw new Error(`AC_1 failed: ${err.message}`);
  }
}

// --- AC-2: Scrape Property Data ---
async function ac_2(page) {
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  const determineStatus = ({ amount_due_num, amount_paid_num }) => {
    const due = Number(amount_due_num) || 0;
    const paid = Number(amount_paid_num) || 0;
    if (due === 0 && paid > 0) return "Paid";
    if (due > 0 && paid === 0) return "Delinquent";
    if (due > 0 && paid > 0 && paid < due) return "Partial";
    return "N/A";
  };

  const applyOverdueStatusToData = (data) => {
    if (!data || !Array.isArray(data.tax_history)) return data;
    const today = new Date();
    for (const row of data.tax_history) {
      const dueVal = Number(row.amount_due_num) || 0;
      if (!row.due_date) {
        row.status = determineStatus(row);
        continue;
      }
      const d = new Date(row.due_date);
      row.status = (!isNaN(d.getTime()) && today > d && dueVal > 0)
        ? "Delinquent"
        : determineStatus(row);
    }
    return data;
  };

  const formatPaidDate = (dateText, year) => {
    if (!dateText) return "";
    try {
      const d = new Date(`${dateText} ${year}`);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${mm}/${dd}/${d.getFullYear()}`;
      }
    } catch {}
    return "";
  };

  const monthFromDateText = (dateText, fallbackYear) => {
    if (!dateText) return null;
    try {
      const d = new Date(`${dateText} ${fallbackYear}`);
      if (!isNaN(d.getTime())) return d.getMonth() + 1;
    } catch {}
    const m = (dateText.match(
      /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December/i
    ) || [])[0];
    const map = {
      Jan:1, January:1, Feb:2, February:2, Mar:3, March:3, Apr:4, April:4,
      May:5, Jun:6, June:6, Jul:7, July:7, Aug:8, August:8, Sep:9, September:9,
      Oct:10, October:10, Nov:11, November:11, Dec:12, December:12
    };
    return map[m] || null;
  };

  try {
    const data = {
      owner_name: [],
      property_address: "",
      parcel_number: "N/A",
      total_assessed_value: "N/A",
      total_taxable_value: "N/A",
      taxing_authority: "Lewis County Treasurer's Office, Chehalis, WA",
      contact_info: "Lewis County Treasurer's Office, 700 S. 2nd Street, Room 205, P.O. Box 518, Mount Vernon, WA 98273",
      notes: "",
      delinquent: "",
      tax_history: []
    };

    // General Info
    const generalButton = await page.$('button[data-target="#general"]');
    if (generalButton && await page.evaluate(el => el.getAttribute("aria-expanded") !== "true", generalButton)) {
      await generalButton.click();
      await sleep(300);
    }

    const generalReady = await softWait(page, "#general dl", 15000);
    if (generalReady) {
      const generalData = await page.evaluate(() => {
        const norm = s => s?.replace(/\s+/g, " ").trim() || "";
        const dl = document.querySelector("#general dl");
        const parcel = norm(dl.querySelector("dt:nth-of-type(1) + dd")?.innerText);
        const address = norm(dl.querySelector("dt:nth-of-type(2) + dd")?.innerText);
        const ownerSpan = document.querySelector("#general dd.text-capitalize span");
        return {
          parcel_number: parcel,
          property_address: address,
          owner_name: ownerSpan ? [norm(ownerSpan.innerText)] : []
        };
      });
      Object.assign(data, generalData);
    }

    // Property Values
    const propertyButton = await page.$('button[data-target="#property-values"]');
    if (propertyButton && await page.evaluate(el => el.getAttribute("aria-expanded") !== "true", propertyButton)) {
      await propertyButton.click();
      await sleep(300);
    }

    const propertyValues = await page.evaluate(() => {
      const norm = s => s?.replace(/\s+/g, " ").trim() || "N/A";
      const table = document.querySelector("#property-values table");
      if (!table) return {};
      const lastRow = table.querySelector("tbody tr.success, tbody tr:last-child");
      if (!lastRow) return {};
      return {
        total_assessed_value: `${norm(lastRow.children[1]?.innerText)}`,
        total_taxable_value: `${norm(lastRow.children[1]?.innerText)}`
      };
    });
    Object.assign(data, propertyValues);

    // Payment History
    const paymentButton = await page.$('button[data-target="#payment-history"]');
    if (paymentButton && await page.evaluate(el => el.getAttribute("aria-expanded") !== "true", paymentButton)) {
      await paymentButton.click();
      await sleep(300);
    }

    let paymentHistory = [];
    if (paymentButton) {
      paymentHistory = await page.evaluate(() => {
        const norm = s => s?.replace(/\s+/g, " ").trim() || "";
        const tbodies = Array.from(document.querySelectorAll("#payment-history table tbody"));
        const hist = [];

        tbodies.forEach(tbody => {
          let year = null;
          const header = tbody.querySelector("tr th[colspan]");
          if (header) {
            const m = norm(header.innerText).match(/\d{4}/);
            if (m) year = Number(m[0]);
          }
          if (!year) return;
          let currentDate = "";
          Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
            const dateCell = norm(tr.querySelector("td:nth-child(1)")?.innerText);
            const desc = norm(tr.querySelector("td:nth-child(3)")?.innerText);
            const amtRaw = norm(tr.querySelector("td:nth-child(4)")?.innerText || "").replace(/[^0-9.]/g, "");
            const amt = amtRaw ? Number(amtRaw) : null;
            if (dateCell) currentDate = dateCell;
            if (desc && amt !== null) hist.push({ year, date: currentDate, description: desc, amount: amt });
          });
        });

        return hist;
      });
    }

    // Current Charges
    const chargeButton = await page.$('button[data-target="#charge-history"]');
    if (chargeButton && await page.evaluate(el => el.getAttribute("aria-expanded") !== "true", chargeButton)) {
      await chargeButton.click();
      await sleep(300);
    }

    const currentExists = await softWait(page, "#current-charges tbody", 1500);
    let currentCharges = [];
    if (currentExists) {
      currentCharges = await page.evaluate(() => {
        const tb = document.querySelector("#current-charges tbody");
        if (!tb) return [];
        const totalRow = tb.querySelector("tr.total td:last-child");
        const total = totalRow ? Number(totalRow.innerText.replace(/[^0-9.]/g, "")) : 0;
        return [{
          year: Number(tb.querySelector("tr:first-child td:first-child")?.innerText.match(/\d{4}/)[0]),
          totalAmount: total
        }];
      });
    }

    // Build Tax History
    data.tax_history = buildTaxHistory(paymentHistory, currentCharges, fmt, formatPaidDate, monthFromDateText, determineStatus);

    // Apply notes
    applyTaxNotes(data);

    return applyOverdueStatusToData(data);

  } catch (err) {
    logError("AC_2", err);
    throw new Error(`AC_2 failed: ${err.message}`);
  }
}

// --- Build Tax History Helper ---
function buildTaxHistory(paymentHistory, currentCharges, fmt, formatPaidDate, monthFromDateText, determineStatus) {
  const data = [];
  if (paymentHistory.length > 0) {
    const year = Math.max(...paymentHistory.map(p => p.year));
    const payments = paymentHistory.filter(p => p.year === year);

    const firstHalfPayments = payments.filter(p => monthFromDateText(p.date, year) < 7);
    const secondHalfPayments = payments.filter(p => monthFromDateText(p.date, year) >= 7);

    const firstHalfTotal = firstHalfPayments.reduce((s, r) => s + r.amount, 0);
    const secondHalfTotal = secondHalfPayments.reduce((s, r) => s + r.amount, 0);
    const totalPaid = firstHalfTotal + secondHalfTotal;
    const chargeTotal = currentCharges[0]?.totalAmount || totalPaid;

    // Annual Payment
    if (firstHalfPayments.length > 0 && secondHalfPayments.length === 0 && totalPaid === chargeTotal) {
      data.push({
        year,
        jurisdiction: "County",
        base_amount: fmt(totalPaid),
        amount_due_num: 0,
        amount_paid_num: totalPaid,
        amount_due: "$0.00",
        amount_paid: fmt(totalPaid),
        paid_date: formatPaidDate(firstHalfPayments[0]?.date, year),
        payment_type: "Annual",
        mailing_date: "N/A",
        due_date: `04/30/${year}`,
        delq_date: `05/01/${year}`,
        status: "Paid"
      });
      return data;
    }

    // Semi-Annual Logic
    // First Half
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(firstHalfTotal),
      amount_due_num: 0,
      amount_paid_num: firstHalfTotal,
      amount_due: fmt(0),
      amount_paid: fmt(firstHalfTotal),
      paid_date: formatPaidDate(firstHalfPayments[0]?.date, year),
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `04/30/${year}`,
      delq_date: `05/01/${year}`,
      status: firstHalfTotal > 0 ? "Paid" : "Delinquent"
    });

    // Second Half
    const due = secondHalfTotal > 0 ? 0 : chargeTotal;
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(secondHalfTotal > 0 ? secondHalfTotal : due),
      amount_due_num: due,
      amount_paid_num: secondHalfTotal,
      amount_due: fmt(due),
      amount_paid: fmt(secondHalfTotal),
      paid_date: secondHalfPayments[0] ? formatPaidDate(secondHalfPayments[0].date, year) : "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `10/31/${year}`,
      delq_date: `11/01/${year}`,
      status: determineStatus({ amount_due_num: due, amount_paid_num: secondHalfTotal })
    });

  } else if (currentCharges.length > 0) {
    const year = currentCharges[0].year;
    const total = currentCharges[0].totalAmount;
    const half = total / 2;

    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(half),
      amount_due_num: half,
      amount_paid_num: 0,
      amount_due: fmt(half),
      amount_paid: "$0.00",
      paid_date: "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `04/30/${year}`,
      delq_date: `05/01/${year}`,
      status: "Delinquent"
    });
    data.push({
      year,
      jurisdiction: "County",
      base_amount: fmt(half),
      amount_due_num: half,
      amount_paid_num: 0,
      amount_due: fmt(half),
      amount_paid: "$0.00",
      paid_date: "",
      payment_type: "Semi-Annual",
      mailing_date: "N/A",
      due_date: `10/31/${year}`,
      delq_date: `11/01/${year}`,
      status: "Delinquent"
    });
  }

  return data;
}

// --- Combined Search ---
async function accountSearch(page, parcel) {
  await ac_1(page, parcel);
  return await ac_2(page);
}

// --- Express Handler ---
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  let browser;

  try {
    if (!account) return res.status(400).json({ error: "parcel must be provided" });
    if (!["html", "api"].includes(fetch_type)) return res.status(400).json({ error: "Invalid fetch_type" });

    browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    const data = await accountSearch(page, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }

    await context.close();
  } catch (error) {
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };
