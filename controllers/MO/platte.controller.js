//AUTHOR: DHANUSH

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

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

// STEP 1: Search Beacon for property details
const ac_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const beacon_url = `https://beacon.schneidercorp.com/Application.aspx?AppID=589&LayerID=17697&PageTypeID=4&PageID=7914&KeyValue=${account}`;
			
			await page.goto(beacon_url, { waitUntil: "domcontentloaded" });
			
			// Wait and handle Terms and Conditions modal
			try {
				// Wait for modal to appear
				await page.waitForSelector('.modal-content', { timeout: 5000 });
				
				
				// Click Agree button
				const agreeButton = await page.$('.btn.btn-primary.button-1[data-dismiss="modal"]');
				if (agreeButton) {
					await agreeButton.click();
					
				}
			} catch (e) {
				console.log("No modal appeared or already dismissed");
			}
            const isInvalidParcel = await page.evaluate(() => {
                //Parcel number field missing
                const parcelField = document.querySelector('#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span');
                if (!parcelField || !parcelField.textContent.trim()) {
                    return true;
                }

                return false;
            });

            if (isInvalidParcel) {
                return reject(new Error("Invalid Account Number"));
            }
			
			// Wait for property data to load
			await page.waitForSelector("#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_divSummary", timeout_option);
			
			// Wait a bit more to ensure all data is loaded

			
			const property_data = await page.evaluate(() => {
				const data = {
					parcel_number: "",
					property_address: "",
					owner_name: [],
					land_value: "N/A",
					improvements: "N/A",
					total_assessed_value: "N/A",
					exemption: "N/A",
					total_taxable_value: "N/A"
				};
				
				// Extract Parcel ID
				const parcelEl = document.querySelector('#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span');
				if (parcelEl) data.parcel_number = parcelEl.textContent.trim();
				
				// Extract Property Address
				const addressEl = document.querySelector('#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl01_pnlSingleValue span');
				if (addressEl) data.property_address = addressEl.textContent.trim();
				
				// Extract Owner Name (Deed)
				const ownerEl = document.querySelector('#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch')||
                                document.querySelector('#ctlBodyPane_ctl01_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch')
				if (ownerEl) data.owner_name.push(ownerEl.textContent.trim());
				
				
				// Extract Valuation Data - Multiple methods to find the table
				const valSection = document.querySelector('#ctlBodyPane_ctl10_mSection');
				if (valSection) {
					const valTable = valSection.querySelector('table.tabular-data');
					if (valTable) {
						const rows = valTable.querySelectorAll('tbody tr');
						rows.forEach(row => {
							const cells = row.querySelectorAll('td');
							if (cells.length >= 5) {
								const valueType = cells[0]?.textContent.trim();
								if (valueType && valueType.includes('Residential Value')) {
									data.improvements = cells[1]?.textContent.trim() || "$0.00";
									data.land_value = cells[2]?.textContent.trim() || "$0.00";
									data.total_assessed_value = cells[4]?.textContent.trim() || "$0.00";
									data.total_taxable_value = cells[4]?.textContent.trim() || "$0.00";
								}
							}
						});
					}
				}
				
				
				return data;
			});
			
			resolve(property_data);
		} catch (error) {
			console.log(error);
			reject(new Error("Failed to fetch Beacon data: " + error.message));
		}
	});
}

