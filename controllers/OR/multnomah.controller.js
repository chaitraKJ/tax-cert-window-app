// Author: Sanam Poojitha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//
// ─── HELPERS ───────────────────────────────────────────────────────────────
//

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

//
// ─── APPLY TAX NOTE LOGIC ──────────────────────────────────────────────────
//

const applyTaxNotes = (data) => {
    const suffix = ", NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15 02/15 05/15";
    const history = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!history.length) {
        data.notes = "ALL PRIORS ARE PAID" + suffix;
        data.delinquent = "NONE";
        return data;
    }

    history.sort((a, b) => +a.year - +b.year);

    const latest = history.at(-1);
    if (!latest) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    const priors = history.filter(x => x.year < latest.year);
    const priorsUnpaid = priors.some(x => ["Delinquent", "Due"].includes(x.status));
    const anyDelq = history.some(x => x.status === "Delinquent");

    const priorsTxt = priorsUnpaid ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

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
            data.notes = `${latest.year} TAX STATUS UNKNOWN, PLEASE VERIFY MANUALLY.${suffix}`;
    }

    if (anyDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (latest.status === "Due" || priorsUnpaid) {
        data.delinquent = "YES";
    } else {
        data.delinquent = "NONE";
    }

    return data;
};

//
// ─── AC-1: Search / Open Parcel ────────────────────────────────────────────
//

async function ac_1(page, account) {
    try {
        const url = "https://multcoproptax.com/Property-Search-Subscribed";

        // FIXED: Safer navigation to avoid server timeouts
        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-US,en;q=0.9",
        });

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 })
            .catch(async (err) => {
                console.warn("[INFO] Initial page load failed, retrying...");
                await new Promise(r => setTimeout(r, 3000));
                await page.goto(url, { waitUntil: "load", timeout: 90000 });
            });

        await new Promise(r => setTimeout(r, 2000));

        // Handle disclaimer or modal popup if present
        try {
            const agreeBtn = await page.$("a.btn.btn-primary[data-dismiss='modal'], button#btnAgree, input[value='I Agree']");
            if (agreeBtn) {
                await agreeBtn.click();
                await new Promise(r => setTimeout(r, 1500));
                console.log("[INFO] Closed disclaimer modal");
            }
        } catch (e) {
            console.log("[INFO] No modal detected");
        }

        await page.waitForSelector(
            "#dnn_ctr442_MultnomahSubscriberView_SearchTextBox",
            { visible: true, timeout: 25000 }
        );

        await page.evaluate(() => {
            const el = document.querySelector("#dnn_ctr442_MultnomahSubscriberView_SearchTextBox");
            if (el) el.value = "";
        });

        await page.type(
            "#dnn_ctr442_MultnomahSubscriberView_SearchTextBox",
            String(account),
            { delay: 30 }
        );

        await page.click("#SearchButtonDiv");

        const hasRows = await softWait(page, "#grid tbody tr td");
        if (!hasRows) throw new Error("No results returned");

        const first = await page.$("#grid tbody tr td:first-child") || await page.$("#grid tbody tr");
        if (!first) throw new Error("Parcel rows missing");
        await first.click();

        await page.waitForSelector("#dnn_ctr380_View_tdPropertyID", {
            visible: true, timeout: 30000
        });

        return page.url();
    } catch (err) {
        logError("AC_1", err);
        throw new Error(`AC_1 failed: ${err.message}`);
    }
}

//
// ─── AC-2: Scrape Tax Data ─────────────────────────────────────────────────
//

