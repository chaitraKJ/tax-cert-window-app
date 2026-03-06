//Author:Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = { timeout: 90000 };

const is_delq = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date();
    const delqDate = new Date(dateStr);
    return today >= delqDate;
};

const formatCurrency = (value) => {
    if (!value || value === "N/A" || value === "0" || value === "0.00") return "N/A";
    const num = parseFloat(value.toString().replace(/[$,]/g, ""));
    if (isNaN(num)) return "N/A";
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
};

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "N/A") return "";
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        let [month, day, year] = parts;
        year = year.length === 2 ? '20' + year : year;
        const d = new Date(year, month - 1, day);
        if (!isNaN(d)) {
            return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        }
    }
    return "";
};

// Step 1: Search page
const sc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://treasurer.summitcounty.org/treasurer/web/login.jsp`;
            await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector('input[type="submit"][value="Login"]', timeout_option);
            await Promise.all([
                page.click('input[type="submit"][value="Login"]'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 })
            ]);

            await page.waitForSelector('input#TaxAccountId', timeout_option);
            await page.locator('input#TaxAccountId').fill(account);

            await page.waitForSelector('input[type="submit"][value="Search for Accounts"]', timeout_option);
            await Promise.all([
                page.locator('input[type="submit"][value="Search for Accounts"]').click(),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            const noAccounts = await page.evaluate(() => document.body.textContent.includes("No accounts found"));
            if (noAccounts) {
                reject(new Error("Invalid account number: No accounts found"));
                return;
            }

            const hasResults = await page.$('#searchResultsTable');
            if (!hasResults) {
                reject(new Error("No search results table found"));
                return;
            }

            resolve(true);
        } catch (err) {
            reject(err);
        }
    });
};

// Step 2: Open account
const sc_2 = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector('#searchResultsTable a[href*="account.jsp?account="]', timeout_option);
            const link = await page.$('#searchResultsTable a[href*="account.jsp?account="]');
            await Promise.all([
                link.click(),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            if (page.url().includes("account.jsp")) {
                resolve(true);
            } else {
                reject(new Error("Failed to load account detail page"));
            }
        } catch (err) {
            reject(err);
        }
    });
};

// Step 3: Summary extraction
const sc_3 = async (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector('#taxAccountSummary', timeout_option);

            const data = await page.evaluate(() => {
                const datum = {
                    processed_date: new Date().toLocaleDateString(),
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "N/A",
                    parcel_number: "",
                    situs_address: "N/A",
                    legal_description: "N/A",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "Summit County Treasurer, 60 N Main St, Coalville, UT 84017, Ph: 435-336-3267",
                    notes: "",
                    delinquent: "NONE",
                    tax_history: []
                };

                const rows = document.querySelectorAll('#taxAccountSummary table tr');
                let collectingOwners = false;
                let ownerLines = [];

                rows.forEach(row => {
                    const labelTd = row.querySelector('td.label');
                    const valueTd = row.querySelector('td:not(.label)');

                    if (labelTd && valueTd) {
                        const label = labelTd.textContent.trim().toLowerCase().replace(/[\u00A0\s]+/g, ' ');
                        const value = valueTd.textContent.trim().replace(/[\u00A0\s]+/g, ' ');

                        if (label.includes('account id')) {
                            datum.parcel_number = value;
                        } else if (label.includes('owners')) {
                            ownerLines.push(value);
                            collectingOwners = true;
                        } else if (label.includes('address') && !label.includes('situs')) {
                            datum.property_address = value;
                        } else if (label.includes('situs address')) {
                            datum.situs_address = value;
                        } else if (label.includes('legal')) {
                            datum.legal_description = value;
                        }
                    } else if (collectingOwners && valueTd) {
                        const extra = valueTd.textContent.trim().replace(/[\u00A0\s]+/g, ' ');
                        if (extra) ownerLines.push(extra);
                    } else {
                        collectingOwners = false;
                    }
                });

                datum.owner_name = ownerLines;

                return datum;
            });

            resolve(data);
        } catch (err) {
            reject(err);
        }
    });
};

