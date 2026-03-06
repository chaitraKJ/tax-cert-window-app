// author -> Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const ac_1 = async (page, url, account) => {
    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#agree-button", { timeout: 30000 });
        await page.locator("#agree-button").click();

        // Wait for payments table to load
        await page.waitForSelector("[id^='payments-'] table", { timeout: 30000 });

        const data = await page.evaluate(() => {
            const today = new Date();

            const result = {
                processed_date: new Date().toISOString().split("T")[0],
                order_number: "-",
                borrower_name: "-",
                owner_name: [],
                property_address: document.querySelector("h1")?.textContent.trim() || "-",
                parcel_number: document.querySelector("#parcel-search-data .section-header span")?.textContent.trim() || "-",
                land_value: "-",
                improvements: "-",
                total_assessed_value: "$0.00",
                exemption: "-",
                total_taxable_value: "$0.00",
                taxing_authority: "Cowlitz County Treasurer, WA, 207 N. 4th Ave, Kelso, WA 98626",
                notes: "-",
                delinquent: "NONE",
                tax_history: [],
            };

            // ---------------- OWNER ----------------
            result.owner_name.push(
                document.querySelector("#parcel-search-data td span.text-bold.text-uppercase")?.textContent.trim() || "-"
            );

            // ---------------- BILL HISTORY MAP ----------------
            const billHistoryMap = {};
            document.querySelectorAll("h3").forEach((h3) => {
                if (h3.textContent.includes("Bill History")) {
                    const table = h3.nextElementSibling;
                    table?.querySelectorAll("tbody tr").forEach((tr) => {
                        const year = tr.querySelector("td")?.textContent.trim();
                        const amount = tr.querySelector("td.text-end div")?.textContent.trim();
                        if (year && amount) billHistoryMap[year] = amount;
                    });
                }
            });

            // ---------------- TAX HISTORY ----------------
            const rows = document.querySelectorAll("[id^='payments-'] table tbody tr");

            rows.forEach((tr) => {
                const labelSpan = tr.querySelector("label span.text-bold");
                const label = labelSpan?.textContent.trim() || "";

                // Take amount directly from the table cell
                const amount_due = tr.querySelector("td.text-end")?.textContent.trim() || "$0.00";
                const amountNum = parseFloat(amount_due.replace(/[$,]/g, "")) || 0;

                // Extract year and installment from input
                const inputEl = tr.querySelector("input[type='checkbox']");
                if (!inputEl) return;
                const taxYear = inputEl.dataset.taxYear;
                const installmentNum = inputEl.dataset.installment;

                // ----------------- DETERMINE PAYMENT TYPE -----------------
                let payment_type = "Annual"; // default
                if (label.toLowerCase().includes("full") || label.toLowerCase().includes("total current")) {
                    payment_type = "Annual";
                } else if (label.toLowerCase().includes("1st") || installmentNum === "1") {
                    payment_type = "1st Installment";
                } else if (label.toLowerCase().includes("2nd") || installmentNum === "2") {
                    payment_type = "2nd Installment";
                }

                // ----------------- ADJUST BASE AMOUNT -----------------
                let base_amount_num = parseFloat((billHistoryMap[taxYear] || amount_due).replace(/[$,]/g, "")) || 0;
                if (payment_type === "1st Installment" || payment_type === "2nd Installment") {
                    base_amount_num = base_amount_num / 2; // semi-annual payment
                }
                const base_amount = `$${base_amount_num.toFixed(2)}`;

                // Determine due and delinquent dates
                let dueDateStr = "04/30/" + taxYear;
                let delqDateStr = "05/01/" + taxYear;
                if (payment_type === "2nd Installment") {
                    dueDateStr = "10/31/" + taxYear;
                    delqDateStr = "11/01/" + taxYear;
                }

                const dueDate = new Date(dueDateStr);
                const delqDate = new Date(delqDateStr);

                // Determine status
                let status = "Paid";
                if (amountNum > 0) {
                    status = today < dueDate ? "Due" : today >= dueDate ? "Delinquent" : "Paid";
                }

                result.tax_history.push({
                    jurisdiction: "County",
                    year: taxYear,
                    payment_type,
                    status,
                    base_amount,
                    amount_paid: status === "Paid" ? base_amount : "$0.00",
                    amount_due: amount_due, // directly from table
                    mailing_date: "N/A",
                    due_date: dueDateStr,
                    delq_date: delqDateStr,
                    paid_date: status === "Paid" ? "-" : "-",
                    good_through_date: "-",
                    link: "-",
                });
            });



            // ---------------- DELINQUENT FLAG ----------------
            const hasDelinquent = result.tax_history.some((t) => t.status === "Delinquent");
            result.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            // ---------------- NOTES ----------------
            const years = [...new Set(result.tax_history.map((t) => t.year))].sort((a, b) => a - b);
            const notesArr = [];

            years.forEach((yr) => {
                const records = result.tax_history.filter((t) => t.year === yr);
                if (records.length === 1) {
                    notesArr.push(`${yr}: ANNUAL TAX STATUS IS ${records[0].status.toUpperCase()}`);
                } else if (records.length === 2) {
                    notesArr.push(`${yr}: 1ST INSTALLMENT IS ${records[0].status.toUpperCase()}, 2ND INSTALLMENT IS ${records[1].status.toUpperCase()}`);
                }
            });

            const priorUnpaid = result.tax_history.some((t) => Number(t.year) < Math.max(...years.map(Number)) && t.status === "Delinquent");

            result.notes = `${priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${notesArr.join("; ")}, NORMAL TAXES ARE PAID ${result.tax_history.some(t => t.payment_type.includes("Installment")) ? "SEMI-ANNUALLY" : "ANNUALLY"}, NORMAL DUE DATES ARE 04/30${result.tax_history.some(t => t.payment_type.includes("2nd Installment")) ? " AND 10/31" : ""}.`;

            return result;
        });

        return data;
    } catch (error) {
        console.log("Error in ac_1:", error);
        throw new Error("Record Not Found");
    }
};

/* =====================================================
 * CONTROLLER
 * ===================================================== */
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const url = `https://payments.municipay.com/wa_cowlitz/item/R/${account}`;

        if (!fetch_type || !["html", "api"].includes(fetch_type)) {
            return res.status(200).render("error_data", { error: true, message: "Invalid Access" });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        );

        page.setDefaultNavigationTimeout(90000);

        // BLOCK unnecessary resources
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const data = await ac_1(page, url, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }

        await context.close();
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