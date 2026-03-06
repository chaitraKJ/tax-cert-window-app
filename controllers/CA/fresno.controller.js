// author:sanam poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

// -------------------------
// SCRAPER FUNCTION
// -------------------------
const ac_1 = async (page, parcel) => {
    try {
        await page.goto(
            "https://fcacttcptr.fresnocountyca.gov/Home/Index",
            { waitUntil: "networkidle2", timeout_option }
        );

        await page.waitForSelector("#APNField1", timeout_option);
        await page.type("#APNField1", parcel, { delay: 100 });

        await page.click("button[name='ssSearch'][value='parcel']");

        // wait for secured roll grid
        await page.waitForSelector("#securiedCollectionGrid table tbody tr", {
            timeout: 90000,
        });

        const data = await page.evaluate(() => {
            const clean = (v) => v?.trim() || "";
            const money = (v) => {
                const val = (v || "").toString().trim();
                if (!val) return "$0.00";
                return val.startsWith("$") ? val : `$${val}`;
            };


            const result = {
                processed_date: new Date().toISOString().split("T")[0],
                parcel_number: "N/A",
                property_address: "N/A",
                total_assessed_value: "N/A",
                total_taxable_value: "N/A",
                tax_history: [],
                delinquent: "NONE",
                notes: "",
                taxing_authority: `Fresno County Treasurer, 2281 Tulare Street, 6th Floor, Fresno, CA 93721 (559) 600-3495`,
                owner_name: [],
            };


            // -------------------------
            // PARCEL NUMBER
            // -------------------------
            const parcelEl = document.querySelector(
                "body > div.container.body-content > div:nth-child(4) > div:nth-child(2)"
            );
            if (parcelEl) {
                result.parcel_number = clean(parcelEl.textContent);
            }

            // -------------------------
            // PROPERTY ADDRESS
            // -------------------------
            const addressEl = document.querySelector(
                "#securiedNameAddressGrid table tbody tr:nth-child(4) td:nth-child(2) div"
            );
            if (addressEl) {
                result.property_address = clean(addressEl.textContent);
            }
            // -------------------------
            // OWNER NAME
            // -------------------------
            const ownerEl = document.querySelector(
                "#securiedNameAddressGrid table tbody tr:nth-child(2) td:nth-child(2) div"
            );
            if (ownerEl) {
                result.owner_name = [clean(ownerEl.textContent)];
            }


            // -------------------------
            // ASSESSED VALUE
            // -------------------------
            const valueRow = Array.from(
                document.querySelectorAll(
                    "#securiedFullValueGrid table tbody tr"
                )
            ).find((tr) => tr.innerText.includes("NET"));

            if (valueRow) {
                const tds = valueRow.querySelectorAll("td");
                const assessed = clean(tds[2]?.textContent);
                result.total_assessed_value = money(assessed);
                result.total_taxable_value = money(assessed);


            }

            // -------------------------
            // INSTALLMENT TABLE
            // -------------------------
            const rows = document.querySelectorAll("#securiedCollectionGrid table tbody tr");
            let tax = {}, pd = {}, amt = {};

            rows.forEach((row) => {
                const tds = row.querySelectorAll("td");
                if (!tds.length) return;

                const label = clean(tds[0].textContent);

                if (label === "TAX") {
                    tax.first = money(tds[1]?.textContent);
                    tax.second = money(tds[2]?.textContent);
                    tax.total = money(tds[3]?.textContent);
                }

                if (label === "PD") {
                    pd.first = clean(tds[1].textContent);
                    pd.second = clean(tds[2].textContent);
                }
                if (label === "AMT") {
                    amt.first = money(tds[1]?.textContent);
                    amt.second = money(tds[2]?.textContent);
                    amt.due = money(tds[3]?.textContent);
                }
            });

            // -------------------------
            // BUILD TAX HISTORY
            // -------------------------
            const today = new Date();
            const taxYear = today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear();
            const firstPaid = Boolean(pd.first);
            const secondPaid = Boolean(pd.second);

            // 1ST INSTALLMENT
            result.tax_history.push({
                jurisdiction: "County",
                year: `${taxYear}`,
                payment_type: "1st Installment",
                status: firstPaid ? "Paid" : "Due",
                base_amount: tax.first,
                amount_paid: firstPaid ? amt.first : "$0.00",
                amount_due: firstPaid ? "$0.00" : tax.first,

                mailing_date: "N/A",
                due_date: `11/01/${taxYear}`,
                delq_date: `12/11/${taxYear}`,
                paid_date: firstPaid ? pd.first : "",
                good_through_date: "",
                link: "",
            });

            // 2ND INSTALLMENT
            result.tax_history.push({
                jurisdiction: "County",
                year: `${taxYear}`,
                payment_type: "2nd Installment",
                status: secondPaid ? "Paid" : "Due",
                base_amount: tax.second,
                amount_paid: secondPaid ? amt.second : "$0.00",
                amount_due: secondPaid ? "$0.00" : tax.second,

                mailing_date: "N/A",
                due_date: `02/01/${taxYear + 1}`,
                delq_date: `04/10/${taxYear + 1}`,
                paid_date: secondPaid ? pd.second : "",
                good_through_date: "",
                link: "",
            });

            // -------------------------
            // UPDATE STATUS BASED ON DELINQUENT DATE
            // -------------------------
            result.tax_history.forEach((el) => {
                if (el.status === "Due" && el.delq_date) {
                    const parts = el.delq_date.split("/");
                    const delqDate = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
                    if (today > delqDate) el.status = "Delinquent";
                }
            });

            // -------------------------
            // OVERALL DELINQUENCY
            // -------------------------
            const isDelinquent = result.tax_history.some((el) => el.status === "Delinquent");
            result.delinquent = isDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";

            // -------------------------
            // BUILD NOTES
            // -------------------------
            const firstStatus = result.tax_history[0].status.toUpperCase();
            const secondStatus = result.tax_history[1]?.status.toUpperCase() || "";
            const hasDue = result.tax_history.some((el) => el.status === "Due" || el.status === "Delinquent");

            if (result.tax_history.length === 1) {
                result.notes = `${hasDue ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${taxYear}: ANNUAL TAX STATUS IS ${firstStatus}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 11/01.`;
            } else {
                result.notes = `${hasDue ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${taxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 11/01 AND 02/01.`;
            }

            return result;
        });

        return data;
    } catch (err) {
        throw err;
    }
};


// -------------------------
// ACCOUNT SEARCH FUNCTION
// -------------------------
const account_search = async (page, parcel) => {
    return ac_1(page, parcel);
};

// -------------------------
// MAIN CONTROLLER
// -------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    if (!account || account.trim() === "") {
        return res.status(400).json({
            message: "Please enter a valid property number (APN)",
        });
    }

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            account_search(page, account)
                .then((data) => res.status(200).render("parcel_data_official", data))
                .catch((error) => res.status(200).render("error_data", { error: true, message: error.message }))
                .finally(async () => await context.close());
        } else if (fetch_type === "api") {
            account_search(page, account)
                .then((data) => res.status(200).json({ result: data }))
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(async () => await context.close());
        } else {
            await context.close();
            return res.status(400).json({ message: "Invalid fetch_type" });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

module.exports = { search };
