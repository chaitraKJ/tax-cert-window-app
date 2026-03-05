// Author: Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const handleNotFound = (parcelNumber) => {
    return {
        processed_date: new Date().toISOString().split('T')[0],
        owner_name: ["No records found"],
        property_address: "No records found",
        owner_address: "No records found",
        parcel_number: parcelNumber,
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A",
        exemption: "N/A",
        total_taxable_value: "N/A",
        taxing_authority: "Lucas County Treasurer, Ohio",
        notes: "No tax records found.",
        delinquent: "N/A",
        tax_history: []
    };
};

const isDatePassed = (dateString) => {
    if (!dateString) return false;
    const [m, d, y] = dateString.split('/');
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} 00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date <= today;
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// === BULLETPROOF: Click Summary Tab ===
const clickSummaryTab = async (page) => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.waitForSelector('a[href*="datalet.aspx?mode=summary"]', { timeout: 15000 });
            await page.evaluate(() => {
                const link = document.querySelector('a[href*="datalet.aspx?mode=summary"]');
                if (link) link.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            await delay(600);
            await page.hover('a[href*="datalet.aspx?mode=summary"]');
            await delay(400);

            await Promise.all([
                page.click('a[href*="datalet.aspx?mode=summary"]'),
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {})
            ]);

            const loaded = await page.waitForFunction(() => {
                return !!document.querySelector('#Summary\\ -\\ General') ||
                       !!document.querySelector('#Summary\\ -\\ Values');
            }, { timeout: 15000 });

            if (loaded) return true;
        } catch (e) {
            if (attempt === maxRetries) break;
            await delay(2000);
        }
    }

    // Fallback 1: Direct URL
    try {
        const currentUrl = page.url();
        const parcelMatch = currentUrl.match(/Parcel=([0-9-]+)/i);
        if (parcelMatch) {
            const parcelId = parcelMatch[1];
            const summaryUrl = `https://icare.co.lucas.oh.us/LucasCare/datalet.aspx?mode=summary&Parcel=${parcelId}`;
            await page.goto(summaryUrl, { waitUntil: 'networkidle0', timeout: 20000 });
            await page.waitForFunction(() => !!document.querySelector('#Summary\\ -\\ General'), { timeout: 15000 });
            return true;
        }
    } catch (e) {}

    return false;
};

