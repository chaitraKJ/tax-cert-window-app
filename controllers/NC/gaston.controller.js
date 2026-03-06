// Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    return today >= delq_date;
};

// STEP 1: Navigate and search for parcel
const gc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://gastonnc.devnetwedge.com`;

            // Navigate to main page
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeout_option.timeout });

            // Wait for search form to load
            await page.waitForSelector('input[name="q"]', timeout_option);

            // Fill in parcel number
            await page.locator('input[name="q"]').fill(account);

            // Submit search
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForNavigation({ waitUntil: "domcontentloaded" })
            ]);
            // After submitting search and waiting for load

            const isResultsPage = await page.evaluate(() => {
                return !!document.querySelector('table tbody tr[data-url*="ViewQuickSearchResult"]');
            });

            if (isResultsPage) {
                // Count how many property rows (exclude railroad / special types if you want)
                const rowCount = await page.evaluate(() => {
                    return document.querySelectorAll('tbody tr[data-url*="property_type=Parcel"]').length;
                });

                if (rowCount > 1) {
                    throw new Error("No Record Found");
                }

                // Only 1 row → safe to click first one
                await Promise.all([
                    page.click('a.link[href*="/search/ViewQuickSearchResult"]'),
                    page.waitForNavigation({ waitUntil: "domcontentloaded" })
                ]);
            }

            // Verify we're on the property detail page
            await page.waitForSelector('#Overview1, #property-page', timeout_option);

            const hasPropertyData = await page.evaluate(() => {
                return document.querySelector("#Overview1") !== null ||
                    document.querySelector("#property-page") !== null;
            });

            if (!hasPropertyData) {
                reject(new Error("Property details page not loaded"));
            } else {
                resolve(true);
            }

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// STEP 2: Extract overview information
const gc_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector("#Overview1", timeout_option);

            const page_data = await page.evaluate(() => {
                const datum = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "",
                    exemption: "N/A",
                    total_taxable_value: "",
                    taxing_authority: "Gaston County Tax Collector, P.O. Box 1578, Gastonia, NC 28053, Ph: 704-866-3145",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: [],
                };

                // Helper function to format numbers with commas
                const formatWithCommas = (value) => {
                    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
                    if (isNaN(num)) return value;
                    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                };

                // Extract parcel number - try multiple methods
                let parcelNumber = "";

                // Method 1: Try the md:flex structure
                const parcelFlexDivs = document.querySelectorAll("#Overview1 .md\\:flex");
                for (let div of parcelFlexDivs) {
                    const label = div.querySelector(".inner-label");
                    if (label && label.textContent.includes("Parcel Number")) {
                        const valueDiv = div.querySelector("div:not(.inner-label)");
                        if (valueDiv) {
                            parcelNumber = valueDiv.textContent.trim();
                            break;
                        }
                    }
                }

                // Method 2: XPath fallback
                if (!parcelNumber) {
                    const parcelDiv = document.evaluate(
                        "//div[@class='inner-label md:w-5/12' and contains(text(), 'Parcel Number')]/following-sibling::div[1]",
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    if (parcelDiv) {
                        parcelNumber = parcelDiv.textContent.trim();
                    }
                }

                datum.parcel_number = parcelNumber || "";

                // Extract physical address
                let physicalAddress = "";

                // Method 1: Try the md:flex structure
                for (let div of parcelFlexDivs) {
                    const label = div.querySelector(".inner-label");
                    if (label && label.textContent.includes("Physical Address")) {
                        const valueDiv = div.querySelector("div:not(.inner-label)");
                        if (valueDiv) {
                            physicalAddress = valueDiv.textContent.trim().replace(/\s+/g, ' ');
                            break;
                        }
                    }
                }

                datum.property_address = physicalAddress || "N/A";

                // Extract assessed value with proper formatting
                let assessedValue = "";

                // Method 1: Try the md:flex structure
                for (let div of parcelFlexDivs) {
                    const label = div.querySelector(".inner-label");
                    if (label && label.textContent.includes("Assessed Value")) {
                        const valueDiv = div.querySelector("div:not(.inner-label)");
                        if (valueDiv) {
                            const rawValue = valueDiv.textContent.trim();
                            // Format with commas: 104,200 -> $104,200.00
                            const formatted = formatWithCommas(rawValue);
                            assessedValue = "$" + formatted;
                            break;
                        }
                    }
                }

                if (assessedValue) {
                    datum.total_assessed_value = assessedValue;
                    datum.total_taxable_value = assessedValue;
                } else {
                    datum.total_assessed_value = "N/A";
                    datum.total_taxable_value = "N/A";
                }

                // Extract owner information from Names section
                const ownerSection = document.querySelector("#Names1");
                if (ownerSection) {
                    const ownerLabels = ownerSection.querySelectorAll(".inner-label");
                    ownerLabels.forEach(label => {
                        if (label.textContent.includes("OWNER")) {
                            const valueDiv = label.nextElementSibling;
                            if (valueDiv) {
                                const ownerName = valueDiv.textContent.trim();
                                if (ownerName && !datum.owner_name.includes(ownerName)) {
                                    datum.owner_name.push(ownerName);
                                }
                            }
                        }
                    });
                }

                return datum;
            });

            resolve(page_data);

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// STEP 3: Extract payment history
const gc_3 = async (page, data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector("#PaymentHistory1", timeout_option);

            const allYearsData = await page.evaluate(() => {
                const yearsMap = {};
                const historyTable = document.querySelector("#PaymentHistory1 tbody");

                if (!historyTable) {
                    return false;
                }

                const rows = historyTable.querySelectorAll("tr");

                rows.forEach(row => {
                    const cells = row.querySelectorAll("td");
                    if (cells.length >= 5) {
                        const year = cells[0]?.textContent.trim();

                        if (year && !isNaN(parseInt(year))) {
                            const totalDue = cells[1]?.textContent.trim() || "$0.00";
                            const totalPaid = cells[2]?.textContent.trim() || "$0.00";
                            const amountUnpaid = cells[3]?.textContent.trim() || "$0.00";
                            const datePaid = cells[4]?.textContent.trim() || "";
                            const isPaid = amountUnpaid === "$0.00";

                            yearsMap[year] = {
                                year: parseInt(year),
                                status: isPaid ? "Paid" : "Due",
                                base_amount: totalDue,
                                total_paid: totalPaid,
                                amount_unpaid: amountUnpaid,
                                date_paid: datePaid,
                                tax_billed: "",
                                penalty_billed: "",
                                cost_billed: "",
                                interest_billed: "",
                                total_billed: totalDue
                            };
                        }
                    }
                });

                return yearsMap;
            });

            if (!allYearsData) {
                return reject({
                    error: true,
                    message: "Tax History Not Available"
                });
            }

            // Get current year from page
            const currentYear = await page.evaluate(() => {
                const taxYearDiv = document.evaluate(
                    "//div[@class='inner-label' and contains(text(), 'Tax Year')]/following-sibling::div[1]",
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;

                if (taxYearDiv) {
                    const yearSpan = taxYearDiv.querySelector('span');
                    if (yearSpan) {
                        return parseInt(yearSpan.textContent.trim());
                    }
                }
                return new Date().getFullYear();
            });

            // Extract detailed billing information for current year
            const billingDetails = await page.evaluate(() => {
                const billingTable = document.querySelector("#Billing1 table tbody");
                if (!billingTable) return null;

                const details = {};
                const rows = billingTable.querySelectorAll("tr");

                rows.forEach(row => {
                    const cells = row.querySelectorAll("th, td");
                    if (cells.length === 2) {
                        const label = cells[0]?.textContent.trim();
                        const value = cells[1]?.textContent.trim();

                        if (label === "Tax Billed") details.tax_billed = value;
                        if (label === "SA Billed") details.sa_billed = value;
                        if (label === "Interest Billed") details.interest_billed = value;
                        if (label === "Fees Billed") details.fees_billed = value;
                        if (label === "Total Billed") details.total_billed = value;
                    }
                });

                return details;
            });

            // Merge billing details into current year
            if (billingDetails && allYearsData[currentYear]) {
                allYearsData[currentYear] = {
                    ...allYearsData[currentYear],
                    ...billingDetails,
                    penalty_billed: billingDetails.interest_billed || "$0.00",
                    cost_billed: billingDetails.fees_billed || "$0.00"
                };
            }

            resolve({ data, allYearsData, currentYear });

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// STEP 4: Format the data
const gc_4 = async (main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            let { data, allYearsData, currentYear } = main_data;
            const tax_history = [];
            let anyDelinquent = false;

            // Helper function to ensure consistent currency formatting
            const formatCurrency = (value) => {
                if (!value || value === "N/A") return value;
                // Remove all non-numeric characters except decimal point
                const numericValue = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
                if (isNaN(numericValue)) return value;
                // Format with commas and 2 decimal places
                return "$" + numericValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            const years = Object.keys(allYearsData).map(Number).sort((a, b) => b - a);

            // Ensure we have at least some years
            if (years.length === 0) {
                return reject({
                    error: true,
                    message: "No tax year data available"
                });
            }

            currentYear = years[0];
            const priorYears = years.filter((y) => y < currentYear);
            const hasPriorUnpaid = priorYears.some((yr) => allYearsData[yr] && allYearsData[yr].amount_unpaid !== "$0.00");

            let yearsToProcess = [];

            if (hasPriorUnpaid) {
                // Include all unpaid years + current year
                yearsToProcess = years.filter((yr) => allYearsData[yr] && allYearsData[yr].amount_unpaid !== "$0.00");
                // Make sure current year is included
                if (!yearsToProcess.includes(currentYear) && allYearsData[currentYear]) {
                    yearsToProcess.push(currentYear);
                }
                yearsToProcess.sort((a, b) => b - a);
            } else {
                // Only current year (if it exists)
                if (allYearsData[currentYear]) {
                    yearsToProcess = [currentYear];
                }
            }

            yearsToProcess.forEach((year) => {
                const yearData = allYearsData[year];

                // Skip if year data doesn't exist
                if (!yearData) {
                    console.log(`Warning: No data found for year ${year}`);
                    return;
                }

                let baseTax = "$0.00";
                if (yearData.tax_billed && yearData.tax_billed !== "") {
                    baseTax = formatCurrency(yearData.tax_billed);
                } else if (yearData.total_billed) {
                    const total = parseFloat(yearData.total_billed.replace(/[$,]/g, ''));
                    const penalty = parseFloat((yearData.penalty_billed || "$0.00").replace(/[$,]/g, ''));
                    const cost = parseFloat((yearData.cost_billed || "$0.00").replace(/[$,]/g, ''));

                    const calculatedBase = total - penalty - cost;
                    baseTax = formatCurrency(calculatedBase);
                } else {
                    baseTax = formatCurrency(yearData.base_amount);
                }

                const historyEntry = {
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Annual",
                    status: yearData.status || "Unknown",
                    base_amount: baseTax,
                    penalty: formatCurrency(yearData.penalty_billed || "$0.00"),
                    costs: formatCurrency(yearData.cost_billed || "$0.00"),
                    amount_paid: formatCurrency(yearData.total_paid || "$0.00"),
                    amount_due: formatCurrency(yearData.amount_unpaid || "$0.00"),
                    mailing_date: "N/A",
                    due_date: `09/01/${year}`,
                    delq_date: `01/06/${parseInt(year) + 1}`,
                    paid_date: yearData.date_paid || "-",
                    good_through_date: "",
                };

                if (historyEntry.status === "Due") {
                    if (is_delq(historyEntry.delq_date)) {
                        historyEntry.status = "Delinquent";
                        anyDelinquent = true;
                    }
                }

                tax_history.push(historyEntry);
            });

            let currentNote = "";
            if (allYearsData[currentYear]) {
                const cy = allYearsData[currentYear];
                const isCurrentlyDelq = cy.amount_unpaid !== "$0.00" && is_delq(`01/05/${currentYear + 1}`);

                if (isCurrentlyDelq) {
                    currentNote = `${currentYear} ANNUAL TAXES ARE DELINQUENT`;
                } else if (cy.status === "Paid") {
                    currentNote = `${currentYear} ANNUAL TAXES ARE PAID`;
                } else {
                    currentNote = `${currentYear} ANNUAL TAXES ARE DUE`;
                }
            } else {
                currentNote = `${currentYear} TAX INFORMATION NOT AVAILABLE`;
            }

            const priorNote = hasPriorUnpaid
                ? "PRIOR YEAR(S) TAXES ARE DELINQUENT"
                : "ALL PRIOR YEAR(S) TAXES ARE PAID";

            const dueDates = "NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 09/01. CITY TAX NEED TO CONFIRM.";

            data.notes = `${priorNote}. ${currentNote}. ${dueDates}`;
            data.delinquent = anyDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
            data.tax_history = tax_history.sort((a, b) => a.year - b.year);

            resolve(data);

        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Main search orchestrator
const account_search = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            gc_1(page, account)
                .then(() => {
                    gc_2(page, account)
                        .then((data2) => {
                            gc_3(page, data2, account)
                                .then((data3) => {
                                    gc_4(data3, account)
                                        .then((data4) => {
                                            resolve(data4);
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
            reject(new Error(error.message));
        }
    });
};

// Main Express route handler
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        if (!account || account.trim() === '') {
            return res.status(200).render("error_data", {
                error: true,
                message: "Enter the Account Number..."
            });
        }

        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        // Launch browser
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' ||
                req.resourceType() === 'font' ||
                req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
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
        } else if (fetch_type === "api") {
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

module.exports = { search };