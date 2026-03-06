// author: Harsh Jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };
const parseDate = (d) => {
    if (!d) return null;
    const [m, day, y] = d.split("/").map(Number);
    return new Date(y < 100 ? 2000 + y : y, m - 1, day);
};

const ac_1 = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, {
                waitUntil: "domcontentloaded",
                ...timeout_option,
            });

            // Combined selector wait and fill
            await page.waitForSelector(
                "input[title='Parcel / Identifier number (No Dashes)']",
                timeout_option
            );

            await page
                .locator("input[title='Parcel / Identifier number (No Dashes)']")
                .fill(account);

            await Promise.all([
                page.waitForNavigation({
                    waitUntil: "domcontentloaded",
                    ...timeout_option,
                }),
                page.click("button[title='Search']"),
            ]);

            // Wait for minimum required elements in parallel
            await Promise.all([
                page.waitForSelector("#dnn_ctr462_ModuleContent .font-weight-bold", timeout_option).catch(() => null),
                page.waitForSelector("#dnn_ctr464_ContentPane payment-bill-group", timeout_option).catch(() => null),
                page.waitForSelector(".public-access-payment-bill-module .bill-main .bill-content", timeout_option).catch(() => null)
            ]);

            // COMBINED DATA EXTRACTION 
            const { main_data, history, paidYearsList } = await page.evaluate(() => {
                const data = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "N/A",
                    exemption: "",
                    total_taxable_value: "N/A",
                    notes: "",
                    delinquent: "",
                    taxing_authority:
                        "Washoe County Treasurer, P.O. Box 30039, Reno, NV 89520-3039",
                    bill_year: "",
                    tax_history: [],
                };

                // Extract main data
                document
                    .querySelectorAll("#dnn_ctr462_ModuleContent .font-weight-bold")
                    .forEach((label) => {
                        const t = label.textContent.trim();
                        if (t === "Parcel/Identifier:")
                            data.parcel_number = label.nextElementSibling.textContent.trim();
                        if (t === "Property Address:")
                            data.property_address = label.nextElementSibling.textContent.trim();
                        if (t === "Owner:")
                            data.owner_name.push(label.nextElementSibling.textContent.trim());
                        if (t === "Tax Year:")
                            data.bill_year = label.nextElementSibling.textContent.trim();
                    });

                // Click accordions immediately
                const recentlyPaid = document.querySelector(".bill-collapse-button.d-inline-block");
                if (recentlyPaid) recentlyPaid.click();

                const dueOrDelqTable = document.querySelector(".card.flag-card.amber-expand");
                if (dueOrDelqTable) dueOrDelqTable.click();

                // Get paid years list
                const paidYears = [];
                const paidGroups = document.querySelectorAll('.bill-content .collapse payment-bill-group');
                paidGroups.forEach((group) => {
                    const yearElement = group.querySelector('.tile-header__value');
                    if (yearElement) {
                        const year = parseInt(yearElement.textContent.trim());
                        if (!isNaN(year)) paidYears.push(year);
                    }
                });

                // Extract history data
                const result = [];
                const get_due_delq = (dateStr) => {
                    if (!dateStr || !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateStr)) {
                        return { due_date: dateStr || "Due", delq_date: "" };
                    }
                    let [m, d, y] = dateStr.split("/").map(Number);
                    if (y < 100) y += 2000;
                    const dueDate = new Date(y, m - 1, d);
                    const delqDate = new Date(dueDate.getTime() + 86400000);
                    const fmt = (d) =>
                        `${String(d.getMonth() + 1).padStart(2, "0")}/` +
                        `${String(d.getDate()).padStart(2, "0")}/` +
                        `${d.getFullYear()}`;
                    return { due_date: fmt(dueDate), delq_date: fmt(delqDate) };
                };

                const year = parseInt(data.bill_year) || parseInt(
                    document.querySelector('.tile-header__value')?.textContent
                ) || new Date().getFullYear();

                const rows = document.querySelectorAll(".table.table-bordered.mb-0 tbody tr");

                rows.forEach((tr) => {
                    const tds = tr.querySelectorAll("td");
                    if (tds.length < 4) return;

                    const installmentNo = tds[0].textContent.trim();
                    const dueDateStr = tds[1].textContent.trim();
                    const baseElement = tds[2].querySelector("b");
                    const base = baseElement?.textContent.trim() || "$0.00";
                    const paymentStatusText = tds[3].textContent.trim();
                    const paymentStatus = paymentStatusText.includes("Paid") ? "Paid" : "Due";

                    const payment_type =
                        installmentNo === "1" ? "1st installment" :
                            installmentNo === "2" ? "2nd installment" :
                                installmentNo === "3" ? "3rd installment" :
                                    installmentNo === "4" ? "4th installment" : "Unknown";

                    const { due_date, delq_date } = get_due_delq(dueDateStr);

                    result.push({
                        jurisdiction: "County",
                        year: parseInt(year),
                        payment_type,
                        status: paymentStatus,
                        base_amount: base !== "$0.00" ? base : " ",
                        amount_paid: paymentStatus === "Paid" ? base : "$0.00",
                        amount_due: paymentStatus === "Paid" ? "$0.00" : base,
                        mailing_date: "N/A",
                        due_date,
                        delq_date,
                        paid_date: "",
                        good_through_date: "",
                        link: "",
                    });
                });

                return {
                    main_data: data,
                    history: { unpaid: result, paid: [] },
                    paidYearsList: paidYears
                };
            });

            // Open paid accordions if any exist
            if (paidYearsList.length > 0) {
                await page.evaluate(() => {
                    const paidGroups = document.querySelectorAll('.bill-content .collapse payment-bill-group button.card');
                    paidGroups.forEach((button) => button.click());
                });
            }

            // Change pagination to 20 items 
            try {
                await page.waitForSelector("span[aria-label='items per page']", { timeout: 5000 });
                await page.click("span[aria-label='items per page']");
                await page.waitForSelector(".k-animation-container .k-list li", { visible: true, timeout: 5000 });

                await page.evaluate(() => {
                    const items = [...document.querySelectorAll(".k-animation-container .k-list li")];
                    const item20 = items.find((li) => li.textContent.trim() === "20");
                    if (item20) item20.click();
                });

                // Wait for update with fallback
                await Promise.race([
                    page.waitForFunction(
                        () => document.querySelector('.k-pager-info')?.textContent.includes('20'),
                        { timeout: 3000 }
                    ),
                    new Promise(resolve => setTimeout(resolve, 1500))
                ]);
            } catch (e) {
                console.log("Pagination change failed or not needed:", e.message);
            }

            // COMBINED extraction of year installment data and paid payments
            const { yearInstallmentData, paidPayments } = await page.evaluate(() => {
                const yearData = {};
                const paidData = [];

                // Get year installment data
                const allGroups = document.querySelectorAll('payment-bill-group');
                allGroups.forEach((group) => {
                    const yearElements = group.querySelectorAll('.tile-header__value');
                    if (yearElements.length === 0) return;

                    const yearText = yearElements[0].textContent.trim();
                    const year = parseInt(yearText);
                    if (isNaN(year)) return;

                    const installmentTable = group.querySelector('.table.table-bordered tbody');

                    if (installmentTable) {
                        const rows = installmentTable.querySelectorAll('tr');

                        if (!yearData[year]) {
                            yearData[year] = {
                                totalInstallments: 0,
                                paidInstallments: 0,
                                dueInstallments: 0,
                                installments: []
                            };
                        }

                        rows.forEach((row) => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 4) {
                                const installmentNo = cells[0].textContent.trim();
                                const dueDate = cells[1].textContent.trim();
                                const amountCell = cells[2].textContent.trim();
                                const status = cells[3].textContent.trim();
                                const isPaid = status.toLowerCase().includes('paid');

                                yearData[year].totalInstallments++;
                                if (isPaid) {
                                    yearData[year].paidInstallments++;
                                } else {
                                    yearData[year].dueInstallments++;
                                }

                                yearData[year].installments.push({
                                    installment: installmentNo,
                                    due_date: dueDate,
                                    amount: amountCell,
                                    status: isPaid ? 'Paid' : 'Due'
                                });
                            }
                        });
                    } else {
                        const statusElement = group.querySelector('.tile-header__amount');
                        if (statusElement) {
                            const statusText = statusElement.textContent.toLowerCase();
                            if (statusText.includes('paid') && !statusText.includes('due')) {
                                yearData[year] = {
                                    totalInstallments: 4,
                                    paidInstallments: 4,
                                    dueInstallments: 0,
                                    installments: [],
                                    fullyPaid: true
                                };
                            }
                        }
                    }
                });

                // Get paid payments
                const paidRows = document.querySelectorAll("#prgmAccordion1 tbody tr.ng-star-inserted");
                paidRows.forEach((tr) => {
                    const tds = tr.querySelectorAll("td");
                    if (tds.length < 5) return;

                    const taxYear = tds[0]?.textContent.trim();
                    const billNumber = tds[1]?.textContent.trim();
                    const receiptNumber = tds[2]?.textContent.trim();
                    const amountPaid = tds[3]?.textContent.trim();
                    const lastPaid = tds[4]?.textContent.trim();

                    if (taxYear && amountPaid) {
                        paidData.push({
                            tax_year: parseInt(taxYear),
                            bill_number: billNumber,
                            receipt_number: receiptNumber,
                            amount_paid: amountPaid,
                            paid_date: lastPaid,
                        });
                    }
                });

                return { yearInstallmentData: yearData, paidPayments: paidData };
            });
            // --- SYNTHETIC ROWS FOR FULLY PAID YEARS ---
            Object.keys(yearInstallmentData).forEach(year => {
                const y = parseInt(year);
                const info = yearInstallmentData[year];

                // if fully paid and no installment rows exist
                if (info.fullyPaid && !history.unpaid.some(p => p.year === y)) {
                    const fmt = (dt) =>
                        `${String(dt.getMonth() + 1).padStart(2, "0")}/` +
                        `${String(dt.getDate()).padStart(2, "0")}/` +
                        `${dt.getFullYear()}`;

                    const dueDate = new Date(y, 7, 18); // Aug 18
                    const delqDate = new Date(dueDate.getTime() + 10 * 24 * 60 * 60 * 1000);

                    history.unpaid.push({
                        jurisdiction: "County",
                        year: y,
                        payment_type: "Annual",
                        status: "Paid",
                        base_amount: " ",
                        amount_paid: "PAID",
                        amount_due: "$0.00",
                        mailing_date: "N/A",
                        due_date: fmt(dueDate),
                        delq_date: fmt(delqDate),
                        paid_date: "",
                        good_through_date: "",
                        link: "",
                    });
                }

            });


            // Process delinquent years
            const currentYear = parseInt(main_data.bill_year) || new Date().getFullYear();
            const delinquentYears = [];

            if (Object.keys(yearInstallmentData).length > 0) {
                Object.keys(yearInstallmentData).forEach((year) => {
                    const y = parseInt(year);
                    if (y >= currentYear) return;

                    const yearInfo = yearInstallmentData[year];
                    if (yearInfo.dueInstallments > 0 ||
                        (yearInfo.paidInstallments < yearInfo.totalInstallments && !yearInfo.fullyPaid)) {
                        delinquentYears.push(y);
                    }
                });
            }

            // Merge paid data with unpaid data
            // --- FIX PAID INSTALLMENT MAPPING ---
            const allPayments = history.unpaid;

            // group paid payments by tax year
            const paidByYear = {};
            paidPayments.forEach(p => {
                if (!paidByYear[p.tax_year]) paidByYear[p.tax_year] = [];
                paidByYear[p.tax_year].push(p);
            });

            // process year-wise
            Object.keys(paidByYear).forEach(year => {
                const y = parseInt(year);

                const installmentRows = allPayments
                    .filter(p => p.year === y)
                    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

                const payments = paidByYear[y]
                    .sort((a, b) => parseDate(a.paid_date) - parseDate(b.paid_date));

                let payIdx = 0;

                installmentRows.forEach(inst => {
                    if (inst.status === "Paid" && payments[payIdx]) {
                        const pay = payments[payIdx];

                        inst.amount_paid = pay.amount_paid;
                        inst.paid_date = pay.paid_date;
                        inst.base_amount = pay.amount_paid;
                        inst.amount_due = "$0.00";

                        payIdx++;
                    }
                });
            });
            // rebuild current year payments AFTER merging paid data
            const currentYearPayments = allPayments;




            // Build year_map
            const year_map = {};
            currentYearPayments.forEach((item) => {
                if (!year_map[item.year]) year_map[item.year] = [];
                year_map[item.year].push(item);
            });

            const years = Object.keys(year_map).map(Number);
            const max_year = years.length > 0 ? Math.max(...years) : currentYear;

            resolve({
                data: main_data,
                year_map: year_map,
                max_year: max_year,
                delinquent_years: delinquentYears,
            });
        } catch (err) {
            reject(new Error("Record not found"));
        }
    });
};

