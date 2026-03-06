// AUTHOR: MANJUNADH 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 };
const waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const counties = {
  holmes: {
    url: "https://www.holmescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Holmes County Tax Collector, 224 North Waukesha St, Bonifay, FL 32425, Ph: (850) 547-1115",
    city: "BONIFAY",
    zip: "32425"
  },
  jefferson: {
    url: "https://www.jeffersoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Jefferson County Tax Collector, 1484 S Jefferson St, Monticello, FL 32344, Ph: (850) 342-0147",
    city: "MONTICELLO",
    zip: "32344"
  },
  washington: {
    url: "https://www.washingtoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Washington County Tax Collector, 1331 South Blvd, Chipley, FL 32428, Ph: (850) 638-6275",
    city: "CHIPLEY",
    zip: "32428"
  },
  baker: {
    url: "https://www.bakertaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Baker County Tax Collector, 32 N 5th St, Macclenny, FL 32063, Ph: (904) 259-3613",
    city: "MACCLENNY",
    zip: "32063"
  },
  bradford: {
    url: "https://www.bradfordtaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Bradford County Tax Collector, 945 N Temple Ave, Starke, FL 32091, Ph: (904) 966-6240",
    city: "STARKE",
    zip: "32091"
  },
  gulf: {
    url: "https://www.gulfcountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Gulf County Tax Collector, 1000 Cecil G. Costin Sr. Blvd, Port St. Joe, FL 32456, Ph: (850) 229-6116",
    city: "PORT ST. JOE",
    zip: "32456"
  },
  liberty: {
    url: "https://www.libertycountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Liberty County Tax Collector, 10818 NW SR 20, Bristol, FL 32321, Ph: (850) 643-2272",
    city: "BRISTOL",
    zip: "32321"
  },
  madison: {
    url: "https://www.madisoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Madison County Tax Collector, 229 SW Pinckney St, Madison, FL 32340, Ph: (850) 973-6136",
    city: "MADISON",
    zip: "32340"
  },
  glades: {
    url: "https://www.mygladescountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Glades County Tax Collector, 500 Ave J, Moore Haven, FL 33471, Ph: (863) 946-6035",
    city: "MOORE HAVEN",
    zip: "33471"
  },
  jackson: {
    url: "https://www.jacksoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Jackson County Tax Collector, 4445 Lafayette St, Marianna, FL 32446, Ph: (850) 482-9653",
    city: "MARIANNA",
    zip: "32446"
  },
  union: {
    url: "https://www.unioncountytc.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Union County Tax Collector, 55 W Main St, Lake Butler, FL 32054, Ph: (386) 496-3331",
    city: "LAKE BUTLER",
    zip: "32054"
  },
  calhoun: {
    url: "https://www.calhouncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Calhoun County Tax Collector, 20859 Central Ave E, Blountstown, FL 32424, Ph: (850) 674-5636",
    city: "BLOUNTSTOWN",
    zip: "32424"
  },
  hamilton: {
    url: "https://www.hamiltoncountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Hamilton County Tax Collector, 207 NE 1st St, Jasper, FL 32052, Ph: (386) 792-1284",
    city: "JASPER",
    zip: "32052"
  },
  franklin: {
    url: "https://www.franklincountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Franklin County Tax Collector, 33 Market St, Apalachicola, FL 32320, Ph: (850) 653-9323",
    city: "APALACHICOLA",
    zip: "32320"
  },
  wakulla: {
    url: "https://www.wakullacountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Wakulla County Tax Collector, 3115 Crawfordville Hwy, Crawfordville, FL 32327, Ph: (850) 926-3371",
    city: "CRAWFORDVILLE",
    zip: "32327"
  },
  okeechobee: {
    url: "https://okeechobeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Okeechobee County Tax Collector, 307 NW 5th St, Okeechobee, FL 34972, Ph: (863) 763-3421",
    city: "OKEECHOBEE",
    zip: "34972"
  },
  desoto: {
    url: "https://www.desotocountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Desoto County Tax Collector, 201 E Oak St, Arcadia, FL 34266, Ph: (863) 993-4861",
    city: "ARCADIA",
    zip: "34266"
  },
  hardee: {
    url: "https://www.hardeecountytaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True",
    taxing_authority: "Hardee County Tax Collector, 417 S 6th Ave, Wauchula, FL 33873, Ph: (863) 773-9144",
    city: "WAUCHULA",
    zip: "33873"
  }
};

