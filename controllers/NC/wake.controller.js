//AUTHOR: DHANUSH
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

// Format number with commas and optional $ sign
const formatCurrency = (num, withDollarSign = true) => {
  if (!num || isNaN(num)) return withDollarSign ? "$0" : "0";
  const number = parseInt(num.toString().replace(/[^0-9.-]/g, ''), 10);
  if (isNaN(number)) return withDollarSign ? "$0" : "0";
  
  const formatted = number.toLocaleString('en-US');
  return withDollarSign ? `$${formatted}` : formatted;
};


// Step 1: Search by account number
const ac_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const url = `https://services.wake.gov/ptax/main/billing/`;
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// Wait for search dropdown
			await page.waitForSelector("#ddlSearchBy", timeout_option);
			
			// Select "Account Number" option
			await page.select("#ddlSearchBy", "acct");

			// Select "Last 2 Years" to get recent data
			await page.waitForSelector("#ddlYears", timeout_option);
			await page.select("#ddlYears", "2");

			// Fill in the account number
			await page.waitForSelector("#txtAccount", timeout_option);
			await page.locator("#txtAccount").fill(account);

			// Click search and wait for navigation
			await page.waitForSelector("#Search", timeout_option);
			await Promise.all([
				page.locator("#Search").click(),
				page.waitForNavigation({ waitUntil: "domcontentloaded" })
			]);
			
			// Check if we got results or error
			const hasError = await page.evaluate(() => {
				const errorElement = document.querySelector("#lblValidationMsg");
				if(!errorElement) return false;
				const text = errorElement.textContent.trim();
				return text.includes("No records matched your request") ||
           			   text.includes("Please enter a valid account number") ||
           			   text.length > 0; 
			});

			if (hasError || page.url() === url) {
				reject(new Error("Please enter a valid account number"));
			} else {
				resolve(true);
			}

		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Step 2: Extract account summary data and year info
const ac_2 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector("table tbody .medFont", { timeout: 30000 });

			const page_data = await page.evaluate(() => {
				const datum = {
					processed_date: new Date().toISOString().split('T')[0],
					order_number: "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "N/A",
					land_value: "N/A",
					improvements: "N/A",
					total_assessed_value: "N/A",
					exemption: "N/A",
					total_taxable_value: "N/A",
					taxing_authority: "Wake County Tax Administration, PO Box 580084, Charlotte NC 28258-0084, Ph: 919-856-5400",
					notes: "",
					delinquent: "NONE",
					tax_history: []
				};

				const years_info = {};
				let max_year = 0;
				let latest_row = null;

				// Find all billing rows
				const rows = document.querySelectorAll("tr[style*='background-color']");

				rows.forEach(row => {
					const acctLink = row.querySelector("a[title='Go To Billing Statement']");
					if (!acctLink) return;

					const acctText = acctLink.textContent.trim();
					const yearMatch = acctText.match(/-\d{4}-(\d{4})-\d+/); // e.g., -2025-2025-
					if (!yearMatch) return;

					const year = parseInt(yearMatch[1], 10);
					if (year > max_year) {
						max_year = year;
						latest_row = row;
					}

					// === Extract tax info for this year ===
					const isPaid = row.textContent.includes("Paid in full on:");
					const allText = row.textContent;

					let currentDue = "$0.00";
					let amountPaid = "$0.00";
					let dueDate = "";
					let interestBegins = "";
					let paidDate = "";

					const currentDueMatch = allText.match(/Current Due:.*?\$?([\d,]+\.?\d*)/);
					if (currentDueMatch) currentDue = "$" + currentDueMatch[1].replace(/,/g, '');

					const dueDateMatch = allText.match(/Due Date:\s*(\d{2}\/\d{2}\/\d{4})/);
					if (dueDateMatch) dueDate = dueDateMatch[1];

					const interestMatch = allText.match(/Interest Begins:\s*(\d{2}\/\d{2}\/\d{4})/);
					if (interestMatch) interestBegins = interestMatch[1];

					const paidDateMatch = allText.match(/Paid in full on:\s*(\d{2}\/\d{2}\/\d{4})/);
					if (paidDateMatch) paidDate = paidDateMatch[1];

					const amountPaidMatch = allText.match(/Amount Paid:\s*\$?([\d,]+\.?\d*)/);
					if (amountPaidMatch) amountPaid = "$" + amountPaidMatch[1];

					years_info[year] = {
						status: isPaid ? "Paid" : "Due",
						current_due: currentDue,
						amount_paid: amountPaid,
						due_date: dueDate,
						interest_begins: interestBegins,
						paid_date: paidDate,
						account_number: acctText
					};
				});

				// Build tax history array
				Object.keys(years_info).sort().reverse().forEach(year => {
					datum.tax_history.push({
						year: year,
						...years_info[year]
					});
				});

				return { datum, years_info, max_year };

			});

			resolve(page_data);

		} catch (error) {
			console.error("Error in ac_2:", error);
			reject(error);
		}
	});
};

