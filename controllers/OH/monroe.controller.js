//Author: Nithyananda R S
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// --- Core Date Utility Functions (Used only in Node.js context) ---

const formatCurrency = (str) => {
    return str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const formatDate = (month, day, year) => {
    // We use the Date object to validate and format, ensuring leading zeros for month/day
    const date = new Date(year, month - 1, day);
    // Check if the date components actually match the input (to catch invalid dates like Feb 30)
    const isValidDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValidDate) {
        throw new Error(`Invalid date components: ${month}/${day}/${year}`);
    }
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

const getDelinquencyDate = (dueDateString) => {
    try {
        const [month, day, year] = dueDateString.split('/').map(Number);
        // Create a Date object for the due date
        const date = new Date(year, month - 1, day);

        // Add one day to get the delinquency date
        date.setDate(date.getDate() + 1);

        // Format the new date
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    } catch (error) {
        // Return a reliable, consistent error placeholder
        return "N/A";
    }
}

// --- CORE FUNCTIONALITY: calculateDueDates (Node.js only) ---
const calculateDueDates = (taxYear, county = 'Monroe') => {
    try {
        const year = parseInt(taxYear);
        if (isNaN(year) || year < 2000 || year > 2100) {
            throw new Error(`Invalid tax year provided: ${taxYear}`);
        }

        // Due dates are in the NEXT calendar year (taxYear + 1)
        const dueCalendarYear = year + 1;

        // --- NEW DUE DATES (Real Estate Tax) ---
        const firstHalfDueDate = formatDate(3, 7, dueCalendarYear);   // March 7
        const secondHalfDueDate = formatDate(7, 18, dueCalendarYear); // July 18

        const firstHalfDelqDate = getDelinquencyDate(firstHalfDueDate);
        const secondHalfDelqDate = getDelinquencyDate(secondHalfDueDate);

        const countyDueDates = {
            'Monroe': {
                firstHalf: {
                    dueDate: firstHalfDueDate,
                    delqDate: firstHalfDelqDate,
                    period: 'First Half'
                },
                secondHalf: {
                    dueDate: secondHalfDueDate,
                    delqDate: secondHalfDelqDate,
                    period: 'Second Half'
                },
                defaultPaymentType: 'Semi-Annual'
            }
        };

        if (!countyDueDates[county]) {
            throw new Error(`Unknown county: ${county}`);
        }

        const result = countyDueDates[county];
        result.taxYear = year;
        result.displayYear = `${year}`;
        result.formattedDueDates = `${result.firstHalf.dueDate.split('/').slice(0, 2).join('/')} & ${result.secondHalf.dueDate.split('/').slice(0, 2).join('/')}`;

        const now = new Date();
        const firstDueDate = new Date(result.firstHalf.dueDate);
        const secondDueDate = new Date(result.secondHalf.dueDate);

        result.currentPeriod = now < firstDueDate ? 'First Half' :
            now < secondDueDate ? 'Second Half' : 'Past Due';

        return result;
    } catch (error) {
        console.error('Error in calculateDueDates:', error);
        throw error;
    }
};

// --- NEW UTILITY: Gets the Tax Year from the page ---
const getLatestTaxYear = async (page) => {
    return page.evaluate(() => {
        const taxTable = document.querySelector('table[title*="Tax Table"]');
        if (taxTable) {
            // Find the year in the title attribute (e.g., "Tax Table - 2024")
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (titleMatch) return parseInt(titleMatch[1]);
        }
        // Fallback: If page doesn't exist, guess the last tax year
        return new Date().getFullYear() - 1; 
    });
};

// --- Handlers ---

const getPaymentStatus = async (page, account) => {
    const url = `https://monroecoauditoroh.gov/Parcel?Parcel=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const pageContentExists = await page.$('.parcel');
    if (!pageContentExists) {
        return "NOT_FOUND";
    }
    try {
        await page.waitForSelector('table[title*="Tax Table"]', { timeout: 5000 });
    } catch (error) {
        return "NO_TAX_HISTORY";
    }
    return page.evaluate(() => {
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));
        if (!taxTables || taxTables.length === 0) return "NO_TAX_HISTORY";
        const mostRecentTaxTable = taxTables[0];
        const owedRow = Array.from(mostRecentTaxTable.querySelectorAll('tr')).find(row => {
            const firstCell = row.querySelector('td');
            return firstCell && firstCell.textContent.trim() === 'Owed';
        });
        if (!owedRow) return "NO_TAX_HISTORY";
        const cells = owedRow.querySelectorAll('td');
        if (cells.length < 5) return "UNPAID";
        const firstHalfOwed = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        const secondHalfOwed = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        if (firstHalfOwed === 0 && secondHalfOwed === 0) {
            return "PAID";
        } else {
            return "UNPAID";
        }
    });
};

const getParcelData = async (page, account) => {
    const pageData = await page.evaluate(() => {
        const formatValue = (text) => text ? text.trim() : '';

        const datum = {
            processed_date: new Date().toISOString().split("T")[0],
            owner_name: [],
            property_address: "",
            parcel_number: "",
            land_value: "N/A",
            improvements: "N/A",
            total_assessed_value: "N/A",
            exemption: "N/A",
            total_taxable_value: "N/A",
            taxing_authority: "Monroe County Treasurer, 101 N Main St, Woodsfield, OH 43793, Ph: 740-472-0763",
            notes: "",
            delinquent: "",
            tax_history: []
        };

        // --- 1. Primary Extraction (Targeting by Column Header for robustness) ---
        const headerCols = Array.from(document.querySelectorAll('.row-cols-md-4 > .col-6, .row-cols-md-4 > .col-md-3'));

        let ownerNameFound = false;
        let addressFound = false;

        for (const col of headerCols) {
            const h5 = col.querySelector('h5');

            if (h5) {
                const h5Text = h5.textContent.trim();

                // Find Owner column
                if (h5Text === 'Owner' && !ownerNameFound) {
                    const ownerDiv = col.querySelector('div.text-truncate[data-original-title]');
                    if (ownerDiv) {
                        const name = ownerDiv.getAttribute('data-original-title');
                        datum.owner_name[0] = formatValue(name);
                        ownerNameFound = true;
                    }
                }

                // Find Address column
                if (h5Text === 'Address' && !addressFound) {
                    const addressDiv = col.querySelector('div.text-truncate[data-original-title]');
                    if (addressDiv) {
                        const address = addressDiv.getAttribute('data-original-title');
                        datum.property_address = formatValue(address);
                        addressFound = true;
                    }
                }
            }
        }

        // --- 2. Fallback Extraction (from Location Table) ---
        const locationTable = document.querySelector('#Location table');
        if (locationTable) {
            const rows = locationTable.querySelectorAll('tr');
            rows.forEach(row => {
                const titleCell = row.querySelector('.tableTitle');
                const valueCell = row.querySelector('.TableValue');
                if (titleCell && valueCell) {
                    const titleText = titleCell.textContent.trim();
                    const valueText = valueCell.textContent.trim();

                    if (titleText.includes('Owner') && (!datum.owner_name[0] || datum.owner_name[0].length < 3)) {
                        datum.owner_name[0] = formatValue(valueText);
                    }

                    if (titleText.includes('Address') && (!datum.property_address || datum.property_address.length < 3)) {
                        const address = valueText.split('<div')[0].trim();
                        datum.property_address = formatValue(address);
                    }
                }
            });
        }

        // --- 3. Final Check for N/A ---
        if (!datum.owner_name[0] || datum.owner_name[0].toUpperCase() === 'N/A') {
             datum.owner_name = ["N/A"];
        }
        if (!datum.property_address || datum.property_address.toUpperCase() === 'N/A') {
             datum.property_address = "N/A";
        }

        // --- 4. Valuation and Exemption (Keep existing robust logic) ---
        const valuationTable = document.querySelector('table[title="Valuation"]');
        if (valuationTable) {
            const dataRow = valuationTable.querySelector('tbody tr') ||
                valuationTable.querySelectorAll('tr')[2];
            if (dataRow) {
                const cells = dataRow.querySelectorAll('td, th');
                if (cells.length >= 7) {
                    datum.land_value = cells[1]?.textContent.trim() || "N/A";
                    datum.improvements = cells[2]?.textContent.trim() || "N/A";
                    datum.total_assessed_value = cells[6]?.textContent.trim() || "N/A";
                    datum.total_taxable_value = datum.total_assessed_value;
                }
            }
        }
        const reductionRows = Array.from(document.querySelectorAll('tr'));
        const homesteadRow = reductionRows.find(row =>
            row.textContent.includes('Homestead Reduction')
        );
        if (homesteadRow) {
            const cells = homesteadRow.querySelectorAll('td');
            if (cells.length >= 3) {
                const exemptionAmount = cells[2]?.textContent.trim();
                if (exemptionAmount && exemptionAmount !== '$0.00') {
                    datum.exemption = exemptionAmount;
                }
            }
        }
        return datum;
    });
    pageData.parcel_number = account;
    return pageData;
};

const handleNotFound = (account) => ({
    processed_date: new Date().toISOString().split("T")[0],
    owner_name: ["Invalid Parcel ID"],
    property_address: "Invalid Parcel ID",
    parcel_number: account,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: "Monroe County Treasurer, 101 N Main St, Woodsfield, OH 43793, Ph: 740-472-0763",
    notes: "Parcel not found on the website.",
    delinquent: "N/A",
    tax_history: []
});

const handleNoTaxHistory = (data, clientType = 'default') => {
    const normalizedClientType = clientType.toLowerCase().trim();
    data.tax_history = [];
    if (normalizedClientType.includes('accurate')) {
        data.notes = "AS PER THE TAX COLLECTOR WEBSITE, ONLY CURRENT YEAR TAXES ARE AVAILABLE.";
    } else {
        data.notes = "TAX HISTORY AND CURRENT TAXES ARE NOT AVAILABLE ON THE WEBSITE.";
    }
    data.delinquent = "N/A";
    return data;
};

const handlePaid = async (page, data, clientType = 'default') => {
    // 1. Get the actual tax year from the page (Node.js context)
    const taxYear = await getLatestTaxYear(page);
    const dates = calculateDueDates(taxYear);

    const taxHistory = await page.evaluate((dates) => { 
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
        
        const history = [];
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));
        const paymentsTable = document.querySelector('table[title="Tax Payments"]');
        const paymentRows = paymentsTable ? Array.from(paymentsTable.querySelectorAll('tbody tr')) : [];

        // Deduplicate and sort all payments once
        const allPaymentsRaw = paymentRows.map(row => {
            const cells = row.querySelectorAll('td');
            return {
                date: cells[0]?.textContent.trim(),
                year: cells[1]?.textContent.trim(),
                receipt: cells[2]?.textContent.trim(),
                amount: parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0
            };
        });

        const uniquePaymentsMap = new Map();
        for (const p of allPaymentsRaw) {
            const key = `${p.date}|${p.year}|${p.amount}`;
            const existing = uniquePaymentsMap.get(key);
            if (!existing || p.receipt !== '0') {
                uniquePaymentsMap.set(key, p);
            }
        }
        const allUniquePayments = Array.from(uniquePaymentsMap.values());

        // Process each tax table found on the page
        for (const taxTable of taxTables) {
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (!titleMatch) continue;
            const currentTaxYear = parseInt(titleMatch[1]);

            // Get base amounts from Net General row
            const netGeneralRow = Array.from(taxTable.querySelectorAll('tr')).find(row => {
                const firstCell = row.querySelector('td');
                return firstCell && firstCell.textContent.trim() === 'Net General';
            });

            let firstHalfBase = "$0.00";
            let secondHalfBase = "$0.00";

            if (netGeneralRow) {
                const baseCells = netGeneralRow.querySelectorAll('td');
                firstHalfBase = formatCurrency(baseCells[2]?.textContent.trim());
                secondHalfBase = formatCurrency(baseCells[3]?.textContent.trim());
            }

            // Filter payments for this specific tax year
            const currentYearPayments = allUniquePayments
                .filter(p => p.year === currentTaxYear.toString())
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            // Use dates passed in for the latest year, or fallback/calculate for others if needed
            // For now, Monroe uses static dates relative to the tax year
            const yearDiff = dates.taxYear - currentTaxYear;
            const yearForDates = currentTaxYear + 1;
            
            const firstHalfDueDate = `03/07/${yearForDates}`;
            const firstHalfDelqDate = `03/08/${yearForDates}`;
            const secondHalfDueDate = `07/18/${yearForDates}`;
            const secondHalfDelqDate = `07/19/${yearForDates}`;

            if (currentYearPayments.length === 2) {
                const firstHalfPayment = currentYearPayments[0];
                const secondHalfPayment = currentYearPayments[1];

                history.push({
                    jurisdiction: "County",
                    year: currentTaxYear.toString(),
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: firstHalfBase,
                    amount_paid: formatCurrency(firstHalfPayment.amount.toString()),
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: firstHalfDueDate,
                    delq_date: firstHalfDelqDate,
                    paid_date: firstHalfPayment.date,
                    good_through_date: ""
                });
                history.push({
                    jurisdiction: "County",
                    year: currentTaxYear.toString(),
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: secondHalfBase,
                    amount_paid: formatCurrency(secondHalfPayment.amount.toString()),
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: secondHalfDueDate,
                    delq_date: secondHalfDelqDate,
                    paid_date: secondHalfPayment.date,
                    good_through_date: ""
                });
            } else if (currentYearPayments.length === 1) {
                const annualPayment = currentYearPayments[0];
                const totalAmount = formatCurrency(
                    (parseFloat(firstHalfBase.replace(/[^0-9.-]+/g, "")) +
                        parseFloat(secondHalfBase.replace(/[^0-9.-]+/g, ""))).toString()
                );
                history.push({
                    jurisdiction: "County",
                    year: currentTaxYear.toString(),
                    payment_type: "Annual",
                    status: "Paid",
                    base_amount: totalAmount,
                    amount_paid: formatCurrency(annualPayment.amount.toString()),
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: firstHalfDueDate,
                    delq_date: firstHalfDelqDate,
                    paid_date: annualPayment.date,
                    good_through_date: ""
                });
            } else {
                history.push({
                    jurisdiction: "County",
                    year: currentTaxYear.toString(),
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: firstHalfBase,
                    amount_paid: firstHalfBase,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: firstHalfDueDate,
                    delq_date: firstHalfDelqDate,
                    paid_date: "N/A",
                    good_through_date: ""
                });
                history.push({
                    jurisdiction: "County",
                    year: currentTaxYear.toString(),
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: secondHalfBase,
                    amount_paid: secondHalfBase,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: secondHalfDueDate,
                    delq_date: secondHalfDelqDate,
                    paid_date: "N/A",
                    good_through_date: ""
                });
            }
        }
        return history;
    }, dates);

    const normalizedClientType = clientType ? clientType.toLowerCase().trim() : 'others';
    const yearsRequired = getOHCompanyYears(normalizedClientType);

    // Filter tax history based on yearsRequired
    const uniqueYears = [...new Set(taxHistory.map(item => item.year))].sort((a, b) => b - a);
    const allowedYears = uniqueYears.slice(0, yearsRequired);
    data.tax_history = taxHistory.filter(item => allowedYears.includes(item.year));

    const latestYearRecords = data.tax_history.filter(item => item.year === taxYear.toString());
    const paymentType = latestYearRecords.length === 1 ? "Annual" : latestYearRecords.length >= 2 ? "Semi-Annual" : "Multiple";

    let priorNote = "";
    if (normalizedClientType.includes('accurate')) {
        priorNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE";
    } else {
        priorNote = "ALL PRIORS ARE PAID";
    }

    data.notes = `${priorNote}, ${dates.displayYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
    data.delinquent = "NONE";
    return data;
};

const handleUnpaid = async (page, data, clientType = 'default') => {
    // 1. Get the actual tax year from the page (Node.js context)
    const taxYear = await getLatestTaxYear(page);
    const dates = calculateDueDates(taxYear);

    const unpaidHistory = await page.evaluate((dates) => { 
        // --- Date Calculation Logic (Moved inside browser context) ---
        const calculateDatesInBrowser = (taxYear) => {
            const year = parseInt(taxYear);
            if (isNaN(year) || year < 2000 || year > 2100) {
                return null;
            }
            const dueCalendarYear = year + 1;

            const formatDateLocal = (month, day, year) => {
                const date = new Date(year, month - 1, day);
                return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
            };
            
            const getDelinquencyDateLocal = (dueDateString) => {
                try {
                    const [month, day, year] = dueDateString.split('/').map(Number);
                    const date = new Date(year, month - 1, day);
                    date.setDate(date.getDate() + 1);
                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
                } catch (error) {
                    return "N/A";
                }
            }

            const firstHalfDueDate = formatDateLocal(3, 7, dueCalendarYear);   // March 7
            const secondHalfDueDate = formatDateLocal(7, 18, dueCalendarYear); // July 18

            return {
                firstHalf: {
                    dueDate: firstHalfDueDate,
                    delqDate: getDelinquencyDateLocal(firstHalfDueDate),
                    period: 'First Half'
                },
                secondHalf: {
                    dueDate: secondHalfDueDate,
                    delqDate: getDelinquencyDateLocal(secondHalfDueDate),
                    period: 'Second Half'
                }
            };
        };
        // --- End Date Calculation Logic ---
        
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
        const history = [];
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));

        // Get all payments (logic remains the same)
        const paymentsTable = document.querySelector('table[title="Tax Payments"]');
        const allPaymentsRaw = paymentsTable ? Array.from(paymentsTable.querySelectorAll('tbody tr')).map(row => {
            const cells = row.querySelectorAll('td');
            return {
                date: cells[0]?.textContent.trim(),
                year: cells[1]?.textContent.trim(),
                receipt: cells[2]?.textContent.trim(),
                amount: parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0
            };
        }) : [];

        const allPaymentsMap = new Map();
        for (const p of allPaymentsRaw) {
            const key = `${p.date}|${p.year}|${p.amount}`;
            const existing = allPaymentsMap.get(key);
            if (!existing || p.receipt !== '0') {
                allPaymentsMap.set(key, p);
            }
        }
        const allUniquePayments = Array.from(allPaymentsMap.values());

        for (const taxTable of taxTables) {
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (!titleMatch) continue;
            const currentTaxYear = parseInt(titleMatch[1]);

            // CRITICAL FIX: Calculate the dates using the function defined inside this block
            let halfDates = calculateDatesInBrowser(currentTaxYear);
            if (!halfDates) {
                halfDates = dates; // Fallback to latest dates if calculation fails
            }

            // Get base amounts from Net General row (logic remains the same)
            const netGeneralRow = Array.from(taxTable.querySelectorAll('tr')).find(row => {
                const firstCell = row.querySelector('td');
                return firstCell && firstCell.textContent.trim() === 'Net General';
            });

            let firstHalfBase = "$0.00";
            let secondHalfBase = "$0.00";

            if (netGeneralRow) {
                const baseCells = netGeneralRow.querySelectorAll('td');
                firstHalfBase = formatCurrency(baseCells[2]?.textContent.trim());
                secondHalfBase = formatCurrency(baseCells[3]?.textContent.trim());
            }

            // Get amount due from Owed row (logic remains the same)
            const owedRow = Array.from(taxTable.querySelectorAll('tr')).find(row => {
                const firstCell = row.querySelector('td');
                return firstCell && firstCell.textContent.trim() === 'Owed';
            });

            let firstHalfOwed = 0;
            let secondHalfOwed = 0;
            let firstHalfAmountDue = "$0.00";
            let secondHalfAmountDue = "$0.00";

            if (owedRow) {
                const owedCells = owedRow.querySelectorAll('td');
                firstHalfOwed = parseFloat(owedCells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
                secondHalfOwed = parseFloat(owedCells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
                firstHalfAmountDue = formatCurrency(owedCells[2]?.textContent.trim());
                secondHalfAmountDue = formatCurrency(owedCells[3]?.textContent.trim());
            }

            // Get amount paid from Payments & Adjustments row (logic remains the same)
            const paymentsRow = Array.from(taxTable.querySelectorAll('tr')).find(row => {
                const firstCell = row.querySelector('td');
                return firstCell && firstCell.textContent.trim() === 'Payments & Adjustments';
            });

            let firstHalfPaid = "$0.00";
            let secondHalfPaid = "$0.00";

            if (paymentsRow) {
                const paidCells = paymentsRow.querySelectorAll('td');
                firstHalfPaid = formatCurrency(paidCells[2]?.textContent.trim().replace('-', ''));
                secondHalfPaid = formatCurrency(paidCells[3]?.textContent.trim().replace('-', ''));
            }

            // Find payment dates from unique payment history (logic remains the same)
            const yearPayments = allUniquePayments
                .filter(p => p.year === currentTaxYear.toString())
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            let firstHalfPaidDate = "";
            let secondHalfPaidDate = "";

            // Assign dates based on chronological order ONLY if the half is paid (owed is 0)
            if (firstHalfOwed === 0 && yearPayments.length >= 1) {
                firstHalfPaidDate = yearPayments[0].date;
            }

            if (secondHalfOwed === 0) {
                if (yearPayments.length >= 2) {
                    secondHalfPaidDate = yearPayments[1].date;
                } else if (yearPayments.length === 1 && firstHalfOwed !== 0) {
                    secondHalfPaidDate = yearPayments[0].date;
                }
            }

            // Determine status based on delinquency date logic (logic remains the same)
            const now = new Date();
            const firstHalfDelqDateObj = new Date(halfDates.firstHalf.delqDate);
            const secondHalfDelqDateObj = new Date(halfDates.secondHalf.delqDate);

            let firstHalfStatus;
            if (firstHalfOwed === 0) {
                firstHalfStatus = "Paid";
            } else if (now < firstHalfDelqDateObj) {
                firstHalfStatus = "Due";
            } else {
                firstHalfStatus = "Delinquent";
            }

            let secondHalfStatus;
            if (secondHalfOwed === 0) {
                secondHalfStatus = "Paid";
            } else if (now < secondHalfDelqDateObj) {
                secondHalfStatus = "Due";
            } else {
                secondHalfStatus = "Delinquent";
            }

            history.push({
                jurisdiction: "County",
                year: currentTaxYear.toString(),
                payment_type: "Semi-Annual",
                status: firstHalfStatus,
                base_amount: firstHalfBase,
                amount_paid: firstHalfPaid,
                amount_due: firstHalfAmountDue,
                mailing_date: "N/A",
                due_date: halfDates.firstHalf.dueDate,
                delq_date: halfDates.firstHalf.delqDate,
                paid_date: firstHalfPaidDate || (firstHalfOwed === 0 ? "N/A" : ""),
                good_through_date: ""
            });
            history.push({
                jurisdiction: "County",
                year: currentTaxYear.toString(),
                payment_type: "Semi-Annual",
                status: secondHalfStatus,
                base_amount: secondHalfBase,
                amount_paid: secondHalfPaid,
                amount_due: secondHalfAmountDue,
                mailing_date: "N/A",
                due_date: halfDates.secondHalf.dueDate,
                delq_date: halfDates.secondHalf.delqDate,
                paid_date: secondHalfPaidDate || (secondHalfOwed === 0 ? "N/A" : ""),
                good_through_date: ""
            });
        }
        history.sort((a, b) => {
            const yearDiff = parseInt(b.year) - parseInt(a.year);
            if (yearDiff !== 0) return yearDiff;
            // Sort within the year: first half (March) comes before second half (July)
            const firstInstallmentA = a.due_date.includes('/07/');
            const firstInstallmentB = b.due_date.includes('/07/');
            return firstInstallmentA ? -1 : 1;
        });
        return history;
    }, dates); // Only pass the 'dates' object

    const normalizedClientType = clientType ? clientType.toLowerCase().trim() : 'others';
    const yearsRequired = getOHCompanyYears(normalizedClientType);

    // Filter tax history based on yearsRequired
    const uniqueYears = [...new Set(unpaidHistory.map(item => item.year))].sort((a, b) => b - a);
    const allowedYears = uniqueYears.slice(0, yearsRequired);
    data.tax_history = unpaidHistory.filter(item => allowedYears.includes(item.year));

    // Use the correctly calculated dates object for notes/delinquency check
    const latestYear = data.tax_history.length > 0 ? data.tax_history[0].year : '';
    const latestYearRecords = data.tax_history.filter(item => item.year === latestYear);

    let latestStatus = "PAID";
    if (latestYearRecords.some(item => item.status === 'Delinquent')) {
        latestStatus = "DELINQUENT";
    } else if (latestYearRecords.some(item => item.status === 'Due')) {
        latestStatus = "DUE";
    }

    // Check if prior years have delinquent taxes in the FILTERED history
    const hasDelinquentPrior = data.tax_history.filter(item => item.year !== latestYear).some(item => item.status === 'Delinquent');

    const NOTE = `NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;

    if (hasDelinquentPrior) {
        data.notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`;
        data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else {
        let priorNote = "";
        if (normalizedClientType.includes('accurate')) {
            priorNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE";
        } else {
            priorNote = "ALL PRIORS ARE PAID";
        }
        data.notes = `${priorNote}, ${latestYear} TAXES ARE ${latestStatus}, ${NOTE}`;
        data.delinquent = latestStatus === "DELINQUENT" ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
    }

    return data;
};

// --- Execution and Export (Remains the same) ---

const accountSearch = async (page, account, clientType = 'default') => {
    try {
        const paymentStatus = await getPaymentStatus(page, account);
        if (paymentStatus === "NOT_FOUND") {
            return handleNotFound(account);
        }
        const data = await getParcelData(page, account);
        if (paymentStatus === "NO_TAX_HISTORY") {
            return handleNoTaxHistory(data, clientType);
        } else if (paymentStatus === "PAID") {
            return handlePaid(page, data, clientType);
        } else {
            return handleUnpaid(page, data, clientType);
        }
    } catch (error) {
        console.error("Error during account search:", error);
        throw error;
    }
};

const retryableScrape = (page, account, maxRetries = 3, clientType = 'default') => {
    return new Promise((resolve, reject) => {
        const attemptScrape = (retries) => {
            accountSearch(page, account, clientType)
                .then(result => resolve(result))
                .catch(error => {
                    console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error);
                    if (retries < maxRetries - 1) {
                        setTimeout(() => attemptScrape(retries + 1), 2000 * (retries + 1));
                    } else {
                        reject(error);
                    }
                });
        };
        attemptScrape(0);
    });
};

const search = async (req, res) => {
    const { fetch_type, account, clientName, client } = req.body;
    const clientType = client || clientName || 'others';

    let browserContext = null;
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).send("Invalid request type.");
    }
    try {
        const browser = await getBrowserInstance();
        browserContext = await browser.createBrowserContext();
        const page = await browserContext.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
            } else {
                reqInt.continue();
            }
        });
        const data = await retryableScrape(page, account, 3, clientType);
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else {
            res.status(200).json({ result: data });
        }
    } catch (error) {
        console.error("Error in search function:", error);
        const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
        if (fetch_type === "html") {
            res.status(500).render('error_data', { error: true, message: errorMessage });
        } else {
            res.status(500).json({ error: true, message: errorMessage });
        }
    } finally {
        if (browserContext) {
            await browserContext.close();
        }
    }
};

module.exports = { search };