import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
	timeout: 90000
};

const get_proper_year = (str) => {
	let first_year = str.substr(0, 2);
	let second_year = str.substr(2);
	let year = (2000 + +first_year) + "-" + (2000 + +second_year);
	return year
}

const get_next_day = (date) => {
	const next_date = new Date(date);
	next_date.setDate(next_date.getDate() + 1);
	return (+next_date.getMonth() + 1) + "/" + next_date.getDate() + "/" + next_date.getFullYear();
}

const get_status = (status, date) => {
	if(status == "PAID"){
		return "Paid";
	}
	else {
		let today = new Date();
		let delq_date = new Date(get_next_day(date));
		if(today >= delq_date){
			return "Delinquent";
		}
		return "Due";
	}
}

const format_amount = (amt) => {
	return "$"+amt;
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#LookupWidget form", timeout_option);

			// FILL THE FORM
			await page.select('#LookupWidget form select[name="billtype"]', 'LookupBarWidget-BillTypes-Secured');
			await page.select('#LookupWidget form select[name="searchtype"]', 'LookupBarWidget-SearchTypes-APN');
			await page.locator('#LookupWidget form input[name="searchField"]').fill(account);
			await page.locator('#LookupWidget form input[type="submit"]').click();

			// WAIT FOR THE RESULT
			const ajax_url = `https://taxcolp.cccttc.us/api/lookup/apn?apn=${account}`;
			page.on('response', async (response) => {
				if (response.url().includes(ajax_url)) {	
					let data = await response.json();					
					resolve(data);
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

			if(data['displayMessage'] && data['displayMessage'] == "Invalid Parcel Number"){
				reject(new Error("Invalid Parcel Number"));
			}

			// OWNER AND PROPERT DETAILS
			const main_data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: ["N/A"],
				property_address: data['details']['address'],
				parcel_number: data['details']['apn'],
				land_value: "",
				improvements: "",
				total_assessed_value: format_amount(data['assessment']['grossValue']),
				exemption: "",
				total_taxable_value: format_amount(data['assessment']['totalNetTaxableValue']),
				taxing_authority: "CONTRA COSTA COUNTY TAX COLLECTOR, 625 COURT STREET, ROOM 100, MARTINEZ, CA 94553-0063",
				notes: "",
				delinquent:"NONE",			
				tax_history: []
			};

			// CURRENT YEAR STRING
			let current_year = "";
			let current_year_str = data['assessment']['assessmentYear'].split("-");
			current_year_str.forEach((y, i)=> {
				current_year += String(+y % 100);
			});

			// GET THE CURRENT AND UNPAID YEARS
			let history_map = {};
			data['installments'].forEach((d, i) => {
				if(d['priorYear'] && d['type'] == 'SECURED' &&  d['status'] == 'NOT PAID'){
					history_map[d['priorYearTaxYear']] = [];
				}
				else if(!d['priorYear']){
					history_map[current_year] = [];
				}

				// DELINQUENT STATUS
				if(d['type'] == 'SECURED' && d['isDelinquent']){
					main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}
			});

			// POPULATE THE HISTORY MAP
			data['installments'].forEach((d, i) => {
				let year = "";
				let base_amount = "";

				if(d['priorYear'] && d['type'] == 'SECURED'){
					year = d['priorYearTaxYear'];
					base_amount = format_amount(+(d['priorYearAdValoremTax'].replace(/[,]/g, "")) + +(d['priorYearSpecialAssessments'].replace(/[,]/g, "")));
				}
				else if(!d['priorYear']){
					year = current_year;
					base_amount = format_amount(d['amount']);
				}

				if(history_map[year]){ 
					let th = {
						id: d['installmentNumber'],
						jurisdiction: "County",
						year: get_proper_year(year),
						payment_type: "Installment " + d['installmentNumber'],
						status: get_status(d['status'], d['dateDue']),
						base_amount: base_amount,
						amount_paid: (d['status'] == "PAID") ? format_amount(d['amount']) : "$0.00",
						amount_due: (d['status'] == "PAID") ? "$0.00" : format_amount(d['amount']),
						mailing_date: "N/A",
						due_date: d['dateDue'],
						delq_date: get_next_day(d['dateDue']),
						paid_date: d['paidDate'] ?? "",
						good_through_date: "",
					};

					if(th['id'] == 1){
						history_map[year].unshift(th);
					}
					else if(th['id'] > 1){
						history_map[year].push(th);
					}				
				}
			});

			let first_str = "";
			let second_str = "";
			for(let year in history_map){
				history_map[year].forEach((h, i)=> {
					main_data['tax_history'].push(h);

					if(year == current_year){
						if(h['id'] == 1){
							first_str = `${h['year']} 1ST INSTALLMENT IS ${h['status'].toUpperCase()},`;
						}
						else{
							second_str = `2ND INSTALLMENT IS ${h['status'].toUpperCase()},`;
						}
					}
				});
			}

			// NOTES - PRIOR YEAR'S DATA
			main_data['notes'] = (Object.keys(history_map).length > 1) ? "PRIORS ARE DELINQUENT, " : "All PRIORS ARE PAID, ";
			main_data['notes'] += `${first_str} ${second_str} NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 12/10 AND 04/10`

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {
				
				ac_2(page, data1, account)
				.then((data2) => {
					resolve(data2);
				})
				.catch((error)=>{
					console.log(error);
					reject(new Error(error.message));
				});

			})
			.catch((error)=>{
				console.log(error);
				reject(new Error(error.message));
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
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

		const url = "https://taxcolp.cccttc.us/lookup/";

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
				});
			})
			.catch((error) => {
				console.log(error);
				res.status(500).json({
					error: true,
					message: error.message
				});
			})
			.finally(async() => {
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

export {
	search
}