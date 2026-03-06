//AUTHOR:DHANUSH
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
	timeout: 90000
};

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return true;
	}
	return false;
}

// Helper function to format currency properly (no $ sign)
const formatCurrency = (value) => {
    if (!value || value === "N/A" || value === "0" || value === "0.00") return "N/A";

    // Remove any existing $ or commas, then parse as float
    const num = parseFloat(value.toString().replace(/[$,]/g, ""));

    if (isNaN(num)) return "N/A";

    // Format with $ , commas, and 2 decimals
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
};

// Helper function to format dates
const formatDate = (dateStr) => {
	if (!dateStr || dateStr === "N/A") return "";
	const d = new Date(dateStr);
	if (isNaN(d)) return "";
	return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};
//To Check Account Validation
const pc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://eagletreasurer.co.apache.az.us:8443/treasurer/web/login.jsp`;
            await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector('td#middle_left input[type="submit"][value="Login"]', timeout_option);
            await Promise.all([
                page.click('td#middle_left input[type="submit"][value="Login"]'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 })
            ]);

            // FILL PARCEL NUMBER INPUT
            await page.waitForSelector("#TaxAccountID", timeout_option);
            await page.locator("#TaxAccountID").fill(account);

            // CLICK SEARCH BUTTON AND WAIT FOR RESULTS
            await page.waitForSelector('input[type="submit"][value="Search"]', timeout_option);
            await Promise.all([
                page.locator('input[type="submit"][value="Search"]').click(),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            // VALIDATE THAT ACTUAL RESULTS WERE FOUND (not "no accounts")
            const warningElement = await page.$('p.warning');
            if (warningElement) {
                const warningText = await page.evaluate(el => el.textContent.trim(), warningElement);
                if (warningText.includes("No accounts found")) {
                    reject(new Error("Invalid account number: No accounts found"));
                    return;
                }
            }

            // Additional safety: check for results table or any account links
            const hasResultsTable = await page.$('#searchResultsTable');  // Common in EagleWeb systems
            const hasAccountLink = await page.$('a[href*="account.jsp?account="]');
            if (!hasResultsTable && !hasAccountLink) {
                reject(new Error("Invalid account number: No results table or account links found"));
                return;
            }

            // Optional: check for "Nothing found to display" text
            const nothingFound = await page.evaluate(() => {
                return document.body.textContent.includes("Nothing found to display.");
            });
            if (nothingFound) {
                reject(new Error("Invalid account number: Nothing found to display"));
                return;
            }

            resolve(true);  // Valid account with results
        }
        catch (error) {
            console.log(error);
            reject(new Error(error.message || "Search failed"));
        }
    });
}

//CLICK ON ACCOUNT FROM SEARCH RESULTS
const pc_2 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			// WAIT FOR SEARCH RESULTS TABLE
			await page.waitForSelector("#searchResultsTable", timeout_option);

			// CHECK IF ONE ITEM FOUND
			const found = await page.evaluate(() => {
				const banner = document.querySelector(".pagebanner")?.textContent;
				return banner && banner.includes("One item found");
			});

			if(!found){
				reject(new Error("Multiple or no records found"));
				return;
			}

			// CLICK ON ACCOUNT LINK
			const accountLink = await page.waitForSelector('a[href*="account.jsp?account="]', timeout_option);
			
			await Promise.all([
				accountLink.click(),
				page.waitForNavigation()
			]);

			if(page.url().includes("account.jsp")){
				resolve(true);
			}
			else{
				reject(new Error("Failed to open account"));
			}
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

