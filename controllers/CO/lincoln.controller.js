//Author:poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };

/* =========================================================
    LOGGING HELPERS
========================================================= */
const log = (...args) => console.log("[LINCOLN]", ...args);


/* =========================================================
   STEP 1 – Login → Search → Return Detail URL
========================================================= */
const lincoln_1 = async (page, account) => {
  log("[L1] begin");

  const loginUrl = "http://64.37.30.174/assessor/web/login.jsp";

  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  await Promise.all([
    page.click("input[type='submit'][name='submit'][value='Login']"),
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
  ]);

  await page.waitForSelector("#AccountNumID, #ParcelNumberID", { timeout: 20000 });

  if (account.startsWith("R")) {
    await page.type("#AccountNumID", account);
  } else {
    await page.type("#ParcelNumberID", account);
  }

  await Promise.all([
    page.click("input[type='submit']"),
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
  ]);

  if (page.url().includes("account.jsp")) {
    const url = new URL(page.url());
    return {
      detailUrl: page.url(),
      accountNum: url.searchParams.get("accountNum"),
    };
  }


  const detailUrl = await page.evaluate(() => {
    const link = document.querySelector("a[href*='account.jsp']");
    return link?.href ?? null;
  });

  if (!detailUrl) throw new Error("Could not navigate to account detail");

  const url = new URL(detailUrl);

  return {
    detailUrl,
    accountNum: url.searchParams.get("accountNum"),
  };

};
/* =========================================================
   STATUS HELPERS
========================================================= */

const determineStatusByDate = (dueDateStr, delqDateStr, amountDue) => {
  if (amountDue === "$0.00") return "Paid";

  const today = new Date();

  const toDate = (str) => {
    if (!str) return null;
    const [mm, dd, yyyy] = str.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  };

  const dueDate = toDate(dueDateStr);
  const delqDate = toDate(delqDateStr);

  if (!dueDate || !delqDate) return "Unknown";

  if (today < dueDate) return "Due";
  if (today >= dueDate && today < delqDate) return "Due";
  return "Delinquent";
};


const updateLincolnStatuses = (data) => {
  if (!data.tax_history) return data;

  data.tax_history = data.tax_history.map(entry => ({
    ...entry,
    status: determineStatusByDate(
      entry.due_date,
      entry.delq_date,
      entry.amount_due
    ),
  }));

  return data;
};


