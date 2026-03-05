//Author- Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const handleNotFound = (parcelNumber) => ({
    processed_date: new Date().toISOString().split('T')[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    owner_address: "No records found",
    parcel_number: parcelNumber,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: "Cochise County Treasurer, Arizona",
    notes: "No tax records found for this parcel number.",
    delinquent: "N/A",
    tax_history: []
});

const isDatePassed = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasAmountDue = (amount) => {
    if (!amount || amount === "N/A" || amount === "") return false;
    const num = parseFloat(String(amount).replace(/[^0-9.-]+/g, ""));
    return !isNaN(num) && num > 0;
};

const calculateTaxDates = (taxYear, halfDesignation) => {
    const year = parseInt(taxYear);
    if (halfDesignation === "First Half") {
        return { due_date: `10/01/${year}`, delq_date: `11/01/${year}` };
    } else if (halfDesignation === "Second Half") {
        return { due_date: `03/01/${year + 1}`, delq_date: `05/01/${year + 1}` };
    } else {
        return { due_date: `10/01/${year}`, delq_date: `12/31/${year}` };
    }
};

const performSearch = (page, parcelNumber) => {
    const searchUrl = 'https://parcelinquiry.azurewebsites.us/';
    return page.goto(searchUrl, { waitUntil: "load", timeout: 60000 })
        .then(() => page.waitForSelector('input[name="parcelNumber_input"]', { timeout: 30000, visible: true }))
        .then(() => delay(2000))
        .then(() => page.evaluate((parcel) => {
            const input = document.querySelector('input[name="parcelNumber_input"]');
            const hidden = document.querySelector('#parcelNumber');
            if (input) {
                input.value = parcel;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (hidden) hidden.value = parcel;
        }, parcelNumber))
        .then(() => delay(1000))
        .then(() => page.evaluate(() => {
            const submitBtn = document.querySelector('input[type="submit"]');
            if (submitBtn) submitBtn.click();
        }))
        .then(() => page.waitForNavigation({ waitUntil: "load", timeout: 45000 }).catch(() => {}))
        .then(() => delay(3000));
};

const scrapeOwnerInfo = (page) => {
    return page.evaluate(() => {
        const addressBlock = document.querySelector('.addressblock');
        if (!addressBlock) return { owner_name: "N/A", owner_address: "N/A" };
        const lines = addressBlock.innerHTML
            .split('<br>')
            .map(line => line.replace(/<[^>]*>/g, '').trim())
            .filter(line => line.length > 0 && !line.includes('Current Owner Name'));
        return {
            owner_name: lines[0] || "N/A",
            owner_address: lines.slice(1).join(', ') || "N/A"
        };
    });
};

const scrapeTaxSummary = (page) => {
    return page.evaluate(() => {
        const rows = document.querySelectorAll('#Grid tbody tr');
        const taxYears = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                taxYears.push({
                    year: cells[1]?.textContent?.trim() || '',
                    status: cells[2]?.textContent?.trim() || '',
                    due: cells[6]?.textContent?.trim() || '$0.00'
                });
            }
        });
        return taxYears;
    });
};

const scrapeValuations = (page) => {
    return page.evaluate(() => {
        const rows = document.querySelectorAll('#Valuations tbody tr');
        let landValue = 0, improvementValue = 0, totalAssessed = 0;
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) {
                const levyType = cells[0]?.textContent?.trim().toLowerCase() || '';
                const valueType = cells[3]?.textContent?.trim().toLowerCase() || '';
                const netAssessed = cells[7]?.textContent?.trim() || '$0';
                const value = parseFloat(netAssessed.replace(/[^0-9.-]+/g, "")) || 0;
                if (levyType === 'primary') {
                    if (valueType.includes('land')) landValue += value;
                    else if (valueType.includes('improvement')) improvementValue += value;
                    totalAssessed += value;
                }
            }
        });
        return {
            land_value: `$${landValue.toFixed(2)}`,
            improvements: `$${improvementValue.toFixed(2)}`,
            total_assessed_value: `$${totalAssessed.toFixed(2)}`
        };
    });
};

