// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import PDFParser from "pdf2json";

// --- Utility Helpers ---
const parseDollar = (str) => {
    const numericString = str.replace(/[$,]/g, "").trim();
    return parseFloat(numericString) || 0;
};

const determineStatusByDate = (dueDateStr, delqDateStr) => {
    const today = new Date();
    const dueDate = new Date(dueDateStr);
    const delqDate = new Date(delqDateStr);

    if (today < dueDate) return "Due";
    if (today >= dueDate && today < delqDate) return "Unpaid";
    return "Delinquent";
};

// --- Tax Notes Updater ---
function updateTaxNotes(data, isTrimester = false) {
    if (!data.tax_history || data.tax_history.length === 0) {
        data.notes = `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ${isTrimester ? "TRIMESTERLY" : "ANNUALLY/TRIMESTERLY"}, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = "NONE";
        return data;
    }

    data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

    const latestRecord = data.tax_history[data.tax_history.length - 1];
    const latestYear = latestRecord.year;
    const latestStatus = latestRecord.status;
    const priorDelinquentExists = data.tax_history
        .slice(0, -1)
        .some(r => r.status === "Delinquent");

    if (latestStatus === "Paid") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else {
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "NONE";
        }
    } else if (latestStatus === "Delinquent") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ALSO DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        } else {
            data.notes = `PRIOR YEAR TAXES ARE PAID, ${latestYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        }
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (latestStatus === "Unpaid" || latestStatus === "Due") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else {
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "YES";
        }
        
    } else {
        data.notes = `${latestYear} TAX STATUS UNKNOWN`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }

    return data;
}


// --- STEP 1: Account Search ---
const ac_1 = async (page, account, url) => {
    try {
        // Go to the main county tax site
        await page.goto(url, { waitUntil: "domcontentloaded" });

        // Wait and select "TaxAccountId"
        await page.waitForSelector("select.custom-select", { timeout: 15000 });
        await page.select("select.custom-select", "TaxAccountId");

        // Enter the account number
        await page.waitForSelector("input.form-control", { timeout: 15000 });
        await page.type("input.form-control", account, { delay: 25 });

        // Click search and wait for navigation
        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            page.click("button.btn.btn-primary"),
        ]);

        // Wait until either the detail banner or account link is visible
        await page.waitForFunction(
            () =>
                document.querySelector("#MainContent_lblAccountBanner") ||
                document.querySelector("a.hel_account-link"),
            { timeout: 15000 }
        );

        // Check if we are already on the detail page
        const onDetail = await page.$("#MainContent_lblAccountBanner");
        if (onDetail) return page.url();

        // Otherwise, extract the property detail URL
        const detailUrl = await page.evaluate(() => {
            const link = document.querySelector("a.hel_account-link");
            return link ? link.getAttribute("href") : null;
        });

        if (!detailUrl)
            throw new Error(`No property detail link found for account ${account}`);

        return new URL(detailUrl, url).href;
    } catch (err) {
        throw new Error(`ac_1 failed: ${err.message}`);
    }
};

