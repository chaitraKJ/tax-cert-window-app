// AUTHOR: DHANUSH 
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = {
    timeout: 90000
};

const cuyahogaConfig = {
    taxing_authority: "Cuyahoga County Fiscal Office, 2079 East 9th Street, Cleveland, OH 44115, Ph: 216-443-7010",
    dueDates: {
        due1: "02/20",
        delq1: "02/21",
        due2: "07/17",
        delq2: "07/18"
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    return today >= delq_date;
}

// STEP 1: SEARCH FOR PARCEL AND CLICK ON RESULT
const cuyahoga_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://myplace.cuyahogacounty.gov/`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.waitForSelector('#txtData', timeout_option);
            await page.waitForSelector('#Parcel', timeout_option);
            await page.click('#Parcel');
            await delay(1000);
            await page.type('#txtData', account);
            await delay(1000);
            await Promise.all([
                page.click('#btnSearch'),
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
            ]);
            await delay(2000);
            const hasResults = await page.evaluate(() => {
                const addressInfo = document.querySelector('#AddressInfo')?.textContent.trim();
                return addressInfo && addressInfo.includes("No results found");
            });
            if (hasResults) {
                throw new Error("No Record Found");
            }
            await page.waitForSelector('#AddressInfo a.btn', timeout_option);
            
            await page.evaluate(() => {
                const firstButton = document.querySelector('#AddressInfo a.btn');
                if (firstButton) {
                    firstButton.click();
                }
            });
            await delay(3000);
            await page.waitForSelector('#mainRight', { visible: true, timeout: 10000 });
            
            resolve(true);
        }
        catch(error){
            console.log("cuyahoga_1 error:", error);
            reject(new Error(error.message));
        }
    });
}

