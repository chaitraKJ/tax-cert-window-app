// AUTHOR: MANJUNADH

// Ohio County Tax Scraper (Jackson)

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 }; //Timeout for wait for selectors.

// - counties: Configuration object
// Includes URLs, CSS selectors, due dates.
const counties = {
    jackson: {
        detailUrl: "https://beacon.schneidercorp.com/Application.aspx?AppID=1113&LayerID=28100&PageTypeID=4&PageID=11501&Q=163250277&KeyValue={{account}}",
        taxing_authority: "Jackson County Auditor — 226 E Main St, Suite 5, Jackson, OH 45640-1797, Ph: (740) 286-4231",
        city: "Jackson",
        zip: "45640",
        ids: {
            ownerNameLbl: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch", //owner name id - label type ( beacon websites specific )
            ownerNameLnk: "#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch", //owner name id - link type ( beacon websites specific )
            ownerAddr: "#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl01_pnlSingleValue", //Property Address
            valuationTable: "#ctlBodyPane_ctl04_ctl01_grdValuation_grdYearData", //Table id for Total Taxable/Assessed values
            taxHistoryTable: "#ctlBodyPane_ctl07_ctl01_gvwTaxHistory", //Table id for Tax history
            paymentsTable: "#ctlBodyPane_ctl09_ctl01_gvwPayments" //Table id for Payment dates table
        },
        dueDates: { due1: "02/25", delq1: "02/26", due2: "07/29", delq2: "07/30" },
        dueNotes: "02/25 & 07/29"
    }
};

// ────────────────────────────── STEP 1: NAVIGATE & SEARCH ──────────────────────────────

const jackson_1 = async (page, account, config) => {

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

const jackson_2 = async (page, config) => {

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

const extractBeaconYear = async (page, label, cfg) => {
    return await page.evaluate((label, cfg) => {

        const txt = (id) => document.getElementById(id)?.textContent.trim() || "$0.00";
        const parse = (s) => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
        const fmt = (n) => n === 0 ? "$0.00" : "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        const curRow = Array.from(
            document.querySelectorAll("#ctlBodyPane_ctl07_ctl01_gvwTaxHistory tbody tr")
        ).find(r => r.textContent.includes(label));

        if (!curRow) return null;

        const expandBtn = curRow.querySelector("a.expandCollapseIcon");
        if (expandBtn && expandBtn.getAttribute("aria-expanded") === "false") {
            expandBtn.click();
        }

        const detailSpan = curRow
            .nextElementSibling
            ?.querySelector('[id*="fvTaxHistory_Detail_"]');

        if (!detailSpan) return null;

        const prefix = detailSpan.id.replace(/(FirstHalf|SecondHalf).*/, "");

        const priorDel1 = parse(txt(prefix + "FirstHalfPriorDelinquenciesLabel"));
        const priorDel2 = parse(txt(prefix + "SecondHalfPriorDelinquenciesLabel"));

        const base1 =
            parse(txt(prefix + "FirstHalfGrossTaxesLabel")) ||
            parse(txt(prefix + "FirstHalfTaxesLabel"));

        const base2 =
            parse(txt(prefix + "SecondHalfGrossTaxesLabel")) ||
            parse(txt(prefix + "SecondHalfTaxesLabel"));



        // Payments
        const allPayments = {};
        document.querySelectorAll("#ctlBodyPane_ctl09_ctl01_gvwPayments tbody tr").forEach(tr => {
            const th = tr.querySelector("th");
            const td = tr.querySelector("td");
            if (!th || !td) return;

            const amt = Math.abs(parse(td.textContent));
            if (!amt) return;

            const m = th.textContent.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!m) return;

            const date = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
            if (!allPayments[m[3]]) allPayments[m[3]] = [];
            allPayments[m[3]].push({ date, amt });
        });

        Object.values(allPayments).forEach(a =>
            a.sort((x, y) => new Date(x.date) - new Date(y.date))
        );

        const payments = allPayments[cfg.payYear] || [];

        const buildRow = (inst) => {
            const base = inst === "1" ? base1 : base2;
            const bal = inst === "1" ? priorDel1 : priorDel2;
            const isDue = inst === "1" ? cfg.isFirstHalfDue : cfg.isSecondHalfDue;
            const pay = inst === "1" ? payments[0] : payments[1];

            let status = "Paid", paid = "$0.00", date = "-";

            if (bal > 0) status = "Delinquent";
            else if (!pay) status = isDue ? "Due" : "Delinquent";
            else {
                paid = fmt(pay.amt);
                date = pay.date;
            }

            return {
                jurisdiction: "County",
                year: cfg.taxYear,
                payment_type: "Semi-Annual",
                installment: inst,
                status,
                base_amount: fmt(base),
                amount_paid: paid,
                amount_due: bal > 0 ? fmt(bal) : "$0.00",
                mailing_date: "N/A",
                due_date: inst === "1" ? cfg.due1 : cfg.due2,
                delq_date: inst === "1" ? cfg.delq1 : cfg.delq2,
                paid_date: date,
                good_through_date: "_"
            };
        };

        return {
            rows: [buildRow("1"), buildRow("2")],
            hasPriorDelinquent: priorDel1 > 0 || priorDel2 > 0
        };
    }, label, cfg);
};


