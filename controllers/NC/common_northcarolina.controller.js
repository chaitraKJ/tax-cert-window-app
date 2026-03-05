// Author:Dhanush
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
	cumberland: {
		url: "https://taxpwa.co.cumberland.nc.us/publicwebaccess/BillSearchResults.aspx?ParcelNum=",
		taxing_authority: "Cumberland County Tax Collector, Cumberland County, NC — P.O. Box 449, Fayetteville, NC 28302-0449, Ph: 910-678-7507."
	},
	forsyth: {
		url: "https://bcpwa.ncptscloud.com/forsythtax/BillSearchResults.aspx?ParcelNum=",
		taxing_authority: "Forsyth County Tax Administrator / Collector, Forsyth County, NC — P.O. Box 82, Winston-Salem, NC 27102, Ph: 336-703-2300."
	},
	guilford: {
		url: "https://bcpwa.ncptscloud.com/guilfordtax/BillSearchResults.aspx?parcelnum=",
		taxing_authority: "Guilford County Tax Department, 400 West Market St, Greensboro, NC 27401, Ph: 336-641-3363."
	},
	mecklenburg: {
		url: "https://taxbill.co.mecklenburg.nc.us/publicwebaccess/BillSearchResults.aspx?ParcelNum=",
		taxing_authority: "Mecklenburg County Tax Collector, 700 E. Stonewall St, Charlotte, NC 28202, Ph: 980-314-4829."	
	},
	henderson: {
		url: "https://bcpwa.ncptscloud.com/hendersontax/BillSearchResults.aspx?ParcelNum=",
		taxing_authority: "Henderson County Tax Collector 200 N Grove St Suite 66 Hendersonville NC 28792-5027."	
	},
	orange: {
		url: "https://web.co.orange.nc.us/publicwebaccess/BillSearchResults.aspx?ParcelNum=",
		taxing_authority: "Orange County Tax Office, PO Box 8181, Hillsborough, NC 27278-8181"	
	}
};

// Common selectors used across all NC county tax websites
const COMMON_SELECTORS = {
	due_date: "09/01",
	delq_date: "01/06",
	selectors: {
		results_table: "#G_dgResults",
		bill_link: "a[href*='BillDetails']",
		owner: "#txtName",
		location: "#lblPropAddr",
		parcel: "#lblParcel",
		land_value: "#lblRealOriginal",
		improvements: "#lblPersonalOriginal",
		total_value: "#lblTotalValue",
		total_billed: "#lblTotalAmountDue",
		current_due: "#lblCurrentDue",
		bill_status: "#lblBillStatus",
		due_date: "#lblDueDate",
		interest_begins: "#lblInterest",
		last_payment_date: "#lblLastPaymentDate",
		tax_districts: "#dgShowResultRate tr",
		history: "#dgShowResultHistory tr"
	}
}