async function ac_2(page) {
    try {
        await Promise.race([
            softWait(page, "#tblPropertyHeader"),
            softWait(page, "#dnn_ctr380_View_divOwnersLabel")
        ]);

        const data = await page.evaluate(() => {
            const get = (sel) => document.querySelector(sel)?.innerText.trim() || "";
            return {
                owner_name: [get("#dnn_ctr380_View_divOwnersLabel") || "N/A"],
                property_address: get("#dnn_ctr380_View_tdPropertyAddress") || "N/A",
                parcel_number:
                    get("#dnn_ctr380_View_tdPropertyID") ||
                    get("#dnn_ctr380_View_tdAccountNumber") ||
                    "N/A",
                total_assessed_value: get("#dnn_ctr380_View_tdTotalAssessedValue") || "$0.00",
                total_taxable_value: get("#dnn_ctr380_View_tdTotalAssessedValue") || "$0.00",
                taxing_authority:` Multnomah County DART (Department of Assessment, Recording, and Taxation) - Assessment and Taxation office, 1501 SE Hawthorne Blvd #175, Portland, OR 97214`,
                tax_history: [],
                notes: "",
                delinquent: ""
            };
        });

        const billsTab = await page.$("#tabBills");
        if (billsTab) await billsTab.click();

        const hasBills = await softWait(
            page,
            "#dnn_ctr380_View_divBills table.fullWidthTable, #dnn_ctr380_View_divBillDetails table.fullWidthTable"
        );

        if (!hasBills) {
            const yr = new Date().getFullYear();
            data.tax_history = [
                {
                    jurisdiction: "County",
                    year: String(yr),
                    base_amount: "$0.00",
                    amount_paid: "$0.00",
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    payment_type: "Annual",
                    due_date: `11/15/${yr}`,
                    delq_date: `05/16/${yr + 1}`,
                    status: "Unknown"
                }
            ];
            return applyTaxNotes(data);
        }

        const bills = await page.$$eval(
            "#dnn_ctr380_View_divBills table.fullWidthTable tbody, #dnn_ctr380_View_divBillDetails table.fullWidthTable tbody",
            (tbodies) => {
                const list = [];
                tbodies.forEach((tbody) => {
                    let year = null;
                    tbody.querySelectorAll("tr").forEach((row) => {
                        const tds = row.querySelectorAll("td");

                        if (row.classList.contains("billsTaxYearRow") && tds.length >= 8) {
                            const owed = parseFloat(tds[7].innerText.replace(/[$,]/g, "")) || 0;
                            year = tds[0].innerText.trim();
                        }

                        if (!year) return;
                        if (!row.classList.contains("installmentRow")) return;

                        const billed = tds[1].innerText.trim();
                        const owed = tds[7].innerText.trim();
                        const num = parseFloat(owed.replace(/[$,]/g, "")) || 0;
                        const paidDateRaw = (tds[6]?.innerText.trim()) || "";
                        const hasPaidDate = paidDateRaw && paidDateRaw !== "-" && /\d{2}-\d{2}-\d{4}/.test(paidDateRaw);
                        if (!owed && !hasPaidDate) return;
                        
                        const trimester =
                            /1/.test(tds[0].innerText) ? "Trimester 1"
                                : /2/.test(tds[0].innerText) ? "Trimester 2"
                                    : "Trimester 3";

                        const y = Number(year);
                        const due =
                            trimester === "Trimester 1" ? `11/17/${y}` :
                            trimester === "Trimester 2" ? `02/17/${y + 1}` :
                            `05/15/${y + 1}`;

                        const delq_date =
                            trimester === "Trimester 1" ? `11/18/${y}` :
                            trimester === "Trimester 2" ? `02/18/${y + 1}` :
                            `05/16/${y + 1}`;
                            let paid_date = "";

                        if (hasPaidDate) {
                            paid_date = paidDateRaw.replace(/-/g, "/"); 
                        }


                        list.push({
                            jurisdiction: "County",
                            year,
                            base_amount: billed,
                            amount_due: owed,
                            amount_paid: "$0.00",
                            paid_date,
                            payment_type: trimester,
                            mailing_date: "N/A",
                            due_date: due,
                            delq_date:delq_date
                        });
                    });
                });
                return list;
            }
        );

        const now = new Date();
        bills.forEach((b) => {
            const amt = parseFloat(b.amount_due.replace(/[$,]/g, "")) || 0;
            const delq = new Date(`${+b.year + 1}-05-16T00:00:00`);

            if (!amt) {
                b.status = "Paid";
            } else if (now >= delq) {
                b.status = "Delinquent";
            } else {
                b.status = "Due";
            }
        });

        // Determine latest year
        const latestYear = Math.max(...bills.map(b => +b.year));
        const latest = bills.filter(b => +b.year === latestYear);

        //  Check if latest year fully paid
        const latestPaid = latest.every(b => {
            const amt = parseFloat(b.amount_due.replace(/[$,]/g, "")) || 0;
            return amt === 0;
        });

        if (latestPaid) {
            // Return only latest year
            latest.forEach(b => {
                b.status = "Paid";
                b.amount_paid = b.base_amount || "$0.00";
                b.amount_due = "$0.00";
                
            });
            data.tax_history = latest;
            data.delinquent = "NONE";
        }

        else {
            // Return only unpaid (due/delinquent)
            const notPaid = bills.filter(b => {
                const amt = parseFloat(b.amount_due.replace(/[$,]/g, "")) || 0;
                return amt > 0;
            });

            data.tax_history = notPaid;

            if (notPaid.some(b => b.status === "Delinquent")) {
                data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            } else {
                data.delinquent = "YES";
            }
        }

        return applyTaxNotes(data);
    } catch (err) {
        logError("AC_2", err);
        throw new Error(`AC_2 failed: ${err.message}`);
    }
}

//
// ─── COMBINED SEARCH ───────────────────────────────────────────────────────
//

async function accountSearch(page, account) {
    try {
        await ac_1(page, account);
        return await ac_2(page);
    } catch (err) {
        logError("ACCOUNT_SEARCH", err);
        throw new Error(`Account search failed: ${err.message}`);
    }
}

//
// ─── EXPRESS HANDLER ───────────────────────────────────────────────────────
//

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser;

    try {
        if (!account) {
            return res.status(400).json({ error: "account must be provided" });
        }
        if (!["html", "api"].includes(fetch_type)) {
            return res.status(400).json({ error: "Invalid fetch_type, must be 'html' or 'api'" });
        }

        browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        );
        await page.setDefaultNavigationTimeout(90000);

        // Block images/fonts to save bandwidth
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "font"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const data = await accountSearch(page, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else if (fetch_type === "api") {
            res.status(200).json({ result: data });
        }

        await context.close();
    } catch (error) {
        if (fetch_type === "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message
            });
        } else {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

module.exports = { search };