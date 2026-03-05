// Author: Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Default timeout settings for page operations
const timeout_option = {
	timeout: 90000
};

// Utility: Check if a given date is delinquent compared to today's date
const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return true;
	}
	return false;
}

// County configuration settings (URLs + taxing authority address)
const COUNTY_CONFIG = {
	warren: {
		url: "https://secure.webtaxpay.com/?county=warren&state=NC",
		taxing_authority: "Warren County Tax Collector, Warren County, NC"
	},
	yancey: {
		url: "https://secure.webtaxpay.com/?county=yancey&state=NC",
		taxing_authority: "Yancey County Tax Collector, Yancey County, NC"
	}
};

// Common selectors used across WebTaxPay platform
const COMMON_SELECTORS = {
	due_date: "09/01",
	delq_date: "01/06",
	selectors: {
		search_form: "#searchForm",
		search_by_dropdown: "#search_by",
		search_field: "#searchField",
		search_submit: 'input[type="submit"][value="Search"]',
		results_table: "#hit_list tbody tr",
		card_label: ".label, th, td.label",
		card_value: ".value, td"
	}
};

// STEP 1 — Navigate to county search page and perform search
const common_step1 = async (page, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Build target URL
			const config = COUNTY_CONFIG[county];
			const url = config.url;

			// Navigate to county landing page
			await page.goto(url, { waitUntil: "domcontentloaded"});

			// Wait for search form to load
			await page.waitForSelector(COMMON_SELECTORS.selectors.search_form, timeout_option);

			// Check for error indicators
			const hasError = await page.evaluate(() => {
				const txt = document.body?.textContent?.toLowerCase() || '';
				return txt.includes('oops') || 
				       txt.includes('error') || 
				       txt.includes('not found') || 
				       txt.includes('under construction') ||
				       txt.includes('temporarily unavailable');
			});

			if(hasError) {
				reject(new Error("County website is currently unavailable"));
			}

			// Set search type to account number (if dropdown exists)
			const hasSearchBy = await page.$(COMMON_SELECTORS.selectors.search_by_dropdown);
			if (hasSearchBy) {
				await page.select(COMMON_SELECTORS.selectors.search_by_dropdown, "mapNo").catch(() => {});
			}

			// Clear and enter account number
			await page.click(COMMON_SELECTORS.selectors.search_field, { clickCount: 3 });
			await page.type(COMMON_SELECTORS.selectors.search_field, account.trim());

			// Submit search and wait for navigation
			await Promise.all([
				page.click(COMMON_SELECTORS.selectors.search_submit),
				page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: timeout_option.timeout }).catch(() => {})
			]);

			// Wait for results table
			await page.waitForSelector(COMMON_SELECTORS.selectors.results_table, { timeout: 20000 }).catch(() => {});

			// Check if results exist
			const hasRows = await page.evaluate(() => {
				return !!document.querySelector("#hit_list tbody tr");
			});

			if(!hasRows) {
				reject(new Error("No Record Found"));
			}

			resolve(true);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 2 — Scrape list of all bills from the results table
