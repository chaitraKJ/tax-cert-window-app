//author:Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import fs from "fs";
import PDFParser from "pdf2json";
import base64 from "base64topdf";

const pdfDir = "/tmp/pdfs";

// --- UTILS ---
const parseCurrency = (str) => {
    if (!str) return 0;
    const sign = str.includes("(") && str.includes(")") ? -1 : 1;
    return parseFloat(str.replace(/[$,()]/g, "")) * sign || 0;
};

const calculateDelinquencyDate = (dueDate) => {
    if (!dueDate || dueDate.includes("N/A")) return "";
    const [month, day, year] = dueDate.split("/").map((s) => parseInt(s, 10));
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${m}/${d}/${date.getFullYear()}`;
};

// --- STEP 1: HTML ---
const ac_1 = async (page, account) => {
    const url = `https://dial.deschutes.org/Real/Index/${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const mailing_name = await page.evaluate(() => {
        const el = document.querySelector(".uxAccountInformation strong");
        if (el && el.textContent.includes("Mailing Name:"))
            return el.nextSibling?.textContent?.trim() || "N/A";
        return "N/A";
    });

    let situs_address = "N/A";
    try {
        situs_address = await page.$eval("#uxSitusAddress", (el) => el.textContent.trim());
    } catch { }

    let total_assessed_value = "$0.00";
    try {
        total_assessed_value = await page.$eval(
            "#uxReportRightColumn table.dataTable:nth-of-type(2) tr:nth-child(2) td:nth-child(2)",
            (el) => el.textContent.trim()
        );
    } catch { }

    return {
        owner_name: [mailing_name],
        property_address: situs_address,
        situs_address,
        parcel_number: account,   // add this
        total_assessed_value,
        total_taxable_value: total_assessed_value,
        taxing_authority: "Deschutes County, Oregon",
        tax_history: [],
        delinquent: "",
        notes: "",
    };
};


