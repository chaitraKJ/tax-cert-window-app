// Author: Sanam Poojitha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const TIMEOUT = 90000;


/* -----------------------------------------------------------
   APPLY TAX NOTES
----------------------------------------------------------- */
const applyTaxNotes = (data) => {
    const suffix = `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 09/30 03/31`;

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
    else if (priorsDelq || latest.status === "Due") data.delinquent = "NONE";
    else data.delinquent = "NONE";

    return data;
};


/* -----------------------------------------------------------
   STEP 1 — SEARCH PARCEL (ENTER, CLICK, OPEN TAX PAGE)
----------------------------------------------------------- */

const pc_1 = async (page, parcel) => {
    const TIMEOUT = 90000;

    try {
        // -------------------- Open Search --------------------
        await page.goto("https://taxsearch.polkcountyiowa.gov/Search", {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUT
        });

        // -------------------- Accept Disclaimer --------------------
        await page.waitForSelector("#disclaimerAgreement", { visible: true });
        await page.click("#disclaimerAgreement");
        await page.click("#disclaimerCloseBtn");

        // -------------------- Search by Parcel --------------------
        await page.waitForSelector("#SearchModel_searchType", { timeout: TIMEOUT });
        await page.select("#SearchModel_searchType", "0");

        await page.waitForSelector("#SearchModel_searchTerm", { timeout: TIMEOUT });
        await page.evaluate(() => {
            document.querySelector("#SearchModel_searchTerm").value = "";
        });
        await page.type("#SearchModel_searchTerm", String(parcel));

        await Promise.all([
            page.click("button[type='submit']"),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: TIMEOUT })
        ]);

        // -------------------- Open Parcel --------------------
        await page.waitForSelector("#selectionTable tbody tr td:nth-child(3) a", {
            timeout: TIMEOUT
        });

        await Promise.all([
            page.click("#selectionTable tbody tr td:nth-child(3) a"),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: TIMEOUT })
        ]);

        if (!page.url().toLowerCase().includes("parcelinformation")) {
            throw new Error("Parcel page not reached");
        }


        // -------------------- Build Installments & Payments URLs --------------------
        const parcelUrl = page.url();
        const parsed = new URL(parcelUrl);
        const q = parsed.searchParams.get("q");

        if (!q) {
            throw new Error("Missing parcel token (q)");
        }

        const base = "https://taxsearch.polkcountyiowa.gov/RealEstate";

        // Treasurer
        const installmentsUrl = `${base}/AllRealEstateInstallments?q=${q}`;
        const paymentsUrl = `${base}/AllRealEstatePayments?q=${q}`;




        return {
            installments_url: installmentsUrl,
            payments_url: paymentsUrl

        };


    } catch (err) {
        console.error("pc_1 error:", err);
        throw err;
    }
};


