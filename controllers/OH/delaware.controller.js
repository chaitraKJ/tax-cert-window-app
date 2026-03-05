//Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const applyTaxNotes = (data) => {
    const suffix = ", NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/05 06/20";
    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +a.year - +b.year);
    const latest = list.at(-1);

    const priors = list.filter(x => x.year < latest.year);
    const anyDelq = list.some(x => x.status === "Delinquent");
    const priorsDelq = priors.some(x => ["Delinquent", "Due"].includes(x.status));

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

const delaware_1 = async (page, parcel) => {
    const TIMEOUT = 60000; // 60 seconds for all operations

    try {
        // Navigate to search page
        await page.goto("https://delaware-auditor-ohio.manatron.com/PropNum.aspx", {
            timeout: TIMEOUT,
            waitUntil: "networkidle2"
        });

        // Wait for parcel input field
        await page.waitForSelector("#owner", { timeout: TIMEOUT });

        // Clear and type parcel
        await page.$eval("#owner", el => el.value = "");
        await page.type("#owner", parcel, { delay: 50 });

        // Click search and wait for navigation
        await Promise.all([
            page.click('button[name="btnSearch"]'),
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: TIMEOUT })
        ]).catch(err => {
            throw new Error("Search navigation failed or timed out: " + err.message);
        });

        // Wait for Tax tab link
        await page.waitForSelector("#radioset label:nth-child(2) a", { timeout: TIMEOUT });

        const taxLink = await page.$eval("#radioset label:nth-child(2) a", el => el.href);

        // Go to tax details page
        await page.goto(taxLink, {
            timeout: TIMEOUT,
            waitUntil: "networkidle2"
        });

        return page.url();

    } catch (err) {
        console.error("delaware_1 error for parcel:", parcel, err.message);
        throw new Error(`Failed to navigate to tax page: ${err.message}`);
    }
};

