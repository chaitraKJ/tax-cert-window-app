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

const number_formatter = (num) => {
	num = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	num = "$" + num;
	return num;
}

const ac_1 = async (page, url, account, county) => {
	return new Promise (async (resolve, reject) => {
		try{
			// --- PARCEL SEARCH FORM ---
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// FILL ACCOUNT DETAILS
			await page.waitForSelector("#property_id", timeout_option);
			await page.locator("#property_id").fill(account);

			// CLICK THE SEARCH BUTTON
			await page.waitForSelector("#Search", timeout_option);
			await page.locator("#Search").click();

			// WAIT FOR THE RESPONSE
			page.on('response', async (response) => {
				let search_url = `https://oktaxrolls.com/searchResult/${county}/property_id`;
				if(response.url().includes(search_url) && response.ok()){
					const result = await response.json();

					if(!result || result['recordsFiltered'] == 0){
						reject(new Error("No Record found"));
					}
					else{
						const a_link_str = result['data'][0][3];
						const href_str = a_link_str?.split(" ")[1];
						const link = href_str?.slice(6)?.slice(0, -1);

						const data = {
							year: result['data'][0][0],
							account: result['data'][0][1]
						};

						resolve({
							link: link,
							data: data
						});
					}
				}
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_2 = async (page, data, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			// --- CONTENT PAGE ---
			const url = data['link'];
			await page.goto(url, { waitUntil: "domcontentloaded" });
			
			page.waitForSelector(".ownerdetail-section", timeout_option)
			.then(async () => {

				const main_data = await page.evaluate((county) => {
					const string_to_integer = (num) => {
						num = num.replace(/[,]/g, "");
						return +num;
					}

					const number_formatter = (num) => {
						num = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						num = "$" + num;
						return num;
					}

					const main_data = {
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
					};					
					let history_link = "";

					// TREASURE OFFICE ADDRESS
					const address_arr = document.querySelectorAll(".detail-cont ul li");
					main_data['taxing_authority'] = `${county} County Treasurer, ${address_arr[2]?.textContent.replace(/[\t\n\&nbsp; ]+/gm, " ")}, ${address_arr[3]?.textContent}`;


					// ---- MAIN CONTENT DIVS ----
					const sections = document.querySelectorAll(".ownerdetail-section");
					const sections_arr = Array.from(sections);	
					const sections_len = sections.length;

					// ------------------- SECTION 1 ----------------------

					// OWNER DETAILS
					owner_div = sections_arr[0].firstElementChild;
					const owner_address_str = owner_div.querySelector(".detail-cont p").innerHTML;
					const owner_address_arr = owner_address_str.split("<br>");
					main_data['owner_name'].push(owner_address_arr[0].replace(/[\t\n\&nbsp;]+/gm, "").replace(/[\&amp;]+/gm, "&"));
					owner_address_arr.forEach((d, i) => {
						if(i != 0){
							if(i > 1 && i < (owner_address_arr.length - 1)){
								main_data['property_address'] += ", ";
							}
							main_data['property_address'] += d.replace(/[\t\n\&nbsp;]+/gm, " ");
						}
					});

					// YEAR
					year_div = sections_arr[0].lastElementChild;
					const recent_year = year_div.querySelector("ul")?.firstElementChild?.lastChild?.textContent?.trim();


					// ------------------- SECTION 2 -------------------
					history_link = sections_arr[1].querySelector(".detail-cont a").getAttribute("href");


					// ------------------- SECTION 3 -------------------
					// ASSESSED VALUE
					const assessed_div = sections_arr[sections_len - 1].firstElementChild;
					const assessed_value = assessed_div.querySelector("table tbody")?.lastElementChild?.lastElementChild?.textContent;
					main_data['total_assessed_value'] = number_formatter(assessed_value);
					main_data['total_taxable_value'] = main_data['total_assessed_value'];

					// TOTAL PAYMENT DETAILS
					let history_map = {};
					history_map[recent_year] = {  
						total_base_amt: "0",
						total_paid_amt: "0",
						total_due_amt: "0",
						history: []
					}
					const payment_div = sections_arr[sections_len - 1].lastElementChild;
					const payment_trs = payment_div.querySelectorAll("table tbody tr");
					for(let i=0; i<payment_trs.length; i++){
						let tds = payment_trs[i].querySelectorAll("td");
						let label = tds[0]?.textContent;
						let value = tds[1]?.textContent;
						if(label.includes("Base")){
							history_map[recent_year]['total_base_amt'] = string_to_integer(value);
						}
						else if(label.includes("Total Paid")){
							history_map[recent_year]['total_paid_amt'] = string_to_integer(value);
						}
						else if(label.includes("Total Due")){
							history_map[recent_year]['total_due_amt'] = string_to_integer(value);
						}
					}

					// ------------------- TAX PAYMENT DATA -------------------
					const history_table = document.querySelector(".table-tax-data");
					const history_rows = history_table.querySelectorAll("tbody tr");					
					let data = {};
					history_rows.forEach((tr, i) => {		
						let history_tds = tr.querySelectorAll("td");
						if(history_tds.length > 1){
							let date = history_tds[0]?.textContent.trim();
							let amt = history_tds[4]?.textContent.trim();
							amt = string_to_integer(amt);

							if(data[date]){
								data[date] += +amt;
							}
							else{
								data[date] = +amt;
							}
						}					
					});	
					for(let date in data){
						let th = {
							jurisdiction  		:"County",
							year          		:recent_year,
							payment_type 		:"",
							status        		:"Paid",
							base_amount 		:"",
							amount_paid 		:number_formatter(data[date].toFixed(2)),
							amount_due	 		:"$0.00",
							mailing_date 		:"N/A",
							due_date 			:"",
							delq_date 			:"",
							paid_date 			:date,
							good_through_date 	:"",
						};
						history_map[recent_year]['history'].push(th);
					}

					// IF AMOUNT DUE
					if(+history_map[recent_year]['total_due_amt'] > 0){
						let th = {
							jurisdiction  		:"County",
							year          		:recent_year,
							payment_type  		:"",
							status        		:"Due",
							base_amount 		:"",
							amount_paid 		:"$0.00",
							amount_due	 		:number_formatter(history_map[recent_year]['total_due_amt']),
							mailing_date 		:"N/A",
							due_date 			:"",
							delq_date 			:"",
							paid_date 			:"",
							good_through_date 	:"",
						};
						history_map[recent_year]['history'].push(th);
					}

					return {
						data: main_data,
						main_year: recent_year,
						history_link: history_link,
						history_map: history_map
					};

				}, county);

				// LOOP THROUGH YEAR MAP
				let history_map = main_data['history_map'];
				for(let year in history_map){
					let length = history_map[year]['history'].length;
					if(length == 1){
						history_map[year]['history'].forEach((h, i) => {
							h['payment_type'] = "Annual";
							h['base_amount'] = number_formatter(history_map[year]['total_base_amt']);

							h['due_date'] = "12/31/"+year;
							h['delq_date'] = "01/01/"+(+year + 1);

							if(h['status'] == "Due"){
								if(is_delq(h['delq_date'])){
									h['status'] = "Delinquent";
									main_data['data']['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
								}
							}

							main_data['data']['tax_history'].push(h);
							main_data['data']['notes'] = `${year} TAXES ARE ${h['status'].toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY. NORMALLY DUE DATES ARE 12/31 FOR ANNUAL AND 12/31 & 04/01 FOR SEMI ANNUAL`;
						});						
					}
					else if(length > 1){
						let txt = "";
						let base_amt = (+history_map[year]['total_base_amt'] / 2).toFixed(2);
						history_map[year]['history'].forEach((h, i) => {
							h['payment_type'] = "Semi-Annual";
							h['base_amount'] = number_formatter(base_amt);

							if(i == 0){
								h['due_date'] = "12/31/"+year;
								h['delq_date'] = "01/01/"+(+year + 1);
							}
							else{
								h['due_date'] = "04/01/"+(+year + 1);
								h['delq_date'] = "04/02/"+(+year + 1);
							}

							if(h['status'] == "Due"){
								if(is_delq(h['delq_date'])){
									h['status'] = "Delinquent";
									main_data['data']['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
								}
							}

							if(i == 0){
								txt += `1ST INSTALLMENT IS ${h['status'].toUpperCase()}`;
							}
							else{
								txt += ` 2ND INSTALLMENT IS ${h['status'].toUpperCase()}`;
							}

							main_data['data']['tax_history'].push(h);
						});
						main_data['data']['notes'] = `${year} ${txt} ,NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMALLY DUE DATES ARE 12/31 FOR ANNUAL AND 12/31 & 04/01 FOR SEMI ANNUAL`
					}
				}

				main_data['data']['parcel_number'] = account;
				resolve({
					data: main_data['data'],
					url: main_data['history_link'],
					main_year: main_data['main_year']
				});
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
	})
}

const ac_3 = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = data['url'];
			const main_data = data['data'];
			const main_year = data['main_year'];

			await page.goto(url, { waitUntil: "domcontentloaded" });

			page.waitForSelector(".table-tax-data", timeout_option)
			.then(async () => {

				const history = await page.evaluate((main_year) => {
					const number_formatter = (num) => {
						num = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						num = "$" + num;
						return num;
					}

					const history = [];
					const trs = document.querySelectorAll(".table-tax-data tbody tr");
					const trs_len = trs.length;
					for(let i=0; i<trs_len; i++){
						const tr = trs[i];
						const tds = tr.querySelectorAll("td");

						const th_data = {
							jurisdiction:  		"County",
							year:          		"",
							payment_type:  		"Annual",
							status:        		"Delinquent",
							base_amount: 		"",
							amount_paid: 		"",
							amount_due: 		"0.00",
							mailing_date: 		"N/A",
							due_date: 			"",
							delq_date: 			"",
							paid_date: 			"",
							good_through_date: 	"",
						};
						
						tds.forEach((td, i) => {
							let data = 	td.textContent.trim();
							if(i == 0){
								th_data['year'] = data;
								th_data['due_date'] = "12/31/"+data;
								th_data['delq_date'] = "01/01/"+(+data + 1);
							}
							else if(i == 4){
								th_data['base_amount'] = number_formatter(data);
							}
							else if(i == 7){
								th_data['amount_paid'] = number_formatter(data);
							}
							else if(i == 8){
								th_data['amount_due'] = number_formatter(data);
							}
						});

						if(th_data['year'] == main_year){
							continue;
						}

						if(th_data['amount_due'] == "$0.00"){
							break;
						}

						history.unshift(th_data);
					};
					return history;

				}, main_year);

				
				let txt = (history.length > 0) ? "PRIORS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ";
				main_data['notes'] = `${txt}${main_data['notes']}`
				main_data['tax_history'] = history.concat(main_data['tax_history']);
				resolve(main_data);
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

const account_search = async (page, url, account, county) => {
	return new Promise(async(resolve, reject) => {
		try{

			ac_1(page, url, account, county)
			.then((data1) => {

				ac_2(page, data1, account, county)
				.then((data2) => {	

					ac_3(page, data2)
					.then((data3) => {	
						resolve(data3);				
					})
					.catch((error) => {
						console.log(error);
						reject(new Error(error.message));
					});		
					
				})
				.catch((error) => {
					console.log(error);
					reject(new Error(error.message));
				});

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
	const { fetch_type, account } = req.body;
	const county = req.county;

	try{
		if(!fetch_type && (fetch_type != 'html' || fetch_type != 'api')) {
			return res.status(500).render('error_data', {
				error: true,
				message: 'Invalid Access'
			});
		}

		const url = `https://oktaxrolls.com/searchTaxRoll/${county}?tax_info_sel=property_id`;

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

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
			account_search(page, url, account, county)
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
			account_search(page, url, account, county)
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