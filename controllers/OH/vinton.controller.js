// Author: Manjunath
// Fixed payment detection, notes, delinquent logic, and structure

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// ────────────────────────────── UTILITIES ──────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatDollar = (value) => {
    if (!value || value === "") return "$0.00";
    const num = parseFloat(value.toString().replace(/[$ ,()]/g, ""));
    return Number.isFinite(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const parseDollar = (str) => {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/[$ ,()]/g, "")) || 0;
};

// ────────────────────────────── VINTON CONFIG ──────────────────────────────
const vintonConfig = {
    urlBase: "https://beacon.schneidercorp.com/Application.aspx?AppID=1118&LayerID=28105&PageTypeID=4&PageID=11537&KeyValue=",
    taxing_authority: "Vinton County Treasurer, 100 E. Main St., McArthur, OH 45651, Ph: (740) 596-4571",
    dueDates: {
        due1: "03/07",
        delq1: "03/08",
        due2: "07/17",
        delq2: "07/18"
    }
};

// ────────────────────────────── STEP 1: VALIDATE & NAVIGATE ──────────────────────────────
const vinton_validate = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${vintonConfig.urlBase}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
          
            // Handle disclaimer
            const agreeBtn = await page.$('a.btn.btn-primary[data-dismiss="modal"]');
            if (agreeBtn) {
                await Promise.all([
                    agreeBtn.click(),
                    page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
                ]);
                await delay(1000);
            }

            const noRecord = await page.evaluate(() => {
                return document.querySelector('#ctlBodyPane_ctl00_ctl01_dynamicSummary_divSummary') === null;
            });

            if (noRecord) {
                return reject({ error: true, message: "Record not found or invalid parcel: " + account });
            }

            resolve(true);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// ────────────────────────────── STEP 2: EXTRACT BASIC INFO ──────────────────────────────
const vinton_extract_basic = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const basicData = await page.evaluate((account) => {
                const data = {
                    processed_date: new Date().toISOString().slice(0, 10),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [""],
                    property_address: "",
                    parcel_number: account,
                    land_value: "$0.00",
                    improvements: "$0.00",
                    total_assessed_value: "$0.00",
                    exemption: "",
                    total_taxable_value: "$0.00",
                    taxing_authority: "",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                    currentYear: ""
                };

                // Owner Name
                const ownerEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch") ||
                                document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch");
                data.owner_name[0] = ownerEl ? ownerEl.textContent.trim() : "N/A";

                // Property Address
                const addrEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_lblOwnerAddress");
                if (addrEl) {
                    let addr = addrEl.textContent.trim().replace(/\s+/g, " ");
                    addr = addr.replace(/,?\s*COLUMBUS,?\s*/gi, "").trim();
                    if (addr && !/OH\s+45651/i.test(addr)) {
                        addr = `${addr}, MCARTHUR, OH 45651`;
                    }
                    data.property_address = addr;
                }

                // Parcel Number (fallback)
                const parcelEl = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummary_rptrDynamicColumns_ctl00_pnlSingleValue span");
                data.parcel_number = parcelEl ? parcelEl.textContent.trim() : account;

                // Valuation
                const valTable = document.querySelector("#ctlBodyPane_ctl13_ctl01_grdValuation_grdYearData");
                if (valTable) {
                    const rows = valTable.querySelectorAll("tbody tr");
                    rows.forEach(row => {
                        const label = row.querySelector("th")?.textContent.trim();
                        const value = row.querySelector("td.value-column")?.textContent.trim();

                        if (label === "Land Value") data.land_value = value || "$0.00";
                        if (label === "Improvements Value") data.improvements = value || "$0.00";
                        if (label === "Total Value (Appraised 100%)") data.total_assessed_value = value || "$0.00";
                        if (label === "Total Value (Assessed 35%)") data.total_taxable_value = value || "$0.00";
                    });
                }

                return data;
            }, account);

            basicData.taxing_authority = vintonConfig.taxing_authority;
            resolve(basicData);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// ────────────────────────────── STEP 3: EXTRACT TAX HISTORY (MAIN FIXES HERE) ──────────────────────────────