// Step 4: Values and billing
const sc_4 = async (page, baseData) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector('a[href*="action=billing"]', timeout_option);
            await Promise.all([
                page.click('a[href*="action=billing"]'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            await page.waitForSelector('table.account.stripe', timeout_option);

            const values = await page.evaluate(() => {
                const data = {
                    land_value: "0",
                    improvements: "0",
                    total_assessed_value: "0",
                    total_taxable_value: "0",
                };

                const assessmentRows = Array.from(document.querySelectorAll('table.account.stripe tbody tr'));
                assessmentRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 4) {
                        const code = cells[0].textContent.trim();
                        const assessedStr = cells[3].textContent.trim().replace(/[$,]/g, '');
                        const assessed = parseFloat(assessedStr) || 0;

                        if (code.includes('RESIDENTIAL PRIMARY IMPROVED')) {
                            data.land_value = assessed;
                        } else if (code.includes('RESIDENTIAL PRIMARY')) {
                            data.improvements = assessed;
                        } else if (code.toLowerCase().includes('total')) {
                            data.total_assessed_value = assessed;
                        }
                    }
                });

                data.total_taxable_value = data.total_assessed_value;

                return data;
            });

            baseData.land_value = formatCurrency(values.land_value);
            baseData.improvements = formatCurrency(values.improvements);
            baseData.total_assessed_value = formatCurrency(values.total_assessed_value);
            baseData.total_taxable_value = formatCurrency(values.total_taxable_value);

            resolve(baseData);
        } catch (err) {
            reject(err);
        }
    });
};

