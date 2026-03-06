// Author: Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

// -------------------------
// DELINQUENCY CHECK
// -------------------------
const moneyToNumber = (val) => {
    if (!val) return 0;
    return parseFloat(val.replace(/[$,()]/g, "")) || 0;
};

const is_delq = (date) => {
    if (!date) return false;
    return new Date() >= new Date(date);
};


// -------------------------
// STEP 1: SEARCH PARCEL
// -------------------------
const ac_1 = async (page, parcel) => {
    try {
        const url = "https://treasurer.pinal.gov/parcelinquiry";
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 200000 });

        // Wait for the parcel input to appear
        await page.waitForSelector('input[name="parcelNumber_input"]', timeout_option);

        // Fill the visible input
        await page.locator('input[name="parcelNumber_input"]').fill(parcel);

        // Also set the hidden input (Kendo ComboBox)
        await page.evaluate((parcel) => {
            document.querySelector('#parcelNumber').value = parcel;
        }, parcel);

        // Click the submit button and wait for navigation
        await Promise.all([
            page.locator('input[type="submit"][value="Submit"]').click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" })
        ]);

        // Check if we reached the Tax Summary page
        if (!page.url().includes("/Parcel/TaxSummary")) {
            throw new Error("No Record Found");
        }

        return true;
    } catch (err) {
        throw err;
    }
};


// -------------------------
// STEP 2: OWNER + PROPERTY + VALUATIONS
// -------------------------
const ac_2 = async (page, parcel) => {
    try {
        // -----------------------------
        // OWNER + ADDRESS (Tax Summary)
        // -----------------------------
        await page.waitForSelector("fieldset.addressblock", { timeout: 90000 });

        const data = await page.evaluate(() => {
            const result = {
                processed_date: new Date().toISOString().split("T")[0],
                owner_name: "N/A",
                property_address: "N/A",
                parcel_number: "",
                total_assessed_value: "N/A",
                total_taxable_value: "N/A",
                taxing_authority: "Pinal County Treasurer, Arizona",
                notes: "",
                delinquent: "NONE",
                tax_history: []
            };

            const addressBlock = document.querySelector("fieldset.addressblock");
            if (addressBlock) {
                const lines = addressBlock.innerText
                    .split("\n")
                    .map(l => l.trim())
                    .filter(l => l && l !== "Current Owner Name & Mailing Address");

                if (lines.length) {
                    result.owner_name = [lines[0]];
                    if (lines.length > 1) {
                        result.property_address = lines.slice(1).join(", ");
                    }
                }
            }

            return result;
        });

        // -----------------------------
        // VALUATIONS PAGE
        // -----------------------------
        await page.goto(
            "https://treasurer.pinal.gov/ParcelInquiry/Parcel/Valuations",
            { waitUntil: "domcontentloaded", timeout: 90000 }
        );

        await page.waitForSelector("#Valuations div", { timeout: 90000 });

        const valuationData = await page.evaluate(() => {
            const spans = Array.from(
                document.querySelectorAll("#Valuations div span.largetextbold")
            );

            let assessed = "N/A";
            let taxable = "N/A";

            spans.forEach(span => {
                const text = span.innerText.trim();
                if (text.includes("Primary (LPV)")) {
                    assessed = text.split(":")[1]?.trim() || "N/A";
                }
                if (text.includes("Secondary (FCV)")) {
                    taxable = text.split(":")[1]?.trim() || "N/A";
                }
            });

            return { assessed, taxable };
        });

        data.total_assessed_value = valuationData.assessed;
        data.total_taxable_value = valuationData.assessed;
        data.parcel_number = parcel;

        return data;

    } catch (err) {
        console.error("Error in ac_2:", err);
        throw err;
    }
};


