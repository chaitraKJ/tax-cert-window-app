// Author: Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 };

// -------------------------
// HELPERS
// -------------------------
const formatAmount = (val) => {
    if (!val || val.trim() === "" || val.trim() === "$0") return "$0.00";
    const num = parseFloat(val.replace(/[$,]/g, ""));
    return `$${num.toFixed(2)}`;
};

const applyTaxNotes = (data) => {
    const suffix =
        ", NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 11/15 DELQ DATE IS 11/16, CITY TAX NEEDS TO CONFIRM";

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +b.year - +a.year);

    const latest = list[0];
    const priors = list.slice(1);

    const priorsDelq = priors.some(x =>
        ["Delinquent", "Due"].includes(x.status)
    );

    const priorsTxt = priorsDelq
        ? "PRIORS ARE DELINQUENT"
        : "ALL PRIORS ARE PAID";

    if (latest.status === "Paid") {
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
    } else if (latest.status === "Delinquent") {
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
    } else {
        data.notes = `${priorsTxt}, ${latest.year} TAX STATUS UNKNOWN${suffix}`;
    }

    data.delinquent = list.some(x => x.status === "Delinquent")
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

    return data;
};

// -------------------------
// STEP 1: OPEN PAYMENT SITE
// -------------------------
const ac_1 = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto("https://troupcountytax.com/", { waitUntil: "domcontentloaded" });

            const btn = "a.elementor-button-link[href*='pay.troupcountytax.com']";
            await page.waitForSelector(btn, timeout_option);

            const link = await page.$eval(btn, el => el.href);
            await page.goto(link, { waitUntil: "domcontentloaded" });

            resolve(true);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------
// STEP 2: SEARCH PROPERTY
// -------------------------
const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector("#SearchableProperty", timeout_option);
            await page.select("#SearchableProperty", "property_id");

            await page.waitForSelector("#SearchTerm", timeout_option);
            await page.click("#SearchTerm", { clickCount: 3 });
            await page.type("#SearchTerm", account, { delay: 50 });

            await Promise.all([
                page.evaluate(() => {
                    document
                        .querySelector("input[type='submit'].w-100[value='SEARCH']")
                        .click();
                }),
                page.waitForSelector("table.table-hover tbody tr", timeout_option)
            ]);

            resolve(true);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------
// STEP 3: OPEN RESULT
// -------------------------
const ac_3 = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            await Promise.all([
                page.click("input.btn-outline-primary[value='View']"),
                page.waitForNavigation({ waitUntil: "domcontentloaded" })
            ]);
            resolve(true);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------
// STEP 4: SCRAPE DATA
// -------------------------
const ac_4 = async (page, account, yearLimit = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForFunction(() =>
                [...document.querySelectorAll("h4")]
                    .some(h => h.textContent.includes("Bill History Details"))
                , timeout_option);

            let data = await page.evaluate(() => {
                const getVal = (label) => {
                    const el = [...document.querySelectorAll("label")]
                        .find(l => l.textContent.trim() === label);
                    return el?.parentElement?.querySelector("span")?.textContent.trim() || "N/A";
                };

                const section = [...document.querySelectorAll("h4")]
                    .find(h => h.textContent.includes("Bill History Details"))
                    ?.closest("section");

                const rows = section?.querySelectorAll("tbody tr") || [];
                let tax_history = [];

                rows.forEach((row, index) => {
                    const tds = row.querySelectorAll("td");
                    const year = +tds[1]?.innerText.trim();
                    const status = tds[0]?.innerText.includes("Paid") ? "Paid" : "Due";

                    tax_history.push({
                        jurisdiction: "County",
                        year,
                        payment_type: "Annual",
                        status,
                        due_date: `11/15/${year}`,
                        delq_date: `11/16/${year}`,
                        base_amount: tds[4]?.innerText.trim(),
                        amount_due: tds[8]?.innerText.trim(),
                        amount_paid: status === "Paid" ? tds[4]?.innerText.trim() : "$0",
                        paid_date: index === 0 && status === "Paid"
                            ? getVal("Last Payment Date")
                            : "",
                        mailing_date: "N/A",
                        good_through_date: ""
                    });
                });

                tax_history.sort((a, b) => b.year - a.year);

                return {
                    processed_date: new Date().toLocaleDateString(),
                    owner_name: [getVal("Name")],
                    property_address: getVal("Property Address"),
                    total_assessed_value: getVal("Assessed Value"),
                    total_taxable_value: getVal("Assessed Value"),
                    taxing_authority: "Troup County Tax Commissioner, GA",
                    parcel_number: getVal("Parcel Number"),
                    delinquent: "NONE",
                    tax_history
                };
            });

            const today = new Date();

            data.tax_history = data.tax_history
                .map(h => ({
                    ...h,
                    base_amount: formatAmount(h.base_amount),
                    amount_due: formatAmount(h.amount_due),
                    amount_paid: formatAmount(h.amount_paid)
                }))
                .map(h => {
                    if (h.status === "Due" && new Date(h.delq_date) < today) {
                        h.status = "Delinquent";
                    }
                    return h;
                })
                .slice(0, yearLimit);

            data.parcel_number ||= account;
            data = applyTaxNotes(data);

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------
// MAIN FLOW
// -------------------------
const account_search = async (page, account, yearLimit) => {
    return new Promise(async (resolve, reject) => {
        try {
            await ac_1(page);
            await ac_2(page, account);
            await ac_3(page);
            const data = await ac_4(page, account, yearLimit);
            resolve(data);
        } catch (error) {
            reject(error);
        }
    });
};

// -------------------------
// EXPORT
// -------------------------
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        page.setDefaultNavigationTimeout(90000);

        const yearLimit = getOHCompanyYears(client);
        const data = await account_search(page, account, yearLimit);

        await context.close();

        if (fetch_type === "api") {
            res.status(200).json({ result: data });
        } else {
            res.status(200).render("parcel_data_official", data);
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: true, message: error.message });
    }
};

export { search };
