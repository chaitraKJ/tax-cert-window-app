//Author:Dhanush

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js"; 
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

// Search for parcel
const jc_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {

			// SEARCH PAGE
			const url = `https://jeffersoncountyoh.com/auditor/real-estate`;
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// PARCEL FIELD
			await page.waitForSelector('input[type="email"]', timeout_option);
			const inputs = await page.$$('input[type="email"]');
			if (inputs.length < 4) return reject(new Error("Parcel input not found"));
			await inputs[3].type(account);

			// SEARCH CLICK
			await page.waitForSelector('button.btn.btn-primary', timeout_option);
			await page.click('button.btn.btn-primary');

			// RESULTS TABLE
			await page.waitForSelector('#search-results table');
			const rowCount = await page.$$eval('#search-results table tbody tr.clickable', rows => rows.length);

			if (rowCount !== 1) {
				return reject(new Error(rowCount === 0 ? "No Record Found" : "Account Number is Invalid"));
			}

			// OPEN NEW TAB SAFELY
			const detailPage = await new Promise((resolve2, reject2) => {
				let timeout = setTimeout(() => {
					page.browser().off('targetcreated', listener);
					reject2(new Error("New tab did not open"));
				}, 15000);

				const listener = async target => {
					try {
						if (target.type() === 'page') {
							const p = await target.page();
							if (!p) return; // sometimes null

							clearTimeout(timeout);
							page.browser().off('targetcreated', listener);
							resolve2(p);
						}
					} catch (err) {
						reject2(err);
					}
				};

				page.browser().on('targetcreated', listener);
				page.click('#search-results table tbody tr.clickable'); // action
			});

			if (!detailPage) return reject(new Error("Failed to capture new detail page"));

			// FOCUS PAGE
			await detailPage.bringToFront().catch(() => {});

			// HARD RELOAD (GUARANTEED)
			await detailPage.evaluate(() => location.reload()).catch(() => {});
			await detailPage
				.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 })
				.catch(() => {});

			resolve(detailPage);

		} catch (error) {
			console.log("JC ERROR:", error.message);
			reject(new Error(error.message));
		}
	});
};


