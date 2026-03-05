//Author:Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/05 06/20`;

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
    const priorsDelq =
        priors.some((x) => ["Delinquent", "Due"].includes(x.status)) ||
        Number(data.prior_owed_amount) > 0;


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

    // PRIOR delinquency should always force CALL FOR PAYOFF
    if (priorsDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }
    // CURRENT year delinquent
    else if (latest.status === "Delinquent") {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }
    // CURRENT year due (not delinquent yet)
    else if (latest.status === "Due") {
        data.delinquent = "YES";
    }
    // ALL PAID
    else {
        data.delinquent = "NONE";
    }


    return data;
};
// -----------------------------------------
// HAMILTON — STEP 1 (search by parcel ID)
// -----------------------------------------
const hc_1 = async (page, parcel) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto("https://wedge3.hcauditor.org/", {
                waitUntil: "networkidle2"
            });

            // Select "Parcel ID" radio
            await page.waitForSelector("#search_radio_parcel_id", { timeout: 90000 });
            await page.click("#search_radio_parcel_id");

            // Wait for input
            await page.waitForSelector("#parcel_number", { timeout: 90000 });

            // Enter parcel number
            await page.$eval("#parcel_number", el => el.value = "");
            await page.type("#parcel_number", String(parcel), { delay: 50 });

            // Click Search
            await page.click("#search_by_parcel_id > div:nth-child(3) > button");

            // Wait for load
            await page.waitForNavigation({ waitUntil: "networkidle2" });

            // Ensure parcel exists
            const url = page.url();
            if (!url.includes("/view/re/")) {
                return reject(new Error("Parcel not found"));
            }

            // ----- CLICK PAYMENT DETAIL TAB -----
            await page.waitForSelector("a[href$='payment_details']", { timeout: 90000 });

            await Promise.all([
                page.click("a[href$='payment_details']"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);

            // Return the payment detail page URL
            resolve(page.url());

        } catch (err) {
            console.log("hc_1 error:", err);
            reject(err);
        }
    });
};

// -----------------------------------------
// HAMILTON — STEP 2 (scrape parcel page)
// -----------------------------------------

