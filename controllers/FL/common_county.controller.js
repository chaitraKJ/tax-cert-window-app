const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const get_client_years = require("../../utils/configs/client.config.js");

const timeout_option = {
	timeout: 90000
};

const get_proper_date = (date) => {
	const d = new Date(date);
	const str = (+d.getMonth()+1) + "/" + d.getDate() + "/" + d.getFullYear();
	return str;
};

const replace_link = (url, url_county, county) => {
	if(url){
		let id = url.replace(`https://county-taxes.net/${url_county}/property-tax/`, "");
		url = `https://county-taxes.net/iframe-taxsys/${county}.county-taxes.com/govhub/property-tax/` + id + `?search_query=&search_target=&search_category=property-tax`;
		return url;
	}
	return null;
};

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return true;
	}
	return false;
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			// PARCEL SEARCHING PLACE
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// FILL INPUT
			await page.waitForSelector('input[role="searchbox"]', timeout_option);
			await page.locator('input[role="searchbox"]').fill(account);

			const selector_promise = page.waitForSelector('.vbt-autcomplete-list a', timeout_option).then(() => { return { id:1 }});
			const iframe_promise = page.waitForSelector('iframe[title="Main Content"]', timeout_option).then(() => { return { id:2 }});
			Promise.any([
				selector_promise,
				iframe_promise
			])
			.then(async (data) => { 

				if(data['id'] == 1){

					Promise.all([
						page.locator('.vbt-autcomplete-list a').click(),
						page.waitForSelector('iframe[title="Main Content"]', timeout_option)
					])
					.then(async () => {
						const src = await page.evaluate(() => {
							const temp = document.querySelector('iframe[title="Main Content"]').src;
							return temp;
						});
						resolve(src);						
					})
					.catch((error) => {
						console.log(error);
						reject(new Error("No Record Found"));
					});

				}
				else if(data['id'] == 2){
					const src = await page.evaluate(() => {
						const temp = document.querySelector('iframe[title="Main Content"]').src;
						return temp;
					});
					resolve(src);
				}
			})
			.catch((error) => {
				console.log(error);
				reject(new Error("No Record Found"));
			});

		}
		catch(error){
			console.log(error);
			reject(new Error("No Record Found"));
		}
	})
}

