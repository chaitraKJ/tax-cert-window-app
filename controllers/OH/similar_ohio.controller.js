// AUTHOR: MANJUNADH

// Ohio Tax Scraper for ( multiple Counties )

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 };
const waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ----------------------- Custom Error Class -----------------------
class ScrapingError extends Error {
    constructor(message, type = 'unknown', county = '', account = '') {
        super(message);
        this.name = 'ScrapingError';
        this.type = type;        // 'captcha' | 'notFound' | 'timeout' | 'sessionExpired' | 'config'
        this.county = county;
        this.account = account;
    }
}

// ----------------------- Config -----------------------
const counties = {
    fayette: {
        url: "https://www.fayettecountyauditor.org/Search/Name",
        taxing_authority: "Fayette County Auditor & Treasurer — 133 S Main St, Washington Court House, OH 43160",
        city: "WASHINGTON CH",
        zip: "43160",
        dueDates: { first: "03/01", second: "08/01" }
    },
    greene: {
        url: "https://auditor.greenecountyohio.gov/Search/Name",
        taxing_authority: "Greene County Auditor & Treasurer — 69 Greene St, Xenia, OH 45385, Ph: (937) 562-5065 / (937) 562-5017",
        city: "XENIA",
        zip: "45385",
        dueDates: { first: "02/28", second: "07/18" }
    },
    erie: {
        url: "https://auditor.eriecounty.oh.gov/Search/Name",
        taxing_authority: "Erie County Auditor & Treasurer — 247 Columbus Ave, Sandusky, OH 44870, Ph: (419) 627-7743 / (419) 627-7625",
        city: "SANDUSKY",
        zip: "44870",
        dueDates: { first: "03/09", second: "07/16" }
    },
    brown: {
        url: "https://realestate.browncountyauditor.org/Search/Name",
        taxing_authority: "Brown County Auditor — 800 Mt Orab Pike, Suite 181, Georgetown, OH 45121, Ph: (937) 378-6398 / Fax: (937) 378-6038",
        city: "Georgetown",
        zip: "45121",
        dueDates: { first: "02/12", second: "07/02" }
    },
    seneca: {
        url: "https://senecacountyauditoroh.gov/Search/Name",
        taxing_authority: "Seneca County Treasurer — 109 South Washington St, Suite 2105, Tiffin, OH 44883, Ph: (419) 447-1584 / Fax: (419) 443-7920",
        city: "Tiffin",
        zip: "44883",
        dueDates: { first: "02/20", second: "07/17" }
    },
    belmont: {
        url: "https://belmontcountyauditor.org/Search/Owner",
        taxing_authority: "Belmont County Treasurer - 101 W Main St, St Clairsville, OH 43950, ph: (740) 699-2145 / Fax: (740) 699-2567",
        city: "St Clairsville",
        zip: "43950",
        dueDates: { first: "02/21", second: "07/18" }
    },
    clinton: {
        url: "https://clintoncountyauditor.org/Search/Owner",
        taxing_authority: "Clinton County Treasurer - 46 S South St#203, Wilmington, OH 45177, ph: (937) 382-2200, fax: (937) 382-7770",
        city: "Wilmington",
        zip: "45177",
        dueDates: { first: "02/14", second: "07/20" }
    },
    logan: {
        url: "https://realestate.logancountyohio.gov/Search/Number",
        taxing_authority: "Logan County Treasurer — 100 S. Madriver Street, Suite D, Bellefontaine, OH 43311, Ph: (937) 599-7223",
        city: "Bellefontaine",
        zip: "43311",
        dueDates: { first: "02/12", second: "07/09" }
    },
    tuscarawas: {
        url: "https://auditor.co.tuscarawas.oh.us/Search/Owner",
        taxing_authority: "Tuscarawas County Treasurer — 125 E High Ave, New Philadelphia, OH 44663, Ph: (330) 365-3254 / Fax: (330) 364-8811",
        city: "New Philadelphia",
        zip: "44663",
        dueDates: { first: "02/21", second: "07/18" }
    },
    muskingum: {
        url: "https://www.muskingumcountyauditor.org/Search",
        taxing_authority: "Muskingum County Auditor & Treasurer — 401 Main St, Zanesville, OH 43701",
        city: "ZANESVILLE",
        zip: "43701",
        dueDates: { first: "02/20", second: "06/18" }
    },
    holmes: {
        url: "https://www.holmescountyauditor.org/Search/Owner",
        taxing_authority: "Holmes County Auditor & Treasurer — 76 E Jackson St, Millersburg, OH 44654",
        city: "MILLERSBURG",
        zip: "44654",
        dueDates: { first: "02/18", second: "07/15" }
    },
    coshocton: {
        url: "https://www.coshcoauditor.org/Search",
        taxing_authority: "Coshocton County Auditor & Treasurer — 318 Chestnut St, Coshocton, OH 43812",
        city: "COSHOCTON",
        zip: "43812",
        dueDates: { first: "03/14", second: "07/18" }
    },
    morgan: {
        url: "https://www.morgancountyauditor.org/",
        taxing_authority: "Morgan County Auditor & Treasurer — 155 E Main St, McConnelsville, OH 43756",
        city: "MCCONNELSVILLE",
        zip: "43756",
        dueDates: { first: "02/15", second: "07/15" }
    },
    shelby: {
        url: "https://realestate.shelbycountyauditors.com/Search/Name",
        taxing_authority: "Shelby County Auditor & Treasurer — 129 E Court St, Sidney, OH 45365",
        city: "SIDNEY",
        zip: "45365",
        dueDates: { first: "02/14", second: "07/20" }
    },
    champaign: {
        url: "https://treasurer.co.champaign.oh.us/Search/Owner",
        taxing_authority: "Champaign County Auditor & Treasurer — 1512 S US Highway 68, Urbana, OH 43078",
        city: "URBANA",
        zip: "43078",
        dueDates: { first: "02/24", second: "07/14" }
    },
    huron: {
        url: "https://www.huroncountytreasurer.org/Search/Name",
        taxing_authority: "Huron County Treasurer - 16 East Main Street, Norwalk, OH 44857, PH: (419) 668-2090",
        city: "Norwalk",
        zip: "44857",
        dueDates: { first: "02/12", second: "07/10" }
    },
    geauga: {
        url: "https://realestate.geauga.oh.gov/Search/Number",
        taxing_authority: "geauga County Treasurer - 211 Main Street, Suite 1-A, OH 44024, PH: (440) 279-2000",
        city: "Chardon",
        zip: "44024",
        dueDates: { first: "02/26", second: "07/15" }
    },
    carroll: {
        url: "https://www.carrollcountyauditor.us/Search/Number",
        taxing_authority: "Carroll County Auditor & Treasurer — 119 S. Lisbon Street, Carrollton, OH 44615",
        city: "CARROLLTON",
        zip: "44615",
        dueDates: { first: "02/14", second: "07/15" }
    },
    ottawa: {
        url: "https://auditor.co.ottawa.oh.us/Search/Number",
        taxing_authority: "Ottawa County Treasurer - 315 Madison St. Room 201, Port Clinton, OH 43452, PH: (419) 734-6750",
        city: "Port Clinton",
        zip: "43452",
        dueDates: { first: "02/20", second: "07/17" }
    },
    lorain: {
        url: "https://loraincountyauditor.gov/Search/Number",
        taxing_authority: "Lorain County Auditor, 226 Middle Ave, Elyria, OH 44035, Ph: 440-329-5207",
        city: "Port Clinton",
        zip: "43452",
        dueDates: { first: "02/14", second: "07/11" }
    }
};