const hc_2 = async (page, url, yearLimit = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2" });
            await page.waitForSelector("#parcel-header-info", { timeout: 90000 });

            // Parcel number & address
            const data = await page.evaluate(() => {
                const get = (sel) => document.querySelector(sel)?.innerText.trim() || "";
                const parcel = get("#parcel-header-info > div:nth-child(1)");
                const address = get("#parcel-header-info > div:nth-child(2)");
                return {
                    parcel_number: parcel.replace("Parcel ID", "").trim(),
                    property_address: address.replace("Address", "").trim(),
                };
            });

            // Owner Name
            const owner_name = await page.evaluate(() => {
                const el = document.querySelector(
                    "#ajaxDiv > div.billing_collection > table:nth-child(1) > tbody > tr > td:nth-child(1) > table:nth-child(3) > tbody > tr:nth-child(1) > td:nth-child(2)"
                );
                return el ? [el.innerText.replace(/\s+/g, " ").trim()] : [];
            });

            // Assessed Values
            const values = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll("#ajaxDiv > div.billing_collection > table:nth-child(1) table.datagrid tr"));
                let total = "";
                rows.forEach((r) => {
                    const tds = r.querySelectorAll("td");
                    if (tds.length === 2 && tds[0].innerText.includes("Total")) {
                        total = tds[1].innerText.trim();
                    }
                });
                return { total };
            });

            // Tax Info: Due / Paid / Owed
            const taxInfo = await page.evaluate(() => {
                const clean = (v) => Number(v.replace(/[^0-9.]/g, "")) || 0;
                const rows = Array.from(document.querySelectorAll("#ajaxDiv > div.billing_collection > table:nth-child(2) tr"));
                const getRow = (text) => rows.find((r) => r.innerText.includes(text));
                const extract = (row) => {
                    if (!row) return [0, 0];
                    const tds = row.querySelectorAll("td");
                    return [clean(tds[3]?.innerText || "0"), clean(tds[5]?.innerText || "0")];
                };
                const [due1, due2] = extract(getRow("Total Due"));
                const [paid1, paid2] = extract(getRow("Total Paid"));
                const [owed1, owed2] = extract(getRow("Total Owed"));
                return {
                    first: { due: due1, paid: paid1, owed: owed1 },
                    second: { due: due2, paid: paid2, owed: owed2 },
                    any_due: owed1 > 0 || owed2 > 0
                };
            });

            // Get all payments
            const payments = await page.evaluate(() => {
                const clean = (v) => Number(v.replace(/[^0-9.]/g, "")) || 0;
                const rows = Array.from(document.querySelectorAll("#ajaxDiv > div.billing_collection table.datagrid tr.right"));
                return rows.map((r) => {
                    const tds = r.querySelectorAll("td");
                    const date = tds[0]?.innerText.trim() || "";
                    const half = tds[1]?.innerText.trim();
                    const match = /(\d)\s*-\s*(\d{4})/.exec(half);
                    return {
                        date,
                        half_number: match ? Number(match[1]) : null,
                        year: match ? Number(match[2]) : null,
                        first_half_paid: clean(tds[3]?.innerText || "0"),
                        second_half_paid: clean(tds[4]?.innerText || "0")
                    };
                });
            });

            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;

            const tax_history = [];

            // -----------------------------
            // PRIOR YEAR (only if yearLimit = 2)
            // -----------------------------
            if (yearLimit === 2) {
                const previousYear = currentYear - 1;
                const prevYearPayments = payments.filter(p => p.year === previousYear);

                const priorYearDates = {
                    firstHalfDue: `02/05/${currentYear}`,
                    firstHalfDelq: `02/06/${currentYear}`,
                    secondHalfDue: `06/20/${currentYear}`,
                    secondHalfDelq: `06/21/${currentYear}`
                };

                const prevFirstHalf = prevYearPayments.find(p => p.half_number === 1);
                const prevSecondHalf = prevYearPayments.find(p => p.half_number === 2);

                const buildPriorRecord = (half, paymentObj) => {
                    const paidAmount = (paymentObj?.first_half_paid || 0) + (paymentObj?.second_half_paid || 0);
                    return {
                        jurisdiction: "County",
                        year: previousYear,
                        payment_type: "Semi-Annual",
                        status: paidAmount > 0 ? "Paid" : "Delinquent",
                        base_amount: `$${paidAmount.toFixed(2)}`,
                        amount_paid: `$${paidAmount.toFixed(2)}`,
                        amount_due: "$0.00",
                        mailing_date: "N/A",
                        due_date: half === 1 ? priorYearDates.firstHalfDue : priorYearDates.secondHalfDue,
                        delq_date: half === 1 ? priorYearDates.firstHalfDelq : priorYearDates.secondHalfDelq,
                        paid_date: paymentObj?.date || "-",
                        good_through_date: ""
                    };
                };

                if (prevYearPayments.length) {
                    tax_history.push(buildPriorRecord(1, prevFirstHalf));
                    tax_history.push(buildPriorRecord(2, prevSecondHalf));
                }
            }

            // -----------------------------
            // CURRENT YEAR
            // -----------------------------
            const currentYearData = {
                firstHalfDue: `02/05/${nextYear}`,
                firstHalfDelqDate: `02/06/${nextYear}`,
                secondHalfDue: `06/20/${nextYear}`,
                secondHalfDelqDate: `06/21/${nextYear}`
            };

            const firstHalfPayment = payments.find(p => p.year === currentYear && p.half_number === 1);
            const secondHalfPayment = payments.find(p => p.year === currentYear && p.half_number === 2);

            const firstHalfDelqDate = new Date(currentYearData.firstHalfDue);
            firstHalfDelqDate.setDate(firstHalfDelqDate.getDate() + 1);
            const secondHalfDelqDate = new Date(currentYearData.secondHalfDue);
            secondHalfDelqDate.setDate(secondHalfDelqDate.getDate() + 1);

            const getStatus = (owed, delqDate) => {
                if (owed <= 0) return "Paid";
                const today = new Date();
                return today > delqDate ? "Delinquent" : "Due";
            };

            const buildRecord = (half, paymentObj, baseAmount, paidAmount, owedAmount) => ({
                jurisdiction: "County",
                year: currentYear,
                payment_type: "Semi-Annual",
                status: getStatus(owedAmount, half === 1 ? firstHalfDelqDate : secondHalfDelqDate),
                base_amount: `$${baseAmount.toFixed(2)}`,
                amount_paid: `$${paidAmount.toFixed(2)}`,
                amount_due: (paidAmount > 0 ? "$0.00" : (`$${baseAmount.toFixed(2)}`)),
                mailing_date: "N/A",
                due_date: half === 1 ? currentYearData.firstHalfDue : currentYearData.secondHalfDue,
                delq_date: half === 1 ? currentYearData.firstHalfDelqDate : currentYearData.secondHalfDelqDate,
                paid_date: (owedAmount > 0 ? "-" : (paymentObj?.date || "-")),
                good_through_date: ""
            });

            tax_history.push(
                buildRecord(1, firstHalfPayment, taxInfo.first.due, taxInfo.first.paid, taxInfo.first.owed),
                buildRecord(2, secondHalfPayment, taxInfo.second.due, taxInfo.second.paid, taxInfo.second.owed)
            );

            const priorOwedAmount = await page.evaluate(() => {
                const clean = (v) => Number(v.replace(/[^0-9.]/g, "")) || 0;
                const rows = Array.from(document.querySelectorAll("table.tax_detail tr"));
                const totalOwedRow = rows.find(r => r.innerText.includes("Total Owed"));
                if (!totalOwedRow) return 0;
                const tds = totalOwedRow.querySelectorAll("td");
                return clean(tds[1]?.innerText || "0");
            });

            const finalData = {
                parcel_number: data.parcel_number,
                property_address: data.property_address,
                total_assessed_value: `$${Number(values.total.replace(/,/g, "")).toLocaleString()}`,
                total_taxable_value: `$${Number(values.total.replace(/,/g, "")).toLocaleString()}`,
                owner_name,
                tax_history,
                prior_owed_amount: priorOwedAmount,
                taxing_authority: "Hamilton County Treasurer, 138 E Court St, Cincinnati, OH 45202",
                delinquent: taxInfo.any_due ? "YES" : "NONE",
                notes: ""
            };

            if (typeof applyTaxNotes === "function") applyTaxNotes(finalData);

            resolve(finalData);

        } catch (error) {
            console.log("hc_2 error:", error);
            reject(error);
        }
    });
};




// -------------------------------------------------------------
// ORCHESTRATOR
// -------------------------------------------------------------

const account_search = async (page, parcel, yearLimit = 1) => {
    return new Promise((resolve, reject) => {

        hc_1(page, parcel)
            .then((url) => {
                // Pass yearLimit here
                hc_2(page, url, yearLimit)
                    .then((data) => {
                        resolve(data);   // <-- SUCCESS
                    })
                    .catch((error) => {
                        console.log("hc_2 error:", error.message);
                        reject(new Error(error.message));
                    });

            })
            .catch((error) => {
                console.log("hc_1 error:", error.message);
                reject(new Error(error.message));
            });

    });
};



// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {

            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }
        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        // await page.setViewport({ width: 1366, height: 768});
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account, yearLimit)
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
            account_search(page, account, yearLimit)
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