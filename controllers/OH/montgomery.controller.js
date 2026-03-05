// Author: poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 };

// ---------------------------------------------------------------------------
// TAX STATUS CALCULATOR
// ---------------------------------------------------------------------------
const calculateTaxStatus = (taxHistory, currentDate = new Date()) => {
    return taxHistory.map(item => {
        const taxYear = Number(item.year);
        const payableYear = taxYear + 1;

        // Default due dates
        let dueDate;
        if (item.half === "First Half") {
            dueDate = new Date(payableYear, 1, 14); // Feb 14
        } else if (item.half === "Second Half") {
            dueDate = new Date(payableYear, 6, 18); // July 18
        } else {
            dueDate = new Date(payableYear, 11, 31);
        }

        const delqDate = new Date(dueDate);
        delqDate.setDate(dueDate.getDate() + 1);

        // Parse amounts
        const baseAmount = Number(item.base_amount.replace(/[^0-9.-]/g, "")) || 0;
        const paidAmount = Number(item.amount_paid?.replace(/[^0-9.-]/g, "") || 0);

        // Fully paid
        if (paidAmount >= baseAmount && baseAmount > 0) {
            return {
                ...item,
                status: "Paid",
                delinquent: "NONE",
                amount_due: "$0.00",
                amount_paid: `$${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                paid_date: item.paid_date || "N/A",
                due_date: `${(dueDate.getMonth() + 1).toString().padStart(2, '0')}/${dueDate.getDate().toString().padStart(2, '0')}/${dueDate.getFullYear()}`,
                delq_date: `${(delqDate.getMonth() + 1).toString().padStart(2, '0')}/${delqDate.getDate().toString().padStart(2, '0')}/${delqDate.getFullYear()}`,
            };
        }

        // Partial payment or unpaid
        const status = currentDate > dueDate ? "Delinquent" : "Due";
        return {
            ...item,
            status,
            delinquent: status === "Delinquent" ? "YES" : "NONE",
            amount_due: `$${(baseAmount - paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            due_date: `${(dueDate.getMonth() + 1).toString().padStart(2, '0')}/${dueDate.getDate().toString().padStart(2, '0')}/${dueDate.getFullYear()}`,
            delq_date: `${(delqDate.getMonth() + 1).toString().padStart(2, '0')}/${delqDate.getDate().toString().padStart(2, '0')}/${delqDate.getFullYear()}`,
            amount_paid: `$${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            paid_date: item.paid_date || "-"
        };
    });
};



// ---------------------------------------------------------------------------
// CORE SCRAPER - AC1
// ---------------------------------------------------------------------------

const ac_1 = async (page, parcelId, yearLimit = 2) => {
    if (!parcelId) throw new Error("Parcel ID is required");

    // clamp yearLimit
    yearLimit = Math.min(Math.max(Number(yearLimit) || 2, 1), 2); // clamp between 1 and 2


    const latestPayableYear = new Date().getFullYear() - 1; // e.g., 2025
    const taxYears = [];
    for (let i = 0; i < yearLimit; i++) {
        taxYears.push(latestPayableYear - i);
    }

    let basicData = null;
    let currentValues = null;
    let allTaxHistory = [];

    for (const taxYear of taxYears) {
        const treasurerUrl = `https://go.mcohio.org/applications/treasurer/search/master.cfm?parid=${encodeURIComponent(parcelId)}&taxyr=${taxYear}&own1=`;
        await page.goto(treasurerUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

        // -----------------------------
        // BASIC DATA (latest year only)
        // -----------------------------
        if (!basicData) {
            basicData = await page.evaluate(() => {
                const result = { parcel_number: "", owner_name: "", tax_year: "", property_address: "" };
                const headerTable = document.querySelector("form table table[border='1'], form table table[bordercolor]");
                if (headerTable) {
                    const tds = Array.from(headerTable.querySelectorAll("td"));
                    const parcelCell = tds.find(td => td.innerText.includes("Current Parcel ID:"));
                    if (parcelCell) result.parcel_number = parcelCell.innerText.split("\n")[1]?.trim() ?? "";

                    const ownerCell = tds.find(td => td.innerText.includes("Property Owner for Selected Year:"));
                    if (ownerCell) result.owner_name = ownerCell.innerText.replace("Property Owner for Selected Year:", "").trim();

                    const select = headerTable.querySelector("select[name='taxyear']");
                    if (select) result.tax_year = select.value || "";
                }

                const parcelTables = [...document.querySelectorAll("table")].filter(t => t.innerText.includes("Parcel"));
                for (const tbl of parcelTables) {
                    const rows = [...tbl.querySelectorAll("tr")];
                    for (const row of rows) {
                        const cells = row.querySelectorAll("td");
                        if (cells.length === 2 && cells[0].innerText.trim() === "Address") {
                            result.property_address = cells[1].innerText.replace(/\u00a0/g, "").trim();
                            break;
                        }
                    }
                    if (result.property_address) break;
                }
                return result;
            });

            currentValues = await page.evaluate(() => {
                const tbl = [...document.querySelectorAll("table")].find(t => t.innerText.includes("Current Values"));
                if (!tbl) return { total: "0" };

                const rows = [...tbl.querySelectorAll("tr")];
                const totalRow = rows.find(r => r.querySelector("td")?.innerText.trim() === "Total");

                const clean = v => v?.replace(/,/g, "").replace(/[^\d.-]/g, "") || "0";
                return { total: totalRow ? clean(totalRow.querySelectorAll("td")[2]?.innerText) : "0" };
            });
        }

        // -----------------------------
        // TAXES TAB
        // -----------------------------
        const onTaxesPage = await page.evaluate(() =>
            document.body.innerText.includes("First Half") && document.body.innerText.includes("Second Half")
        );
        if (!onTaxesPage) {
            const tab = await page.$("a[href*='taxes.cfm']");
            if (tab) {
                await Promise.all([tab.click(), page.waitForNavigation({ waitUntil: "domcontentloaded" })]);
            }
        }


        // -----------------------------
        // TAX HISTORY (ALL ROWS)
        // -----------------------------
        const taxHistory = await page.evaluate(() => {
            const yearStr = document.querySelector("select[name='taxyear']")?.value?.trim();
            if (!yearStr || isNaN(Number(yearStr))) return [];
            const year = Number(yearStr);

            const extractHalf = (label, dueMonth, dueDay) => {
                const tbl = [...document.querySelectorAll("table")].find(t =>
                    t.innerText.includes(label) &&
                    (t.innerText.includes(year.toString()) || t.closest("div, section, tr")?.innerText.includes(year.toString()))
                );
                if (!tbl) return [];

                const rows = [...tbl.querySelectorAll("tr")];
                let totalCharge = 0;
                for (const row of rows) {
                    const cols = row.querySelectorAll("td");
                    if (cols.length < 3) continue;
                    const text = cols[0].innerText.trim().toLowerCase();
                    if (text.includes("tax year") || text.includes("sub-total")) continue;
                    const chargeStr = (cols[2]?.innerText || "$0").replace(/[^0-9.-]/g, "");
                    totalCharge += parseFloat(chargeStr) || 0;
                }
                if (totalCharge === 0) return [];

                return [{
                    jurisdiction: "County",
                    year: year.toString(),
                    half: label,
                    payment_type: "Semi-Annual",
                    base_amount: `$${totalCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    amount_paid: "$0.00",
                    paid_date: "-",
                    mailing_date: "N/A"
                }];
            };

            return [
                ...extractHalf("First Half", 2, 14),
                ...extractHalf("Second Half", 7, 18)
            ];
        });



        // -----------------------------
        // CLICK PAYMENTS LINK AND SCRAPE PAYMENT DATES
        // -----------------------------
        const payments = await page.evaluate(() => {
            const link = [...document.querySelectorAll("a")].find(a => a.innerText.includes("Payments"));
            return link ? link.getAttribute("href") : null;
        });

        let paymentData = [];
        if (payments) {
            // Navigate to payment page
            await page.goto(`https://go.mcohio.org/applications/treasurer/search/${payments}`, { waitUntil: "domcontentloaded" });

            paymentData = await page.evaluate(() => {
                const rows = [...document.querySelectorAll("tr")].filter(r =>
                    r.querySelectorAll("td").length === 2
                );
                return rows.map(r => {
                    const cols = r.querySelectorAll("td");
                    return {
                        paid_date: cols[0]?.innerText.trim() || "-",
                        paid_amount: cols[1]?.innerText.trim() || "$0.00"
                    };
                });
            });
        }

        // -----------------------------
        // MERGE PAYMENT DATA INTO TAX HISTORY
        // -----------------------------

        const taxHistoryWithPayments = taxHistory.map(th => {
            const baseNum = Number(th.base_amount.replace(/[^0-9.-]/g, "")) || 0;

            // Filter paymentData for this tax year
            const matchedPayment = paymentData.find(p => {
                if (!p.paid_date || !p.paid_amount) return false;

                // Convert MM-DD-YYYY -> Date
                const [month, day, year] = p.paid_date.split('-').map(Number);
                const paidDate = new Date(year, month - 1, day);

                // Match the payment year to tax year + 1 (due year)
                const dueYear = Number(th.year) + 1;
                if (paidDate.getFullYear() !== dueYear) return false;

                // Match by half
                if (th.half === "First Half" && month <= 6) return true;
                if (th.half === "Second Half" && month > 6) return true;

                return false;
            });

            if (matchedPayment) {
                // Convert paid_date to MM/DD/YYYY
                const [m, d, y] = matchedPayment.paid_date.split('-').map(Number);
                const formattedDate = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;

                return {
                    ...th,
                    amount_paid: matchedPayment.paid_amount,
                    paid_date: formattedDate
                };
            }

            return th;
        });


        allTaxHistory.push(...taxHistoryWithPayments);
    }

    // -----------------------------
    // HARD DEDUP
    // -----------------------------
    const seen = new Set();
    allTaxHistory = allTaxHistory.filter(r => {
        const key = `${r.year}-${r.half}-${r.paid_date || r.due_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return { ...basicData, currentValues, tax_history: allTaxHistory };
};


// ---------------------------------------------------------------------------
// AC2 (BUILD OUTPUT)
// ---------------------------------------------------------------------------
const ac_2 = async (page, ac1_data) => {
    const taxHistory = ac1_data.tax_history || [];

    // Determine the latest year available in tax history
    const availableYears = taxHistory.map(t => Number(t.year));
    const latestYear = Math.max(...availableYears);

    // Use latest year from dropdown / scraped data
    const currentDate = new Date();
    let currentTaxYear = latestYear;

    const processedHistory = calculateTaxStatus(taxHistory, currentDate);

    const currentValues = ac1_data.currentValues || { total: "0" };

    const formatDollar = (value) => {
        const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
        if (isNaN(num)) return "$0";
        return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const datum = {
        processed_date: currentDate.toISOString().split("T")[0],
        owner_name: ac1_data.owner_name ? [ac1_data.owner_name] : [""],
        property_address: ac1_data.property_address,
        parcel_number: ac1_data.parcel_number,
        total_assessed_value: formatDollar(currentValues.total),
        total_taxable_value: formatDollar(currentValues.total),
        taxing_authority: "Montgomery County Treasurer, 451 W 3rd St, Dayton, OH 45422, Ph: 937-225-4315",
        notes: "",
        delinquent: processedHistory.some(t => t.delinquent === "YES") ? "TAXES ARE DELINQUENT" : "NONE",
        tax_history: processedHistory
    };

    const currentYearPayment = processedHistory.find(p => p.year === currentTaxYear.toString());
    let currentNote =
        currentYearPayment
            ? currentYearPayment.status === "Delinquent"
                ? `${currentTaxYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATE IS 02/14 07/18`
                : currentYearPayment.status === "Due"
                    ? `${currentTaxYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATE IS 02/14 07/18`
                    : `${currentTaxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATE IS 02/14 07/18`
            : `${currentTaxYear} NO TAXES FOUND`;

    const priorDelinquent = processedHistory.some(p => p.status === "Delinquent" && +p.year < currentTaxYear);
    const priorNote = priorDelinquent ? "PRIOR YEAR(S) TAXES ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    datum.notes = `${priorNote}, ${currentNote}`;

    return datum;
};

// ---------------------------------------------------------------------------
// ACCOUNT SEARCH
// ---------------------------------------------------------------------------
const account_search = async (page, parcelId, client) => {
    // Always fetch 2 years for API (accurate)
    let yearLimit = 2;

    // Optional: override for specific clients
    if (client) {
        const y = Number(getOHCompanyYears(client));
        if (!isNaN(y) && y > 0) yearLimit = Math.min(y, 2);
    }

    const ac1_data = await ac_1(page, parcelId, yearLimit);
    const data = await ac_2(page, ac1_data);

    return data;
};

// ---------------------------------------------------------------------------
// MAIN ENTRY
// ---------------------------------------------------------------------------
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    try {
        if (!["html", "api"].includes(fetch_type)) {
            return res.status(400).json({ error: true, message: "Invalid Access" });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
        );

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        // Pass client to account_search, NOT yearLimit
        const data = await account_search(page, account, client);

        if (fetch_type === "api") res.status(200).json({ result: data });
        else res.status(200).render("parcel_data_official", data);

        await context.close();
    } catch (error) {
        console.error(error);
        if (fetch_type === "api") res.status(500).json({ error: true, message: error.message });
        else res.status(200).render("error_data", { error: true, message: error.message });
    }
};


export { search };