// --- STEP 2: Property Info ---
const ac_2 = async (page, detailUrl, county) => {
    try {
        await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#account", { timeout: 15000 });

        // scrape owner + property address
        const accountData = await page.$eval("#account", (accountTab) => {
            const data = { owner_name: [], property_address: "" };
            const containers = accountTab.querySelectorAll(".border.rounded.p-4.mt-2");

            containers.forEach((container) => {
                const getTextAfterLabel = (labelRegex) => {
                    const el = Array.from(container.querySelectorAll("span.font-weight-bold"))
                        .find((el) => labelRegex.test(el.textContent));
                    if (!el) return "";
                    let sibling = el.nextElementSibling;
                    while (sibling && !sibling.textContent.trim()) sibling = sibling.nextElementSibling;
                    return sibling?.textContent.trim().replace(/\n\s*/g, " ") || "";
                };

                const owner = getTextAfterLabel(/Owner/i);
                if (owner) data.owner_name.push(owner);

                const propAddr = getTextAfterLabel(/Situs Address/i);
                if (propAddr) data.property_address = propAddr;
            });

            return data;
        });

        // values tab
        const valuesTab = await page.$("#values-tab");
        if (valuesTab) {
            await valuesTab.click();
            await page.waitForSelector("#values table tbody tr", { timeout: 15000 });
        }

        const valuesData = await page.$eval("#values table tbody tr", (row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 4) return {};
            return { total_assessed_value: cells[3].textContent.trim() };
        });

        // parcel number
        const parcelNumber = await page.evaluate(() => {
            const h3 = document.querySelector("h3");
            if (h3) {
                const match = h3.innerText.match(/Account\s+(\d+)/);
                if (match) return match[1];
            }
            return "";
        });

        // taxing authority
        let taxing_authority = "";
        const countyName = (county || "").toLowerCase();
        if (countyName.includes("jackson")) {
            taxing_authority = "Jackson County Tax Collector, Oregon";
        } else if (countyName.includes("jefferson")) {
            taxing_authority = "Jefferson County Tax Collector, Oregon";
        }
         else if (countyName.includes("linn")) {
            taxing_authority = "Linn County Tax Collector, Oregon";
        }

        return {
            owner_name: accountData.owner_name || [],
            property_address: accountData.property_address || "",
            taxing_authority,
            parcel_number: parcelNumber || "",
            total_assessed_value: valuesData.total_assessed_value || "",
            total_taxable_value: valuesData.total_assessed_value || "",
            tax_history: [],
            notes: "",
            delinquent: "N/A",
        };
    } catch (error) {
        throw new Error(`ac_2 failed: ${error.message}`);
    }
};

// --- STEP 3: Paid History ---
const ac_paid = async (page, data) => {
    try {
        const taxesTab = await page.$("#taxes-tab");
        if (!taxesTab) throw new Error("Taxes tab not found");

        const isActive = await page.evaluate((el) => el.classList.contains("active"), taxesTab);
        if (!isActive) {
            await taxesTab.click();
            await page.waitForSelector("#taxes.show", { timeout: 10000 });
        }

        const payButtonHandle = await page.evaluateHandle(() => {
            return [...document.querySelectorAll("button")].find((b) =>
                b.innerText.includes("Payment History")
            );
        });
        if (!payButtonHandle) throw new Error("Payment History button not found");
        await page.evaluate((button) => button.click(), payButtonHandle);

        await page.waitForFunction(() => {
            const table = document.querySelector("#paymentHistoryModal #payment-history");
            return table && table.querySelectorAll("tbody tr").length > 0;
        }, { timeout: 10000 });

        // Fetch all payments
        let hist = await page.evaluate(() => {
            const table = document.querySelector("#payment-history");
            if (!table) return [];
            return [...table.querySelectorAll("tbody tr")]
                .map((row) => {
                    const cells = row.querySelectorAll("td");
                    if (!cells || cells.length < 4) return null;
                    const taxYear = parseInt(cells[0].innerText.trim());
                    const paid_date = cells[2].innerText.trim();
                    const amount = cells[3].textContent.trim();
                    return { year: taxYear, paid_date, amount };
                })
                .filter(Boolean);
        });

        if (hist.length === 0) {
            data.tax_history = [];
            data.notes = "ALL PRIORS ARE PAID";
            data.delinquent = "NONE";
            return data;
        }

        const latestYear = Math.max(...hist.map((t) => t.year));
        hist = hist.filter((t) => t.year === latestYear);

        // Assign tax year consistently for all trimesters
        const taxYear = latestYear;

        hist = hist.map((t) => {
            if (hist.length === 1) {
                t.payment_type = "Annual";
                t.due_date = `11/15/${taxYear}`;
                t.delq_date = `11/16/${taxYear}`;
            } else {
                const month = new Date(t.paid_date).getMonth() + 1;

                if (month >= 7 && month <= 11) {
                    t.payment_type = "Trimester #1";
                    t.due_date = `11/15/${taxYear}`;
                    t.delq_date = `11/16/${taxYear}`;
                } else if (month >= 1 && month <= 2) {
                    t.payment_type = "Trimester #2";
                    t.due_date = `02/15/${taxYear + 1}`;
                    t.delq_date = `02/16/${taxYear + 1}`;
                } else {
                    t.payment_type = "Trimester #3";
                    t.due_date = `05/15/${taxYear + 1}`;
                    t.delq_date = `05/16/${taxYear + 1}`;
                }
            }

            const today = new Date();
            t.status = t.paid_date ? "Paid" : determineStatusByDate(t.due_date, t.delq_date);
            t.base_amount = t.amount;
            t.amount_paid = t.amount;
            t.amount_due = "$0.00";
            t.jurisdiction = "county";
            t.mailing_date = "N/A";
            t.good_through_date = "";
            t.year = taxYear; // ensure year is consistent
            return t;
        });

        const sortOrder = { "Annual": 0, "Trimester #1": 1, "Trimester #2": 2, "Trimester #3": 3 };
        hist.sort((a, b) => (sortOrder[a.payment_type] || 0) - (sortOrder[b.payment_type] || 0));

        data.tax_history = hist;
        data.notes = `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${hist[hist.length - 1].status},  TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATENORMALLYS ARE 11/15 02/15 05/15`;
        data.delinquent = hist.some((t) => t.status === "DUE") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        return data;
    } catch (err) {
        throw new Error(`ac_paid failed: ${err.message}`);
    }
};




