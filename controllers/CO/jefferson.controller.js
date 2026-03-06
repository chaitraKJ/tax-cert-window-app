const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const get_next_date = (date) => {
	const next_date = new Date(date);
	next_date.setDate(next_date.getDate() + 1);
	return (+next_date.getMonth() + 1) + "/" + next_date.getDate() + "/" + next_date.getFullYear();
}

const get_status = (date) => {
	const today = new Date();
	const delq_date = new Date(date);

	let real_status = "Due";
	let is_delq = false;

	if(today >= delq_date){
		real_status = "Delinquent";
		is_delq = true;
	}
	return { real_status, is_delq };
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#pin");
			await page.locator("#pin").fill(account);

			// WAIT FOR AJAX CALL
			page.on("response", async (response) => {
				const search_url = "https://treasurerpropertysearch.jeffco.us/api/pin";
				if (response.url().includes(search_url) && response.ok()) {
					let data = await response.json();

					if(data['totalCount'] == 0){
						reject(new Error("Record not found"));
					}
					else{
						resolve(data);
					}
				}
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const ac_2 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const uniquePropertyId = data['items'][0]['uniquePropertyId'];
			const url = `https://treasurerpropertysearch.jeffco.us/propertyrecordssearch/owner/property/details/${uniquePropertyId}`;

			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			let count = 0;
			let main_data = {};

			page.on('response', async (response) => {

				const search_url_1 = "https://treasurerpropertysearch.jeffco.us/api/property/";
				const search_url_2 = "https://treasurerpropertysearch.jeffco.us/api/taxChargeAndPayment/";
				const search_url_3 = "https://treasurerpropertysearch.jeffco.us/api/taxPayment/";

				if (response.url().includes(search_url_1) && response.ok() || 
					response.url().includes(search_url_2) && response.ok() ||
					response.url().includes(search_url_3) && response.ok()) {
					let data = await response.json();
				count++;

				if(response.url().includes(search_url_1)){
					main_data['property'] = data;
				}
				else if(response.url().includes(search_url_2)){
					main_data['taxChargeAndPayment'] = data;
				}
				else if(response.url().includes(search_url_3)){
					main_data['taxPayment'] = data;
				}

				if(count == 3){
					resolve(main_data);
				}
			}
		});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	});
}