const ac_2 = async (page, main_data) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = main_data["data"];
            const year_map = main_data["year_map"];
            const max_year = main_data["max_year"];
            const delinquent_years = main_data["delinquent_years"] || [];

            data["tax_history"] = [];

            const hasPreviousYearDelinquent = delinquent_years.length > 0;

            if (hasPreviousYearDelinquent) {
                data["delinquent"] = `${delinquent_years.join(", ")} TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF`;
                data["notes"] = "TAXES ARE DELINQUENT, ";
            } else {
                data["delinquent"] = "NONE";
                data["notes"] = "ALL PRIORS ARE PAID, ";
            }

            for (let year in year_map) {
                if (year_map[year].length == 1) {
                    year_map[year][0]["payment_type"] = "Annual";
                    data["tax_history"].push(year_map[year][0]);

                    if (year == max_year) {
                        data["notes"] += `${max_year} TAXES ARE ${year_map[year][0]["status"].toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, `;
                    }
                } else if (year_map[year].length > 1) {
                    if (year == max_year) {
                        data["notes"] += `${max_year} `;
                    }

                    year_map[year].sort((a, b) => new Date(a["due_date"]) - new Date(b["due_date"]));

                    year_map[year].forEach((d, i) => {
                        if (!d["payment_type"] || d["payment_type"] === "Unknown") {
                            d["payment_type"] = "Installment " + (i + 1);
                        }
                        data["tax_history"].push(d);

                        if (year == max_year) {
                            data["notes"] += `${d["payment_type"].toUpperCase()} IS ${d["status"].toUpperCase()}, `;
                        }
                    });

                    if (year == max_year) {
                        data["notes"] += `NORMALLY TAXES ARE PAID QUARTERLY, `;
                    }
                }
            }

            // Determine if latest year is Annual or Installments
            const latestTax = data["tax_history"][data["tax_history"].length - 1];

            if (latestTax.payment_type.toLowerCase().includes("annual")) {
                data["notes"] += "NORMAL DUE DATES ARE 08/18. PAYMENTS ACCEPTED WITHOUT PENALTY FOR 10 DAYS AFTER DUE DATE";
            } else {
                data["notes"] += "NORMAL DUE DATES: 1ST INSTALLMENT - 08/18, 2ND INSTALLMENT - 10/06, 3RD INSTALLMENT - 01/06, 4TH INSTALLMENT - 03/03. PAYMENTS ACCEPTED WITHOUT PENALTY FOR 10 DAYS AFTER DUE DATE";
            }


            delete data["paid_history_raw"];
            delete data["delinquent_years"];
            // After building data["tax_history"], filter to only 1 year
            const latestYear = Math.max(...data["tax_history"].map(t => t.year));
            data["tax_history"] = data["tax_history"].filter(t => t.year === latestYear);

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};


const account_search = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data1 = await ac_1(page, url, account);
            const data2 = await ac_2(page, data1);
            resolve(data2);
        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let context;

    try {
        const url = `https://nv-washoe.publicaccessnow.com/Treasurer/TaxSearch.aspx`;

        if (!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access",
            });
        }

        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        );

        page.setDefaultNavigationTimeout(30000);

        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (req.resourceType() === "font" || req.resourceType() === "image" || req.resourceType() === "stylesheet") {
                req.abort();
            } else {
                req.continue();
            }
        });

        const data = await account_search(page, url, account);

        if (fetch_type == "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message,
            });
        } else {
            res.status(500).json({
                error: true,
                message: error.message,
            });
        }
    } finally {
        if (context) await context.close();
    }
};

module.exports = { search };