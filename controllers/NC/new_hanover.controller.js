// AUTHOR: DHANUSH 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    if (today >= delq_date) {
        return true;
    }
    return false;
}

// Helper: Safe menu navigation
const gotoMenuLink = async (page, partialHref) => {
    try {
        await page.hover('#primarynav li.primarynavselected > a, #primarynav li.submenu > a');
        await delay(1000);

        await Promise.all([
            page.click(`#primarynav a[href*="${partialHref}"]`),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
        ]);
    } catch (e) {
        await page.evaluate((href) => {
            const link = Array.from(document.querySelectorAll('#primarynav a'))
                .find(a => a.getAttribute('href')?.includes(href));
            if (link) link.click();
        }, partialHref);

        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 });
    }
    await delay(1500);
};

// Step 1: Search parcel
const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://newhanovercountynccss.munisselfservice.com/citizens/RealEstate/Default.aspx?mode=new`;
            await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_Control_ParcelIdSearchFieldLayout_ctl01_ParcelIDTextBox", timeout_option);
            await page.locator("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_Control_ParcelIdSearchFieldLayout_ctl01_ParcelIDTextBox").fill(account);

            await Promise.all([
                page.click("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_Control_FormLayoutItem7_ctl01_Button1"),
                page.waitForNavigation({ waitUntil: "domcontentloaded" })
            ]);

            const hasResults = await page.$("#molContentContainer");
            if (!hasResults) {
                reject(new Error("No Record Found"));
            } else {
                resolve(true);
            }
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 2: Select bill and get basic data + property address from search results
const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const hasGrid = await page.$("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsGridView");

            if (hasGrid) {
                // Extract property address and link for the LATEST year bill
                const billInfo = await page.evaluate((parcel) => {
                    const rows = document.querySelectorAll("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsGridView tbody tr:not(.sortedcolumn)");
                    let latestYear = 0;
                    let latestAddress = "N/A";
                    let latestLinkId = null;
                    
                    for (const row of rows) {
                        const tds = row.querySelectorAll("td");
                        if (tds.length >= 6 && tds[3]?.textContent.trim() === parcel) {
                            const year = parseInt(tds[4]?.textContent.trim()) || 0;
                            if (year > latestYear) {
                                latestYear = year;
                                latestAddress = tds[0]?.textContent.trim() || "N/A";
                                const link = row.querySelector("a[id*='ViewBillLinkButton']");
                                latestLinkId = link ? link.id : null;
                            }
                        }
                    }
                    return { address: latestAddress, linkId: latestLinkId, year: latestYear };
                }, account);

                const propertyAddressFromGrid = billInfo.address;
                const matchingLinkId = billInfo.linkId;

                if (!matchingLinkId) {
                    reject(new Error(`Invalid Parcel Number`));
                    return;
                }

                await Promise.all([
                    page.click(`#${matchingLinkId}`),
                    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
                ]);

                await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewBillControlPanel", timeout_option);

                const page_data = await page.evaluate(() => {
                    const datum = {
                        processed_date: "",
                        order_number: "",
                        borrower_name: "",
                        owner_name: [],
                        property_address: "",
                        parcel_number: "",
                        land_value: "",
                        improvements: "",
                        total_assessed_value: "",
                        exemption: "",
                        total_taxable_value: "",
                        taxing_authority: "New Hanover County Tax Collector, 230 Government Center Drive Suite 165, Wilmington, NC 28403, Ph: 910-798-7300",
                        notes: "",
                        delinquent: "NONE",
                        tax_history: []
                    };

                    datum['owner_name'][0] = document.getElementById("ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_OwnerLabel")?.textContent.trim() || "N/A";
                    datum['parcel_number'] = document.getElementById("ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_CategoryLabel")?.textContent.trim() || "N/A";

                    return datum;
                });

                // Set property address from grid
                page_data.property_address = propertyAddressFromGrid.toUpperCase();

                resolve(page_data);
            } else {
                reject(new Error("No grid found"));
            }
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 3: Extract current year bill details
const ac_3 = async (page, data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewBillControlPanel", timeout_option);
            await delay(2000);

            const billData = await page.evaluate(() => {
                const current_year = document.getElementById("ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_FiscalYearLabel")?.textContent.trim() || "N/A";

                const table = document.querySelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_BillDetailsUpdatePanel table.datatable") ||
                    document.querySelector("table.datatable.nocaption");

                if (!table) return { current_year, installments: [], total_interest: "$0.00" };

                const rows = table.querySelectorAll("tbody tr");
                const installments = [];

                for (let i = 0; i < rows.length - 1; i++) {
                    const cells = rows[i].querySelectorAll("td");
                    const firstText = cells[0]?.textContent.trim().toLowerCase() || "";
                    if (cells.length >= 7 && !firstText.includes("total") && !firstText.includes("interest")) {
                        installments.push({
                            installment: cells[0].textContent.trim(),
                            pay_by: cells[1].textContent.trim(),
                            amount: cells[2].textContent.trim(),
                            payments_credits: cells[3].textContent.trim(),
                            balance: cells[4].textContent.trim(),
                            interest: cells[5].textContent.trim(),
                            due: cells[6].textContent.trim()
                        });
                    }
                }

                let total_interest = "$0.00";
                const totalRow = rows[rows.length - 1];
                if (totalRow) {
                    const cells = totalRow.querySelectorAll("td");
                    if (cells.length >= 6) total_interest = cells[5]?.textContent.trim() || "$0.00";
                }

                return { current_year, installments, total_interest };
            });

            resolve({
                data: data,
                current_year: billData.current_year,
                installments: billData.installments,
                total_interest: billData.total_interest
            });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 4: Get payment history
const ac_4 = async (page, main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            let payments = [];

            const paymentsLinkId = await page.evaluate(() => {
                const links = document.querySelectorAll("a");
                for (const a of links) {
                    if (a.textContent.trim().includes("View payments/adjustments")) {
                        return a.id || null;
                    }
                }
                return null;
            });

            if (paymentsLinkId) {
                await Promise.all([
                    page.click(`#${paymentsLinkId}`),
                    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
                ]);

                const noActivity = await page.evaluate(() => {
                    return document.body.innerText.includes("No payment activity could be found") ||
                        document.body.innerText.includes("No Payment / Adjustment information found");
                });

                if (!noActivity) {
                    await page.waitForSelector('table.datatable.nomargin', timeout_option);
                    payments = await page.evaluate(() => {
                        const rows = document.querySelectorAll('table.datatable.nomargin tbody tr');
                        return Array.from(rows).map(row => {
                            const tds = row.querySelectorAll('td');
                            if (tds.length < 6) return null;
                            return {
                                activity: tds[0]?.textContent.trim(),
                                posted: tds[1]?.textContent.trim(),
                                amount: tds[5]?.textContent.trim()
                            };
                        }).filter(Boolean);
                    });
                }

                // Return to bill
                await Promise.all([
                    page.click("a:has-text('Return to view bill')"),
                    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
                ]).catch(() => page.goBack({ waitUntil: "domcontentloaded" }));

                await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewBillControlPanel", timeout_option);
            }

            resolve({
                data: main_data.data,
                current_year: main_data.current_year,
                installments: main_data.installments,
                total_interest: main_data.total_interest,
                payments: payments
            });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 5: Handle prior delinquent years
const ac_5 = async (page, main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const priorLink = await page.$("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_PaymentBlockMessage_BlockageMessageParagraph a[href*='allbills.aspx']");

            let all_years_data = {};
            all_years_data[main_data.current_year] = {
                installments: main_data.installments,
                total_interest: main_data.total_interest,
                payments: main_data.payments
            };

            if (!priorLink) {
                resolve({
                    data: main_data.data,
                    all_years_data: all_years_data
                });
                return;
            }

            await Promise.all([
                page.click("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_PaymentBlockMessage_BlockageMessageParagraph a[href*='allbills.aspx']"),
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
            ]);

            await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsRepeater_ctl00_BillsGrid", timeout_option);

            const priorBills = await page.evaluate(() => {
                const rows = document.querySelectorAll("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsRepeater_ctl00_BillsGrid tbody tr:not(:first-child)");
                const bills = [];
                for (const row of rows) {
                    const tds = row.querySelectorAll("td");
                    if (tds.length >= 6) {
                        const year = tds[2]?.textContent.trim();
                        const status = tds[4]?.textContent.trim();
                        if (status.includes("Outstanding")) {
                            const link = row.querySelector("a[id*='ViewBillLinkButton']");
                            if (link) {
                                bills.push({ year, linkId: link.id });
                            }
                        }
                    }
                }
                return bills;
            });

            for (const bill of priorBills) {
                await Promise.all([
                    page.click(`#${bill.linkId}`),
                    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
                ]);

                await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewBillControlPanel", timeout_option);
                await delay(2000);

                const yearBillData = await page.evaluate(() => {
                    const current_year = document.getElementById("ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_FiscalYearLabel")?.textContent.trim() || "N/A";

                    const table = document.querySelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_BillDetailsUpdatePanel table.datatable") ||
                        document.querySelector("table.datatable.nocaption");

                    if (!table) return { current_year, installments: [], total_interest: "$0.00" };

                    const rows = table.querySelectorAll("tbody tr");
                    const installments = [];

                    for (let i = 0; i < rows.length - 1; i++) {
                        const cells = rows[i].querySelectorAll("td");
                        const firstText = cells[0]?.textContent.trim().toLowerCase() || "";
                        if (cells.length >= 7 && !firstText.includes("total") && !firstText.includes("interest")) {
                            installments.push({
                                installment: cells[0].textContent.trim(),
                                pay_by: cells[1].textContent.trim(),
                                amount: cells[2].textContent.trim(),
                                payments_credits: cells[3].textContent.trim(),
                                balance: cells[4].textContent.trim(),
                                interest: cells[5].textContent.trim(),
                                due: cells[6].textContent.trim()
                            });
                        }
                    }

                    let total_interest = "$0.00";
                    const totalRow = rows[rows.length - 1];
                    if (totalRow) {
                        const cells = totalRow.querySelectorAll("td");
                        if (cells.length >= 6) total_interest = cells[5]?.textContent.trim() || "$0.00";
                    }

                    return { current_year, installments, total_interest };
                });

                all_years_data[yearBillData.current_year] = {
                    installments: yearBillData.installments,
                    total_interest: yearBillData.total_interest,
                    payments: main_data.payments
                };

                await page.goBack({ waitUntil: "domcontentloaded" });
                await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_BillsRepeater_ctl00_BillsGrid", timeout_option);
            }

            await page.goBack({ waitUntil: "domcontentloaded" });
            await page.waitForSelector("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_ViewBill1_ViewBillControlPanel", timeout_option);

            resolve({
                data: main_data.data,
                all_years_data: all_years_data
            });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 6: Get assessment data
const ac_6 = async (page, main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await gotoMenuLink(page, "Assessments.aspx");
            await page.waitForSelector('table.datatable', timeout_option);

            const assessment = await page.evaluate(() => {
                const rows = document.querySelectorAll('table.datatable tbody tr');
                let land = "", building = "", total = "";
                rows.forEach(row => {
                    const th = row.querySelector('th');
                    const td = row.querySelector('td.numericdata');
                    if (!th || !td) return;
                    const label = th.textContent.trim();
                    const value = td.textContent.trim();
                    if (label === "Land") land = value;
                    if (label === "Building") building = value;
                    if (label === "Total") total = value;
                });
                return { land, building, total };
            });

            main_data.data.land_value = assessment.land || "N/A";
            main_data.data.improvements = assessment.building || "N/A";
            main_data.data.total_assessed_value = assessment.total || "N/A";
            main_data.data.total_taxable_value = assessment.total || "N/A";

            resolve(main_data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 7: Process all years and build final tax history 
const ac_7 = async (page, main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const all_years_data = main_data.all_years_data;
            const years = Object.keys(all_years_data).sort((a, b) => Number(b) - Number(a));
            if (years.length === 0) {
                reject(new Error("No tax years found"));
                return;
            }

            const max_year = years[0];
            let has_delinquent = false;
            let total_due_all = 0;

            const final_tax_history = [];

            for (const year of years) {
                const yearData = all_years_data[year];
                const installments = yearData.installments;
                const total_interest = yearData.total_interest;
                const payments = yearData.payments || [];

                for (const inst of installments) {
                    const dueAmt = parseFloat(inst.due.replace(/[$,]/g, '')) || 0;
                    if (dueAmt > 0) total_due_all += dueAmt;

                    let status = "Paid";
                    let paid_date = "-";
                    
                    // Calculate due date (September 1 of the tax year)
                    const due_date_obj = new Date(Number(year), 8, 1); // Month 8 = September
                    const due_date_str = `${String(due_date_obj.getMonth() + 1).padStart(2, '0')}/${String(due_date_obj.getDate()).padStart(2, '0')}/${due_date_obj.getFullYear()}`;
                    
                    // Pay by date from table (Last day to pay without penalty)
                    const pay_by_date = new Date(inst.pay_by);
                    
                    // Delinquent date is one day after pay by date
                    const delq_date = new Date(pay_by_date);
                    delq_date.setDate(delq_date.getDate() + 1);
                    const delq_date_str = `${String(delq_date.getMonth() + 1).padStart(2, '0')}/${String(delq_date.getDate()).padStart(2, '0')}/${delq_date.getFullYear()}`;

                    if (dueAmt > 0) {
                        status = is_delq(delq_date_str) ? "Delinquent" : "Due";
                        if (status === "Delinquent") {
                            has_delinquent = true;
                        }
                    } else {
                        // If paid, use the pay_by date as the paid_date or find matching payment
                        const matchingPayment = payments.find(p => {
                            const paymentAmount = Math.abs(parseFloat(p.amount.replace(/[$,-]/g, '')) || 0);
                            const instAmount = Math.abs(parseFloat(inst.amount.replace(/[$,-]/g, '')) || 0);
                            const paymentYear = new Date(p.posted).getFullYear();
                            return paymentAmount === instAmount && paymentYear === Number(year);
                        });
                        
                        paid_date = matchingPayment?.posted || inst.pay_by;
                    }

                    const tax_entry = {
                        jurisdiction: "County",
                        year: year,
                        payment_type: installments.length === 1 ? "Annual" : `Installment ${inst.installment}`,
                        status: status,
                        base_amount: inst.amount,
                        amount_paid: inst.payments_credits,
                        amount_due: dueAmt > 0 ? inst.due : "$0.00",
                        mailing_date: "N/A",
                        due_date: due_date_str,
                        delq_date: delq_date_str,
                        paid_date: paid_date,
                        good_through_date: "-"
                    };

                    final_tax_history.push(tax_entry);
                }

                const interestAmt = parseFloat(total_interest.replace(/[$,]/g, '') || 0);
                if (interestAmt > 0) {
                    total_due_all += interestAmt;
                    has_delinquent = true;
                }
            }

            const priorUnpaidDelq = final_tax_history.some(
                el => Number(el.year) < Number(max_year) && el.status !== "Paid"
            );

            const currentYearRecords = final_tax_history.filter(el => Number(el.year) === Number(max_year));
            let currentStatus = "PAID";
            if (currentYearRecords.length > 0) {
                const mainStatus = currentYearRecords[0].status.toUpperCase();
                if (mainStatus === "DUE") currentStatus = "DUE";
                else if (mainStatus === "DELINQUENT") currentStatus = "DELINQUENT";
            }

            main_data.data.delinquent = has_delinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            let notes = `${priorUnpaidDelq ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"}. ${max_year}: ANNUAL TAXES ARE ${currentStatus}, NORMAL TAXES ARE PAID ANNUALLY. NOMARL DUE DATES ARE 09/01.`;

            main_data.data.notes = notes;
            
            // Sort by year ascending
            final_tax_history.sort((a, b) => {
                return Number(a.year) - Number(b.year);
            });    
            
            main_data.data.tax_history = final_tax_history;

            resolve(main_data.data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Main search orchestrator
const account_search = async (page, account) => {
    return new Promise((resolve, reject) => {
        try {
            ac_1(page, account)
            .then((data1) => {
                ac_2(page, account)
                .then((data2) => {
                   ac_3(page, data2, account)
                    .then((data3) => {
                        ac_4(page, data3, account)
                        .then((data4) => {
                            ac_5(page, data4, account)
                            .then((data5) => {
                                ac_6(page, data5, account)
                                .then((data6) => {
                                    ac_7(page, data6, account)
                                    .then((data7) => {
                                        resolve(data7);
                                    })
                                    .catch((error) => {
                                        console.log("Error in ac_7:", error);
                                        reject(error);
                                    });
                                })
                                .catch((error) => {
                                    console.log("Error in ac_6:", error);
                                    reject(error);
                                });
                            })
                            .catch((error) => {
                                console.log("Error in ac_5:", error);
                                reject(error);
                            });
                        })
                        .catch((error) => {
                            console.log("Error in ac_4:", error);
                            reject(error);
                        });
                    })
                    .catch((error) => {
                        console.log("Error in ac_3:", error);
                        reject(error);
                    });
                })
                .catch((error) => {
                    console.log("Error in ac_2:", error);
                    reject(error);
                });
            })
            .catch((error) => {
                console.log("Error in ac_1:", error);
                reject(error);
            });
        } catch (error) {
            console.log("Synchronous error:", error);
            reject(new Error(error.message));
        }
    });
};

// Export controller
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!account || account.trim() === '') {
            return res.status(200).render("error_data", {
                error: true,
                message: "Enter the Account Number..."
            });
        }

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

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
                console.log(error);
                res.status(200).render('error_data', {
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                await context.close();
            });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
            .then((data) => {
                res.status(200).json({
                    result: data
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(500).json({
                    error: true,
                    message: error.message
                });
            })
            .finally(async () => {
                await context.close();
            });
        }

    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

export { search };