const common_step2 = async (page, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Wait for results table to load completely
			await page.waitForSelector("#hit_list tbody", timeout_option);

			// Extract the bill list from the page
			const bills_data = await page.evaluate(() => {
				const bills = [];
				const rows = document.querySelectorAll("#hit_list tbody tr");
				
				rows.forEach(row => {
					const tds = row.querySelectorAll("td");

					// Each valid row contains at least 7 columns
					if(tds.length >= 7) {
						const name = tds[0]?.textContent.trim() || "";
						const billNum = tds[1]?.textContent.trim() || "";
						const taxYear = tds[2]?.textContent.trim() || "";
						const taxpayerNum = tds[3]?.textContent.trim() || "";
						const mapNum = tds[4]?.textContent.trim() || "";
						const description = tds[5]?.textContent.trim() || "";
						const recordType = tds[6]?.textContent.trim() || "";
						const amountDue = tds[7]?.textContent.trim() || "$0.00";
						const status = tds[8]?.textContent.trim() || tds[6]?.textContent.trim() || "";

						// Build bill ID for card.php URL
						const billId = `${billNum}:${taxpayerNum}:${taxYear}`;

						// Only push valid bill rows
						if(billNum && taxYear) {
							bills.push({
								bill_number: billNum,
								bill_id: billId,
								tax_year: taxYear,
								taxpayer_number: taxpayerNum,
								parcel_number: mapNum,
								owner_name: name,
								location: description,
								record_type: recordType,
								current_due: amountDue,
								status: status
							});
						}
					}
				});

				return bills;
			});

			// Get base URL for card.php links
			const baseUrl = new URL(page.url()).origin;

			// Add full bill URL to each bill
			const bills = bills_data.map(bill => ({
				...bill,
				bill_url: `${baseUrl}/card.php?iframe&id=${encodeURIComponent(bill.bill_id)}`
			}));

			resolve({
				bills: bills,
				total_current_due: "$0.00" // WebTaxPay doesn't show total in footer
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 3 — Extract full data from a single bill details page (tax card)
const common_step3 = async (page, billUrl, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Open bill details page (tax card)
			await page.goto(billUrl, { waitUntil: "domcontentloaded" });

			// Wait for card table to load
			await page.waitForSelector(".cardTable, table, .label", { timeout: 15000 });

			// Extract every field from the card
			const bill_details = await page.evaluate(() => {
				// Helper function to find label and get adjacent value
				const get = label => {
					const el = Array.from(document.querySelectorAll(".label, th, td.label"))
						.find(e => e.textContent.toLowerCase().includes(label.toLowerCase()));
					
					return el?.nextElementSibling?.textContent.trim() || 
					       el?.parentElement?.nextElementSibling?.textContent.trim() || 
					       "N/A";
				};

				const data = {
					owner_name: "",
					description: "",
					location: "",
					mailing_address: "",
					parcel_number: "",
					property_type: "",
					bill_status: "",
					bill_number: "",
					due_date: "",
					interest_begins: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					tax_districts: [],
					total_billed: "",
					base_tax_amount: "",
					interest_amount: "",
					current_due: "",
					transaction_history: []
				};

				// Extract owner/property basics
				data.owner_name = get("Owner Name");
				data.location = get("Description");
				data.parcel_number = get("Parcel #") || get("Parcel");

				// Extract assessed value information
				data.land_value = get("Land Value");
				data.improvements = get("Building Value");
				data.total_assessed_value = get("Taxable Value");

				// Extract billing status + dates
				const statusEl = Array.from(document.querySelectorAll("th, .label"))
					.find(el => el.textContent.toLowerCase().includes("status"));
				if (statusEl) {
					data.bill_status = statusEl.nextElementSibling?.textContent.trim() || "";
				}

				data.due_date = get("Due Date");
				data.interest_begins = get("Delinquent Date") || get("Interest Date");
				
				// Amounts - FIX: Handle negative sign in Total Paid
				data.total_billed = get("Total Original Due");
				data.current_due = get("Total Due");
				
				// WebTaxPay displays payments as negative (e.g., "$-455.64")
				// We need to remove the negative sign to get the actual amount paid
				const totalPaidRaw = get("Total Paid");
				const totalPaid = totalPaidRaw.replace(/^-/, '').replace(/^\$-/, '$');
				
				// Calculate base tax amount (original amount - interest)
				const totalBilledNum = parseFloat(data.total_billed.replace(/[$,]/g, '')) || 0;
				const currentDueNum = parseFloat(data.current_due.replace(/[$,]/g, '')) || 0;
				const totalPaidNum = parseFloat(totalPaid.replace(/[$,]/g, '')) || 0;
				
				// Base amount is the original bill
				data.base_tax_amount = data.total_billed;
				
				// Interest is any amount over the original
				const interestNum = currentDueNum > totalBilledNum ? currentDueNum - totalBilledNum : 0;
				data.interest_amount = "$" + interestNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

				// Extract tax district breakdowns if they exist
				document.querySelectorAll('table[id]').forEach(tbl => {
					const id = tbl.id?.toLowerCase();
					if (['county', 'fire', 'city', 'school'].includes(id)) {
						const dist = {};
						tbl.querySelectorAll('tr').forEach(row => {
							const lbl = row.querySelector('.label, th, td:first-child')
								?.textContent.trim().toLowerCase()
								.replace(/\s+/g, '_').replace(':', '');
							const val = row.querySelector('.value, td:last-child')
								?.textContent.trim();
							if (lbl && val) dist[lbl] = val;
						});
						data.tax_districts.push({
							rate: "",
							district: id,
							description: id.charAt(0).toUpperCase() + id.slice(1),
							amount: dist.tax || dist.amount || "$0.00"
						});
					}
				});

				// Extract transaction history from payment date
				// FIX: Now totalPaidNum is positive, so this will work correctly
				const datePaid = get("Date Paid");
				if(datePaid !== "N/A" && totalPaidNum > 0) {
					data.transaction_history.push({
						date: datePaid,
						type: "PAYMENT",
						paid_by: "",
						trans_number: "",
						amount: "$" + totalPaidNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
					});
				}

				return data;
			});

			resolve(bill_details);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 4 — Consolidate all bill data into final tax report format
const common_step4 = async (page, bills_info, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Prepare main structure of tax record
			const config = COUNTY_CONFIG[county];
			const main_data = {
				processed_date: new Date().toISOString().split('T')[0],
				order_number: "",
				borrower_name: "",
				owner_name: [],
				property_address: "",
				parcel_number: account,
				land_value: "-",
				improvements: "-",
				total_assessed_value: "",
				exemption: "-",
				total_taxable_value: "",
				taxing_authority: config.taxing_authority,	
				notes: "",
				delinquent: "NONE",			
				tax_history: []
			};

			// Get bills array
			const bills = bills_info.bills;

			// No bills? abort early
			if(bills.length === 0) {
				reject(new Error("No bills found for this parcel"));
				return;
			}

			// Sort bills by year (newest first)
			bills.sort((a, b) => {
				const yearA = parseInt(a.tax_year);
				const yearB = parseInt(b.tax_year);
				return yearB - yearA;
			});

			// Get latest bill info
			const latestBill = bills[0];
			const latestYear = latestBill.tax_year;

			// Pull full details for latest bill
			const latestBillDetails = await common_step3(page, latestBill.bill_url, county);
			
			// Copy over high-level property values
			main_data.owner_name = [latestBillDetails.owner_name];
			main_data.property_address = latestBillDetails.location;
			main_data.land_value = latestBillDetails.land_value;
			main_data.improvements = latestBillDetails.improvements;
			main_data.total_assessed_value = latestBillDetails.total_assessed_value;
			main_data.total_taxable_value = latestBillDetails.total_assessed_value;

			// Compute latest payment status
			const latestCurrentDue = parseFloat(latestBillDetails.current_due.replace(/[$,]/g, ''));
			
			// Calculate delinquent date (due date + 1 day)
			let latestDelqDate = "";
			if(latestBillDetails.due_date && latestBillDetails.due_date !== "N/A") {
				try {
					const due = new Date(latestBillDetails.due_date);
					due.setDate(due.getDate() + 1);
					latestDelqDate = due.toLocaleDateString('en-US', { 
						month: '2-digit', 
						day: '2-digit', 
						year: 'numeric' 
					});
				} catch {
					latestDelqDate = `${COMMON_SELECTORS.delq_date}/${parseInt(latestYear)+1}`;
				}
			} else {
				latestDelqDate = `${COMMON_SELECTORS.delq_date}/${parseInt(latestYear)+1}`;
			}
			
			let latestStatus = "Paid";
			if(latestCurrentDue > 0) {
				if(is_delq(latestDelqDate)) {
					latestStatus = "Delinquent";
				} else {
					latestStatus = "Due";
				}
			}

			// Calculate payments from history
			let totalPaymentAmount = 0;
			let totalDiscountAmount = 0;
			let paidDate = "";
			
			if(latestBillDetails.transaction_history.length > 0) {
				latestBillDetails.transaction_history.forEach(txn => {
					const amount = parseFloat(txn.amount.replace(/[$,]/g, '')) || 0;

					if(txn.type.toUpperCase().includes("PAYMENT")) {
						totalPaymentAmount += amount;
						if(!paidDate) paidDate = txn.date;
					}
					else if(txn.type.toUpperCase().includes("DISCOUNT")) {
						totalDiscountAmount += amount;
					}
				});
			}

			// FIX: Use transaction history amount if available (now properly populated)
			const amountPaid = totalPaymentAmount > 0
				? "$" + totalPaymentAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
				: (latestStatus === "Paid" && latestBillDetails.transaction_history.length > 0 
					? latestBillDetails.transaction_history[0].amount 
					: "$0.00");

			// Push latest bill into tax history
			main_data.tax_history.push({
				jurisdiction: "County",
				year: latestYear,
				payment_type: "Annual",
				status: latestStatus,
				base_amount: latestBillDetails.base_tax_amount,
				amount_paid: amountPaid,
				amount_due: latestBillDetails.current_due,
				mailing_date: "N/A",
				due_date: latestBillDetails.due_date || `${COMMON_SELECTORS.due_date}/${latestYear}`,
				delq_date: latestDelqDate,
				paid_date: paidDate || "-",
				good_through_date: "-",
			});

			// Process all other previous years
			let hasUnpaidPriors = false;
			let hasDelinquentPriors = false;
			
			for(let i = 1; i < bills.length; i++) {
				const bill = bills[i];
				const currentDue = parseFloat(bill.current_due.replace(/[$,]/g, ''));

				if(currentDue > 0) {
					hasUnpaidPriors = true;
					const year = bill.tax_year;

					// Pull full details for this previous bill
					const billDetails = await common_step3(page, bill.bill_url, county);

					// Calculate delinquent date
					let delqDate = "";
					if(billDetails.due_date && billDetails.due_date !== "N/A") {
						try {
							const due = new Date(billDetails.due_date);
							due.setDate(due.getDate() + 1);
							delqDate = due.toLocaleDateString('en-US', { 
								month: '2-digit', 
								day: '2-digit', 
								year: 'numeric' 
							});
						} catch {
							delqDate = `${COMMON_SELECTORS.delq_date}/${parseInt(year)+1}`;
						}
					} else {
						delqDate = `${COMMON_SELECTORS.delq_date}/${parseInt(year)+1}`;
					}
					
					let status = "Due";
					if(is_delq(delqDate)) {
						status = "Delinquent";
						hasDelinquentPriors = true;
					}

					// Calculate payments for this prior year
					let priorPaymentAmount = 0;
					let priorDiscountAmount = 0;
					let priorPaidDate = "";
					
					if(billDetails.transaction_history.length > 0) {
						billDetails.transaction_history.forEach(txn => {
							const amount = parseFloat(txn.amount.replace(/[$,]/g, '')) || 0;

							if(txn.type.toUpperCase().includes("PAYMENT")) {
								priorPaymentAmount += amount;
								if(!priorPaidDate) priorPaidDate = txn.date;
							}
							else if(txn.type.toUpperCase().includes("DISCOUNT")) {
								priorDiscountAmount += amount;
							}
						});
					}

					const priorAmountPaid = priorPaymentAmount > 0
						? "$" + priorPaymentAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
						: (billDetails.transaction_history.length > 0 
							? billDetails.transaction_history[0].amount 
							: "$0.00");

					// Add prior year record
					main_data.tax_history.push({
						jurisdiction: "County",
						year: year,
						payment_type: "Annual",
						status: status,
						base_amount: billDetails.base_tax_amount,
						amount_paid: priorAmountPaid,
						amount_due: billDetails.current_due,
						mailing_date: "N/A",
						due_date: billDetails.due_date || `${COMMON_SELECTORS.due_date}/${year}`,
						delq_date: delqDate,
						paid_date: priorPaidDate || "-",
						good_through_date: "-",
					});
				}
			}

			// Build "notes" and "delinquent" flags
			if(hasDelinquentPriors) {
				main_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				main_data.notes = `PRIORS YEAR(S) ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}.CITY TAX NEED TO CONFIRM.`;
			} 
			else if(latestStatus !== "Paid") {
				main_data.notes = `ALL PRIOR YEAR(S) ARE PAID, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}.CITY TAX NEED TO CONFIRM.`;
				if(latestStatus==="Delinquent"){
					main_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}
			} 
			else {
				main_data.notes = `ALL PRIOR YEAR(S) ARE PAID, ${latestYear} TAXES ARE PAID. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}.CITY TAX NEED TO CONFIRM.`;
			}

			// Sort tax history by year (oldest first)
			main_data.tax_history.sort((a, b) => parseInt(a.year) - parseInt(b.year));

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Main Orchestrator — Runs step1 → step2 → step4 in order
const account_search = (page, account, county) => {
    return new Promise((resolve, reject) => {

        // Validate page + table exists
        common_step1(page, account, county)
            .then(() => {

                // Get bill list
                common_step2(page, account, county)
                    .then((step2Data) => {

                        // Process complete tax report
                        common_step4(page, step2Data, account, county)
                            .then((finalData) => {
                                resolve(finalData);
                            })
                            .catch((error) => {
                                console.log(error.message);
                                reject(error);
                            });

                    })
                    .catch((error) => {
                        console.log(error.message);
                        reject(error);
                    });

            })
            .catch((error) => {
                console.log(error.message);
                reject(error);
            });

    });
};

// Express Route — Handles both HTML view and API JSON responses
const search = async (req, res) => {
	const { fetch_type, account } = req.body;

	// Extract county name from route path
	const county = req.path.replace(/^\/+/, "").toLowerCase();

	try{
		// Validate missing account number
		if (!account || account.trim() === '') {
			return res.status(200).render("error_data", {
				error: true,
				message: "Enter the Account Number..."
			});
		}

		if(!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		// Validate county is supported
		if(!COUNTY_CONFIG[county]) {
			return res.status(200).render('error_data', {
				error: true,
				message: `County '${county}' is not supported. Available: warren, yancey`
			});
		}

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();

		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

		page.setDefaultNavigationTimeout(90000);
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
				req.abort();
			} else {
				req.continue();
			}
		});

		// HTML response mode
		if(fetch_type == "html"){
			account_search(page, account, county)
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

		// API JSON response mode
		else if(fetch_type == "api"){
			account_search(page, account, county)
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

		// HTML error
		if(fetch_type == "html"){
			res.status(200).render('error_data', {
				error: true,
				message: error.message
			});
		}
		// API error
		else if(fetch_type == "api"){
			res.status(500).json({
				error: true,
				message: error.message
			});
		}
	}
}

export {
	search
}