// STEP 1 — Navigate to county bill search page and validate response
const nc_step1 = async (page, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Build target URL
			const config = COUNTY_CONFIG[county];
			const url = `${config.url}${account}`;

			// Open parcel search results page
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// Check if the site returns "NO DATA FOUND"
			const noResults = await page.evaluate(() => {
				const divs = document?.querySelector("#tblNoDataFound tbody span");
				if (divs) {
					return divs.textContent?.includes("NO DATA FOUND, PLEASE REDEFINE YOUR SEARCH CRITERIA");
				}
				return false;
			});

			if(noResults) {
				reject(new Error("No Record Found"));
			}

			// Check if results table exists
			try{
				await page.waitForSelector(COMMON_SELECTORS.selectors.results_table, timeout_option)
			}
			catch(error){
				reject(new Error("Please Try Again Website is Under Maintainence"));
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
const nc_step2 = async (page, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Wait for results table to load completely
			await page.waitForSelector(`${COMMON_SELECTORS.selectors.results_table} tbody`, timeout_option);

			// Extract the bill list from the page
			const bills_data = await page.evaluate((selector) => {
				const bills = [];
				const rows = document.querySelectorAll(`${selector} tbody tr`);
				
				rows.forEach(row => {
					const cells = row.querySelectorAll("td");

					// Each valid row contains at least 7 columns
					if(cells.length >= 7) {
						const billLink = cells[0]?.querySelector("a");
						const billNum = billLink?.textContent.trim();
						const billHref = billLink?.href;
						const parcelNum = cells[2]?.textContent.trim();
						const ownerName = cells[3]?.textContent.trim();
						const location = cells[4]?.textContent.trim();
						const billFlags = cells[5]?.textContent.trim();
						const currentDue = cells[6]?.textContent.trim();

						// Only push valid bill rows
						if(billNum && billHref) {
							bills.push({
								bill_number: billNum,
								bill_url: billHref,
								parcel_number: parcelNum,
								owner_name: ownerName,
								location: location,
								bill_flags: billFlags,
								current_due: currentDue
							});
						}
					}
				});

				return bills;
			}, COMMON_SELECTORS.selectors.results_table);

			// Extract total current due value (footer)
			const totalDue = await page.evaluate((selector) => {
				const footerCell = document.querySelector(`${selector} tbody tr:last-child td:last-child`);
				return footerCell?.textContent.trim() || "$0.00";
			}, COMMON_SELECTORS.selectors.results_table).catch(() => "$0.00");

			resolve({
				bills: bills_data,
				total_current_due: totalDue
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 3 — Extract full data from a single bill details page
const nc_step3 = async (page, billUrl, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// Open bill details page
			await page.goto(billUrl, { waitUntil: "domcontentloaded" });

			// Wait for title (ensures page loaded)
			await page.waitForSelector("#pageTitleLabel", timeout_option);

			// Extract every field from the page
			const bill_details = await page.evaluate((selectors) => {
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
					last_payment_date: "",
					transaction_history: []
				};

				// Extract owner/property basics
				data.owner_name = document.querySelector(selectors.owner)?.textContent.trim() || "";
				data.location = document.querySelector(selectors.location)?.textContent.trim() || "";
				data.parcel_number = document.querySelector(selectors.parcel)?.textContent.trim() || "";

				// Extract assessed value information
				data.land_value = document.querySelector(selectors.land_value)?.textContent.trim() || "$0";
				data.improvements = document.querySelector(selectors.improvements)?.textContent.trim() || "$0";
				data.total_assessed_value = document.querySelector(selectors.total_value)?.textContent.trim() || "$0";

				// Extract billing status + dates
				data.bill_status = document.querySelector(selectors.bill_status)?.textContent.trim() || "";
				data.due_date = document.querySelector(selectors.due_date)?.textContent.trim() || "";
				data.interest_begins = document.querySelector(selectors.interest_begins)?.textContent.trim() || "";
				
				// Extract last payment date
				data.last_payment_date = document.querySelector(selectors.last_payment_date)?.textContent.trim() || "";
				
				// Amounts and calculation of base tax
				data.total_billed = document.querySelector(selectors.total_billed)?.textContent.trim() || "$0.00";
				data.interest_amount = document.querySelector("#lblInterestAmt")?.textContent.trim() || "$0.00";
				data.current_due = document.querySelector(selectors.current_due)?.textContent.trim() || "$0.00";
				
				const totalBilledNum = parseFloat(data.total_billed.replace(/[$,]/g, '')) || 0;
				const interestNum = parseFloat(data.interest_amount.replace(/[$,]/g, '')) || 0;
				const baseTaxNum = totalBilledNum - interestNum;

				data.base_tax_amount = "$" + baseTaxNum.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

				// Extract tax district lines
				const rateRows = document.querySelectorAll(selectors.tax_districts);
				rateRows.forEach((row, index) => {
					if(index === 0) return;
					const cells = row.querySelectorAll("td");
					if(cells.length >= 4) {
						data.tax_districts.push({
							rate: cells[0]?.textContent.trim() || "",
							district: cells[1]?.textContent.trim() || "",
							description: cells[2]?.textContent.trim() || "",
							amount: cells[3]?.textContent.trim() || ""
						});
					}
				});

				// Extract payment history table
				const historyRows = document.querySelectorAll(selectors.history);
				historyRows.forEach((row, index) => {
					if(index === 0) return;
					const cells = row.querySelectorAll("td");
					if(cells.length >= 5) {
						data.transaction_history.push({
							date: cells[0]?.textContent.trim() || "",
							type: cells[1]?.textContent.trim() || "",
							paid_by: cells[2]?.textContent.trim() || "",
							trans_number: cells[3]?.textContent.trim() || "",
							amount: cells[4]?.textContent.trim() || ""
						});
					}
				});

				return data;
			}, COMMON_SELECTORS.selectors);

			resolve(bill_details);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// STEP 4 — Consolidate all bill data into final tax report format
const nc_step4 = async (page, bills_info, account, county) => {
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
				const yearA = parseInt(a.bill_number.split("-")[1]);
				const yearB = parseInt(b.bill_number.split("-")[1]);
				return yearB - yearA;
			});

			// Get latest bill info
			const latestBill = bills[0];
			const latestYear = latestBill.bill_number.split("-")[1];

			// Pull full details for latest bill
			const latestBillDetails = await nc_step3(page, latestBill.bill_url, county);
			
			// Copy over high-level property values
			main_data.owner_name = [latestBillDetails.owner_name];
			main_data.property_address = latestBillDetails.location;
			main_data.land_value = latestBillDetails.land_value;
			main_data.improvements = latestBillDetails.improvements;
			main_data.total_assessed_value = latestBillDetails.total_assessed_value;
			main_data.total_taxable_value = latestBillDetails.total_assessed_value;

			// Compute latest payment status
			const latestCurrentDue = parseFloat(latestBillDetails.current_due.replace(/[$,]/g, ''));
			const latestDelqDate = latestBillDetails.interest_begins || `${COMMON_SELECTORS.delq_date}/${parseInt(latestYear)+1}`;
			
			let latestStatus = "Paid";
			if(latestCurrentDue > 0) {
				if(is_delq(latestDelqDate)) {
					latestStatus = "Delinquent";
				} else {
					latestStatus = "Due";
				}
			}

			// Calculate payments from history OR use last payment date from page
			let totalPaymentAmount = 0;
			let totalDiscountAmount = 0;
			let paidDate = "";
			
			// Check if last_payment_date is available on the page
			if(latestBillDetails.last_payment_date) {
				paidDate = latestBillDetails.last_payment_date;
			}
			
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

			const amountPaid = totalPaymentAmount > 0
				? "$" + totalPaymentAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
				: (latestStatus === "Paid" ? latestBillDetails.base_tax_amount : "$0.00");

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
					const year = bill.bill_number.split("-")[1];

					// Pull full details for this previous bill
					const billDetails = await nc_step3(page, bill.bill_url, county);

					const delqDate = billDetails.interest_begins || `${COMMON_SELECTORS.delq_date}/${parseInt(year)+1}`;
					
					let status = "Due";
					if(is_delq(delqDate)) {
						status = "Delinquent";
						hasDelinquentPriors = true;
					}

					// Calculate payments for this prior year
					let priorPaymentAmount = 0;
					let priorDiscountAmount = 0;
					let priorPaidDate = "";
					
					// Check if last_payment_date is available on the page
					if(billDetails.last_payment_date) {
						priorPaidDate = billDetails.last_payment_date;
					}
					
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
						: "$0.00";

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
				main_data.notes = `PRIORS YEAR(S) ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}`;
			} 
			else if(latestStatus !== "Paid") {
				main_data.notes = `ALL PRIOR YEAR(S) ARE PAID,${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}.`;
				if(latestStatus==="Delinquent"){
					main_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}
			} 
			else {
				main_data.notes = `ALL PRIOR YEAR(S) ARE PAID, ${latestYear} TAXES ARE PAID. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS ${COMMON_SELECTORS.due_date}.`;
			}
			if(county=="orange"||county=="henderson"){
				main_data.notes+="CITY TAX NEED TO CONFIRM.";
			}
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

        //Validate page + table exists
        nc_step1(page, account, county)
            .then(() => {

                // Get bill list
                nc_step2(page, account, county)
                    .then((step2Data) => {

                        //Process complete tax report
                        nc_step4(page, step2Data, account, county)
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
	const county = req.path.replace(/^\/+/, "");

	try{
		// Validate missing account number
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


		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

		page.setDefaultNavigationTimeout(90000);
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if ( req.resourceType() === 'image') {
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