const clickDueLinkForYear = (page, year) => {
    return page.evaluate((yr) => {
        const rows = document.querySelectorAll('#Grid tbody tr');
        for (let row of rows) {
            const cells = row.querySelectorAll('td');
            const rowYear = cells[1]?.textContent?.trim();
            if (rowYear === yr) {
                const dueLink = cells[6]?.querySelector('a');
                if (dueLink) {
                    dueLink.click();
                    return true;
                }
            }
        }
        return false;
    }, year)
        .then((clicked) => {
            if (!clicked) throw new Error(`Due link not found for year ${year}`);
            return delay(4000);
        })
        .then(() => page.waitForSelector('#Grid table', { timeout: 15000, visible: true }))
        .then(() => delay(1000));
};

const navigateBackToTaxSummary = (page) => {
    return page.evaluate(() => window.history.back())
        .then(() => delay(3000))
        .then(() => page.waitForSelector('#Grid tbody tr', { timeout: 15000, visible: true }))
        .then(() => delay(1000));
};

const scrapeTaxYearDue = (page) => {
    return page.evaluate(() => {
        const table = document.querySelector('#Grid table');
        if (!table) return null;
        const rows = table.querySelectorAll('tbody tr');
        const data = {
            first_half_tax: '$0.00', second_half_tax: '$0.00',
            first_half_paid: '$0.00', second_half_paid: '$0.00',
            first_half_due: '$0.00', second_half_due: '$0.00'
        };
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                const label = cells[0]?.textContent?.trim().toLowerCase() || '';
                if (label.includes('tax due')) {
                    data.first_half_tax = cells[1]?.textContent?.trim() || '$0.00';
                    data.second_half_tax = cells[2]?.textContent?.trim() || '$0.00';
                } else if (label.includes('tax paid')) {
                    data.first_half_paid = cells[1]?.textContent?.trim() || '$0.00';
                    data.second_half_paid = cells[2]?.textContent?.trim() || '$0.00';
                }
            }
        });
        const footer = table.querySelector('tfoot tr');
        if (footer) {
            const footerCells = footer.querySelectorAll('td');
            if (footerCells.length >= 4) {
                data.first_half_due = footerCells[1]?.textContent?.trim() || '$0.00';
                data.second_half_due = footerCells[2]?.textContent?.trim() || '$0.00';
            }
        }
        return data;
    });
};

const scrapePaymentHistory = (page, year) => {
    return page.$('#taxYear')
        .then((yearSelector) => {
            if (yearSelector) {
                return page.evaluate((yr) => {
                    try {
                        const dropdown = jQuery('#taxYear').data('kendoDropDownList');
                        if (dropdown) {
                            dropdown.value(yr);
                            dropdown.trigger('change');
                            return true;
                        }
                        return false;
                    } catch (e) {
                        return false;
                    }
                }, year)
                    .then((changed) => changed ? delay(5000) : Promise.resolve());
            }
        })
        .then(() => page.evaluate(() => {
            const rows = document.querySelectorAll('#PaymentBatches tbody tr.k-master-row');
            const payments = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    payments.push({
                        batch_number: cells[2]?.textContent?.trim() || '',
                        payment_date: cells[3]?.textContent?.trim() || '',
                        amount: cells[6]?.textContent?.trim() || '$0.00'
                    });
                }
            });
            return payments;
        }));
};

