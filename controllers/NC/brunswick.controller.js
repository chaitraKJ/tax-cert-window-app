// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };


const applyTaxNotes = (data) => {
    const suffix = ", NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE AND DELQ DATES ARE 09/01 01/05, CITY TAX NEED TO CONFIRM";

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +b.year - +a.year);

    const latest = list[0];
    const priors = list.slice(1);

    const priorsDelq = priors.some(x => ["Delinquent", "Due"].includes(x.status));
    const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    if (latest.status === "Paid") {
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
    } else if (latest.status === "Delinquent") {
        data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
    } else {
        data.notes = `${priorsTxt}, ${latest.year} TAX STATUS UNKNOWN${suffix}`;
    }

    data.delinquent = list.some(x => x.status === "Delinquent") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    return data;
};


// -------------------------
// STEP 1: OPEN TAX BILL PAGE
// -------------------------
const ac_1 = async (page, account) => {
    try {
        await page.goto(
            "https://tax.brunsco.net/ITSNet/TaxBill.aspx",
            { waitUntil: "domcontentloaded", ...timeout_option }
        );

        // WAIT FOR PARCEL INPUT
        const PARCEL_SEL =
            "#ctl00_contentplaceholdertaxBillSearch_UsercontrolTaxbillSearch_ctrlParcelNumber_txtPARCEL";
        const ALPHA_SEL =
            "#ctl00_contentplaceholdertaxBillSearch_UsercontrolTaxbillSearch_ctrlParcelNumber_txtALPHA";

        await page.waitForSelector(PARCEL_SEL, { visible: true });

        const parcel = String(account).toUpperCase();
        const main = parcel.slice(0, 10);
        const alpha = parcel.slice(10, 12);

        // FILL INPUTS (ASP.NET SAFE)
        await page.evaluate(
            (parcelVal, alphaVal, parcelSel, alphaSel) => {
                const p = document.querySelector(parcelSel);
                const a = document.querySelector(alphaSel);

                p.value = parcelVal;
                p.dispatchEvent(new Event("input", { bubbles: true }));
                p.dispatchEvent(new Event("change", { bubbles: true }));

                if (alphaVal && a) {
                    a.value = alphaVal;
                    a.dispatchEvent(new Event("input", { bubbles: true }));
                    a.dispatchEvent(new Event("change", { bubbles: true }));
                }
            },
            main,
            alpha,
            PARCEL_SEL,
            ALPHA_SEL
        );

        // CLICK SEARCH (must be click)
        const SEARCH_BTN =
            "#ctl00_contentplaceholdertaxBillSearch_UsercontrolTaxbillSearch_buttonSearch";

        await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            page.click(SEARCH_BTN)
        ]);

        //WAIT FOR RESULTS GRID
        const GRID =
            "#ctl00_contentplaceholderTaxBillSearchResults_tabcontainerSearchResults_tabpanelRegular_usercontrolTaxBillSearchResultsRegular_gridviewSearchResults";

        await page.waitForSelector(`${GRID} tbody tr`, {
            visible: true,
            timeout: 20000
        });

        // CLICK MOST RECENT BILL (FIRST DATA ROW)
        await page.evaluate((gridSel) => {
            const table = document.querySelector(gridSel);
            if (!table) throw new Error("Results grid not found");

            const rows = table.querySelectorAll("tbody tr");
            if (rows.length < 2) throw new Error("No tax bill rows found");

            // rows[0] = header, rows[1] = most recent
            const link = rows[1].querySelector("td.HyperLinkField a");
            if (!link) throw new Error("Tax bill link not found");

            link.click();
        }, GRID);

        return page;
    } catch (err) {
        console.error("ac_1 error:", err);
        throw err;
    }
};




