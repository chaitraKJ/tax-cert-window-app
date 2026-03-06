//AUTHOR:DHANUSH

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

//default set timeout
const timeout_option = {
	timeout: 90000
};
//to load the data
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	return today >= delq_date;
}

// SEARCH FOR PARCEL
const wc_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const url = `https://auditor.warrencountyohio.gov/PropertySearch/Search/Parcel`;
			await page.goto(url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector('#BasicSearchResults', timeout_option);
			await page.locator('#BasicSearchResults').fill(account);

			await Promise.all([
				page.locator('#btnSearch').click(),
				page.waitForNavigation({ waitUntil: "domcontentloaded" })
			]);

			if(page.url().includes('/PropertySearch/Summary/Index')){
				resolve(true);
			} else {
				reject(new Error("No Record Found"));
			}
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 2: EXTRACT BASIC PROPERTY DATA
const wc_2 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('table.summaryTable', timeout_option);
			
			const property_data = await page.evaluate(() => {
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
					taxing_authority: "Warren County Auditor, 406 Justice Drive, Lebanon, OH 45036, Ph: 513-695-1235",
					notes: "",
					delinquent: "NONE",
					tax_history: []
				};

				const summaryTable = document.querySelector('table.summaryTable');
				if(summaryTable) {
					const rows = summaryTable.querySelectorAll('tr');
					rows.forEach(row => {
						const cells = row.querySelectorAll('td');
						for(let i = 0; i < cells.length - 1; i += 2) {
							const heading = cells[i]?.textContent?.trim();
							const value = cells[i + 1]?.textContent?.trim();
							
							if(heading === 'Parcel ID' && value) {
								datum['parcel_number'] = value;
							}
							if(heading === 'Current Owner' && value) {
								datum['owner_name'][0] = value;
							}
							if(heading === 'Property Address' && value) {
								datum['property_address'] = value.replace(/\s+/g, ' ').replace(/\n/g, ' ');
							}
						}
					});
				}

				const fieldsets = document.querySelectorAll('fieldset');
				for(let fieldset of fieldsets) {
					const legend = fieldset.querySelector('legend');
					if(legend && legend.textContent.includes('Value Summary')) {
						const valueTable = fieldset.querySelector('table.summaryTable');
						if(valueTable) {
							const rows = valueTable.querySelectorAll('tr');
							rows.forEach(row => {
								const heading = row.querySelector('td.heading')?.textContent?.trim();
								const values = row.querySelectorAll('td.value');
								
								if(heading === 'Land' && values.length >= 2) {
									datum['land_value'] = values[1]?.textContent?.trim();
								}
								if(heading === 'Building' && values.length >= 2) {
									datum['improvements'] = values[1]?.textContent?.trim();
								}
								if(heading === 'Total' && values.length >= 2) {
									datum['total_assessed_value'] = values[1]?.textContent?.trim();
									datum['total_taxable_value'] = values[1]?.textContent?.trim();
								}
							});
						}
					}
				}

				return datum;
			});

			resolve(property_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 3: GET AVAILABLE TAX YEARS AND BUILD STATUS DATA + EXTRACT PAYMENT HISTORY
const wc_3 = async (page, data, account, yearsRequested) => {
	return new Promise(async (resolve, reject) => {
		try {
			// Click on Payments/Refunds tab
			await page.waitForSelector('a.dynTab[data-info="payments"]', timeout_option);
			await page.locator('a.dynTab[data-info="payments"]').click();
			await delay(3000);

			// Extract payment history first
			const paymentHistory = await page.evaluate(() => {
				const payments = [];
				const paymentsDiv = document.querySelector('#paymentsRefunds');
				if (paymentsDiv) {
					const table = paymentsDiv.querySelector('table.summaryTable');
					if (table) {
						const rows = table.querySelectorAll('tbody tr');
						rows.forEach((row, index) => {
							// Skip header row
							if (index === 0) return;
							
							const cells = row.querySelectorAll('td');
							if (cells.length >= 4) {
								const paymentDate = cells[0]?.textContent?.trim();
								const taxAmount = cells[1]?.textContent?.trim();
								
								if (paymentDate && taxAmount) {
									payments.push({
										payment_date: paymentDate,
										tax_amount: taxAmount
									});
								}
							}
						});
					}
				}
				return payments;
			});

			// Get available tax years
			const years = await page.evaluate(() => {
				const yearsList = [];
				const select = document.querySelector('#taxYear');
				if(select) {
					const options = select.querySelectorAll('option');
					options.forEach(opt => {
						yearsList.push({
							value: opt.value,
							year: opt.textContent.trim()
						});
					});
				}
				return yearsList;
			});

			if(years.length === 0) {
				throw new Error("No tax years available");
			}

			// Sort years descending (newest first)
			let sortedYears = years
				.map(y => ({ ...y, yearNum: parseInt(y.year) }))
				.filter(y => !isNaN(y.yearNum))
				.sort((a, b) => b.yearNum - a.yearNum);

			const status_data = {};
			let processedCount = 0;
			let latestYear = null; 

			// Process years in descending order until we have enough with actual taxes
			for (const yearInfo of sortedYears) {
				if (processedCount >= yearsRequested) break;

				const year = yearInfo.year;
				
				await page.select('#taxYear', yearInfo.value);
				await delay(2500);

				const yearData = await page.evaluate(() => {
					const table = document.querySelector('#TaxSummaryDisplay table.summaryTable');
					if (!table) return null;

					const data = {
						first_half_net: "$0.00",
						second_half_net: "$0.00",
						first_half_due: "$0.00",
						second_half_due: "$0.00",
						delinquent_total: "$0.00",
						delinquent_due: "$0.00",
					};

					const rows = table.querySelectorAll('tr');
					rows.forEach(row => {
						const heading = row.querySelector('td.heading')?.textContent?.trim();
						const values = row.querySelectorAll('td.value');

						if (heading?.includes('Total Net Tax') && values.length >= 4) {
							data.first_half_net = values[0]?.textContent?.trim() || "$0.00";
							data.second_half_net = values[1]?.textContent?.trim() || "$0.00";
							data.delinquent_total = values[2]?.textContent?.trim() || "$0.00";
						}
						if (heading?.includes('Due') && values.length >= 4) {
							data.first_half_due = values[0]?.textContent?.trim() || "$0.00";
							data.second_half_due = values[1]?.textContent?.trim() || "$0.00";
							data.delinquent_due = values[2]?.textContent?.trim() || "$0.00";
						}
					});

					return data;
				});

				if (!yearData) {
					continue;
				}

				const parseAmount = (str) => parseFloat((str || "$0.00").replace(/[$,]/g, '')) || 0;
				const firstHalfNet = parseAmount(yearData.first_half_net);
				const secondHalfNet = parseAmount(yearData.second_half_net);
				const totalNet = firstHalfNet + secondHalfNet;
				const delinquentDue = parseAmount(yearData.delinquent_due);

				// NEW: Skip if no actual taxes charged for this year (total net = 0)
				if (totalNet === 0) {
					continue; // Skip zero-tax years (e.g., future 2025 when not yet billed)
				}

				// If we reach here, it's a valid year with taxes
				if (!latestYear) latestYear = year; // First valid = latest valid

				status_data[year] = {
					status: delinquentDue > 0 ? "Unpaid" : "Paid",
					base_amount: `$${(firstHalfNet + secondHalfNet).toFixed(2)}`,
					year_data: yearData,
					history: []
				};

				processedCount++;
			}

			resolve({
				data: data,
				status_data: status_data,
				latest_year: latestYear || "", // fallback empty if none
				payment_history: paymentHistory,
				years_requested: yearsRequested,
				years_returned: processedCount
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
};

// STEP 4 – MATCH PAYMENTS TO INSTALLMENTS
const wc_4 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const { status_data, payment_history, latest_year } = main_data;

			// Parse and sort payments: OLDEST → NEWEST
			const payments = payment_history
				.map(p => ({
					date: new Date(p.payment_date),
					dateStr: p.payment_date,
					amount: parseFloat(p.tax_amount.replace(/[$,]/g, '')) || 0,
					amountStr: p.tax_amount
				}))
				.filter(p => !isNaN(p.date.getTime()))
				.sort((a, b) => a.date - b.date);

			let paymentPtr = payments.length - 1;

			for (const year of Object.keys(status_data).sort((a, b) => b - a)) {
				const yearNum = parseInt(year);
				const dueYear = yearNum + 1;
				const yearData = status_data[year].year_data;

				const parse = (s) => parseFloat((s || "$0.00").replace(/[$,]/g, "")) || 0;

				const firstHalfNet = parse(yearData.first_half_net);
				const secondHalfNet = parse(yearData.second_half_net);
				const firstHalfDue = parse(yearData.first_half_due);
				const secondHalfDue = parse(yearData.second_half_due);

				const isFirstPaid = firstHalfDue === 0;
				const isSecondPaid = secondHalfDue === 0;

				const assigned = { first: null, second: null };

				// Match payments to installments
				if (isFirstPaid && firstHalfNet > 0) {
					for (let i = paymentPtr; i >= 0; i--) {
						const p = payments[i];
						const month = p.date.getMonth() + 1;
						const pyear = p.date.getFullYear();
						if (pyear === dueYear && month >= 1 && month <= 4 &&
						    Math.abs(p.amount - firstHalfNet) <= 20) {
							assigned.first = p.dateStr;
							paymentPtr = i - 1;
							break;
						}
					}
				}

				if (isSecondPaid && secondHalfNet > 0) {
					for (let i = paymentPtr; i >= 0; i--) {
						const p = payments[i];
						const month = p.date.getMonth() + 1;
						const pyear = p.date.getFullYear();
						if (pyear === dueYear && month >= 6 && month <= 9 &&
						    Math.abs(p.amount - secondHalfNet) <= 20) {
							assigned.second = p.dateStr;
							paymentPtr = i - 1;
							break;
						}
					}
				}

				// Fallback
				if (isFirstPaid && !assigned.first && paymentPtr >= 0) {
					assigned.first = payments[paymentPtr--].dateStr;
				}
				if (isSecondPaid && !assigned.second && paymentPtr >= 0) {
					assigned.second = payments[paymentPtr--].dateStr;
				}

				const formatMoney = (num) => {
					return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
				};

				// Build history
				if (firstHalfNet > 0) {
					status_data[year].history.push({
						jurisdiction: "County",
						year: year,
						payment_type: "Semi-Annual",
						status: isFirstPaid ? "Paid" : (is_delq(`02/27/${dueYear}`) ? "Delinquent" : "Due"),
						base_amount: formatMoney(firstHalfNet),
						amount_paid: isFirstPaid ? formatMoney(firstHalfNet) : "$0.00",
						amount_due: firstHalfDue > 0 ? yearData.first_half_due : "$0.00",
						due_date: `02/26/${dueYear}`,
						delq_date: `02/27/${dueYear}`,
						paid_date: assigned.first || "-",
						mailing_date: "N/A",
						good_through_date: "",
						installment: "1st Half"
					});
				}

				if (secondHalfNet > 0) {
					status_data[year].history.push({
						jurisdiction: "County",
						year: year,
						payment_type: "Semi-Annual",
						status: isSecondPaid ? "Paid" : (is_delq(`07/31/${dueYear}`) ? "Delinquent" : "Due"),
						base_amount: formatMoney(secondHalfNet),
						amount_paid: isSecondPaid ? formatMoney(secondHalfNet) : "$0.00",
						amount_due: secondHalfDue > 0 ? yearData.second_half_due : "$0.00",
						due_date: `07/30/${dueYear}`,
						delq_date: `07/31/${dueYear}`,
						paid_date: assigned.second || "-",
						mailing_date: "N/A",
						good_through_date: "",
						installment: "2nd Half"
					});
				}
			}

			resolve({
				data: main_data.data,
				history_data: status_data,
				latest_year,
				years_requested: main_data.years_requested,
				years_returned: main_data.years_returned
			});
		} catch (error) {
			console.error("wc_4 error:", error);
			reject(error);
		}
	});
};

// STEP 5: FINALIZE DATA WITH NOTES
const wc_5 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const history_data = main_data.history_data;

			const main_history_data = [];
			const delinquentYears = new Set();
			let hasDelinquent = false;

			const years_sorted = Object.keys(history_data).sort((a, b) => b - a);

			const latest_year = years_sorted.length > 0 ? years_sorted[0] : null;

			// Build main_history_data
			for(const year of years_sorted) {
				const yearInfo = history_data[year];
				const history = yearInfo.history;

				history.forEach((h) => {
					if(h.status === "Delinquent") {
						hasDelinquent = true;
						delinquentYears.add(year);
					}
					main_history_data.push(h);
				});
			}

			// Build notes
			const noteParts = [];
			const numYears = Object.keys(history_data).length;

			if (numYears === 0 || !latest_year) {
				noteParts.push("NO TAX DATA AVAILABLE");
			} else {
				const yearItems = main_history_data.filter(t => t.year === latest_year);
				const first = yearItems.find(t => t.installment === "1st Half");
				const second = yearItems.find(t => t.installment === "2nd Half");

				const olderDelq = Array.from(delinquentYears).filter(y => y !== latest_year);

				if (first && second) {
					const s1 = first.status.toUpperCase();
					const s2 = second.status.toUpperCase();

					if (olderDelq.length > 0) {
						noteParts.push("PRIOR YEARS TAXES ARE DELINQUENT");
					} else if (s1 === "PAID" && s2 === "PAID") {
						noteParts.push("ALL PRIORS ARE PAID");
					} else {
						noteParts.push("ALL PRIORS ARE PAID");
					}

					noteParts.push(`${latest_year}: 1ST INSTALLMENT IS ${s1}, 2ND INSTALLMENT IS ${s2}`);
				} else if (first) {
					if (olderDelq.length > 0) {
						noteParts.push("PRIOR YEARS TAXES ARE DELINQUENT");
					}
					noteParts.push(`${latest_year}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}`);
				} else if (second) {
					if (olderDelq.length > 0) {
						noteParts.push("PRIOR YEARS TAXES ARE DELINQUENT");
					}
					noteParts.push(`${latest_year}: 2ND INSTALLMENT IS ${second.status.toUpperCase()}`);
				}
			}

			noteParts.push("NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 02/26 & 07/30");
			main_data.data.notes = noteParts.join(". ");

			main_data.data.delinquent = hasDelinquent
				? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
				: "NONE";

			main_data.data.tax_history = main_history_data;
			main_data.data.years_requested = main_data.years_requested;
			main_data.data.years_returned = main_data.years_returned;
			
			resolve(main_data.data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// MAIN SEARCH FUNCTION
const parcel_search = async (page, account, yearsRequested = 1) => {
	return new Promise(async (resolve, reject) => {
		try{
			wc_1(page, account)
			.then((data) => {

				wc_2(page, account)
				.then((data1) => {

					wc_3(page, data1, account, yearsRequested)
					.then((data2) => { 

						wc_4(page, data2, account)
						.then((data3) => {

							wc_5(page, data3, account)
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
		if(account.trim()==''||!account){
      		return res.status(200).render("error_data", {
        		error: true,
        		message: "Enter the Account Number..."
      		});
    	}
		if(!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
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

		if(fetch_type === "html"){
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
		else if(fetch_type === "api"){
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
		if(fetch_type === "html"){
			res.status(200).render('error_data', {
				error: true,
				message: error.message
			});
		}
		else if(fetch_type === "api"){
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