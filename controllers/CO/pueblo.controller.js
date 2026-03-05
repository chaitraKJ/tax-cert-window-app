//Author:- Nithyananda R S 
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = { timeout: 90000 };

const is_delq = (date) => {
    let today = new Date();
    let delq_date = new Date(date);
    if (today >= delq_date) {
        return true;
    }
    return false;
}

// Step 1: Navigate to property info page and check if property exists
const ac_1 = async (page, account) => {
    try {
        const url = `http://www.co.pueblo.co.us/cgi-bin/webatrallbroker.wsc/propertyinfo.p?par=${account}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        
        // Check if property exists
        await page.waitForSelector("#PropertySearchDetails", timeout_option);
        return true;
    } catch (error) {
        console.log(error);
        throw new Error("No Record Found or Page Load Error");
    }
}

// Step 2: Extract property information
const ac_2 = async (page, account) => {
    try {
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
                taxing_authority: "Pueblo County Treasurer, 215 W 10th St, Pueblo, CO 81003, Ph: (719) 583-6015",
                notes: "",
                delinquent: "NONE",
                tax_history: []
            };

            // Extract owner names
            const details = document.querySelector("#PropertySearchDetails");
            const dds = details?.querySelectorAll("dd");

            // Schedule/Parcel Number (first dd)
            datum['parcel_number'] = dds[0]?.textContent.trim() || "N/A";

            // Owner names (next 3 dds after "Name(s):")
            datum['owner_name'][0] = dds[1]?.textContent.trim() || "N/A";
            if (dds[2]?.textContent.trim()) {
                datum['owner_name'].push(dds[2].textContent.trim());
            }
            if (dds[3]?.textContent.trim()) {
                datum['owner_name'].push(dds[3].textContent.trim());
            }

            // Location Address
            datum['property_address'] = dds[4]?.textContent.trim() || "N/A";

            // Extract current tax amount (attempt)
            const taxTable = document.querySelector(".propertySearchTable tbody");
            const rows = taxTable?.querySelectorAll("tr");
            let totalTax = 0;
            
            for (let i = 1; i < rows?.length; i++) {
                const cells = rows[i].querySelectorAll("td");
                const taxAmount = parseFloat(cells[2]?.textContent.trim() || "0");
                totalTax += taxAmount;
            }

            datum['total_taxable_value'] = "N/A";
            datum['total_assessed_value'] = "N/A";

            return datum;
        });

        return page_data;
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
}

// Step 3: Navigate to tax history page
const ac_3 = async (page, data, account) => {
    try {
        const historyUrl = `http://www.co.pueblo.co.us/cgi-bin/webatrallbroker.wsc/t_info.p?parcel=${account}&compres=Additional%20Treasurer%20Information`;
        await page.goto(historyUrl, { waitUntil: "domcontentloaded" });

        await page.waitForSelector("#dTable", timeout_option);

        await page.waitForSelector('select[name="dTable_length"]', timeout_option);
        await page.select('select[name="dTable_length"]', '100');

        return data;
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
}

// Step 4: Extract tax history data
const ac_4 = async (page, data, account) => {
    try {
        const tax_history_data = await page.evaluate(() => {
            const tax_data = {};
            
            const rows = document.querySelectorAll("#dTable tbody tr");
            
            let current_year = null;

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                if (row.classList.contains("table-group")) {
                    current_year = row.querySelector("td")?.textContent.trim();
                    tax_data[current_year] = { year: current_year, entries: [] };
                    continue;
                }

                if (!current_year) continue;

                const cells = row.querySelectorAll("td");
                if (cells.length < 8) continue;

                const entry = {
                    type: cells[0]?.textContent.trim(),
                    due_pay_date: cells[1]?.textContent.trim(),
                    code: cells[2]?.textContent.trim(),
                    tax_district: cells[3]?.textContent.trim(),
                    gross_tax: cells[4]?.textContent.trim(),
                    interest: cells[5]?.textContent.trim(),
                    amount: cells[6]?.textContent.trim(),
                    balance: cells[7]?.textContent.trim(),
                    paid_by: cells[8]?.textContent.trim()
                };

                tax_data[current_year].entries.push(entry);
            }

            return tax_data;
        });

        return { data: data, tax_history_data: tax_history_data };
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
}

// Step 5: Process and format tax history
const ac_5 = async (page, main_data, account) => {
    try {
        const data = main_data.data;
        const tax_history_data = main_data.tax_history_data;

        const formatted_history = [];
        let max_year = 0;
        let has_delinquent = false;
        let has_tax_sale = false;
        let latest_year_status = "";

        // Get current year
        const current_year = new Date().getFullYear();
        const five_years_ago = current_year - 4; // Last 5 years including current

        for (const year in tax_history_data) {
            const year_num = parseInt(year);
            
            // Only process last 5 years
            if (year_num < five_years_ago) {
                continue;
            }

            if (year_num > max_year) max_year = year_num;

            const entries = tax_history_data[year].entries;
            let year_total_due = 0;
            let year_total_paid = 0;
            let payment_schedule = "";
            let due_entries = [];
            let payment_entries = [];

            let has_tax_sale_payment = entries.some(entry => 
                entry.type === "Payment" && entry.paid_by && entry.paid_by.toLowerCase().includes("tax sale")
            );

            for (const entry of entries) {
                if (entry.type === "Due") {
                    due_entries.push(entry);
                    const amount = parseFloat(entry.amount.replace(/[^0-9.-]/g, ''));
                    if (!isNaN(amount)) {
                        year_total_due += amount;
                    }
                } else if (entry.type === "Payment") {
                    payment_entries.push(entry);
                    const amount = parseFloat(entry.amount.replace(/[^0-9.-]/g, ''));
                    if (!isNaN(amount)) {
                        year_total_paid += Math.abs(amount);
                    }
                }
            }

            const real_payments = payment_entries.filter(e => e.code.includes("REAL"));
            if (real_payments.length === 1) {
                payment_schedule = "Annual";
            } else if (real_payments.length >= 2) {
                payment_schedule = "Semi-Annual";
            }

            const balance = year_total_due - year_total_paid;
            
            if (balance > 0.01 || year_total_paid > 0) {  // Include paid years too for processing
                const history_entry = {
                    jurisdiction: "County",
                    year: year,
                    payment_type: payment_schedule || "Annual",
                    status: balance > 0.01 ? "Due" : "Paid",
                    base_amount: `$${year_total_due.toFixed(2)}`,
                    amount_paid: `$${year_total_paid.toFixed(2)}`,
                    amount_due: balance > 0.01 ? `$${balance.toFixed(2)}` : "$0.00",
                    mailing_date: "N/A",
                    due_date: `12/31/${year}`,
                    delq_date: `01/01/${year_num + 1}`,
                    paid_date: "",
                    good_through_date: ""
                };

                if (payment_entries.length > 0) {
                    const last_payment = payment_entries[payment_entries.length - 1];
                    history_entry.paid_date = last_payment?.due_pay_date.trim() || "";
                }

                // FIXED: If there was a tax sale payment for this year, mark as delinquent regardless of balance
                if (has_tax_sale_payment) {
                    history_entry.status = "Delinquent";
                    has_delinquent = true;
                    has_tax_sale = true;
                } else if (balance > 0.01 && is_delq(history_entry.delq_date)) {
                    // Only check balance and delq_date if there was NO tax sale
                    history_entry.status = "Delinquent";
                    has_delinquent = true;
                }

                if (year_num === max_year) {
                    latest_year_status = history_entry.status;
                }

                formatted_history.push(history_entry);
            }
        }

        // Sort by year descending
        formatted_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        // Define unpaid_years
        const unpaid_years = formatted_history.filter(entry => entry.status !== "Paid");
        const delinquent_years = formatted_history.filter(entry => entry.status === "Delinquent");

        // If there are any delinquent years, show all delinquent years
        // Otherwise, show the latest paid year
        if (delinquent_years.length > 0) {
            data.tax_history = delinquent_years;
        } else if (unpaid_years.length > 0) {
            data.tax_history = unpaid_years;
        } else {
            // All paid, show only the latest year
            const latest_year_entry = formatted_history.length > 0 ? formatted_history[0] : null;
            data.tax_history = latest_year_entry ? [latest_year_entry] : [];
        }

        // Notes logic
        if (delinquent_years.length > 0) {
            data.notes = "PRIORS ARE DELINQUENT";
        } else if (unpaid_years.length > 0) {
            data.notes = "TAXES ARE CURRENT";
        } else {
            data.notes = "ALL PRIORS ARE PAID";
        }

        if (max_year > 0) {
            const max_year_entry = formatted_history.find(e => parseInt(e.year) === max_year);
            if (max_year_entry) {
                data.notes += `, ${max_year} TAXES ARE ${latest_year_status.toUpperCase()}`;
                data.notes += `, NORMALLY TAXES ARE PAID ${max_year_entry.payment_type.toUpperCase()}`;
            }
        }

        data.notes += `. NORMAL DUE DATE IS 12/31`;

        // Set delinquent status based on current tax_history status
        if (data.tax_history.length > 0 && data.tax_history.every(entry => entry.status === "Paid")) {
            // All entries in tax_history are Paid
            data.delinquent = "NONE";
        } else if (has_delinquent) {
            if (has_tax_sale) {
                data.delinquent = "TAXES WENT TO TAX SALE, PROPERTY MAY HAVE BEEN SOLD";
            } else {
                data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
            }
        } else {
            data.delinquent = "NONE";
        }

        return data;
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
}

// Main account search function
const account_search = async (page, account) => {
    try {
        await ac_1(page, account);
        const data = await ac_2(page, account);
        const data_with_url = await ac_3(page, data, account);
        const main_data = await ac_4(page, data_with_url, account);
        const final_data = await ac_5(page, main_data, account);
        return final_data;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

// Main search function
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render('error_data', { error: true, message: "Invalid Access" });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
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
                    res.status(200).render('error_data', { error: true, message: error.message });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type === "api") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({ result: data });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({ error: true, message: error.message });
                })
                .finally(async () => {
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message || "Server Error" });
        } else if (fetch_type === "api") {
            res.status(500).json({ error: true, message: error.message || "Server Error" });
        }
    }
}

export { search };
