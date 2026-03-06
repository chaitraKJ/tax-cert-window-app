const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const path = require("path");

const county_data = {
	"monterey": "https://common3.mptsweb.com/mbc/monterey/tax/search",
	"trinity": "https://common1.mptsweb.com/mbc/trinity/tax/search",
	"yolo": "https://common2.mptsweb.com/MBC/yolo/tax/search",
	"butte": "https://common2.mptsweb.com/mbc/butte/tax/search",
	"imperial": "https://common2.mptsweb.com/mbc/imperial/tax/search",
	"tuolumne": "https://common3.mptsweb.com/mbc/tuolumne/tax/search",
	"amador": "https://common1.mptsweb.com/MBC/amador/tax/search",
	"kings": "https://common1.mptsweb.com/MBC/kings/tax/search",
	"mono": "https://common2.mptsweb.com/mbc/mono/tax/search",
	"san-benito": "https://common2.mptsweb.com/mbc/sanbenito/tax/search",
	"placer": "https://common3.mptsweb.com/mbc/placer/tax/search",
	"lake": "https://common2.mptsweb.com/MBC/lake/tax/search",
	"tulare": "https://common2.mptsweb.com/MBC/tulare/tax/search",
	"del-norte": "https://common3.mptsweb.com/mbc/delnorte/tax/search",
	"stanislaus": "https://common3.mptsweb.com/MBC/stanislaus/tax/search",
	"napa": "https://common2.mptsweb.com/mbc/napa/tax/search",
	"nevada": "https://common2.mptsweb.com/mbc/nevada/tax/search",
	"mariposa": "https://common2.mptsweb.com/MBC/mariposa/tax/search",
	"shasta": "https://common2.mptsweb.com/mbc/shasta/tax/search",
	"sonoma": "https://common3.mptsweb.com/mbc/sonoma/tax/search",
	"modoc": "https://common2.mptsweb.com/mbc/modoc/tax/search",
	"siskiyou": "https://common1.mptsweb.com/mbc/siskiyou/tax/search",
	"calaveras": "https://common3.mptsweb.com/mbc/calaveras/tax/search",
	"madera": "https://common3.mptsweb.com/mbc/madera/tax/search",
	"merced": "https://common3.mptsweb.com/mbc/merced/tax/search",
	"plumas": "https://common1.mptsweb.com/mbc/plumas/tax/search",
	"el-dorado": "https://common3.mptsweb.com/MBC/eldorado/tax/search",
	"humboldt": "https://common2.mptsweb.com/mbc/humboldt/tax/search",
	"tehama": "https://common1.mptsweb.com/mbc/tehama/tax/search",
	"san-joaquin": "https://common3.mptsweb.com/MBC/sanjoaquin/tax/search",
	"colusa": "https://common2.mptsweb.com/MBC/Colusa/tax/search",
	"yuba": "https://common2.mptsweb.com/mbc/yuba/tax/search",
};

const timeout_option = {
	timeout: 90000
};

const get_formatted_amount = (num) => {
	if(num && num != ""){
		let amt =  num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		amt = '$'+amt;
		return amt;
	}
	return num;
}

