// AUTHOR: MANJUNADH
// Ohio County Tax Scraper (fairfield)

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 }; //Timeout for wait for selectors.

// - counties: Configuration object
// Includes URLs, CSS selectors, due dates.
const counties = {
    fairfield: {
        detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1131&LayerID=28628&PageTypeID=4&PageID=11901&Q=831758549&KeyValue={{account}}",
        taxing_authority: "fairfield County Auditor — 226 E. Main Street, Suite 5, Jackson, OH 45640-1797, Ph: (740) 286-4231",
        city: "fairfield",
        zip: "45640",
        ids: {
            ownerNameLbl: "#ctlBodyPane_ctl01_ctl01_sprLnkOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch", //owner name id - label type ( beacon websites specific )
            ownerNameLnk: "#ctlBodyPane_ctl01_ctl01_sprLnkOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch", //owner name id - link type ( beacon websites specific )
            ownerAddr: "#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl01_pnlSingleValue", //Property Address
            valuationTable: "#ctlBodyPane_ctl02_ctl01_grdValuation_grdYearData", //Table id for Total Taxable/Assessed values
            taxHistoryTable: "#ctlBodyPane_ctl14_ctl01_gvwTaxHistory", //Table id for Tax history
            paymentsTable: "#ctlBodyPane_ctl16_ctl01_gvwPayments" //Table id for Payment dates table
        },
        dueDates: { due1: "02/20", delq1: "02/21", due2: "07/17", delq2: "07/18" },
        dueNotes: "02/20 & 07/17"
    }
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

const fairfield_1 = async (page, account, config) => {

    if (!account?.trim()) throw new Error("Parcel account is required"); // Validate input

    const url = config.detailUrl.replace("{{account}}", account);  //parcel number enter

    await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });  //navigation to url

    // Dismiss any disclaimer popups (multiple possible selectors)
    const modalSelectors = [
        '.btn.btn-primary.button-1[data-dismiss="modal"]',
        '[data-dismiss="modal"]',
        '.modal .close',
    ];
    for (const sel of modalSelectors) {
        try {
            await page.waitForSelector(sel, { timeout: 5000 });
            await page.click(sel);
            await new Promise(res => setTimeout(res, 1000));
            break;
        } catch (e) {
            console.info(`[INFO] Modal selector ${sel} not found, skipping`);
        }
    }
    // Wait for owner name section
    const ownerSelector = `${config.ids.ownerNameLbl},${config.ids.ownerNameLnk}`;
    await page.waitForSelector(ownerSelector, { timeout_option });
};

// ────────────────────────────── STEP 2: EXTRACT OVERVIEW ──────────────────────────────

const fairfield_2 = async (page, config) => {

    // Extracts Owner Name
    const ownerName = await page.evaluate((lbl, lnk) => {
        try {
            const el = document.querySelector(lbl) || document.querySelector(lnk);
            return el
                ? el.innerText.replace(/\s+/g, ' ').trim()
                : 'N/A';
        } catch (e) {
            return 'N/A';
        }
    }, config.ids.ownerNameLbl, config.ids.ownerNameLnk);


    // Extracts Property Address
    const propertyAddress = await page.evaluate(id => {
        try {
            const el = document.querySelector(id);
            return el
                ? el.innerText.replace(/\s+/g, ' ').trim()
                : 'N/A';
        } catch (e) {
            return 'N/A';
        }
    }, config.ids.ownerAddr);

    // Extracts Total Assessed / Taxable Values
    let totalValue = 'N/A';
    try {
        const valueText = await page.$eval(
            config.ids.valuationTable,
            table => {
                for (const row of table.querySelectorAll('tr')) {
                    const header = row.querySelector('th')?.textContent.trim();
                    if (header === 'Total Value (Assessed 35%)') {
                        const td = row.querySelector('td.value-column');
                        return td?.textContent.trim() || null;
                    }
                }
                return null; // row not found
            }
        );
        // Set to 'N/A' if nothing was found
        totalValue = (valueText && valueText.trim() !== '') ? valueText.trim() : 'N/A';

    } catch (err) {
        // Table missing, selector changed, or page error → safe fallback
        console.info('[INFO] Valuation table in fairfield county not found or changed → total_value = N/A');
        totalValue = 'N/A';
    }

    // fairfield_2 – final return
    return {
        owner_name: ownerName,
        property_address: propertyAddress || "N/A",
        total_value: totalValue,
    };
};