const ac_2 = async (page, url, account, county, client_years) => {
	return new Promise(async (resolve, reject) => {
		try{
			// MAIN PAGE
			await page.goto(url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector('#bill-history-content table', timeout_option)

			// MAIN DATA
			const main_data = await page.evaluate(() => {
				const data = {
					processed_date : "",
					order_number : "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "$0.00",
					exemption: "",
					total_taxable_value: "$0.00",
					taxing_authority: "",
					notes: "",
					delinquent:"NONE",
					tax_history: []
				}
				let assessed_value_link = null;

				// OWNER / PROPERTY ADDRESS / PARCEL DETAILS LINK
				document.querySelectorAll(".account-detail").forEach((row, i) => {
					if(i == 0){
						row.querySelectorAll(".owner").forEach((d) => { data['owner_name'].push(d.textContent.trim()) })
					}
					else if(i == 1){
						data['property_address'] = row.querySelector(".value").textContent.trim();
					}
					else if(i == 2){
						assessed_value_link = row.querySelector(".parcel a")?.href;							
					}
				});

				return { data, assessed_value_link }

			});

			// HISTORY DATA
			const history_map = await page.evaluate((client_years) => {
				const content = document.getElementById('bill-history-content');

				let year_map = {};

				// MAX YEAR AND UNPAID YEAR
				let max_year = 0;
				let second_max = 0;
				const year_labels = content.querySelectorAll("tbody .description");
				year_labels.forEach((yb, i) => {
					let year_str = yb.querySelector("a")?.textContent;				
					if(year_str && year_str.includes("bill")){
						let year = year_str.split(" ")[0];

						// GET MAX YEAR
						max_year = (year > max_year) ? year : max_year;
						second_max = (year > second_max && year != max_year) ? year : second_max;

						// GET UNPAID YEARS
						let status = yb.parentElement.querySelector(".status .label").textContent.trim();
						if(status == "Unpaid"){
							year_map[year] = {};
						}		
					}
				});
				year_map[max_year] = {};
				if(client_years > 1 && second_max && second_max > 0 && !year_map[second_max]){
					year_map[second_max] = {};
				}
				
				const history_rows = content.querySelectorAll(".regular,.installment");
				for(let i=0; i<history_rows.length; i++){
					const tr = history_rows[i];

					// YEAR
					const ths = tr.querySelector("th");
					const anc = ths?.querySelector("a");

					if(!anc){ continue; }

					let year_str = anc?.textContent;
					let year_arr = year_str?.split(" ");
					let year = year_arr[0];
					let url = ths.querySelector("a");

					if(year_map[year] && url){
						const tds = tr.querySelectorAll("td");

						let th = {
							jurisdiction: "County",
							year: year,
							payment_type: "",
							status: "",
							base_amount: "",
							amount_paid: "$0.00",
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: "",
							delq_date: "",
							paid_date: "",
							good_through_date: "",
							url: url.href,
						};						

						// PAYMENT TYPE						
						let type = year_arr[1];
						let id = 1;
						if(type == "Installment"){
							id = year_arr[3]?.substr(1);
							type = type + " " + id;
						}
						th['payment_type'] = type;

						// AMOUNT DUE
						th['amount_due'] = tds[0].textContent?.trim()

						// STATUS AND AMOUNT PAID
						let status = tds[1].querySelector(".label")?.textContent.trim();						
						th['status'] = (status == "Paid") ? status : "Due";

						// AMOUNT PAID AND PAID DATE
						if(status == "Paid"){
							th['amount_paid'] = tds[1]?.lastElementChild?.textContent.trim();
							th['paid_date'] = tds[2]?.textContent.trim();
						}
						
						year_map[year][id] = {};
						year_map[year][id] = th;
					}

				};
				return {max_year, year_map};
			}, client_years);

			main_data['data']['taxing_authority'] = `${county.toUpperCase()} COUNTY TAX COLLECTOR`;
			main_data['data']['parcel_number'] = account;

			resolve({
				data : main_data['data'],
				url: main_data['assessed_value_link'],
				max_year: history_map['max_year'],
				history_map: history_map['year_map']
			});
			
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	})
}

const ac_3 = async (page, main_data, url_county, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url =  replace_link(main_data['url'], url_county, county);

			if(url){
				await page.goto(url, { waitUntil: "domcontentloaded" });

				let assessed_value = "$0.00";

				assessed_value = await page.evaluate(() => {
					const parcel_values = document.querySelector('.parcel-values');
					return parcel_values?.firstElementChild?.querySelector('.value')?.textContent?.trim();
				});

				main_data['data']['total_assessed_value'] = assessed_value;
				main_data['data']['total_taxable_value'] = assessed_value;
			}

			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_4 = async (page, main_data, url_county, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			const data = main_data['data'];
			const max_year = main_data['max_year'];
			const history_map = main_data['history_map'];

			data['notes'] = "ALL PRIORS ARE PAID.";

			let type = "";
			let txt = "";
			for(let year in history_map){ 
				for(let index in history_map[year]){
					let th = history_map[year][index]; 

					// BASE AMOUNT
					let url = replace_link(th['url'], url_county, county);
					let { base_amt } = await ac_5(page, url, th['payment_type']);
					th['base_amount'] = base_amt;

					// DUE AND DELINQUENT DATE
					let due_date = "";
					let delq_date = "";
					if(th['payment_type'].includes("Annual")){
						due_date = `03/31/${+year+1}`;
						delq_date = `04/01/${+year+1}`;
					}
					else{
						if(index == 1){
							due_date = `06/30/${year}`;
							delq_date = `07/01/${year}`;
						}
						else if(index == 2){
							due_date = `09/30/${year}`;
							delq_date = `10/01/${year}`;
						}
						else if(index == 3){
							due_date = `12/31/${year}`;
							delq_date = `01/01/${+year+1}`;
						}
						else if(index == 4){
							due_date = `03/31/${+year+1}`;
							delq_date = `04/01/${+year+1}`;
						}
					}
					th['due_date'] = due_date;
					th['delq_date'] = delq_date;

					// STATUS CHANGE AND DELINQUENT STATUS
					if(th['status'] == "Due"){
						let delq_status = is_delq(delq_date);
						th['status'] = delq_status ? "Delinquent" : "Due";
						if(delq_status){
							data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}

						if(year != max_year){
							data['notes'] = "PRIORS ARE DELINQUENT.";
						}
					}

					// NOTES GENERATION
					if(year == max_year){
						if(th['payment_type'].includes("Annual")){
							txt = `TAXES ARE ${th['status'].toUpperCase()}, `;
							type = "NORMALLY TAXES ARE PAID ANNUALLY";
						}
						else{
							txt += `#${index} INSTALLMENT IS ${th['status'].toUpperCase()}, `;
							type = "NORMALLY TAXES ARE PAID QUARTERLY";
						}
					}

					delete th['url'];
					data['tax_history'].push(th);
				}
			}

			// NOTES		
			data['notes'] = `${data['notes']} ${max_year} ${txt}${type}. NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31 FOR QUARTERLY PAYMENT AND 03/31 FOR ANNUAL PAYMENT`;

			resolve(data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_5 = async (page, url, payment_type) => {
	return new Promise(async (resolve, reject) => {
		try{
			await page.goto(url, { waitUntil: "domcontentloaded" });

			const base_amt = await page.evaluate((payment_type) => {				
				let base_amount = "$0.00";
				if(payment_type.includes('Annual')){
					base_amount = document.querySelector(".message span").textContent.trim();
				}
				else if(payment_type.includes('Installment')){
					base_amount = document.querySelectorAll(".installment .value")[0].textContent.trim()
				}
				return base_amount;
			}, payment_type);

			resolve({ base_amt });
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account, url_county, county, client_years) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1, account, county, client_years)
				.then((data2) => {

					ac_3(page, data2, url_county, county)
					.then((data3) => {

						ac_4(page, data3, url_county, county)
						.then((data4) => {		
							resolve(data4);
						})
						.catch((error) => {
							console.log(error);
							reject(new Error(error.message));
						})

					})
					.catch((error) => {
						console.log(error);
						reject(new Error(error.message));
					})

				})
				.catch((error) => {
					console.log(error);
					reject(new Error(error.message));
				})

			})
			.catch((error) => {
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
	const { fetch_type, account, client } = req.body;

	const url_county = req.url;
	const county = req.county;
	const client_years = get_client_years(client);

	try{

		// CHECK IF THE FETCH-TYPE IS PRESENT
		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(500).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		// CHECK IF ACCOUNT INFO IS PRESENT
		if(!account || account == "") {
			if(fetch_type == "html"){
				return res.status(200).render('error_data', {
					error: true,
					message: "Please provide the parcel number"
				});
			}
			else if(fetch_type == "api"){
				return res.status(500).json({
					error: true,
					message: "Please provide the parcel number"
				});
			}			
		}

		const url = `https://county-taxes.net/${url_county}/property-tax`;

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

		page.setDefaultNavigationTimeout(90000);

		// INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'font' || req.resourceType() === 'image') {
				req.abort();
			} else {
				req.continue();
			}
		});

		if(fetch_type == "html"){
			// FRONTEND ENDPOINT
			account_search(page, url, account, url_county, county, client_years)
			.then((result)=>{
				res.status(200).render('parcel_data_official', result);
			})
			.catch((error)=>{			
				res.status(500).render('error_data', {
					error: true,
					message: error.message
				});
			})
			.finally(async ()=>{
				await context.close();
			});
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, url, account, url_county, county, client_years)
			.then((result)=>{
				return res.status(200).json({
					result
				});
			})
			.catch((error)=>{			
				return res.status(500).json({
					error: true,
					message: error.message
				});
			})
			.finally(async ()=>{
				await context.close();
			});
		}

	}
	catch(error){
		console.log(error);
		if(fetch_type == "html"){
			res.status(500).render('error_data', {
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