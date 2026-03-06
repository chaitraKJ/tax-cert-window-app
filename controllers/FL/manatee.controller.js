const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const TIME = { NAVIGATE: 90000 };

function addDollar(value) {
    if (value === null || value === undefined || value === "") return "$0.00";

    // Remove $ and commas if they exist
    const num = Number(String(value).replace(/[$,]/g, ""));
    if (isNaN(num)) return "$0.00";

    return `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}




/* =========================
 * SEARCH STEP 1 — ENTER PARCEL
 * ========================= */
const cl_1_manatee = async (page, url, parcel, taxYear) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIME.NAVIGATE });
    await page.waitForSelector("#iAgree", { visible: true });
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#iAgree")]);

    await page.waitForSelector("#searchValue", { visible: true });
    await page.$eval("#searchValue", el => el.value = "");
    await page.type("#searchValue", String(parcel), { delay: 50 });

    // Select tax year if provided
    if (taxYear) {
        await page.select("#taxYear", String(taxYear));
    }

    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#propertySearchButtonId")]);
    await page.waitForSelector("#currentTableObject tbody tr", { timeout: TIME.NAVIGATE });
};


/* =========================
 * SEARCH STEP 2 — SCRAPE ROW
 * ========================= */
const cl_2_manatee = async (page) => {
    const rowData = await page.evaluate(() => {
        const row = document.querySelector("#currentTableObject tbody tr");
        if (!row) return null;
        const cells = Array.from(row.querySelectorAll("td"));
        const text = (idx) => cells[idx]?.innerText?.trim() || "";
        const ownerAndAddressRaw = text(4);

        let owner_name = "", property_address = "";
        if (ownerAndAddressRaw) {
            const match = ownerAndAddressRaw.match(/^(.*),\s(\d+.*)$/);
            if (match) {
                owner_name = match[1].trim();
                property_address = match[2].trim();
            } else {
                owner_name = ownerAndAddressRaw;
            }
        }

        return {
            tax_year: text(2),
            parcel_number: text(3),
            owner_name,
            property_address,
            status: text(5),
            amount_paid: text(6),
            paid_date: text(7),
            amount_due: text(8),
            payment_schedule: text(5) === "Qtrly Pmts" ? "Qtrly" : "Annual",
            detail_url: cells[3]?.querySelector("a")?.href || "",
        };
    });

    if (!rowData?.detail_url) throw new Error("No result row or detail URL found");
    return rowData;
};

/* =========================
 * SEARCH STEP 3 — DETAIL PAGE
 * ========================= */
const cl_3_manatee_detail = async (page, detailUrl) => {
    await page.goto(detailUrl, { waitUntil: "networkidle0", timeout: TIME.NAVIGATE });
    await page.waitForSelector("table.Spread", { timeout: TIME.NAVIGATE });

    return page.evaluate(() => {
        let assessed_value = "";
        let prior_due = false;

        document.querySelectorAll("table.Spread tr").forEach(tr => {
            const label = tr.querySelector("td strong")?.innerText || "";
            if (label.includes("Assessed Value")) {
                assessed_value = tr.querySelectorAll("td")[1]?.innerText?.trim() || "";
            }
        });

        prior_due = Array.from(document.querySelectorAll(".Table-line strong")).some(el => el.innerText.includes("PRIOR YEARS DUE"));
        return { assessed_value, prior_due };
    });
};

/* =========================
 * SCRAPE INSTALLMENT PAYMENTS
 * ========================= */
const cl_installment_payments = async (page, url) => {
    await page.goto(url, { waitUntil: "networkidle0", timeout: TIME.NAVIGATE });
    await page.waitForSelector("#currentTableObject4 tbody tr");

    return page.evaluate(() => Array.from(document.querySelectorAll("#currentTableObject4 tbody tr")).map(tr => {
        const tds = tr.querySelectorAll("td");
        return {
            paid_date: tds[0]?.innerText.trim(),
            receipt_no: tds[1]?.innerText.trim(),
            payer: tds[2]?.innerText.trim(),
            amount_paid: tds[3]?.innerText.trim(),
        };
    }));
};

// SCRAPE REMAINING DUES (from editSPPropertySearch2.action URL)

const cl_installment_dues = async (page, parcel, taxYear) => {
    // Build the correct dues URL
    const duesUrl = `https://secure.taxcollector.com/ptaxweb/editSPPropertySearch2.action?action=search&searchValue=${parcel}&searchField=accountNumber&taxYear=${taxYear}`;

    await page.goto(duesUrl, { waitUntil: "networkidle0", timeout: TIME.NAVIGATE });
    await page.waitForSelector("#currentTableObject tbody tr");

    return page.evaluate(() => {
        return Array.from(document.querySelectorAll("#currentTableObject tbody tr"))
            // Only include Unpaid rows
            .filter(tr => {
                const status = tr.children[4]?.innerText.trim();
                return status && status.toLowerCase() !== "paid";
            })
            .map(tr => {
                const tds = tr.querySelectorAll("td");
                return {
                    due_date: tds[3]?.innerText.trim(),
                    status: tds[4]?.innerText.trim(),
                    amount_due: tds[5]?.innerText.trim(),
                };
            });
    });
};

