import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_data = {
	"adams": {
		url: "https://adcotax.com/treasurer/web/login.jsp",
		auth: "Adams County Treasurer, 4430 S. ADAMS COUNTY PARKWAY, SUITE W1000, BRIGHTON, CO 80601"
	},
	"douglas": {
		url: "https://apps.douglas.co.us/treasurer/web/login.jsp",
		auth: "Douglas County Treasurer, 100 Third Street, Suite 120, PO Box 1208, Castle Rock, CO 80104"
	},
	"boulder": {
		url: "https://treasurer.bouldercounty.org/treasurer/web/login.jsp",
		auth: "Boulder County Treasurer, PO Box 471, Boulder, CO 80306"
	},
	"lake": {
		url: "https://lakecountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Lake County Treasurer and Public Trustee, P.O. Box 276, 505 Harrison Ave., Leadville, CO 80461"
	},
	"grand": {
		url: "https://ecomm.co.grand.co.us/treasurer/web/login.jsp",
		auth: "Grand County Treasurer, PO Box 288, 308 Byers Ave, Hot Sulphur Springs, CO 80451"
	},
	"broomfield": {
		url: "https://egov.broomfield.org/treasurer/web/login.jsp",
		auth: "Broomfield County Treasurer, One Des Combes Dr, Broomfield, CO 80020"
	},
	"conejos": {
		url: "https://conejoscountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Conejos County Treasurer, P.O. Box 97, 6683 County Road 13, Conejos, CO 81129"
	},
	"weld": {
		url: "https://www.weldtax.com/treasurer/web/login.jsp",
		auth: "Weld County Treasurer, 1400 N. 17th Avenue, Greeley, CO 80631"
	},
	"ouray": {
		url: "https://ouraycountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Ouray County Treasurer, PO Box 149, 541 4th Street, Ouray, CO 81427"
	},
	"routt": {
		url: "https://treasurer.co.routt.co.us:8443/treasurer/web/login.jsp",
		auth: "Routt County County Treasurer, Routt County Treasurer, Lane Iacovetto, 522 Lincoln Avenue, Suite 22, Steamboat Springs, CO 80487"
	},
	"las-animas": {
		url: "http://treasurer.lasanimascounty.net:8081/treasurer/web/login.jsp",
		auth: "LAS ANIMAS County Treasurer, 200 E 1ST ST., ROOM 204, TRINIDAD, CO 81082"
	},
	"fremont": {
		url: "https://fremontcountyco-tsr-web.tylerhost.net/treasurer/web/login.jsp",
		auth: "Fremont County Treasurer, 615 Macon Ave. #104"
	},
	"elbert": {
		url: "https://services.elbertcounty-co.gov:8443/treasurer/web/login.jsp",
		auth: "Elbert County Treasurer/Public Trustee, PO Box 67, Kiowa, CO 80117"
	},
	"phillips": {
		url: "https://treasurer.phillipscogov.com:8447/treasurer/web/login.jsp",
		auth: "Phillips County Treasurer, 221 S Interocean Ave, Holyoke, CO 80734"
	},
	"mineral": {
		url: "https://eaglewebtreasurer.mineralcountycolorado.com:8443/treasurer/web/login.jsp",
		auth: "Mineral County Treasurer, PO Box 70, 1201 N Main St, Creede, CO 81130"
	},
	"gilpin": {
		url: "https://gilpincountyco-tsrweb.tylerhost.net/treasurer/web/login.jsp",
		auth: "Gilpin County Treasurer, P.O. Box 368, Central City, CO 80427"
	},
	"pitkin": {
		url: "https://treasurer.pitkincounty.com/treasurer/web/login.jsp",
		auth: "Pitkin County Treasurer, 530 East Main Street, Suite 201, Aspen, CO 81611-1948"
	},
	"jackson": {
		url: "https://eagleweb.jacksoncountyco.gov:4443/treasurer/web/login.jsp",
		auth: "Jackson County Treasurer, P.O. Box 458, 396 LaFever Street, Walden, CO 80480"
	},
	"morgan": {
		url: "https://morgancountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Morgan County Treasurer, 231 Ensign Street, Fort Morgan, CO 80701"
	},
	"costilla": {
		url: "https://costillacountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Costilla County Treasurer, 400 Gasper St. #103, P.O. Box 348, San Luis, CO 81152"
	},
	"otero": {
		url: "https://oterocountynm-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Otero County Treasurer, 1104 N. White Sands Blvd., Suite A. ALAMOGORDO, NM 88310"
	},
	"crowley": {
		url: "https://crowleycountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Crowley County Treasurer, 631 Main Street Ste. 101, Ordway, CO 81063"
	},
	"san-miguel": {
		url: "https://onlinepayments.sanmiguelcountyco.gov/treasurer/web/login.jsp",
		auth: "San Miguel County Treasurer, 305 W Colorado Avenue, Ste 105, Telluride, CO 81435"
	},
	"mesa": {
		url: "https://appz.mesacounty.us/treasurer/web/login.jsp",
		auth: "Mesa County Treasurer, 544 Rood Avenue, Room 100, Grand Junction, CO 81501"
	},
	"garfield": {
		url: "https://act.garfield-county.com/treasurer/web/login.jsp",
		auth: "Garfield County Treasurer, PO Box 1069, Glenwood Springs, CO 81602"
	},
	"clear-creek": {
		url: "https://treasurer.co.clear-creek.co.us/treasurer/web/login.jsp",
		auth: "Clear Creek County Treasurer, 405 Argentine Street, Georgetown, CO 80444"
	},
	"montrose": {
		url: "https://treasurerweb.montrosecounty.net/treasurer/web/login.jsp",
		auth: "Montrose Creek County Treasurer, P.O. Box 609, Montrose, CO 81402"
	},
	"bent": {
		url: "https://bentcountyco-treasurer.tylerhost.net/treasurer/web/login.jsp",
		auth: "Bent county Treasurer, 725 Bent Avenue, P.O. Box 31, Las Animas, CO 81054"
	},
	"montezuma": {
		url: "https://eagleweb.co.montezuma.co.us:8444/treasurer/web/login.jsp",
		auth: "Montezuma county Treasurer, 140 West Main Street, Suite 2, Cortez, CO 81321"
	},
	"teller":{
		url: "https://treas.tellercounty.gov/treasurer/web/login.jsp",
		auth:"Teller County Treasurer, 101 W Bennett Avenue, Cripple Creek, CO 80813"
	},
	"park": {
		url: "https://treasurer.parkco.us:8443/treasurer/web/login.jsp",
		auth:"Park County Treasurer, 501 Main St, Fairplay, CO 80440, Ph: 719-836-4333"
	}
}

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

