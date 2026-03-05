//AUTHOR: DHANUSH
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
	timeout: 90000
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return true;
	}
	return false;
}

// Step 1: Search by REID on property search page
const dc_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const url = `https://taxcama.dconc.gov/camapwa/SearchProperty.aspx`;
			await page.goto(url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector('#ctl00_ContentPlaceHolder1_REIDTextBox', timeout_option);
			await page.type('#ctl00_ContentPlaceHolder1_REIDTextBox', account);
			await page.keyboard.press('Enter');
			
			await Promise.all([
				page.waitForNavigation({ waitUntil: "domcontentloaded" })
			]);

			if (page.url().includes('PropertySummary.aspx')) {
				resolve(true);
			} else {
				reject(new Error("No Record Found"));
			}
		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Step 2: Extract property information from summary page
const dc_2 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
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
					taxing_authority: "Durham County Tax Administration, 201 E Main St, Durham, NC 27701, Ph: 919-560-0300",
					notes: "",
					delinquent: "NONE",
					tax_history: []
				};

				const ownerTable = document.querySelector('#ctl00_PageHeader1_DetailsView1');
				if (ownerTable) {
					const ownerText = ownerTable.querySelector('td')?.textContent?.trim() || "N/A";
					datum['owner_name'] = ownerText.split(';').map(name => name.trim());
				}

				const addressElement = document.querySelector('#ctl00_PageHeader1_LocationAddressLabelInfo');
				datum['property_address'] = addressElement?.textContent?.trim() || "N/A";

				const reidElement = document.querySelector('#ctl00_PageHeader1_ReidLabelInfo');
				datum['parcel_number'] = reidElement?.textContent?.trim() || "N/A";

				const landValue = document.querySelector('#ctl00_ContentPlaceHolder1_DetailsView8_TotalLandValueAssessed');
				datum['land_value'] = landValue?.textContent?.trim() || "$0";

				const buildingValue = document.querySelector('#ctl00_ContentPlaceHolder1_DetailsView8_TotalBldgValueAssessed');
				datum['improvements'] = buildingValue?.textContent?.trim() || "$0";

				const totalAppraised = document.querySelector('#ctl00_ContentPlaceHolder1_DetailsView8_TotalAppraisedValueCost');
				datum['total_assessed_value'] = totalAppraised?.textContent?.trim() || "$0";

				const exemption = document.querySelector('#ctl00_ContentPlaceHolder1_DetailsView3_OtherExmpt');
				datum['exemption'] = exemption?.textContent?.trim() || "$0";

				const totalTaxable = document.querySelector('#ctl00_ContentPlaceHolder1_DetailsView10_txtTotalPropValue');
				datum['total_taxable_value'] = totalTaxable?.textContent?.trim() || "$0";

				return datum;
			});

			page_data['parcel_number'] = account;
			resolve(page_data);

		} catch (error) {
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

// Step 3: Navigate to tax bill search and perform parcel search
const dc_3 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const url = `https://property.spatialest.com/nc/durham-tax/#/`;
			await page.goto(url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector('#searchTerm', timeout_option);

			await page.click('#search_type_btn');
			await page.waitForSelector('.dropdown-item[data-field="Parcel"]', timeout_option);
			await page.click('.dropdown-item[data-field="Parcel"]');

			await page.type('#searchTerm', account);

			await Promise.all([
				page.waitForSelector('#tax_search_table tbody tr', timeout_option),
				page.click('.btn.btn-success.btn-site-search')
			]);

			resolve(data);
		} catch (error) {
			console.log("dc_3 error:", error);
			reject(new Error(error.message));
		}
	});
};

// Step 4: Collect ALL tax years from the main table (multiple rows possible)
const dc_4 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await delay(4000);

			const table_years = await page.evaluate(() => {
				const rows = Array.from(document.querySelectorAll('#tax_search_table tbody tr'));
				if (rows.length === 0) return [];

				return rows.map(row => {
					const cells = row.querySelectorAll('td');
					if (cells.length < 10) return null;

					const yearText = cells[1]?.textContent?.trim();
					const year = parseInt(yearText);
					if (isNaN(year)) return null;

					const status = cells[8]?.textContent?.trim().toUpperCase();
					const amountDueText = cells[9]?.textContent?.trim() || "$0.00";

					return {
						year: year.toString(),
						status_table: status,
						amount_due_table: amountDueText
					};
				}).filter(item => item !== null);
			});

			if (table_years.length === 0) {
				reject(new Error("No tax records found in table"));
				return;
			}

			table_years.sort((a, b) => parseInt(b.year) - parseInt(a.year));

			data['all_years_data'] = table_years;
			resolve(data);
		} catch (error) {
			console.log("dc_4 error:", error);
			reject(error);
		}
	});
};