const jc_1 = async (page, account, config) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await page.goto(config.url, { waitUntil: "domcontentloaded" });

        const disclaimerLink = await page.$('a[href*="Accept=true"]');
        if (disclaimerLink) {
          await Promise.all([
            disclaimerLink.click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" })
          ]);
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.waitForSelector("#propertynumber", { timeout: 10000 });
            await page.$eval("#propertynumber", el => el.value = "");
            await page.type("#propertynumber", String(account));
            const val = await page.$eval("#propertynumber", el => el.value);
            if (val === account) break;
          } catch (err) {
            if (attempt === 3) throw new Error(`Cannot enter parcel number: ${err.message}`);
            await waitForTimeout(2000);
          }
        }

        const searchBtn = await page.$("#search");
        if (searchBtn) {
          await Promise.all([
            searchBtn.click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" })
          ]);
        } else {
          await page.keyboard.press("Enter");
          await page.waitForNavigation({ waitUntil: "domcontentloaded" });
        }

        await page.waitForSelector("#filter-results-table", timeout_option);
        await waitForTimeout(5000);

        const rowCount = await page.evaluate(() => document.querySelectorAll("#filter-results-table tbody tr").length);
        if (rowCount <= 1) throw new Error("No results found");

        let alertHandled = false;
        page.once("dialog", async (dialog) => {
          if (/scroll down to display other delinquent taxes/i.test(dialog.message())) {
            await dialog.accept();
            alertHandled = true;
          } else {
            await dialog.dismiss();
          }
        });

        const selectedYear = await page.evaluate(() => {
          const link = document.querySelector("#filter-results-table tbody tr:last-child a");
          return link ? link.textContent.trim().match(/(\d{4})$/)?.[1] ?? "unknown" : "unknown";
        });

        await page.click("#filter-results-table tbody tr:last-child a");
        await Promise.race([page.waitForNavigation({ waitUntil: "domcontentloaded" }), waitForTimeout(10000)]);
        await waitForTimeout(30000);

        if ((await page.url()).includes("#DelinquentHistory") && !alertHandled) {
          await page.keyboard.press("Enter");
          await waitForTimeout(5000);
        }

        resolve(selectedYear);
      } catch (err) {
        reject(new Error(`jc_1 failed: ${err.message}`));
      }
    })();
  });
};

const jc_2 = async (page, account, config) => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        await page.waitForSelector("#ctl00_ContentPlaceHolder1_lblName", timeout_option);

        const page_data = await page.evaluate((acc, cfg) => {
          const txt = sel => document.querySelector(sel)?.textContent.trim().replace(/\s+/g, " ") || "";

          let owners = [txt("#ctl00_ContentPlaceHolder1_lblName")].filter(Boolean);

          const addrParts = [
            txt("#ctl00_ContentPlaceHolder1_lblAddressLine"),
            txt("#ctl00_ContentPlaceHolder1_lblAddressLine1"),
            txt("#ctl00_ContentPlaceHolder1_lblAddressLine2"),
            txt("#ctl00_ContentPlaceHolder1_lblAddressLine345")
          ].filter(Boolean);

          let propAddr = "";
          if (addrParts.length) {
            const parts = addrParts.join(", ").split(/,\s*/).map(p => p.trim()).filter(Boolean);
            const ownerLike = parts.filter(p =>
              /(\w+\s+\w+.*(TR|TRUST|LLC|CORP|&)|.*\s+&\s+.*)/i.test(p) &&
              !/^\d+\s+.*(RD|ST|AVE|LN|DR|BLVD|CIR|CT|PL|WAY)/i.test(p)
            );
            const addrOnly = parts.filter(p => !ownerLike.includes(p));

            if (ownerLike.length) {
              owners = [...new Set([...owners, ...ownerLike])];
              propAddr = addrOnly.join(", ");
            } else {
              propAddr = parts.join(", ");
            }

            propAddr = propAddr.replace(/\s+/g, " ").replace(/,\s*,/g, ",");
            if (!/FL\s+\d{5}/.test(propAddr)) {
              propAddr += `, ${cfg.city}, FL ${cfg.zip}`;
            }
          }

          const taxableRaw =
            txt("#ctl00_ContentPlaceHolder1_lblCoNetTaxValue") ||
            txt("#ctl00_ContentPlaceHolder1_lblTaxableValue");

          const taxable = taxableRaw.replace(/[^0-9.]/g, "") || "0";
          const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
            .format(Number(taxable)).replace("$", "$");

          return {
            processed_date: new Date().toISOString(),
            order_number: "",
            borrower_name: "",
            owner_name: owners,
            property_address: propAddr,
            parcel_number: acc,
            land_value: "",
            improvements: "",
            total_assessed_value: formatted,
            exemption: "",
            total_taxable_value: formatted,
            taxing_authority: cfg.taxing_authority,
            notes: "",
            delinquent: "",
            tax_history: []
          };
        }, account, config);

        resolve(page_data);
      } catch (err) {
        reject(new Error(`jc_2 failed: ${err.message}`));
      }
    })();
  });
};