// === Perform Search + Summary ===
const performSearch = async (page, parcelNumber) => {
    const searchUrl = 'https://icare.co.lucas.oh.us/LucasCare/search/commonsearch.aspx?mode=parid';
    await page.goto(searchUrl, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector('#inpParid', { timeout: 30000, visible: true });
    await page.type('#inpParid', parcelNumber);
    await delay(1000);
    await page.click('#btSearch');

    try {
        await page.waitForNavigation({ waitUntil: "load", timeout: 45000 });
    } catch (e) {}
    await delay(3000);

    const summaryLoaded = await clickSummaryTab(page);
    if (!summaryLoaded) {
        throw new Error("Failed to load Summary tab after all fallbacks");
    }
};

// === Scrape Owner Info ===
const scrapeOwnerInfo = async (page) => {
    return await page.evaluate(() => {
        const table = document.querySelector('#Summary\\ -\\ General');
        if (!table) return { owner_name: "N/A", property_address: "N/A", owner_address: "N/A" };

        const rows = table.querySelectorAll('tr');
        let owner = "N/A", propAddr = [], mailAddr = [];
        rows.forEach(row => {
            const heading = row.querySelector('.DataletSideHeading')?.textContent?.trim();
            const data = row.querySelector('.DataletData')?.textContent?.trim();
            if (heading === "Owner") owner = data;
            if (heading === "Property Address") propAddr.push(data);
            if (heading === "Mailing Address") mailAddr.push(data);
        });
        return {
            owner_name: owner,
            property_address: propAddr.join(', ') || "N/A",
            owner_address: mailAddr.join(', ') || "N/A"
        };
    });
};

// === Scrape Valuations ===
const scrapeValuations = async (page) => {
    return await page.evaluate(() => {
        const table = document.querySelector('#Summary\\ -\\ Values');
        if (!table) return { land_value: "N/A", improvements: "N/A", total_assessed_value: "N/A" };

        const rows = table.querySelectorAll('tr');
        let land35 = 0, build35 = 0, total35 = 0;
        rows.forEach((row, i) => {
            if (i < 1 || i > 3) return;
            const cells = row.querySelectorAll('td');
            const label = cells[0]?.textContent?.trim().toLowerCase();
            const val = parseFloat(cells[1]?.textContent?.trim().replace(/,/g, '')) || 0;
            if (label.includes('land')) land35 = val;
            if (label.includes('building')) build35 = val;
            if (label.includes('total')) total35 = val;
        });
        return {
            land_value: `$${land35.toLocaleString()}`,
            improvements: `$${build35.toLocaleString()}`,
            total_assessed_value: `$${total35.toLocaleString()}`
        };
    });
};

// === Click Payments Tab ===
const clickPaymentsTab = async (page) => {
    try {
        await page.waitForSelector('a[href*="mode=payments"]', { timeout: 10000, visible: true });
        await Promise.all([
            page.click('a[href*="mode=payments"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
        ]);
        await delay(3000);
        await page.waitForSelector('#Payment\\ Details', { timeout: 15000 });
        return true;
    } catch (e) {
        console.error("Failed to load Payments tab:", e.message);
        return false;
    }
};

// === Scrape Payment Details ===
const scrapePaymentDetails = async (page) => {
    return await page.evaluate(() => {
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            // Format: "29-JUL-2025" → "07/29/2025"
            const months = {
                'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 
                'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08', 
                'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
            };
            const match = dateStr.match(/(\d{1,2})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})/);
            if (!match) return dateStr;
            const [, day, month, year] = match;
            return `${months[month]}/${day.padStart(2, '0')}/${year}`;
        };

        const table = document.querySelector('#Payment\\ Details');
        if (!table) return {};

        const rows = Array.from(table.querySelectorAll('tr')).slice(1); // Skip header
        const paymentMap = {}; // { "2024": { "1": { date: "07/29/2025", amount: 1692.27 }, "2": {...} } }

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return;

            const yearHalf = cells[0]?.textContent?.trim(); // "2024 - 2"
            const datePaid = cells[1]?.textContent?.trim(); // "29-JUL-2025"
            const paymentStr = cells[4]?.textContent?.trim(); // "$1,692.27"

            const match = yearHalf.match(/(\d{4})\s*-\s*(\d)/);
            if (!match) return;

            const year = match[1];
            const half = match[2]; // "1" or "2"
            const paymentAmount = parseFloat(paymentStr.replace(/[^0-9.-]+/g, '')) || 0;

            if (!paymentMap[year]) {
                paymentMap[year] = { "1": { date: "", amount: 0 }, "2": { date: "", amount: 0 } };
            }

            // Accumulate payment amounts for this half (handles multiple payments for same half)
            if (datePaid && paymentAmount > 0) {
                if (!paymentMap[year][half].date) {
                    // First payment for this half - store date
                    paymentMap[year][half].date = formatDate(datePaid);
                }
                // Add to total amount (in case of multiple payments)
                paymentMap[year][half].amount += paymentAmount;
            }
        });

        return paymentMap;
    });
};

