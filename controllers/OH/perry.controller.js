// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const TIMEOUT = 90000;

// ---------------------------
// TAX NOTES FUNCTION
// ---------------------------
const applyTaxNotes = (data) => {
  const suffix = `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/15 07/15`;
  const list = Array.isArray(data.tax_history) ? data.tax_history : [];

  if (!list.length) {
    data.notes = "NO TAX HISTORY FOUND" + suffix;
    data.delinquent = "UNKNOWN";
    return data;
  }

  // Sort by year ascending
  list.sort((a, b) => parseInt(a.year.split("-")[0]) - parseInt(b.year.split("-")[0]));
  const latest = list.at(-1);

  const priors = list.filter((x) => x.year !== latest.year);
  const priorsDelq = priors.some((x) => ["Due", "Delinquent"].includes(x.status));
  const anyDelq = list.some((x) => x.status === "Delinquent");
  const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

  let latestTxt = "";
  if (latest.status === "Paid") latestTxt = `${latest.year} TAXES ARE PAID`;
  else if (latest.status === "Due") latestTxt = `${latest.year} TAXES ARE DUE`;
  else if (latest.status === "Delinquent") latestTxt = `${latest.year} TAXES ARE DELINQUENT`;
  else latestTxt = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY`;

  data.notes = `${priorsTxt}, ${latestTxt}${suffix}`;

  if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
  else data.delinquent = "NONE";

  return data;
};

// --------------------------------
// PERRY STEP 1 — PROPERTY PAGE
// --------------------------------
const perry_1 = async (page, account) => {
  const url = `https://beacon.schneidercorp.com/Application.aspx?AppID=1119&LayerID=28106&PageTypeID=4&PageID=11541&Q=459384665&KeyValue=${account}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

  const propertyData = await page.evaluate(() => {
    const textOr = (el, fallback = "") => el ? el.textContent.trim().replace(/\s+/g, " ") : fallback;

    const result = {
      processed_date: "",
      owner_name: [],
      property_address: "",
      parcel_number: "",
      total_assessed_value: "$0.00",
      total_taxable_value: "$0.00",
      taxing_authority: "Perry County Treasurer's Office 215 W. Main Street, Room 104 New Lexington, OH 43764 Phone: (740) 342-1084",
      treasurer_link: ""
    };

    // Owners
    const ownerAnchors = document.querySelectorAll(".sdw1-owners-container a");
    if (ownerAnchors.length) result.owner_name.push(textOr(ownerAnchors[0]));
    else {
      const ownerEls = document.querySelectorAll("#ctlBodyPane_ctl01_ctl01_rptOwner a");
      if (ownerEls.length) result.owner_name.push(textOr(ownerEls[0]));
    }

    // Property address
    const ownerAddr = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_lblOwnerAddress") ||
                      document.querySelector(".sdw1-owners-container span[id$='lblOwnerAddress']");
    if (ownerAddr) result.property_address = textOr(ownerAddr);

    // Parcel number
    const parcelSpan = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue span") ||
                       document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue");
    if (parcelSpan) result.parcel_number = textOr(parcelSpan);

    // Valuation table
    const valTable = document.querySelector("#ctlBodyPane_ctl12_ctl01_grdValuation_grdYearData");
    if (valTable) {
      const rows = Array.from(valTable.querySelectorAll("tbody tr"));
      const totalAssessedRow = rows.find(r => r.querySelector("th")?.textContent.includes("Total Value (Assessed 35%)"));
      if (totalAssessedRow) {
        const tds = totalAssessedRow.querySelectorAll("td.value-column");
        if (tds.length) {
          result.total_assessed_value = textOr(tds[0]);
          result.total_taxable_value = textOr(tds[0]);
        }
      }
    }

    // Treasurer link
    const treasurerLinkEl = document.querySelector("#ctlBodyPane_ctl13_ctl01_rptLinks_ctl00_hlkWebLink") ||
                            document.querySelector("#ctlBodyPane_ctl13_ctl01_rptLinks a.btn-primary");
    if (treasurerLinkEl) result.treasurer_link = treasurerLinkEl.href || treasurerLinkEl.getAttribute("href");

    return result;
  });

  return propertyData;
};