const jc_paid = async (page, data, selectedYear, yearsRequested = 2) => {
  return new Promise((resolve) => {
    (async () => {
      try {
        // const currentDate = new Date("2025-09-15"); // testing only
        const currentDate = new Date(); // production

        let taxRows = await page.evaluate(async (selYear, curISO) => {
          const cur = new Date(curISO);
          const out = [];

          // ── Installment view ────────────────────────────────────────
          const plCert = document.querySelector("#ctl00_ContentPlaceHolder1_plCert");
          if (plCert) {
            const tbl = plCert.querySelector("table");
            if (tbl) {
              const rows = tbl.querySelectorAll("tr");
              for (let i = 1; i < rows.length; i++) {
                const tds = rows[i].querySelectorAll("td");
                if (tds.length < 7) continue;

                const inst = parseInt(tds[0].textContent.trim());
                if (isNaN(inst) || inst < 1 || inst > 4) continue;

                const base = Number(tds[2].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const paidTxt = tds[4].querySelector("span")?.textContent.trim() || tds[4].textContent.trim();
                const paid = Number(paidTxt.replace(/[^0-9.]/g, "") || 0);
                const due = Number(tds[5].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const paidDt = tds[6].textContent.trim().split(" ")[0] || "-";

                let dueDt = "";
                const y = Number(selYear);
                switch (inst) {
                  case 1: dueDt = `06/30/${y}`; break;
                  case 2: dueDt = `09/30/${y}`; break;
                  case 3: dueDt = `12/31/${y}`; break;
                  case 4: dueDt = `03/31/${y + 1}`; break;
                }

                const [m, d, yy] = dueDt.split("/");
                const dueObj = new Date(`${yy}-${m}-${d}`);
                let delqDt = "";
                if (!isNaN(dueObj)) {
                  const del = new Date(dueObj);
                  del.setDate(del.getDate() + 1);
                  delqDt = `${String(del.getMonth() + 1).padStart(2, "0")}/${String(del.getDate()).padStart(2, "0")}/${del.getFullYear()}`;
                }

                let status = due <= 0 ? "Paid" : (cur < new Date(delqDt) ? "Due" : "Delinquent");

                const suf = ["th", "st", "nd", "rd"][inst] || "th";
                out.push({
                  jurisdiction: "County",
                  year: selYear,
                  payment_type: `${inst}${suf} installment`,
                  installment: String(inst),
                  status,
                  base_amount: `$${base.toFixed(2)}`,
                  amount_paid: status === "Paid" ? `$${paid.toFixed(2)}` : "$0.00",
                  amount_due: status !== "Paid" ? `$${due.toFixed(2)}` : "$0.00",
                  mailing_date: "N/A",
                  due_date: dueDt,
                  delq_date: delqDt,
                  paid_date: status === "Paid" ? (paidDt === "N/A" ? "-" : paidDt) : "-",
                  good_through_date: ""
                });
              }
            }
          }

          // Fallback 1 ── Annual / summary table ───────────────────────
          if (!out.length) {
            const table = [...document.querySelectorAll("table")].find(t =>
              [...t.querySelectorAll("td")].some(td => /Tax Roll Property Summary|Tax/i.test(td.textContent))
            );
            if (table) {
              const rows = table.querySelectorAll("tr");
              for (let i = 4; i < rows.length; i++) {
                const tds = rows[i].querySelectorAll("td");
                if (tds.length < 8) continue;
                const yrStr = tds[2].textContent.trim().match(/^\d{4}$/)?.[0];
                if (!yrStr || Number(yrStr) < 2000) continue;

                const base = Number(tds[3].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const paid = Number(tds[6].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const dueAmt = Number(tds[7].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const pDate = tds[5].textContent.trim();

                const dueD = `03/31/${Number(yrStr) + 1}`;
                const [mm, dd, yyyy] = dueD.split("/");
                const dObj = new Date(`${yyyy}-${mm}-${dd}`);
                let delqD = "";
                if (!isNaN(dObj)) {
                  const del = new Date(dObj);
                  del.setDate(del.getDate() + 1);
                  delqD = `${String(del.getMonth() + 1).padStart(2, "0")}/${String(del.getDate()).padStart(2, "0")}/${del.getFullYear()}`;
                }

                const status = dueAmt <= 0 ? "Paid" : (cur < new Date(delqD) ? "Due" : "Delinquent");

                out.push({
                  jurisdiction: "County",
                  year: yrStr,
                  payment_type: "Annual",
                  installment: "",
                  status,
                  base_amount: `$${base.toFixed(2)}`,
                  amount_paid: status === "Paid" ? `$${paid.toFixed(2)}` : "$0.00",
                  amount_due: status !== "Paid" ? `$${dueAmt.toFixed(2)}` : "$0.00",
                  mailing_date: "N/A",
                  due_date: dueD,
                  delq_date: delqD,
                  paid_date: status === "Paid" ? (pDate || "-") : "-",
                  good_through_date: ""
                });
              }
            }
          }

          // Fallback 2 ── Delinquent history table ─────────────────────
          if (!out.length) {
            const dg = document.querySelector("#ctl00_ContentPlaceHolder1_dgDelinquentHistory");
            if (dg) {
              const rows = dg.querySelectorAll("tr");
              for (let i = 1; i < rows.length; i++) {
                const tds = rows[i].querySelectorAll("td");
                if (tds.length < 6 || /Total Due/i.test(tds[3].textContent)) continue;

                const yrStr = tds[0].textContent.trim().match(/^\d{4}$/)?.[0];
                if (!yrStr || Number(yrStr) < 2000) continue;

                const base = Number(tds[3].textContent.trim().replace(/[^0-9.]/g, "") || 0);
                const dueAmt = Number(tds[5].textContent.trim().replace(/[^0-9.]/g, "") || 0);

                const dueD = `03/31/${Number(yrStr) + 1}`;
                const [mm, dd, yyyy] = dueD.split("/");
                const dObj = new Date(`${yyyy}-${mm}-${dd}`);
                let delqD = "";
                if (!isNaN(dObj)) {
                  const del = new Date(dObj);
                  del.setDate(del.getDate() + 1);
                  delqD = `${String(del.getMonth() + 1).padStart(2, "0")}/${String(del.getDate()).padStart(2, "0")}/${del.getFullYear()}`;
                }

                const status = dueAmt <= 0 ? "Paid" : (cur < new Date(delqD) ? "Due" : "Delinquent");

                out.push({
                  jurisdiction: "County",
                  year: yrStr,
                  payment_type: "Annual",
                  installment: "",
                  status,
                  base_amount: `$${base.toFixed(2)}`,
                  amount_paid: "$0.00",
                  amount_due: status !== "Paid" ? `$${dueAmt.toFixed(2)}` : "$0.00",
                  mailing_date: "N/A",
                  due_date: dueD,
                  delq_date: delqD,
                  paid_date: "-",
                  good_through_date: ""
                });
              }
            }
          }

          return out;
        }, selectedYear, currentDate.toISOString());

        // ── Post-processing ─────────────────────────────────────────
        taxRows.sort((a, b) => Number(b.year) - Number(a.year));

        let filtered = taxRows;
        if (!taxRows.some(r => r.payment_type.includes("installment"))) {
          const latestN = taxRows.slice(0, yearsRequested);
          const extra = taxRows.slice(yearsRequested).filter(r => r.status === "Delinquent");
          filtered = [...latestN, ...extra];
        }

        filtered.sort((a, b) => Number(a.year) - Number(b.year));

        data.tax_history = filtered;

        const hasDelq = filtered.some(r => r.status === "Delinquent");
        data.delinquent = hasDelq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        const latestY = filtered[filtered.length - 1]?.year ?? "UNKNOWN";
        const isInst = filtered.some(r => r.payment_type.includes("installment"));

        if (!filtered.length) {
          data.notes = "NO TAX HISTORY FOUND, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 03/31.";
        } else if (isInst) {
          const groups = { Paid: [], Due: [], Delinquent: [] };
          filtered.forEach(r => {
            if (r.payment_type.includes("installment")) {
              const q = r.payment_type.replace(/ Installment/, "").toUpperCase();
              groups[r.status]?.push(`${q} INSTALLMENT`);
            }
          });

          const parts = ["ALL PRIORS ARE PAID"];
          if (groups.Paid.length) parts.push(`${groups.Paid.join(" & ")} ARE PAID`);
          if (groups.Due.length) parts.push(`${groups.Due.join(" & ")} ARE DUE`);
          if (groups.Delinquent.length) parts.push(`${groups.Delinquent.join(" & ")} ARE DELINQUENT`);
          parts.push("NORMALLY TAXES ARE PAID IN INSTALLMENTS, NORMALLY DUE DATES ARE 06/30, 09/30, 12/31 & 03/31.");

          data.notes = `${latestY} ${parts.join(", ")}`;
        } else {
          const priors = filtered.filter(r => Number(r.year) < Number(latestY));
          const priorsOk = priors.every(r => r.status === "Paid");

          const latestSt = filtered[filtered.length - 1]?.status ?? "UNKNOWN";
          const msg = priorsOk
            ? `ALL PRIORS ARE PAID, ${latestY} TAXES ARE ${latestSt.toUpperCase()}`
            : `PRIORS ARE DELINQUENT, ${latestY} TAXES ARE ${latestSt.toUpperCase()}`;

          data.notes = `${msg}, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 03/31.`;
        }

        data.years_requested = yearsRequested;
        data.years_returned = new Set(filtered.map(r => r.year)).size;
        data.has_delinquent = hasDelq;

        resolve(data);
      } catch (err) {
        data.notes = "FAILED TO COLLECT TAX HISTORY DATA, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 03/31.";
        data.delinquent = "NONE";
        data.tax_history = [];
        data.years_requested = yearsRequested;
        data.years_returned = 0;
        data.has_delinquent = false;
        resolve(data);
      }
    })();
  });
};

const account_search = async (page, account, config, yearsRequested) => {
  try {
    const year = await jc_1(page, account, config);
    let data = await jc_2(page, account, config);
    data = await jc_paid(page, data, year, yearsRequested);
    return data;
  } catch (err) {
    try {
      let partial = await jc_2(page, account, config);
      partial.notes = "FAILED TO COLLECT TAX HISTORY DATA, NORMALLY TAXES ARE PAID ANNUALLY, NORMALLY DUE DATE IS 03/31.";
      partial.delinquent = "NONE";
      partial.tax_history = [];
      partial.years_requested = yearsRequested;
      partial.years_returned = 0;
      partial.has_delinquent = false;
      return partial;
    } catch {
      throw err;
    }
  }
};

const search = async (req, res) => {
  let context = null;
  try {
    const { fetch_type, account, client } = req.body;
    const county = req.path.replace(/^\/+/, "");

    if (!["html", "api"].includes(fetch_type)) {
      return res.status(200).render("error_data", { error: true, message: "Invalid fetch_type. Must be 'html' or 'api'." });
    }

    if (!counties[county]) {
      const msg = "Invalid or missing county.";
      return fetch_type === "api"
        ? res.status(400).json({ error: true, message: msg })
        : res.status(200).render("error_data", { error: true, message: msg + " Supported: holmes, jefferson, ..." });
    }

    const config = counties[county];
    const years = getOHCompanyYears(client) || 2;

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1366, height: 768 });
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", r => {
      if (["stylesheet", "font", "image"].includes(r.resourceType())) r.abort();
      else r.continue();
    });

    const result = await account_search(page, account, config, years);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", result);
    } else {
      res.status(200).json({ result });
    }
  } catch (err) {
    const msg = err.message || "Server error";
    if (req.body?.fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: msg });
    } else {
      res.status(500).json({ error: true, message: msg });
    }
  } finally {
    if (context) await context.close();
  }
};

module.exports = { search };