const processUnpaidYear = (page, year, valuations) => {
    return scrapeTaxYearDue(page)
        .then((taxDetails) => {
            if (!taxDetails) return [];
            const firstHalfTax = parseFloat(taxDetails.first_half_tax.replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfTax = parseFloat(taxDetails.second_half_tax.replace(/[^0-9.-]+/g, "")) || 0;
            const firstHalfPaid = parseFloat(taxDetails.first_half_paid.replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfPaid = parseFloat(taxDetails.second_half_paid.replace(/[^0-9.-]+/g, "")) || 0;
            const firstHalfDue = parseFloat(taxDetails.first_half_due.replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfDue = parseFloat(taxDetails.second_half_due.replace(/[^0-9.-]+/g, "")) || 0;
            const hasPartialPayment = (firstHalfPaid > 0 && firstHalfDue === 0) || (secondHalfPaid > 0 && secondHalfDue === 0);

            if (hasPartialPayment) {
                return page.evaluate(() => {
                    const link = document.querySelector('a[href="/Parcel/PaymentHistory"]');
                    if (link) link.click();
                })
                    .then(() => delay(4000))
                    .then(() => page.waitForSelector('#PaymentBatches', { timeout: 15000, visible: true }))
                    .then(() => delay(1000))
                    .then(() => scrapePaymentHistory(page, year))
                    .then((payments) => {
                        const taxHistory = [];
                        if (firstHalfTax > 0 && secondHalfTax > 0) {
                            const firstHalfDates = calculateTaxDates(year, "First Half");
                            const firstHalfPayment = payments[0] || {};
                            taxHistory.push({
                                jurisdiction: "County", year,
                                status: firstHalfDue > 0 && isDatePassed(firstHalfDates.delq_date) ? "Delinquent" : (firstHalfDue > 0 ? "Due" : "Paid"),
                                payment_type: "Semi-Annual", half_designation: "First Half",
                                base_amount: taxDetails.first_half_tax,
                                amount_paid: taxDetails.first_half_paid,
                                amount_due: taxDetails.first_half_due,
                                paid_date: firstHalfDue === 0 ? (firstHalfPayment.payment_date || "N/A") : "",
                                due_date: firstHalfDates.due_date,
                                delq_date: firstHalfDates.delq_date,
                                land_value: valuations.land_value,
                                improvements: valuations.improvements,
                                total_assessed_value: valuations.total_assessed_value,
                                receipt_number: firstHalfDue === 0 ? (firstHalfPayment.batch_number || "N/A") : "N/A"
                            });

                            const secondHalfDates = calculateTaxDates(year, "Second Half");
                            const secondHalfPayment = payments[1] || payments[0] || {};
                            taxHistory.push({
                                jurisdiction: "County", year,
                                status: secondHalfDue > 0 && isDatePassed(secondHalfDates.delq_date) ? "Delinquent" : (secondHalfDue > 0 ? "Due" : "Paid"),
                                payment_type: "Semi-Annual", half_designation: "Second Half",
                                base_amount: taxDetails.second_half_tax,
                                amount_paid: taxDetails.second_half_paid,
                                amount_due: taxDetails.second_half_due,
                                paid_date: secondHalfDue === 0 ? (secondHalfPayment.payment_date || "N/A") : "",
                                due_date: secondHalfDates.due_date,
                                delq_date: secondHalfDates.delq_date,
                                land_value: valuations.land_value,
                                improvements: valuations.improvements,
                                total_assessed_value: valuations.total_assessed_value,
                                receipt_number: secondHalfDue === 0 ? (secondHalfPayment.batch_number || "N/A") : "N/A"
                            });
                        }
                        return taxHistory;
                    });
            } else {
                const taxHistory = [];
                if (firstHalfTax > 0 && secondHalfTax > 0) {
                    const firstHalfDates = calculateTaxDates(year, "First Half");
                    taxHistory.push({
                        jurisdiction: "County", year,
                        status: firstHalfDue > 0 && isDatePassed(firstHalfDates.delq_date) ? "Delinquent" : (firstHalfDue > 0 ? "Due" : "Paid"),
                        payment_type: "Semi-Annual", half_designation: "First Half",
                        base_amount: taxDetails.first_half_tax,
                        amount_paid: taxDetails.first_half_paid,
                        amount_due: taxDetails.first_half_due,
                        paid_date: "",
                        due_date: firstHalfDates.due_date,
                        delq_date: firstHalfDates.delq_date,
                        land_value: valuations.land_value,
                        improvements: valuations.improvements,
                        total_assessed_value: valuations.total_assessed_value,
                        receipt_number: "N/A"
                    });
                    const secondHalfDates = calculateTaxDates(year, "Second Half");
                    taxHistory.push({
                        jurisdiction: "County", year,
                        status: secondHalfDue > 0 && isDatePassed(secondHalfDates.delq_date) ? "Delinquent" : (secondHalfDue > 0 ? "Due" : "Paid"),
                        payment_type: "Semi-Annual", half_designation: "Second Half",
                        base_amount: taxDetails.second_half_tax,
                        amount_paid: taxDetails.second_half_paid,
                        amount_due: taxDetails.second_half_due,
                        paid_date: "",
                        due_date: secondHalfDates.due_date,
                        delq_date: secondHalfDates.delq_date,
                        land_value: valuations.land_value,
                        improvements: valuations.improvements,
                        total_assessed_value: valuations.total_assessed_value,
                        receipt_number: "N/A"
                    });
                } else {
                    const totalTax = firstHalfTax + secondHalfTax;
                    const totalPaid = firstHalfPaid + secondHalfPaid;
                    const totalDue = firstHalfDue + secondHalfDue;
                    const annualDates = calculateTaxDates(year, "Annual");
                    taxHistory.push({
                        jurisdiction: "County", year,
                        status: totalDue > 0 && isDatePassed(annualDates.delq_date) ? "Delinquent" : (totalDue > 0 ? "Due" : "Paid"),
                        payment_type: "Annual", half_designation: "",
                        base_amount: `$${totalTax.toFixed(2)}`,
                        amount_paid: `$${totalPaid.toFixed(2)}`,
                        amount_due: `$${totalDue.toFixed(2)}`,
                        paid_date: "",
                        due_date: annualDates.due_date,
                        delq_date: annualDates.delq_date,
                        land_value: valuations.land_value,
                        improvements: valuations.improvements,
                        total_assessed_value: valuations.total_assessed_value,
                        receipt_number: "N/A"
                    });
                }
                return taxHistory;
            }
        });
};

const processPaidYear = (page, year, valuations) => {
    return scrapeTaxYearDue(page)
        .then((taxDetails) => {
            if (!taxDetails) return [];
            return page.evaluate(() => {
                const link = document.querySelector('a[href="/Parcel/PaymentHistory"]');
                if (link) link.click();
            })
                .then(() => delay(4000))
                .then(() => page.waitForSelector('#PaymentBatches', { timeout: 15000, visible: true }))
                .then(() => delay(1000))
                .then(() => scrapePaymentHistory(page, year))
                .then((payments) => {
                    const firstHalfTax = parseFloat(taxDetails.first_half_tax.replace(/[^0-9.-]+/g, "")) || 0;
                    const secondHalfTax = parseFloat(taxDetails.second_half_tax.replace(/[^0-9.-]+/g, "")) || 0;
                    const firstHalfPaid = parseFloat(taxDetails.first_half_paid.replace(/[^0-9.-]+/g, "")) || 0;
                    const secondHalfPaid = parseFloat(taxDetails.second_half_paid.replace(/[^0-9.-]+/g, "")) || 0;
                    const firstHalfDue = parseFloat(taxDetails.first_half_due.replace(/[^0-9.-]+/g, "")) || 0;
                    const secondHalfDue = parseFloat(taxDetails.second_half_due.replace(/[^0-9.-]+/g, "")) || 0;
                    const taxHistory = [];

                    if (payments.length === 2) {
                        const firstHalfDates = calculateTaxDates(year, "First Half");
                        taxHistory.push({
                            jurisdiction: "County", year,
                            status: firstHalfDue > 0 && isDatePassed(firstHalfDates.delq_date) ? "Delinquent" : (firstHalfDue > 0 ? "Due" : "Paid"),
                            payment_type: "Semi-Annual", half_designation: "First Half",
                            base_amount: taxDetails.first_half_tax,
                            amount_paid: taxDetails.first_half_paid,
                            amount_due: taxDetails.first_half_due,
                            paid_date: payments[0].payment_date,
                            due_date: firstHalfDates.due_date,
                            delq_date: firstHalfDates.delq_date,
                            land_value: valuations.land_value,
                            improvements: valuations.improvements,
                            total_assessed_value: valuations.total_assessed_value,
                            receipt_number: payments[0].batch_number
                        });
                        const secondHalfDates = calculateTaxDates(year, "Second Half");
                        taxHistory.push({
                            jurisdiction: "County", year,
                            status: secondHalfDue > 0 && isDatePassed(secondHalfDates.delq_date) ? "Delinquent" : (secondHalfDue > 0 ? "Due" : "Paid"),
                            payment_type: "Semi-Annual", half_designation: "Second Half",
                            base_amount: taxDetails.second_half_tax,
                            amount_paid: taxDetails.second_half_paid,
                            amount_due: taxDetails.second_half_due,
                            paid_date: payments[1].payment_date,
                            due_date: secondHalfDates.due_date,
                            delq_date: secondHalfDates.delq_date,
                            land_value: valuations.land_value,
                            improvements: valuations.improvements,
                            total_assessed_value: valuations.total_assessed_value,
                            receipt_number: payments[1].batch_number
                        });
                    } else {
                        const totalTax = firstHalfTax + secondHalfTax;
                        const totalPaid = firstHalfPaid + secondHalfPaid;
                        const totalDue = firstHalfDue + secondHalfDue;
                        const annualDates = calculateTaxDates(year, "Annual");
                        taxHistory.push({
                            jurisdiction: "County", year,
                            status: totalDue > 0 && isDatePassed(annualDates.delq_date) ? "Delinquent" : (totalDue > 0 ? "Due" : "Paid"),
                            payment_type: "Annual", half_designation: "",
                            base_amount: `$${totalTax.toFixed(2)}`,
                            amount_paid: `$${totalPaid.toFixed(2)}`,
                            amount_due: `$${totalDue.toFixed(2)}`,
                            paid_date: payments[0]?.payment_date || "N/A",
                            due_date: annualDates.due_date,
                            delq_date: annualDates.delq_date,
                            land_value: valuations.land_value,
                            improvements: valuations.improvements,
                            total_assessed_value: valuations.total_assessed_value,
                            receipt_number: payments[0]?.batch_number || "N/A"
                        });
                    }
                    return taxHistory;
                });
        });
};

const processAllYears = (page, yearsToProcess, valuations, isAllPaid, currentIndex = 0, taxHistory = []) => {
    if (currentIndex >= yearsToProcess.length) return Promise.resolve(taxHistory);
    const year = yearsToProcess[currentIndex];
    const isLastYear = currentIndex === yearsToProcess.length - 1;

    return clickDueLinkForYear(page, year)
        .then(() => isAllPaid ? processPaidYear(page, year, valuations) : processUnpaidYear(page, year, valuations))
        .then((yearRecords) => {
            taxHistory = taxHistory.concat(yearRecords);
            if (!isLastYear) {
                return navigateBackToTaxSummary(page)
                    .then(() => processAllYears(page, yearsToProcess, valuations, isAllPaid, currentIndex + 1, taxHistory));
            }
            return taxHistory;
        });
};

const getTaxData = (page, parcelNumber) => {
    return performSearch(page, parcelNumber)
        .then(() => page.evaluate(() => !!document.querySelector('.addressblock')))
        .then((hasAddressBlock) => {
            if (!hasAddressBlock) return handleNotFound(parcelNumber);
            return scrapeOwnerInfo(page)
                .then((ownerInfo) => scrapeTaxSummary(page)
                    .then((taxSummary) => {
                        if (!taxSummary || taxSummary.length === 0) return handleNotFound(parcelNumber);
                        taxSummary.sort((a, b) => parseInt(b.year) - parseInt(a.year));
                        const unpaidYears = taxSummary.filter(y => hasAmountDue(y.due));
                        let yearsToProcess = [], isAllPaid = false;
                        if (unpaidYears.length > 0) {
                            yearsToProcess = unpaidYears.map(y => y.year);
                        } else {
                            yearsToProcess = [taxSummary[0].year];
                            isAllPaid = true;
                        }
                        return page.evaluate(() => {
                            const link = document.querySelector('a[href="/Parcel/Valuations"]');
                            if (link) link.click();
                        })
                            .then(() => delay(4000))
                            .then(() => page.waitForSelector('#Valuations', { timeout: 15000, visible: true }))
                            .then(() => delay(1000))
                            .then(() => scrapeValuations(page))
                            .then((valuations) => page.goto(page.url().replace('/Valuations', '/TaxSummary'), { waitUntil: 'load', timeout: 30000 })
                                .then(() => delay(2000))
                                .then(() => page.waitForSelector('#Grid tbody tr', { timeout: 20000, visible: true }))
                                .then(() => delay(1000))
                                .then(() => processAllYears(page, yearsToProcess, valuations, isAllPaid))
                                .then((taxHistory) => {
                                    const currentYear = new Date().getFullYear();
                                    const latestYear = taxSummary[0].year;
                                    const currentYearRecord = taxHistory.filter(r => r.year === currentYear.toString());
                                    const priorYears = taxHistory.filter(r => parseInt(r.year) < currentYear);

                                    let priorStatus = "ALL PRIORS ARE PAID";
                                    let currentStatus = "PAID";
                                    let hasPriorDelinquent = false;

                                    for (let rec of priorYears) {
                                        const due = parseFloat(rec.amount_due.replace(/[^0-9.-]+/g, "")) || 0;
                                        if (due > 0 && isDatePassed(rec.delq_date)) {
                                            hasPriorDelinquent = true;
                                            break;
                                        }
                                    }
                                    if (hasPriorDelinquent) priorStatus = "PRIORS ARE DELINQUENT";

                                    if (currentYearRecord.length > 0) {
                                        const totalDue = currentYearRecord.reduce((sum, r) => sum + (parseFloat(r.amount_due.replace(/[^0-9.-]+/g, "")) || 0), 0);
                                        const hasDelinquent = currentYearRecord.some(r => isDatePassed(r.delq_date) && (parseFloat(r.amount_due.replace(/[^0-9.-]+/g, "")) || 0) > 0);
                                        currentStatus = hasDelinquent ? "DELINQUENT" : (totalDue > 0 ? "DUE" : "PAID");
                                    }

                                    const paymentType = taxHistory.some(t => t.payment_type === "Semi-Annual") ? "SEMI-ANNUAL" : "ANNUAL";
                                    const normalDueDate = paymentType === "SEMI-ANNUAL" ? "10/01" : "10/01";

                                    const notes = `${priorStatus}, ${latestYear} TAXES ARE ${currentStatus}, NORMALLY TAXES ARE PAID ${paymentType}, NORMALLY DUE DATE IS ${normalDueDate}`;

                                    const hasDelinquent = taxHistory.some(r => {
                                        const due = parseFloat(r.amount_due.replace(/[^0-9.-]+/g, "")) || 0;
                                        return due > 0 && isDatePassed(r.delq_date);
                                    });
                                    const delinquencyStatus = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

                                    return {
                                        processed_date: new Date().toISOString().split('T')[0],
                                        owner_name: [ownerInfo.owner_name],
                                        property_address: "N/A",
                                        owner_address: ownerInfo.owner_address,
                                        parcel_number: parcelNumber,
                                        land_value: valuations.land_value,
                                        improvements: valuations.improvements,
                                        total_assessed_value: valuations.total_assessed_value,
                                        exemption: "$0.00",
                                        total_taxable_value: valuations.total_assessed_value,
                                        taxing_authority: "Cochise County Treasurer, Bisbee, AZ 85603",
                                        notes: notes,
                                        delinquent: delinquencyStatus,
                                        tax_history: taxHistory
                                    };
                                })
                            );
                    }));
        })
        .catch(() => handleNotFound(parcelNumber));
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;
    if (!fetch_type || !["html", "api"].includes(fetch_type)) {
        return res.status(400).send("Invalid request type.");
    }
    if (!account) {
        return res.status(400).send("Parcel number is required.");
    }

    let browserContext = null;
    getBrowserInstance()
        .then(browser => browser.createBrowserContext())
        .then(context => {
            browserContext = context;
            return context.newPage();
        })
        .then(page => {
            page.setDefaultNavigationTimeout(60000);
            return page.setRequestInterception(true)
                .then(() => {
                    page.on("request", (reqInt) => {
                        if (["stylesheet", "font", "image", "media"].includes(reqInt.resourceType())) {
                            reqInt.abort();
                        } else {
                            reqInt.continue();
                        }
                    });
                    return getTaxData(page, account);
                });
        })
        .then(data => {
            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
            } else {
                res.status(200).json({ result: data });
            }
        })
        .catch(error => {
            const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
            if (fetch_type === "html") {
                res.status(500).render('error_data', { error: true, message: errorMessage });
            } else {
                res.status(500).json({ error: true, message: errorMessage });
            }
        })
        .finally(() => {
            if (browserContext) browserContext.close();
        });
};

export { search };
