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
        await page.goto("https://tax.transylvaniacounty.org/TaxBillSearch", { waitUntil: "domcontentloaded", ...timeout_option });

        // ENTER PARCEL NUMBER
        await page.waitForSelector("#ParcelTextFormat input.parcel-format", { visible: true });
        await page.evaluate((parcel) => {
            const inputs = document.querySelectorAll("#ParcelTextFormat input.parcel-format");
            let idx = 0;
            inputs.forEach(input => {
                const max = input.maxLength;
                input.value = parcel.substr(idx, max);
                idx += max;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }, String(account));

        // SELECT TAX YEAR
        const targetYear = new Date().getFullYear() - 1;
        await page.select("#TaxYear", String(targetYear));

        // SUBMIT SEARCH
        await page.click("#tax-bill-search-submit");

        // WAIT FOR RESULTS
        const firstRowSelector = "#PayTaxBills tbody tr";
        await page.waitForSelector(firstRowSelector, { visible: true, timeout: 20000 });
        await page.click(firstRowSelector);

        await page.waitForFunction(
            () => !!document.querySelector("#view-item-partial .info-row-label"),
            { timeout: 20000 }
        );

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
        await page.waitForSelector("#TaxDistrictsData-footer td", { timeout: 20000 });

        const data = await page.evaluate(() => {
            const getFooterValue = (idx) => {
                const footer = document.querySelectorAll("#TaxDistrictsData-footer td");
                return footer[idx]?.innerText.trim() || "0.00";
            };

const base_amount = parseFloat(getFooterValue(1).replace(/,/g, "")) || 0;      // Levied
const interest_fees = parseFloat(getFooterValue(2).replace(/,/g, "")) || 0;    // Interest/Fees
const released = parseFloat(getFooterValue(3).replace(/,/g, "")) || 0;         // Released
const discount = parseFloat(getFooterValue(4).replace(/,/g, "")) || 0;         // Discount
const collected = parseFloat(getFooterValue(5).replace(/,/g, "")) || 0;        // Collected
const balance = parseFloat(getFooterValue(6).replace(/,/g, "")) || 0;          // Balance


            const yearBillNode = [...document.querySelectorAll("fieldset legend")].find(l => l.innerText.includes("Bill Info"));
            const yearBillText = yearBillNode?.nextElementSibling.querySelector("li div.info-row-text")?.innerText || "2025-00000";
            const year = parseInt(yearBillText.split("-")[0], 10);

            const accountFieldset = [...document.querySelectorAll("fieldset legend")].find(l => l.innerText.includes("Account Info"));
            const accountOL = accountFieldset?.nextElementSibling;

            let owner_name = [];
            let property_address = "";
            let parcel_number = "";

            let taxing_authority = "Transylvania County, NC";
            const paymentSection = document.querySelector('some-selector-with-payee');
            if (paymentSection) {
                taxing_authority = paymentSection.innerText.trim() || taxing_authority;
            }
            if (accountOL) {
                const lis = [...accountOL.querySelectorAll("li")];
                owner_name.push(lis[1]?.innerText.trim() || "");
                const addr1 = lis[3]?.innerText.trim() || "";
                const addr2 = lis[4]?.innerText.trim() || "";
                property_address = [addr1, addr2].filter(Boolean).join(", ");
            }

            const parcelLi = yearBillNode.nextElementSibling.querySelectorAll("li");
            parcel_number = parcelLi[1]?.querySelector(".info-row-text")?.innerText.trim() || "";

            const balanceFieldset = [...document.querySelectorAll("fieldset legend")].find(l => l.innerText.includes("Balance Info"));
            const balanceOL = balanceFieldset?.nextElementSibling;
            let paid_date = "N/A";
            if (balanceOL) {
                [...balanceOL.querySelectorAll("li")].forEach(li => {
                    const label = li.querySelector(".info-row-label")?.innerText.replace(":", "").trim();
                    const val = li.querySelector(".info-row-text")?.innerText.trim();
                    if (label === "Last Payment Date") paid_date = val || "N/A";
                });
            }

            const taxableFieldset = [...document.querySelectorAll("fieldset legend")].find(l => l.innerText.includes("Taxable Values"));
            const ol = taxableFieldset?.nextElementSibling;
            let assessedVal = 0;
            if (ol) {
                [...ol.querySelectorAll("li")].forEach(li => {
                    const label = li.querySelector(".info-row-label")?.innerText.replace(":", "").trim();
                    if (label === "Parcel Value Total") {
                        assessedVal = parseFloat(li.querySelector(".info-row-text")?.innerText.replace(/,/g, "").trim()) || 0;
                    }
                });
            }
const formatCurrency = (num) => {
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};

const getTaxStatus = (levied, interestFees, discount, collected, dueDateStr) => {
    const totalDue = levied + interestFees;
    const totalPaid = collected + discount; // assume released already reduces totalDue if needed

    if (totalPaid >= totalDue) return "Paid";

    const today = new Date();
    const dueDate = new Date(dueDateStr);

    return today > dueDate ? "Delinquent" : "Due";
};


const due_date = `09/01/${year}`;

return {
    owner_name,
    property_address,
    parcel_number,
    taxing_authority,
    tax_history: [
        {
            jurisdiction: "County",
            year,
            payment_type: "Annual",
           status: getTaxStatus(base_amount, interest_fees, discount, collected, due_date),


            base_amount: formatCurrency(base_amount),
            amount_paid: formatCurrency(collected),
            amount_due: formatCurrency(balance),
            total_assessed_value: formatCurrency(assessedVal),
            total_taxable_value: formatCurrency(assessedVal),
            paid_date,
            due_date,
            delq_date: `01/05/${year + 1}`,
            good_through_date: "N/A",
            mailing_date: "N/A"
        }
    ]
};


        });

        return applyTaxNotes(data);
    } catch (err) {
        console.log("ac_2 error:", err);
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