/* =========================
 * UTILITY — PAYMENT TYPE
 * ========================= */
const getPaymentType = (paymentScheduleText = "") => {
    return paymentScheduleText.includes("Qtrly") ? "Installment" : "Annual";
};

/* =========================
 * GENERATE TAX NOTES
 * ========================= */
const generateNotes = (taxes, isInstallment) => {
    if (!taxes.length) return "ALL TAXES ARE PAID, NO TAXES DUE";

    // ---------------- INSTALLMENT LOGIC ----------------
    if (isInstallment) {
        const sorted = [...taxes].sort((a, b) => {
            if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
            return (a.installment_no || 0) - (b.installment_no || 0);
        });

        const recent = sorted[sorted.length - 1]; // last installment
        const priorUnpaid = sorted.filter(
            t =>
                (parseInt(t.year) < parseInt(recent.year) ||
                    (t.year === recent.year && (t.installment_no || 0) !== (recent.installment_no || 0))) &&
                t.status.toLowerCase() !== "paid"
        );

        const hasPriorUnpaid = priorUnpaid.length > 0;
        const recentStatus = recent.status.toLowerCase(); // paid / due / delinquent

        const ordinal =
            recent.installment_no === 1 ? "1ST" :
                recent.installment_no === 2 ? "2ND" :
                    recent.installment_no === 3 ? "3RD" :
                        recent.installment_no === 4 ? "4TH" : "";

        let baseText = "";
        if (!hasPriorUnpaid && recentStatus === "paid") baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS PAID`;
        else if (!hasPriorUnpaid && (recentStatus === "due" || recentStatus === "delinquent")) baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS ${recentStatus.toUpperCase()}`;
        else if (hasPriorUnpaid && recentStatus === "paid") baseText = `PRIOR YEAR(S) TAXES ARE DUE, ${recent.year} ${ordinal} INSTALLMENT IS PAID`;
        else if (hasPriorUnpaid && (recentStatus === "due" || recentStatus === "delinquent")) baseText = `PRIOR YEAR(S) TAXES ARE DUE, ${recent.year} ${ordinal} INSTALLMENT IS ${recentStatus.toUpperCase()}`;

        return `${baseText}, NORMALLY TAXES ARE PAID QUARTERLY, NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31.`.toUpperCase();
    }

    // ---------------- ANNUAL LOGIC ----------------
    const sorted = [...taxes].sort((a, b) => parseInt(a.year) - parseInt(b.year));
    const recent = sorted[sorted.length - 1];
    const priorUnpaid = sorted.filter(t => parseInt(t.year) < parseInt(recent.year) && t.status.toLowerCase() !== "paid");
    const hasPriorUnpaid = priorUnpaid.length > 0;

    const recentStatus = recent.status.toLowerCase(); // paid / due / delinquent

    let baseText = "";
    if (hasPriorUnpaid && recentStatus === "paid") baseText = `PRIOR YEAR(S) TAXES ARE DUE, ${recent.year} TAXES ARE PAID AT DISCOUNT`;
    else if (!hasPriorUnpaid && recentStatus === "paid") baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE PAID AT DISCOUNT`;
    else if (!hasPriorUnpaid && (recentStatus === "due" || recentStatus === "delinquent")) baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE ${recentStatus.toUpperCase()}`;
    else if (hasPriorUnpaid && (recentStatus === "due" || recentStatus === "delinquent")) baseText = `PRIOR YEAR(S) TAXES ARE DUE, ${recent.year} TAXES ARE ${recentStatus.toUpperCase()}`;

    return `${baseText}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE AND DELQ DATES ARE 03/31 04/01.`.toUpperCase();
};


/* =========================
 * BUILD FINAL RESULT
 * ========================= */
