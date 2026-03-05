import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
	"delta": {
		url: "https://treasurer.deltacountyco.gov/assessor/web/login.jsp",
		auth: "Delta County Treasurer, 501 Palmer Street, Suite 202, Delta, CO 81416-1764"
	},
	"la-plata": {
		url: "https://treasurer.lpcgov.org/assessor/web/login.jsp",
		auth: "La Plata County Treasurer, 679 Turner Dr. Suite B"
	},
};

const timeout_option = {
	timeout: 90000
};

const get_next_day = (date) => {
	const next_date = new Date(date);
	next_date.setDate(next_date.getDate() + 1);
	return (+next_date.getMonth() + 1) + "/" + next_date.getDate() + "/" + next_date.getFullYear();
}

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
			await page.waitForSelector("#ParcelNumberID", timeout_option);
			await page.locator("#ParcelNumberID").fill(account);
			await Promise.all([
				page.waitForNavigation(),
				page.locator("input[value='Search']").click()
			]);

			// SEARCH RESULT
			page.waitForSelector("#searchResultsTable tbody tr td", timeout_option)
			.then(async () => {
				const account_url = await page.evaluate(() => {
					const td = document.querySelector("#searchResultsTable tbody .tableRow1").firstElementChild;
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
			await page.waitForSelector("#middle .accountSummary table", timeout_option);

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
				let history_url = "";
				const link_div = document.getElementById("left_column");
				const links = link_div.querySelectorAll("a");
				links.forEach((link, i) => {
					let anchor_text = link.textContent.trim().toLowerCase();
					if(anchor_text.includes("tax history")){
						history_url = link.href;
					}
				});

				// PROPERTY DATA
				const summary_tables = document.querySelectorAll("#middle .accountSummary table");
				summary_tables.forEach((table, i) => {
					if(i == 0){
						let tds = table.querySelectorAll("tbody tr td");
						tds.forEach((td, j) => {
							let text = td.firstElementChild?.textContent;
							if(text.includes("Situs")){
								data['property_address'] = td?.lastChild?.textContent.trim();
							}
						})						
					}
					else if(i == 1){
						let tds = table.querySelectorAll("tbody tr td");
						tds.forEach((td, j) => {
							let text = td.firstElementChild?.textContent;
							if(text.includes("Name")){
								data['owner_name'].push(td?.lastChild?.textContent.trim());
							}
						})	
					}
					else if(i == 2){
						let trs = table.querySelectorAll("tbody tr");
						trs.forEach((tr, i) => {
							if(i == 1){
								let value = tr.lastElementChild?.textContent
								data['total_assessed_value'] = value;
								data['total_taxable_value'] = value;
							}
						});
					}
				});

				return {
					history_url,
					data
				}
			});	

			main_data['data']['taxing_authority'] = tax_auth;
			main_data['data']['parcel_number'] = account;
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
			const url = data['history_url'];
			const main_data = data['data'];

			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#middle table", timeout_option);

			const history_arr = await page.evaluate(() => {

				let year_map = {};
				let current_year = 0;
				let unpaid_years = 0;

				// CURRENT YEAR AND UNPAID TABLE
				const summary_table = document.querySelector("#middle #TaxAccountSummary");
				let summary_rows = summary_table.querySelectorAll("tbody > tr"); 
				summary_rows.forEach((tr, i) => {
					if(i != 0) {
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
						unpaid_years++;
						current_year = (+year > current_year) ? year : current_year;
					}
				});
				
				// ALL TRANSACTION TABLE
				const history_table = document.querySelector("#middle #TaxAccountDetail");
				let history_rows = history_table.querySelectorAll("tbody > tr");
				history_rows.forEach((tr, i) => {
					if(i != 0) {
						const tds = tr.querySelectorAll("td");
						let year = tds[0].textContent.trim();
						let type = tds[1].textContent.trim();

						if(i == 1 && !year_map[year]){
							year_map[year] = [];
							current_year = year;
						}

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
					}
				});

				return {
					current_year,
					year_map,
					unpaid_years
				};
			});

			let year_map = history_arr['year_map'];
			let current_year = history_arr['current_year'];
			let unpaid_years = history_arr['unpaid_years'];
			let delq_status = false;

			main_data['notes'] = (unpaid_years == 1) ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";

			for(let year in year_map){
				let count = year_map[year].length;

				if(count == 1){
					let status = (year_map[year][0]['status']).toUpperCase()
					year_map[year][0]['due_date'] = `04/30/${+year+1}`;
					year_map[year][0]['delq_date'] = get_next_day(`04/30/${+year+1}`);

					main_data['tax_history'].push(year_map[year][0]);
					
					if(status == "DUE"){
						delq_status = is_delq(year_map[year][0]['delq_date']);
						year_map[year][0]['status'] = delq_status ? "Delinquent" : "Due";
						if(delq_status) { 
							main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
							year_map[year][0]['status'] = "Delinquent";
							status = "DELINQUENT";
						}
					}

					if(year == current_year){
						main_data['notes'] +=  `, ${year}-${+year+1} TAXES ARE ${status}, NORMALLY TAXES ARE PAID ANNUALLY`;
					}
				}
				else if(count > 1){
					// ROW 1
					let status_1 = (year_map[year][0]['status']).toUpperCase()
					year_map[year][0]['payment_type'] = `Semi-Annual`;
					year_map[year][0]['due_date'] = `02/28/${+year+1}`;
					year_map[year][0]['delq_date'] = get_next_day(`02/28/${+year+1}`);
					main_data['tax_history'].push(year_map[year][0]);
					
					if(status_1 == "DUE"){					
						delq_status = is_delq(year_map[year][0]['delq_date']);
						if(delq_status) { 
							main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
							year_map[year][0]['status'] = "Delinquent";
							status_1 = "DELINQUENT";
						}
					}

					// ROW 2
					let status_2 = (year_map[year][1]['status']).toUpperCase()
					year_map[year][1]['payment_type'] = `Semi-Annual`;
					year_map[year][1]['due_date'] = `06/16/${+year+1}`;
					year_map[year][1]['delq_date'] = get_next_day(`06/16/${+year+1}`);
					main_data['tax_history'].push(year_map[year][1]);
					
					if(status_2 == "DUE"){
						delq_status = is_delq(year_map[year][1]['delq_date']);
						if(delq_status) { 
							main_data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"; 
							year_map[year][1]['status'] = "Delinquent";
							status_2 = "DELINQUENT";
						}
					}

					if(year == current_year){
						main_data['notes'] +=  `, ${year}-${+year+1} 1ST HALF TAXES ARE ${status_1}, 2ND HALF TAXES ARE ${status_2}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY`;
					}
				}
			}
			main_data['notes'] += `, NORMALLY DUE DATES ARE 04/30 FOR ANNUAL AND 02/28 & 06/16 FOR SEMI-ANNUAL`;

			resolve(main_data);
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
						resolve(data3);
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