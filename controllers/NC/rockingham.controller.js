// Author: Sanam Poojitha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };
const toMMDDYYYY = (raw) => {
    if (!raw || raw === "N/A") return "N/A";
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return `${String(d.getMonth() + 1).padStart(2, "0")}/` +
        `${String(d.getDate()).padStart(2, "0")}/` +
        `${d.getFullYear()}`;
};

const rockinghamDelqDate = (year) =>
    `01/06/${Number(year) + 1}`;

const rockinghamDueDate = (year) =>
    `01/05/${Number(year) + 1}`;

const isPastDate = (mmddyyyy) => {
    const [mm, dd, yyyy] = mmddyyyy.split("/");
    const date = new Date(`${yyyy}-${mm}-${dd}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > date;
};

const money = (val) => {
    if (!val || val === "N/A") return "$0.00";

    const num = String(val).replace(/[$,]/g, "");
    if (isNaN(num)) return "$0.00";

    return `$${Number(num).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};
const removeOwnerFromAddress = (address, owner) => {
    if (!address || address === "N/A" || !owner) return address;

    const ownerNorm = owner
        .replace(/[.,]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    return address
        .split(",")
        .filter(part => {
            const partNorm = part
                .replace(/[.,]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toUpperCase();
            return partNorm !== ownerNorm;
        })
        .join(", ")
        .replace(/\s+,/g, ",")
        .trim();
};

const resolveStatusByDate = (status, due_date, delq_date) => {
    if (status === "Paid") return "Paid";

    if (isPastDate(delq_date)) return "Delinquent";
    if (isPastDate(due_date)) return "Delinquent";

    return "Due";
};

// ---------------- TAX NOTES ------------------
const applyTaxNotes = (data) => {
    const suffix =
        `, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE AND DELQ DATES ARE 01/05 01/06`;

    const list = Array.isArray(data.tax_history) ? data.tax_history : [];

    if (!list.length) {
        data.notes = "NO TAX HISTORY FOUND" + suffix;
        data.delinquent = "UNKNOWN";
        return data;
    }

    // Sort descending for notes
    list.sort((a, b) => Number(b.year) - Number(a.year)); // newest first
    const latest = list[0]; // first is latest



    const priors = list.filter(x => x.year < latest.year);
    const anyDelq = list.some(x => x.status === "Delinquent");
    const priorsDelq = priors.some(x => x.status === "Delinquent");


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

    if (anyDelq) {
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else {
        data.delinquent = "NONE";
    }


    return data;
};
// ---------------- STEP 1: SEARCH ------------------
const ac_1 = async (page, search) => {
    await page.goto(
        "https://www.ustaxdata.com/nc/rockingham/rockinghamtaxsearch.cfm",
        { waitUntil: "domcontentloaded" },timeout_option
    );

    const value = String(search).trim();

    // If numeric and longer than 6 → treat as account number
    const isAccountSearch = /^\d+$/.test(value) && value.length > 6;

    if (isAccountSearch) {
        // -------- ACCOUNT NUMBER SEARCH --------
        await page.waitForSelector("input[name='accountNum']");
        await page.type("input[name='accountNum']", value);
    } else {
        // -------- PARCEL NUMBER SEARCH --------
        await page.waitForSelector("input[name='parcelNum']");
        await page.type("input[name='parcelNum']", value);
    }

    await Promise.all([
        page.click("input[type='submit'][value='Search']"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" })
    ]);
};
// ---------------- STEP 2: TAX LIST ------------------
const ac_2 = async (page) => {
    await page.waitForSelector("table.a1 tr.style16");

    return await page.evaluate(() => {
        const rows = [...document.querySelectorAll("tr.style16")];
        const records = [];

        rows.forEach(row => {
            const tds = row.querySelectorAll("td");
            if (tds.length < 10) return;

            const year = tds[1]?.innerText.trim();

            const taxesOwedRaw = tds[7]?.innerText.trim();
            const taxesOwed = taxesOwedRaw.replace(/[$,]/g, "");

            // STATUS: bill_open.gif = DUE
            const statusImg = tds[6]?.querySelector("img");
            const status =
                statusImg && statusImg.src.includes("bill_open")
                    ? "Due"
                    : Number(taxesOwed) === 0
                        ? "Paid"
                        : "Due";

            //  TAX BILL LINK
            const billLink = tds[8]?.querySelector("a")?.getAttribute("href");

            const ownerId = billLink?.match(/ownerID=(\d+)/)?.[1] || null;
            const billNo = billLink?.match(/billNo=(\d+)/)?.[1] || null;
            const taxYear = billLink?.match(/TaxYear=(\d+)/)?.[1] || null;

            const ownerRaw = tds[4]?.innerText || "";
            const addressRaw = tds[5]?.innerText || "";

            const owner = ownerRaw
                .split("/")
                .map(x => x.trim())
                .filter(Boolean)
                .join(" / ");

            const property_address = addressRaw.replace(/\s+/g, " ").trim();

            records.push({
                year,
                status,
                taxesOwed,
                ownerId,
                billNo,
                taxYear,
                owner,
                property_address
            });

        });

        return records;
    });
};
// ---------------- STEP 3: ACCOUNT INFO ------------------

const ac_3 = async (page, parcel) => {
    await page.goto(
        `https://www.ustaxdata.com/nc/rockingham/account.cfm?parcelID=${parcel}`,
        { waitUntil: "domcontentloaded" }
    );

    return await page.evaluate(() => {
        const clean = t => t?.replace(/\s+/g, " ").trim() || "N/A";

        let owner = "N/A";
        let address = "N/A";
        let assessed = "N/A";
        let parcel_no = "N/A";

        // -------- PROPERTY OWNER --------
        const ownerHeader = [...document.querySelectorAll("font")]
            .find(f => f.innerText.trim() === "Property Owner");

        if (ownerHeader) {
            owner = clean(
                ownerHeader.closest("table")
                    ?.parentElement
                    ?.querySelector("table[bgcolor='a9a9a9'] font")
                    ?.innerText
            );
        }

        // -------- PROPERTY LOCATION ADDRESS --------
        const addressHeader = [...document.querySelectorAll("font")]
            .find(f => f.innerText.trim() === "Property Location Address");

        if (addressHeader) {
            address = clean(
                addressHeader.closest("table")
                    ?.parentElement
                    ?.querySelector("table[bgcolor='a9a9a9'] font")
                    ?.innerText
            );
        }

        // -------- PARCEL NUMBER --------
        const rows = [...document.querySelectorAll("tr")];
        for (const row of rows) {
            const tds = row.querySelectorAll("td");
            if (
                tds.length === 2 &&
                tds[0].innerText.includes("Parcel ID")
            ) {
                parcel_no = clean(tds[1].innerText);
            }

            // -------- ASSESSED VALUE (NUMBERS ONLY) --------

            const cells = row.querySelectorAll("td");
            if (cells.length === 2 && cells[0].innerText.includes("Assessed Value")) {
                const raw = clean(cells[1].innerText); // e.g. 561,110 or $561,110
                const num = raw.replace(/[$,]/g, "");

                assessed = num && !isNaN(num)
                    ? `$${Number(num).toLocaleString("en-US")}`
                    : "N/A";
                break;
            }


        }

        return { owner, address, assessed, parcel_no };
    });
};
// ---------------- STEP 4: TRANSACTION HISTORY ------------------
const ac_4 = async (page, ownerId, year) => {
    await page.goto(
        `https://www.ustaxdata.com/nc/rockingham/transhistory.cfm?ownerID=${ownerId}`,
        { waitUntil: "domcontentloaded" }
    );

    return await page.evaluate((year) => {
        const rows = [...document.querySelectorAll("table tr")];

        for (const row of rows) {
            const tds = row.querySelectorAll("td");
            if (!tds.length) continue;

            if (tds[1]?.innerText.includes(year)) {
                return {
                    paid_date: tds[4]?.innerText.trim(),
                    amount: tds[5]?.innerText.trim(),
                    due_date: tds[6]?.innerText.trim()
                };
            }
        }

        return {};
    }, year);
};
const normalizeOwner = (name) => {
    if (!name) return "N/A";

    const clean = name
        .replace(/\s+/g, " ")
        .trim();

    return clean && clean !== "N/A" ? clean : "N/A";
};
const extractOwnerFromAddress = (address) => {
    if (!address || address === "N/A") return "N/A";

    const first = address.split(",")[0]?.trim();
    return first ? first : "N/A";
};


const ac_5 = async (page, ownerId, billNo, taxYear) => {
    await page.goto(
        `https://www.ustaxdata.com/nc/rockingham/taxbill.cfm?ownerID=${ownerId}&billNo=${billNo}&TaxYear=${taxYear}`,
        { waitUntil: "domcontentloaded" }
    );

    return await page.evaluate(() => {
        const clean = t => t?.replace(/\s+/g, " ").trim() || "N/A";

        // OWNER + ADDRESS
        const ownerBlock = [...document.querySelectorAll("td.smallT1 strong")]
            .find(el =>
                el.innerText.includes("NC") &&
                el.innerText.split("\n").length >= 3
            );

        let owner_name = "N/A";
        let property_address = "N/A";

        if (ownerBlock) {
            const stripOwnerFromAddress = (address, owner) => {
                if (!address || !owner) return address;
                const ownerNorm = owner.replace(/\s+/g, " ").trim().toUpperCase();
                return address
                    .split(",")
                    .filter(part => !ownerNorm.includes(part.trim().toUpperCase()))
                    .join(", ")
                    .replace(/\s+,/g, ",")
                    .trim();
            };

            const ownerLines = ownerBlock.innerText
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean);

            owner_name = ownerLines[0] || "N/A";

            let rawAddress = ownerLines
                .slice(1)
                .filter(x => x && x !== "N/A")
                .join(", ");

            rawAddress = stripOwnerFromAddress(rawAddress, owner_name);

            property_address = rawAddress || "N/A";
        }

        const headerRow = document.querySelector("tr[valign='top'][bgcolor='#FFFFFF']");
        let year = "N/A";
        let due_date = "N/A";
        let assessed_value = "N/A";

        if (headerRow) {
            const tds = headerRow.querySelectorAll("td");

            year = clean(tds[0]?.innerText);
            due_date = clean(tds[3]?.innerText).replace(/-/g, "/");

            const rawVal = clean(tds[4]?.innerText).replace(/,/g, "");
            if (rawVal && !isNaN(rawVal)) {
                assessed_value = `$${Number(rawVal).toLocaleString("en-US")}`;
            }
        }

        return {
            owner_name,
            property_address,
            year,
            due_date,
            assessed_value
        };
    });
};


// ---------------- ORCHESTRATOR ------------------
const account_search = async (page, parcel) => {
    const searchedParcel = String(parcel).trim();
    await ac_1(page, parcel);

    const rawList = await ac_2(page);
    const accountInfo = await ac_3(page, parcel);

    // -------------------------------
    // STEP 1: DEDUPE BY YEAR
    // -------------------------------
    const byYear = {};
    for (const row of rawList) {
        if (!row.year) continue;
        byYear[row.year] = row; // last one wins
    }

    const uniqueList = Object.values(byYear);

    if (!uniqueList.length) {
        return applyTaxNotes({
            owner_name: [accountInfo.owner],
            property_address: accountInfo.address,
            total_assessed_value: accountInfo.assessed,
            total_taxable_value: accountInfo.assessed,
            taxing_authority: "Rockingham County Tax Collector, NC",
            notes: "",
            delinquent: "",
            tax_history: []
        });
    }

    // -------------------------------
    // STEP 2: FIND MOST RECENT YEAR
    // -------------------------------
    uniqueList.sort((a, b) => Number(b.year) - Number(a.year)); // NEWEST YEAR FIRST
    const latestRow = uniqueList[0];

    // STEP 3: DECIDE REQUIRED YEARS
    let rowsToProcess = [];
    if (latestRow.status === "Paid") {
        rowsToProcess = [latestRow];
    } else {
        rowsToProcess = uniqueList
            .filter(r => Number(r.year) <= Number(latestRow.year) && r.status !== "Paid")
            .sort((a, b) => Number(b.year) - Number(a.year)); // ensure newest → oldest
    }

    //  TRUST TAX LIST FOR OWNER & ADDRESS
    if (latestRow.owner) {
        accountInfo.owner = latestRow.owner;
    }

    if (latestRow.property_address) {
        accountInfo.address = latestRow.property_address;
    }

    // -------------------------------
    // STEP 4: BUILD TAX HISTORY
    // -------------------------------
    const tax_history = [];
    for (const row of rowsToProcess) {
        let paid = {};
        let billData = {};


        if (row.status === "Due" && row.billNo && row.ownerId) {
            billData = await ac_5(page, row.ownerId, row.billNo, row.taxYear);

            // 🔹 APPLY BILL DATA
            if (billData.assessed_value !== "N/A") {
                accountInfo.assessed = billData.assessed_value;
            }



            if (billData.assessed_value !== "N/A") {
                accountInfo.assessed = billData.assessed_value;
            }
        }


        if (row.ownerId) {
            paid = await ac_4(page, row.ownerId, row.year);
        }

        const dueDate = rockinghamDueDate(row.year);
        const delqDate = rockinghamDelqDate(row.year);

        const finalStatus = resolveStatusByDate(
            row.status,
            dueDate,
            delqDate
        );

        tax_history.push({
            jurisdiction: "County",
            year: row.year,
            payment_type: "Annual",
            status: finalStatus,

            base_amount:
                finalStatus === "Paid"
                    ? money(paid.amount)
                    : money(row.taxesOwed),

            amount_paid: money(paid.amount),

            amount_due:
                finalStatus === "Paid"
                    ? "$0.00"
                    : money(row.taxesOwed),

            due_date: dueDate,
            delq_date: delqDate,

            paid_date:
                finalStatus === "Paid"
                    ? toMMDDYYYY(paid.paid_date)
                    : "-",

            good_through_date: "N/A",
            mailing_date: "N/A"
        });

    }


    // -------------------------------
    // FINAL RESULT
    // -------------------------------
    const finalOwner =
        normalizeOwner(accountInfo.owner) !== "N/A"
            ? normalizeOwner(accountInfo.owner)
            : extractOwnerFromAddress(accountInfo.address);

    const finalAddress = removeOwnerFromAddress(
        accountInfo.address,
        finalOwner
    );


    const result = {
        parcel_number:
            accountInfo.parcel_no !== "N/A"
                ? accountInfo.parcel_no
                : searchedParcel,

        owner_name: [finalOwner],
        property_address: finalAddress,
        total_assessed_value: accountInfo.assessed,
        total_taxable_value: accountInfo.assessed,
        taxing_authority: "Rockingham County Tax Collector, NC",
        tax_history
    };


    return applyTaxNotes(result);


};

// ---------------- EXPRESS HANDLER ------------------
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        page.setDefaultNavigationTimeout(90000);

        const result = await account_search(page, account);

        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", result);
        } else {
            res.status(200).json({ result });
        }

        await context.close();
    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
};

export { search };
