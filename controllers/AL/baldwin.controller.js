import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const county_url = {
	"alabama" : "https://baldwinproperty.countygovservices.com/Property/Search",
	"jackson" : "https://jacksonproperty.countygovservices.com/Property/Search",
	"madison" : "https://madisonproperty.countygovservices.com/Property/Property/Search"
};

const timeout_option = {
	timeout: 90000
};

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			// --- SEARCH PAGE ---
			await page.goto(url, { waitUntil: "networkidle0" });

			//	CLICK ON THE PARCEL RADIO BUTTON
			await page.waitForSelector("#parcel", timeout_option);
			await page.locator("#parcel").click();

			//	FILL THE PARCEL NUMBER	
			await page.waitForSelector("#pt-search-editor-1", timeout_option);
			await page.locator("#pt-search-editor-1").fill(account);

			//	CLICK SEARCH BUTTON
			await page.waitForSelector("#pt-search-button", timeout_option);

			Promise.all([
				page.locator("#pt-search-button").click(),
				page.waitForSelector(".k-table-tbody tr", timeout_option)
			])
			.then(async () => {

				await page.waitForSelector(".k-table-tbody", timeout_option);
				const page_data = await page.evaluate(() => {

					let data = {};
					const tbody = document.querySelector(".k-table-tbody tr");
					const tds = tbody?.querySelectorAll("td");
					if(tds){
						let next_url = tds[1]?.querySelector("a")?.href;
						data['url'] = next_url;
					}
					return data;
				});
				resolve(page_data);
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
	})
}

const ac_2 = async (page, data, taxing_auth) => {
	return new Promise(async (resolve, reject) => {
		try{
			if(Object.keys(data).length > 0 && data['url']){

				// --- MAIN PAGE ---
				const url = data['url'];
				await page.goto(url, { waitUntil: "domcontentloaded", });

				// CLICK TO OPEN THE HISTORY DATA
				await page.waitForSelector("#collapseTaxHistory", timeout_option);
				await page.evaluate(() => {
					const div = document.querySelector("#collapseTaxHistory");
					if(div){
						div.classList.add('show');
					}	
				});

				const pageContent = await page.evaluate(() => {
					const get_delq_status = (date) => {
						let today = new Date();
						let delq_date = new Date(date);
						if(today >= delq_date){
							return true;
						}
						return false;
					}

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

					// OWNER NAME AND ADDRESS
					const parcel_table_rows = document.querySelector("#collapseParcelInfo")?.querySelector("table tbody")?.querySelectorAll("tr");
					if(parcel_table_rows){
						parcel_table_rows.forEach((tr) => {
							const tds = tr.querySelectorAll('td');
							if(tds.length >= 2){
								const first = tds[0]?.textContent;
								const second = tds[1]?.textContent;
								if(first && second){
									if(first.includes('OWNER')){
										data['owner_name'].push(second)
									}
									else if(first.includes('PROPERTY ADDRESS')){
										data['property_address'] = second;
									}
									else if(first.includes('PARCEL')){
										data['parcel_number'] = second;
									}
								}	
							}
						});
					}
					
					// PROPERTY VALUES
					const property_table_rows = document.querySelector("#collapseSummaryPropertyValues")?.querySelector("table tbody")?.querySelectorAll("tr");
					if(property_table_rows){
						property_table_rows.forEach((tr) => {
							const tds = tr.querySelectorAll('td');
							if(tds.length >= 2){
								const first = tds[0]?.textContent;							
								if(first){
									if(first.includes('Assessment Value')){
										const second = tds[1]?.textContent;
										data['total_assessed_value'] = second;
										data['total_taxable_value'] = second;
									}
								}	
							}
						});
					}
					
					// DUE DATE AND DELINQUENT DATE
					const tax_info_rows = document.querySelectorAll(".pt-taxinfo-table tbody tr");
					const date_arr = document.querySelector("#collapseTaxInfo .alert-info")?.textContent.trim().split(",");
					let f_arr = date_arr[0]?.split(" ");
					let l_arr = date_arr[1]?.split(" ");
					let due_date = f_arr[f_arr.length - 1];
					let del_date = l_arr[l_arr.length - 1];

					// CURRENT YEAR TAX INFO ONLY
					let year = "";
					let status = "PAID";
					let is_delq = false;

					tax_info_rows.forEach((tr) => {
						const th = {
							jurisdiction: "County",
							year: "",
							payment_type: "Annual",
							status: "",
							base_amount: "",
							amount_paid: "",
							amount_due: "",
							mailing_date: "N/A",
							due_date: due_date,
							delq_date: del_date,
							paid_date: "",
							good_through_date: "",
						}
						const tds = tr.querySelectorAll("td");
						let type = tds[2].textContent.trim().replace(/ /g, "");
						
						if(type == "REAL"){
							for(let i=0; i<tds.length; i++){
								let td = tds[i];
								let text = td.textContent.trim().replace(/ /g, "");						
								if(i == 1){
									th['year'] = text;	
									year = text;						
								}							
								else if(i == 3){
									th['base_amount'] = text;
								}
								else if(i == 6){
									th['amount_paid'] = text;
								}
								else if(i == 7){
									th['amount_due'] = text;
									if(th['amount_due'] == "$0.00"){
										th['status'] = "Paid";
										th['paid_date'] = document.querySelector(".pt-summary-payment-info").textContent.split(" ")[3];
									}	
									else{
										is_delq = get_delq_status(th['delq_date']);
										th['status'] = is_delq ? "Delinquent" : "Due";									
									}	
									status = th['status'].toUpperCase();						
								}
							}
							data['tax_history'].push(th);
						}												
					});

					data['notes'] = `ALL PRIORS ARE PAID, ${year} TAXES ARE ${status}, NORMALLY TAXES ARE PAID ANNUALLY, TAXES ARE DUE BEGINNING 10/1, DELINQUENT AFTER 12/31`;
					data['delinquent'] = is_delq ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

					return data;
				});

				pageContent['taxing_authority'] = taxing_auth;
				resolve(pageContent);
			}
			else{
				reject(new Error("Record not found"));
			}
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, url, account, taxing_auth) => {
	return new Promise(async (resolve, reject) => {
		try{
			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1, taxing_auth)
				.then((data2) =>{
					resolve(data2);
				})
				.catch((error) =>{
					reject(new Error(error.message));
				});

			})
			.catch((error) =>{
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

		// COUNTY INFO
		const url = county_url[req['county']];
		const taxing_auth = req['county'].toUpperCase() + " COUNTY TAX COLLECTOR";

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
			account_search(page, url, account, taxing_auth)
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
			account_search(page, url, account, taxing_auth)
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
};