//Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");
const timeout_option = {
    timeout: 90000
};

const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const counties = {
    athens: {
        url: 'https://www.athenscountyauditor.org/Parcel?Parcel=',
        taxing_authority: 'Athens County Auditor, 1 S Court St, Athens, OH 45701, Ph: (740) 592-3222',
        first_due: '03/10',
        second_due: '08/04',
        first_delq: '03/11',
        second_delq: '08/05',
    },
    gallia: {
        url: 'https://auditor.gallianet.net/Parcel?Parcel=',
        taxing_authority: 'Gallia County Auditor, 18 Locust St #1264, Gallipolis, OH 45631, Ph: (740) 446-4612',
        first_due: '02/14',
        second_due: '07/11',
        first_delq: '02/15',
        second_delq: '07/12',
    },
    clark: {
        url: 'https://clarkcountyauditor.org/Parcel?Parcel=',
        taxing_authority: 'Clark County Auditor, 31 N Limestone St, Springfield, OH 45502, Ph: (937) 521-1860',
        first_due: '02/28',
        second_due: '06/27',
        first_delq: '03/01',
        second_delq: '06/28',
    },
    pickaway: {
        url: 'https://auditor.pickawaycountyohio.gov/Parcel?Parcel=',
        taxing_authority: 'Pickaway County Auditor, 207 S Court St, Circleville, OH 43113, Ph: (740) 474-4765',
        first_due: '03/14',
        second_due: '07/18',
        first_delq: '03/15',
        second_delq: '07/19',
    }
};

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    if (today >= delq_date) {
        return true;
    }
    return false;
}

// AC_1: VALIDATE PARCEL
const ac_1 = (page, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `${countyConfig.url}${account}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
            
            // CHECK IF PARCEL IS INVALID
            const isInvalidParcel = await page.evaluate(() => {
                const divs = document.querySelectorAll("#Location div");
                if (divs.length > 1) {
                    return divs[1].textContent?.includes("No Base Records Found.");
                }
                return false;
            });

            if (isInvalidParcel) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No records found in the database.`
                });
            }

            resolve({ success: true });
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// AC_2: EXTRACT BASIC PARCEL INFO (OWNER, ADDRESS, ASSESSED VALUE)
const ac_2 = (page, ac1_data, account, countyConfig) => {
    return new Promise(async (resolve, reject) => {
        try {
            const page_data = await page.evaluate((account, countyConfig) => {
                const datum = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [""],
                    property_address: "",
                    parcel_number: account,
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: countyConfig.taxing_authority,
                    notes: "",
                    delinquent: "",
                    tax_history: []
                };

                // OWNER AND ADDRESS FROM LOCATION TABLE
                const locationTable = document.querySelector('#Location table');
                if (locationTable) {
                    const rows = Array.from(locationTable.querySelectorAll('tr'));
                    datum.owner_name[0] = rows[1]?.querySelector('td:last-child')?.textContent.trim() || "N/A";
                    datum.property_address = rows[2]?.querySelector('td:last-child')?.textContent.trim() || "N/A";
                }

                // ASSESSED VALUES FROM VALUATION TABLE
                const valuationTable = document.querySelector('.table-responsive .table[title="Valuation"]');
                if (valuationTable) {
                    const valuationRow = valuationTable.querySelector('tbody tr:first-child');
                    if (valuationRow) {
                        const cells = valuationRow.querySelectorAll('td');
                        if (cells.length >= 7) {
                            datum.land_value = cells[1]?.textContent.trim() ?? "N/A";
                            datum.improvements = cells[2]?.textContent.trim() ?? "N/A";
                            datum.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A";
                            datum.total_taxable_value = datum.total_assessed_value;
                        }
                    }
                }

                return datum;
            }, account, countyConfig);

            if (
                page_data.owner_name[0] === "N/A" &&
                page_data.property_address === "N/A" &&
                page_data.land_value === "N/A" &&
                page_data.improvements === "N/A" &&
                page_data.total_assessed_value === "N/A"
            ) {
                return reject({
                    error: true,
                    message: `Parcel ${account} is invalid: No appraisal or owner data found.`,
                });
            }

            resolve({ 
                data: page_data
            });
        } catch (error) {
            console.log(error);
            reject({ error: true, message: error.message });
        }
    });
};

