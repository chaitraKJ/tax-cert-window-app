//Author:sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
const timeout_option = { timeout: 90000 };
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE AND DELQ DATES ARE 09/01 01/05`;

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    list.sort((a, b) => +a.year - +b.year);
    const latest = list.at(-1);

    const priors = list.filter((x) => x.year < latest.year);
    const anyDelq = list.some((x) => x.status === "Delinquent");
    const priorsDelq = priors.some((x) => ["Delinquent", "Due"].includes(x.status));

    const priorsTxt = priorsDelq ? "PRIORS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

    switch (latest.status) {
        case "Paid":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE PAID${suffix}`;
            break;
        case "Due":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DUE${suffix}`;
            break;
        case "Delinquent":
            data.notes = `${priorsTxt}, ${latest.year} TAXES ARE DELINQUENT${suffix}`;
            break;
        default:
            data.notes = `${latest.year} TAX STATUS UNKNOWN, VERIFY MANUALLY${suffix}`;
    }

    if (anyDelq) data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    else if (priorsDelq || latest.status === "Due") data.delinquent = "YES";
    else data.delinquent = "NONE";

    return data;
};

// STEP 1: Search parcel & return parcel ID
const ac_1 = async (page, account) => {
    try {
        await page.goto("https://tax.buncombenc.gov/", { waitUntil: "domcontentloaded" });

        const disclaimerBtn = await page.waitForSelector('#userAgreementAccept', { visible: true, timeout: 90000 });
        await disclaimerBtn.click();

        await page.$eval("#Query", el => (el.value = ""));
        await page.type("#Query", String(account));

        const searchBtn = await page.$("#submit");
        if (searchBtn) {
            await Promise.all([
                searchBtn.click(),
                page.waitForNavigation({ waitUntil: "domcontentloaded" })
            ]);
        } else {
            await page.keyboard.press("Enter");
        }

        // Wait for parcel result link
        await page.waitForSelector("a.card-link[href*='/Parcel/Details/']", { visible: true, timeout: 10000 });

        // Extract parcel ID from the search results
        const parcelLink = await page.$eval(
            "a.card-link[href*='/Parcel/Details/']",
            el => el.getAttribute("href")
        );

        const parcelId = parcelLink.split("/").pop();  // last part of URL
        return parcelId;

    } catch (error) {
        console.log("ac_1 error:", error);
        throw error;
    }
};


// STEP 2: Scrape parcel bill information
const ac_2 = async (page, parcel) => {
    try {
        const parcelUrl = `https://tax.buncombenc.gov/Parcel/Details/${parcel}?Query=${parcel}&QueryType=Parcel%20ID`;
        await page.goto(parcelUrl, { waitUntil: "networkidle2" });

        await page.waitForSelector("a[href^='/Bill/Details/']", { timeout: 15000 });

        const billLink = await page.$eval("a[href^='/Bill/Details/']", a => a.getAttribute("href"));
        const billUrl = "https://tax.buncombenc.gov" + billLink;

        await page.goto(billUrl, { waitUntil: "networkidle2" });
        await page.waitForSelector(".bill-detail", { timeout: 15000 });

        const taxInfo = await page.evaluate(() => {

            const getText = sel =>
                document.querySelector(sel)?.textContent.trim() || "N/A";

            const getCell = label => {
                const row = [...document.querySelectorAll(".bill-detail table tr")]
                    .find(tr => tr.querySelector("th")?.textContent.trim() === label);
                return row?.querySelector("td")?.textContent.trim() || "N/A";
            };

            // --------------------------
            // EXTRACT TRANSACTIONS
            // --------------------------
            const transactions = [];

            let billAmount = "0.00";
            let paidAmount = "0.00";
            let paidDate = "-";

            document.querySelectorAll(".transactions tbody tr").forEach(tr => {
                const tds = tr.querySelectorAll("td");
                if (!tds.length) return;

                const type = tds[0].innerText.trim();
                const date = tds[1].innerText.trim();
                const total = tds[7].innerText.trim().replace(/[()]/g, "").trim();

                const numericTotal = parseFloat(total.replace(/[$,]/g, "")) || 0;

                if (type === "BILL") billAmount = numericTotal;
                if (type === "PAYMENT") {
                    paidAmount = numericTotal;
                    paidDate = date;
                }
            });

            const levyYear = parseInt(getCell("Levy Year"), 10);
            const due_date = `09/01/${levyYear}`;
            const delq_date = `01/06/${levyYear + 1}`;

            const amount_due = Math.max(0, billAmount - paidAmount).toFixed(2);
            const status = amount_due === "0.00" ? "Paid" : "Due";

            // unified record
            transactions.push({
                jurisdiction: "County",
                year: levyYear,
                payment_type: "Annual",
                status,
                base_amount: `$${billAmount.toLocaleString()}`,
                amount_paid: `$${paidAmount.toLocaleString()}`,
                amount_due: `$${parseFloat(amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                mailing_date: "N/A",
                due_date,
                delq_date,
                paid_date: paidDate,
                good_through_date: "N/A"
            });

            // --------------------------
            // RETURN OBJECT
            // --------------------------
            return {
                year: getCell("Levy Year"),
                owner_name: [
                    getText(".col-6.fw-bold .fw-normal")
                        .replace("Owner Name(s):", "")
                        .trim()
                ],
                parcel_number: getText(".bill-detail.my-4 h2.mb-4")
                    .replace("Parcel Information:", "")
                    .trim(),
                status: getCell("Status"),
                property_address: getCell("Physical Location"),
                total_assessed_value: getCell("Total Value:"),
                total_taxable_value: getCell("Total Value:"),
                taxing_authority:
                    "Buncombe County Tax Collections182 College Street Asheville, NC 28801 Phone: (828) 250-4910",
                notes: "",
                delinquent: "",
                tax_history: transactions
            };
        });

        // -------------------------------
        //   APPLY TAX NOTES
        // -------------------------------
        return applyTaxNotes(taxInfo);

    } catch (err) {
        console.log("ac_2 error:", err);
        throw err;
    }
};



// Orchestrator
const account_search = async (page, account) => {
    const parcel = await ac_1(page, account);
    const data = await ac_2(page, parcel);
    return data;
};


// Express API handler
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent("Mozilla/5.0");
        page.setDefaultNavigationTimeout(90000);

        const result = await account_search(page, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", result);
        } else {
            res.status(200).json({ result });
        }

        await context.close();

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: true, message: error.message });
    }
};

export { search };