// === Click Current Taxes ===
const clickCurrentTaxes = async (page) => {
    try {
        await page.waitForSelector('a[href*="mode=currenttaxes"]', { timeout: 10000, visible: true });
        await Promise.all([
            page.click('a[href*="mode=currenttaxes"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
        ]);
        await delay(3000);
        await page.waitForFunction(() => {
            const table = document.querySelector('#Current\\ Taxes') || 
                          document.querySelector('div[name="CURRENTTAXES"] table') ||
                          document.querySelector('table');
            return table && table.querySelectorAll('tr').length > 5;
        }, { timeout: 15000 });
    } catch (e) {}
};

// === Click Prior Taxes ===
const clickPriorTaxes = async (page) => {
    try {
        await page.waitForSelector('a[href*="mode=priortaxes"]', { timeout: 10000, visible: true });
        await Promise.all([
            page.click('a[href*="mode=priortaxes"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
        ]);
        await delay(4000);
        await page.waitForSelector('div[name^="PRIORTAXES"]', { timeout: 15000 });
    } catch (e) {}
};

// === Scrape CURRENT Taxes ===
const scrapeCurrentTaxes = async (page) => {
    return await page.evaluate(() => {
        const table = document.querySelector('#Current\\ Taxes') || 
                      document.querySelector('div[name="CURRENTTAXES"] table') ||
                      document.querySelector('table');
        if (!table || table.querySelectorAll('tr').length < 6) return [];

        const rows = Array.from(table.querySelectorAll('tr'));
        let currentYear = '', netGeneral1H = 0, netGeneral2H = 0;
        let netSpecial1H = 0, netSpecial2H = 0;
        let totalDue = 0, totalPaid = 0;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;
            const label = cells[0]?.textContent?.trim() || '';
            const val1H = parseFloat(cells[1]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');
            const val2H = parseFloat(cells[2]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');
            const totalVal = parseFloat(cells[3]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');

            if (label.includes('Tax Year') && label.includes(':')) {
                const match = label.match(/(\d{4})/);
                if (match) currentYear = match[1];
            }
            if (label.includes('Net General:')) { netGeneral1H = Math.abs(val1H); netGeneral2H = Math.abs(val2H); }
            if (label.includes('Net Special Assessments:')) { netSpecial1H = Math.abs(val1H); netSpecial2H = Math.abs(val2H); }
            if (label.includes('TOTAL DUE AFTER PAYMENTS')) totalDue = Math.abs(totalVal);
            if (label.includes('** TOTAL PAYMENTS **')) totalPaid = Math.abs(totalVal);
        });

        if (!currentYear) return [];

        const base1H = netGeneral1H + netSpecial1H;
        const base2H = netGeneral2H + netSpecial2H;
        const duePerHalf = totalDue / 2;
        const paidPerHalf = totalPaid > 0 ? totalPaid / 2 : 0;

        const result = [];
        result.push({ 
            year: currentYear, 
            half: 'First Half', 
            base_amount: `$${base1H.toFixed(2)}`, 
            amount_paid: `$${paidPerHalf.toFixed(2)}`, 
            amount_due: `$${duePerHalf.toFixed(2)}`
        });
        result.push({ 
            year: currentYear, 
            half: 'Second Half', 
            base_amount: `$${base2H.toFixed(2)}`, 
            amount_paid: `$${paidPerHalf.toFixed(2)}`, 
            amount_due: `$${duePerHalf.toFixed(2)}`
        });
        return result;
    });
};

// === Scrape PRIOR Taxes ===
const scrapePriorTaxes = async (page) => {
    return await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('div[name^="PRIORTAXES"] table'));
        if (!tables.length) return [];

        const delinquent = [];
        let currentYear = '', netGeneral1H = 0, netGeneral2H = 0;
        let netSpecial1H = 0, netSpecial2H = 0;
        let totalDue = 0, totalPaid = 0;

        const saveYear = () => {
            if (!currentYear || totalDue <= 0) return;
            const base1H = netGeneral1H + netSpecial1H;
            const base2H = netGeneral2H + netSpecial2H;
            const duePerHalf = totalDue / 2;
            const paidPerHalf = totalPaid > 0 ? totalPaid / 2 : 0;

            delinquent.push({ 
                year: currentYear, 
                half: 'First Half', 
                base_amount: `$${base1H.toFixed(2)}`, 
                amount_paid: `$${paidPerHalf.toFixed(2)}`, 
                amount_due: `$${duePerHalf.toFixed(2)}`
            });
            delinquent.push({ 
                year: currentYear, 
                half: 'Second Half', 
                base_amount: `$${base2H.toFixed(2)}`, 
                amount_paid: `$${paidPerHalf.toFixed(2)}`, 
                amount_due: `$${duePerHalf.toFixed(2)}`
            });
        };

        tables.forEach(table => {
            const rows = Array.from(table.querySelectorAll('tr'));
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 4) return;
                const label = cells[0]?.textContent?.trim() || '';
                const val1H = parseFloat(cells[1]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');
                const val2H = parseFloat(cells[2]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');
                const totalVal = parseFloat(cells[3]?.textContent?.replace(/[^0-9.-]+/g, '') || '0');

                const yearMatch = label.match(/Tax Year (\d{4}):/);
                if (yearMatch) {
                    if (currentYear) saveYear();
                    currentYear = yearMatch[1];
                    netGeneral1H = netGeneral2H = netSpecial1H = netSpecial2H = 0;
                    totalDue = totalPaid = 0;
                    return;
                }
                if (!currentYear) return;
                if (label.includes('Net General:')) { netGeneral1H = Math.abs(val1H); netGeneral2H = Math.abs(val2H); }
                if (label.includes('Net Special Assessments:')) { netSpecial1H = Math.abs(val1H); netSpecial2H = Math.abs(val2H); }
                if (label.includes('TOTAL DUE AFTER PAYMENTS')) totalDue = Math.abs(totalVal);
                if (label.includes('** TOTAL PAYMENTS **')) totalPaid = Math.abs(totalVal);
            });
        });
        if (currentYear) saveYear();
        return delinquent;
    });
};