// AC_3: EXTRACT TAX HISTORY AND BUILD FINAL DATA
const ac_3 = async (page, ac2_data, countyConfig, taxYears=1) => {
    try {
        const { data } = ac2_data;
        const currentDate = new Date();

        // First, get all available year tabs
        const availableYears = await page.evaluate(() => {
            const years = [];
            const navTabs = document.querySelectorAll('div.nav-link[data-toggle="tab"]');
            
            navTabs.forEach((tab, idx) => {
                const yearText = tab.textContent.trim();
                const year = yearText.split(' ')[0]; // Extract "2024" from "2024 Payable 2025"
                if (year && !isNaN(parseInt(year))) {
                    const targetId = tab.getAttribute('data-target') || tab.getAttribute('href');
                    years.push({ year: year, targetId: targetId, index: idx });
                }
            });
            
            return years;
        });

        if (availableYears.length === 0) {
            data.notes = "Tax history and current taxes are not available on the website.";
            data.delinquent = "N/A";
            data.tax_history = [];
            return data;
        }

        // Sort by year descending
        availableYears.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        // Extract all payments once to avoid repeated evaluations
        const allPayments = await page.evaluate(() => {
            const paymentTable = document.querySelector('#taxPayments tbody');
            if (!paymentTable) return [];

            return Array.from(paymentTable.querySelectorAll('tr')).map(row => {
                const cells = row.querySelectorAll('td');
                const rawDateAttr = cells[0]?.getAttribute('data-sort');
                return {
                    date: cells[0]?.textContent.trim(),
                    year: cells[1]?.textContent.trim(),
                    amount: Math.abs(parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, ""))) || 0,
                    sortDate: rawDateAttr ? new Date(rawDateAttr).getTime() : new Date(cells[0]?.textContent.trim()).getTime()
                };
            });
        });

        // Sort all payments chronologically (oldest first)
        allPayments.sort((a, b) => a.sortDate - b.sortDate);

        const allHistory = [];
        let foundUnpaid = false;
        let yearsSuccessfullyProcessed = 0;

        // Process years based on optimization rules
        for (let i = 0; i < availableYears.length; i++) {
            const yearInfo = availableYears[i];
            const { year, targetId } = yearInfo;

            // Click on the div.nav-link to make it active
            const tabSelector = `div[data-target="${targetId}"], div[href="${targetId}"]`;
            try {
                await page.click(tabSelector);
                // Wait for the tab pane to become active and visible
                await page.waitForFunction((id) => {
                    const pane = document.querySelector(id);
                    return pane && (pane.classList.contains('active') || pane.classList.contains('show'));
                }, { timeout: 3000 }, targetId);
                // Add a small delay to ensure content is rendered
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                // If it doesn't become active, we still try to scrape but maybe it's already there
            }

            // Extract data from the now-active tab
            const yearData = await page.evaluate((currentYear, targetId) => {
                let activeTabPane = document.querySelector(`${targetId}.active, ${targetId}.show.active`);
                if (!activeTabPane) {
                    activeTabPane = document.querySelector(targetId);
                }
                
                if (!activeTabPane) return null;
                
                const taxTable = activeTabPane.querySelector('table[title*="Taxes"]');
                if (!taxTable) return null;

                const rows = Array.from(taxTable.querySelectorAll('tr'));
                const taxesBilledRow = rows.find(row => row.textContent.includes('Taxes Billed'));
                const taxesDueRow = rows.find(row => row.textContent.includes('Taxes Due'));
                const paymentsMadeRow = rows.find(row => row.textContent.includes('Payments Made'));

                if (!taxesBilledRow || !taxesDueRow || !paymentsMadeRow) return null;

                const billedCells = taxesBilledRow.querySelectorAll('td');
                const dueCells = taxesDueRow.querySelectorAll('td');
                const paidCells = paymentsMadeRow.querySelectorAll('td');

                if (billedCells.length < 5 || dueCells.length < 5 || paidCells.length < 5) return null;

                return {
                    year: currentYear,
                    firstHalfBilled: billedCells[2]?.textContent.trim(),
                    secondHalfBilled: billedCells[3]?.textContent.trim(),
                    firstHalfPaid: paidCells[2]?.textContent.trim(),
                    secondHalfPaid: paidCells[3]?.textContent.trim(),
                    firstHalfDue: dueCells[2]?.textContent.trim(),
                    secondHalfDue: dueCells[3]?.textContent.trim()
                };
            }, year, targetId);
            
            if (!yearData) continue;
            
            yearsSuccessfullyProcessed++;

            const firstHalfDueAmount = Math.abs(parseFloat(yearData.firstHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfDueAmount = Math.abs(parseFloat(yearData.secondHalfDue.replace(/[^0-9.-]+/g, ""))) || 0;
            const firstHalfPaidAmount = Math.abs(parseFloat(yearData.firstHalfPaid.replace(/[^0-9.-]+/g, ""))) || 0;
            const secondHalfPaidAmount = Math.abs(parseFloat(yearData.secondHalfPaid.replace(/[^0-9.-]+/g, ""))) || 0;

            // Find payment dates from pre-extracted payments
            let yearPayments = allPayments.filter(p => p.year == year).sort((a, b) => a.sortDate - b.sortDate);
            let firstHalfPaidDate = "";
            let secondHalfPaidDate = "";

            // 1. Check for Single Annual Payment (covers both halves)
            if (yearPayments.length === 1 && firstHalfPaidAmount > 0 && secondHalfPaidAmount > 0) {
                const p = yearPayments[0];
                const totalPaid = firstHalfPaidAmount + secondHalfPaidAmount;
                // If amount matches total (with tolerance), or if it's the only payment available
                if (Math.abs(p.amount - totalPaid) < 5.00 || Math.abs(p.amount) > Math.max(firstHalfPaidAmount, secondHalfPaidAmount)) {
                    firstHalfPaidDate = p.date;
                    secondHalfPaidDate = p.date;
                    yearPayments = []; // Consumed
                }
            }

            // 2. Match First Half
            if (firstHalfPaidAmount > 0 && !firstHalfPaidDate && yearPayments.length > 0) {
                // Try to find exact match first
                const matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - firstHalfPaidAmount) < 1.00);
                if (matchIndex !== -1) {
                    firstHalfPaidDate = yearPayments[matchIndex].date;
                    yearPayments.splice(matchIndex, 1); // Consume
                } else {
                    // Fallback: take the first available payment (chronologically oldest)
                    firstHalfPaidDate = yearPayments[0].date;
                    yearPayments.shift(); // Consume
                }
            }

            // 3. Match Second Half
            if (secondHalfPaidAmount > 0 && !secondHalfPaidDate && yearPayments.length > 0) {
                // Try to find exact match first
                const matchIndex = yearPayments.findIndex(p => Math.abs(p.amount - secondHalfPaidAmount) < 1.00);
                if (matchIndex !== -1) {
                    secondHalfPaidDate = yearPayments[matchIndex].date;
                    yearPayments.splice(matchIndex, 1); // Consume
                } else {
                    // Fallback: take the next available payment
                    secondHalfPaidDate = yearPayments[0].date;
                    yearPayments.shift(); // Consume
                }
            }

            const isAnnual = firstHalfPaidDate && secondHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate;
            
            const firstDueDateStr = `${countyConfig.first_due}/${parseInt(year) + 1}`;
            const firstDelqDateStr = `${countyConfig.first_delq}/${parseInt(year) + 1}`;
            const secondDueDateStr = `${countyConfig.second_due}/${parseInt(year) + 1}`;
            const secondDelqDateStr = `${countyConfig.second_delq}/${parseInt(year) + 1}`;

            const isFirstDelq = is_delq(firstDelqDateStr);
            const isSecondDelq = is_delq(secondDelqDateStr);

            if (isAnnual) {
                // Combined Annual Entry
                const totalBilled = (parseFloat(yearData.firstHalfBilled.replace(/[^0-9.-]+/g, "")) || 0) + (parseFloat(yearData.secondHalfBilled.replace(/[^0-9.-]+/g, "")) || 0);
                const totalPaid = (parseFloat(yearData.firstHalfPaid.replace(/[^0-9.-]+/g, "")) || 0) + (parseFloat(yearData.secondHalfPaid.replace(/[^0-9.-]+/g, "")) || 0);
                const totalDue = (parseFloat(yearData.firstHalfDue.replace(/[^0-9.-]+/g, "")) || 0) + (parseFloat(yearData.secondHalfDue.replace(/[^0-9.-]+/g, "")) || 0);

                let status = "Paid";
                if (totalDue > 0.01) {
                    status = isFirstDelq ? "Delinquent" : "Due";
                }

                allHistory.push({
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Annual",
                    status: status,
                    base_amount: formatCurrency(totalBilled.toString()),
                    amount_paid: formatCurrency(totalPaid.toString()),
                    amount_due: formatCurrency(totalDue.toString()),
                    mailing_date: "N/A",
                    due_date: firstDueDateStr,
                    delq_date: firstDelqDateStr,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            } else {
                // Separate Semi-Annual Entries
                let firstStatus = "Paid";
                if (firstHalfDueAmount > 0.01) {
                    firstStatus = isFirstDelq ? "Delinquent" : "Due";
                }

                let secondStatus = "Paid";
                if (secondHalfDueAmount > 0.01) {
                    secondStatus = isSecondDelq ? "Delinquent" : "Due";
                }

                allHistory.push(
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: firstStatus,
                        base_amount: formatCurrency(yearData.firstHalfBilled),
                        amount_paid: formatCurrency(yearData.firstHalfPaid),
                        amount_due: formatCurrency(yearData.firstHalfDue),
                        mailing_date: "N/A",
                        due_date: firstDueDateStr,
                        delq_date: firstDelqDateStr,
                        paid_date: firstHalfPaidDate,
                        good_through_date: ""
                    },
                    {
                        jurisdiction: "County",
                        year: year,
                        payment_type: "Semi-Annual",
                        status: secondStatus,
                        base_amount: formatCurrency(yearData.secondHalfBilled),
                        amount_paid: formatCurrency(yearData.secondHalfPaid),
                        amount_due: formatCurrency(yearData.secondHalfDue),
                        mailing_date: "N/A",
                        due_date: secondDueDateStr,
                        delq_date: secondDelqDateStr,
                        paid_date: secondHalfPaidDate,
                        good_through_date: ""
                    }
                );
            }

            const currentYearHistory = allHistory.slice(isAnnual ? -1 : -2);
            const isYearUnpaid = currentYearHistory.some(item => ["Due", "Delinquent"].includes(item.status));
            if (isYearUnpaid) foundUnpaid = true;

            // Optimization logic
            if (taxYears===1) {
                if (yearsSuccessfullyProcessed === 1 && !isYearUnpaid) break;
            } else if (taxYears === 2) {
                if (yearsSuccessfullyProcessed === 2 && !foundUnpaid) break;
            }

            if (foundUnpaid && !isYearUnpaid) break;
        }

        let finalTaxHistory = allHistory;
        if (foundUnpaid) {
            finalTaxHistory = allHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        }

        data.tax_history = finalTaxHistory;

        // Determine delinquent status and notes
        const unpaidItems = finalTaxHistory.filter(item => ["Due", "Delinquent"].includes(item.status));
        const delinquentItems = finalTaxHistory.filter(item => item.status === "Delinquent");
        const unpaidYears = [...new Set(unpaidItems.map(item => item.year))];
        const latestYear = availableYears.length > 0 ? availableYears[0].year : null;
        const annualNote = `NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${countyConfig.first_due} & ${countyConfig.second_due}`;

        if (delinquentItems.length > 0) {
            data.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE DELINQUENT, ${annualNote}`;
            data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
        } else if (unpaidItems.length > 0) {
            const status = unpaidItems.every(item => item.status === "Due") ? "DUE" : "UNPAID";
            data.notes = `ALL PRIORS ARE PAID, ${unpaidYears.sort((a, b) => b - a).join(', ')} TAXES ARE ${status}, ${annualNote}`;
            data.delinquent = "NONE";
        } else if (latestYear) {
            data.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${annualNote}`;
            data.delinquent = "NONE";
        } else {
            data.notes = `TAX CERTIFICATE - NO TAX HISTORY FOUND.`;
            data.delinquent = "NONE";
        }

        return data;
    } catch (error) {
        console.log(error);
        throw error;
    }
};