// Step 3: Process necessary years - ALWAYS LATEST + UNPAID PREVIOUS
const ac_3 = async (page, extract_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const { datum, years_info, max_year } = extract_data;
			const sortedYears = Object.keys(years_info).map(y => parseInt(y)).sort((a, b) => b - a);
			
			if (sortedYears.length === 0) {
				reject(new Error("No tax years found"));
				return;
			}

			const latestYear = sortedYears[0].toString();
			const yearsToProcess = {};

			// ALWAYS PROCESS LATEST YEAR (MANDATORY)
			yearsToProcess[latestYear] = years_info[latestYear];

			// Check for unpaid previous years (DELINQUENT)
			const previousUnpaidYears = sortedYears
				.slice(1) // Skip latest year
				.filter(y => years_info[y.toString()].status === "Due");

			if (previousUnpaidYears.length > 0) {
				// Previous years are unpaid - DELINQUENT
				datum.notes = "PRIORS ARE DELINQUENT";
				datum.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				
				// Add all unpaid previous years
				previousUnpaidYears.forEach(y => {
					yearsToProcess[y.toString()] = years_info[y.toString()];
				});
			} else {
				// All previous years are paid
				if (years_info[latestYear].status === "Paid") {
					datum.notes = "ALL PRIORS ARE PAID";
				} else {
					datum.notes = "ALL PRIORS ARE PAID";
				}
			}

			// Get detailed info for ALL selected years
			const processedYears = new Set();
			let latestYearDetailData = null;
			
			for (const year of Object.keys(yearsToProcess).sort((a, b) => b - a)) {
				// Skip if already processed
				if (processedYears.has(year)) {
					continue;
				}
				
				try {
					const detailData = await ac_3_helper(page, yearsToProcess[year], year);
					yearsToProcess[year] = { ...yearsToProcess[year], ...detailData };
					processedYears.add(year);
					
					// Save the latest year's detail data for owner/property/parcel extraction
					if (year === latestYear) {
						latestYearDetailData = detailData;
					}
				} catch (error) {
					console.log(`Error fetching details for year ${year}:`, error.message);
				}
			}

			// *** UPDATE OWNER NAMES, PROPERTY ADDRESS, AND PARCEL NUMBER FROM LATEST YEAR DETAIL PAGE ***
			if (latestYearDetailData) {
				if (latestYearDetailData.owner_names && latestYearDetailData.owner_names.length > 0) {
					datum.owner_name = latestYearDetailData.owner_names;
				}
				if (latestYearDetailData.property_address) {
					datum.property_address = latestYearDetailData.property_address;
				}
				// IMPORTANT: Extract parcel number from detail page, not user input
				if (latestYearDetailData.parcel_number) {
					datum.parcel_number = latestYearDetailData.parcel_number ;
				}
			}

			resolve({
				data: datum,
				years_to_process: yearsToProcess,
				max_year: max_year
			});

		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Helper function to get detailed bill information for a specific year
const ac_3_helper = async (page, yearData, year) => {
	return new Promise(async (resolve, reject) => {
		try {
			const accountNumber = yearData.account_number;
			const accountSplit=accountNumber.split("-")
			const parcelNumber=accountSplit[0];
			
			// Find and click the link for this specific account number
			const clicked = await page.evaluate((acctNum) => {
				const links = document.querySelectorAll("a[title='Go To Billing Statement']");
				for (let link of links) {
					if (link.textContent.trim() === acctNum) {
						link.click();
						return true;
					}
				}
				return false;
			}, accountNumber);

			if (!clicked) {
				console.log(`Could not find link for ${accountNumber}`);
				resolve({});
				return;
			}

			// Wait for the statement page to load
			await page.waitForNavigation({ waitUntil: "domcontentloaded" });
			await page.waitForSelector("table[bgcolor='#4C7FBB']", timeout_option);

			// Extract detailed information from the bill
			const detailData = await page.evaluate((parcelNumber) => {
				const detail = {
					assessed_value: "",
					land_value: "",
					total_billed: "",
					total_due: "",
					owner_names: [],
					property_address: "",
					parcel_number: "" // Extract from detail page
				};
				if(parcelNumber){
					detail.parcel_number=parcelNumber;
				}

				// === EXTRACT PARCEL NUMBER ===
				// Find the Real Estate ID (parcel number) on the detail page
				const allRows = document.querySelectorAll("tr");
				// === EXTRACT OWNER NAMES ===
				const ownerTable = document.querySelector("table#Table22");
				if (ownerTable) {
					const ownerRows = ownerTable.querySelectorAll("tr");
					ownerRows.forEach(row => {
						const cell = row.querySelector("td.medFontBold");
						if (cell) {
							const text = cell.textContent.trim();
							const cleanText = text.replace(/\s+/g, ' ');
							if (cleanText && cleanText.length > 3) {
								detail.owner_names.push(cleanText);
							}
						}
					});
				}

				// === EXTRACT PROPERTY ADDRESS (LOCATION) ===
				allRows.forEach(row => {
					const cells = row.querySelectorAll("td");
					cells.forEach((cell, idx) => {
						if (cell.textContent.trim() === "Location:" && cells[idx + 1]) {
							const addressCell = cells[idx + 1];
							if (addressCell.classList.contains("medFontBold")) {
								const addr = addressCell.textContent.trim();
								detail.property_address = addr.replace(/\s+/g, ' ');
							}
						}
					});
				});

				// === EXTRACT ASSESSED VALUE ===
				const billDetailCells = document.querySelectorAll("td.billDetail");
				billDetailCells.forEach(cell => {
					const label = cell.textContent.trim();
					const valueCell = cell.nextElementSibling;
					
					if (valueCell && valueCell.classList.contains("billDetailCurr")) {
						const value = valueCell.textContent.trim().replace(/,/g, '').replace(/\$/g, '');
						
						if (label === "Real") {
							if (value && !isNaN(value) && parseInt(value) > 0) {
								detail.land_value = value;
							}
						}
						
						if (label === "Total Value" && valueCell.querySelector('b')) {
							const boldValue = valueCell.querySelector('b').textContent.trim().replace(/,/g, '');
							if (boldValue && !isNaN(boldValue) && parseInt(boldValue) > 0) {
								detail.assessed_value = boldValue;
							}
						}
					}
				});

				// === EXTRACT TOTAL BILLED ===
				const allTableRows = document.querySelectorAll("tr[valign='bottom']");
				allTableRows.forEach(row => {
					const labelCell = row.querySelector("td.billDetail b");
					const valueCell = row.querySelector("td.billDetailCurr b");
					
					if (labelCell && valueCell) {
						const label = labelCell.textContent.trim();
						const value = valueCell.textContent.trim();
						
						if (label === "Total Billed") {
							detail.total_billed = value;
						}
					}
				});

				// === EXTRACT TOTAL DUE ===
				const totalDueRows = document.querySelectorAll("tr[bgcolor='#EBE6E2']");
				totalDueRows.forEach(row => {
					const cells = row.querySelectorAll("td");
					cells.forEach((cell, idx) => {
						if (cell.textContent.includes("Total Due") && cells[idx + 1]) {
							const value = cells[idx + 1].textContent.trim();
							if (value) {
								detail.total_due = value;
							}
						}
					});
				});

				return detail;
			},parcelNumber);

			// Go back to summary page
			await page.goBack({ waitUntil: "domcontentloaded" });
			await page.waitForSelector("table[bgcolor='#4C7FBB']", timeout_option);

			resolve(detailData);

		} catch (error) {
			console.log(`Error in ac_3_helper for year ${year}:`, error);
			resolve({});
		}
	});
}

// Step 4: Format the final data
const ac_4 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const years_data = main_data.years_to_process;
			const max_year = main_data.max_year;
			const data = main_data.data;

			const main_history_data = [];

			// Sort years in descending order
			const sortedYears = Object.keys(years_data).map(y => parseInt(y)).sort((a, b) => b - a);

			sortedYears.forEach(year => {
				const yearStr = year.toString();
				const yearInfo = years_data[yearStr];
				
				// Base amount should be total_billed (the original tax amount without interest/penalties)
				let baseAmount = yearInfo.total_billed || yearInfo.amount_paid || yearInfo.current_due;
				if (baseAmount && !baseAmount.startsWith("$")) {
					baseAmount = "$" + baseAmount;
				}

				// Determine status - CORRECTLY check delinquency
				let status = yearInfo.status;
				
				// CRITICAL FIX: Only mark as Delinquent if interest_begins date has PASSED
				if (status === "Due" && yearInfo.interest_begins) {
					if (is_delq(yearInfo.interest_begins)) {
						status = "Delinquent";
						data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
					}
				}

				// Determine actual amount due
				let actualAmountDue = "$0.00";
				if (status === "Paid") {
					actualAmountDue = "$0.00";
				} else {
					actualAmountDue = yearInfo.total_due || yearInfo.total_billed || yearInfo.current_due;
					if (actualAmountDue && !actualAmountDue.startsWith("$")) {
						actualAmountDue = "$" + actualAmountDue;
					}
				}

				const th_data = {
					jurisdiction: "County",
					year: yearStr,
					payment_type: "Annual",
					status: status,
					base_amount: baseAmount,
					amount_paid: yearInfo.amount_paid || "$0.00",
					amount_due: actualAmountDue,
					mailing_date: "N/A",
					due_date: yearInfo.due_date || "",
					delq_date: yearInfo.interest_begins || "",
					paid_date: yearInfo.paid_date || "",
					good_through_date: "",
					assessed_value: yearInfo.assessed_value || "",
					land_value: yearInfo.land_value || ""
				};

				// Update assessed values in main data object from latest year
				if (year === max_year) {
					const assessed = th_data.assessed_value || "0";
					const land = th_data.land_value || "0";

					data.land_value = formatCurrency(land);
					data.total_assessed_value = formatCurrency(assessed);
					data.total_taxable_value = formatCurrency(assessed);
				}

				main_history_data.push(th_data);
			});

			// Add information about latest year
			if (sortedYears.length > 0) {
				const latestYear = sortedYears[0];
				const latestRow = main_history_data.find(r => r.year === latestYear.toString());
				if (latestRow) {
					const statusUpper = latestRow.status.toUpperCase();
					data.notes += `, ${latestYear} TAXES ARE ${statusUpper}, NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 09/01`;
				}
			}

			data.tax_history = main_history_data;
			resolve(data);

		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			ac_1(page, account)
			.then((data) => {
				ac_2(page, account)
				.then((data1) => {
					ac_3(page, data1, account)
					.then((data2) => { 
						ac_4(page, data2, account)
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
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

// Main export function
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

module.exports = { search };