// Extract parcel information from detail page
const jc_2 = async (detailPage, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const page_data = await detailPage.evaluate(() => {
				const datum = {
					processed_date: "",
					order_number: "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "",
					land_value: "N/A",
					improvements: "N/A",
					total_assessed_value: "",
					exemption: "N/A",
					total_taxable_value: "",
					taxing_authority: "Jefferson County Auditor, (740) 283-8518",	
					notes: "",
					delinquent: "NONE",			
					tax_history: []
				}

				// Helper function to get text content safely
				const getTextByLabel = (label) => {
					const strong = Array.from(document.querySelectorAll('strong')).find(s => s.textContent.trim() === label);
					if (!strong) return "";

					const br = strong.nextElementSibling;
					if (br && br.tagName === 'BR' && br.nextSibling) {
						return br.nextSibling.textContent.trim();
					}

					const next = strong.nextSibling;
					if (next && next.nodeType === 3) {
						return next.textContent.trim();
					}
					return "";
				};

				// PARCEL ID
				datum['parcel_number'] = getTextByLabel('Parcel Id');

				// OWNER
				datum['owner_name'][0] = getTextByLabel('Owner');

				// LOCATION ADDRESS
				datum['property_address'] = getTextByLabel('Location Address');

				// MARKET VALUES
				const landValue = getTextByLabel('Land Value');
				const improvementValue = getTextByLabel('Improvement Value');
				const totalValue = getTextByLabel('Total Value (Taxed)');

				datum['land_value'] = landValue ? "$" + landValue : "N/A";
				datum['improvements'] = improvementValue ? "$" + improvementValue : "N/A";
				datum['total_assessed_value'] = totalValue ? "$" + totalValue : "N/A";
				datum['total_taxable_value'] = totalValue ? "$" + totalValue : "N/A";

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

//Extract tax information and build status data
const jc_3 = async (detailPage, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const tax_data = await detailPage.evaluate(() => {
				const tax_info = {
					tax_year: "",
					delinquent_year: "0",
					taxes_billed_total: "",
					first_half_billed: "",
					second_half_billed: "",
					first_half_balance: "",
					second_half_balance: "",
					total_balance: "",
					payment_history: []
				};

				// TAX YEAR
				const taxYearDiv = document.querySelector('.col-md-6.mt-3.text-center');
				if(taxYearDiv && taxYearDiv.textContent.includes('Tax Year:')) {
					const match = taxYearDiv.textContent.match(/Tax Year:\s*(\d{4})/);
					if(match) tax_info['tax_year'] = match[1];
				}

				// DELINQUENT YEAR
				const delqFont = Array.from(document.querySelectorAll('font')).find(el => 
					el.textContent.trim() !== '0' && 
					el.previousElementSibling && 
					el.previousElementSibling.textContent.includes('Certified Delinquent Year')
				);
				if(delqFont) {
					tax_info['delinquent_year'] = delqFont.textContent.trim();
				}

				// TAX CHARGES TABLE
				const taxTable = document.querySelector('table[border="1"]');
				if(taxTable) {
					const rows = taxTable.querySelectorAll('tr');
					
					for(let row of rows) {
						const cells = row.querySelectorAll('td');
						if(cells.length >= 4) {
							const label = cells[0].textContent.trim();
							const firstHalf = cells[1].textContent.trim();
							const secondHalf = cells[2].textContent.trim();
							const total = cells[3].textContent.trim();

							if(label === 'Net General') {
								tax_info['taxes_billed_total'] = total;
								tax_info['first_half_billed'] = firstHalf;
								tax_info['second_half_billed'] = secondHalf;
							}
							else if(label === 'Balances') {
								tax_info['first_half_balance'] = firstHalf;
								tax_info['second_half_balance'] = secondHalf;
								tax_info['total_balance'] = total;
							}
						}
					}
				}

				// PAYMENT HISTORY TABLE
				const paymentTable = document.querySelector('table[border="2"]');
				if(paymentTable) {
					const rows = paymentTable.querySelectorAll('tr');
					for(let row of rows) {
						const cells = row.querySelectorAll('td');
						if(cells.length === 2) {
							const dateText = cells[0].textContent.trim();
							const amountText = cells[1].textContent.trim();
							
							if(!dateText.includes('Date Paid') && !dateText.includes('Totals')) {
								tax_info['payment_history'].push({
									date: dateText,
									amount: amountText
								});
							}
						}
					}
				}

				return tax_info;
			});

			// Format amount function - adds $ if not present
			const formatAmount = (amount) => {
				if(!amount || amount === "") return "$0.00";
				amount = amount.trim();
				if(amount.startsWith("$")) return amount;
				return "$" + amount;
			};

			// Create status_data structure like Maricopa
			const status_data = {};
			
			if(tax_data.tax_year) {
				const year = parseInt(tax_data.tax_year);
				const totalBalance = parseFloat(tax_data.total_balance.replace(/[$,]/g, '')) || 0;
				const firstHalfBalance = parseFloat(tax_data.first_half_balance.replace(/[$,]/g, '')) || 0;
				const secondHalfBalance = parseFloat(tax_data.second_half_balance.replace(/[$,]/g, '')) || 0;
				const displayYear=`${year}-${year+1}`;

				// Determine overall status
				let yearStatus = "Unpaid";
				if(totalBalance === 0) {
					yearStatus = "Paid";
				}

				// Check if delinquent
				const is_delinquent = (tax_data.delinquent_year !== "0");

				status_data[year] = {
					status: yearStatus,
					base_amount: formatAmount(tax_data.taxes_billed_total),
					delinquent_year: tax_data.delinquent_year,
					is_delinquent: is_delinquent,
					first_half_billed: formatAmount(tax_data.first_half_billed),
					second_half_billed: formatAmount(tax_data.second_half_billed),
					first_half_balance: formatAmount(tax_data.first_half_balance),
					second_half_balance: formatAmount(tax_data.second_half_balance),
					total_balance: formatAmount(tax_data.total_balance),
					payment_history: tax_data.payment_history,
					history: []
				};

				// Build history array based on payment status
				if(yearStatus === "Paid") {
					// ALL PAID
					if(tax_data.payment_history.length >= 2) {
						// TWO PAYMENTS
						const firstPayment = tax_data.payment_history[0];
						const secondPayment = tax_data.payment_history[1];

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Paid",
							base_amount: formatAmount(tax_data.first_half_billed),
							amount_paid: formatAmount(firstPayment.amount),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: `02/15/${parseInt(year) + 1}`,
							delq_date: `02/16/${parseInt(year) + 1}`,
							paid_date: firstPayment.date,
							good_through_date: ""
						});

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Paid",
							base_amount: formatAmount(tax_data.second_half_billed),
							amount_paid: formatAmount(secondPayment.amount),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: `07/15/${parseInt(year) + 1}`,
							delq_date: `07/16/${parseInt(year) + 1}`,
							paid_date: secondPayment.date,
							good_through_date: ""
						});
					} else if(tax_data.payment_history.length === 1) {
						// ONE PAYMENT FOR FULL YEAR
						const singlePayment = tax_data.payment_history[0];

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Paid",
							base_amount: formatAmount(tax_data.first_half_billed),
							amount_paid: formatAmount(tax_data.first_half_billed),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: `02/15/${parseInt(year) + 1}`,
							delq_date: `02/16/${parseInt(year) + 1}`,
							paid_date: singlePayment.date,
							good_through_date: ""
						});

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Paid",
							base_amount: formatAmount(tax_data.second_half_billed),
							amount_paid: formatAmount(tax_data.second_half_billed),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: `07/15/${parseInt(year) + 1}`,
							delq_date: `07/16/${parseInt(year) + 1}`,
							paid_date: singlePayment.date,
							good_through_date: ""
						});
					}
				} else {
					// UNPAID OR PARTIAL
					if(tax_data.payment_history.length > 0) {
						// FIRST HALF PAID, SECOND HALF DUE
						const firstPayment = tax_data.payment_history[0];

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Paid",
							base_amount: formatAmount(tax_data.first_half_billed),
							amount_paid: formatAmount(firstPayment.amount),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: `02/15/${parseInt(year) + 1}`,
							delq_date: `02/16/${parseInt(year) + 1}`,
							paid_date: firstPayment.date,
							good_through_date: ""
						});

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Due",
							base_amount: formatAmount(tax_data.second_half_billed),
							amount_paid: "$0.00",
							amount_due: formatAmount(tax_data.second_half_balance),
							mailing_date: "N/A",
							due_date: `07/15/${parseInt(year) + 1}`,
							delq_date: `07/16/${parseInt(year) + 1}`,
							paid_date: "",
							good_through_date: ""
						});
					} else {
						// BOTH HALVES UNPAID
						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Due",
							base_amount: formatAmount(tax_data.first_half_billed),
							amount_paid: "$0.00",
							amount_due: formatAmount(tax_data.first_half_balance),
							mailing_date: "N/A",
							due_date: `02/15/${parseInt(year) + 1}`,
							delq_date: `02/16/${parseInt(year) + 1}`,
							paid_date: "",
							good_through_date: ""
						});

						status_data[year].history.push({
							jurisdiction: "County",
							year: displayYear,
							payment_type: "Semi-Annual",
							status: "Due",
							base_amount: formatAmount(tax_data.second_half_billed),
							amount_paid: "$0.00",
							amount_due: formatAmount(tax_data.second_half_balance),
							mailing_date: "N/A",
							due_date: `07/15/${parseInt(year) + 1}`,
							delq_date: `07/16/${parseInt(year) + 1}`,
							paid_date: "",
							good_through_date: ""
						});
					}
				}
			}

			resolve({
				data: data,
				status_data: status_data,
				max_year: tax_data.tax_year
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

// Process delinquency and build final tax history
const jc_4 = async (page, main_data, account, yearsRequested = 1) => {
    return new Promise(async (resolve, reject) => {
        try {
            let status_data = main_data['status_data'];
            let max_year = main_data['max_year'];
            let data = main_data['data'];

            const main_history_data = [];
            let has_delinquent = false;
            let delinquent_year = "0";

            // Build history and check for delinquency
            for (const year in status_data) {
                let yearData = status_data[year];
                let history = yearData['history'];
                let is_delinquent = yearData['is_delinquent'];

                if (is_delinquent && yearData['delinquent_year'] !== "0") {
                    delinquent_year = yearData['delinquent_year'];
                    has_delinquent = true;
                }

                history.forEach((h) => {
                    if (h['status'] === "Due") {
                        if (is_delq(h['delq_date'])) {
                            h['status'] = "Delinquent";
                            has_delinquent = true;
                        }
                    }
                    main_history_data.push(h);
                });
            }

            // Create display year like 2024-2025
            const displayYear = max_year ? `${max_year}-${parseInt(max_year) + 1}` : "";

            // === NOTES LOGIC ===
            let priorNote = "";
            let currentNote = "";
            let specialLimitationNote = "";

            // If client asked for more than 1 year, but site only provides current
            if (yearsRequested > 1) {
                specialLimitationNote = "AS PER THE TAX COLLECTOR WEBSITE ONLY CURRENT YEAR TAXES ARE AVAILABLE.";
            }

            if (has_delinquent) {
                data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";

                const yearData = status_data[max_year];
                if (yearData) {
                    const history = yearData['history'];
                    let firstHalfStatus = history[0] ? history[0]['status'] : "Due";
                    let secondHalfStatus = history[1] ? history[1]['status'] : "Due";

                    if (delinquent_year !== "0" && delinquent_year !== max_year) {
                        priorNote = "PRIOR TAXES ARE DELINQUENT. ";
                    } else {
                        priorNote = "ALL PRIORS ARE PAID. ";
                    }

                    if (displayYear) {
                        currentNote = `${displayYear} 1ST INSTALLMENT IS ${firstHalfStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalfStatus.toUpperCase()}`;
                    } else {
                        currentNote = `CURRENT YEAR 1ST INSTALLMENT IS ${firstHalfStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalfStatus.toUpperCase()}`;
                    }
                }
            } else {
                // No delinquency
                data['delinquent'] = "NONE";

                const yearData = status_data[max_year];
                if (yearData) {
                    if (yearData['status'] === "Paid") {
                        priorNote = "ALL PRIORS ARE PAID. ";

                        if (displayYear) {
                            if (yearData['payment_history'].length >= 2) {
                                currentNote = `${displayYear} 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID`;
                            } else if (yearData['payment_history'].length === 1) {
                                currentNote = `${displayYear} 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID HERE TAXES ARE ANNUALLY`;
                            } else {
                                currentNote = `${displayYear} 1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID`;
                            }
                        } else {
                            currentNote = "CURRENT YEAR TAXES ARE PAID";
                        }
                    } else {
                        const history = yearData['history'];
                        let firstHalfStatus = history[0] ? history[0]['status'] : "Due";
                        let secondHalfStatus = history[1] ? history[1]['status'] : "Due";

                        priorNote = "ALL PRIORS ARE PAID. ";
                        if (displayYear) {
                            currentNote = `${displayYear} 1ST INSTALLMENT IS ${firstHalfStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalfStatus.toUpperCase()}`;
                        } else {
                            currentNote = `CURRENT YEAR 1ST INSTALLMENT IS ${firstHalfStatus.toUpperCase()}, 2ND INSTALLMENT IS ${secondHalfStatus.toUpperCase()}`;
                        }
                    }
                }
            }

            // Normal due dates note - dynamic year
            let normalDueDatesNote = ". NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 02/15 AND 07/15";
            if (max_year) {
                const nextYear = parseInt(max_year) + 1;
                normalDueDatesNote = `. NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 02/15/${nextYear} AND 07/15/${nextYear}`;
            }

            // Final notes assembly
            data['notes'] = specialLimitationNote + priorNote + currentNote + normalDueDatesNote;

            // Edge case: no tax data
            if (!max_year || main_history_data.length === 0) {
                data['notes'] = "As per the tax collector website only current year taxes are available. NO TAXES DUE, POSSIBLY EXEMPT.";
                data['delinquent'] = "NONE";
            }

            // Assign final history
            data['tax_history'] = main_history_data;

            // Metadata
            data['years_requested'] = yearsRequested;
            data['years_returned'] = max_year ? 1 : 0;
            data['has_delinquent'] = has_delinquent;
            data['delinquent_years'] = delinquent_year !== "0" ? [delinquent_year] : [];

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const account_search = async (page, account,yearsRequested=1) => {
	return new Promise(async (resolve, reject) => {
		try{
			jc_1(page, account)
			.then((detailPage) => {
				jc_2(detailPage, account)
				.then((data1) => {
					jc_3(detailPage, data1, account)
					.then((data2) => {
						jc_4(page, data2, account,yearsRequested)
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

const search = async (req, res) => {
	const { fetch_type, account ,client} = req.body;
	
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
	    const yearsRequested = getOHCompanyYears(client);

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

		page.setDefaultNavigationTimeout(90000);

		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'image') {
				req.abort();
			} else {
				req.continue();
			}
		});

		if(fetch_type === "html"){
			account_search(page, account,yearsRequested)
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
			account_search(page, account,yearsRequested)
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

export {
	search
}