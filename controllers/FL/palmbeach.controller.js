import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
	timeout: 90000
};

const ac_1 = async (page, url, account) =>{
	return new Promise(async (resolve, reject) => {
		try {

			// --- SEARCH PAGE ---
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// FORM SUBMISSION
			// CLICK THE OPTION FOR PARCEL SEARCH
			await page.waitForSelector("#k-panelbar-0-item-3 .k-header", timeout_option);
			await page.locator("#k-panelbar-0-item-3 .k-header").click();

			// FILL THE PARCEL NUMBER
			await page.waitForSelector("#k-panelbar-0-item-3 input[title='Property Control Number']", timeout_option);
			await page.locator("#k-panelbar-0-item-3 input[title='Property Control Number']").fill(account);
			
			// WAIT FOR THE SEARCH BUTTON TO BE ENABLED
			await page.waitForSelector("button[title='Search']", timeout_option);
			await page.waitForFunction(() => document.querySelector("button[title='Search']").disabled == false);

			await Promise.all([
				page.waitForNavigation(), 
				page.locator("button[title='Search']").click()
			]);

			// BILLS PAGE
			page.waitForNavigation()
			.then(() => {				

				page.waitForSelector(".public-access-payment-bill-module .bill-main .bill-content", timeout_option)
				.then(async () => {

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
							total_assessed_value: "",
							exemption: "",
							total_taxable_value: "",
							taxing_authority: "Palm Beach County Tax Collector",
							notes: "",
							delinquent: "",
							tax_history: []
						};

						// PARCEL NUMBER / OWNER / ADDRESS
						const summary_div = document.querySelectorAll(".public-access-account-summary-module")[1].querySelectorAll(".col")
						summary_div.forEach((sd, i) => {
							if(i == 0){
								data['parcel_number'] = sd.firstElementChild?.lastElementChild?.textContent.trim();
								data['owner_name'].push(sd.lastElementChild?.lastElementChild?.textContent.trim());
							}
							else if(i == 1){
								const sd_childs = sd.children;
								data['property_address'] = sd_childs[1]?.lastElementChild?.textContent.trim() + ", ";
								data['property_address'] += sd_childs[2]?.lastElementChild?.textContent.trim();
							}
						});

						return data;
					});

					// HISTORY MAP
					const history = await page.evaluate(() => {
						let max_year = 0;
						let delinquent = "NONE";

						const year_map = {};
						let data = {
							id: 0,
							jurisdiction: "County",
							year: "",
							payment_type: "Annual",
							status: "",
							base_amount: "",
							amount_paid: "$0.00",
							amount_due: "$0.00",
							mailing_date: "N/A",
							due_date: "",
							delq_date: "",
							paid_date: "",
							good_through_date: "",
						};

						const get_unpaid_status = (date) => {
							if(date){
								const today = new Date();
								const due_date = new Date(date);
								due_date.setDate(due_date.getDate() + 1);

								const delqDate = (+due_date.getMonth() + 1) + "/" + due_date.getDate() + "/" + due_date.getFullYear();
								if(today >= due_date){
									return {
										status: "Delinquent",
										delq_date: delqDate
									}
								}
								return {
									status: "Due",
									delq_date: delqDate
								}
							}
							return {
								status: "Delinquent",
								delq_date: ""
							}						
						}

						const get_due_delq_data = (div) => {
							let year = div.querySelector(".tile-header")?.firstElementChild?.textContent.trim();
							if(!year_map[year]){  
								year_map[year] = []; 
							}

							max_year = (year > max_year) ? year : max_year;
							const trs = div.querySelectorAll("table tbody tr");
							trs.forEach((tr) => {
								const tds = tr.querySelectorAll("td");
								if(tds.length > 1){
									let h = {...data};
									h['year'] = year;

									let start = 0;
									let first_header = div.querySelector("table thead th")?.textContent;
									if(first_header && first_header.includes("Installment")){
										h['id'] = tds[0].textContent.trim();
										h['payment_type'] = "Installment " +h['id'];
										start = 1;
									}
									else {
										start = 0;	
									}

									for(let i=start; i<tds.length; i++){
										if(i - start == 0){
											h['due_date'] = tds[i].textContent.trim();

											let { delq_date, status } = get_unpaid_status(h['due_date']);
											h['delq_date'] = delq_date;
											h['status'] = status;

											if(status == "Delinquent"){
												delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
											}
										}
										else if(i - start == 1){
											h['base_amount'] = tds[i].querySelector(".total-values")?.querySelector("span")?.textContent.trim();
											h['amount_due'] = tds[i].querySelector(".expandable-header .total-values__currency")?.textContent.trim();
										}
										else if(i - start == 2){
											h['amount_paid'] = tds[i].textContent.trim();
										}								
									}

									year_map[year].push(h);
								}
							});
						}

						const get_paid_data = (div, flag) => {
							let year = div.querySelector(".tile-header")?.firstElementChild?.textContent.trim();

							if(flag){
								if(!year_map[year]){  
									year_map[year] = []; 
								}
							}
							else{
								if(!year_map[year]){  
									return;
								}
							}						

							max_year = (year > max_year) ? year : max_year;
							const trs = div.querySelectorAll("table tbody tr");
							trs.forEach((tr) => {
								const tds = tr.querySelectorAll("td");
								if(tds.length > 1){
									let h = {...data};
									h['year'] = year;

									let start = 0;
									let first_header = div.querySelector("table thead th")?.textContent;
									if(first_header && first_header.includes("Installment")){
										h['id'] = tds[0].textContent.trim();
										h['payment_type'] = "Installment " +h['id'];
										start = 1;
									}
									else {
										start = 0;	
									}

									for(let i=start; i<tds.length; i++){
										if(i - start == 0){
											h['due_date'] = tds[i].textContent.trim();

											let { delq_date } = get_unpaid_status(h['due_date']);
											h['delq_date'] = delq_date;
											h['status'] = "Paid";
										}
										else if(i - start == 1){
											h['base_amount'] = tds[i].querySelector(".total-values")?.querySelector("span")?.textContent.trim();
											h['amount_paid'] = tds[i].querySelector(".expandable-header .total-values__currency")?.textContent.trim();
										}
										else if(i - start == 2){
											h['paid_date'] = tds[i].textContent.trim();
										}								
									}

									year_map[year].push(h);
								}
							});
						}

						const bill_contents = document.querySelectorAll(".public-access-payment-bill-module .bill-main .bill-content");
						let due_div = null;
						let delq_div = null;
						let paid_div = null;
						bill_contents.forEach((div, i) => {
							if(div.children.length > 0){
								if(div.querySelector("header")){
									let header = div.querySelector("header label")?.textContent.trim();
									if(header.includes("Delinquent")){
										delq_div = div;
									}
									else if(header.includes("Paid")){
										paid_div = div;
									}
								}
								else{
									due_div = div;
								}
							}
						});

						// DUE TABLE
						due_div?.querySelectorAll(".mb-4")?.forEach((div, i) => {
							get_due_delq_data(div);
						});

						// DELQ TABLE
						delq_div?.querySelectorAll(".mb-4")?.forEach((div, i) => {
							get_due_delq_data(div);
						});

						// PAID TABLE
						if(Object.keys(year_map).length == 0){								
							const first_table = paid_div?.querySelectorAll(".mb-4");
							if(first_table)	get_paid_data(first_table, true);
						}
						else{
							paid_div?.querySelectorAll(".mb-4")?.forEach((div, i) => {
								get_paid_data(div, false);
							});
						}

						return {
							year_map,
							max_year,
							delinquent
						};			

					});
					
					main_data['delinquent'] = history['delinquent'];
					resolve({
						data: main_data,
						year_map: history['year_map'],
						max_year: history['max_year']
					});

				})
				.catch((error) => {
					console.log(error)
					reject(new Error("Record not found"));
				});
			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message));
			})

		}
		catch(error) {
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_2 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const data = main_data['data'];
			const year_map = main_data['year_map'];
			const max_year = main_data['max_year'];

			data['notes'] = (Object.keys(year_map).length == 1) ? "ALL PRIORS ARE PAID, " : "TAXES ARE DELINQUENT, ";

			for(let year in year_map){
				if(year_map[year].length == 1){
					year_map[year][0]['payment_type'] = "Annual";
					data['tax_history'].push(year_map[year][0]);

					if(year == max_year){
						data['notes'] += `${max_year} TAXES ARE ${(year_map[year][0]['status']).toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY, `;
					}
				}
				else if(year_map[year].length > 1){
					data['notes'] += `${max_year} `;

					year_map[year].sort((a, b) => {
						return new Date(a['due_date']) - new Date(b['due_date']);				
					});
					year_map[year].forEach((d, i) => {
						if(d['id'] == 0){
							d['payment_type'] = "Installment " +(i+1);
						}
						data['tax_history'].push(d);

						if(year == max_year){
							data['notes'] += `${d['payment_type'].toUpperCase()} IS ${d['status'].toUpperCase()}, `;
						}
					});
					data['notes'] += `NORMALLY TAXES ARE PAID QUARTERLY, `;
				}
			}

			data['notes'] += `NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31 FOR QUARTERLY PAYMENT AND 03/31 FOR ANNUAL PAYMENT`;

			resolve(data);
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

			Promise.all([
				page.locator("button[title='View Assessment Data']").click(),
				page.waitForNavigation()
			])
			.then(() => {

				page.waitForSelector(".main-content div", timeout_option)
				.then(async () => {

					const page_content = await page.evaluate(() => {
						const divs = document.querySelector(".main-content").children;
						const trs = divs[divs.length - 2].querySelectorAll("table tbody tr");

						const content  = {
							total_assessed_value: "",
							total_taxable_value: ""
						};
						content['total_assessed_value'] = trs[0].querySelectorAll('td')[1].textContent;
						content['total_taxable_value'] = trs[2].querySelectorAll('td')[1].textContent;

						return content;
					})

					data['total_assessed_value'] = page_content['total_assessed_value'];
					data['total_taxable_value'] = page_content['total_taxable_value'];

					resolve(data);
				})
				.catch((error) => {
					console.log(error);
					resolve(data);
				});

			})
			.catch((error) => {
				console.log(error);
				resolve(data);
			});		

		}
		catch(error){
			console.log(error);
			reject(error.message)
		}
	})
}

const account_search = async (page, url, account) => {
	return new Promise( async (resolve, reject) => {
		try{
			
			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1)
				.then((data2) => {

					ac_3(page, data2)
					.then((data3) => {
						resolve(data3);
					})
					.catch((error) =>{
						reject(new Error(error.message));
					});

				})
				.catch((error) =>{
					reject(new Error(error.message));
				});

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

		const url = "https://pbctax.publicaccessnow.com/PropertyTax.aspx";

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

export {
	search
}