//GET ACCOUNT SUMMARY DATA (OWNER, ADDRESS, PARCEL from Summary page)
const pc_3 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			await page.waitForSelector('#taxAccountSummary', timeout_option);

			const page_data = await page.evaluate(() => {
				const datum = {
					processed_date : "",
					order_number : "",
					borrower_name: "",
					owner_name: [],
					property_address: "N/A",
					parcel_number: "",
					land_value: "N/A",
					improvements: "N/A",
					total_assessed_value: "N/A",
					exemption: "N/A",
					total_taxable_value: "N/A",
					taxing_authority: "Apache County Treasurer, 75 W Cleveland St, St. Johns, AZ 85936, Ph: 928-337-7659",	
					notes: "",
					delinquent: "NONE",			
					tax_history: []
				}

				// Get owner and property info from taxAccountSummary
				const summaryTable = document.querySelector("#taxAccountSummary table");
				if(summaryTable){
					const rows = summaryTable.querySelectorAll("tr");
					let isOwnerRow = false;
					
					rows.forEach(row => {
						const labelCell = row.querySelector(".label");
						const valueCell = row.querySelectorAll("td")[1];
						
						if(labelCell && valueCell){
							const label = labelCell.textContent.trim().toLowerCase().replace(/\s+/g, '_');
							const value = valueCell.textContent.trim();
							
							if(label.includes("owners")){
								datum['owner_name'].push(value);
								isOwnerRow = true;
							}
							else if(label.includes("parcel") && label.includes("number")){
								datum['parcel_number'] = value;
							}
							else if(label.includes("situs") && label.includes("address")){
								datum['property_address'] = value || "N/A";
							}
						}
						else if(isOwnerRow && !labelCell && valueCell){
							// Additional owner names (rows without label)
							const value = valueCell.textContent.trim();
							if(value){
								datum['owner_name'].push(value);
							}
						}
						else{
							isOwnerRow = false;
						}
					});
				}

				return datum;
			});

			resolve(page_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

// NAVIGATE TO ACCOUNT VALUE AND GET ASSESSMENT DATA
const pc_4 = async (page, baseData) => {
	return new Promise(async (resolve, reject) => {
		try {
			// Navigate to Account Value page
			await page.waitForSelector('a[href*="action=billing"]', timeout_option);
			await Promise.all([
				page.click('a[href*="action=billing"]'),
				page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 })
			]);

			await page.waitForSelector('table.account', timeout_option);

			const assessmentData = await page.evaluate(() => {
				const data = {};
				
				// Get values from the billing page tables
				const tables = document.querySelectorAll('table.account.stripe');
				
				tables.forEach(table => {
					const rows = table.querySelectorAll('tbody tr');
					
					rows.forEach(row => {
						const cells = row.querySelectorAll('td');
						
						if(cells.length >= 4){
							const propertyCode = cells[0]?.textContent.trim();
							const actual = cells[2]?.textContent.trim();
							const assessed = cells[3]?.textContent.trim();
							
							// Check for Total rows
							if(propertyCode && propertyCode.includes('Total')){
								const valueType = cells[1]?.textContent.trim();
								
								if(valueType && valueType.includes('Full Cash')){
									data.total_assessed_value = assessed.replace(/[$,]/g, '');
								}
								else if(valueType && valueType.includes('Limited Property')){
									data.total_taxable_value = assessed.replace(/[$,]/g, '');
								}
							}
							// Check for individual property rows (LAND, IMP, VACANT, RESIDENTIAL)
							else if(propertyCode && propertyCode.includes('LAND')){
								if(!data.land_value){
									data.land_value = assessed.replace(/[$,]/g, '');
								}
							}
							else if(propertyCode && propertyCode.includes('IMP')){
								if(!data.improvements){
									data.improvements = assessed.replace(/[$,]/g, '');
								}
							}
							else if(propertyCode && (propertyCode.includes('RESIDENTIAL') || propertyCode.includes('VACANT'))){
								// For single-row properties, use this as total assessed if not already set
								if(!data.total_assessed_value){
									data.total_assessed_value = assessed.replace(/[$,]/g, '');
								}
							}
						}
					});
				});

				return data;
			});

			// Merge assessment data into base data
			baseData.land_value = formatCurrency(assessmentData.land_value) || "N/A";
			baseData.improvements = formatCurrency(assessmentData.improvements) || "N/A";
			baseData.total_assessed_value = formatCurrency(assessmentData.total_assessed_value) || "N/A";
			baseData.total_taxable_value = formatCurrency(assessmentData.total_assessed_value) || "N/A";

			resolve(baseData);
		} catch (err) {
			console.log(err);
			reject(err);
		}
	});
};