const buildManateeResult = async (page, row, detail) => {
    const taxYear = Number(row.tax_year);
    const paymentType = getPaymentType(row.payment_schedule);
    const today = new Date();

    const tax_history = [];

    if (paymentType === "Installment") {
        const payments = await cl_installment_payments(page, row.detail_url);
        const dues = await cl_installment_dues(page, row.parcel_number, taxYear);

        const allInstallments = [...payments.map(p => ({ ...p, paid: true })), ...dues.map(d => ({ ...d, paid: false }))];

        const installmentDueMap = [
            { installmentNo: 1, due: "06/30", delq: "07/01" },
            { installmentNo: 2, due: "09/30", delq: "10/01" },
            { installmentNo: 3, due: "12/31", delq: "01/01" },
            { installmentNo: 4, due: "03/31", delq: "04/01" }
        ];

        allInstallments.forEach((inst, idx) => {
            const map = installmentDueMap[idx % 4];
            const yearOffset = map.installmentNo === 4 ? 1 : 0;
            const dueDateObj = new Date(`${taxYear + yearOffset}-${map.due.split('/')[0]}-${map.due.split('/')[1]}`);
            const status = inst.paid ? "Paid" : (today > dueDateObj ? "Delinquent" : "Due");

            tax_history.push({
                jurisdiction: "County",
                year: taxYear,
                bill_number: inst.paid ? inst.receipt_no : "",
                payment_type: "Installment",
                installment_no: map.installmentNo,
                status,
                base_amount: addDollar(inst.paid ? inst.amount_paid : inst.amount_due),
                amount_paid: addDollar(inst.paid ? inst.amount_paid : 0),
                amount_due: addDollar(inst.paid ? 0 : inst.amount_due),
                paid_date: inst.paid ? inst.paid_date : "-",
                mailing_date: "N/A",
                due_date: `${map.due}/${taxYear + yearOffset}`,
                delq_date: `${map.delq}/${taxYear + yearOffset}`,
                delinquent: !inst.paid && today > dueDateObj
                    ? "TAXES ARE DELINQUENT, CALL FOR PAYOFF"
                    : "NONE",
            });
        });
    } else {
        const dueYear = taxYear + 1;
        const dueDateObj = new Date(`${dueYear}-03-31`);
        const status = row.status === "Paid" ? "Paid" : (today > dueDateObj ? "Delinquent" : "Due");

        tax_history.push({
            jurisdiction: "County",
            year: taxYear,
            bill_number: "",
            payment_type: "Annual",
            status,
            base_amount: addDollar(status === "Paid" ? row.amount_paid : row.amount_due),
            amount_paid: addDollar(status === "Paid" ? row.amount_paid : 0),
            amount_due: addDollar(status !== "Paid" ? row.amount_due : 0),
            paid_date: status === "Paid" ? row.paid_date : "-",
            mailing_date: "N/A",
            due_date: `03/31/${dueYear}`,
            delq_date: `04/01/${dueYear}`,
            delinquent: status.toLowerCase() === "delinquent"
                ? "TAXES ARE DELINQUENT, CALL FOR PAYOFF"
                : "NONE",
        });
    }

    return { tax_history };
};



/* =========================
 * MAIN ACCOUNT SEARCH
 * ========================= */


const account_search = async (page, url, parcel, company = "OTHERS") => {
    // Step 1: get the current year row
    await cl_1_manatee(page, url, parcel);
    const rowCurrent = await cl_2_manatee(page);
    const currentYear = Number(rowCurrent.tax_year);

    const tax_history = [];
    let detail = null;

    // Determine how many years to fetch **only if current year is PAID**
    const isCurrentPaid = rowCurrent.status.toLowerCase() === "paid";
    const yearsToFetchCount = isCurrentPaid ? getOHCompanyYears(company) : 1;

    const taxYearsToFetch = Array.from({ length: yearsToFetchCount }, (_, i) => currentYear - i);

    for (const year of taxYearsToFetch) {
        await cl_1_manatee(page, url, parcel, year);
        const row = await cl_2_manatee(page);
        detail = await cl_3_manatee_detail(page, row.detail_url);

        const yearlyResult = await buildManateeResult(page, row, detail);
        tax_history.push(...yearlyResult.tax_history);

        // If the current year is NOT PAID, only fetch this one year and break
        if (!isCurrentPaid) break;
    }

    const notes = generateNotes(tax_history, tax_history[0]?.payment_type === "Installment");
    const isDelinquent = tax_history.some(t => t.status.toLowerCase() !== "paid");

    return {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: rowCurrent.owner_name ? [rowCurrent.owner_name] : [],
        property_address: rowCurrent.property_address || "",
        mailing_address: "",
        parcel_number: rowCurrent.parcel_number,
        total_assessed_value: addDollar(detail.assessed_value),
        total_taxable_value: addDollar(detail.assessed_value),
        taxing_authority: "Manatee County Tax Collector 819 301 Blvd W #201 Bradenton, FL 34205",
        notes,
        delinquent: isDelinquent ? "NONE" : "NONE",
        tax_history,
    };
};


/* =========================
 * EXPRESS SEARCH ROUTE
 * ========================= */
const search = async (req, res) => {
   
     const { fetch_type, account, client } = req.body;
    try {
        if (!fetch_type || !["html", "api"].includes(fetch_type)) {
            return res.status(500).render("error_data", { error: true, message: "Invalid Access" });
        }

        const url = "https://secure.taxcollector.com/ptaxweb/";
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(TIME.NAVIGATE);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const result = await account_search(page, url, account, client || "OTHERS");


        if (fetch_type === "html") res.status(200).render("parcel_data_official", result);
        else res.status(200).json({ result });

        await context.close();
    } catch (error) {
        console.error(error);
        if (req.body.fetch_type === "html") {
            res.status(500).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

module.exports = { search };