// STEP 4 – PDF Unpaid Check
const pdf_recent = async (page, data) => {
    const MIN_TAX_AMOUNT = 10.00;

    try {
        // --- Ensure the Taxes tab is active ---
        const taxesTabSelector = 'a#taxes-tab';
        const taxesTab = await page.$(taxesTabSelector);
        if (taxesTab) {
            const isActive = await page.$eval(taxesTabSelector, el => el.classList.contains('active'));
            if (!isActive) {
                await taxesTab.click();
                await page.waitForSelector('div.btn-block.btn-group-vertical', { timeout: 8000 }).catch(() => { });
            }
        }

        // --- Locate Tax Summary link ---
        const pdfLink = await page.evaluate(() => {
            const summary = document.querySelector('div.btn-block a[href*="report=TaxSummary"]');
            if (summary) return summary.href;
            const statement = document.querySelector('div.btn-block a[href*="report=TaxStatement"]');
            if (statement) return statement.href;
            const generalLink = document.querySelector('a[href*="TaxSummary"]');
            return generalLink ? generalLink.href : null;
        });

        if (!pdfLink) {
            data.notes = "No Tax Summary PDF link found in Reports section. Cannot fully determine delinquency.";
            return data;
        }

        // --- Fetch PDF ---
        const pdfBuffer = await page.evaluate(async url => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const arr = await res.arrayBuffer();
                return Array.from(new Uint8Array(arr));
            } catch {
                return null;
            }
        }, pdfLink);

        if (!pdfBuffer) {
            data.notes = "Failed to fetch or parse Tax Summary PDF.";
            return data;
        }

        // --- Parse PDF ---
        const pdfParser = new PDFParser();
        pdfParser.parseBuffer(Buffer.from(pdfBuffer));

        const parsedData = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", err => reject(err.parserError));
            pdfParser.on("pdfParser_dataReady", pdf => {
                const texts = [];
                pdf.Pages.forEach(p => p.Texts.forEach(t => {
                    if (t.R && t.R[0] && t.R[0].T) texts.push(decodeURIComponent(t.R[0].T));
                }));
                resolve(texts);
            });
        });

        // --- Extract Tax Data ---
        const dollarRegex = /\$\d[\d,]*\.?\d*/;
        const yearRegex = /\b(20\d{2})\b/;
        const uniqueKeyMap = new Map();

        for (let i = 0; i < parsedData.length; i++) {
            const yearMatch = parsedData[i].match(yearRegex);
            if (!yearMatch) continue;
            if (i + 1 < parsedData.length && !parsedData[i + 1].toUpperCase().includes("ADVALOREM")) continue;

            const year = yearMatch[1];
            let dollarCount = 0;
            let totalDue = "$0.00";
            let originalDue = "$0.00";

            for (let j = i + 1; j < i + 15 && j < parsedData.length; j++) {
                const amountMatch = parsedData[j].match(dollarRegex);
                if (amountMatch) {
                    dollarCount++;
                    if (dollarCount === 1) totalDue = amountMatch[0];
                    if (dollarCount === 5) {
                        originalDue = amountMatch[0];
                        break;
                    }
                }
                if (j > i + 1 && parsedData[j].match(yearRegex)) break;
            }

            const numTotalDue = parseDollar(totalDue);
            const numOriginalDue = parseDollar(originalDue);

            if (numTotalDue > MIN_TAX_AMOUNT && numOriginalDue > 0.00) {
                const dueDate = `11/15/${year}`;
                const delqDate = `11/16/${year}`;
                const status = determineStatusByDate(dueDate, delqDate);
                const uniqueKey = `${year}-${originalDue}`;

                if (!uniqueKeyMap.has(uniqueKey)) {
                    uniqueKeyMap.set(uniqueKey, {
                        jurisdiction: "County",
                        year,
                        payment_type: "Annual",
                        status,
                        base_amount: originalDue,
                        amount_paid: "$0.00",
                        amount_due: totalDue,
                        mailing_date: "N/A",
                        due_date: dueDate,
                        delq_date: delqDate,
                        paid_date: "",
                        good_through_date: "",
                    });
                }
            }
        }

        // --- Finalize in ascending order (2024 → 2025) ---
        data.tax_history = Array
            .from(uniqueKeyMap.values())
            .sort((a, b) => Number(a.year) - Number(b.year));


        data = updateTaxNotes(data, false);
        delete data.current_amount_due;

        return data;

    } catch (err) {
        console.error(`pdf_recent failed for URL ${page.url()}: ${err.message}`);
        delete data.current_amount_due;
        data.notes = "Unable to process Tax Summary PDF. Could not determine delinquency status.";
        data.delinquent = "UNKNOWN";
        return data;
    }
};