// Step 5: Extract detailed data from transaction history modal for ALL years
const dc_5 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const hasButton = await page.$eval('#tax_search_table tbody tr .btn.btn-sm.btn-info', () => true).catch(() => false);
			if (!hasButton) {
				console.log("No transaction history button - using table fallback");
				resolve(data);
				return;
			}

			await page.click('#tax_search_table tbody tr .btn.btn-sm.btn-info');
			await page.waitForSelector('#transactioncontent table tbody tr', { timeout: 15000 });

			const modal_data = await page.evaluate(() => {
				const rows = Array.from(document.querySelectorAll('#transactioncontent table tbody tr'));
				if (rows.length === 0) return [];

				return rows.map(row => {
					const cells = row.querySelectorAll('td');
					if (cells.length < 9) return null;

					const yearText = cells[1]?.textContent?.trim();
					const year = parseInt(yearText);
					if (isNaN(year)) return null;

					const datePaid = cells[4]?.textContent?.trim() || "";
					const totalDue = cells[5]?.textContent?.trim() || "$0.00";
					const amountPaid = cells[6]?.textContent?.trim() || "$0.00";
					const interestBegin = cells[7]?.textContent?.trim() || "";
					const status = cells[8]?.textContent?.trim().toUpperCase() || "";

					return {
						year: year.toString(),
						paid_date: datePaid,
						base_amount: totalDue,
						amount_paid: amountPaid,
						delq_date: interestBegin || null,
						status: status
					};
				}).filter(item => item !== null);
			});

			modal_data.sort((a, b) => parseInt(b.year) - parseInt(a.year));

			data['modal_data'] = modal_data;

			await page.click('.modal-footer .btn-secondary').catch(() => {});

			resolve(data);
		} catch (error) {
			console.log("dc_5 error (fallback to table data):", error);
			resolve(data);
		}
	});
};