// ────────────────────────────── STEP 3: DETAILED TAX REPORT & PRIOR YEARS STATUS ──────────────────────────────

const jackson_paid = async (page, overview, account, config, yearLimit = 1) => {

    const now = new Date();

    const yearsToFetch = [];

    for (let i = 1; i <= yearLimit; i++) {
        yearsToFetch.push({
            taxYear: now.getFullYear() - i,
            payYear: now.getFullYear() - (i - 1)
        });
    }


    let taxHistory = [];
    let hasAnyPriorDelinquent = false;
    let notes = "NO TAX DATA FOUND";
    let delinquent = "NONE";

    try {

        for (const yr of yearsToFetch) {
            const label = `${yr.taxYear} Pay ${yr.payYear}`;

            const due1 = `${config.dueDates.due1}/${yr.payYear}`;
            const delq1 = `${config.dueDates.delq1}/${yr.payYear}`;
            const due2 = `${config.dueDates.due2}/${yr.payYear}`;
            const delq2 = `${config.dueDates.delq2}/${yr.payYear}`;

            const dueDate1Obj = new Date(`${yr.payYear}-${config.dueDates.due1}`);
            const dueDate2Obj = new Date(`${yr.payYear}-${config.dueDates.due2}`);

            const isFirstHalfDue = now <= dueDate1Obj;
            const isSecondHalfDue = now <= dueDate2Obj;

            const result = await extractBeaconYear(page, label, {
                taxYear: yr.taxYear.toString(),
                payYear: yr.payYear.toString(),
                due1,
                delq1,
                due2,
                delq2,
                isFirstHalfDue,
                isSecondHalfDue,
                dueNotes: config.dueNotes
            });


            // If year not found, skip safely
            if (!result) continue;

            taxHistory.push(...result.rows);
            if (result.hasPriorDelinquent) hasAnyPriorDelinquent = true;
        }

        if (taxHistory.length === 0) {
            throw new Error("No tax history rows found");
        }

        delinquent = hasAnyPriorDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

        notes = hasAnyPriorDelinquent
            ? `PRIORS ARE DELINQUENT, ${yearsToFetch[0].taxYear} TAXES STATUS CHECKED, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`
            : `ALL PRIORS ARE PAID, ${yearsToFetch[0].taxYear} TAXES STATUS CHECKED, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${config.dueNotes}`;

    } catch (err) {
        console.error("[JACKSON] Extraction failed:", err.message);
        notes = "FAILED TO LOAD TAX HISTORY";
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
    await jackson_1(page, account, config);
    const overview = await jackson_2(page, config);
    return await jackson_paid(page, overview, account, config, yearLimit);
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

export { search };