// STEP 2: Search Platte Collector for tax history
const ac_2 = async (page, account, property_data) => {
	return new Promise(async (resolve, reject) => {
		try {
			const collector_url = `https://plattecountycollector.com/realview.php?user=beacon&pid=${account}`;
			
			await page.goto(collector_url, { waitUntil: "domcontentloaded" });
			
			// Wait for tax table to load
			await page.waitForSelector('table[style*="font-weight:bolder"]', timeout_option);
			
            
			const tax_data = await page.evaluate(() => {
                const cleanAmount = (text) => {
                    if (!text) return "$0.00";
                    const cleaned = text.trim().replace(/[^0-9.,-]/g, ''); // remove any weird chars except numbers, comma, dot, minus
                    if (!cleaned) return "$0.00";
                    // Add $ and proper spacing
                    return "$" + parseFloat(cleaned.replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                };
				const all_history = [];
				const tables = document.querySelectorAll('table[style*="font-weight:bolder"]');
				
				// Find the tax history table (second table with header)
				let taxTable = null;
				for (let table of tables) {
					const headerRow = table.querySelector('tr td.header2');
					if (headerRow && headerRow.textContent.includes('TAX YEAR')) {
						taxTable = table;
						break;
					}
				}
				
				if (taxTable) {
					const rows = taxTable.querySelectorAll('tr');
					
					// Skip first row (header with "TAX YEAR", "OWNER NAME", etc.)
					for (let i = 1; i < rows.length; i++) {
						const cells = rows[i].querySelectorAll('td');
						if (cells.length >= 5) {
							const year = cells[0]?.textContent.trim();
							const owner = cells[1]?.textContent.trim();
							const amount = cells[2]?.textContent.trim();
							const protested = cells[3]?.textContent.trim();
							const datePaid = cells[4]?.textContent.trim();
                            const baseAmount=cleanAmount(amount);

							
							// Skip if year is "TAX YEAR" (header row) or empty or not a valid number
							if (year && year !== 'TAX YEAR' && /^\d{4}$/.test(year)) {
								all_history.push({
									jurisdiction: "County",
									year: year,
									payment_type: "Annual",
									status: datePaid ? "Paid" : "Due",
									base_amount: baseAmount,
									amount_paid: datePaid ? baseAmount : "$0.00",
									amount_due: datePaid ? "$0.00" : baseAmount,
									mailing_date: "N/A",
									due_date: `12/31/${year}`,
									delq_date: `01/01/${parseInt(year) + 1}`,
									paid_date: datePaid || "-",
									good_through_date: "-",
									protested: protested
								});
							}
						}
					}
				}
				
				return all_history;
			});
			
			// Process tax history to determine what to include
			let filtered_history = [];
			let delinquent_status = "NONE";
			let notes = "";
			
			if (tax_data.length > 0) {
				// Get current year (first entry)
				const current_year_entry = tax_data[0];
				const current_year = parseInt(current_year_entry.year);
				
				// Check for delinquent status on all entries
				let has_delinquent = false;
				tax_data.forEach(entry => {
					if (entry.status === "Due" && is_delq(entry.delq_date)) {
						entry.status = "Delinquent";
						has_delinquent = true;
					}
				});
				
				// Get unpaid/delinquent years
				const unpaid_years = tax_data.filter(t => t.status === "Due" || t.status === "Delinquent");
				const prior_years = tax_data.filter(t => parseInt(t.year) < current_year);
				const prior_unpaid = prior_years.filter(t => t.status === "Due" || t.status === "Delinquent");
				
				// Determine what to include in history
				if (current_year_entry.status === "Paid") {
					// Current year is paid
					if (unpaid_years.length === 0) {
						// All years paid - only return current year
						filtered_history = [current_year_entry];
						notes = "ALL PRIOR YEARS ARE PAID";
					} else {
						// Some years unpaid - include current year and all unpaid years
						filtered_history = [current_year_entry, ...unpaid_years];
						notes = "PRIOR YEARS ARE DELINQUENT";
					}
				} else {
					// Current year is not paid
					if (unpaid_years.length === 1 && unpaid_years[0].year === current_year_entry.year) {
						// Only current year is unpaid
						filtered_history = [current_year_entry];
						if (prior_years.length > 0 && prior_unpaid.length === 0) {
							notes = "ALL PRIOR YEARS ARE PAID";
						}
					} else {
						// Multiple years unpaid
						filtered_history = unpaid_years;
						if (prior_unpaid.length > 0) {
							notes = "PRIOR YEARS ARE DELINQUENT";
						}
					}
				}
				
				if (has_delinquent) {
					delinquent_status = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}
				
				// Add note about current year status
				const currentStatus = current_year_entry.status.toUpperCase();
				if (notes) {
					notes += `, ${current_year} TAXES ARE ${currentStatus}`;
				} else {
					notes = `${current_year} TAXES ARE ${currentStatus}`;
				}
				notes += `, NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 12/31`;
			}
			
			const final_data = {
				processed_date: "",
				order_number: "",
				borrower_name: "",
				owner_name: property_data.owner_name,
				property_address: property_data.property_address,
				parcel_number: property_data.parcel_number,
				land_value: property_data.land_value,
				improvements: property_data.improvements,
				total_assessed_value: property_data.total_assessed_value,
				exemption: property_data.exemption || "$0.00",
				total_taxable_value: property_data.total_taxable_value,
				taxing_authority: "Platte County Collector of Revenue, 415 Third St #103, Platte City, MO 64079, Ph: 816-858-3356",
				notes: notes,
				delinquent: delinquent_status,
				tax_history: filtered_history,
				// Additional property details
				mailing_address: property_data.mailing_address,
				gross_living_area: property_data.gross_living_area,
				lot_area: property_data.lot_area,
				year_built: property_data.year_built
			};
			
			resolve(final_data);
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Main search function
const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			// Step 1: Get property details from Beacon
			ac_1(page, account)
				.then((property_data) => {
					// Step 2: Get tax history from Collector
					ac_2(page, account, property_data)
						.then((final_data) => {
							resolve(final_data);
						})
						.catch((error) => {
							reject(error);
						});
				})
				.catch((error) => {
					reject(error);
				});
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Main search endpoint
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

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

		page.setDefaultNavigationTimeout(90000);

		// Block unnecessary resources
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
				req.abort();
			} else {
				req.continue();
			}
		});

		if (fetch_type === "html") {
			// Frontend HTML response
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
			// API JSON response
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
}

export { search };
