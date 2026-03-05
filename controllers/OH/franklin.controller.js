// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/21 07/25`;

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => {
    const yearA = parseInt(a.year.split("-")[0], 10);
    const yearB = parseInt(b.year.split("-")[0], 10);
    return yearA - yearB;
});

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

// -------------------------------------------------------------
// STEP 1 — SEARCH BY PARCEL ID
// -------------------------------------------------------------
const fc_1 = async (page, parcel) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(
                "https://treapropsearch.franklincountyohio.gov/",
                { waitUntil: "networkidle2" }
            );

            await page.waitForSelector("#searchBoxUserControl");

            // Detect search box version
            const version = await page.evaluate(() => {
                if (document.querySelector("#ctl00_cphBodyContent_sbPropertySearch2_rbSearchByParcelID"))
                    return 2;
                if (document.querySelector("#ctl00_cphBodyContent_sbPropertySearch_rbSearchByParcelID"))
                    return 1;
                return 0;
            });

            if (version === 0) {
                return reject(new Error("Franklin search box version not found"));
            }

            const prefix =
                version === 2
                    ? "#ctl00_cphBodyContent_sbPropertySearch2"
                    : "#ctl00_cphBodyContent_sbPropertySearch";

            const radio = `${prefix}_rbSearchByParcelID`;
            const input = `${prefix}_tbSearch`;
            const btn = `${prefix}_btnSearch`;

            await page.click(radio);
            await page.$eval(input, el => (el.value = ""));
            await page.type(input, String(parcel), { delay: 40 });

            await Promise.all([
                page.click(btn),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);

            await page.waitForSelector("#propertyHeaderList", { timeout: 20000 });
            resolve(page.url());
        } catch (error) {
            console.log("fc_1 error:", error);
            reject(new Error(error.message));
        }
    });
};