// ────────────────────────────── STEP 3: DETAILED TAX REPORT & PRIOR YEARS STATUS ──────────────────────────────

const fairfield_paid = async (page, overview, account, config, yearLimit = 1) => {

    // TAX YEAR, PAY YEAR, LABEL & DUE DATES

    const now = new Date();
    const payYear = now.getFullYear();
    const taxYear = (payYear - 1).toString();
    const label = `${taxYear} Pay ${payYear}`;

    const due1 = `${config.dueDates.due1}/${payYear}`;
    const delq1 = `${config.dueDates.delq1}/${payYear}`;
    const due2 = `${config.dueDates.due2}/${payYear}`;
    const delq2 = `${config.dueDates.delq2}/${payYear}`;

    const dueDate1Obj = new Date(`${payYear}-${config.dueDates.due1}`);
    const dueDate2Obj = new Date(`${payYear}-${config.dueDates.due2}`);
    const isFirstHalfDue = now <= dueDate1Obj;
    const isSecondHalfDue = now <= dueDate2Obj;


    // CURRENT YEAR EXTRACTION + PAYMENTS + FINAL LOGIC

    let taxHistory = [];
    let delinquent = "NONE";
    let notes = "";
    const prevPayYear = payYear - 1;
    const prevTaxYear = (prevPayYear - 1).toString();
    const prevLabel = `${prevTaxYear} Pay ${prevPayYear}`;


    try {

        const result = await page.evaluate((label, cfg) => {
            // Helper functions
            const txt = (id) => document.getElementById(id)?.textContent.trim() || "$0.00";
            const parse = (s) => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
            const fmt = (n) => n === 0 ? "$0.00" : "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

            // 1. Find current year row and expand it
            const curRow = Array.from(document.querySelectorAll("#ctlBodyPane_ctl14_ctl01_gvwTaxHistory tbody tr"))
                .find(r => r.textContent.includes(label));
            if (!curRow) return null;

            const expandBtn = curRow.querySelector("a.expandCollapseIcon");
            if (expandBtn && expandBtn.getAttribute("aria-expanded") === "false") {
                expandBtn.click();
            }

            // Wait for tax table to appear (max 3 seconds)
            const waitStart = Date.now();
            while (Date.now() - waitStart < 3000) {
                if (document.querySelector("#ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail")?.style.display !== "none") break;
            }

            const prefix = "ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_";

            // Amount Dues & Base Amounts
            const priorDel1 = parse(txt(prefix + "FirstHalfPriorDelinquenciesLabel"));
            const priorDel2 = parse(txt(prefix + "SecondHalfPriorDelinquenciesLabel"));
            const base1 = parse(txt(prefix + "FirstHalfGrossTaxesLabel"));
            const base2 = parse(txt(prefix + "SecondHalfGrossTaxesLabel"));

            // 2. Extract all payments 
            const allPayments = {};
            document.querySelectorAll("#ctlBodyPane_ctl16_ctl01_gvwPayments tbody tr").forEach(tr => {
                const dateTh = tr.querySelector("th");
                const amtTd = tr.querySelector("td");
                if (!dateTh || !amtTd) return;

                const rawDate = dateTh.textContent.trim();
                const rawAmt = amtTd.textContent.trim();
                const amount = Math.abs(parse(rawAmt));
                if (amount === 0) return;

                const match = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!match) return;

                const [, m, d, y] = match;
                const date = `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
                const year = y;

                if (!allPayments[year]) allPayments[year] = [];
                allPayments[year].push({ date, amt: amount });
            });
            // Sort each year newest → oldest
            Object.values(allPayments).forEach(arr => arr.sort((a, b) => new Date(b.date) - new Date(a.date)));

            // 3. Build tax rows (current year only)
            const paymentsThisYear = allPayments[cfg.payYear] || [];

            const buildRow = (inst) => {
                const balance = inst === "1" ? priorDel1 : priorDel2;
                const base = inst === "1" ? base1 : base2;
                const isDue = inst === "1" ? cfg.isFirstHalfDue : cfg.isSecondHalfDue;

                // Payment assignment logic:
                const payment = inst === "1"
                    ? paymentsThisYear[paymentsThisYear.length - 1]  // oldest payment = 1st half
                    : paymentsThisYear[0];                           // newest payment = 2nd half

                let status = "Paid";
                let amount_paid = "$0.00";
                let paid_date = "-";

                // RULE 1: Prior delinquency → ALWAYS Delinquent (overrides everything)
                if (balance > 0) {
                    status = "Delinquent";
                    amount_paid = "$0.00";
                    paid_date = "-";
                }
                // RULE 2: No prior delinquency → trust the payment table exactly
                else if (payment) {
                    status = "Paid";
                    amount_paid = fmt(payment.amt);
                    paid_date = payment.date;
                }
                // RULE 3: No payment at all → Due or Delinquent based on date
                else {
                    status = isDue ? "Due" : "Delinquent";
                }

                return {
                    jurisdiction: "County",
                    year: cfg.taxYear,
                    payment_type: "Semi-Annual",
                    installment: inst,
                    status,
                    base_amount: fmt(base),
                    amount_paid,
                    amount_due: balance > 0 ? fmt(balance) : "$0.00",
                    mailing_date: "N/A",
                    due_date: inst === "1" ? cfg.due1 : cfg.due2,
                    delq_date: inst === "1" ? cfg.delq1 : cfg.delq2,
                    paid_date,
                    good_through_date: "_",
                };
            };
            const rows = [buildRow("1"), buildRow("2")];

            // 4. Final status logic
            const hasPriorDelinquent = priorDel1 > 0 || priorDel2 > 0;
            const currentStatusText = rows.some(r => r.status === "Delinquent") ? "DELINQUENT"
                : rows.some(r => r.status === "Due") ? "DUE" : "PAID";

            const priorStatus = hasPriorDelinquent ? "DELINQUENT" : "PAID";

            let finalNotes;
            if (currentStatusText === "PAID") {
                finalNotes = `ALL PRIORS ARE ${priorStatus}, ${cfg.taxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${cfg.dueNotes}`;
            } else if (!hasPriorDelinquent) {
                finalNotes = `ALL PRIORS ARE PAID, ${cfg.taxYear} TAXES ARE ${currentStatusText}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${cfg.dueNotes}`;
            } else {
                finalNotes = `PRIORS ARE DELINQUENT, ${cfg.taxYear} TAXES ARE ${currentStatusText}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${cfg.dueNotes}`;
            }

            return {
                rows,
                hasPriorDelinquent,
                notes: finalNotes
            };
        }, label, {
            taxYear,
            payYear,
            due1,
            delq1,
            due2,
            delq2,
            isFirstHalfDue,
            isSecondHalfDue,
            dueNotes: config.dueNotes
        });

        if (!result) throw new Error("Current year row not found");

        taxHistory = result.rows;
        delinquent = result.hasPriorDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
        notes = result.notes;

    } catch (err) {
        console.error("[FAIRFIELD] Extraction failed:", err.message);
        delinquent = "NONE";
        notes = "FAILED TO LOAD TAX HISTORY";
    }
    let prevResult = null;

    if (yearLimit > 1) {
        prevResult = await page.evaluate((label, cfg) => {
            // const txt = (id) => document.getElementById(id)?.textContent.trim() || "$0.00";
            const parse = (s) => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
            const fmt = (n) => n === 0 ? "$0.00" : "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

            const prevRow = Array.from(document.querySelectorAll("#ctlBodyPane_ctl14_ctl01_gvwTaxHistory tbody tr"))
                .find(r => r.textContent.includes(label));
            if (!prevRow) return null;

            const expandBtn = prevRow.querySelector("a.expandCollapseIcon");
            if (expandBtn && expandBtn.getAttribute("aria-expanded") === "false") {
                expandBtn.click();
            }

            const waitStart = Date.now();
            while (Date.now() - waitStart < 3000) {
                if (document.querySelector("#ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail")?.style.display !== "none") break;
            }

            const getDetailRow = (yearRow) => {
                let next = yearRow.nextElementSibling;
                while (next && !next.querySelector("table")) {
                    next = next.nextElementSibling;
                }
                return next;
            };

            const detailRow = getDetailRow(prevRow);
            if (!detailRow) return null;

            const txt = (suffix) =>
                detailRow.querySelector(`[id$="${suffix}"]`)?.textContent.trim() || "$0.00";



            const prefix = "ctlBodyPane_ctl14_ctl01_gvwTaxHistory_ctl03_fvTaxHistory_Detail_";

            const base1 = parse(txt("FirstHalfGrossTaxesLabel"));
            const base2 = parse(txt("SecondHalfGrossTaxesLabel"));

            const priorDel1 = parse(txt("FirstHalfPriorDelinquenciesLabel"));
            const priorDel2 = parse(txt("SecondHalfPriorDelinquenciesLabel"));



            // 🔹 Extract payments
            const payYear = cfg.payYear;

            const payments = [];
            document.querySelectorAll("#ctlBodyPane_ctl16_ctl01_gvwPayments tbody tr").forEach(tr => {
                const d = tr.querySelector("th")?.textContent.trim();
                const a = tr.querySelector("td")?.textContent.trim();
                if (!d || !a) return;

                const dateObj = new Date(d);
                if (isNaN(dateObj)) return;

                // FILTER BY PAY YEAR
                if (dateObj.getFullYear() !== payYear) return;

                const amt = Math.abs(parse(a));
                if (!amt) return;

                payments.push({ date: d, amt, dateObj });
            });

            payments.sort((a, b) => a.dateObj - b.dateObj);


            payments.sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest → newest

            const p1 = payments[0];
            const p2 = payments[payments.length - 1];

            const buildRow = (inst, base, bal, pay) => {
                const status = bal > 0 ? "Delinquent" : pay ? "Paid" : "Delinquent";
                return {
                    jurisdiction: "County",
                    year: cfg.taxYear,
                    payment_type: "Semi-Annual",
                    installment: inst,
                    status,
                    base_amount: fmt(base),
                    amount_paid: pay ? fmt(pay.amt) : "$0.00",
                    amount_due: bal > 0 ? fmt(bal) : "$0.00",
                    mailing_date: "N/A",
                    due_date: inst === "1" ? cfg.due1 : cfg.due2,
                    delq_date: inst === "1" ? cfg.delq1 : cfg.delq2,
                    paid_date: pay ? pay.date : "-",
                    good_through_date: "_",
                };
            };

            return [
                buildRow("1", base1, priorDel1, p1),
                buildRow("2", base2, priorDel2, p2),
            ];
        }, prevLabel, {
            taxYear: prevTaxYear,
            payYear: prevPayYear,   // REQUIRED
            due1: `${config.dueDates.due1}/${prevPayYear}`,
            delq1: `${config.dueDates.delq1}/${prevPayYear}`,
            due2: `${config.dueDates.due2}/${prevPayYear}`,
            delq2: `${config.dueDates.delq2}/${prevPayYear}`,
        });
    }

    if (prevResult?.length) {
        taxHistory = [...prevResult, ...taxHistory];
    }



    return {
        processed_date: new Date().toISOString(),
        order_number: "",
        borrower_name: "",
        owner_name: overview.owner_name ? [overview.owner_name] : [],
        property_address: overview.property_address || "",
        parcel_number: account,
        land_value: "",
        improvements: "",
        total_assessed_value: overview.total_value,
        exemption: "",
        total_taxable_value: overview.total_value,
        taxing_authority: config.taxing_authority,
        notes,
        delinquent,
        tax_history: taxHistory
    };

};

// ────────────────────────────── MAIN SEARCH FLOW ──────────────────────────────
const account_search = async (page, account, county, yearLimit = 1) => {
    const config = counties[county];
    if (!config) throw new Error(`Unsupported county: ${county}`);
    await fairfield_1(page, account, config);
    const overview = await fairfield_2(page, config, yearLimit);
    return await fairfield_paid(page, overview, account, config, yearLimit);
};

// ────────────────────────────── EXPRESS CONTROLLER ──────────────────────────────
const search = async (req, res) => {
    let context = null;
    try {
        const { fetch_type, account, client } = req.body || {};
        if (!account?.trim()) throw new Error("Account is required");
        if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");
        const pathParts = req.path.split("/").filter(Boolean);
        const county = pathParts[pathParts.length - 1].toLowerCase();
        if (!counties[county]) throw new Error(`Unsupported county: ${county}`);
        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await Promise.all([
            page.setViewport({ width: 1366, height: 768 }),
            page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36")
        ]);
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const blocked = [];
            if (blocked.includes(req.resourceType())) req.abort();
            else req.continue();
        });
        const data = await account_search(page, account, county, yearLimit);
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", { ...data, tax_history: data.tax_history });
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error(`[ERROR] Scrape failed:`, error.message);
        const fetchType = req.body?.fetch_type || "api";
        if (fetchType === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (context) {
            try { await context.close(); } catch (e) { console.warn(`[WARN] Context close failed:`, e.message); }
        }
    }
};

module.exports = { search };