// -------------------------
// STEP 3: TAX SUMMARY TABLE
// -------------------------
const ac_3 = async (page, data) => {
    try {
        // -----------------------------
        // STEP A: GET PAYMENT DATE
        // -----------------------------
        await page.goto(
            "https://treasurer.pinal.gov/ParcelInquiry/Parcel/PaymentHistory",
            { waitUntil: "domcontentloaded", timeout: 90000 }
        );

        await page.waitForSelector(
            'table[role="treegrid"] tbody tr.k-master-row',
            { timeout: 90000 }
        );

        const paidDate = await page.evaluate(() => {
            const rows = Array.from(
                document.querySelectorAll(
                    'table[role="treegrid"] tbody tr.k-master-row'
                )
            );

            const payments = rows
                .map(row => {
                    const tds = row.querySelectorAll("td");
                    const paymentDate = tds[3]?.innerText.trim();
                    const amountText = tds[6]?.innerText.trim() || "";

                    const amount = parseFloat(
                        amountText.replace(/[$,()]/g, "")
                    );

                    return {
                        paymentDate,
                        amount,
                        isNegative: amountText.includes("(")
                    };
                })
                .filter(p => p.paymentDate && p.amount > 0 && !p.isNegative)
                .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

            return payments.length ? payments[0].paymentDate : null;
        });

        // -----------------------------
        // STEP B: TAX YEAR DUE PAGE
        // -----------------------------
        await page.goto(
            "https://treasurer.pinal.gov/ParcelInquiry/Parcel/TaxYearDue",
            { waitUntil: "domcontentloaded", timeout: 90000 }
        );

        await page.waitForSelector("#Grid table", { timeout: 90000 });

        const pageData = await page.evaluate(() => {
            const table = document.querySelector("#Grid table");
            if (!table) return null;

          
            const taxYearText =
                document.querySelector(".k-input-value-text")?.innerText.trim();

            const taxYear = taxYearText ? parseInt(taxYearText, 10) : null;

            const rows = Array.from(table.querySelectorAll("tbody tr"));
            const footer = table.querySelector("tfoot tr");

            const map = {};
            rows.forEach(r => {
                map[r.children[0].innerText.trim()] = {
                    first: r.children[1].innerText.trim(),
                    second: r.children[2].innerText.trim(),
                    total: r.children[3].innerText.trim()
                };
            });

            return {
                taxYear,
                tax_due: map["Tax Due"],
                tax_paid: map["Tax Paid"],
                total_due: footer ? footer.children[3].innerText.trim() : "$0.00"
            };
        });


        if (!pageData) throw new Error("TaxYearDue grid not found");

        const year = pageData.taxYear;
        if (!year) throw new Error("Tax year not found");


        const firstPaid = moneyToNumber(pageData.tax_paid.first);
        const firstDue = moneyToNumber(pageData.tax_due.first);
        const secondPaid = moneyToNumber(pageData.tax_paid.second);
        const secondDue = moneyToNumber(pageData.tax_due.second);

        const history = [
            {
                jurisdiction: "County",
                year: year.toString(),
                payment_type: "Semi-Annual",
                base_amount: pageData.tax_due.first,
                amount_paid: firstPaid > 0 ? pageData.tax_paid.first : "$0.00",
                amount_due: firstPaid > 0 ? "$0.00" : pageData.tax_due.first,
                due_date: `10/31/${year}`,
                delq_date: `11/01/${year}`,
                status: firstPaid > 0 ? "Paid" : "Due",
                paid_date: firstPaid > 0 ? paidDate : "-",
                mailing_date: "N/A",
                good_through_date: "",
            },
            {
                jurisdiction: "County",
                year: year.toString(),
                payment_type: "Semi-Annual",
                base_amount: pageData.tax_due.second,
                amount_paid: pageData.tax_paid.second,
                amount_due: secondPaid > 0 ? "$0.00" : pageData.tax_due.second,
                due_date: `03/01/${year + 1}`,
                delq_date: `03/02/${year + 1}`,
                status: secondPaid > 0 ? "Paid" : "Due",
                paid_date: secondPaid > 0 ? paidDate : "-",
                mailing_date: "N/A",
                good_through_date: "",
            }
        ];


        return {
            data,
            status_data: {
                [year]: {
                    status:
                        moneyToNumber(pageData.total_due) > 0 &&
                            (firstPaid === 0 || secondPaid === 0)
                            ? "Due"
                            : "Paid",
                    history
                }
            },
            max_year: year
        };

    } catch (err) {
        throw err;
    }
};


// -------------------------
// STEP 4 + 5: DATA MERGE
// -------------------------
const ac_4_5 = async (main) => {
    const { data, status_data, max_year } = main;
    const history = [];

    for (const year in status_data) {
        status_data[year].history.forEach(h => {
            // Mark delinquent if past delinquency date
            if (h.status === "Due" && is_delq(h.delq_date)) {
                h.status = "Delinquent";
                data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            }
            history.push(h);
        });

        if (Number(year) === max_year) {
            // Update notes based on status of the latest year
            const statusText = status_data[year].status.toUpperCase();
            if (statusText === "PAID") {
                data.notes += `ALL PRIORS ARE PAID, ${year} TAXES ARE PAID, `;
            } else if (statusText === "DUE") {
                data.notes += `ALL PRIORS ARE PAID, ${year} TAXES ARE DUE, `;
            } else if (statusText === "DELINQUENT") {
                data.notes += `ALL PRIORS ARE PAID, ${year} TAXES ARE DELINQUENT, `;
            }
        }
    }

    // Add standard note about semi-annual payments
    data.notes += "NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 10/31 AND 03/01.";
    data.tax_history = history;

    return data;
};

// -------------------------
// MAIN SEARCH
// -------------------------
const account_search = async (page, parcel) => {
    await ac_1(page, parcel);

    const d1 = await ac_2(page, parcel);

    // ac_3 already fetches payment history internally
    const d2 = await ac_3(page, d1);

    return ac_4_5(d2);
};



// -------------------------
// CONTROLLER
// -------------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["stylesheet","font","image"].includes(req.resourceType())) {
                req.abort();
            } else req.continue();
        });

        const data = await account_search(page, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

        await context.close();

    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
};

module.exports = { search };