// -------------------------------------------------------------
// STEP 2 — SCRAPE TAX HISTORY
// -------------------------------------------------------------
async function scrapeFranklinTaxHistory(page, main_data = {}, companyName = "") {
    const clean = (v) => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;

    const isDelinquent = (date) => {
        const d = new Date(date);
        if (isNaN(d)) return false;
        return new Date() >= d;
    };

    const normalizeDate = (d) => {
        const parts = d.split("/");
        return parts.length === 3
            ? `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`
            : d;
    };

    const clickYearTab = async (year) => {
        return await page.evaluate((yr) => {
            const tabs = [...document.querySelectorAll("ul.yearTabs li a")];
            const tab = tabs.find(t => t.textContent.trim() === String(yr));
            if (tab) {
                tab.click();
                return true;
            }
            return false;
        }, year);
    };

    const scrapePaymentDatesForYear = async () => {
        await page.waitForSelector(
            "#ctl00_cphBodyContent_fcPaymentContainer_current table.grid tbody tr.grid, " +
            "#ctl00_cphBodyContent_fcPaymentContainer_current table.grid tbody tr.grid.alt",
            { timeout: 15000 }
        );

        return await page.evaluate(() => {
            return Array.from(document.querySelectorAll(
                "#ctl00_cphBodyContent_fcPaymentContainer_current table.grid tbody tr.grid, " +
                "#ctl00_cphBodyContent_fcPaymentContainer_current table.grid tbody tr.grid.alt"
            )).map(r => {
                const cols = r.querySelectorAll("td");
                return {
                    date: cols[0]?.innerText.trim() || "",
                    amount: cols[1]?.innerText.trim() || ""
                };
            });
        });
    };

    const findClosestPaidDate = (delqDate, payments) => {
        const target = new Date(delqDate);
        if (isNaN(target)) return "";

        const validPayments = payments
            .map(p => ({ ...p, dateObj: new Date(p.date) }))
            .filter(p => !isNaN(p.dateObj));

        if (!validPayments.length) return "";

        let closest = validPayments[0];
        let minDiff = Math.abs(closest.dateObj - target);

        for (const p of validPayments) {
            const diff = Math.abs(p.dateObj - target);
            if (diff < minDiff) {
                minDiff = diff;
                closest = p;
            }
        }

        const mm = String(closest.dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(closest.dateObj.getDate()).padStart(2, "0");
        const yyyy = closest.dateObj.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    };

    const scrapeYear = async (year) => {
        const clicked = await clickYearTab(year);
        if (!clicked) return [];

        await page.waitForSelector(
            "#firstHalf table.taxbill-data, #secondHalf table.taxbill-data",
            { timeout: 20000 }
        );
        await page.click("#propertyHeaderList > ul > li:nth-child(2) a");

        const v = await page.evaluate(() => {
            const getText = (id) => document.querySelector(id)?.innerText.trim() || "";
            return {
                first_total: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_TaxRP1"),
                first_paid: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_TaxPaidRP1"),
                first_due: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_BalanceDueRP1"),
                second_total: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_TaxRP2"),
                second_paid: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_TaxPaidRP2"),
                second_due: getText("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_BalanceDueRP2")
            };
        });

        const paymentDatesNextYear = await (async () => {
            const clickedNext = await clickYearTab(year + 1);
            if (!clickedNext) return [];
            return await scrapePaymentDatesForYear();
        })();

        const halves = [
            {
                jurisdiction: "County",
                year: `${year}-${year + 1}`,
                half: "1st Half",
                payment_type: "Semi-Annual",
                base_amount: v.first_total,
                amount_paid: v.first_paid,
                amount_due: v.first_due,
                due_date: `02/21/${year + 1}`,
                delq_date: `02/22/${year + 1}`,
                good_through_date: "",
                mailing_date: "N/A"
            },
            {
                jurisdiction: "County",
                year: `${year}-${year + 1}`,
                half: "2nd Half",
                payment_type: "Semi-Annual",
                base_amount: v.second_total,
                amount_paid: v.second_paid,
                amount_due: v.second_due,
                due_date: `07/25/${year + 1}`,
                delq_date: `07/26/${year + 1}`,
                good_through_date: "",
                mailing_date: "N/A"
            }
        ];

        for (const h of halves) {
            h.paid_date = normalizeDate(findClosestPaidDate(h.delq_date, paymentDatesNextYear));
            h.status = clean(h.amount_due) === 0 ? "Paid" : "Due";

            if (h.status === "Due" && isDelinquent(h.delq_date)) {
                h.status = "Delinquent";
                main_data.data ??= {};
                main_data.data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            }
        }

        return halves;
    };

    try {
        const currentTab = await page.$("ul.yearTabs li.ui-tabs-selected a");
        const currentYear = Number(await currentTab?.evaluate(el => el.textContent.trim()));
        if (isNaN(currentYear)) throw new Error("Invalid current year");

        // Determine number of years based on company
        const noOfYears = getOHCompanyYears(companyName);

        // Check prior balance for delinquency
        await clickYearTab(currentYear);
        await page.click("#propertyHeaderList > ul > li:nth-child(2) a");
        const priorBalance = await page.evaluate(() => {
            const el = document.querySelector("#ctl00_cphBodyContent_fcTaxBillContainer_ctl12_BalanceDuePrior");
            return Number(el?.innerText.replace(/[^0-9.-]/g, "")) || 0;
        });
        if (priorBalance > 0) {
            main_data.data ??= {};
            main_data.data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        }

        const history = [];
        for (let i = 1; i <= noOfYears; i++) {
            const yearToScrape = currentYear - i;
            history.push(...await scrapeYear(yearToScrape));
        }

        return history;

    } catch (err) {
        console.error("Franklin tax scrape error:", err);
        return [];
    }
}

// -------------------------------------------------------------
// STEP 3 — SCRAPE SUMMARY TAB
// -------------------------------------------------------------
const fc_2 = async (page, url, companyName = "") => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2" });
            await page.waitForSelector("#tabs-0", { timeout: 25000 });

            const data = await page.evaluate(() => {
                const getText = (sel) => document.querySelector(sel)?.innerText.trim() || "";
                const parcel_number = getText("#ctl00_cphBodyContent_lblDNum1").replace("Parcel: ", "").trim();
                const owners = [getText("#ctl00_cphBodyContent_lblOwn1_1"), getText("#ctl00_cphBodyContent_lblOwn1_2")].filter(Boolean);
                const addr1 = getText("#ctl00_cphBodyContent_fcDetailsHeader_LocationAddressLine1");
                const addr2 = getText("#ctl00_cphBodyContent_fcDetailsHeader_LocationAddressLine2");

                return {
                    owners,
                    parcel_number,
                    full_address: `${addr1} ${addr2}`.trim(),
                    land_value: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblLand"),
                    improvement_value: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblImprovement"),
                    assessed_value: getText("#ctl00_cphBodyContent_fcDetailsHeader_lblTotal")
                };
            });

            let tax_history = [];
            try {
                tax_history = await scrapeFranklinTaxHistory(page, {}, companyName);
            } catch (err) {
                console.error("Tax history scrape failed:", err.message);
            }

            const finalData = {
                owner_name: data.owners,
                property_address: data.full_address,
                parcel_number: data.parcel_number,
                total_assessed_value: data.assessed_value,
                total_taxable_value: data.assessed_value,
                taxing_authority: "Franklin County Treasurer 373 S High St, Columbus, OH 43215 (614) 525-3438",
                tax_history,
                delinquent: "UNKNOWN"
            };

            applyTaxNotes(finalData);

            resolve(finalData);

        } catch (error) {
            console.error("fc_2 error:", error.message);
            reject(new Error(error.message));
        }
    });
}

// -------------------------------------------------------------
// ORCHESTRATOR
// -------------------------------------------------------------
const account_search = async (page, parcel, companyName = "") => {
    return new Promise((resolve, reject) => {
        fc_1(page, parcel)
            .then(url => fc_2(page, url, companyName))
            .then(data => resolve(data))
            .catch(err => reject(err));
    });
}

// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['stylesheet', 'font', 'image'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const handler = account_search(page, account, client);

        if (fetch_type === "html") {
            handler
                .then(data => res.status(200).render("parcel_data_official", data))
                .catch(err => res.status(200).render('error_data', { error: true, message: err.message }))
                .finally(async () => await context.close());
        } else if (fetch_type === "api") {
            handler
                .then(data => res.status(200).json({ result: data }))
                .catch(err => res.status(500).json({ error: true, message: err.message }))
                .finally(async () => await context.close());
        }

    } catch (error) {
        console.error(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message });
        }
    }
}

export { search };