//Author:Sanam Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };
function TaxNotes(data) {

    if (!data.tax_history || data.tax_history.length === 0) {
        data.notes =
            "ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE 03/02 & 06/15 FOR SEMI-ANNUAL, 04/30 FOR ANNUAL";
        data.delinquent = "NONE";
        return data;
    }

    data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));

    const latestYear = data.tax_history[data.tax_history.length - 1].year;

    const latestYearRecords = data.tax_history.filter(
        r => Number(r.year) === Number(latestYear)
    );

    const firstHalf = latestYearRecords[0];
    const secondHalf = latestYearRecords[1];

    const firstStatus = firstHalf?.status || "Unknown";
    const secondStatus = secondHalf?.status || "Unknown";

    const priorDelq = data.tax_history
        .filter(r => Number(r.year) !== Number(latestYear))
        .some(r => r.status === "Delinquent");

    const NOTE =
        ", NORMALLY TAXES ARE PAID SEMI-ANNUALLY/ANNUALLY, NORMAL DUE DATES ARE 03/02 & 06/15 FOR SEMI-ANNUAL, 04/30 FOR ANNUAL";

    // ---------- NOTES LOGIC ----------

    if (firstStatus === "Paid" && secondStatus === "Due") {

        data.notes =
            `ALL PRIORS ARE PAID, IN ${latestYear} TAXES 1ST INSTALLMENT IS PAID AND 2ND INSTALLMENT IS DUE${NOTE}`;
        data.delinquent = priorDelq
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

    }

    else if (firstStatus === "Paid" && secondStatus === "Paid") {

        data.notes =
            `ALL PRIORS ARE PAID, IN ${latestYear} TAXES ARE PAID${NOTE}`;
        data.delinquent = priorDelq
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

    }

    else if (firstStatus === "Due" && secondStatus === "Due") {

        data.notes =
            `ALL PRIORS ARE PAID, IN ${latestYear} TAXES ARE DUE${NOTE}`;
        data.delinquent = priorDelq
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

    }

    else if (firstStatus === "Delinquent" || secondStatus === "Delinquent") {

        data.notes =
            `ALL PRIORS ARE PAID, IN ${latestYear} TAXES ARE DELINQUENT${NOTE}`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";

    }

    else {

        data.notes = `${latestYear} TAX STATUS UNKNOWN${NOTE}`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";

    }

    return data;
}
// -----------------------------------------
// ARAPAHOE — STEP 1 (search by PIN)
// -----------------------------------------
const arap_1 = async (page, parcel) => {
    try {
        await page.goto('https://taxsearch.arapahoegov.com/', {
            waitUntil: 'networkidle2'
        });

        const inputSelector = '#ContentPlaceHolder1_txtPIN';
        const buttonSelector = '#ContentPlaceHolder1_btnByPIN';
        const resultsTableSelector = '#ContentPlaceHolder1_Table1';
        const errorSelector = '#ContentPlaceHolder1_lblRequiredPIN';

        await page.waitForSelector(inputSelector, { timeout: 20000 });

        await page.focus(inputSelector);
        await page.click(inputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(inputSelector, String(parcel), { delay: 50 });

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click(buttonSelector)
        ]);

        //  Safe error check
        let errorText = "";
        const errorElement = await page.$(errorSelector);
        if (errorElement) {
            errorText = await page.$eval(errorSelector, el => el.textContent.trim());
        }
        if (errorText) {
            throw new Error(`Invalid PIN or parcel not found: ${errorText}`);
        }

        await page.waitForSelector(resultsTableSelector, { timeout: 20000 });

        return page.url();

    } catch (err) {
        console.error('arap_1 error:', err);
        throw new Error('Parcel not found or site unavailable');
    }
};