/* -----------------------------------------------------------
   STEP 2 — SCRAPE TAX DATA & FORCE SEMI-ANNUAL FORMAT
----------------------------------------------------------- */
const pc_2 = async (page, urls) => {
    const TIMEOUT = 90000;

    try {
        // ======================================================
        // INSTALLMENTS PAGE
        // ======================================================
        await page.goto(urls.installments_url, {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUT
        });

        await page.waitForSelector(".parcel-container.alternating-rows", {
            timeout: TIMEOUT
        });

        // -------------------- Parcel Info --------------------
        const parcelInfo = await page.evaluate(() => {
            const txt = sel =>
                document.querySelector(sel)?.innerText?.trim() ||
                document.querySelector(sel)?.value ||
                "";

            return {
                parcel_number: txt("#ParcelInformationModel_PIN"),
                property_address: txt("#ParcelInformationModel_PropertyAddress"),
                owner_name: txt("#ParcelInformationModel_TitleHolder1")
                    ? [txt("#ParcelInformationModel_TitleHolder1")]
                    : []
            };
        });
        // -------------------- Assessed / Taxable Value --------------------
        const assessorLink = await page.evaluate(() => {
            const a = Array.from(document.querySelectorAll("a[href]"))
                .find(x => x.href.includes("assess.co.polk.ia.us/cgi-bin/web/tt/infoqry.cgi"));
            return a ? a.href : null;
        });

        let assessedValue = "";
        let taxableValue = "";

        if (assessorLink) {
            const assessorPage = await page.browser().newPage();

            await assessorPage.goto(assessorLink, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUT
            });

            await assessorPage.waitForSelector("#grid_vals table", {
                timeout: TIMEOUT
            }).catch(() => null);

            const values = await assessorPage.evaluate(() => {
                const get = (r, c) => {
                    const cell = document.querySelector(
                        `#grid_vals table tbody tr:nth-child(${r}) td:nth-child(${c})`
                    );
                    return cell ? cell.innerText.trim() : "";
                };

                return {
                    assessed: get(1, 6),
                    taxable: get(2, 6)
                };
            });

            assessedValue = values.assessed || "";
            taxableValue = values.taxable || "";

            await assessorPage.close();
        }


        // -------------------- Installment Data --------------------
        const taxYears = await page.evaluate(() => {
            const rows = Array.from(
                document.querySelector(".parcel-container.alternating-rows")?.children || []
            );

            const years = [];
            let current = null;

            const num = t => parseFloat(t.replace(/[^0-9.-]/g, "")) || 0;

            for (const row of rows) {
                if (row.classList.contains("blue")) {
                    const y = row.querySelector(".orange-display")?.innerText?.trim();
                    if (y) {
                        current = { year: y, installments: {} };
                        years.push(current);
                    }
                    continue;
                }

                if (!current) continue;

                const label = row.querySelector(".col-md-2:not(.text-right)")?.innerText || "";
                const cols = row.querySelectorAll(".col-md-2.col-xs-6.text-right");
                if (cols.length < 5) continue;

                const amount = num(cols[3].innerText);
                const date = cols[4].innerText.trim();

                const inst =
                    label.includes("(1)") ? "first" :
                        label.includes("(2)") ? "second" : null;

                if (!inst) continue;

                if (label.includes("Original")) {
                    current.installments[`${inst}_original`] = {
                        base: amount,
                        due_date: date
                    };
                }

                if (label.includes("Payments")) {
                    const link = row.querySelector("a.fa-book")?.href || null;
                    current.installments[`${inst}_payments`] = {
                        paid: amount,
                        link
                    };
                }
            }

            return years;
        });

        const latest = taxYears.sort((a, b) => b.year - a.year)[0];
        if (!latest) throw new Error("No tax history found");

        // ======================================================
        // PAYMENTS PAGE (FETCH PAID DATES)
        // ======================================================
        const paymentPage = await page.browser().newPage();

        for (const inst of ["first", "second"]) {
            const p = latest.installments[`${inst}_payments`];
            if (!p?.link) continue;

            await paymentPage.goto(p.link, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUT
            });

            const paidDate = await paymentPage.evaluate(instNum => {
                const rows = document.querySelectorAll("#real-estate-payments .row.clear");
                for (const r of rows) {
                    const cols = r.querySelectorAll("div");
                    if (cols[1]?.innerText?.trim() === instNum) {
                        return cols[cols.length - 1]?.innerText?.trim() || "N/A";
                    }
                }
                return "N/A";
            }, inst === "first" ? "1" : "2");

            p.paid_date = paidDate;
        }

        await paymentPage.close();

        // ======================================================
        // FORMAT OUTPUT
        // ======================================================
        const today = new Date();
        const fmt = d => {
            const x = new Date(d);
            return isNaN(x) ? "N/A" :
                `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()}`;
        };

        const status = (owed, due) => {
            if (owed <= 0) return "Paid";
            return today > new Date(due) ? "Delinquent" : "Due";
        };

        const history = [];

        for (const inst of ["first", "second"]) {
            const o = latest.installments[`${inst}_original`] || {};
            const p = latest.installments[`${inst}_payments`] || {};

            const owed = Math.max(0, (o.base || 0) - (p.paid || 0));

            history.push({
                jurisdiction: "County",
                year: parseInt(latest.year),
                payment_type: "Semi-Annual",
                status: status(owed, o.due_date),
                base_amount: `$${(o.base || 0).toFixed(2)}`,
                amount_paid: `$${(p.paid || 0).toFixed(2)}`,
                amount_due: `$${owed.toFixed(2)}`,
                due_date: o.due_date || "N/A",
                delq_date: fmt(o.due_date),
                paid_date: p.paid > 0 ? p.paid_date : "-",
                good_through_date: "N/A",
                mailing_date:"N/A"
            });
        }
        let data = {
            parcel_number: parcelInfo.parcel_number,
            property_address: parcelInfo.property_address,
            total_assessed_value: assessedValue,
            total_taxable_value: assessedValue,
            owner_name: parcelInfo.owner_name,
            tax_history: history,
            taxing_authority:
                "Polk County Treasurer, 111 Court Ave, Des Moines, IA 50309",
            delinquent: "NONE",
            notes: ""
        };

        data = applyTaxNotes(data);
        return data;


    } catch (err) {
        console.error("pc_2 error:", err);
        throw err;
    }
};



/* -----------------------------------------------------------
   ORCHESTRATOR (MATCHES HAMILTON EXACTLY)
----------------------------------------------------------- */
const account_search = async (page, parcel) => {
    try {
        const url = await pc_1(page, parcel);
        const data = await pc_2(page, url);
        return data;
    } catch (err) {
        throw new Error(err.message);
    }
};


/* -----------------------------------------------------------
   EXPRESS HANDLER 
----------------------------------------------------------- */
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {

            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        // await page.setViewport({ width: 1366, height: 768});
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if ( req.resourceType() === 'stylesheet' ||req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error)
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                })
        }
        else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    })
                })
                .catch((error) => {
                    console.log(error)
                    res.status(500).json({
                        error: true,
                        message: error.message
                    })
                })
                .finally(async () => {
                    await context.close();
                })
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}


export { search };