// STEP 2: EXTRACT BASIC PROPERTY DATA
const cuyahoga_2 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Wait for the address block instead of non-existing header
            await page.waitForSelector('#SelectedAddressInfo', { timeout: 30000 });

            const property_data = await page.evaluate((config) => {
                const datum = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "$0.00",
                    improvements: "$0.00",
                    total_assessed_value: "$0.00",
                    exemption: "",
                    total_taxable_value: "$0.00",
                    taxing_authority: config.taxing_authority,
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                const selectedInfo = document.querySelector('#SelectedAddressInfo');
                if (selectedInfo) {
                    const items = Array.from(selectedInfo.querySelectorAll('li'))
                        .map(li => li.textContent.trim())
                        .filter(text => text.length > 0);

                    if (items.length >= 1) datum.parcel_number = items[0];
                    if (items.length >= 2) datum.owner_name = [items[1]];
                    if (items.length >= 3) datum.property_address = items[2];
                    if (items.length >= 4) {
                        // combine city, state, zip if present
                        datum.property_address += `, ${items[3]}`;
                    }
                }

                // Fallback: if still empty, try hidden inputs
                if (!datum.parcel_number) {
                    datum.parcel_number = document.querySelector('#hdnParcelId')?.value || '';
                }
                if (datum.owner_name.length === 0) {
                    datum.owner_name = [document.querySelector('#hdnSearchDeededOwner')?.value || 'UNKNOWN OWNER'];
                }
                if (!datum.property_address) {
                    datum.property_address = document.querySelector('#hdnSearchPhysicalAddress')?.value || '';
                    const city = document.querySelector('#hdnSearchParcelCity')?.value || '';
                    const zip = document.querySelector('#hdnSearchParcelZip')?.value || '';
                    if (city && zip) datum.property_address += `, ${city}, OH ${zip}`;
                }

                return datum;
            }, cuyahogaConfig);

            // Proceed to tax history page
            await Promise.all([
                page.click('#btnLgcyTaxes'),
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
            ]);

            await delay(2000); // give tax page a moment to settle

            resolve(property_data);
        }
        catch (error) {
            console.log("cuyahoga_2 error:", error);
            reject(new Error(error.message));
        }
    });
};
// STEP 3: NAVIGATE TO TAX BILL AND EXTRACT YEAR DATA (FIXED - LIMIT LOOP TO REQUESTED YEARS + BUFFER FOR DELINQUENT CHECK)
const cuyahoga_3 = async (page, data, account, yearsRequested) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector('#btnLgcyTaxes', { timeout: timeout_option.timeout });
            
            
            await page.waitForSelector('#ddlTaxYear', timeout_option);
            // Get all years
            const years = await page.evaluate(() => {
                const list = [];
                const select = document.querySelector('#ddlTaxYear');
                if (!select) return list;
                const options = select.querySelectorAll('option');
                options.forEach(opt => {
                    const text = opt.textContent.trim();
                    const match = text.match(/^(\d{4})/);
                    if (match) {
                        list.push({ value: opt.value, year: match[1] });
                    }
                });
                return list;
            });
            if (years.length === 0) throw new Error("No tax years available");
            const sortedYears = years
                .map(y => ({ ...y, yearNum: parseInt(y.year) }))
                .filter(y => !isNaN(y.yearNum))
                .sort((a, b) => b.yearNum - a.yearNum); // newest first
            // Limit to latest requested years + a buffer (e.g., 5 extra) for potential delinquent check
            const buffer = 5; // Adjust if needed
            const limitedYears = sortedYears.slice(0, yearsRequested + buffer);
            const status_data = {};
            let latestYearLabel = null; 
            const delinquentYears = new Set();
            const parse = (s) => parseFloat((s || "$0").replace(/[$,]/g, "")) || 0;
            // LOOP THROUGH LIMITED YEARS
            for (const yearInfo of limitedYears) {
                const year = yearInfo.year;
                await page.select('#ddlTaxYear', yearInfo.value);
                await delay(3000);
                const yearData = await page.evaluate(() => {
                    const data = {
                        land_value: "$0",
                        building_value: "$0",
                        total_assessed: "$0",
                        first_half_net: "$0",
                        second_half_net: "$0",
                        charge_payment_details: []
                    };
                    const taxDataBody = document.querySelector('.taxDataBody');
                    if (!taxDataBody) return data;
                    const tables = taxDataBody.querySelectorAll('table');
                    if (tables[0]) {
                        const rows = tables[0].querySelectorAll('tr');
                        rows.forEach(row => {
                            const label = row.querySelector('.LabelBo')?.textContent?.trim();
                            const value = row.querySelector('.DataBo, .DataTotalBo, .DataSubTotalBo')?.textContent?.trim();
                            if (label === 'Land Value' && value) data.land_value = value;
                            if (label === 'Building Value' && value) data.building_value = value;
                            if (label === 'Total Value' && value) data.total_assessed = value;
                            if (label === 'Half Year Net Taxes' && value) data.first_half_net = value;
                        });
                    }
                    if (tables[1]) {
                        const rows = tables[1].querySelectorAll('tr');
                        rows.forEach(row => {
                            const label = row.querySelector('.LabelBo')?.textContent?.trim();
                            const value = row.querySelector('.DataBo, .DataTotalBo, .DataSubTotalBo')?.textContent?.trim();
                            if (label === 'Half Year Net Taxes' && value) data.second_half_net = value;
                        });
                    }
                    const detailTable = taxDataBody.querySelector('.ChargeAndPaymentDetailTable');
                    if (detailTable) {
                        const rows = detailTable.querySelectorAll('tr');
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length === 5) {
                                const type = cells[1]?.textContent?.trim().toLowerCase();
                                if (type && (type.includes('1st half') || type.includes('2nd half'))) {
                                    data.charge_payment_details.push({
                                        type,
                                        charges: cells[2]?.textContent?.trim() || '$0',
                                        payments: cells[3]?.textContent?.trim() || '$0',
                                        balance: cells[4]?.textContent?.trim() || '$0'
                                    });
                                }
                            }
                        });
                    }
                    return data;
                });
                const firstHalfNet = parse(yearData.first_half_net);
                const secondHalfNet = parse(yearData.second_half_net);
                // SKIP YEARS WITH NO TAX DATA
                if (firstHalfNet === 0 && secondHalfNet === 0) continue;
                const yearNum = parseInt(year);
                const dueYear = yearNum + 1;
                const yearLabel = `${year}-${dueYear}`;
                // Set latestYearLabel to first year with actual tax data
                if (!latestYearLabel) {
                    latestYearLabel = yearLabel;
                    // Update property values from this year
                    if (yearData.total_assessed !== "$0" && yearData.total_assessed !== "$") {
                        data.land_value = yearData.land_value;
                        data.improvements = yearData.building_value;
                        data.total_assessed_value = yearData.total_assessed;
                        data.total_taxable_value = yearData.total_assessed;
                    }
                }
                // CHECK IF THIS YEAR HAS ANY DELINQUENT INSTALLMENTS
                let isDelinquent = false;
                for (const detail of yearData.charge_payment_details) {
                    const balance = parse(detail.balance);
                    if (balance > 0) {
                        const dueDate = detail.type.includes('1st half')
                            ? `${cuyahogaConfig.dueDates.delq1}/${dueYear}`
                            : `${cuyahogaConfig.dueDates.delq2}/${dueYear}`;
                        
                        if (is_delq(dueDate)) {
                            isDelinquent = true;
                            break;
                        }
                    }
                }
                if (isDelinquent) {
                    delinquentYears.add(yearLabel);
                }
                status_data[year] = {
                    base_amount: `$${(firstHalfNet + secondHalfNet).toFixed(2)}`,
                    year_data: yearData,
                    year_label: yearLabel
                };
            }
            if (!latestYearLabel) {
                throw new Error("No tax data available for any year");
            }
            resolve({
                data,
                status_data,
                latest_year_label: latestYearLabel,
                delinquent_years: delinquentYears
            });
        } catch (error) {
            console.log("cuyahoga_3 error:", error);
            reject(new Error(error.message));
        }
    });
};