// --- STEP 2: PDF ---
const ac_2 = async (main_data, account) => {
    const pdfUrl = `https://dial.deschutes.org/API/Real/GetReport/${account}?report=TaxSummary&type=R`;
    await fs.promises.mkdir(pdfDir, { recursive: true });
    const path = `${pdfDir}/${Date.now()}-${account}.pdf`;

    const res = await fetch(pdfUrl);
    if (!res.ok) throw new Error(`Failed to download PDF (${res.status})`);

    const arrayBuf = await res.arrayBuffer();
    const base64Str = Buffer.from(arrayBuf).toString("base64");
    base64.base64Decode(base64Str, path);

    return new Promise((resolve, reject) => {
        const parser = new PDFParser();
        parser.loadPDF(path);

        parser.on("pdfParser_dataError", (errData) => reject(new Error(errData.parserError)));

        parser.on("pdfParser_dataReady", async (pdfData) => {
            try {
                const lines = [];
                pdfData.Pages.forEach((page) =>
                    page.Texts.forEach((t) => {
                        const text = decodeURIComponent(t.R[0].T).trim();
                        if (text) lines.push(text);
                    })
                );

                const taxes = [];
                const paidYears = [];

                for (let i = 0; i < lines.length; i++) {
                    if (/^\d{4}$/.test(lines[i])) {
                        const year = parseInt(lines[i]);
                        const currentDueStr = lines[i + 3] ?? "$0.00";
                        const originalDueStr = lines[i + 6] ?? "$0.00";

                        const amount_due_num = parseCurrency(currentDueStr);
                        const original_num = parseCurrency(originalDueStr);

                        const dueDatesTrimester = [
                            `11/15/${year}`,
                            `02/15/${year + 1}`,
                            `05/15/${year + 1}`,
                        ];

                        if (amount_due_num === 0) {
                            // Paid year
                            paidYears.push({ year, original_num });
                        } else {
                            const trimesterAmount = (original_num / 3).toFixed(2);
                            const today = new Date();

                            dueDatesTrimester.forEach((dueDate, idx) => {
                                const delqDate = calculateDelinquencyDate(dueDate);
                                const due = new Date(dueDate);
                                const delinquent = new Date(delqDate);

                                let status = "Due"; // Default if before due date
                                if (today > delinquent) status = "Delinquent";
                                else if (today > due) status = "Due";

                                taxes.push({
                                    jurisdiction: "County",
                                    year,
                                    payment_type: `Trimester ${idx + 1}`,
                                    status,
                                    base_amount: `$${original_num}`,
                                    amount_paid: "$0.00",
                                    amount_due: `$${trimesterAmount}`,
                                    mailing_date: "N/A",
                                    due_date: dueDate,
                                    delq_date: delqDate,
                                    paid_date: "",
                                    good_through_date: "",
                                });
                            });
                        }


                        i += 6;
                    }
                }

                // Include only the most recent paid year if no unpaid taxes
                if (taxes.length === 0 && paidYears.length) {
                    const lastPaid = paidYears.reduce((a, b) => (b.year > a.year ? b : a));
                    const lastPaidDueDate = `11/15/${lastPaid.year}`;
                    taxes.push({
                        jurisdiction: "County",
                        year: lastPaid.year,
                        payment_type: "Annual",
                        status: "Paid",
                        base_amount: `$${lastPaid.original_num.toFixed(2)}`,
                        amount_paid: `$${lastPaid.original_num.toFixed(2)}`,
                        amount_due: "$0.00",
                        mailing_date: "N/A",
                        due_date: lastPaidDueDate,
                        delq_date: calculateDelinquencyDate(lastPaidDueDate),
                        paid_date: lastPaidDueDate,
                        good_through_date: "",
                    });
                }

                main_data.tax_history = taxes;
                // --- FINAL DELINQUENT FLAG (REVISED) ---
                let hasDue = taxes.some((t) => t.status === "Due");
                let hasDelq = taxes.some((t) => t.status === "Delinquent");

                if (hasDelq) {
                    main_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
                } else if (hasDue) {
                    main_data.delinquent = "YES";
                } else {
                    main_data.delinquent = "NONE";
                }


                // Notes
                let notesArr = [];

                const statusesByYear = {};
                taxes.forEach((t) => {
                    const y = parseInt(t.year);
                    if (!statusesByYear[y]) statusesByYear[y] = [];
                    statusesByYear[y].push(t.status);
                });

                const allYears = Object.keys(statusesByYear).map((y) => parseInt(y));
                const latestYear = Math.max(...allYears);

                let hasDelinquent = false;
                let priorStatus = "PAID";
                let currentStatus = "PAID";

                // Determine year-wise statuses
                for (const [year, statuses] of Object.entries(statusesByYear)) {
                    const uniqueStatuses = [...new Set(statuses)];
                    const hasD = uniqueStatuses.includes("Delinquent");
                    const hasU = uniqueStatuses.includes("Due");
                    const hasDueNow = uniqueStatuses.includes("Due");

                    if (parseInt(year) < latestYear) {
                        if (hasD) priorStatus = "DELINQUENT";
                        else if (hasU || hasDueNow) priorStatus = "DUE";
                        else priorStatus = "PAID";
                    }

                    if (parseInt(year) === latestYear) {
                        if (hasD) currentStatus = "DELINQUENT";
                        else if (hasU) currentStatus = "DUE";
                        else if (hasDueNow) currentStatus = "DUE";
                        else currentStatus = "PAID";
                    }

                    if (hasD) hasDelinquent = true;
                }

                // --- Handle priors even if missing in data ---
                if (allYears.length === 1) {
                    // Only one year in tax history → assume priors are paid
                    priorStatus = "PAID";
                }

                // --- Compose readable notes ---
                if (priorStatus === "DELINQUENT") {
                    notesArr.push("PRIOR YEAR TAXES ARE DELINQUENT");
                } else if (priorStatus === "DUE") {
                    notesArr.push("PRIORS ARE DUE");
                } else if (priorStatus === "PAID" && allYears.length >= 1) {
                    notesArr.push("ALL PRIORS ARE PAID");
                }

                if (currentStatus === "DELINQUENT") {
                    notesArr.push(`${latestYear} TAXES ARE DELINQUENT`);
                } else if (currentStatus === "DUE") {
                    notesArr.push(`${latestYear} TAXES ARE DUE`);
                } else if (currentStatus === "DUE") {
                    notesArr.push(`${latestYear} TAXES ARE DUE`);
                } else if (priorStatus === "PAID" && currentStatus === "PAID") {
                    notesArr.push("ALL TAXES ARE PAID");
                }

                // Always include base note
                notesArr.push(
                    "NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, AND 05/15"
                );

                // Final delinquency flag
                main_data.notes = notesArr.join(", ");

                // --- SORT TAX HISTORY BY YEAR (ascending) ---
                if (Array.isArray(main_data.tax_history)) {
                    main_data.tax_history.sort((a, b) => Number(a.year) - Number(b.year));
                }

                fs.unlink(path, () => { });
                resolve(main_data);

            } catch (err) {
                reject(new Error(err.message));
            }
        });
    });
};

// --- CHAIN ---
const account_search = async (page, account) => {
    const data1 = await ac_1(page, account);
    const data2 = await ac_2(data1, account);
    return data2;
};

// --- CONTROLLER ---
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!account) return res.status(400).json({ error: true, message: "Account is required." });
        if (!["html", "api"].includes(fetch_type))
            return res.status(400).json({ error: true, message: "Invalid fetch_type." });

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image") req.abort();
            else req.continue();
        });

        const data = await account_search(page, account);

        if (fetch_type === "html") res.status(200).render("parcel_data_official", data);
        else res.status(200).json({ result: data });

        await context.close();
    } catch (err) {
        console.log(err);
        res.status(fetch_type === "html" ? 200 : 500).json({ error: true, message: err.message });
    }
};

export { search };