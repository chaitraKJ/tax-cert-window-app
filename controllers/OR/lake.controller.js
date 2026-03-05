//Author:Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import PDFParser from "pdf2json";

const parseDollar = (str) => {
    const numericString = str.replace(/[$,]/g, '').trim();
    return parseFloat(numericString) || 0;
};
const determineStatusByDate = (dueDateStr, delqDateStr) => {
    const today = new Date();
    const dueDate = new Date(dueDateStr);
    const delqDate = new Date(delqDateStr);

    if (today < dueDate) return "Due";
    if (today >= dueDate && today < delqDate) return "Due";
    return "Delinquent";
};
function updateTaxNotes(data) {
    if (!data.tax_history || data.tax_history.length === 0) {
        data.notes = `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        data.delinquent = "NONE";
        return data;
    }

    // Sort by latest year first
    const sortedHistory = data.tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const latestRecord = sortedHistory[0];
    const latestYear = latestRecord.year;
    // const isTrimester = latestRecord.payment_type.includes("Trimester");

    const latestStatus = latestRecord.status; // "Paid", "Unpaid", "Delinquent", "Due"
    const priorDelinquentExists = sortedHistory.slice(1).some(r => r.status === "Delinquent");

    // --- MAIN LOGIC ---
    if (latestStatus === "Paid") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else {
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
            data.delinquent = "NONE";
        }
    } else if (latestStatus === "Delinquent") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        } else {
            data.notes = `PRIOR YEAR TAXES ARE PAID, ${latestYear} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        }
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    }
    else if (latestStatus === "Due") {
        if (priorDelinquentExists) {
            data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        } else {
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE DUE, NORMALLY TAXES ARE PAID ANNUALLY/TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        }
        data.delinquent = "YES";
     } 
    else {
        data.notes = `${latestYear} TAX STATUS UNKNOWN`;
        data.delinquent = "YES";
    }

    if (priorDelinquentExists && latestStatus === "Due") {
    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
}
    return data;
}