const vinton_extract_tax_history = async (page, basicData, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const currentDate = new Date();

            const allHistory = [];
            const delinquentInstallments = [];
            let latestTaxYear = "";

            // Get payment dates from payments table
            const paymentMap = await page.evaluate(() => {
                const map = {};
                const table = document.querySelector("#ctlBodyPane_ctl17_ctl01_grdPayments");
                if (!table) return map;

                const rows = table.querySelectorAll("tbody tr");
                rows.forEach(row => {
                    const cells = row.querySelectorAll("td, th");
                    if (cells.length >= 2) {
                        const yearText = cells[0].textContent.trim(); // "2024 Payable 2025"
                        const paidDate = cells[1].textContent.trim();
                        const match = yearText.match(/(\d{4})\s+Payable\s+(\d{4})/);
                        if (match && paidDate && /\d{1,2}\/\d{1,2}\/\d{4}/.test(paidDate)) {
                            const key = `${match[1]}-${match[2]}`;
                            if (!map[key]) map[key] = [];
                            map[key].push(paidDate);
                        }
                    }
                });
                return map;
            });

            // Get all expandable tax year buttons
            const taxSections = await page.evaluate(() => {
                const sections = [];
                document.querySelectorAll('[id^="btndiv"]').forEach(btn => {
                    const text = btn.textContent.trim();
                    const match = text.match(/(\d{4})\s+Payable\s+(\d{4})/);
                    if (match) {
                        sections.push({
                            taxYear: match[1],
                            payYear: match[2],
                            btnId: btn.id
                        });
                    }
                });
                return sections;
            });

            for (const section of taxSections) {
                const { taxYear, payYear, btnId } = section;
                const yearLabel = `${taxYear}-${payYear}`;
                if (taxYear > latestTaxYear) latestTaxYear = taxYear;

                // Expand section
                await page.evaluate((id) => {
                    const btn = document.getElementById(id);
                    if (btn && btn.getAttribute("aria-expanded") === "false") btn.click();
                }, btnId);
                await delay(600);

                // Extract tax details
                const detail = await page.evaluate((taxYear) => {
                    const div = document.getElementById(`div${taxYear}`);
                    if (!div || div.style.display === "none") return null;

                    const table = div.querySelector("table.tabular-data");
                    if (!table) return null;

                    const rows = table.querySelectorAll("tbody tr");
                    const data = { net1st: "$0.00", net2nd: "$0.00", collected1st: "$0.00", collected2nd: "$0.00", balance1st: "$0.00", balance2nd: "$0.00" };

                    rows.forEach(row => {
                        const label = row.querySelector("th")?.textContent.trim();
                        const [v1, v2] = row.querySelectorAll("td");
                        if (!label || !v1 || !v2) return;
                        const val1 = v1.textContent.trim();
                        const val2 = v2.textContent.trim();

                        if (label === "Net General:") { data.net1st = val1; data.net2nd = val2; }
                        if (label === "Collected:") { data.collected1st = val1; data.collected2nd = val2; }
                        if (label === "Balance:") { data.balance1st = val1; data.balance2nd = val2; }
                    });

                    return data;
                }, taxYear);

                if (!detail) continue;

                const payments = paymentMap[yearLabel] || [];
                const paidDate1st = payments[0] || "-";
                const paidDate2nd = payments[1] || payments[0] || "-";

                // 1st Half
                const base1st = parseDollar(detail.net1st);
                const paid1st = Math.abs(parseDollar(detail.collected1st));
                const due1st = parseDollar(detail.balance1st);

                const delqDate1st = new Date(`${vintonConfig.dueDates.delq1}/${payYear}`);
                delqDate1st.setFullYear(parseInt(payYear));
                const status1st = due1st > 0.01 
                    ? (currentDate >= delqDate1st ? "Delinquent" : "Due")
                    : "Paid";

                if (base1st > 0) {
                    allHistory.push({
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        installment: "1",
                        status: status1st,
                        base_amount: formatDollar(base1st),
                        amount_paid: formatDollar(paid1st),
                        amount_due: due1st > 0.01 ? formatDollar(due1st) : "$0.00",
                        due_date: `${vintonConfig.dueDates.due1}/${payYear}`,
                        delq_date: `${vintonConfig.dueDates.delq1}/${payYear}`,
                        paid_date: status1st === "Paid" ? (paidDate1st !== "-" ? paidDate1st : "N/A") : paidDate1st,
                        mailing_date: "N/A",
                        good_through_date: ""
                    });
                    if (status1st === "Delinquent") delinquentInstallments.push(allHistory[allHistory.length - 1]);
                }

                // 2nd Half
                const base2nd = parseDollar(detail.net2nd);
                const paid2nd = Math.abs(parseDollar(detail.collected2nd));
                const due2nd = parseDollar(detail.balance2nd);

                const delqDate2nd = new Date(`${vintonConfig.dueDates.delq2}/${payYear}`);
                delqDate2nd.setFullYear(parseInt(payYear));
                const status2nd = due2nd > 0.01 
                    ? (currentDate >= delqDate2nd ? "Delinquent" : "Due")
                    : "Paid";

                if (base2nd > 0) {
                    allHistory.push({
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        installment: "2",
                        status: status2nd,
                        base_amount: formatDollar(base2nd),
                        amount_paid: formatDollar(paid2nd),
                        amount_due: due2nd > 0.01 ? formatDollar(due2nd) : "$0.00",
                        due_date: `${vintonConfig.dueDates.due2}/${payYear}`,
                        delq_date: `${vintonConfig.dueDates.delq2}/${payYear}`,
                        paid_date: status2nd === "Paid" ? (paidDate2nd !== "-" ? paidDate2nd : "N/A") : paidDate2nd,
                        mailing_date: "N/A",
                        good_through_date: ""
                    });
                    if (status2nd === "Delinquent") delinquentInstallments.push(allHistory[allHistory.length - 1]);
                }
            }

            // Sort history: oldest to newest
            allHistory.sort((a, b) => {
                const ya = parseInt(a.year.split('-')[0]);
                const yb = parseInt(b.year.split('-')[0]);
                if (ya !== yb) return ya - yb;
                return a.installment === "1" ? -1 : 1;
            });

            // Keep latest N years + any delinquent
            const uniqueYears = [...new Set(allHistory.map(h => h.year.split('-')[0]))].sort();
            const latestNYears = uniqueYears.slice(-yearsRequested);
            let finalHistory = allHistory.filter(h => latestNYears.includes(h.year.split('-')[0]));

            delinquentInstallments.forEach(delq => {
                if (!finalHistory.some(h => h.year === delq.year && h.installment === delq.installment)) {
                    finalHistory.push(delq);
                }
            });

            finalHistory.sort((a, b) => {
                const ya = parseInt(a.year.split('-')[0]);
                const yb = parseInt(b.year.split('-')[0]);
                if (ya !== yb) return ya - yb;
                return a.installment === "1" ? -1 : 1;
            });

            basicData.tax_history = finalHistory;

            // ────────────────── NOTES: TRUMBULL STYLE (CLEAR 1ST/2ND INSTALLMENT STATUS) ──────────────────
            const currentYearLabel = latestTaxYear ? `${latestTaxYear}-${parseInt(latestTaxYear) + 1}` : "";
            const currentEntries = finalHistory.filter(i => i.year === currentYearLabel);

            let noteParts = [];

            if (currentEntries.length > 0) {
                const first = currentEntries.find(i => i.installment === "1") || { status: "Paid" };
                const second = currentEntries.find(i => i.installment === "2") || { status: "Paid" };

                noteParts.push(`${currentYearLabel}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
            } else if (latestTaxYear) {
                noteParts.push(`${currentYearLabel}: NO TAXES DUE, POSSIBLY EXEMPT`);
            } else {
                noteParts.push("NO TAX DATA AVAILABLE");
            }

            const hasPriorDelq = allHistory.some(i => {
                const y = parseInt(i.year.split('-')[0]);
                return y < parseInt(latestTaxYear || 0) && i.status === "Delinquent";
            });

            if (hasPriorDelq) {
                noteParts.unshift("PRIOR YEARS TAXES ARE DELINQUENT");
            } else {
                noteParts.unshift("ALL PRIORS ARE PAID");
            }

            noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE ${vintonConfig.dueDates.due1} & ${vintonConfig.dueDates.due2}`);

            basicData.notes = noteParts.join(", ");
            basicData.delinquent = delinquentInstallments.length > 0 ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            resolve(basicData);
        } catch (err) {
            reject({ error: true, message: err.message });
        }
    });
};