// STEP 4: EXTRACT CHARGE AND PAYMENT DETAILS + FILTER YEARS
const cuyahoga_4 = async (page, main_data, account, yearsRequested) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { status_data, latest_year_label, delinquent_years } = main_data;
            const parse = (s) => parseFloat((s || "$0").replace(/[$,]/g, "")) || 0;
            const formatMoney = (num) => {
                return '$' + Number(num).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            };
            // Get all years with data, sorted newest to oldest
            const allYears = Object.keys(status_data).sort((a, b) => b - a);
            
            // Get latest N years
            const latestNYears = allYears.slice(0, yearsRequested);
            
            // Combine: latest N years + any delinquent prior years
            const yearsToInclude = new Set(latestNYears);
            
            delinquent_years.forEach(yearLabel => {
                const yearNum = parseInt(yearLabel.split('-')[0]);
                yearsToInclude.add(yearNum.toString()); // Add as string to match keys
            });
            
            // Build history only for included years
            for (const year of allYears) {
                if (!yearsToInclude.has(year)) {
                    delete status_data[year]; // Remove years we don't need
                    continue;
                }
                const yearInfo = status_data[year];
                const history = [];
                const yearData = yearInfo.year_data;
                const yearLabel = yearInfo.year_label;
                const firstHalfNet = parse(yearData.first_half_net);
                const secondHalfNet = parse(yearData.second_half_net);
                const details = yearData.charge_payment_details || [];
                const firstHalfDetail = details.find(d => d.type.includes('1st half'));
                const secondHalfDetail = details.find(d => d.type.includes('2nd half'));
                // Process First Half
                if (firstHalfNet > 0) {
                    let firstHalfPaid = 0;
                    let firstHalfDue = firstHalfNet;
                    let firstHalfStatus = "Due";
                    if (firstHalfDetail) {
                        const detailPayments = parse(firstHalfDetail.payments);
                        const detailBalance = parse(firstHalfDetail.balance);
                        
                        if (detailPayments > 0 && detailBalance === 0) {
                            firstHalfPaid = firstHalfNet;
                            firstHalfDue = 0;
                            firstHalfStatus = "Paid";
                        } else if (detailPayments >= firstHalfNet) {
                            firstHalfPaid = firstHalfNet;
                            firstHalfDue = 0;
                            firstHalfStatus = "Paid";
                        } else if (detailPayments > 0) {
                            firstHalfPaid = detailPayments;
                            firstHalfDue = firstHalfNet - detailPayments;
                            firstHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq1}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                        } else {
                            firstHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq1}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                        }
                    } else {
                        firstHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq1}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                    }
                    history.push({
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        status: firstHalfStatus,
                        base_amount: formatMoney(firstHalfNet),
                        amount_paid: formatMoney(firstHalfPaid),
                        amount_due: formatMoney(firstHalfDue),
                        due_date: `${cuyahogaConfig.dueDates.due1}/${parseInt(year) + 1}`,
                        delq_date: `${cuyahogaConfig.dueDates.delq1}/${parseInt(year) + 1}`,
                        paid_date: firstHalfStatus === "Paid" ? "N/A" : "-",
                        mailing_date: "N/A",
                        good_through_date: "",
                        installment: "1"
                    });
                }
                // Process Second Half
                if (secondHalfNet > 0) {
                    let secondHalfPaid = 0;
                    let secondHalfDue = secondHalfNet;
                    let secondHalfStatus = "Due";
                    if (secondHalfDetail) {
                        const detailPayments = parse(secondHalfDetail.payments);
                        const detailBalance = parse(secondHalfDetail.balance);
                        
                        if (detailPayments > 0 && detailBalance === 0) {
                            secondHalfPaid = secondHalfNet;
                            secondHalfDue = 0;
                            secondHalfStatus = "Paid";
                        } else if (detailPayments >= secondHalfNet) {
                            secondHalfPaid = secondHalfNet;
                            secondHalfDue = 0;
                            secondHalfStatus = "Paid";
                        } else if (detailPayments > 0) {
                            secondHalfPaid = detailPayments;
                            secondHalfDue = secondHalfNet - detailPayments;
                            secondHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq2}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                        } else {
                            secondHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq2}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                        }
                    } else {
                        secondHalfStatus = is_delq(`${cuyahogaConfig.dueDates.delq2}/${parseInt(year) + 1}`) ? "Delinquent" : "Due";
                    }
                    history.push({
                        jurisdiction: "County",
                        year: yearLabel,
                        payment_type: "Semi-Annual",
                        status: secondHalfStatus,
                        base_amount: formatMoney(secondHalfNet),
                        amount_paid: formatMoney(secondHalfPaid),
                        amount_due: formatMoney(secondHalfDue),
                        due_date: `${cuyahogaConfig.dueDates.due2}/${parseInt(year) + 1}`,
                        delq_date: `${cuyahogaConfig.dueDates.delq2}/${parseInt(year) + 1}`,
                        paid_date: secondHalfStatus === "Paid" ? "N/A" : "-",
                        mailing_date: "N/A",
                        good_through_date: "",
                        installment: "2"
                    });
                }
                yearInfo.history = history;
            }
            resolve({
                data: main_data.data,
                history_data: status_data,
                latest_year_label,
                delinquent_years
            });
        }
        catch(error){
            console.log("cuyahoga_4 error:", error);
            reject(new Error(error.message));
        }
    });
}