// ----------------------- Helpers -----------------------

const withRetry = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            console.warn(`[RETRY ${i + 1}/${maxRetries}] ${err.message}`);
            await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        }
    }
};

const formatCurrency = (val) => {
    if (!val) return "$0.00";
    let num = parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const determineStatus = (amountDue, dueDate, delqDate, currentDate) => {
    const cleanAmount = parseFloat(amountDue.toString().replace(/[^0-9.-]+/g, '')) || 0;
    if (cleanAmount <= 0) {
        return "Paid";
    }

    const dueDateObj = new Date(dueDate);
    const delqDateObj = new Date(delqDate);

    if (currentDate < delqDateObj) {
        return "Due";
    } else {
        return "Delinquent";
    }
};

const buildEnhancedNotes = (firstStatus, secondStatus, priorYearStatus, taxYear, dueDates) => {
    const hasDue = [firstStatus, secondStatus].includes("Due");
    const hasUnpaid = [firstStatus, secondStatus].includes("Unpaid");
    const hasDelinquent = [firstStatus, secondStatus].includes("Delinquent");

    let currentStatusText = [];
    if (hasDelinquent) currentStatusText.push("DELINQUENT");
    else if (hasDue) currentStatusText.push("DUE");
    else if (hasUnpaid) currentStatusText.push("UNPAID");
    else currentStatusText.push("PAID");

    const overallCurrentStatus = [firstStatus, secondStatus].includes("Paid") ? "PAID" : "UNPAID";
    let notes;
    if (overallCurrentStatus === "PAID") {
        notes = `ALL PRIORS ARE ${priorYearStatus}, ${taxYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    } else if (priorYearStatus === "PAID") {
        notes = `ALL PRIORS ARE PAID, ${taxYear} TAXES ARE ${currentStatusText.join(" & ")}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    } else {
        notes = `PRIORS ARE DELINQUENT, ${taxYear} TAXES ARE ${currentStatusText.join(" & ")}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMALLY DUE DATES ARE ${dueDates}`;
    }
    return notes;
};

// ----------------------- Scraper Steps -----------------------
const gc_1 = (page, account, config) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Validate input
            if (!account?.trim()) {
                return reject(new Error("Parcel account is required"));
            }

            const cleanAccount = account.replace(/[^A-Za-z0-9]/g, "");

            // Go to the site
            await page.goto(config.url, {
                waitUntil: "domcontentloaded",
                timeout_option
            });

            // Handle disclaimer / accept button (optional)
            await page.waitForSelector(
                '.btn-primary[type="submit"], #disclaimer button, .accept-btn',
                { timeout_option }
            ).then(() => page.click('.btn-primary[type="submit"], #disclaimer button, .accept-btn'))
                .catch(() => { /* No disclaimer found; continue */ });

            // ────── Primary search attempt (#quickSearch + search icon) ──────
            await page.waitForSelector("#quickSearch", { timeout_option })
                .then(async () => {
                    await page.type("#quickSearch", cleanAccount);

                    // Click the search icon
                    await page.evaluate(() => {
                        const btn = document.querySelector(".fa.fa-search");
                        if (btn) btn.click();
                    });
                })
                // ────── Fallback: input#Number + Enter (only runs if primary fails) ──────
                .catch(async () => {

                    await page.waitForSelector("#Number", { timeout_option });
                    await page.focus("#Number");

                    // Clear field properly
                    await page.keyboard.down('Control');
                    await page.keyboard.press('A');
                    await page.keyboard.up('Control');
                    await page.keyboard.press('Backspace');

                    await page.type("#Number", cleanAccount);
                    await page.keyboard.press("Enter");
                });

            // Wait for results to appear
            await page.waitForSelector(
                "div[aria-labelledby*='HeaderOwner'], .owner-name, #HeaderOwner",
                { timeout_option }
            );

            // Click first result if exists
            const firstLink = await page.$("table tbody tr:first-child a");
            if (firstLink) {
                await Promise.all([
                    firstLink.click(),
                    page.waitForNavigation({
                        waitUntil: "domcontentloaded",
                        timeout_option
                    })
                ]);
            }

            // All good → resolve
            resolve();

        } catch (error) {
            reject(error);
        }
    });
};

