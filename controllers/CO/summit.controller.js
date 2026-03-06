// Author: Sanam Poojitha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const logError = (scope, err) => {
    console.error(`[${scope}]`, err?.message || err);
};


// ---------------- TAX NOTES LOGIC ------------------

const applyTaxNotes = (data) => {
    const suffix =
        ", NORMALLY TAXES ARE PAID ANNUALLY/SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/28 AND 06/15";

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    // sort by year
    list.sort((a, b) => +a.year - +b.year);

    const latest = list.at(-1);
    const priors = list.filter(x => x.year < latest.year);

    // PRIOR YEAR DELINQUENCY = ONLY Delinquent
    const priorsDelq = priors.some(x => x.status === "Delinquent");
    const priorsTxt = priorsDelq
        ? "PRIORS ARE DELINQUENT"
        : "ALL PRIORS ARE PAID";

    // CURRENT YEAR STATUS (priority-based)
    const currentStatuses = list
        .filter(x => x.year === latest.year)
        .map(x => x.status);

    const currentDelinquent = currentStatuses.includes("Delinquent");
    const currentDue = currentStatuses.includes("Due");

    const currentYearStatus = currentDelinquent
        ? "DELINQUENT"
        : currentDue
        ? "DUE"
        : "PAID";

    // NOTES
    data.notes = `${priorsTxt}, ${latest.year} TAXES ARE ${currentYearStatus}${suffix}`;

    // OVERALL DELINQUENT FLAG
    if (currentDelinquent || priorsDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else if (currentDue) {
        data.delinquent = "NONE";
    } else {
        data.delinquent = "NONE";
    }

    return data;
};

// ---------------- AC-1: SEARCH PARCEL ------------------
const SUMMIT_URL = "https://apps.summitcountyco.gov/ACTionTreasurer/default.aspx";

async function ac_1(page, parcel) {
    try {
        await page.goto(SUMMIT_URL, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        // Wait for input
        await page.waitForSelector(
            "#ctl00_contentBody_TabContainer1_pnlSearch_AccordionPaneScheduleSearch_content_txtPropertySchedule",
            { timeout: 30000 }
        );

        // Fill parcel / schedule number
        await page.type(
            "#ctl00_contentBody_TabContainer1_pnlSearch_AccordionPaneScheduleSearch_content_txtPropertySchedule",
            String(parcel),
            { delay: 30 }
        );

        // Click search
        await page.click(
            "#ctl00_contentBody_TabContainer1_pnlSearch_AccordionPaneScheduleSearch_content_btnScheduleSearch"
        );

        // ASP.NET postback – wait for results table
        await page.waitForSelector(
            "#ctl00_contentBody_TabContainer1_pnlViewer_tdLayout",
            { timeout: 90000 }
        );

    } catch (err) {
        logError("SUMMIT_AC_1", err);
        throw new Error(`Summit AC_1 failed: ${err.message}`);
    }
}


// ---------------- AC-2: SCRAPE DATA ------------------

async function ac_2(page) {
    try {
        const clean = v =>
            typeof v === "string"
                ? v.replace(/\s+/g, " ").trim()
                : "";

        const money = v => {
            if (v === null || v === undefined || v === "") return "";

            const n =
                typeof v === "number"
                    ? v
                    : Number(
                        String(v)
                            .replace(/[,$]/g, "")
                            .replace("(", "-")
                            .replace(")", "")
                    );

            if (isNaN(n)) return "";

            return n.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2
            });
        };


        const num = v => {
            if (typeof v === "number") return v;
            if (!v) return 0;
            return Number(
                String(v)
                    .replace(/[,$]/g, "")
                    .replace("(", "-")
                    .replace(")", "")
            );
        };

        const isPast = dateStr =>
            new Date() > new Date(dateStr);

        const data = {
            owner_name: [],
            parcel_number: "",
            property_address: "",
            tax_year: "",
            total_assessed_value: "N/A",
            total_taxable_value: "N/A",
            taxing_authority:
                "Summit County Treasurer, 208 E Lincoln Ave, Breckenridge, CO 80424",
            tax_history: [],
            notes: "",
            delinquent: ""
        };

        /* ===========================
           MAIN PAGE SCRAPE
        ============================ */
        const scraped = await page.evaluate(() => {
            const container = document.querySelector(
                "#ctl00_contentBody_TabContainer1_pnlViewer_tdLayout"
            );
            if (!container) return {};

            const text = container.innerText;

            const parcel =
                text.match(/Property Schedule:\s*(\d+)/)?.[1] || "";
            const taxYear =
                text.match(/Tax Year:\s*(\d{4})/)?.[1] || "";
            const address =
                text.match(/Street Address:\s*(.+)/)?.[1] || "";
            const taxableValue =
                text.match(/Taxable Value:\s*([$0-9,.\s]+)/)?.[1] || "";
            const assessedValue =
                text.match(/Assessed Value:\s*([$0-9,.\s]+)/)?.[1] || "";

            const ownerTd = container.querySelector(
                "table th:nth-child(1)"
            )?.parentElement?.nextElementSibling?.children[0];

            let currentDue = "";
            let paidToDate = "";
            let unpaid = "";

            const summaryRow = document.querySelector(
                "#ctl00_contentBody_TabContainer1_pnlViewer_trAccountSummary"
            );

            if (summaryRow) {
                summaryRow.querySelectorAll("tr").forEach(r => {
                    const tds = r.querySelectorAll("td");
                    if (tds.length !== 2) return;
                    const label = tds[0].innerText.trim();
                    const value = tds[1].innerText.trim();
                    if (label.includes("Current Due")) currentDue = value;
                    if (label.includes("Paid to Date")) paidToDate = value;
                    if (label.includes("Unpaid Balance")) unpaid = value;
                });
            }

            return {
                parcel,
                taxYear,
                address,
                owner: ownerTd?.innerText || "",
                taxableValue,
                assessedValue,
                currentDue,
                paidToDate,
                unpaid
            };
        });

        /* ===========================
           ASSIGN BASIC DATA
        ============================ */
        data.parcel_number = scraped.parcel;
        data.tax_year = scraped.taxYear;
        data.property_address = clean(scraped.address);

        if (scraped.owner) {
            data.owner_name = [clean(scraped.owner.replace(/\n/g, ", "))];
        }

        data.total_taxable_value = money(scraped.taxableValue);
        data.total_assessed_value = money(scraped.assessedValue);

        const unpaidBalance = num(scraped.unpaid);
        // const year = scraped.taxYear;
        const today = new Date();

        /* ===========================
           OPEN ACCOUNT STATEMENT
        ============================ */
        const [statementPage] = await Promise.all([
            new Promise(resolve =>
                page.browser().once("targetcreated", t => resolve(t.page()))
            ),
            page.click(
                "#ctl00_contentBody_TabContainer1_pnlViewer_btnPrintStatement"
            )
        ]);

        await statementPage.waitForSelector("table.txtReporting", {
            timeout: 60000
        });

        const payments = await statementPage.evaluate(() => {
            return Array.from(
                document.querySelectorAll("table.txtReporting tr")
            )
                .slice(1)
                .map(r => {
                    const tds = r.querySelectorAll("td");
                    if (tds.length !== 4) return null;
                    return {
                        date: tds[0].innerText.split("\n")[0].trim(),
                        description: tds[1].innerText.trim(),
                        amount: tds[3].innerText.trim()
                    };
                })
                .filter(Boolean);
        });

        await statementPage.close();

        const baseAmount =
            num(scraped.currentDue) ||
            num(scraped.paidToDate) ||
            0;

        const fullPayment = payments.find(p =>
            /Full Payment/i.test(p.description)
        );
        const firstHalf = payments.find(p =>
            /1st Half Payment/i.test(p.description)
        );
        const secondHalf = payments.find(p =>
            /2nd Half Payment/i.test(p.description)
        );
        const year = scraped.taxYear;
        const dueYear = Number(year) + 1;


        /* ===========================
           ANNUAL
        ============================ */
        if (fullPayment) {
            const due = `04/30/${dueYear}`;
            const delq = `05/01/${dueYear}`;

            data.tax_history.push({
                year,
                jurisdiction: "County",
                base_amount: money(baseAmount),
                amount_paid: money(Math.abs(num(fullPayment.amount))),
                amount_due: "$0.00",
                payment_type: "Annual",
                paid_date: fullPayment.date,
                status: "Paid",
                due_date: due,
                delq_date: delq,
                mailing_date: "N/A"
            });

            data.delinquent = "NONE";
        }

        /* ===========================
           SEMI-ANNUAL
        ============================ */
        else {
            const half = baseAmount / 2;

            const firstDue = `02/28/${dueYear}`;
            const firstDelq = `03/01/${dueYear}`;
            const secondDue = `06/15/${dueYear}`;
            const secondDelq = `06/16/${dueYear}`;

            const firstStatus =
                firstHalf
                    ? "Paid"
                    : unpaidBalance > 0 && isPast(firstDue)
                        ? "Delinquent"
                        : "Due";

            const secondStatus =
                secondHalf
                    ? "Paid"
                    : unpaidBalance > 0 && isPast(secondDue)
                        ? "Delinquent"
                        : "Due";

            data.tax_history.push({
                year,
                jurisdiction: "County",
                base_amount: money(half),
                amount_paid: firstHalf
                    ? money(Math.abs(num(firstHalf.amount)))
                    : "$0.00",
                amount_due: firstHalf ? "$0.00" : money(half),
                payment_type: "Semi-Annual",
                paid_date: firstHalf?.date || "-",
                status: firstStatus,
                due_date: firstDue,
                delq_date: firstDelq,
                mailing_date: "N/A"
            });

            data.tax_history.push({
                year,
                jurisdiction: "County",
                base_amount: money(half),
                amount_paid: secondHalf
                    ? money(Math.abs(num(secondHalf.amount)))
                    : "$0.00",
                amount_due: secondHalf ? "$0.00" : money(half),
                payment_type: "Semi-Annual",
                paid_date: secondHalf?.date || "-",
                status: secondStatus,
                due_date: secondDue,
                delq_date: secondDelq,
                mailing_date: "N/A"
            });

            data.delinquent =
                unpaidBalance > 0 &&
                    (isPast(firstDue) || isPast(secondDue))
                    ? "NONE"
                    : "NONE";
        }


        applyTaxNotes(data);
        return data;

    } catch (err) {
        logError("SUMMIT_AC_2", err);
        throw new Error(`Summit AC_2 failed: ${err.message}`);
    }
}
// ---------------- COMBINED SEARCH ------------------

const account_search = async (page, parcel) => {
    return new Promise((resolve, reject) => {
        ac_1(page, parcel)
            .then(() => ac_2(page))
            .then(resolve)
            .catch(err => reject(new Error(err.message)));
    });
};
// ---------------- EXPRESS HANDLER ------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        // await page.setViewport({ width: 1366, height: 768});
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error)
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                })
        }
        else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    })
                })
                .catch((error) => {
                    console.log(error)
                    res.status(500).json({
                        error: true,
                        message: error.message
                    })
                })
                .finally(async () => {
                    await context.close();
                })
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}
module.exports = { search };