// Step 6: Process years - LATEST + DELINQUENT PREVIOUS ONLY
const dc_6 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const allYearsData = data.all_years_data || [];
			const modalData = data.modal_data || [];

			if (allYearsData.length === 0) {
				reject(new Error("No tax years found"));
				return;
			}

			// Sort years descending
			allYearsData.sort((a, b) => parseInt(b.year) - parseInt(a.year));

			const latestYear = allYearsData[0].year;
			const yearsToProcess = [];

			// ALWAYS ADD LATEST YEAR (MANDATORY)
			yearsToProcess.push(latestYear);

			// Find delinquent previous years
			const previousYears = allYearsData.slice(1);
			const delinquentPreviousYears = [];

			for (const yearData of previousYears) {
				// Find modal data for this year
				const modalInfo = modalData.find(m => m.year === yearData.year);
				
				let isDelinquent = false;
				
				if (modalInfo) {
					// Check if unpaid and past delq_date
					if (modalInfo.status === "UNPAID" && modalInfo.delq_date) {
						if (is_delq(modalInfo.delq_date)) {
							isDelinquent = true;
						}
					}
				} else {
					// Fallback to table data
					if (yearData.status_table === "UNPAID") {
						// Assume delinquent if it's a previous year and unpaid
						isDelinquent = true;
					}
				}

				if (isDelinquent) {
					delinquentPreviousYears.push(yearData.year);
					yearsToProcess.push(yearData.year);
				}
			}

			// Build tax_history for selected years only
			data.tax_history = [];

			for (const year of yearsToProcess) {
				const tableInfo = allYearsData.find(y => y.year === year);
				const modalInfo = modalData.find(m => m.year === year);

				let taxEntry = {
					jurisdiction: "County",
					year: year,
					payment_type: "Annual",
					status: "Due",
					base_amount: "$0.00",
					amount_paid: "$0.00",
					amount_due: "$0.00",
					mailing_date: "N/A",
					due_date: `01/05/${parseInt(year) + 1}`,
					delq_date: `01/06/${parseInt(year) + 1}`,
					paid_date: "",
					good_through_date: ""
				};

				if (modalInfo) {
					taxEntry.base_amount = modalInfo.base_amount;
					taxEntry.amount_paid = modalInfo.amount_paid;
					taxEntry.paid_date = modalInfo.paid_date;
					
					if (modalInfo.delq_date) {
						taxEntry.delq_date = modalInfo.delq_date;
					}

					if (modalInfo.status === "PAID") {
						taxEntry.status = "Paid";
						taxEntry.base_amount=modalInfo.amount_paid;
						taxEntry.amount_due = "$0.00";
					} else {
						// Check if delinquent
						if (is_delq(taxEntry.delq_date)) {
							taxEntry.status = "Delinquent";
						} else {
							taxEntry.status = "Due";
						}
						taxEntry.amount_due = modalInfo.base_amount;
					}
				} else if (tableInfo) {
					// Fallback to table data
					if (tableInfo.status_table === "PAID") {
						taxEntry.status = "Paid";
						taxEntry.amount_due = "$0.00";
					} else {
						taxEntry.amount_due = tableInfo.amount_due_table;
						taxEntry.base_amount = tableInfo.amount_due_table;
						
						// Check if delinquent
						if (is_delq(taxEntry.delq_date)) {
							taxEntry.status = "Delinquent";
						} else {
							taxEntry.status = "Due";
						}
					}
				}

				data.tax_history.push(taxEntry);
			}

			// Sort tax_history descending
			data.tax_history.sort((a, b) => parseInt(b.year) - parseInt(a.year));

			// Set delinquent flag and notes
			const latestTax = data.tax_history[0];
			const latestStatus = latestTax.status;
			const nextYear = parseInt(latestYear) + 1;

			if (delinquentPreviousYears.length > 0) {
				data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				data.notes = `PRIORS YEAR(S) ARE DELINQUENT, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 01/05`;
			} else {
				data.delinquent = "NONE";
				if (latestStatus === "Paid") {
					data.notes = `ALL PRIOR YEAR(S) ARE PAID, ${latestYear} TAXES ARE PAID. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 01/05`;
				} else {
					data.notes = `ALL PRIOR YEAR(S) ARE PAID, ${latestYear} TAXES ARE ${latestStatus.toUpperCase()}. NORMALLY TAXES ARE PAID ANNUALLY. NORMAL DUE DATE IS 01/05.`;
				}
			}

			// Clean up temporary data
			delete data.all_years_data;
			delete data.modal_data;

			resolve(data);
		} catch (error) {
			console.log("dc_6 error:", error);
			reject(error);
		}
	});
};

// Main account search function
const account_search = async (page, account) => {
    return new Promise((resolve, reject) => {
        try {
            dc_1(page, account)
            .then((data1) => {
                dc_2(page, account)
                .then((data2) => {
                   dc_3(page, data2,account)
                    .then((data3) => {
                        dc_4(page, data3, account)
                        .then((data4) => {
                            dc_5(page, data4, account)
                            .then((data5) => {
                                dc_6(page, data5, account)
                                .then((data6) => {
                                    resolve(data6)
                                })
                                .catch((error) => {
                                    console.log("Error in ac_6:", error);
                                    reject(error);
                                });
                            })
                            .catch((error) => {
                                console.log("Error in ac_5:", error);
                                reject(error);
                            });
                        })
                        .catch((error) => {
                            console.log("Error in ac_4:", error);
                            reject(error);
                        });
                    })
                    .catch((error) => {
                        console.log("Error in ac_3:", error);
                        reject(error);
                    });
                })
                .catch((error) => {
                    console.log("Error in ac_2:", error);
                    reject(error);
                });
            })
            .catch((error) => {
                console.log("Error in ac_1:", error);
                reject(error);
            });
        } catch (error) {
            console.log("Synchronous error:", error);
            reject(new Error(error.message));
        }
    });
};
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

export { search };