// --- STEP 5: Orchestrator ---
const account_search = async (page, account, url, county) => {
    const detailUrl = await ac_1(page, account, url);

    let data = await ac_2(page, detailUrl, county);
    data = await pdf_recent(page, data);

    // If no tax history, fetch paid data
    if (!data.tax_history || data.tax_history.length === 0) {
        data = await ac_paid(page, data);
        data = updateTaxNotes(data, true);
    }

    return data;
};


// --- STEP 6: Express Handler ---
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    const county = req.path.replace(/^\/+/, "");
    if (!account) return res.status(400).json({ error: true, message: "Missing account" });
    if (!county) return res.status(400).json({ error: true, message: "Missing county" });

    let browser;
    try {
        const countyUrls = {
            jackson: "https://apps.jacksoncountyor.gov/pso/",
            jefferson: "https://query.co.jefferson.or.us/PSO/",
            linn:"https://lc-helionweb.co.linn.or.us/pso/",
        };
        const url = countyUrls[county];
        if (!url) throw new Error(`Unknown county: ${county}`);

        browser = await getBrowserInstance();
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setUserAgent("Mozilla/5.0");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const handler = async () => await account_search(page, account, url, county);

        if (fetch_type === "html") {
            handler()
                .then((result) => res.status(200).render("parcel_data_official", result))
                .catch((error) => res.status(500).render("error_data", { error: true, message: error.message }))
                .finally(async () => await ctx.close());
        } else if (fetch_type === "api") {
            handler()
                .then((result) => res.status(200).json({ result }))
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(async () => await ctx.close());
        }
    } catch (error) {
        if (fetch_type === "html") {
            res.status(500).render("error_data", { error: true, message: error.message });
        } else if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };