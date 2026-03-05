// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const logError = (scope, err) => {
  console.error(`[${scope}]`, err?.message || err);
};

//  MAIN FUNCTION
const softWait = async (page, selector, timeout = 15000) => {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
};
//  NOTE LOGIC
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY, NORMAL DUE DATES ARE 4/30 10/31`;

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

//
// ─── AC-1: Search / Open Parcel ────────────────────────────────────────────
//

async function ac_1(page, parcel) {
  try {
    const url = "https://www.skagitcounty.net/Search/Property/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Select "Parcel #" radio button
    await page.click("#propid");

    // Enter parcel number
    await page.type("#tbAuto", String(parcel), { delay: 30 });

    // Submit search (press Enter)
    await page.keyboard.press("Enter");
  } catch (err) {
    logError("AC_1", err);
    throw new Error(`AC_1 failed: ${err.message}`);
  }
}
//
// ─── AC-2: Scrape Property Data ───────────────────────────────────────────
//

async function ac_2(page) {
  try {
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    // --- Wait for Owner Information header ---
    const ownerHeaderReady = await softWait(page, "b", 15000);
    if (!ownerHeaderReady) {
      console.warn("Owner Information header not found, returning default data");
      return {
        owner_name: [],
        property_address: "",
        parcel_number: "N/A",
        total_assessed_value: "N/A",
        total_taxable_value: "N/A",
        taxing_authority: "",
        notes: "",
        delinquent: "",
        tax_history: []
      };
    }

    // --- SCRAPE OWNER INFORMATION AND PROPERTY ADDRESS ---
    const ownerData = await page.evaluate(() => {
      const normalize = str => str?.replace(/\s+/g, " ").trim() || "";
      let owner_name = [];
      let property_address = "";

      const ownerHeader = Array.from(document.querySelectorAll("b"))
        .find(b => /owner information/i.test(normalize(b.innerText)));

      if (ownerHeader) {
        const ownerTable = ownerHeader.closest("table");
        if (ownerTable) {
          const rows = Array.from(ownerTable.querySelectorAll("tr")).slice(1);
          owner_name = [normalize(rows[0]?.innerText)];
          property_address = rows.slice(1, 3).map(r => normalize(r.innerText)).join(", ");
        }
      }
      return { owner_name, property_address };
    });

    // --- SCRAPE PARCEL NUMBER ---
    const parcel_number = await page.evaluate(() => {
      const normalize = str => str?.replace(/\s+/g, " ").trim() || "N/A";
      const tables = Array.from(document.querySelectorAll("table"));
      for (const tbl of tables) {
        const headerRow = tbl.querySelector("tr");
        if (!headerRow) continue;
        const firstB = headerRow.querySelector("b");
        if (firstB && normalize(firstB.innerText).includes("Parcel Number")) {
          const rows = Array.from(tbl.querySelectorAll("tr"));
          if (rows.length >= 2) {
            const b = rows[1].querySelector("b");
            if (b) return normalize(b.innerText);
          }
        }
      }
      return "N/A";
    });

    // --- SCRAPE ASSESSED VALUE ---
    const assessed_value = await page.evaluate(() => {
      const normalize = s => s?.replace(/\s+/g, " ").trim() || "N/A";
      const tables = Array.from(document.querySelectorAll("table"));
      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll("tr"));
        for (const row of rows) {
          const tds = row.querySelectorAll("td");
          if (tds.length < 2) continue;
          const label = normalize(tds[0].innerText).toLowerCase();
          if (/market value|assessed value|total assessed/i.test(label)) {
            for (const td of tds) {
              const text = normalize(td.innerText);
              if (/^\$\d/.test(text)) return text;
            }
          }
        }
      }
      return "N/A";
    });

    // --- INITIALIZE DATA OBJECT ---
    const data = {
      owner_name: ownerData.owner_name,
      property_address: ownerData.property_address,
      parcel_number,
      total_assessed_value: assessed_value,
      total_taxable_value: assessed_value,
      taxing_authority: `Skagit County Treasurer's Office 700 S. 2nd Street, Room 205 Mount Vernon, WA 98273 P.O. Box 518 Mount Vernon, WA 98273`,
      notes: "",
      delinquent: "",
      tax_history: []
    };

    // ===== CLICK TAXES TAB (if exists) =====
    const taxesTabReady = await softWait(page, "#propmenu a[href='Taxes']", 15000);
    if (taxesTabReady) {
      const taxesTab = await page.$("#propmenu a[href='Taxes']");
      await taxesTab.click();
      await sleep(500);
    }

    // ===== SCRAPE SEMI-ANNUAL TAXES =====
    const taxHistory = await page.evaluate(() => {
      const normalize = s => s?.replace(/\s+/g, " ").trim() || "";
      const history = [];
      const rows = Array.from(document.querySelectorAll("tr")).filter(tr => /installment/i.test(tr.innerText));

      rows.forEach(tr => {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 4) return;

        const label = normalize(tds[2].innerText);
        const payment = normalize(tds[3].innerText);
        const yearMatch = label.match(/(20\d{2})/);
        if (!yearMatch) return;
        const year = yearMatch[1];

        let payment_type = "Annual";
        if (/first/i.test(label)) payment_type = "1st Half";
        if (/second/i.test(label)) payment_type = "2nd Half";
        if (payment_type === "1st Half" || payment_type === "2nd Half") payment_type = "Semi-Annual";

        const amount = (payment.match(/([\$0-9\.,]+)/) || ["$0.00"])[0];
        let due_date = "N/A", delq_date = "N/A";
        if (payment_type === "Semi-Annual") {
          if (/first/i.test(label)) { due_date = `04/30/${year}`; delq_date = `05/01/${year}`; }
          else { due_date = `10/31/${year}`; delq_date = `11/01/${year}`; }
        }

        let status = "Due";
        const today = new Date();
        const delqParts = delq_date.split("/");
        const delq = new Date(delqParts[2], delqParts[0] - 1, delqParts[1]);
        if (/paid/i.test(payment)) status = "Paid";
        else if (today > delq) status = "Delinquent";

        // --- Proper amount_due / amount_paid logic ---
        let amount_paid = "$0.00";
        let amount_due = "$0.00";
        if (status === "Paid") {
          amount_paid = amount;
          amount_due = "$0.00";
        } else {
          amount_paid = "$0.00";
          amount_due = amount;
        }

        history.push({
          year,
          jurisdiction: "County",
          base_amount: amount,
          amount_due,
          amount_paid,
          paid_date: "",
          receipt_no: "",
          payment_type,
          mailing_date: "N/A",
          due_date,
          delq_date,
          status
        });
      });
      return history;
    });

    // ===== SCRAPE DELINQUENT TAX TABLE (prior years) =====
    const delinquentTaxes = await page.evaluate(() => {
      const normalize = s => s?.replace(/\s+/g, " ").trim() || "";
      const tbl = document.querySelector("#tblDelinquent");
      if (!tbl) return [];

      const rows = Array.from(tbl.querySelectorAll("tr")).slice(2, -1);
      const delqList = [];
      for (const tr of rows) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 5) continue;

        const year = normalize(tds[0].innerText);
        const base_amount = normalize(tds[1].innerText);
        const total = normalize(tds[4].innerText);
        if (!/^\d{4}$/.test(year)) continue;

        delqList.push({
          year,
          jurisdiction: "County",
          base_amount,
          amount_due: total,
          amount_paid: "$0.00",
          paid_date: "",
          receipt_no: "",
          payment_type: "Annual",
          mailing_date: "N/A",
          due_date: `04/30/${year}`,
          delq_date: `05/01/${year}`,
          status: "Delinquent"
        });
      }
      return delqList;
    });

    // ===== MERGE BOTH TAX SOURCES =====
    const combinedTaxHistory = [...taxHistory];
    delinquentTaxes.forEach(d => {
      const exists = combinedTaxHistory.some(h => h.year === d.year);
      if (!exists) combinedTaxHistory.push(d);
    });

    data.tax_history = combinedTaxHistory;
    data.delinquent = combinedTaxHistory.some(h => h.status !== "Paid") ? "YES" : "NONE";

    // --- APPLY TAX NOTES ---
    return applyTaxNotes(data);

  } catch (err) {
    console.error("AC_2 ERROR:", err);
    throw new Error(`AC_2 failed: ${err.message}`);
  }
}

//
// ─── COMBINED SEARCH ───────────────────────────────────────────────────────
//

async function accountSearch(page, parcel) {
  await ac_1(page, parcel);
  return await ac_2(page);
}

//
// ─── EXPRESS HANDLER ───────────────────────────────────────────────────────
//

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