function updateLincolnTaxNotes(data) {
  if (!data.tax_history || data.tax_history.length === 0) {
    data.notes =
      "ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE LAST DAY OF FEB & 06/15";
    data.delinquent = "NONE";
    return data;
  }

  data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

  const latest = data.tax_history[data.tax_history.length - 1];
  const latestYear = latest.year;
  const latestStatus = latest.status;

  const priorDelq = data.tax_history.slice(0, -1)
    .some(r => r.status === "Delinquent");

  const NOTE =
    ", NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE 02/28 & 06/15";

  if (latestStatus === "Paid") {
    data.notes = priorDelq
      ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE PAID${NOTE}`
      : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID${NOTE}`;
    data.delinquent = priorDelq
      ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
      : "NONE";
    return data;
  }

  if (latestStatus === "Due") {
    data.notes = priorDelq
      ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE DUE${NOTE}`
      : `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DUE${NOTE}`;
    data.delinquent = "NONE";
    return data;
  }

  if (latestStatus === "Delinquent") {
    data.notes = priorDelq
      ? `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ALSO DELINQUENT${NOTE}`
      : `PRIOR YEAR TAXES ARE PAID, ${latestYear} TAXES ARE DELINQUENT${NOTE}`;
    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    return data;
  }

  data.notes = `${latestYear} TAX STATUS UNKNOWN${NOTE}`;
  data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  return data;
}

/* =========================================================
   STEP 2 – scrape parcel detail
========================================================= */
const lincoln_2 = async (page, url, accountNum) => {
  await page.goto(url, { waitUntil: "networkidle2" });

  const data = await page.evaluate(() => {
    const rows = document.querySelectorAll("table.accountSummary tr");
    let parcel = "";
    let situs = "";
    let legal = "";
    let owner = "";
    let total_assessed = "";
    let total_taxable = "";

    const locationTd = rows[1]?.querySelector("td:nth-child(1) table");
    if (locationTd) {
      locationTd.querySelectorAll("tr").forEach(tr => {
        const strong = tr.querySelector("strong");
        if (!strong) return;

        const label = strong.innerText.trim();
        const value = tr.innerText.replace(label, "").trim();

        if (label === "Parcel Number") parcel = value;
        if (label === "Situs Address") situs = value;
        if (label === "Legal Summary") legal = value;
      });
    }

    const ownerNode = rows[1]?.querySelector("td:nth-child(2) table td b");
    if (ownerNode && ownerNode.innerText.includes("Owner Name")) {
      let text = "";
      let next = ownerNode.nextSibling;
      while (next) {
        if (next.nodeType === Node.TEXT_NODE) text += next.textContent.trim();
        next = next.nextSibling;
      }
      owner = text;
    }

    const assessTd = rows[1]?.querySelector("td:nth-child(3) table");
    if (assessTd) {
      assessTd.querySelectorAll("tr").forEach(tr => {
        const label = tr.querySelector("td:first-child")?.innerText.trim() ?? "";
        const value = tr.querySelector("td:last-child")?.innerText.trim() ?? "";
        if (label.includes("Actual")) total_assessed = value;
        if (label.includes("Primary Taxable")) total_taxable = value;
      });
    }

    return { parcel, situs, legal, owner, total_assessed, total_taxable };
  });

  if (!data) throw new Error("No summary data found");

  const taxHistoryUrl = `http://64.37.30.174/assessor/taxweb/account.jsp?accountNum=${accountNum}&doc=TaxDocument`;
  await page.goto(taxHistoryUrl, { waitUntil: "networkidle2" });


  const taxHistory = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll("th"));
    const taxHeader = headers.find(h => h.innerText.trim() === "Tax Year");
    if (!taxHeader) return [];

    const table = taxHeader.closest("table");
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll("tr")).slice(1);

    function getLastDayOfFebruary(year) {
      return (new Date(year, 1, 29).getMonth() === 1) ? 29 : 28;
    }

    const parsed = rows.map(tr => {
      const tds = tr.querySelectorAll("td");
      if (!tds.length) return null;

      let rawYear = tds[0].innerText.trim();
      const amountStr = tds[1].innerText.trim();

      const isEstimated = rawYear.startsWith("*");
      const year = rawYear.replace("*", "").trim();

      const total = parseFloat(amountStr.replace(/[^0-9.]/g, "")) || 0;
      const half = (total / 2).toFixed(2);

      return {
        year,
        isEstimated,
        total,
        half
      };
    }).filter(Boolean);
    // Always ignore estimated rows (*)
    const filtered = parsed.filter(p => !p.isEstimated);

    // Safety fallback (if site only shows estimated)
    const payable = filtered.length ? filtered : parsed.filter(p => p.isEstimated);


    const history = [];
    const today = new Date();

    payable.forEach(p => {

      const payYear = +p.year + 1;
      const febEnd = getLastDayOfFebruary(payYear);

      // Correct date strings: MM/DD/YYYY
      const inst1Due = `02/${String(febEnd).padStart(2, "0")}/${payYear}`;
      const inst1Delq = `03/01/${payYear}`;
      const inst2Due = `06/15/${payYear}`;
      const inst2Delq = `06/16/${payYear}`;

      function determineStatus(due, delq) {
        const today = new Date();
        const dueDate = new Date(due);
        const delqDate = new Date(delq);

        if (today < delqDate) return "Due";
        return "Delinquent";
      }


      const inst1Status = determineStatus(inst1Due, inst1Delq);
      const inst2Status = determineStatus(inst2Due, inst2Delq);

      history.push({
        jurisdiction: "County",
        year: p.year,
        payment_type: "1st Installment",
        status: inst1Status,
        base_amount: `$${p.half}`,
        amount_paid: "$0.00",
        amount_due: `$${p.half}`,
        mailing_date: "N/A",
        due_date: inst1Due,
        delq_date: inst1Delq,
        paid_date: "-",
        good_through_date: ""
      });


      history.push({
        jurisdiction: "County",
        year: p.year,
        payment_type: "2nd Installment",
        status: inst2Status,
        base_amount: `$${p.half}`,
        amount_paid: "$0.00",
        amount_due: `$${p.half}`,
        mailing_date: "N/A",
        due_date: inst2Due,
        delq_date: inst2Delq,
        paid_date: "-",
        good_through_date: ""
      });

    });

    return history;
  });


  // Build response
  let result = {
    parcel_number: data.parcel,
    property_address: data.situs,
    legal_description: data.legal,
    owner_name: data.owner ? [data.owner] : [],
    total_assessed_value: data.total_assessed,
    total_taxable_value: data.total_assessed,
    taxing_authority:
      "Lincoln County Treasurer's Office 103 3rd Avenue P.O. Box 7 Hugo, CO 80821",
    notes: "",
    tax_history: taxHistory,
    delinquent: "N/A",
  };

  result = updateLincolnStatuses(result);
  result = updateLincolnTaxNotes(result);

  return result;
};


/* =========================================================
   login + search + scrape
========================================================= */
const account_search = async (page, account) => {
  if (!account) throw new Error("Account number is required");

  const { detailUrl, accountNum } = await lincoln_1(page, account);

  if (!accountNum)
    throw new Error("Failed to resolve account number from parcel search");

  return await lincoln_2(page, detailUrl, accountNum);
};



/* =========================================================
   EXPRESS HANDLER
========================================================= */
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!["html", "api"].includes(fetch_type)) {
    return res.status(400).json({ error: true, message: "Invalid Access" });
  }

  let browser, context;

  try {
    browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(90000);

    //  Prevent wasted resource downloads
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "font" || t === "image") req.abort();
      else req.continue();
    });

    const result = await account_search(page, account);

    if (fetch_type === "html") {
      return res.status(200).render("parcel_data_official", result);
    }
    return res.status(200).json({ result });

  } catch (err) {
    log("ERROR:", err);

    if (fetch_type === "html")
      return res.status(500).render("error_data", { error: true, message: err.message });

    return res.status(500).json({ error: true, message: err.message });

  } finally {
    if (context) await context.close();
  }
};

export { search };