// -----------------------------------------
// PERRY STEP 2 — TREASURER / TAX HISTORY
// -----------------------------------------
const perry_2 = async (page, treasurerUrl, yearLimit = 1) => {
  if (!treasurerUrl) return [];

  if (treasurerUrl.startsWith("/")) treasurerUrl = new URL(treasurerUrl, "https://beacon.schneidercorp.com").href;

  await page.goto(treasurerUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  let taxHistory = await page.evaluate(() => {
    const moneyNum = n => parseFloat(String(n || "0").replace(/[^0-9.-]/g, "")) || 0;
    const moneyFmt = n => moneyNum(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const yearLinks = Array.from(document.querySelectorAll("#ctlBodyPane_ctl03_ctl01_gvwTaxHistory tbody tr a"));
    const results = [];

    yearLinks.forEach(link => {
      const match = link.innerText.match(/(\d{4})/);
      if (!match) return;

      const startYear = match[1];
      const endYear = String(Number(startYear) + 1);
      const taxYear = `${startYear}-${endYear}`;

      const yearDiv = document.querySelector(`#div${startYear}`);
      if (!yearDiv) return;

      const table = yearDiv.querySelector("table.tabular-data");
      if (!table) return;

      const rows = Array.from(table.querySelectorAll("tr"));
      const getVals = label => {
        const r = rows.find(rr => rr.querySelector("th")?.innerText.includes(label));
        if (!r) return ["0", "0"];
        const spans = r.querySelectorAll("td span");
        return [spans[0]?.innerText || "0", spans[1]?.innerText || "0"];
      };

      const netGen = getVals("Net General");
      const collected = getVals("Collected");
      const due = getVals("Due");
      const balance = getVals("Balance");
      const overApplied = getVals("Overpayment Applied");

      const halfData = [0, 1].map(i => {
        const net = moneyNum(netGen[i]);
        const coll = moneyNum(collected[i]);
        const bal = moneyNum(balance[i]);
        const over = moneyNum(overApplied[i]);
        const effectivePaid = coll + over;
        const isPaid = bal <= 0 || effectivePaid >= net;
        return { net, coll, bal, isPaid };
      });

      const buildItem = i => {
        const h = halfData[i];
        let status = h.isPaid ? "Paid" : "Due";
        const delqDate = new Date(i === 0 ? `02/16/${endYear}` : `07/16/${endYear}`);
        if (!h.isPaid && new Date() > delqDate) status = "Delinquent";

        return {
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Semi-Annual",
          status,
          base_amount: `$${moneyFmt(netGen[i])}`,
          amount_paid: `$${moneyFmt(collected[i])}`,
          amount_due: h.isPaid ? "$0.00" : `$${moneyFmt(due[i])}`,
          due_date: i === 0 ? `02/15/${endYear}` : `07/15/${endYear}`,
          delq_date: i === 0 ? `02/16/${endYear}` : `07/16/${endYear}`,
          paid_date: "",
          good_through_date: "",
          mailing_date: "N/A"
        };
      };

      results.push(buildItem(0));
      results.push(buildItem(1));
    });

    return results;
  });

  // Sort & filter last `yearLimit` years
  taxHistory.sort((a, b) => parseInt(b.year.split("-")[0]) - parseInt(a.year.split("-")[0]));
  const allowedYears = [...new Set(taxHistory.map(t => t.year))].slice(0, yearLimit);
  taxHistory = taxHistory.filter(t => allowedYears.includes(t.year));

  // Payment dates
  const payments = await page.$$eval("#ctlBodyPane_ctl07_ctl01_grdPayments tbody tr", rows =>
    rows.map(r => ({
      year: r.querySelector("th")?.innerText.match(/(\d{4})/)?.[1] || "",
      date: r.querySelector("td")?.innerText.trim() || ""
    }))
  );

  const payMap = {};
  payments.forEach(p => { if (!payMap[p.year]) payMap[p.year] = []; payMap[p.year].push(p.date); });
  Object.values(payMap).forEach(arr => arr.sort((a, b) => new Date(a) - new Date(b)));

  taxHistory.forEach((item, idx) => {
    const startYear = item.year.split("-")[0];
    const dates = payMap[startYear] || [];
    item.paid_date = dates.length === 1 ? dates[0] : dates.length >= 2 ? (idx % 2 === 0 ? dates[0] : dates[1]) : "";
  });

  return taxHistory;
};

// ---------------------------
// PERRY ORCHESTRATOR
// ---------------------------
const account_search = async (page, account, yearLimit = 1) => {
  const propertyData = await perry_1(page, account);
  const taxHistory = await perry_2(page, propertyData.treasurer_link, yearLimit);

  const today = new Date();
  taxHistory.forEach(t => {
    if (t.status === "Paid") return;
    if (t.delq_date && new Date(t.delq_date) <= today) t.status = "Delinquent";
    else if (t.due_date && new Date(t.due_date) <= today) t.status = "Due";
  });

  return applyTaxNotes({ ...propertyData, tax_history: taxHistory });
};

// ---------------------------
// SEARCH CONTROLLER
// ---------------------------
const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;

  try {
    if (!["html", "api"].includes(fetch_type)) {
      return res.status(400).json({ error: true, message: "Invalid Access" });
    }

    const yearLimit = getOHCompanyYears(client);
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const data = await account_search(page, account, yearLimit);

    if (fetch_type === "api") res.status(200).json({ result: data });
    else res.status(200).render("parcel_data_official", data);

    await context.close();
  } catch (error) {
    console.error(error);
    if (fetch_type === "api") res.status(500).json({ error: true, message: error.message });
    else res.status(200).render("error_data", { error: true, message: error.message });
  }
};

export { search };