const get_previous_year_url = (url) => {

	let temp_url_with_year = path.dirname(url);
	let temp_url_middle = path.dirname(temp_url_with_year);

	let end_value = path.basename(url);
	let year_value = path.basename(temp_url_with_year);
	let prev_year = +year_value - 1;

	let next_url = path.join(temp_url_middle, String(prev_year), String(prev_year));

	// console.log(temp_url_middle);
	// console.log(prev_year);
	// console.log(next_url);

	return next_url;
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{	
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// FILL THE SEARCH FORM
			// YEAR
			// await page.waitForSelector("#SelTaxYear");
			// await page.select("#SelTaxYear", '2024');

			// PARCEL NUMBER
			await page.waitForSelector("#SearchDiv #SearchValue", timeout_option);
			await page.locator("#SearchValue").fill(account);

			Promise.all([
				page.locator("#SearchSubmit").click(),
				page.waitForSelector("#ResultsSecton #ResultDiv .listing-item", timeout_option),
			])
			.then(async () => {

				const page_content = await page.evaluate(() => {
					const list_item = document.querySelector("#ResultsSecton #ResultDiv .listing-item");
					const title = list_item?.querySelector(".title a")?.href;

					const first_data_title = list_item.querySelector("p strong")?.textContent.trim();
					const first_data = list_item.querySelector("p strong")?.nextSibling?.textContent;

					let owner_name = "N/A";
					let property_address = "N/A";

					if(first_data_title.includes("Owner")){
						owner_name = first_data;
					}
					if(first_data_title.includes("Address")){
						property_address = first_data;
					}

					return {
						owner_name: owner_name,
						property_address: property_address,
						url: title,
					};
					return title;
				});

				resolve({
					owner_name: page_content['owner_name'],
					property_address: page_content['property_address'],
					next_url: page_content['url']
				});
			})
			.catch((error) => {
				console.log(error);
				reject(new Error("Record not found"));
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
			const url = data['next_url'];
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			page.waitForSelector("#h2tab3", timeout_option)
			.then(async () => {

				const page_content = await page.evaluate(() => {
					const tab3 = document.querySelector("#h2tab3");
					const tax_code = tab3?.querySelector(".listing-item dl dd")?.textContent;

					if(tax_code && tax_code != ""){
						return true;
					}
					else{
						return false;
					}
				});
				resolve({
					url: url,
					owner_name: data['owner_name'],
					property_address: data['property_address'],
					status: page_content
				});

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

const ac_3 = async (page, data, account, county_name) => {
	return new Promise(async (resolve, reject) => {
		try{			

			if(!data['status']){
				const url = get_previous_year_url(data['url']);
				const status = await page.goto(url, { waitUntil: "domcontentloaded"});
				await page.waitForSelector("#h2tab1", timeout_option)
			}			

			const main_data = await page.evaluate(() => {
				const get_is_delq = (date) => {
					let today = new Date();
					let delq_date = new Date(date);
					if(today >= delq_date){
						return true;
					}
					return false;
				}

				const main_data = {
					processed_date : "",
					order_number : "",
					borrower_name: "",
					owner_name: [],
					property_address: "N/A",
					parcel_number: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "",
					notes: "",
					delinquent:"",				
					tax_history: []
				};

				// TAXING AUTHORITY
				const footer_list = document.querySelector(".footer .list-icons");
				const footer_lis = footer_list?.querySelectorAll("li");
				if(footer_lis.length >= 3){
					main_data['taxing_authority'] = footer_lis[2].lastChild?.textContent.trim();
				}

				// TOTAL TAXABLE VALUE AND TOTAL ASSESSED VALUE
				let rate;
				let total;
				let assessed_value = "";
				const tab3 = document.querySelector("#h2tab3");
				const tax_data_list = tab3?.querySelector(".listing-item")?.querySelectorAll("dl dt");
				tax_data_list.forEach((dt, i) => {
					const label = dt.textContent.trim();
					if(label.includes("Rate")){
						rate = dt.nextElementSibling.textContent.trim();
					}
					if(label.includes("Total")){
						total = dt.nextElementSibling.textContent.trim();
					}
				});
				if(rate && total){
					total = total.replace(/[$,]/g, '');
					assessed_value = (( +total * 100 ) / +rate).toFixed();
				}
				main_data['total_assessed_value'] = assessed_value;
				main_data['total_taxable_value'] = assessed_value;

				// YEAR
				let year = "";
				const header = document.querySelector("#tabsContainer")?.querySelector(".tab-content .row")?.children;
				if(header.length >= 2){
					year = header[2].lastElementChild.textContent.trim();
				}

				// TAX HISTORY
				let is_delq = false;
				const tab1 = document.getElementById("h2tab1");
				let divs = tab1.querySelector(".row").children;
				divs = Array.from(divs);
				divs.forEach((div, i) => {
					const th = {
						jurisdiction: "County",
						year: year,
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
					const dts = div.querySelector("dl")?.querySelectorAll("dt");
					dts.forEach((dt, i) => {
						let text = dt.textContent.trim();
						let data = dt.nextElementSibling.textContent.trim();
						if(text.includes("Paid Status")){
							th['status'] = data ?? "N/A";
						}
						else if(text.includes("Paid Date")){
							th['paid_date'] = data;
						}
						else if(text.includes("Total Due")){
							th['base_amount'] = data;
						}
						else if(text.includes("Total Paid")){
							th['amount_paid'] = data;
						}
						else if(text.includes("Balance")){
							th['amount_due'] = data;
						}
					})

					if(i == 0){
						th['payment_type'] = "Installment 1";
						th['due_date'] = `12/10/${year}`;
						th['delq_date'] = `12/11/${year}`;
					}
					else if(i == 1){
						th['payment_type'] = "Installment 2";
						th['due_date'] = `04/10/${+year+1}`;
						th['delq_date'] = `04/11/${+year+1}`;
					}

					if(th['status'] != "PAID" && get_is_delq(th['delq_date'])){
						is_delq = true;
						th['status'] = "Delinquent";
					}

					main_data['tax_history'].push(th);
				});

				return {
					data : main_data,
					is_delq: is_delq,
					year: year
				};
			});

			main_data['data']['notes'] = `ALL PRIORS ARE PAID, ${main_data['year']} 1ST INSTALLMENT IS ${main_data['data']['tax_history'][0]['status']}, 2ND INSTALLMENT IS ${main_data['data']['tax_history'][1]['status']}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/10 AND 04/10`;
			main_data['data']['delinquent'] = (main_data['is_delq']) ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

 			// FORMAT THE ASSESSED AMOUNT
			let amt = main_data['data']['total_taxable_value'];
			amt = get_formatted_amount(amt);
			main_data['data']['total_assessed_value'] = amt;
			main_data['data']['total_taxable_value'] = amt;

			main_data['data']['taxing_authority'] = `${county_name.toUpperCase()} COUNTY TREASURER - TAX COLLECTOR, ${main_data['data']['taxing_authority']}`;
			main_data['data']['parcel_number'] = account;
			main_data['data']['owner_name'].push(data['owner_name']);
			main_data['data']['property_address'] = data['property_address'];
			resolve(main_data['data']);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account, county_name) => {
	return new Promise(async (resolve, reject) => {
		try{
			ac_1(page, url, account)
			.then((data1) => {
				
				ac_2(page, data1, account)
				.then((data2) => { 

					ac_3(page, data2, account, county_name)
					.then((data3) => {
						resolve(data3);
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

		const county_name = path.basename(req.route.path);
		const url = county_data[county_name];

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
			account_search(page, url, account, county_name)
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
			account_search(page, url, account, county_name)
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

module.exports = {
	search
}