// === MAIN: FINAL MERGE WITH ANNUAL/SEMI-ANNUAL DETECTION ===
const getTaxData = async (page, parcelNumber) => {
    try {
        await performSearch(page, parcelNumber);

        // Final recovery
        let hasSummary = false;
        try {
            hasSummary = await page.evaluate(() => !!document.querySelector('#Summary\\ -\\ General'));
        } catch (e) {}

        if (!hasSummary) {
            const summaryUrl = `https://icare.co.lucas.oh.us/LucasCare/datalet.aspx?mode=summary&Parcel=${encodeURIComponent(parcelNumber)}`;
            await page.goto(summaryUrl, { waitUntil: 'networkidle0', timeout: 20000 });
            await page.waitForFunction(() => !!document.querySelector('#Summary\\ -\\ General'), { timeout: 15000 });
        }

        const ownerInfo = await scrapeOwnerInfo(page);
        const valuations = await scrapeValuations(page);

        // ✅ Click Payments tab and get payment details
        const hasPayments = await clickPaymentsTab(page);
        const paymentDetails = hasPayments ? await scrapePaymentDetails(page) : {};

        await clickCurrentTaxes(page);
        let currentTax = await scrapeCurrentTaxes(page);

        let taxHistory = [...currentTax];
        const hasCurrentDue = currentTax.some(t => parseFloat(t.amount_due.replace(/[^0-9.-]+/g, '')) > 0);

        if (hasCurrentDue || currentTax.length === 0) {
            await clickPriorTaxes(page);
            const prior = await scrapePriorTaxes(page);
            taxHistory = taxHistory.concat(prior);
        }

        // ✅ Merge logic with payment date detection
        const merged = {};
        taxHistory.forEach(item => {
            const y = item.year;
            if (!merged[y]) merged[y] = { first: null, second: null };
            if (item.half === 'First Half') merged[y].first = item;
            else if (item.half === 'Second Half') merged[y].second = item;
        });

        const fullHistory = [];
        Object.keys(merged).forEach(year => {
            const { first, second } = merged[year];
            if (!first && !second) return;

            const payYear = parseInt(year) + 1;
            const dueDate = `02/01/${payYear}`;
            const delqDate = `02/01/${payYear}`;

            // ✅ Get payment dates AND amounts from payment details
            const payment1H = paymentDetails[year]?.['1'] || { date: "", amount: 0 };
            const payment2H = paymentDetails[year]?.['2'] || { date: "", amount: 0 };
            
            const paidDate1H = payment1H.date || "";
            const paidDate2H = payment2H.date || "";
            
            // Ensure amounts are numbers
            const paidAmount1H = (typeof payment1H.amount === 'number' && !isNaN(payment1H.amount)) ? payment1H.amount : 0;
            const paidAmount2H = (typeof payment2H.amount === 'number' && !isNaN(payment2H.amount)) ? payment2H.amount : 0;

            // ✅ Determine if Annual or Semi-Annual based on paid dates
            const isSameDate = paidDate1H && paidDate2H && paidDate1H === paidDate2H;

            if (isSameDate) {
                // ✅ ANNUAL PAYMENT (one entry)
                const base = (parseFloat(first?.base_amount?.replace(/[^0-9.-]+/g, '') || '0')) + 
                             (parseFloat(second?.base_amount?.replace(/[^0-9.-]+/g, '') || '0'));
                const paidTotal = paidAmount1H + paidAmount2H;
                const due = (parseFloat(first?.amount_due?.replace(/[^0-9.-]+/g, '') || '0')) + 
                            (parseFloat(second?.amount_due?.replace(/[^0-9.-]+/g, '') || '0'));

                const status = due === 0 ? "Paid" : (isDatePassed(delqDate) ? "Delinquent" : "Due");

                fullHistory.push({
                    jurisdiction: "County",
                    year,
                    status,
                    payment_type: "Annual",
                    half_designation: "Annual",
                    base_amount: `$${base.toFixed(2)}`,
                    amount_paid: `$${paidTotal.toFixed(2)}`,
                    amount_due: `$${due.toFixed(2)}`,
                    paid_date: paidDate1H || paidDate2H || "",
                    due_date: dueDate,
                    delq_date: delqDate,
                    land_value: valuations.land_value,
                    improvements: valuations.improvements,
                    total_assessed_value: valuations.total_assessed_value,
                    receipt_number: "N/A"
                });

            } else {
                // ✅ SEMI-ANNUAL PAYMENT (two separate entries)
                
                // First Half
                if (first) {
                    const base1H = parseFloat(first.base_amount.replace(/[^0-9.-]+/g, '')) || 0;
                    const due1H = parseFloat(first.amount_due.replace(/[^0-9.-]+/g, '')) || 0;
                    const status1H = due1H === 0 ? "Paid" : (isDatePassed(delqDate) ? "Delinquent" : "Due");

                    fullHistory.push({
                        jurisdiction: "County",
                        year,
                        status: status1H,
                        payment_type: "Semi-Annual",
                        half_designation: "First Half",
                        base_amount: `$${base1H.toFixed(2)}`,
                        amount_paid: `$${paidAmount1H.toFixed(2)}`,
                        amount_due: `$${due1H.toFixed(2)}`,
                        paid_date: paidDate1H || "",
                        due_date: dueDate,
                        delq_date: delqDate,
                        land_value: valuations.land_value,
                        improvements: valuations.improvements,
                        total_assessed_value: valuations.total_assessed_value,
                        receipt_number: "N/A"
                    });
                }

                // Second Half
                if (second) {
                    const base2H = parseFloat(second.base_amount.replace(/[^0-9.-]+/g, '')) || 0;
                    const due2H = parseFloat(second.amount_due.replace(/[^0-9.-]+/g, '')) || 0;
                    const status2H = due2H === 0 ? "Paid" : (isDatePassed(delqDate) ? "Delinquent" : "Due");

                    fullHistory.push({
                        jurisdiction: "County",
                        year,
                        status: status2H,
                        payment_type: "Semi-Annual",
                        half_designation: "Second Half",
                        base_amount: `$${base2H.toFixed(2)}`,
                        amount_paid: `$${paidAmount2H.toFixed(2)}`,
                        amount_due: `$${due2H.toFixed(2)}`,
                        paid_date: paidDate2H || "",
                        due_date: dueDate,
                        delq_date: delqDate,
                        land_value: valuations.land_value,
                        improvements: valuations.improvements,
                        total_assessed_value: valuations.total_assessed_value,
                        receipt_number: "N/A"
                    });
                }
            }
        });

        fullHistory.sort((a, b) => {
            const yearDiff = parseInt(a.year) - parseInt(b.year);
            if (yearDiff !== 0) return yearDiff;
            // Within same year, First Half before Second Half
            if (a.half_designation === "First Half") return -1;
            if (b.half_designation === "First Half") return 1;
            return 0;
        });

        const currentRec = fullHistory.find(r => r.year === (new Date().getFullYear() - 1).toString());
        const priorStatus = fullHistory.filter(r => parseInt(r.year) < (new Date().getFullYear() - 1)).some(r => r.status === "Delinquent") ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";
        const currentStatus = currentRec?.status || "PAID";
        const paymentTypeNote = currentRec?.payment_type === "Annual" ? "ANNUAL" : "SEMI-ANNUAL";
        const notes = `${priorStatus}, ${currentRec?.year || ''} TAXES ARE ${currentStatus.toUpperCase()}, PAYMENT TYPE: ${paymentTypeNote}, DUE DATE IS 02/01`;

        const delinquencyStatus = fullHistory.some(r => r.status === "Delinquent") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

        return {
            processed_date: new Date().toISOString().split('T')[0],
            owner_name: [ownerInfo.owner_name],
            property_address: ownerInfo.property_address,
            owner_address: ownerInfo.owner_address,
            parcel_number: parcelNumber,
            land_value: valuations.land_value,
            improvements: valuations.improvements,
            total_assessed_value: valuations.total_assessed_value,
            exemption: "$0.00",
            total_taxable_value: valuations.total_assessed_value,
            taxing_authority: "Lucas County Treasurer, Toledo, OH 43601",
            notes,
            delinquent: delinquencyStatus,
            tax_history: fullHistory
        };

    } catch (err) {
        console.error(`[ERROR] Failed to scrape parcel ${parcelNumber}:`, err.message);
        return handleNotFound(parcelNumber);
    }
};

// === API Handler ===
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    if (!fetch_type || !["html", "api"].includes(fetch_type)) return res.status(400).send("Invalid request type.");
    if (!account) return res.status(400).send("Parcel number is required.");

    let browserContext = null;
    try {
        const browser = await getBrowserInstance();
        browserContext = await browser.createBrowserContext();
        const page = await browserContext.newPage();

        await page.setDefaultNavigationTimeout(60000);
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "media"].includes(reqInt.resourceType())) reqInt.abort();
            else reqInt.continue();
        });

        const data = await getTaxData(page, account);
        if (fetch_type === "html") res.status(200).render("parcel_data_official", data);
        else res.status(200).json({ result: data });
    } catch (error) {
        console.error("[FATAL ERROR]", error.message);
        const msg = error.message || "An unexpected error occurred.";
        if (fetch_type === "html") res.status(500).render('error_data', { error: true, message: msg });
        else res.status(500).json({ error: true, message: msg });
    } finally {
        if (browserContext) await browserContext.close();
    }
};

export { search };