const gc_2 = (page, account) => {
    return new Promise((resolve, reject) => {
        page.evaluate(() => {
            const clean = (sel) => {
                const el = document.querySelector(sel);
                return el ? el.innerText.replace(/\s+/g, " ").trim() : "";
            };

            // === Try multiple known patterns for Paid/Due amounts ===
            let firstPaid = clean('td[aria-labelledby="ChargePaid ChargeFirst"]');
            let secondPaid = clean('td[aria-labelledby="ChargePaid ChargeSecond"]');
            let firstDue = clean('td[aria-labelledby="ChargeDue ChargeFirst"]');
            let secondDue = clean('td[aria-labelledby="ChargeDue ChargeSecond"]');

            // Pattern 2: Space in aria-labelledby
            if (!firstPaid && !secondPaid && !firstDue && !secondDue) {
                firstPaid = clean('td[aria-labelledby="ChargePaid ChargeFirst"]');
                secondPaid = clean('td[aria-labelledby="ChargePaid ChargeSecond"]');
                firstDue = clean('td[aria-labelledby="ChargeDue ChargeFirst"]');
                secondDue = clean('td[aria-labelledby="ChargeDue ChargeSecond"]');
            }

            // Pattern 3: Newer "ChargesFirst ChargesPaid" style
            if (!firstPaid && !secondPaid && !firstDue && !secondDue) {
                firstPaid = clean('td[aria-labelledby="ChargesFirst ChargesPaid"]');
                secondPaid = clean('td[aria-labelledby="ChargesSecond ChargesPaid"]');
                firstDue = clean('td[aria-labelledby="ChargesFirst ChargesDue"]');
                secondDue = clean('td[aria-labelledby="ChargesSecond ChargesDue"]');
            }

            // Final broad fallback
            if (!firstPaid && !secondPaid && !firstDue && !secondDue) {
                const paidCells = [...document.querySelectorAll('td[aria-labelledby*="ChargePaid"], td[aria-labelledby*="ChargesPaid"]')];
                const dueCells = [...document.querySelectorAll('td[aria-labelledby*="ChargeDue"], td[aria-labelledby*="ChargesDue"]')];

                firstPaid = paidCells.find(c => c.getAttribute('aria-labelledby')?.includes('First'))?.innerText.trim() || "0.00";
                secondPaid = paidCells.find(c => c.getAttribute('aria-labelledby')?.includes('Second'))?.innerText.trim() || "0.00";
                firstDue = dueCells.find(c => c.getAttribute('aria-labelledby')?.includes('First'))?.innerText.trim() || "0.00";
                secondDue = dueCells.find(c => c.getAttribute('aria-labelledby')?.includes('Second'))?.innerText.trim() || "0.00";
            }

            // === Total Assessed/Taxable Value ===
            let total_value = clean('td[aria-labelledby="ValueTaxable ValueAssessed"]') ||
                clean('td[aria-labelledby="ValuesTaxable ValuesAssessed"]');

            if (!total_value || total_value === "0" || total_value.trim() === "") {
                const candidate = document.querySelector('td[aria-labelledby*="Taxable"], td[aria-labelledby*="Assessed"]');
                total_value = candidate ? candidate.innerText.trim() : "0.00";
            }

            // === Prior Year Delinquency ===
            let priorDue = clean('td[aria-labelledby*="ChargePrior"]') ||
                clean('td[aria-labelledby*="ChargesPrior"]') ||
                clean('td[aria-labelledby*="Prior"]') ||
                [...document.querySelectorAll('td')].find(td =>
                    td.getAttribute('aria-labelledby')?.includes('Prior')
                )?.innerText.trim() || "0.00";

            // === Final return object ===
            return {
                owner_name: clean('div[aria-labelledby="HeaderOwner"]') || "N/A",
                property_address: clean('div[aria-labelledby="HeaderLocation"]') || "N/A",
                total_value: total_value.replace(/[^0-9.-]/g, '') || "0.00",
                firstPaid: (firstPaid.replace(/[^0-9.-]/g, '') || "0.00"),
                secondPaid: (secondPaid.replace(/[^0-9.-]/g, '') || "0.00"),
                firstDue: (firstDue.replace(/[^0-9.-]/g, '') || "0.00"),
                secondDue: (secondDue.replace(/[^0-9.-]/g, '') || "0.00"),
                priorDue: (priorDue.replace(/[^0-9.-]/g, '') || "0.00"),
                taxYear: document.querySelector("#TaxYear")?.value || new Date().getFullYear().toString()
            };
        })
            .then(result => {
                // Optional: normalize numbers further here if needed
                resolve(result);
            })
            .catch(err => {
                console.error("[GC_2] Evaluation failed:", err);
                reject(err);
            });
    });
};

