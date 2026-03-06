const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
	timeout: 90000
};

const ac_1 = async (page, url, account) =>{
	return new Promise(async (resolve, reject) => {
		try {
			// --- SEARCH PAGE ---
			const status = await page.goto(url, { waitUntil: "networkidle2"});

			const no_result_promise = page.waitForSelector("#TabSearch-panel h4", timeout_option).then(() => { return 1; });
			const navigation_promise = page.waitForNavigation().then(() => { return 2; });

			Promise.any([
				no_result_promise,
				navigation_promise		
			])
			.then((data) => {
				if(data == 1){
					reject(new Error("No Record Found"));
				}
				else if(data == 2){
					let data = {};
					const owner_details_url = "https://pbctax.publicaccessnow.com/API/AccountSummary/AccountSummary/GetData"
					const data_url = "https://pbctax.publicaccessnow.com/API/PaymentBill/Bill/GetData";
					page.on('response', async (response) => {
						if(response.url().includes(data_url)) {
							let res = await response.json();
							data['main'] = res['sections'];
						}	
						else if(response.url().includes(owner_details_url) && response.url().includes("_m=462") ) {
							let res = await response.json();
							data['owner_details'] = res['summaryData'];
						}
						if(data['main'] && data['owner_details']){
							resolve(data);
						}
					});
				}
			})
			.catch(() => {
				console.log(error);
				reject(new Error(error.message));
			});
		}
		catch(error) {
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_2 = (page, data, account) => {
	return new Promise((resolve, reject) => {
		try{
			let th = {
				id: 0,
				jurisdiction: "County",
				year: "",
				payment_type: "",
				status: "",
				base_amount: "",
				amount_paid: "",
				amount_due: "",
				mailing_date: "N/A",
				due_date: "",
				delq_date: "",
				paid_date: "",
				good_through_date: "",
			};
			let year_map = {};
			let max_year = 0;

			// TAX HISTORY DATA
			let tax_data = data['main'];
			tax_data.forEach((main) => {
				
				if(main['groups'].length > 0){
					let title = main['name'];

					if(title == "Current Installment"){
						main['groups'].forEach((group) => {
							let year = group['tile']['fields'][0]['value'];
							let max_year = 0;

							year_map[year] = {
								history: [],
								type: (data['name'] == "Current Installment") ? "Installment" : (data['name'] == "Bills Due") ? "Annual" : "Past",
							};

							group['items'].forEach((item) => {
								let h = {...th};

								item['columns'].forEach((col) => {
									let field = col['displayText'];
									let value = col['value'];

									if(field == "Installment"){
										h['id'] = value;
									}
									else if(field == "Date"){
										h['due_date'] = value;
									}
									else if(field == "Total Tax"){
										h['base_amount'] = value;
									}
									else if(field == "Paid"){
										h['amount_paid'] = value;
									}
									else if(field.includes("Amount Due")){
										h['amount_due'] = value;
									}
									else if(field == "Status"){
										h['status'] = value;
									}
								});
								
								h['year'] = year;
								year_map[year].push(h);
							});
						});
					}
				}

			});

			resolve(year_map);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account) => {
	return new Promise( async (resolve, reject) => {
		try{
			
			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1, account)
				.then((data2) => {
					resolve(data2);
				})
				.catch((error) =>{
					reject(new Error(error.message));
				})

			})
			.catch((error) =>{
				reject(new Error(error.message));
			})

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

		// CHECK IF THE FETCH-TYPE IS PRESENT
		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
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

		const url = `https://pbctax.publicaccessnow.com/PropertyTax.aspx?s=${account}&pg=1&g=-1&moduleId=449`;

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
			// WEBSITE ENDPOINT
			account_search(page, url, account)
			.then((data) => {
				res.status(200).render('parcel_data_official', data);
			})
			.catch((error) => {
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
				res.status(500).json({
					error: true,
					message: error.message
				});
			})
			.finally(async () => {
				await context.close()
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