const arap_2 = async (page, url) => {
    try {
        await page.goto(url, { waitUntil: "networkidle2" });

        // --- Basic Owner + Parcel Info ---
        await page.waitForSelector("#ContentPlaceHolder1_Table1", { timeout: 20000 });

        const basic = await page.evaluate(() => {
            const get = id => document.querySelector(id)?.innerText.trim() || "";
            return {
                owner_name: [get("#ContentPlaceHolder1_lblOwner")],
                parcel_number: get("#ContentPlaceHolder1_lblPIN"),
                property_address: get("#ContentPlaceHolder1_lblAddress"),
            };
        });

        // --- Assessed Values ---
const assessed = await page.evaluate(() => {
    const get = id => document.querySelector(id)?.innerText.trim() || "";
    return {
         taxable_value: get("#ContentPlaceHolder1_lblTaxableValue"),
        due_full: get("#ContentPlaceHolder1_lblDueFull"),
        due_1st_half: get("#ContentPlaceHolder1_lblDue1st"),
        due_2nd_half: get("#ContentPlaceHolder1_lblDue2nd")
    };
});

        // --- Tax Amounts ---
const tax = await page.evaluate(() => {

    const clean = v => Number(v.replace(/[^0-9.-]/g, "")) || 0;
    const get = id => document.querySelector(id)?.innerText.trim() || "0";

    const first_assessed = clean(get("#ContentPlaceHolder1_lblFirstAssmtTax"));
    const second_assessed = clean(get("#ContentPlaceHolder1_lblSecondAssmtTax"));

    const first_special = clean(get("#ContentPlaceHolder1_lblFirstSPASS"));
    const second_special = clean(get("#ContentPlaceHolder1_lblSecondSPASS"));

    const first_fee = clean(get("#ContentPlaceHolder1_lblFirstFee"));
    const second_fee = clean(get("#ContentPlaceHolder1_lblSecondFee"));

    const first_interest = clean(get("#ContentPlaceHolder1_lblFirstInterest"));
    const second_interest = clean(get("#ContentPlaceHolder1_lblSecondInterest"));

    return {

        first_half: {
            base: first_assessed + first_special + first_fee + first_interest,
            paid: clean(get("#ContentPlaceHolder1_lblFirstPayment")),
            due: clean(get("#ContentPlaceHolder1_lblTax1st"))
        },

        second_half: {
            base: second_assessed + second_special + second_fee + second_interest,
            paid: clean(get("#ContentPlaceHolder1_lblSecondPayment")),
            due: clean(get("#ContentPlaceHolder1_lblTax2nd"))
        },

        full_payment: {
            base:
                clean(get("#ContentPlaceHolder1_lblOrigTaxAmt")) +
                clean(get("#ContentPlaceHolder1_lblOrigSAAmt")) +
                clean(get("#ContentPlaceHolder1_lblOrigFeeAmt")) +
                clean(get("#ContentPlaceHolder1_lblFullInterest")),
            paid: clean(get("#ContentPlaceHolder1_lblPaidTotal")),
            due: clean(get("#ContentPlaceHolder1_lblTaxFull"))
        }

    };
});

        const currentYear = new Date().getFullYear() - 1;
        const year = currentYear + 1;
        const fullDueFormatted = assessed.due_full
    ? `${assessed.due_full}/${year}`
    : "";

        // --- Go to Receipts Page (ONLY if available) ---
        let receiptDates = [];

        const receiptsLink = await page.$("#ContentPlaceHolder1_aReceipts");

        if (receiptsLink) {
            await Promise.all([
                receiptsLink.click(),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);

            // --- Scrape Receipt Dates ---
            receiptDates = await page.evaluate(() => {
                return Array.from(
                    document.querySelectorAll("a[href*='ReceiptDownload.ashx']")
                ).map(a => a.innerText.trim());
            });
        }


        const getStatus = (owed, delqDate) => {
            if (owed <= 0) return "Paid";
            const today = new Date();
            const delq = new Date(delqDate);
            return today > delq ? "Delinquent" : "Due";
        };


        // --- Build tax history including paid dates ---
        const tax_history = [
            {
                jurisdiction: "County",
                year: currentYear,
                payment_type: "Semi-Annual",
                status: getStatus(tax.first_half.due, `${assessed.due_1st_half}/${year}`),
                base_amount: `$${tax.first_half.base.toFixed(2)}`,
                amount_paid: `$${tax.first_half.paid.toFixed(2)}`,
                amount_due: `$${tax.first_half.due.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: `${assessed.due_1st_half}/${year}`,
                delq_date: `03/03/${year}`,
                paid_date: receiptDates[0] || "",
                good_through_date: ""
            },
            {
                jurisdiction: "County",
                year: currentYear,
                payment_type: "Semi-Annual",
                status: getStatus(tax.second_half.due, `${assessed.due_2nd_half}/${year}`),
                base_amount: `$${tax.second_half.base.toFixed(2)}`,
                amount_paid: `$${tax.second_half.paid.toFixed(2)}`,
                amount_due: `$${tax.second_half.due.toFixed(2)}`,
                mailing_date: "N/A",
                due_date: `${assessed.due_2nd_half}/${year}`,
                delq_date: `06/16/${year}`,
                paid_date: receiptDates[1] || "",
                good_through_date: ""
            }
        ];


        return {
            ...basic,
            total_assessed_value: assessed.taxable_value,
            total_taxable_value: assessed.taxable_value,
            tax_history,
            full_due_date: fullDueFormatted,  
            taxing_authority: "Arapahoe County Treasurer, 5334 S Prince St, Littleton, CO 80120",
            delinquent: (tax.first_half.due > 0 || tax.second_half.due > 0) ? "NONE" : "NONE",
        };

    } catch (err) {
        console.error("arap_2 error:", err);
        throw err;
    }
};


// -------------------------------------------------------------
// ARAPAHOE ORCHESTRATOR
// -------------------------------------------------------------
const account_search_arapahoe = async (page, parcel) => {
    return new Promise((resolve, reject) => {
        arap_1(page, parcel)
            .then(url => arap_2(page, url))
            .then(data => {
                // Apply TaxNotes
                const enrichedData = TaxNotes(data);
                resolve(enrichedData);
            })
            .catch(err => reject(err));
    });
};




// -------------------------------------------------------------
// EXPRESS HANDLER
// -------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110 Safari/537.36'
        );

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["image", "font"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        if (fetch_type === "html") {
            account_search_arapahoe(page, account)
                .then(data => res.status(200).render("parcel_data_official", data))
                .catch(err => res.status(200).render("error_data", { error: true, message: err.message }))
                .finally(() => context.close());
        }

        if (fetch_type === "api") {
            account_search_arapahoe(page, account)
                .then(data => res.status(200).json({ result: data }))
                .catch(err => res.status(500).json({ error: true, message: err.message }))
                .finally(() => context.close());
        }

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: true, message: err.message });
    }
};

module.exports = { search };