const gc_paid = (page, overview, account, config, yearLimit = 1) => {
    return new Promise((resolve, reject) => {
        let baseAmount = "";
        const payments = [];

        const currentDate = new Date();
        const taxYearInt = parseInt(overview.taxYear) || new Date().getFullYear();
        const nextYear = taxYearInt + 1;
        const countyDue = config.dueDates || { first: "02/14", second: "07/20" };
        const due1 = `${countyDue.first}/${nextYear}`;
        const due2 = `${countyDue.second}/${nextYear}`;

        const addOneDay = (dateStr) => {
            const [m, d, y] = dateStr.split('/').map(Number);
            const date = new Date(y, m - 1, d);
            date.setDate(date.getDate() + 1);
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
        };

        const delq1 = addOneDay(due1);
        const delq2 = addOneDay(due2);
        const formatForNotes = (d) => d.replace(/^0+/, '').replace(/\/0/g, '/');
        const notesDueText = `${formatForNotes(countyDue.first)} & ${formatForNotes(countyDue.second)}`;

        const priorAmount = parseFloat((overview.priorDue || "0").replace(/[^0-9.-]/g, "")) || 0;
        const priorYearStatus = priorAmount > 0 ? "DELINQUENT" : "PAID";

        const firstInstallmentStatus = determineStatus(overview.firstDue, due1, delq1, currentDate);
        const secondInstallmentStatus = determineStatus(overview.secondDue, due2, delq2, currentDate);
        const currentYearDelinquent = [firstInstallmentStatus, secondInstallmentStatus].includes("Delinquent");
        const anyDelinquency = currentYearDelinquent || priorYearStatus === "DELINQUENT";

        // ────────────────────── STEP 1: Get Base Tax Amount ──────────────────────
        page.waitForSelector("#sidebarMenu .nav-link.sidebar-hasitems", { timeout: 90000 })
            .then(() => page.evaluate(() => {
                const items = [...document.querySelectorAll("#sidebarMenu .nav-link.sidebar-hasitems")];
                const taxItem = items.find(el => el.innerText.includes("Tax"));
                if (taxItem) taxItem.click();
            }))
            .then(() => Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }).catch(() => { }),
                page.waitForSelector(".table-responsive tr", { timeout: 15000 })
            ]))
            .then(() => page.evaluate(() => {
                const rows = document.querySelectorAll(".table-responsive tr");
                for (let row of rows) {
                    if (row.innerText.includes("Total Taxes")) {
                        return row.lastElementChild.textContent.trim();
                    }
                }
                return "";
            }))
            .then(amount => { baseAmount = amount || ""; })
            .catch(() => { baseAmount = ""; }) // Silent fallback

            // ────────────────────── STEP 2: Get Payment History ──────────────────────
            .then(() => page.waitForSelector("#sidebarMenu .nav-link.sidebar-hasitems", { timeout: 90000 }))
            .then(() => page.evaluate(() => {
                const items = [...document.querySelectorAll("#sidebarMenu .nav-link.sidebar-hasitems")];
                const payItem = items.find(el => el.innerText.includes("Payment History"));
                if (payItem) payItem.click();
            }))
            .then(() => Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }).catch(() => { }),
                page.waitForSelector("table.table tbody tr, table.table-bordered tbody tr", { timeout: 15000 })
            ]))
            .then(() => page.$$eval("table.table tbody tr, table.table-bordered tbody tr", rows =>
                rows.map(r => {
                    const cells = r.querySelectorAll("td");
                    if (cells.length < 2) return null;
                    const dateText = cells[0]?.innerText.trim();
                    const amountText = cells[1]?.innerText.trim();
                    const amount = parseFloat(amountText.replace(/[$,]/g, "")) || 0;
                    return dateText && amount > 0 ? { date: dateText, amount } : null;
                }).filter(Boolean)
            ))
            .then(pmtList => { payments.push(...pmtList); })
            .catch(() => { /* payments remain empty */ })

            // ────────────────────── FINAL: Build Result ──────────────────────
            .finally(() => {
                // Reuse your existing robust findPaidDates logic
                // ────────────────────── STEP: Map Paid Dates Correctly ──────────────────────
                const findPaidDates = (amount1, amount2, dueDate1, dueDate2) => {
                    const paidDates = ["", ""];
                    const validPayments = payments
                        .filter(p => p.date && p.amount > 0)
                        .map(p => ({ ...p, dateObj: new Date(p.date.replace(/-/g, '/')) }))
                        .sort((a, b) => a.dateObj - b.dateObj); // ascending by date

                    // First installment: earliest payment matching amount1
                    for (let i = 0; i < validPayments.length; i++) {
                        const p = validPayments[i];
                        if (Math.abs(p.amount - amount1) < 1) {
                            paidDates[0] = p.date;
                            validPayments.splice(i, 1); // remove used payment
                            break;
                        }
                    }

                    // Second installment: earliest remaining payment matching amount2
                    for (let i = 0; i < validPayments.length; i++) {
                        const p = validPayments[i];
                        if (Math.abs(p.amount - amount2) < 1) {
                            paidDates[1] = p.date;
                            break;
                        }
                    }

                    return paidDates;
                };


                const [paidDate1, paidDate2] = findPaidDates(
                    parseFloat(overview.firstPaid),
                    parseFloat(overview.secondPaid),
                    due1,
                    due2
                );


                const notes = buildEnhancedNotes(
                    firstInstallmentStatus,
                    secondInstallmentStatus,
                    priorYearStatus,
                    overview.taxYear,
                    notesDueText
                );

                const taxHistory = [
                    {
                        jurisdiction: "County",
                        year: overview.taxYear,
                        payment_type: "Semi-Annual",
                        installment: "1",
                        status: firstInstallmentStatus,
                        base_amount: formatCurrency(baseAmount),
                        amount_paid: firstInstallmentStatus === "Paid" ? formatCurrency(overview.firstPaid) : "$0.00",
                        amount_due: firstInstallmentStatus !== "Paid" ? formatCurrency(overview.firstDue) : "$0.00",
                        mailing_date: "N/A",
                        due_date: due1,
                        delq_date: delq1,
                        paid_date: firstInstallmentStatus === "Paid" ? (paidDate1 || "-") : "-",
                        good_through_date: ""
                    },
                    {
                        jurisdiction: "County",
                        year: overview.taxYear,
                        payment_type: "Semi-Annual",
                        installment: "2",
                        status: secondInstallmentStatus,
                        base_amount: formatCurrency(baseAmount),
                        amount_paid: secondInstallmentStatus === "Paid" ? formatCurrency(overview.secondPaid) : "$0.00",
                        amount_due: secondInstallmentStatus !== "Paid" ? formatCurrency(overview.secondDue) : "$0.00",
                        mailing_date: "N/A",
                        due_date: due2,
                        delq_date: delq2,
                        paid_date: secondInstallmentStatus === "Paid" ? (paidDate2 || "-") : "-",
                        good_through_date: ""
                    }
                ];

                const priorityStatuses = ["Delinquent", "Due"];
                const hasPriority = taxHistory.some(r => priorityStatuses.includes(r.status));
                const filteredTaxHistory = hasPriority
                    ? taxHistory.filter(r => priorityStatuses.includes(r.status))
                    : taxHistory.filter(r => r.status === "Paid");
                // ───────────── ADD: BUILD PREVIOUS YEAR FROM PAYMENTS ─────────────

                const previousYear = taxYearInt - 1;

                // Filter payments that belong to the previous tax year
                const prevYearPayments = payments
                    .filter(p => {
                        const y = new Date(p.date.replace(/-/g, '/')).getFullYear();
                        return y === previousYear + 1;
                    })
                    .sort((a, b) => new Date(a.date) - new Date(b.date)); // sort ascending

                let previousYearHistory = [];

                if (prevYearPayments.length > 0) {
                    const halfAmount = prevYearPayments.reduce((sum, p) => sum + p.amount, 0) / 2;

                    // Assign paid dates for each half from earliest to latest
                    const paidDate1 = prevYearPayments[0]?.date || "-";
                    const paidDate2 = prevYearPayments[1]?.date || (prevYearPayments[0]?.date || "-");

                    previousYearHistory = [
                        {
                            jurisdiction: "County",
                            year: previousYear.toString(),
                            payment_type: "Semi-Annual",
                            installment: "1",
                            status: "Paid",
                            base_amount: formatCurrency(halfAmount * 2),
                            amount_paid: formatCurrency(halfAmount),
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: `02/12/${previousYear + 1}`,
                            delq_date: `02/13/${previousYear + 1}`,
                            paid_date: paidDate1,
                            good_through_date: ""
                        },
                        {
                            jurisdiction: "County",
                            year: previousYear.toString(),
                            payment_type: "Semi-Annual",
                            installment: "2",
                            status: "Paid",
                            base_amount: formatCurrency(halfAmount * 2),
                            amount_paid: formatCurrency(halfAmount),
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: `07/02/${previousYear + 1}`,
                            delq_date: `07/03/${previousYear + 1}`,
                            paid_date: paidDate2,
                            good_through_date: ""
                        }
                    ];
                }

                const hasPrevYear = filteredTaxHistory.some(
                    r => r.year === previousYear.toString()
                );

                if (!hasPrevYear) {
                    filteredTaxHistory.unshift(...previousYearHistory);
                }
                const finalTaxHistory = [];
                const seenYears = new Set();

                filteredTaxHistory
                    .sort((a, b) => parseInt(b.year) - parseInt(a.year))
                    .forEach(row => {
                        if (!seenYears.has(row.year)) {
                            if (seenYears.size >= yearLimit) return;
                            seenYears.add(row.year);
                        }
                        if (seenYears.has(row.year)) {
                            finalTaxHistory.push(row);
                        }
                    });




                resolve({
                    processed_date: new Date().toISOString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: overview.owner_name ? [overview.owner_name] : [],
                    property_address: overview.property_address || "",
                    parcel_number: account,
                    land_value: "",
                    improvements: "",
                    total_assessed_value: formatCurrency(overview.total_value),
                    exemption: "",
                    total_taxable_value: formatCurrency(overview.total_value),
                    taxing_authority: config.taxing_authority,
                    notes,
                    delinquent: anyDelinquency
                        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                        : "NONE",
                    tax_history: finalTaxHistory

                });
            })
            .catch(err => {
                console.error("[GC_PAID] Critical error:", err);
                reject(err);
            });
    });
};

