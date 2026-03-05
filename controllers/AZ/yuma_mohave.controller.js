import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
	"yuma": {
		url: "https://yumacountyaz-tsrweb.tylerhost.net/treasurer/web/login.jsp",
		auth: "Yuma County Treasurer, Yuma County Courthouse, 310 Ash, Suite C, Wray, CO 80758"
	},
	"mohave": {
		url: "https://eagletw.mohavecounty.us/treasurer/web/login.jsp",
		auth: "Mohave County Treasurer, PO Box 712, Kingman, AZ 86402"
	}
}

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

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// BUTTON TO GO TO SEARCH PAGE
			await page.waitForSelector("#middle_left form input", timeout_option);
			await Promise.all([
				page.waitForNavigation(),
				page.locator("#middle_left form input[name='submit']").click()
			]);

			// FILL SEARCH FORM AND CLICK SEARCH
			await page.waitForSelector("#TaxAParcelID", timeout_option);
			await page.locator("#TaxAParcelID").fill(account);
			await Promise.all([
				page.waitForNavigation(),
				page.locator("input[value='Search']").click()
			]);

			// SEARCH RESULT
			page.waitForSelector("#searchResultsTable tbody tr td", timeout_option)
			.then(async () => {
				const account_url = await page.evaluate(() => {
					const td = document.querySelector("#searchResultsTable tbody").firstElementChild.firstElementChild;
					const acc_url = td.querySelector("a").href;
					return acc_url;
				});
				resolve(account_url)
			})
			.catch((error) => {
				console.log(error);
				reject(new Error("Record not found"));
			})

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const ac_2 = async (page, url, account, tax_auth) => {
	return new Promise(async (resolve, reject) => {
		try{

			// PROPERTY SUMMARY PAGE
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});
			await page.waitForSelector("#middle", timeout_option);
			await page.waitForSelector("#taxAccountSummary table tbody tr", timeout_option);
			await page.waitForSelector("#taxAccountValueSummary table tbody tr", timeout_option);
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
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "",
					notes: "",
					delinquent:"NONE",			
					tax_history: []
				};

				// LINKS
				let assessed_url = "";
				let history_url = "";
				const link_div = document.getElementById("accountLinks");
				const links = link_div.querySelectorAll("a");
				links.forEach((link, i) => {
					let anchor_text = link.textContent.trim().toLowerCase();
					if(anchor_text.includes("account value") || anchor_text.includes("mill levy breakdown")){
						assessed_url = link.href;
					}
					else if(anchor_text.includes("transaction detail")){
						history_url = link.href;
					}
				});

				// PROPERTY DATA
				const summary_table_rows = document.querySelectorAll("#taxAccountSummary table tbody tr");
				summary_table_rows.forEach((tr, i) => {
					let label = tr.firstElementChild.textContent.trim();
					let value = tr.lastElementChild.textContent.trim();

					if(label.includes("Parcel")){
						data['parcel_number'] = value;
					}
					else if(label.includes("Owners")){
						data['owner_name'].push(value);
					}
					else if(label.includes("Situs")){
						data['property_address'] = value;
					}
				});

				return {
					assessed_url,
					history_url,
					data
				}
			});	

			main_data['data']['taxing_authority'] = tax_auth;
			resolve(main_data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_3 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			
			// ASSESSED VALUE PAGE
			const url = data['assessed_url'];
			await page.goto(url, { waitUntil: "domcontentloaded"});

			page.waitForSelector("#middle .stripe", timeout_option)
			.then(async () => {

				let av = await page.evaluate(() => {
					let assessed_value = "-";
					let trs = document.querySelectorAll("#middle .stripe tbody tr");
					for(let i=0; i<trs.length-1; i++){
						let tr = trs[i];
						let tds = tr.querySelectorAll(".total");
						if(tds.length > 0){ 
							let label = tds[1].textContent.trim();
							if(label.includes("Full Cash")){
								assessed_value = tds[tds.length-1].textContent.trim();
								break;
							}
						}
					}
					return assessed_value;
				});

				data['data']['total_assessed_value'] = av;
				data['data']['total_taxable_value'] = av;

				resolve(data);
			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message));
			})

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_4 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = data['history_url'];
			const main_data = data['data'];

			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#middle table", timeout_option);

			const history_arr = await page.evaluate(() => {

				const tables = document.querySelectorAll("#middle .account");
				let year_map = {};
				let current_year = 0;

				// CURRENT YEAR AND UNPAID TABLE
				const summary_table = tables[0];
				let summary_rows = summary_table.querySelectorAll("tbody > tr"); 
				summary_rows.forEach((tr, i) => {
					const tds = tr.querySelectorAll("td");
					let year = tds[0].textContent.trim();

					if(!year_map[year]){
						year_map[year] = [];
					}

					if(tds[tds.length - 1].textContent.trim() != "$0.00"){					
						let h = {							
							jurisdiction: "County",
							year: year,
							payment_type: "Annual",
							status: "Due",
							base_amount: tds[1].textContent.trim(),
							amount_paid: "$0.00",
							amount_due: tds[tds.length - 1].textContent.trim(),
							mailing_date: "N/A",
							due_date: "",
							delq_date: "",
							paid_date: "",
							good_through_date: "",
						};
						year_map[year].unshift(h);				
					}
					current_year = (+year > current_year) ? year : current_year;
				});
				
				// ALL TRANSACTION TABLE
				const history_table = tables[1];
				let history_rows = history_table.querySelectorAll("tbody > tr");
				history_rows.forEach((tr, i) => {
					const tds = tr.querySelectorAll("td");
					let year = tds[0].textContent.trim();
					let type = tds[1].textContent.trim();

					if(year_map[year] && type == "Tax Payment"){
						let h = {
							jurisdiction: "County",
							year: year,
							payment_type: "Annual",
							status: "Paid",
							base_amount: tds[3].textContent.trim(),
							amount_paid: tds[3].textContent.trim(),
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: "",
							delq_date: "",
							paid_date: tds[2].textContent.trim(),
							good_through_date: "",
						};

						if(!year_map[year]){
							year_map[year] = [];
						}
						year_map[year].unshift(h);
					}
				});

				return {
					current_year,
					year_map
				};
			});

			resolve({
				data: main_data,
				year_map: history_arr['year_map'],
				current_year: history_arr['current_year']
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_5 = async (page, main_data)  => {
	return new Promise(async (resolve, reject) => {
		try{
			// DATA MANIPULATION
			let history_data = main_data['year_map'];
			let max_year = main_data['current_year'];

			main_data['data']['notes'] = (Object.keys(history_data).length == 1) ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";

			const main_history_data = [];
			for(const year in history_data){
				let base_amt = history_data[year]['base_amount']?.replace(/[$,]/g, '');
				let history = history_data[year];
				
				let len = history.length;
				history.forEach((h, i) => {
					if(len == 1){
						h['payment_type'] = "Annual";
						h['due_date'] = `12/31/${year}`;
						h['delq_date'] = `01/01/${+year+1}`;										
					}
					else if(len > 1){
						h['payment_type'] = "Semi-Annual";
						if(i == 0){
							h['due_date'] = `10/01/${+year}`;
							h['delq_date'] = `11/03/${+year}`;
						}
						else if(i > 0){
							h['due_date'] = `03/01/${+year+1}`;
							h['delq_date'] = `05/01/${+year+1}`;	
						}
					}

					if(h['status'] == "Due"){
						if(is_delq(h['delq_date'])){
							h['status'] = "Delinquent";
							main_data['data']['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}
					}

					main_history_data.push(h);
				})

				if(year == max_year){
					if(len == 1){
						main_data['data']['notes'] += `, ${year} TAXES ARE ${(history[0]['status']).toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY.`;
					}
					else if(len > 1){
						main_data['data']['notes'] += `, ${year} 1ST INSTALLMENT IS ${(history[0]['status']).toUpperCase()}, 2ND INSTALLMENT IS ${(history[1]['status']).toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
					}
				}
			}

			main_data['data']['notes'] += ` NORMAL DUE DATES ARE 12/31 FOR ANNUAL, 10/01 AND 03/01 FOR SEMI-ANNUAL`;
			main_data['data']['tax_history'] = main_history_data;
			resolve(main_data['data']);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account, tax_auth) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {
				
				ac_2(page, data1, account, tax_auth)
				.then((data2) => {

					ac_3(page, data2, account)
					.then((data3) => {

						ac_4(page, data3, account)
						.then((data4) => {

							ac_5(page, data4)
							.then((data5) => {
								resolve(data5);
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
				})

			})
			.catch((error) => {
				console.log(error);
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
		const url = county_data[req.county]['url'];
		const tax_auth = county_data[req.county]['auth'];

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
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
			account_search(page, url, account, tax_auth)
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
			account_search(page, url, account, tax_auth)
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

export {
	search
}