// ────────────────────────────── MAIN SEARCH ──────────────────────────────
const vinton_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            await vinton_validate(page, account);
            const basicData = await vinton_extract_basic(page, account);
            const finalData = await vinton_extract_tax_history(page, basicData, yearsRequested);
            resolve(finalData);
        } catch (error) {
            reject(error);
        }
    });
};

// ────────────────────────────── EXPRESS ROUTE ──────────────────────────────
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    try {
        if (!account || account.trim() === '') {
            return res.status(200).render("error_data", { error: true, message: "Enter the Account Number..." });
        }

        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

        let yearsRequested = getOHCompanyYears(client);

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            vinton_search(page, account, yearsRequested)
                .then(data => res.status(200).render("parcel_data_official", data))
                .catch(err => res.status(200).render('error_data', { error: true, message: err.message || err }))
                .finally(async () => await context.close());
        } else if (fetch_type === "api") {
            vinton_search(page, account, yearsRequested)
                .then(data => res.status(200).json({ result: data }))
                .catch(err => res.status(500).json({ error: true, message: err.message || "Server Error" }))
                .finally(async () => await context.close());
        }
    } catch (error) {
        console.error("Vinton search error:", error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: "Server Error" });
        } else {
            res.status(500).json({ error: true, message: "Server Error" });
        }
    }
};

module.exports = { search };