// ----------------------- Main Account Search -----------------------
const account_search = async (page, account, county, yearLimit = 1) => {
    const config = counties[county];
    if (!config) throw new ScrapingError(`Unsupported county: ${county}`, 'config', county, account);

    try {
        await withRetry(() => gc_1(page, account.trim(), config), 3);

        // === Critical: Detect "No records found" ===
        const noRecordFound = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes("no records found") ||
                text.includes("no parcel found") ||
                text.includes("invalid parcel") ||
                text.includes("not found");
        }).catch(() => false);

        if (noRecordFound) {
            throw new ScrapingError("Parcel not found or invalid", "notFound", county, account);
        }

        // === CAPTCHA / Cloudflare Detection ===
        const currentUrl = page.url();
        const pageTitle = await page.title();
        if (currentUrl.includes("cloudflare") || pageTitle.includes("Attention Required") || pageTitle.includes("Checking your browser")) {
            throw new ScrapingError("CAPTCHA or security check detected", "captcha", county, account);
        }

        const overview = await withRetry(() => gc_2(page, account.trim(), yearLimit), 2);
        const result = await withRetry(() => gc_paid(page, overview, account.trim(), config, yearLimit), 2);
        return result;

    } catch (error) {
        if (error instanceof ScrapingError) throw error;
        throw new ScrapingError(error.message || "Unknown error during scraping", "unexpected", county, account);
    }
};

// ----------------------- Express Controller -----------------------
const search = async (req, res) => {
    let context = null;
    try {
        const { fetch_type, account, client } = req.body;
        if (!account) throw new Error("account is not defined");
        if (!fetch_type || !["html", "api"].includes(fetch_type)) throw new Error("Invalid fetch_type");

        const pathParts = req.path.split("/").filter(Boolean);
        const county = pathParts[pathParts.length - 1].toLowerCase();
        if (!counties[county]) throw new Error(`Unsupported county: ${county}`);
        const yearLimit = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "font"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const data = await account_search(page, account, county, yearLimit);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", { ...data, tax_history: data.tax_history });
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        const fetchType = req.body?.fetch_type || "api";
        if (fetchType === "html") {
            res.status(200).render("error_data", { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    } finally {
        if (context) await context.close();
    }
};

export { search };