// STEP 1 – Initial Account Search
const lake_1 = async (page, account) => {
    const baseUrl = "https://records.lakecountyor.org/pso/";
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("select.custom-select", { timeout: 15000 });
    await page.select("select.custom-select", "TaxAccountId");
    await page.waitForSelector("input.form-control", { timeout: 15000 });
    await page.type("input.form-control", account, { delay: 25 });

    await Promise.all([
        page.click("button.btn.btn-primary"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    await page.waitForSelector("a.hel_account-link, #account", { timeout: 15000 });
    const relativeHref = await page.evaluate(() => {
        const link = document.querySelector("a.hel_account-link");
        return link ? link.getAttribute("href") : null;
    });

    return relativeHref ? new URL(relativeHref, baseUrl).href : page.url();
};

// STEP 2 – Scrape Property Info
const lake_2 = async (page, detailUrl) => {
    await page.goto(detailUrl, { waitUntil: "networkidle2" });
    await page.waitForSelector('#account', { visible: true, timeout: 20000 });

    const data = await page.$eval('#account', (container) => {
        const getText = label => {
            const el = Array.from(container.querySelectorAll('span.font-weight-bold'))
                .find(span => span.textContent.includes(label));
            return el?.parentElement.querySelector('p')?.innerText.trim() || '';
        };

        let tax_account_id = '';
        const h3Element = document.querySelector('.row h3');
        if (h3Element) {
            const h3Text = h3Element.textContent.trim();
            const match = h3Text.match(/Account\s+(\d+)/);
            if (match) tax_account_id = match[1];
        }

        const parcel_number = tax_account_id;
        const owner_name = [getText('Owner')];
        const property_address = getText('Situs Address');


        return {
            owner_name,
            property_address,
            parcel_number,
            taxing_authority: "Lake County Tax Collector, Oregon",
            tax_history: [],
            notes: "",
            delinquent: "N/A",
        };
    });

    // --- NAVIGATE TO VALUES TAB ---
    const valuesTabSelector = '#values-tab';
    await page.waitForSelector(valuesTabSelector, { visible: true });
    await page.click(valuesTabSelector);

    // Wait for the Values table to load
    await page.waitForSelector('#values table tbody tr', { visible: true, timeout: 10000 });
    const latestValues = await page.$eval('#values table tbody tr:first-child', row => {
        const tds = Array.from(row.querySelectorAll('td'));
        return {
            av: tds[3]?.innerText.trim() || ''
        };
    });

    // Update data with extracted AV
    data.total_assessed_value = latestValues.av;
    data.total_taxable_value = latestValues.av; // assuming taxable value = AV
    data.latest_value = latestValues;

    return data;
};



// STEP 3 – Paid History Scraper
const lake_paid = async (page) => {
    let rawPayments = [];
    try {
        const paymentButtonSelector = 'button[data-target="#paymentHistoryModal"]';
        await page.waitForSelector(paymentButtonSelector, { visible: true, timeout: 5000 });
        await page.click(paymentButtonSelector);
        const tableContentSelector = '#payment-history tbody tr';
        await page.waitForSelector(tableContentSelector, { timeout: 15000 });

        rawPayments = await page.$eval('#payment-history tbody', tbody => {
            const payments = [];
            Array.from(tbody.querySelectorAll('tr')).forEach(row => {
                const tds = Array.from(row.querySelectorAll('td'));
                if (tds.length === 4) {
                    payments.push({
                        year: tds[0].innerText.trim(),
                        receipt_number: tds[1].innerText.trim() || "N/A",
                        paid_date: tds[2].innerText.trim(),
                        amount_paid_str: tds[3].innerText.trim(),
                    });
                }
            });
            return payments;
        });

        await page.click('#paymentHistoryModal button.close').catch(() => { });
        if (rawPayments.length === 0) return [];

        const sortedYears = [...new Set(rawPayments.map(p => parseInt(p.year)))].sort((a, b) => b - a);
        const mostRecentYear = sortedYears[0].toString();
        const recentYearPayments = rawPayments.filter(p => p.year === mostRecentYear);
        if (recentYearPayments.length === 0) return [];

        const year = parseInt(mostRecentYear);
        const trimesters = [
            { id: 1, due_date: `11/15/${year}`, delq_date: `12/16/${year}`, status: "Due", raw_payments: [] },
            { id: 2, due_date: `2/15/${year + 1}`, delq_date: `2/16/${year + 1}`, status: "Due", raw_payments: [] },
            { id: 3, due_date: `5/15/${year + 1}`, delq_date: `5/16/${year + 1}`, status: "Due", raw_payments: [] },
        ];

        const getInstallmentIndex = (paidDate) => {
            const date = new Date(paidDate);
            const month = date.getMonth() + 1;
            const yr = date.getFullYear();
            if (yr === year && month >= 8) return 0;
            if (yr === year + 1 && month >= 1 && month <= 3) return 1;
            if (yr === year + 1 && month >= 4 && month <= 6) return 2;
            if (date > new Date(trimesters[2].due_date)) return 2;
            return -1;
        };

        recentYearPayments.forEach(p => {
            const index = getInstallmentIndex(p.paid_date);
            if (index >= 0) trimesters[index].raw_payments.push(p);
        });

        const paidInstallments = trimesters.map(t => {
            const totalPaid = t.raw_payments.reduce((sum, p) => sum + parseDollar(p.amount_paid_str), 0);
            const isPaid = totalPaid > 0.01;
            return {
                jurisdiction: "County",
                year: mostRecentYear,
                payment_type: `Trimester #${t.id}`,
                status: isPaid ? "Paid" : "Unpaid",
                base_amount: totalPaid.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                amount_paid: totalPaid.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                amount_due: isPaid ? "$0.00" : "$0.00",
                mailing_date: "N/A",
                due_date: t.due_date,
                delq_date: t.delq_date,
                paid_date: t.raw_payments[0]?.paid_date || "",
                good_through_date: "",
            };
        }).filter(t => t.status === 'Paid');

        const totalPaidInstallments = paidInstallments.length;
        const finalHistory = paidInstallments.map(t => {
            if (totalPaidInstallments === 1) return { ...t, payment_type: 'Annual' };
            return t;
        });

        return finalHistory;

    } catch (e) {
        console.warn("Failed to load payment history: " + e.message);
        return [];
    }
};

// STEP 4 – PDF Unpaid Check
const lake_pdf_recent = async (page, data) => {
    const MIN_TAX_AMOUNT = 10.00;

    try {
        const pdfLink = await page.$eval('a[href*="TaxSummary"]', el => el.href).catch(() => null);
        if (!pdfLink) {
            data.notes = "Could not find Tax Summary PDF link. Cannot fully determine delinquency from history.";
            return data;
        }

        const pdfBuffer = await page.evaluate(async url => {
            const res = await fetch(url);
            const arr = await res.arrayBuffer();
            return Array.from(new Uint8Array(arr));
        }, pdfLink);

        const pdfParser = new PDFParser();
        pdfParser.parseBuffer(Buffer.from(pdfBuffer));

        const parsedData = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", err => reject(err.parserError));
            pdfParser.on("pdfParser_dataReady", pdf => {
                const texts = [];
                pdf.Pages.forEach(p => p.Texts.forEach(t => texts.push(decodeURIComponent(t.R[0].T))));
                resolve(texts);
            });
        });

        const dollarRegex = /\$\d[\d,]*\.?\d*/;
        const yearRegex = /\b(20\d{2})\b/;
        let uniqueKeyMap = new Map();

        for (let i = 0; i < parsedData.length; i++) {
            const yearMatch = parsedData[i].match(yearRegex);
            if (!yearMatch) continue;
            if (i + 1 < parsedData.length && !parsedData[i + 1].toUpperCase().includes('ADVALOREM')) continue;

            const year = yearMatch[1];
            let dollarCount = 0;
            let totalDue = "$0.00";
            let originalDue = "$0.00";

            for (let j = i + 1; j < i + 15 && j < parsedData.length; j++) {
                const amountMatch = parsedData[j].match(dollarRegex);
                if (amountMatch) {
                    dollarCount++;
                    if (dollarCount === 1) totalDue = amountMatch[0];
                    if (dollarCount === 5) { originalDue = amountMatch[0]; break; }
                }
                if (j > i + 1 && parsedData[j].match(yearRegex)) break;
            }

            const numTotalDue = parseDollar(totalDue);
            const numOriginalDue = parseDollar(originalDue);
            // const status = determineStatusByDate(t.due_date, t.delq_date);

            if (numTotalDue > MIN_TAX_AMOUNT && numOriginalDue > 0.00) {
                const dueDate = `11/15/${year}`;
                const delqDate = `11/16/${year}`;
                const status = determineStatusByDate(dueDate, delqDate);

                const uniqueKey = `${year}-${originalDue}`;
                if (!uniqueKeyMap.has(uniqueKey)) {
                    uniqueKeyMap.set(uniqueKey, {
                        jurisdiction: "County",
                        year,
                        payment_type: "Annual",
                        status,
                        base_amount: originalDue,
                        amount_paid: "$0.00",
                        amount_due: totalDue,
                        mailing_date: "N/A",
                        due_date: dueDate,
                        delq_date: delqDate,
                        paid_date: "",
                        good_through_date: "",
                    });
                }
            }

        }

        data.tax_history = Array.from(uniqueKeyMap.values()).sort((a, b) => parseInt(b.year) - parseInt(a.year));
        data = updateTaxNotes(data, false); 
        delete data.current_amount_due;

        return data;

    } catch (err) {
        console.error(`lake_pdf_recent failed for URL ${page.url()}: ${err.message}`);
        if (data.current_amount_due) delete data.current_amount_due;
        data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ALSO DELINQUENT, NORMALLY TAXES ARE PAID TRIMESTERLY, NORMAL DUE DATES ARE 11/15, 02/15, & 05/15`;
        return data;
    }
};

// STEP 5 – Orchestrator
const lake_account_search = async (page, account) => {
    const detailUrl = await lake_1(page, account);
    let data = await lake_2(page, detailUrl);
    data = await lake_pdf_recent(page, data);

    // Fallback paid history
    if (data.tax_history.length === 0) {
        data.tax_history = await lake_paid(page);
        data = updateTaxNotes(data, true); 
    }

    return data;
};

// STEP 6 – Express Handler
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser;
    try {
        browser = await getBrowserInstance();
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setUserAgent("Mozilla/5.0");
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["font", "image", "stylesheet"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        const fetchData = async () => lake_account_search(page, account);
        const handler = fetch_type === "html"
            ? result => res.status(200).render("parcel_data_official", result)
            : result => res.status(200).json({ result });

        fetchData()
            .then(handler)
            .catch(error => {
                if (fetch_type === "html") res.status(500).render("error_data", { error: true, message: error.message });
                else res.status(500).json({ error: true, message: error.message });
            })
            .finally(() => ctx.close());

    } catch (err) {
        console.error("Browser or orchestrator failed:", err);
        if (browser) await browser.close().catch(() => { });
        if (fetch_type === "html") res.status(500).render("error_data", { error: true, message: err.message });
        else res.status(500).json({ error: true, message: err.message });
    }
};

export { search };