// -------------------------
// STEP 2: SCRAPE TAX BILL DATA
// -------------------------
const ac_2 = async (page) => {
    try {
        // Wait for Selected Tax Bill Info section
        await page.waitForSelector(
            "#ctl00_contentplaceholderTaxBillSearchSummary_UsercontrolTaxBillSelectedBillDisplay_labelAccountNumberValue",
            { timeout: 20000 }
        );

        const data = await page.evaluate(() => {
            const text = (sel) =>
                document.querySelector(sel)?.innerText.trim() || "";

            const num = (sel) =>
                parseFloat(text(sel).replace(/,/g, "")) || 0;

            const formatCurrency = (n) =>
                `$${n.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`;

            /* ------------------------------
               BASIC PARCEL INFO
            ------------------------------ */
            const owner_name = [
                text("#ctl00_contentplaceholderTaxBillSearchSummary_UsercontrolTaxBillSelectedBillDisplay_labelAccountName1Value"),
            ].filter(Boolean);

            const property_address = text(
                "#ctl00_contentplaceholderTaxBillSearchSummary_UsercontrolTaxBillSelectedBillDisplay_labelPropertyAddress"
            );

            const parcel_number = text(
                "#ctl00_contentplaceholderTaxBillSearchSummary_UsercontrolTaxBillSelectedBillDisplay_labelparNumValue"
            );

            const assessedVal = num(
                "#ctl00_contentplaceholderTaxBillSearchSummary_UsercontrolTaxBillSelectedBillDisplay_labelTotalValuationValue"
            );

            /* ------------------------------
               TAX TOTALS (Totals row)
            ------------------------------ */
            const totalsRow = [
                ...document.querySelectorAll(
                    "#ctl00_contentplaceholderTaxBillWorkspace_usercontrolTaxBillTaxDistrict1_gridviewTaxDistrict tr"
                ),
            ].find((tr) => tr.innerText.includes("Totals"));

            const totalsTds = totalsRow?.querySelectorAll("td") || [];

            const base_amount = parseFloat(
                totalsTds[1]?.innerText.replace(/,/g, "") || "0"
            );
            const amount_paid = parseFloat(
                totalsTds[4]?.innerText.replace(/,/g, "") || "0"
            );
            const balance = parseFloat(
                totalsTds[5]?.innerText.replace(/,/g, "") || "0"
            );

            /* ------------------------------
               PAYMENT HISTORY
            ------------------------------ */
            const paymentRow = document.querySelector(
                "#ctl00_contentplaceholderTaxBillWorkspace_usercontrolTaxBillPaymentHistory1_gridviewTaxBillHistorySummary tr.RowStyleDefaultGridViewSkin"
            );

            const paid_date =
                paymentRow?.querySelector("td")?.innerText.split(" ")[0] ||
                "N/A";

            /* ------------------------------
               YEAR + STATUS
            ------------------------------ */
            const year = new Date(paid_date).getFullYear() || new Date().getFullYear()-1;
            const due_date = `09/01/${year}`;

            const getTaxStatus = (paid, due) => {
                if (paid > 0) return "Paid";
                return new Date() > new Date(due) ? "Delinquent" : "Due";
            };

            return {
                owner_name,
                property_address,
                parcel_number,
                taxing_authority: "Brunswick County, NC",
                tax_history: [
                    {
                        jurisdiction: "County",
                        year,
                        payment_type: "Annual",
                        status: getTaxStatus(amount_paid, due_date),
                        base_amount: formatCurrency(base_amount),
                        amount_paid: formatCurrency(amount_paid),
                        amount_due: formatCurrency(balance),
                        total_assessed_value: formatCurrency(assessedVal),
                        total_taxable_value: formatCurrency(assessedVal),
                        paid_date,
                        due_date,
                        delq_date: `01/05/${year + 1}`,
                        good_through_date: "N/A",
                        mailing_date: "N/A",
                    },
                ],
            };
        });

        return applyTaxNotes(data);
    } catch (err) {
        console.error("ac_2 error:", err);
        throw err;
    }
};

// -------------------------
// ORCHESTRATOR
// -------------------------
const account_search = async (page, account) => {
    await ac_1(page, account);
    return await ac_2(page);
};

// -------------------------
// EXPRESS HANDLER
// -------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(90000);

        const result = await account_search(page, account);

        await context.close();

        if (fetch_type === "html") {
            // Flatten tax_history[0] into top-level fields for EJS
            const renderData = {
                ...result,                 
                ...(result.tax_history[0] || {}) 
            };

            res.status(200).render("parcel_data_official", renderData);
        } else {
            res.status(200).json({ result });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: true, message: error.message });
    }
};

export { search };