// MAIN ACCOUNT SEARCH
const account_search = (page, account, countyConfig, taxYears) => {
    return new Promise(async (resolve, reject) => {
        try {
            const ac1_data = await ac_1(page, account, countyConfig);
            const ac2_data = await ac_2(page, ac1_data, account, countyConfig);
            const finalData = await ac_3(page, ac2_data, countyConfig, taxYears);
            resolve(finalData);
        } catch (error) {
            console.log("Error in account_search:", error);
            reject(error);
        }
    });
};

// API + HTML ROUTES
const search = async (req, res) => {
    const { fetch_type, account ,client} = req.body;
    let taxYears=getOHCompanyYears(client);
    
    if(!account || account.trim()==''){
        return res.status(200).render("error_data", {
            error: true,
            message: "Account number is required."
        });
    }
    
    const county = req.path.replace(/^\/+/, "");
    
    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        if (!county || !counties[county]) {
            return res.status(200).render("error_data", { 
                error: true, 
                message: "Invalid County" 
            });
        }

        const config = counties[county];
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["stylesheet", "font", "image"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            // FRONTEND POINT
            account_search(page, account, config, taxYears)
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
        } else if (fetch_type === "api") {
            // API ENDPOINT
            account_search(page, account, config, taxYears)
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
        if (fetch_type === "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

module.exports = { search }