// GET TRANSACTION DETAILS AND BUILD TAX HISTORY
const pc_5 = async (page, baseData) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Go to Transaction Detail
            await page.waitForSelector('a[href*="action=tx"]', timeout_option);
            await Promise.all([
                page.click('a[href*="action=tx"]'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 })
            ]);

            await page.waitForSelector("table.account", timeout_option);

            const rawTx = await page.evaluate(() => {
                const currentYear = new Date().getFullYear();

                // 1. Summary Table (official truth when it shows unpaid years)
                const summaryRows = Array.from(document.querySelectorAll("table.account thead + tbody tr"));
                const summary = {};
                let hasInterest = false;

                summaryRows.forEach(row => {
                    const c = row.querySelectorAll("td");
                    if (c.length < 8) return;
                    const year = c[0].textContent.trim();
                    const interest = parseFloat(c[2].textContent.replace(/[$,]/g, "") || 0);
                    const totalDue = parseFloat(c[7].textContent.replace(/[$,]/g, "") || 0);
                    summary[year] = { interest, totalDue };
                    if (interest > 0) hasInterest = true;
                });

                // 2. Full transaction history
                const txRows = Array.from(document.querySelectorAll("table.account.stripe tbody tr"));
                const years = {};

                txRows.forEach(row => {
                    const c = row.querySelectorAll("td");
                    if (c.length < 5) return;
                    const year = c[0].textContent.trim();
                    const type = c[1].textContent.trim();
                    const date = c[2].textContent.trim();
                    const amount = c[3].textContent.trim();

                    if (!years[year]) years[year] = { 
                        charge: "0.00", 
                        payments: [],
                        balance: c[4]?.textContent.trim() || "$0.00",
                        summaryTotalDue: summary[year]?.totalDue || 0
                    };

                    if (type.includes("Tax") && !type.includes("Payment") && !type.includes("Interest")) {
                        years[year].charge = amount.replace(/[$,]/g, "");
                    }
                    if (type.includes("Payment")) {
                        const amt = parseFloat(amount.replace(/[$,]/g, "") || 0);
                        years[year].payments.push({ date, amount: amt });
                    }
                });

                return { years, summary, hasInterest, currentYear };
            });

            const taxHistory = [];
            let hasDelinquent = false;
            let latestYear = 0;
            let latestYearEntries = [];

            // Find latest year
            Object.keys(rawTx.years).forEach(yearStr => {
                const year = parseInt(yearStr);
                if (year > latestYear) {
                    latestYear = year;
                }
            });

            // Determine if this is Apache-style (shows delinquent) or Park-style (hides them)
            const showsOldYears = Object.keys(rawTx.summary).length > 1 ||
                                 (Object.keys(rawTx.summary).length === 1 && parseInt(Object.keys(rawTx.summary)[0]) < rawTx.currentYear);

            const isApacheMode = rawTx.hasInterest || (showsOldYears && Object.keys(rawTx.summary).length > 0);

            // Process each year
            Object.keys(rawTx.years).forEach(yearStr => {
                const year = parseInt(yearStr);
                const { charge, payments, summaryTotalDue } = rawTx.years[yearStr];
                
                const chargeAmount = parseFloat(charge || 0);
                if (chargeAmount === 0) return;
                
                const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                const summaryDue = summaryTotalDue || 0;
                const isFullyPaid = isApacheMode ? (summaryDue === 0) : (chargeAmount - totalPaid <= 0.01);
                
                // Determine payment type
                const isSemiAnnual = payments.length === 2 && !isFullyPaid;
                
                if (isSemiAnnual) {
                    // SEMI-ANNUAL: Create 2 entries
                    const halfAmount = chargeAmount / 2;
                    
                    // First Half
                    const firstPayment = payments[0];
                    const firstPaid = firstPayment ? firstPayment.amount : 0;
                    const firstHalfPaid = firstPaid >= halfAmount - 0.01;
                    
                    const firstDelqDate = `11/03/${year}`;
                    const firstIsDelinquent = !firstHalfPaid && is_delq(firstDelqDate);
                    
                    if (firstIsDelinquent) hasDelinquent = true;
                    
                    const firstEntry = {
                        jurisdiction: "County",
                        year: yearStr,
                        payment_type: "Semi-Annual",
                        status: firstHalfPaid ? "Paid" : (firstIsDelinquent ? "Delinquent" : "Due"),
                        base_amount: formatCurrency(halfAmount),
                        amount_paid: formatCurrency(firstPaid),
                        amount_due: firstHalfPaid ? "0.00" : formatCurrency((halfAmount - firstPaid)).toFixed(2),
						mailing_date: "N/A",
                        due_date: `10/01/${year}`,
                        delq_date: `11/03/${year}`,
                        paid_date: firstPayment ? formatDate(firstPayment.date) : "-",
                        good_through_date: ""
                    };
                    
                    // Second Half
                    const secondPayment = payments[1];
                    const secondPaid = secondPayment ? secondPayment.amount : 0;
                    const secondHalfPaid = secondPaid >= halfAmount - 0.01;
                    
                    const secondDelqDate = `05/01/${year + 1}`;
                    const secondIsDelinquent = !secondHalfPaid && is_delq(secondDelqDate);
                    
                    if (secondIsDelinquent) hasDelinquent = true;
                    
                    const secondEntry = {
                        jurisdiction: "County",
                        year: yearStr,
                        payment_type: "Semi-Annual",
                        status: secondHalfPaid ? "Paid" : (secondIsDelinquent ? "Delinquent" : "Due"),
                        base_amount: formatCurrency(halfAmount),
                        amount_paid: formatCurrency(secondPaid),
                        amount_due: secondHalfPaid ? "0.00" : formatCurrency((halfAmount - secondPaid)),
						mailing_date: "N/A",
                        due_date: `03/01/${year + 1}`,
                        delq_date: `05/01/${year + 1}`,
                        paid_date: secondPayment ? formatDate(secondPayment.date) : "-",
                        good_through_date: ""
                    };
                    
                    // Add entries
                    if (!firstHalfPaid || !secondHalfPaid || year === latestYear) {
                        if (!firstHalfPaid || year === latestYear) {
                            taxHistory.push(firstEntry);
                            if (year === latestYear) latestYearEntries.push(firstEntry);
                        }
                        if (!secondHalfPaid || year === latestYear) {
                            taxHistory.push(secondEntry);
                            if (year === latestYear) latestYearEntries.push(secondEntry);
                        }
                    }
                } else {
                    // ANNUAL: Create 1 entry
                    const annualDelqDate = `01/01/${year + 1}`;
                    const annualIsDelinquent = !isFullyPaid && is_delq(annualDelqDate);
                    
                    if (annualIsDelinquent && year < rawTx.currentYear) {
                        hasDelinquent = true;
                    }
                    
                    const amountDue = chargeAmount - totalPaid;
                    
                    const annualEntry = {
                        jurisdiction: "County",
                        year: yearStr,
                        payment_type: "Annual",
                        status: isFullyPaid ? "Paid" : (annualIsDelinquent ? "Delinquent" : "Due"),
                        base_amount: formatCurrency(chargeAmount),
                        amount_paid: formatCurrency(totalPaid),
                        amount_due: isFullyPaid ? "0.00" : formatCurrency(summaryDue),
						mailing_date: "N/A",
                        due_date: `12/31/${year}`,
                        delq_date: `01/01/${year + 1}`,
                        paid_date: payments.length > 0 ? formatDate(payments[payments.length - 1].date) : "-",
                        good_through_date: ""
                    };
                    
                    // Add entry if unpaid or latest year
                    if (!isFullyPaid || year === latestYear) {
                        taxHistory.push(annualEntry);
                        if (year === latestYear) latestYearEntries.push(annualEntry);
                    }
                }
            });

            // Sort by year descending, then by due date
            taxHistory.sort((a, b) => {
                const yearDiff = parseInt(b.year) - parseInt(a.year);
                if (yearDiff !== 0) return yearDiff;
                return new Date(a.due_date) - new Date(b.due_date);
            });

            // Build notes
            let notes = hasDelinquent ? "PRIOR TAXES ARE DELINQUENT" : "ALL PRIORS TAXES ARE PAID";
            
            if (latestYearEntries.length > 0) {
                const latestEntry = latestYearEntries[0];
                if (latestEntry.payment_type === "Semi-Annual" && latestYearEntries.length === 2) {
                    const firstStatus = latestYearEntries[0]?.status || "Unknown";
                    const secondStatus = latestYearEntries[1]?.status || "Unknown";
                    notes += `, ${latestYear} 1ST INSTALLMENT IS ${firstStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondStatus.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
                } else {
                    notes += `, ${latestYear} TAXES ARE ${latestEntry.status.toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY.`;
                }
            }
            
            notes += " NORMAL DUE DATES ARE FOR ANNUAL IS 31/12 AND FRO SEMI ANNUAL IS 01/10 AND 01/03";
			taxHistory.sort((a, b) => {
				return parseInt(a.year) - parseInt(b.year);
			});

            baseData.tax_history = taxHistory;
            baseData.notes = notes;
            baseData.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

            resolve(baseData);

        } catch (err) {
            console.log("pc_5 error:", err);
            reject(err);
        }
    });
};

// MAIN ACCOUNT SEARCH FUNCTION
const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			pc_1(page, account)
			.then((data) => {

				pc_2(page, account)
				.then((data1) => {

					pc_3(page, data1)
					.then((data2) => { 

						pc_4(page, data2)
						.then((data3) => {

							pc_5(page, data3)
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

const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{
		if (!account || account.trim() === '') {
			return res.status(200).render("error_data", {
				error: true,
				message: "Enter the Account Number..."
			});
		}

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
