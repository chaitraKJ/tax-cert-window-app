// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Helper: Format any numeric value into USD format
const formatDollar = (value) => {
    if (!value || value === "") return "$0.00";
    const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
    return Number.isFinite(num)
        ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "$0.00";
};

// Configuration details for Marion County
const marionConfig = {
    url: 'https://propertysearch.marioncountyohio.gov/Parcel?Parcel=',
    taxing_authority: 'Marion County Auditor, 222 W Center St, Marion, OH 43302, Ph: 740-223-4000',
    first_due: '02/05',
    second_due: '06/20',
    first_delq: '02/06',
    second_delq: '06/21',
};

// Validate whether the parcel number exists
const ac_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${marionConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 70000 });

            const exists = await page.waitForSelector('#site-main-container', { timeout: 50000 })
                .catch((error) => {
                    console.log(error);
                    reject(new Error(error.message));
                });

            const isInvalidParcel = await page.evaluate(() => {
                const body = document.body.textContent || "";
                return body.includes("An error occurred while processing your request");
            });

            if (isInvalidParcel) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No records found in the database.`
                });
            }

            if (!exists) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid or no records found.`
                });
            }
            resolve(true);

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Extract Owner Info, Address, and Valuation Details
const ac_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const basicData = await page.evaluate(() => {
                const data = {
                    processed_date: new Date().toISOString().slice(0, 10),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [""],
                    property_address: "",
                    parcel_number: "",
                    land_value: "N/A",
                    improvements: "-",
                    total_assessed_value: "N/A",
                    exemption: "-",
                    total_taxable_value: "N/A",
                    taxing_authority: "",
                    notes: "",
                    delinquent: "",
                    tax_history: [],
                    currentYear: ""
                };

                // Extract Owner Name
                const ownerDiv = document.querySelector('#ppPromoted .col-6.col-md-3:nth-child(3) .text-truncate');
                if (ownerDiv) {
                    data.owner_name[0] =
                        ownerDiv.getAttribute('data-original-title') ||
                        ownerDiv.textContent.trim();
                }

                // Extract Property Address
                const addressDiv = document.querySelector('#ppPromoted .col-6.col-md-3:nth-child(2) .text-truncate');
                if (addressDiv) {
                    data.property_address =
                        addressDiv.getAttribute('data-original-title') ||
                        addressDiv.textContent.trim();
                }

                // Extract valuation values from Valuation Table
                const valuationTable = document.querySelector('.table-responsive .table[title="Valuation"]');
                if (valuationTable) {
                    const firstRow = valuationTable.querySelector("tbody tr");
                    if (firstRow) {
                        const tds = [...firstRow.querySelectorAll("td")].map(td => td.textContent.trim());
                        data.land_value = tds[4] || "N/A";
                        data.improvements = tds[5] || "N/A";
                        data.total_assessed_value = tds[6] || "N/A";
                        data.total_taxable_value = data.total_assessed_value;
                    }
                }

                // Get current tax year from tab header
                const yearText = document.querySelector("#taxBill-tabs li div")?.textContent.trim();
                if (yearText) {
                    const year = yearText.split(" ")[0] || "N/A";
                    data.currentYear = year;
                }

                return data;
            });

            basicData.taxing_authority = marionConfig.taxing_authority;
            basicData.parcel_number = account;

            if (basicData.total_assessed_value === "N/A") {
                return reject({
                    error: true,
                    message: `Account ${account} is invalid: please correct it`,
                });
            }

            resolve(basicData);

        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract payment records from Tax Payments table