// STEP 5: FINALIZE DATA WITH NOTES
const cuyahoga_5 = async (page, main_data, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { history_data, latest_year_label, delinquent_years } = main_data;
            const main_history_data = [];
            let hasDelinquent = false;
            const years_sorted = Object.keys(history_data).sort((a, b) => parseInt(a) - parseInt(b));
            // Build main_history_data
            for (const year of years_sorted) {
                const yearInfo = history_data[year];
                const history = yearInfo.history;
                history.forEach((h) => {
                    if (h.status === "Delinquent") {
                        hasDelinquent = true;
                    }
                    main_history_data.push(h);
                });
            }
            // Build notes
            const noteParts = [];
            if (!latest_year_label) {
                noteParts.push("NO TAX DATA AVAILABLE");
            } else {
                const yearItems = main_history_data.filter(t => t.year === latest_year_label);
                const first = yearItems.find(t => t.installment === "1");
                const second = yearItems.find(t => t.installment === "2");
                const latestYearNum = parseInt(latest_year_label.split('-')[0]);
                const hasPriorDelq = Array.from(delinquent_years).some(yearLabel => {
                    const yearNum = parseInt(yearLabel.split('-')[0]);
                    return yearNum < latestYearNum;
                });
                if (hasPriorDelq) {
                    noteParts.push("PRIOR YEARS TAXES ARE DELINQUENT");
                } else {
                    noteParts.push("ALL PRIORS ARE PAID");
                }
                if (first && second) {
                    const s1 = first.status.toUpperCase();
                    const s2 = second.status.toUpperCase();
                    noteParts.push(`${latest_year_label}: 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`);
                } else if (first) {
                    noteParts.push(`${latest_year_label}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}`);
                } else if (second) {
                    noteParts.push(`${latest_year_label}: 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
                }
            }
            noteParts.push(`NORMALLY TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE ${cuyahogaConfig.dueDates.due1} & ${cuyahogaConfig.dueDates.due2}`);
            main_data.data.notes = noteParts.join(", ");
            main_data.data.delinquent = hasDelinquent
                ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
                : "NONE";
            main_data.data.tax_history = main_history_data;
            resolve(main_data.data);
        }
        catch(error){
            console.log("cuyahoga_5 error:", error);
            reject(new Error(error.message));
        }
    });
}

// MAIN SEARCH FUNCTION
const parcel_search = async (page, account, yearsRequested) => {
    return new Promise(async (resolve, reject) => {
        try{
            cuyahoga_1(page, account)
            .then(() => {
                cuyahoga_2(page, account)
                .then((data1) => {
                    cuyahoga_3(page, data1, account, yearsRequested)
                    .then((data2) => {
                        cuyahoga_4(page, data2, account, yearsRequested)
                        .then((data3) => {
                            cuyahoga_5(page, data3, account)
                            .then((data4) => {
                                resolve(data4);
                            })
                            .catch((error) => {
                                console.log(error);
                                reject(error);
                            })
                        })
                        .catch((error) => {
                            console.log(error);
                            reject(error);
                        })
                    })
                    .catch((error) => {
                        console.log(error);
                        reject(error);
                    })
                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                })
            })
            .catch((error) => {
                console.log(error);
                reject(error);
            })
        }
        catch(error){
            console.log(error);
            reject(new Error(error.message));
        }
    })
}

// CONTROLLER FUNCTION
const search = async (req, res) => {
    const { fetch_type, account, client } = req.body;
    
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
        let yearsRequested = getOHCompanyYears(client);
        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        if (fetch_type === "html") {
            parcel_search(page, account, yearsRequested)
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
        }
        else if (fetch_type === "api") {
            parcel_search(page, account, yearsRequested)
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
    }
    catch(error){
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type === "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

module.exports = {
    search
}