const delaware_2 = async (page, url, yearLimit = 1) => {
    const TIMEOUT = 90000;

    try {
        await page.goto(url, {
            timeout: TIMEOUT,
            waitUntil: "networkidle2"
        });

        const data = await page.evaluate((yearLimit) => {
            const get = (sel) => document.querySelector(sel)?.innerText.trim() || "";
            const clean = (v) => parseFloat(v?.replace(/[\$,]/g, "") || "0");

            const property_address = get('#parcelbanner td[colspan="3"] font');
            const parcel_number = get('#parcelbanner tr:nth-child(2) td[colspan="2"] font');
            

            const owner_name = Array.from(
                document.querySelectorAll("#lxT613 div table.ui-widget-content tr")
            )
                .filter(tr => tr.children[0]?.innerText?.includes("Current Owner"))
                .map(tr => tr.children[1]?.innerText?.replace(/\s+/g, " ").trim())
                .filter(Boolean);

            // let assessed_value = "0";
            const assessed_value =
                Array.from(document.querySelectorAll("#lxT613 div table tbody tr"))
                    .find(tr => tr.children[2]?.innerText === "Total")
                    ?.children[3]?.innerText || "0";
            const summaryRows = Array.from(document.querySelectorAll("#lxT613 div table.ui-widget-content tbody tr"));
            // for (const tr of summaryRows) {
            //     const label = tr.children[0]?.innerText?.trim() || "";
            //     if (label.includes("Market Value") || label.includes("Assessed Value") || label.includes("Total Value")) {
            //         assessed_value = tr.children[1]?.innerText?.trim() || "0";
            //         break;
            //     }
            // }

            const paymentRows = Array.from(
                document.querySelectorAll("#lxT616 table.ui-widget-content tbody tr")
            );

            const currentYear = new Date().getFullYear();
            const taxYear = currentYear - 1;

            const payments = {
                current: { first: { amount: 0, date: "-" }, second: { amount: 0, date: "-" } },
                previous: { first: { amount: 0, date: "-" }, second: { amount: 0, date: "-" } }
            };

            paymentRows.forEach(tr => {
                const rawDate = tr.children[0]?.innerText.trim();
                if (!rawDate || !rawDate.includes("/")) return;

                const halfCode = tr.children[1]?.innerText.trim();
                if (!halfCode) return;

                const [m, d, yy] = rawDate.split("/").map(Number);
                const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
                const formattedDate = `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${fullYear}`;

                const firstAmt = clean(tr.children[3]?.innerText);
                const secondAmt = clean(tr.children[4]?.innerText);

                let target = null;
                if (fullYear === currentYear) {
                    target = halfCode.includes("1-") ? payments.current.first : payments.current.second;
                } else if (fullYear === currentYear - 1) {
                    target = halfCode.includes("1-") ? payments.previous.first : payments.previous.second;
                }

                if (target) {
                    if (halfCode.includes("1-") && firstAmt > 0) {
                        target.amount += firstAmt;
                        if (target.date === "-") target.date = formattedDate;
                    } else if (halfCode.includes("2-") && secondAmt > 0) {
                        target.amount += secondAmt;
                        if (target.date === "-") target.date = formattedDate;
                    }
                }
            });

            let base_1 = 0, base_2 = 0;
            const chargeRows = Array.from(document.querySelectorAll(
                '#lxT613 div:nth-child(5) table > tbody > tr > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td > table tbody tr'
            ));

            chargeRows.forEach(tr => {
                const desc = tr.children[0]?.innerText?.trim() || "";
                if (desc.includes("Total Owed")) {
                    base_1 = clean(tr.children[3]?.innerText);
                    base_2 = clean(tr.children[5]?.innerText);
                }
            });

            const due_1 = Math.max(0, base_1 - payments.current.first.amount);
            const due_2 = Math.max(0, base_2 - payments.current.second.amount);

            const paid_1 = payments.current.first.amount;
            const paid_2 = payments.current.second.amount;

            const firstHalfPaidDate = payments.current.first.date;
            const secondHalfPaidDate = payments.current.second.date;

            const today = new Date();
            const isDelinquent = (dueAmount, dueDateStr) => {
                const [mm, dd, yyyy] = dueDateStr.split("/").map(Number);
                const dueDate = new Date(yyyy, mm - 1, dd);
                return dueAmount > 0 && today > dueDate;
            };

            let tax_history = [];

            if (base_1 > 0 || base_2 > 0) {
                tax_history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Semi-Annual",
                    status: isDelinquent(due_1, `02/05/${currentYear}`) ? "Delinquent" : (due_1 > 0 ? "Due" : "Paid"),
                    base_amount: `$${base_1.toFixed(2)}`,
                    amount_paid: `$${paid_1.toFixed(2)}`,
                    amount_due: due_1 > 0 ? `$${due_1.toFixed(2)}` : "$0.00",
                    mailing_date: "N/A",
                    due_date: `02/05/${currentYear}`,
                    delq_date: `02/06/${currentYear}`,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });

                tax_history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type: "Semi-Annual",
                    status: isDelinquent(due_2, `06/20/${currentYear}`) ? "Delinquent" : (due_2 > 0 ? "Due" : "Paid"),
                    base_amount: `$${base_2.toFixed(2)}`,
                    amount_paid: `$${paid_2.toFixed(2)}`,
                    amount_due: due_2 > 0 ? `$${due_2.toFixed(2)}` : "$0.00",
                    mailing_date: "N/A",
                    due_date: `06/20/${currentYear}`,
                    delq_date: `06/21/${currentYear}`,
                    paid_date: secondHalfPaidDate,
                    good_through_date: ""
                });
            }

            if (payments.previous.first.amount > 0 || payments.previous.second.amount > 0) {
                const prevPaid1 = payments.previous.first.amount;
                const prevPaid2 = payments.previous.second.amount;

                tax_history.push({
                    jurisdiction: "County",
                    year: taxYear - 1,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: `$${prevPaid1.toFixed(2)}`,
                    amount_paid: `$${prevPaid1.toFixed(2)}`,
                    amount_due: "$0.00",
                    due_date: `02/05/${currentYear - 1}`,
                    delq_date: `02/06/${currentYear - 1}`,
                    paid_date: payments.previous.first.date,
                });

                tax_history.push({
                    jurisdiction: "County",
                    year: taxYear - 1,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: `$${prevPaid2.toFixed(2)}`,
                    amount_paid: `$${prevPaid2.toFixed(2)}`,
                    amount_due: "$0.00",
                    due_date: `06/20/${currentYear - 1}`,
                    delq_date: `06/21/${currentYear - 1}`,
                    paid_date: payments.previous.second.date,
                });
            }

            tax_history.sort((a, b) => b.year - a.year);
            const seenYears = new Set();
            const limitedTaxHistory = [];
            for (const row of tax_history) {
                if (!seenYears.has(row.year)) {
                    if (seenYears.size >= yearLimit) break;
                    seenYears.add(row.year);
                }
                limitedTaxHistory.push(row);
            }

            const result = {
                parcel_number,
                property_address,
                total_assessed_value: assessed_value,
                total_taxable_value: assessed_value,
                owner_name,
                tax_history: limitedTaxHistory,
                taxing_authority: "Delaware County Treasurer, Delaware, OH",
                delinquent: (due_1 > 0 || due_2 > 0) ? "YES" : "NONE",
                notes: ""
            };

            if (owner_name.length === 0 || assessed_value === "0" || (base_1 === 0 && base_2 === 0)) {
                result.notes = "DATA INCOMPLETE OR PARCEL NOT FOUND - VERIFY MANUALLY";
            }

            return result;

        }, yearLimit);

        if (typeof applyTaxNotes === "function") applyTaxNotes(data);

        return data;

    } catch (err) {
        console.error("delaware_2 error:", err.message);
        throw new Error(`Failed to extract tax data: ${err.message}`);
    }
};

const account_search = async (page, parcel, yearLimit = 1) => {
    const url = await delaware_1(page, parcel);
    return await delaware_2(page, url, yearLimit);
};

const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    let page = null;
    let context = null;

    try {
        if (!fetch_type || !["html", "api"].includes(fetch_type)) {
            return res.status(400).json({ error: true, message: "Invalid fetch_type" });
        }

        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        page = await context.newPage();
        // Critical: Set default timeout for all navigations
        // page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['stylesheet', 'font', 'image'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        const data = await account_search(page, account, yearLimit);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

    } catch (error) {
        console.error("Search failed for parcel:", account, error);

        const message = error.message.includes("Timeout") 
            ? "Page took too long to load. Site may be slow or parcel not found." 
            : error.message || "Unknown error occurred";

        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message });
        } else {
            res.status(504).json({ error: true, message });
        }
    } finally {
        if (context) await context.close().catch(() => {});
    }
};

export { search };