// Step 5: Transactions (FIXED VERSION)
const sc_5 = async (page, baseData) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.waitForSelector('a[href*="action=tx"]', timeout_option);
            await Promise.all([
                page.click('a[href*="action=tx"]'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            await page.waitForSelector('table.account.stripe', timeout_option);

            const txData = await page.evaluate(() => {
                const formatCurrency = (value) => {
                    if (!value || value === "N/A" || value === "0" || value === "0.00") return "N/A";
                    const num = parseFloat(value.toString().replace(/[$,]/g, ""));
                    if (isNaN(num)) return "N/A";
                    return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    }).format(num);
                };

                const formatDate = (dateStr) => {
                    if (!dateStr || dateStr === "N/A") return "";
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        let [month, day, year] = parts;
                        year = year.length === 2 ? '20' + year : year;
                        const d = new Date(year, month - 1, day);
                        if (!isNaN(d)) {
                            return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
                        }
                    }
                    return "";
                };

                const is_delq = (dateStr) => {
                    if (!dateStr) return false;
                    const today = new Date();
                    const delqDate = new Date(dateStr);
                    return today >= delqDate;
                };

                const currentYear = new Date().getFullYear();
                let hasDelinquent = false;
                const years = {};

                // Get summary table data (shows what's due)
                const summaryRows = Array.from(document.querySelectorAll('table tbody tr'));
                const summary = {};
                
                summaryRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 8) {
                        const yearStr = cells[0].textContent.trim();
                        const taxDue = parseFloat(cells[1].textContent.replace(/[$,]/g, '') || 0);
                        const interestDue = parseFloat(cells[2].textContent.replace(/[$,]/g, '') || 0);
                        const penaltyDue = parseFloat(cells[3].textContent.replace(/[$,]/g, '') || 0);
                        const totalDue = parseFloat(cells[7].textContent.replace(/[$,]/g, '') || 0);
                        
                        const year = parseInt(yearStr);
                        if (!isNaN(year)) {
                            summary[year] = { taxDue, interestDue, penaltyDue, totalDue };
                        }
                    }
                });

                // Get transaction details
                const txRows = Array.from(document.querySelectorAll('table.account.stripe tbody tr'));

                txRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return;

                    const yearStr = cells[0].textContent.trim();
                    const type = cells[1].textContent.trim();
                    const date = cells[2].textContent.trim();
                    const amountStr = cells[3].textContent.trim().replace(/[$,]/g, '');
                    const amount = parseFloat(amountStr) || 0;

                    const year = parseInt(yearStr);
                    if (isNaN(year)) return;

                    if (!years[year]) {
                        years[year] = {
                            charge: 0,
                            payments: [],
                            penalties: 0,
                            interests: 0,
                            paid_date: ""
                        };
                    }

                    if (type.includes('Tax Charge')) {
                        years[year].charge = amount;
                    } else if (type.includes('Tax Payment')) {
                        years[year].payments.push({ date, amount });
                        years[year].paid_date = date;
                    } else if (type.includes('Penalty')) {
                        if (type.includes('Payment')) {
                            years[year].payments.push({ date, amount });
                        } else {
                            years[year].penalties += amount;
                        }
                    } else if (type.includes('Interest')) {
                        if (type.includes('Payment')) {
                            years[year].payments.push({ date, amount });
                        } else {
                            years[year].interests += amount;
                        }
                    }
                });

                const taxHistory = [];

                // Find latest year with charge
                const allYears = Object.keys(years).map(Number).sort((a, b) => b - a);
                const latestYear = allYears.length > 0 ? allYears[0] : currentYear;

                // Process each year
                Object.entries(years).sort((a, b) => b[0] - a[0]).forEach(([yearStr, info]) => {
                    const year = parseInt(yearStr);
                    const totalPaid = info.payments.reduce((sum, p) => sum + p.amount, 0);
                    
                    // Use summary table to determine what's due
                    const summaryInfo = summary[year];
                    const amountDue = summaryInfo ? summaryInfo.totalDue : 0;
                    const isPaid = amountDue <= 0.01;

                    const dueDate = `12/01/${year}`;
                    const delqDate = `12/02/${year}`;
                    const isDelinquent = !isPaid && is_delq(delqDate);

                    if (isDelinquent) hasDelinquent = true;

                    // INCLUDE ONLY:
                    // 1. Latest year (mandatory)
                    // 2. Any delinquent years (unpaid and past due date)
                    const shouldInclude = year === latestYear || isDelinquent;

                    if (shouldInclude) {
                        taxHistory.push({
                            jurisdiction: "County",
                            year: yearStr,
                            payment_type: "Annual",
                            status: isPaid ? "Paid" : (isDelinquent ? "Delinquent" : "Due"),
                            base_amount: formatCurrency(info.charge),
                            amount_paid: formatCurrency(totalPaid),
                            amount_due: formatCurrency(amountDue),
                            mailing_date: "N/A",
                            due_date: dueDate,
                            delq_date: delqDate,
                            paid_date: info.paid_date ? formatDate(info.paid_date) : "-",
                            good_through_date: ""
                        });
                    }
                });

                return { taxHistory, hasDelinquent, currentYear };
            });
            const latest = txData.taxHistory[0]; // newest year first

            // Check for any delinquent years older than the latest one
            const hasPriorDelinquent = txData.taxHistory.some(h =>
                h.status === "Delinquent" &&
                parseInt(h.year) < parseInt(latest?.year || "0")
            );

            let notes = "";
            
            if (hasPriorDelinquent) {
                notes = "PRIOR TAXES ARE DELINQUENT";
            } else {
                notes = "ALL PRIOR TAXES PAID.";
            }
            
            if (txData.taxHistory.length > 0) {
                const latest = txData.taxHistory[0];
                notes += `, ${latest.year} TAXES ARE ${latest.status.toUpperCase()}`;
            }
            
            notes += ", NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/01.";

            baseData.tax_history = txData.taxHistory;
            baseData.notes = notes;
            baseData.delinquent = txData.hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            resolve(baseData);
        } catch (err) {
            reject(err);
        }
    });
};

const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			sc_1(page, account)
			.then(() => {

				sc_2(page)
				.then(() => {

					sc_3(page)
					.then((data1) => { 

						sc_4(page, data1)
						.then((data2) => {

							sc_5(page, data2)
							.then((data3) => {
								resolve(data3);
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

const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		// await page.setViewport({ width: 1366, height: 768});
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

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

		if(fetch_type == "html"){
			// FRONTEND POINT
			account_search(page, account)
			.then((data) => {
				res.status(200).render("parcel_data_official", data);
			})
			.catch((error) => {
				console.log(error)
				res.status(200).render('error_data', {
					error: true,
					message: error.message
				});
			})
			.finally(async () => {
				await context.close();
			})
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, account)
			.then((data) => {
				res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error)
				res.status(500).json({
					error: true,
					message: error.message
				})
			})
			.finally(async () => {
				await context.close();
			})
		}

	}
	catch(error){
		console.log(error);
		if(fetch_type == "html"){
			res.status(200).render('error_data', {
				error: true,
				message: error.message
			});
		}
		else if(fetch_type == "api"){
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
