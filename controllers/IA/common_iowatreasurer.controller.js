const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
	timeout: 90000
};

const ac_1 = async (page, data, account) => {
	return new Promise (async (resolve, reject) => {
		try{
			const url = data['url'];
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// FILL THE FORM 
			await page.waitForSelector("#parcelsearchform #parcelnumber", timeout_option);
			await page.locator("#parcelsearchform #parcelnumber").fill(account);


			// CLICK THE SEARCH BUTTON AND WAIT FOR URL CHANGE
			await page.waitForSelector("#parcelsearchform button", timeout_option);
			Promise.all([
				page.locator("#parcelsearchform button").click(),
				page.waitForNavigation()
			])
			.then(() => {
				resolve(data);
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

const ac_2 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			
			// WAIT FOR THE SEARCH CARD TO APPEAR
			page.waitForSelector("#searchresults .card", timeout_option)
			.then(async () => {

				//GET THE HIDDEN INPUT VALUE
				const parcel_id = await page.evaluate(() => {
					const main_div = document.querySelector("#searchresults .card");
					const input = main_div?.querySelector("input[name='ParcelID[]']");
					return input?.value;
				});

				const next_url = `https://www.iowatreasurers.org/modules/parceldetailpopup.php?id=${parcel_id}`;
				resolve(next_url);

			})
			.catch((error) => {
				console.log(error);
				reject(new Error("No Record Found"));
			});
			
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_3 = async (page, url, account, county_info) => {
	return new Promise(async (resolve, reject) => {
		try{
			
			await page.goto(url, { waitUntil: "domcontentloaded" });

			await page.waitForSelector("table", timeout_option);
			const page_data = await page.evaluate(() => {
				const datum = {
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
					taxing_authority: "",	
					notes: "ALL PRIORS ARE PAID, ",
					delinquent:"NONE",		
					tax_history: []
				}
				let current_year = "";

				const get_next_date = (date) => {
					const date_obj = new Date(date);
					date_obj.setDate(date_obj.getDate() + 1);
					const next_date = (+date_obj.getMonth() + 1) + "/" + date_obj.getDate() + "/" + date_obj.getFullYear();
					return next_date;
				}

				const is_delq = (date) => {
					let today = new Date();
					let delq_date = new Date(date);
					if(today >= delq_date){
						return true;
					}
					return false;
				}

				const get_property_details = (table) => {
					const trs = table.querySelector("tbody").children;
					const second_child = trs[1];
					const tds = second_child?.querySelectorAll("td");

					return {
						collector: tds[0]?.textContent?.replace(/, IA/g, "")?.trim(),
						parcel_number: tds[1]?.textContent?.trim(),
						year: tds[3]?.textContent?.trim(),
					}
				}

				const get_owner_detail = (table) => {
					const trs = table.querySelector("tbody").children;
					const second_child = trs[1];
					const tds = second_child?.querySelectorAll("td");

					return {
						owner_name: tds[0]?.textContent?.trim(),
						property_address: tds[2]?.textContent?.replace(/Map/g, "")?.replace(/Assessment Information/g, "")?.trim(),
					}
				}

				const get_assessed_value = (table) => {
					let assessed_value = "";

					const tbody = table.querySelector("tbody");
					const tds = tbody?.querySelectorAll("td");
					let len = tds.length;
					
					for(let i=0; i<len; i++){
						let text = tds[i].textContent.trim();
						if(text.includes("Assessed Value")){
							if(i < len - 1){
								assessed_value = "$"+tds[i+1].textContent.trim();
								break;
							}
						}
					}
					return assessed_value;
				}

				const get_installment = (table, year, type) => {
					const th_data = {
						jurisdiction: "County",
						year: year,
						payment_type: type,
						status: "Due",
						base_amount: "$0.00",
						amount_paid: "$0.00",
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: "",
						delq_date: "",
						paid_date: "",
						good_through_date: "",
					};

					const trs = table.querySelectorAll("tbody tr");
					trs.forEach((tr, i) => {
						if(i > 0){
							let tds = tr.querySelectorAll("td");

							let first_header_text = tds[0]?.textContent?.trim();
							let first_data = tds[1]?.textContent?.trim();

							let second_header_text = tds[2]?.textContent?.trim();						
							let second_data = tds[3]?.textContent?.trim(); 

							// FIRST AND SECOND COLUMN
							if(first_header_text == "Base Due"){
								th_data['base_amount'] = "$"+first_data;
							}
							else if(first_header_text == "Payment"){
								th_data['amount_paid'] = "$"+first_data;
							}
							else if(first_header_text == "Total Due"){
								th_data['amount_due'] = "$"+first_data;

								if(first_data == "0.00"){
									th_data['status'] = "Paid";
								}
							}

							// THIRD AND FOURTH COLUMN
							if(second_header_text == "Interest Begins"){
								th_data['due_date'] = second_data;
								th_data['delq_date'] = get_next_date(second_data);
							}
							else if(second_header_text.includes("Paid on")){
								th_data['paid_date'] = second_header_text.replace(/Paid on/g, "");
							}
						}
					});

					return th_data;
				}
				
				// GET ALL THE TABLES
				const tables = document.querySelectorAll("table");
				tables.forEach((table) => {

					// GET THE TEXT OF THE FIRST HEADER
					const first_text = table.querySelector("tr td")?.textContent?.trim();

					if(first_text == "Collector"){
						const { collector, parcel_number, year } = get_property_details(table);
						datum['taxing_authority'] = collector;
						datum['parcel_number'] = parcel_number;
						current_year = year;
					}
					else if(first_text == "Owner"){
						const {owner_name, property_address} = get_owner_detail(table);
						datum['owner_name'].push(owner_name);
						datum['property_address'] = property_address;
					}
					else if(first_text == "Legal Description"){
						const assessed_value = get_assessed_value(table);
						datum['total_taxable_value'] = assessed_value;
						datum['total_assessed_value'] = assessed_value;
					}
					else if(first_text == "First Installment"){
						let history = get_installment(table, current_year, "Installment 1");											
						if(history['status'] == "Due" && is_delq(history['due_date'])){
							history['status'] = "Delinquent";
							datum['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}
						datum['notes'] += `${current_year} 1ST INSTALLMENT IS ${history['status'].toUpperCase()}`;
						datum['tax_history'].push(history);
					}
					else if(first_text == "Second Installment"){
						let history = get_installment(table, current_year, "Installment 2");
						if(history['status'] == "Due" && is_delq(history['due_date'])){
							history['status'] = "Delinquent";
							datum['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}
						datum['notes'] += `, 2ND INSTALLMENT IS ${history['status'].toUpperCase()}`;
						datum['tax_history'].push(history);
					}
				});
				return datum;

			});

			page_data['notes'] += `, NORMALLY TAXES ARE PAID SEMI ANNUALLY. NORMAL DUE DATES ARE 10/01, 04/01`;
			page_data['taxing_authority'] = page_data['taxing_authority'] + " County Treasurer, " + county_info['treasury_data'];
			resolve(page_data);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, data, account) => {
	return new Promise(async(resolve, reject) => {
		try{

			ac_1(page, data, account)
			.then((data1) => {
				
				ac_2(page, data1, account)
				.then((data2) => {
					
					ac_3(page, data2, account, data)
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

	const url = `https://www.iowatreasurers.org/index.php?module=parceldetail&idCounty=${req.countyid}`;
	const treasury_data = req.countyauthority

	const data = { url, treasury_data };

	try{
		if(!fetch_type && (fetch_type != 'html' || fetch_type != 'api')) {
			return res.status(500).render('error_data', {
				error: true,
				message: 'Invalid Access'
			});
		}

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
			account_search(page, data, account)
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
			account_search(page, data, account)
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