const extract_payments = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payments = await page.evaluate(() => {
                const paymentRecords = [];
                const paymentTable = document.querySelector('table[title="Tax Payments"]');
                
                if (!paymentTable) return paymentRecords;

                const rows = Array.from(paymentTable.querySelectorAll('tbody tr'));
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 3) return;

                    const paymentDate = cells[0]?.textContent?.trim() || "";
                    const year = cells[1]?.textContent?.trim() || "";
                    const amount = cells[2]?.textContent?.trim() || "$0.00";

                    paymentRecords.push({
                        paymentDate,
                        year,
                        amount
                    });
                });

                return paymentRecords;
            });

            resolve(payments);
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// Extract Tax History for requested years only and match payment dates
const ac_3 = async (page, data, paymentRecords, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            const currentDate = new Date();

            const parseDate = (dateStr, year) => {
                const [m, d] = dateStr.split('/').map(Number);
                return new Date(year, m - 1, d);
            };

            const num = (txt = '') => Math.abs(parseFloat(txt.replace(/[^0-9.-]/g, '')) || 0);

            // Build a quick lookup map for payments: year -> list of payment dates
            const paymentsByYear = {};
            paymentRecords.forEach(payment => {
                if (!paymentsByYear[payment.year]) {
                    paymentsByYear[payment.year] = [];
                }
                paymentsByYear[payment.year].push(payment.paymentDate);
            });

            // Determine the oldest year we have payment records for
            // This is our "cutoff" - years older than this should be assumed paid
            const paymentYears = Object.keys(paymentsByYear).map(y => parseInt(y));
            const oldestPaymentYear = paymentYears.length > 0 ? Math.min(...paymentYears) : null;

            // Get current year from data
            const currentYear = parseInt(data.currentYear);

            // Extract tax history from Tax History table
            const allHistory = await page.evaluate((marionConfig, currentDateIso, paymentsByYearStr, oldestPaymentYear, currentYear, yearsRequested) => {
                const currentDate = new Date(currentDateIso);
                const paymentsByYear = JSON.parse(paymentsByYearStr);
                
                const formatDollar = (value) => {
                    if (!value || value === "") return "$0.00";
                    const num = Math.abs(parseFloat(value.toString().replace(/[$ ,]/g, "")));
                    return Number.isFinite(num) ? `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
                };

                const parseDate = (dateStr, year) => {
                    const [m, d] = dateStr.split('/').map(Number);
                    return new Date(year, m - 1, d);
                };

                const history = [];
                const taxHistoryTable = document.querySelector('table[title="Tax History"]');
                
                if (!taxHistoryTable) return history;

                // Get all year columns from header (skip first column which is labels)
                const headerCells = Array.from(taxHistoryTable.querySelectorAll('thead tr th'));
                const allYears = headerCells.slice(1).map(th => th.textContent.trim());

                // IMPORTANT: Only process the requested number of years starting from current year
                // Sort years in descending order and take only the requested amount
                const sortedYears = allYears
                    .map(y => parseInt(y))
                    .filter(y => !isNaN(y))
                    .sort((a, b) => b - a); // Descending order (newest first)

                // Take only the requested number of years
                const yearsToProcess = sortedYears.slice(0, yearsRequested);

                // Get indices of years to process in the original table
                const yearIndices = yearsToProcess.map(year => {
                    const index = allYears.indexOf(year.toString());
                    return { year: year.toString(), index };
                }).filter(item => item.index !== -1);

                // Get all data rows
                const rows = Array.from(taxHistoryTable.querySelectorAll('tbody tr'));
                
                // Find specific rows
                const grossChargeRow = rows.find(r => r.textContent.includes('GROSS CHARGE'));
                const netAnnualRow = rows.find(r => r.textContent.includes('NET ANNUAL'));

                if (!grossChargeRow || !netAnnualRow) return history;

                const grossChargeCells = Array.from(grossChargeRow.querySelectorAll('td')).slice(1);
                const netAnnualCells = Array.from(netAnnualRow.querySelectorAll('td')).slice(1);

                // Process only the selected years
                yearIndices.forEach(({ year, index }) => {
                    const grossCharge = parseFloat(grossChargeCells[index]?.textContent?.replace(/[^0-9.-]/g, '') || '0');
                    const netAnnual = parseFloat(netAnnualCells[index]?.textContent?.replace(/[^0-9.-]/g, '') || '0');

                    if (grossCharge === 0 && netAnnual === 0) return;

                    const dueYear = (parseInt(year) + 1).toString();
                    const halfCharge = grossCharge / 2;

                    const firstDelqDate = parseDate(marionConfig.first_delq, dueYear);
                    const secondDelqDate = parseDate(marionConfig.second_delq, dueYear);

                    // Check if this year has payment records
                    const yearPayments = paymentsByYear[year] || [];
                    const hasTwoPayments = yearPayments.length >= 2;
                    const hasOnePayment = yearPayments.length === 1;

                    // Sort payments chronologically
                    const sortedPayments = yearPayments.sort((a, b) => new Date(a) - new Date(b));

                    // IMPORTANT: If this year is OLDER than the oldest year we have payment records for,
                    // assume it was paid (just no records kept)
                    const yearNum = parseInt(year);
                    const isOlderThanPaymentRecords = oldestPaymentYear !== null && yearNum < oldestPaymentYear;

                    // Determine status based on payments and dates
                    let firstStatus, firstPaid, firstDue, firstPaidDate;
                    let secondStatus, secondPaid, secondDue, secondPaidDate;

                    if (isOlderThanPaymentRecords) {
                        // Year is older than any payment records we have - assume fully paid
                        firstStatus = "Paid";
                        firstPaid = halfCharge;
                        firstDue = 0;
                        firstPaidDate = "N/A";

                        secondStatus = "Paid";
                        secondPaid = halfCharge;
                        secondDue = 0;
                        secondPaidDate = "N/A";
                    } else if (hasTwoPayments) {
                        // Both halves paid
                        firstStatus = "Paid";
                        firstPaid = halfCharge;
                        firstDue = 0;
                        firstPaidDate = sortedPayments[0];

                        secondStatus = "Paid";
                        secondPaid = halfCharge;
                        secondDue = 0;
                        secondPaidDate = sortedPayments[1];
                    } else if (hasOnePayment) {
                        // Only first half paid
                        firstStatus = "Paid";
                        firstPaid = halfCharge;
                        firstDue = 0;
                        firstPaidDate = sortedPayments[0];

                        // Second half unpaid - check if delinquent
                        secondStatus = currentDate > secondDelqDate ? "Delinquent" : "Due";
                        secondPaid = 0;
                        secondDue = halfCharge;
                        secondPaidDate = "";
                    } else {
                        // No payments - both halves unpaid
                        firstStatus = currentDate > firstDelqDate ? "Delinquent" : "Due";
                        firstPaid = 0;
                        firstDue = halfCharge;
                        firstPaidDate = "";

                        secondStatus = currentDate > secondDelqDate ? "Delinquent" : "Due";
                        secondPaid = 0;
                        secondDue = halfCharge;
                        secondPaidDate = "";
                    }

                    // First Half
                    history.push({
                        jurisdiction: "County",
                        year,
                        payment_type: "Semi-Annual",
                        installment: "1st Half",
                        status: firstStatus,
                        base_amount: formatDollar(halfCharge),
                        amount_paid: formatDollar(firstPaid),
                        amount_due: formatDollar(firstDue),
                        mailing_date: "N/A",
                        due_date: `${marionConfig.first_due}/${dueYear}`,
                        delq_date: `${marionConfig.first_delq}/${dueYear}`,
                        paid_date: firstPaidDate || "N/A",
                        good_through_date: ""
                    });

                    // Second Half
                    history.push({
                        jurisdiction: "County",
                        year,
                        payment_type: "Semi-Annual",
                        installment: "2nd Half",
                        status: secondStatus,
                        base_amount: formatDollar(halfCharge),
                        amount_paid: formatDollar(secondPaid),
                        amount_due: formatDollar(secondDue),
                        mailing_date: "N/A",
                        due_date: `${marionConfig.second_due}/${dueYear}`,
                        delq_date: `${marionConfig.second_delq}/${dueYear}`,
                        paid_date: secondPaidDate || "N/A",
                        good_through_date: ""
                    });
                });

                return history;
            }, marionConfig, currentDate.toISOString(), JSON.stringify(paymentsByYear), oldestPaymentYear, currentYear, yearsRequested);

            // Track delinquent years
            const delinquentYears = new Set();
            allHistory.forEach(item => {
                if (item.status === "Delinquent") {
                    delinquentYears.add(item.year);
                }
            });

            // IMPORTANT: We already filtered to requested years, so use all of them
            const finalHistory = allHistory;
            const hasDelinquent = delinquentYears.size > 0;

            data.tax_history = finalHistory;

            // Build notes - use year format like "2025-2026"
            const currentYearLabel = `${currentYear}-${currentYear + 1}`;
            const currentYearItems = finalHistory.filter(i => i.year === currentYear.toString());

            if (currentYearItems.length === 0) {
                data.notes = `ALL PRIORS ARE PAID, ${currentYearLabel} NO TAXES DUE, POSSIBLY EXEMPT.`;
                data.delinquent = "NONE";
            } else {
                const first = currentYearItems.find(x => x.installment === "1st Half") || { status: "Paid" };
                const second = currentYearItems.find(x => x.installment === "2nd Half") || { status: "Paid" };

                const fStat = first.status.toUpperCase();
                const sStat = second.status.toUpperCase();

                let currentNote = `${currentYearLabel} 1ST INSTALLMENT IS ${fStat}, 2ND INSTALLMENT IS ${sStat}`;

                // Check for delinquent PRIOR years (not including current year)
                const priorDelinquent = finalHistory.filter(item => 
                    parseInt(item.year) < currentYear && item.status === "Delinquent"
                );

                const priorNote = priorDelinquent.length > 0
                    ? `PRIOR YEARS (${[...new Set(priorDelinquent.map(p => `${p.year}-${parseInt(p.year) + 1}`))].sort().join(', ')}) TAXES ARE DELINQUENT, `
                    : `ALL PRIORS ARE PAID, `;

                currentNote += `, NORMALLY PAID IN SEMI-ANNUALLY, NORMAL DUE DATES ARE ${marionConfig.first_due} & ${marionConfig.second_due}.`;
                data.notes = priorNote + currentNote;

                data.delinquent = hasDelinquent
                    ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                    : "NONE";
            }

            // Add summary metadata
            data.years_requested = yearsRequested;
            data.years_returned = finalHistory.length > 0 ? [...new Set(finalHistory.map(h => h.year))].length : 0;
            data.has_delinquent = hasDelinquent;
            data.delinquent_years = hasDelinquent ? Array.from(delinquentYears).sort().map(y => `${y}-${parseInt(y) + 1}`) : [];

            resolve(data);

        } catch (err) {
            console.error(err);
            reject({ error: true, message: err.message });
        }
    });
};

// MAIN ACCOUNT SEARCH: Executes AC_1 → AC_2 → extract_payments → AC_3 sequentially
const account_search = async (page, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            ac_1(page, account)
                .then(() => {
                    ac_2(page, account)
                        .then((data1) => {
                            extract_payments(page)
                                .then((paymentRecords) => {
                                    ac_3(page, data1, paymentRecords, yearsRequested)
                                        .then((data2) => {
                                            resolve(data2);
                                        })
                                        .catch((error) => {
                                            console.log(error);
                                            reject(error);
                                        });
                                })
                                .catch((error) => {
                                    console.log(error);
                                    reject(error);
                                });
                        })
                        .catch((error) => {
                            console.log(error);
                            reject(error);
                        });
                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                });

        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// API SEARCH HANDLER: Renders HTML or Returns JSON (API)
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;

    if (account.trim() == '' || !account) {
        return res.status(200).render("error_data", {
            error: true,
            message: "Account number is required."
        });
    }

    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        // Get years requested based on client
        let yearsRequested = getOHCompanyYears(client);

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
        );

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (
                req.resourceType() === 'image' ||
                req.resourceType() === 'websocket' ||
                req.resourceType() === 'media' ||
                req.resourceType() === 'other'
            ) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            account_search(page, account, yearsRequested)
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
            account_search(page, account, yearsRequested)
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

module.exports = { search };