const ac_1 = async (page, url, account, county) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});
			account = account.replace(/[- ]/g, '');

			// BUTTON TO GO TO SEARCH PAGE
			await page.waitForSelector("#middle_left form input", timeout_option);
			await Promise.all([
				page.waitForNavigation(),
				page.locator("#middle_left form input[name='submit']").click()
			]);

			// FILL SEARCH FORM AND CLICK SEARCH
			// let search_input = (county == 'montezuma') ? "#TaxAccountId" : "#TaxAParcelID";
			let search_input;
			if (county === "teller") {
				search_input = "#TaxAccountID";
			} else if (county === "montezuma") {
				search_input = "#TaxAccountId";
			} else {
				search_input = "#TaxAParcelID";
			}
			await page.waitForSelector(search_input, timeout_option);
			await page.locator(search_input).fill(account);
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
					let rows = document.querySelectorAll("#middle .stripe tbody tr");
					let lastRow = rows[rows.length - 1];
					let assessed_value = lastRow.lastElementChild.textContent.trim();
					return assessed_value;
				})

				data['data']['total_assessed_value'] = av;
				data['data']['total_taxable_value'] = av;

				resolve(data);
			})
			.catch((error) => {
				console.log(error);
				resolve(data);
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
				let unpaid_years = 0;

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
					unpaid_years++;
					current_year = (+year > current_year) ? year : current_year;
				});
				
				// ALL TRANSACTION TABLE
				const history_table = tables[1];
				let history_rows = history_table.querySelectorAll("tbody > tr");
				history_rows.forEach((tr, i) => {
					const tds = tr.querySelectorAll("td");
					let year = tds[0].textContent.trim();
					let type = tds[1].textContent.trim();

					if(i == 0 && !year_map[year]){
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

const account_search = async (page, url, account, tax_auth, county) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account, county)
			.then((data1) => {
				
				ac_2(page, data1, account, tax_auth)
				.then((data2) => {

					ac_3(page, data2, account)
					.then((data3) => {

						ac_4(page, data3, account)
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
			account_search(page, url, account, tax_auth, req.county)
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
			account_search(page, url, account, tax_auth, req.county)
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