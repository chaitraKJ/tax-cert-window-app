//Author:Sanam Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");
const timeout_option = { timeout: 90000 };

// -------------------------------------------
//  SEMI-ANNUAL TAX NOTES LOGIC
// -------------------------------------------
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/21 07/25`;

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

// =======================================================
// UTILITY: Determine county by URL
// =======================================================
const getCountyFromUrl = (url) => {
    if (!url) return null;
    const u = String(url).toLowerCase();
    if (u.includes("oh-ashland-auditor.publicaccessnow.com")) return "ashland";
    if (u.includes("oh-columbiana-auditor.publicaccessnow.com")) return "columbiana";
    return null;
};
const fixShortDate = (d) => {
    if (!d) return "";

    const parts = d.split("/");
    if (parts.length !== 3) return d;

    let [m, day, y] = parts;

    // If already 4-digit year, keep it
    if (y.length === 4) {
        return `${m.padStart(2, "0")}/${day.padStart(2, "0")}/${y}`;
    }

    // If 2-digit year, convert to 20xx
    return `${m.padStart(2, "0")}/${day.padStart(2, "0")}/${2000 + Number(y)}`;
};


// -------------------------------------------------------------
// STEP 1 — SEARCH PARCEL (works for both counties)
// -------------------------------------------------------------
const ac_1 = (page, baseUrl, account) => {
    return page.goto(`${baseUrl}/QuickSearch.aspx`)
        .then(() => page.waitForSelector("#fldSearchFor"))
        .then(() => page.$eval("#fldSearchFor", el => (el.value = "")))
        .then(() => page.type("#fldSearchFor", String(account)))
        .then(() =>
            Promise.all([
                page.click("button[name='btnSearch']"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ])
        )
        .then(() =>
            page.$eval(
                "a.buttonhover[href*='Property.aspx?mpropertynumber=']",
                el => el.getAttribute("href")
            )
        )
        .then(relHref => `${baseUrl}/${relHref}`)
        .catch(err => {
            console.log("ac_1 error:", err);
            throw err;
        });
};


// -------------------------------------------------------------
// STEP 2 — SCRAPE TAX HISTORY (county-specific selectors)
// -------------------------------------------------------------



// helper
const scrapeTaxHistory = async (page, county, yearLimit = 1) => {

    try {
        // NAVIGATE TO TAX TAB
        const taxTabSelector = "#radioset > label:nth-child(2)";
        if (await page.$(taxTabSelector)) {
            await Promise.all([
                page.click(taxTabSelector),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
        }

        // FIND TAX TABLE
        const tableHandle =
            await page.$("table.ui-widget-content.ui-corner-all") ||
            await page.$("#lxT461 table.ui-widget-content") ||
            await page.$("#lxT486 table") ||
            await page.$("table.ui-corner-all");

        if (!tableHandle) return emptyTaxResult();

        // PAGE EVALUATION
        const data = await page.evaluate((yearLimit) => {
            const parseMoney = v => parseFloat((v || "").replace(/[$,]/g, "")) || 0;

            const tbl = [...document.querySelectorAll("table")].find(t =>
                t.innerText.includes("Orig Tax") || t.innerText.includes("Total Owed")
            );
            if (!tbl) return { firstHalf: {}, secondHalf: {}, paid1: "", paid2: "", taxYear: new Date().getFullYear(), previousYearRecords: [] };

            const rows = [...tbl.querySelectorAll("tr")];
            const findRow = lbl => rows.find(r => (r.children[0]?.innerText || "").trim().toLowerCase() === lbl.toLowerCase());
            const safe = (row, i) => parseMoney(row?.children[i]?.innerText);

            const firstHalf = {
                base: safe(findRow("Total Owed"), 3),
                paid: safe(findRow("Total Paid"), 3),
                due: safe(findRow("Balance Due"), 3)
            };
            const secondHalf = {
                base: safe(findRow("Total Owed"), 5),
                paid: safe(findRow("Total Paid"), 5),
                due: safe(findRow("Balance Due"), 5)
            };

            // CURRENT YEAR
            let taxYear = new Date().getFullYear() - 1;
            const hdr = document.querySelector(".CurrentTaxYearDetail");
            if (hdr) {
                const m = hdr.innerText.match(/\b20\d{2}\b/);
                if (m) taxYear = +m[0];
            }

            // PAYMENT DATES
            let paid1 = "", paid2 = "";
            const tables = [...document.querySelectorAll("table")];
            const paymentTable = tables.find(t => {
                const th = [...t.querySelectorAll("th")].map(x => x.innerText.trim());
                return th.includes("Date") && th.includes("Half");
            });

            const previousYearRecords = [];

            if (paymentTable) {
                const rows = [...paymentTable.querySelectorAll("tbody tr")];
                const yearMap = {};

                for (const r of rows) {
                    const tds = [...r.querySelectorAll("td")].map(td => td.innerText.trim());
                    if (tds.length < 2) continue;

                    const date = tds[0];
                    const halfTxt = tds[1];
                    if (halfTxt.startsWith("1-") && !paid1) paid1 = date;
                    if (halfTxt.startsWith("2-") && !paid2) paid2 = date;

                    // PREVIOUS YEAR
                    if (tds.length >= 5) {
                        const prior = parseMoney(tds[2]);
                        const firstAmt = parseMoney(tds[3]);
                        const secondAmt = parseMoney(tds[4]);

                        // Parse half & year from "1-24" / "2-24"
                        const m = halfTxt.match(/([12])-(\d{2})$/);
                        if (!m) continue;

                        const halfNo = m[1];                 // "1" or "2"
                        const shortYear = Number(m[2]);      // 24
                        const taxYear = 2000 + shortYear;
                        // ✅ THIS IS THE TAX YEAR

                        if (!yearMap[taxYear]) {
                            yearMap[taxYear] = {
                                taxYear,
                                firstHalf: { base: 0, paid: 0, due: 0, paid_date: "" },
                                secondHalf: { base: 0, paid: 0, due: 0, paid_date: "" },
                                status: "Paid"
                            };
                        }

                        const paidAmt = prior + firstAmt + secondAmt;
                        if (!paidAmt) continue;

                        if (halfNo === "1") {
                            yearMap[taxYear].firstHalf.base += paidAmt;
                            yearMap[taxYear].firstHalf.paid += paidAmt;
                            if (!yearMap[taxYear].firstHalf.paid_date)
                                yearMap[taxYear].firstHalf.paid_date = date;
                        } else {
                            yearMap[taxYear].secondHalf.base += paidAmt;
                            yearMap[taxYear].secondHalf.paid += paidAmt;
                            if (!yearMap[taxYear].secondHalf.paid_date)
                                yearMap[taxYear].secondHalf.paid_date = date;
                        }

                    }
                }

                const years = Object.keys(yearMap).map(Number).sort((a, b) => b - a);
                const prevYears = years.slice(0, yearLimit);

                for (const y of prevYears) {
                    const prev = yearMap[y];

                    previousYearRecords.push({
                        jurisdiction: "County",
                        year: String(prev.taxYear),
                        payment_type: "Semi-Annual",
                        status: prev.status,
                        base_amount: `$${prev.firstHalf.base.toFixed(2)}`,
                        amount_paid: `$${prev.firstHalf.paid.toFixed(2)}`,
                        amount_due: `$${prev.firstHalf.due.toFixed(2)}`,
                        mailing_date: "N/A",
                        due_date: `02/21/${prev.taxYear + 1}`,
                        delq_date: `02/22/${prev.taxYear + 1}`,
                        paid_date: prev.firstHalf.paid_date || "-",
                        good_through_date: "N/A"
                    });

                    previousYearRecords.push({
                        jurisdiction: "County",
                        year: String(prev.taxYear),
                        payment_type: "Semi-Annual",
                        status: prev.status,
                        base_amount: `$${prev.secondHalf.base.toFixed(2)}`,
                        amount_paid: `$${prev.secondHalf.paid.toFixed(2)}`,
                        amount_due: `$${prev.secondHalf.due.toFixed(2)}`,
                        mailing_date: "N/A",
                        due_date: `07/25/${prev.taxYear + 1}`,
                        delq_date: `07/26/${prev.taxYear + 1}`,
                        paid_date: prev.secondHalf.paid_date || "-",
                        good_through_date: "N/A"
                    });
                }

            }

            return { firstHalf, secondHalf, paid1, paid2, taxYear, previousYearRecords };
        }, yearLimit);

        // Fix dates in Node.js (browser cannot access fixShortDate)
        if (data.previousYearRecords?.length) {
            for (let rec of data.previousYearRecords) {
                if (rec.paid_date && rec.paid_date !== "-") rec.paid_date = fixShortDate(rec.paid_date);
            }
        }
        if (data.paid1) data.paid1 = fixShortDate(data.paid1);
        if (data.paid2) data.paid2 = fixShortDate(data.paid2);

        return data;

    } catch (e) {
        console.log("scrapeTaxHistory ERROR:", e);
        return emptyTaxResult();
    }
};


// helper
function emptyTaxResult() {
    return {
        owner: "",
        billing_address: "",
        firstHalf: { base: 0, paid: 0, due: 0 },
        secondHalf: { base: 0, paid: 0, due: 0 },
        paid1: "",
        paid2: "",
        taxYear: new Date().getFullYear()
    };
}

// =======================================================
// MAIN SCRAPER
// =======================================================
const ac_2 = async (page, detailUrl, yearLimit = 1) => {
    try {
        const county = getCountyFromUrl(detailUrl);
        await page.goto(detailUrl, { waitUntil: "networkidle2" });
        await page.waitForSelector("table.ui-corner-all", { timeout: timeout_option.timeout });

        const parcelData = await page.evaluate((county) => {
            const rows = [...document.querySelectorAll("table.ui-corner-all tr")];
            const getRow = (label) => {
                const row = rows.find(r => r.children[0]?.innerText.trim() === label);
                return row ? row.children[1].innerText.trim().replace(/\s+/g, " ") : "";
            };

            // Extract assessed and taxable values
            let total_assessed_value = "N/A";
            let total_taxable_value = "N/A";

            const valueTable = document.querySelector(
                "#lxT479 > div > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td > table.ui-corner-all"
            );

            if (valueTable) {
                const tds = [...valueTable.querySelectorAll("td")].map(td => td.innerText.trim());
                const totalIndex = tds.indexOf("Total");

                if (totalIndex !== -1) {
                    total_assessed_value = tds[totalIndex + 1] || "N/A";
                    total_taxable_value = total_assessed_value;
                }
            }
            // Return results per county
            if (county === "columbiana") {
                return {
                    parcel_number: getRow("Parcel ID"),
                    owner_name: getRow("Owner Name"),
                    property_address: getRow("Owner Address"),
                    total_assessed_value,
                    total_taxable_value
                };
            }

            if (county === "ashland") {
                return {
                    parcel_number: getRow("Property Number"),
                    owner_name: getRow("Owner Name"),
                    property_address: getRow("Owner Address"),
                    total_assessed_value,
                    total_taxable_value
                };
            }

            return {
                parcel_number: "",
                owner_name: "",
                property_address: "",
                total_assessed_value,
                total_taxable_value
            };
        }, county);
        const taxRaw = await scrapeTaxHistory(page, county, yearLimit);

        // ===============================
        // ASSESSED/TAXABLE VALUE SCRAPE
        // ===============================
        let assessedTotal = "";
        try {
            assessedTotal = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll("tr"));
                for (const row of rows) {
                    const cells = row.querySelectorAll("td");
                    if (cells.length >= 4) {
                        if (cells[2].textContent.trim() === "Total") {
                            return cells[3].textContent.trim();
                        }
                    }
                }

                return "";
            });
        } catch (err) {
            console.log("Error:", err);
        }
        const ownerFromParcel = parcelData.owner_name || "";
        const billingFromParcel = parcelData.property_address || "";

        const data = {
            owner_name: [ownerFromParcel || taxRaw.owner || ""],
            property_address: billingFromParcel || taxRaw.billing_address || "",
            parcel_number: parcelData.parcel_number || "",
            total_assessed_value:
                county === "ashland"
                    ? assessedTotal || "N/A"
                    : parcelData.total_assessed_value || "N/A",
            total_taxable_value:
                county === "ashland"
                    ? assessedTotal || "N/A"
                    : parcelData.total_assessed_value || "N/A",
            taxing_authority:
                county === "ashland"
                    ? "Ashland County Treasurer 1211 Claremont Ave Ashland, OH 44805"
                    : "Columbiana County Treasurer 105 South Market Street Lisbon, OH 44432 (330) 424-9516",
            tax_history: [],
            notes: "",
            delinquent: ""
        };
        // ==================================================
        // FULL PAYMENT OVERRIDE LOGIC
        // ==================================================
        const totalOwed = (taxRaw.firstHalf.base || 0) + (taxRaw.secondHalf.base || 0);
        const totalPaid = taxRaw.secondHalf.paid || 0;  // all payments stored in 2nd half column

        // Determine latest payment date (paid1 / paid2 may contain multiple)
        let fullPaymentDate = "";
        if (taxRaw.paid1 || taxRaw.paid2) {
            const dates = [taxRaw.paid1, taxRaw.paid2]
                .filter(Boolean)
                .map(d => new Date(fixShortDate(d)));

            if (dates.length) {
                const latest = new Date(Math.max(...dates));
                fullPaymentDate = latest.toLocaleDateString("en-US");
            }
        }

        // If total paid equals total owed → override statuses to PAID
        const fullyPaid = totalPaid >= totalOwed && totalOwed > 0;

        if (fullyPaid) {
            taxRaw.firstHalf.due = 0;
            taxRaw.secondHalf.due = 0;
        }
        // ---------------------------
        // BUILD TAX HISTORY ROWS
        // ---------------------------
        let paid1 = taxRaw.firstHalf.paid > 0 ? fixShortDate(taxRaw.paid1) : "";
        let paid2 = taxRaw.secondHalf.paid > 0 ? fixShortDate(taxRaw.paid2) : "";

        const buildRow = (half, paymentType, year, paidDate) => {
            const dueDateStr = paymentType === "1st Half" ? `02/21/${year + 1}` : `07/25/${year + 1}`;
            const delqDateStr = paymentType === "1st Half" ? `02/22/${year + 1}` : `07/26/${year + 1}`;

            let status;
            if (half.due <= 0 && half.paid > 0) {
                status = "Paid";
            }

            else {
                const today = new Date();
                const delqDate = new Date(delqDateStr);
                status = today > delqDate ? "Delinquent" : "Due";
            }
            // -----------------------
            // FULL PAYMENT OVERRIDE
            // -----------------------
            if (fullyPaid) {
                status = "Paid";
                paidDate = fullPaymentDate;
            }
            return {
                jurisdiction: "County",
                year: String(year),
                payment_type: "Semi-Annual",
                status,
                base_amount: `$${half.base.toFixed(2)}`,
                amount_paid: `$${half.paid.toFixed(2)}`,
                amount_due: `$${half.due.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: dueDateStr,
                delq_date: delqDateStr,
                paid_date: paidDate || "-",
                good_through_date: "N/A"
            };
        };
        data.tax_history = [
            buildRow(taxRaw.firstHalf, "1st Half", taxRaw.taxYear, paid1),
            buildRow(taxRaw.secondHalf, "2nd Half", taxRaw.taxYear, paid2)
        ];
        // Include previous year semi-annual rows
        if (taxRaw.previousYearRecords?.length) {
            data.tax_history.push(...taxRaw.previousYearRecords);
        }

        applyTaxNotes(data);
        return data;

    } catch (err) {
        console.log("ac_2 error:", err);
        throw err;
    }
};
// -------------------------------------------------------------
// ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, baseUrl, account, yearLimit) => {
    const detailUrl = await ac_1(page, baseUrl, account);
    const data = await ac_2(page, detailUrl, yearLimit);
    return data;
};
// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    const county = req.path.replace(/^\/+/, "");

    try {
        if (!["html", "api"].includes(fetch_type)) {
            return res.status(400).json({
                error: true,
                message: "Invalid Access"
            });
        }

        // 🔑 TOTAL years from config
        const totalYears = getOHCompanyYears(client);

        // 🔑 Convert TOTAL → PREVIOUS years
        const yearLimit = Math.max(totalYears - 1, 0);

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        );

        page.setDefaultNavigationTimeout(timeout_option.timeout);

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const countyBaseUrls = {
            ashland: "https://oh-ashland-auditor.publicaccessnow.com",
            columbiana: "https://oh-columbiana-auditor.publicaccessnow.com"
        };

        const baseUrl = countyBaseUrls[county];
        if (!baseUrl) {
            return res.status(400).json({
                error: true,
                message: `Invalid county provided: ${county}`
            });
        }

        const result = await account_search(page, baseUrl, account, yearLimit);

        if (fetch_type === "api") {
            res.status(200).json({ result });
        } else {
            res.status(200).render("parcel_data_official", result);
        }

        await context.close();
    } catch (error) {
        console.error(error);
        if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message });
        } else {
            res.status(200).render("error_data", { error: true, message: error.message });
        }
    }
};

module.exports = { search };