const ac_3 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{

			const get_formated_date = (date) => {
				let d  = new Date(date); 
				return (+d.getMonth()+1) + "/" + d.getDate() + "/" + d.getFullYear();
			}

			await page.waitForSelector("nav[aria-label='Payable Tax Information'] h2");

			const year = await page.evaluate(() => {
				let s_year = document.querySelector("nav[aria-label='Payable Tax Information']")?.querySelector("h2")?.textContent.split(" ")[0];
				return s_year;
			});

			const main_data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: [],
				property_address: "",
				parcel_number: "",
				land_value: "",
				improvements: "",
				total_assessed_value: "",
				exemption: "",
				total_taxable_value: "",
				taxing_authority: "JEFFERSON COUNTY TREASURER, 100 Jefferson County Pkwy, Ste 2520, Golden, CO 80419-2520",	
				notes: "",
				delinquent:"NONE",		
				tax_history: []
			};

			// PARCEL INFORMATION / ADDRESS / OWNER INFO
			main_data['parcel_number'] = data['property']['propertyDetails']['ain'];
			main_data['property_address'] = data['property']['propertyDetails']['propertyAddress'] + ", " + data['property']['propertyDetails']['propertyCityStateZip'];
			data['property']['propertyDetails']['ownerList'].forEach((owner, i) => {
				main_data['owner_name'].push(owner['displayName']);
			});

			// TAX AMOUNTS
			const total_tax_amount = data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullOriginalBill'];
			const mill_levy = data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['totalMillLevy']
			const half_amount = (total_tax_amount / 2).toFixed(2);

			// CALCULATE ASSESSED VALUE
			let assessed_value = Math.round((total_tax_amount * 1000) / mill_levy);
			main_data['total_assessed_value'] = '$' + assessed_value + ".00";
			main_data['total_taxable_value'] = '$' + assessed_value + ".00";

			// DATES
			let next_year = +year + 1;
			let annual_due_date = `4/30/${next_year}`;
			let annual_delq_date = get_next_date(annual_due_date);

			let first_half_due_date = `02/28/${next_year}`;
			let first_half_delq_date = get_next_date(first_half_due_date);

			let second_half_due_date = `06/16/${next_year}`;
			let second_half_delq_date = get_next_date(second_half_due_date);


			if(data['taxPayment']['taxPaymentDetailsList'].length == 0){
				// BOTH INSTALLMENTS ARE NOT PAID

				let th_1 = {
					jurisdiction: "County",
					year: year,
					payment_type: "Intallment 1",
					status: "Due",
					base_amount: "$"+half_amount,
					amount_paid: "$0.00",
					amount_due: "$"+ data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['halfBalanceDue'],
					mailing_date: "N/A",
					due_date: first_half_due_date,
					delq_date: first_half_delq_date,
					paid_date: "",
					good_through_date: "",
				}

				let second_half_amt = (+data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullBalanceDue'] - data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['halfBalanceDue']).toFixed(2);
				let th_2 = {
					jurisdiction: "County",
					year: year,
					payment_type: "Intallment 2",
					status: "Due",
					base_amount: "$"+ half_amount,
					amount_paid: "$0.00",
					amount_due: "$"+ second_half_amt,
					mailing_date: "N/A",
					due_date: second_half_due_date,
					delq_date: second_half_delq_date,
					paid_date: "",
					good_through_date: "",
				}

				let status_1 = get_status(first_half_delq_date);
				let status_2 = get_status(second_half_delq_date);

				th_1['status'] = status_1['real_status'];
				th_2['status'] = status_2['real_status'];

				main_data['tax_history'].push(th_1);
				main_data['tax_history'].push(th_2);

				main_data['notes'] = `ALL PRIORS ARE PAID, ${year}-${next_year} 1ST HALF TAXES ARE ${th_1['status'].toUpperCase()}, 2ND HALF TAXES ARE ${th_2['status'].toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ARE 04/30 FOR ANNUAL AND 02/28 & 06/16 FOR SEMI-ANNUAL`;
				main_data['delinquent'] = (status_1['is_delq'] || status_2['is_delq']) ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

			}
			else{
				const general_tax_arr = data['taxPayment']['taxPaymentDetailsList'].filter((d, i) => {
					if(d['paymentTypeDescription'] == 'General Tax'){
						return d;
					}
				});

				if(data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullBalanceDue'] == "0" && general_tax_arr.length == 1){
					// ALL PAID - ANNUALLY

					let th = {
						jurisdiction: "County",
						year: year,
						payment_type: "Annual",
						status: "Paid",
						base_amount: "$"+total_tax_amount,
						amount_paid: "$"+general_tax_arr[0]['paymentAmount'],
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: annual_due_date,
						delq_date: annual_delq_date,
						paid_date: get_formated_date(general_tax_arr[0]['paymentDate']),
						good_through_date: "",
					}
					main_data['tax_history'].push(th);

					main_data['notes'] = `ALL PRIORS ARE PAID, ${year}-${next_year} TAXES ARE PAID , NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 04/30 FOR ANNUAL AND 02/28 & 06/16 FOR SEMI-ANNUAL`;
					main_data['delinquent'] = `NONE`;
				}
				else if(data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullBalanceDue'] == "0" && general_tax_arr.length >= 2){
					// ALL PAID - INSTALLMENT

					let th_1 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Intallment 1",
						status: "Paid",
						base_amount: "$"+half_amount,
						amount_paid: "$"+general_tax_arr[0]['paymentAmount'],
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: first_half_due_date,
						delq_date: first_half_delq_date,
						paid_date: get_formated_date(general_tax_arr[0]['paymentDate']),
						good_through_date: "",
					}
					let th_2 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Intallment 2",
						status: "Paid",
						base_amount: "$"+ half_amount,
						amount_paid: "$"+general_tax_arr[1]['paymentAmount'],
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: second_half_due_date,
						delq_date: second_half_delq_date,
						paid_date: get_formated_date(general_tax_arr[1]['paymentDate']),
						good_through_date: "",
					}

					main_data['tax_history'].push(th_1);
					main_data['tax_history'].push(th_2);

					main_data['notes'] = `ALL PRIORS ARE PAID, ${year}-${next_year} 1ST HALF TAXES ARE PAID, 2ND HALF TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 FOR ANNUAL AND 02/28 & 06/16 FOR SEMI-ANNUAL`;
					main_data['delinquent'] = `NONE`;
				}
				else if(data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullBalanceDue'] != "0" && general_tax_arr.length >= 1){
					// 1ST INSTALLMENT PAID, 2ND INSTALLMENT NOT PAID

					let th_1 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Intallment 1",
						status: "Paid",
						base_amount: "$"+half_amount,
						amount_paid: "$"+general_tax_arr[0]['paymentAmount'],
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: first_half_due_date,
						delq_date: first_half_delq_date,
						paid_date: get_formated_date(general_tax_arr[0]['paymentDate']),
						good_through_date: "",
					}
					let th_2 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Intallment 2",
						status: "Due",
						base_amount: "$"+ half_amount,
						amount_paid: "$0.00",
						amount_due: "$"+ data['taxChargeAndPayment']['taxChargeAndPaymentDetails']['fullBalanceDue'],
						mailing_date: "N/A",
						due_date: second_half_due_date,
						delq_date: second_half_delq_date,
						paid_date: "",
						good_through_date: "",
					}

					let { real_status, is_delq } = get_status(second_half_delq_date);
					th_2['status'] = real_status;

					main_data['tax_history'].push(th_1);
					main_data['tax_history'].push(th_2);

					main_data['notes'] = `ALL PRIORS ARE PAID, ${year}-${next_year} 1ST HALF TAXES ARE PAID, 2ND HALF TAXES ARE ${th_2['status'].toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ARE 04/30 FOR ANNUAL AND 02/28 & 06/16 FOR SEMI-ANNUAL`;
					main_data['delinquent'] = is_delq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
				}

			}

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	});
}

const account_search = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1, account)
				.then((data2) => {

					ac_3(page, data2, account)
					.then((data3) => {
						resolve(data3);

					})
					.catch((error) => {
						console.log(error);
						reject(new Error(error.message))
					});

				})
				.catch((error) => {
					console.log(error);
					reject(new Error(error.message))
				});

			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message))
			});


		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	});
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

		const url = 'https://treasurerpropertysearch.jeffco.us/propertyrecordssearch/pin';

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
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
			// FRONTEND ENDPOINT
			account_search(page, url, account)
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
			});
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, url, account)
			.then((data) => {
				res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error);
				res.status(500).json({
					error: true,
					message: error.message
				})
			})
			.finally(async () => {
				await context.close();
			});
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