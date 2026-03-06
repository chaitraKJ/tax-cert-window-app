const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
	timeout: 90000
};

const get_half_amount = (amt) => { 	
	let full = amt?.replace(/[$,]/g, '');
	if(full){	
		let half = (+full/2).toFixed(2);
		return "$"+half;
	}
	return amt;
}

const is_delq = (date) => {
	let today = new Date();
	let delq_date = new Date(date);
	if(today >= delq_date){
		return true;
	}
	return false;
}

const ac_1 = async (page, account)  => {
	return new Promise(async (resolve, reject) => {
		try{
			// SEARCH PAGE
			const url = `https://treasurer.maricopa.gov/PropertyTaxInformation/?parcel=${account}`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// PROMISE FOR RECORD FOUND OR NOT
			const no_record_promise = page.waitForSelector('#propertyOwnerSearchResultColumn', timeout_option).then(() => { return { id:1 }});
			const success_promise = page.waitForSelector('.k-grid-table .k-table-td .trs-fs-16', timeout_option).then(() => { return { id:2 }});
			Promise.any([
				no_record_promise,
				success_promise
			])
			.then(async (data) => {
				if(data['id'] == 1){
					reject(new Error("Record not found"));
				}
				else if(data['id'] == 2){

					const data = await page.evaluate((account) => {
						const main_data = {
							processed_date : "",
							order_number : "",
							borrower_name: "",
							owner_name: [],
							property_address: "",
							parcel_number: account,
							land_value: "",
							improvements: "",
							total_assessed_value: "",
							exemption: "",
							total_taxable_value: "",
							taxing_authority: "Maricopa County Treasurer, 301 W Jefferson St #100, Phoenix, AZ 85003, Ph: 602-506-8511",	
							notes: "",
							delinquent: "NONE",			
							tax_history: []
						}
						const th = {
							jurisdiction: "County",
							year: "",
							payment_type: "Annual",
							status: "",
							base_amount: "",
							amount_paid: "$0.00",
							amount_due: "",
							mailing_date: "N/A",
							due_date: "",
							delq_date: "",
							paid_date: "",
							good_through_date: "",
						};
						let year_map = {};
						let max_year = "";

						const table = document.querySelector(".k-grid-table");

						// GET THE UNPAID DATA
						const trs = table.querySelectorAll("tbody tr");
						for(let i=0; i<trs.length; i++){
							const tds = trs[i].querySelectorAll("td");

							let year = tds[1]?.textContent.trim();
							let status = tds[2]?.textContent.trim();
							let base_amount = tds[3]?.textContent.trim();
							let amount_paid = tds[4]?.textContent.trim();
							let amount_due = tds[6]?.textContent.trim();

							if(status.includes("Paid")){
								if(i == 0){
									max_year = year;
									year_map[year] = {
										base_amount: base_amount,
										amount_due: amount_due,
										history: []
									};
								}							
								break;
							}
							else{
								max_year = (+year > +max_year) ? year : max_year;
								year_map[year] = {
									base_amount: base_amount,
									amount_due: amount_due,
									history: []
								};
								if(amount_paid == "$0.00"){
									[1, 2].forEach((d) => {
										let h = {...th};
										h['year'] = year;
										h['payment_type'] = "";
										h['status'] = "Due";
										h['base_amount'] = "";
										h['amount_paid'] = amount_paid;
										year_map[year]['history'].push(h);
									});
								}
								else{
									let h = {...th};
									h['year'] = year;
									h['payment_type'] = "";
									h['status'] = "Due";
									h['base_amount'] = "";
									h['amount_paid'] = "$0.00";
									h['amount_due'] = amount_due;
									year_map[year]['history'].push(h);
								}
							}
						}

						// GET THE OWNER DETAILS
						const top_parent = table.closest(".container-fluid").parentElement;
						const info_div = top_parent.querySelector(".container");
						const info_headings = info_div.querySelectorAll("h3");
						info_headings.forEach((h3, i) => {
							if(i != 0){
								let text = h3?.textContent.trim();
								if(text.includes("Owner")){
									main_data['owner_name'].push(h3?.nextElementSibling?.textContent.trim());
								}
								else if(text.includes("Situs")){
									main_data['property_address'] = h3?.nextElementSibling?.textContent.trim();
								}
							}						
						});

						// CLEAR THE TABLE AND TABLE CONTENTS
						table.parentElement.innerHTML = "";

						return {
							data: main_data,
							year_map,
							max_year
						}

					}, account);
					resolve(data);
				}		
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

const ac_2 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try{

			// CLICK ON THE PAYMENT HISTORY LINK
			await page.evaluate(() => {
				const list = document.querySelectorAll("#ptiNav a");
				const history_link = list[1];			
				history_link.click();

				return;
			});

			// WAIT FOR THE TABLE CONTENTS
			page.waitForSelector('.k-grid-table .k-table-td .trs-fs-16', timeout_option)
			.then(async () => {

				const year_map = main_data['year_map'];
				const all_year_map = await page.evaluate((year_map) => {
					const th = {
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

					const table = document.querySelector(".k-grid-table");

					// GET THE PAID DATA
					const trs = table.querySelectorAll("tbody tr");
					for(let i=0; i<trs.length; i++){
						const tds = trs[i].querySelectorAll("td");

						let year = tds[1]?.textContent.trim();
						let description = tds[2]?.textContent.trim();

						if(year_map[year] && description == "Tax Payment"){
							let amount_paid = tds[3]?.textContent.trim();
							let paid_date = tds[4]?.textContent.trim();

							let h = {...th};
							h['year'] = year;
							h['payment_type'] = "";
							h['status'] = "Paid";
							h['base_amount'] = "";
							h['amount_paid'] = amount_paid;
							h['paid_date'] = paid_date;
							year_map[year]['history'].unshift(h);
						}					
					}

					// CLEAR THE TABLE AND TABLE CONTENTS
					table.parentElement.innerHTML = ""; 

					return year_map;

				}, year_map);

				main_data['year_map'] = all_year_map;

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

const ac_3 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try{

			// CLICK ON THE PAYMENT HISTORY LINK
			await page.evaluate(() => {
				const list = document.querySelectorAll("#ptiNav a");
				const history_link = list[5];
				history_link?.click();
				return;
			});

			// WAIT FOR THE TABLE CONTENTS
			page.waitForSelector(".k-grid-table .k-table-td", timeout_option)				
			.then(async () => {
				await page.waitForFunction('document.querySelector(".k-grid-table .k-table-td")?.innerText.trim() != ""', timeout_option);

				const year_map = main_data['year_map'];
				const assessed_amt = await page.evaluate(() => {				
					const table = document.querySelector(".k-grid-table");

					// GET THE ASSESSOR DATA
					const tr = table?.querySelector("tbody tr");
					const tds = tr?.querySelectorAll("td");
					let assessed_amt = tds[3]?.textContent.trim();
					return assessed_amt;

				});

				main_data['assessed_value'] = assessed_amt ? assessed_amt : "N/A";
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

const ac_4 = async (page, main_data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const data = main_data['data'];
			const year_map = main_data['year_map'];
			const max_year = main_data['max_year'];
			const assessed_value = main_data['assessed_value'];
			data['notes'] = (Object.keys(year_map).length == 1) ? "ALL PRIORS ARE PAID" : "PRIORS ARE DELINQUENT";
			
			const main_history_data = [];
			for(let year in year_map){
				let base_amt = year_map[year]['base_amount'];
				let half_base_amt = get_half_amount(base_amt);

				let amount_due = year_map[year]['amount_due'];
				let half_amount_due = get_half_amount(amount_due);


				let history = year_map[year]['history'];

				let len = history.length;
				history.forEach((h, i) => {
					if(len == 1){					
						h['payment_type'] = "Annual";
						h['base_amount'] = base_amt;

						h['due_date'] = `12/31/${year}`;
						h['delq_date'] = `01/01/${+year+1}`;													
					}
					else if(len > 1){
						h['payment_type'] = "Semi-Annual";
						h['base_amount'] = half_base_amt;
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
							data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}	
						if(h['amount_due'] == ""){
							h['amount_due'] = half_amount_due;
						}
					}

					main_history_data.push(h);
				});

				if(+year == +max_year){
					if(len == 1){
						data['notes'] += `, ${year} TAXES ARE ${(history[0]['status']).toUpperCase()}, NORMALLY TAXES ARE PAID ANNUALLY.`;
					}
					else if(len > 1){
						data['notes'] += `, ${year} 1ST INSTALLMENT IS ${(history[0]['status']).toUpperCase()}, 2ND INSTALLMENT IS ${(history[1]['status']).toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
					}
				}
			}

			data['notes'] += ` NORMAL DUE DATES ARE 12/31 FOR ANNUAL, 10/01 AND 03/01 FOR SEMI-ANNUAL`;
			data['tax_history'] = main_history_data;
			data['total_taxable_value'] = assessed_value;
			data['total_assessed_value'] = assessed_value;
			resolve(data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, account)
			.then((data1) => {

				ac_2(page, data1)
				.then((data2) => {

					ac_3(page, data2)
					.then((data3) => {

						ac_4(page, data3)
						.then((data4) => {
							resolve(data4);

						})
						.catch((error) => {
							console.log(error);
							reject(error);
						});

					})
					.catch((error) => {
						console.log(error);
						reject(error);
					});

				})
				.catch((error) => {
					console.log(error);
					reject(error);
				})

			})
			.catch((error) => {
				console.log(error);
				reject(error);
			})

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
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
			// FRONTEND POINT
			account_search(page, account)
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
			})
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, account)
			.then((data) => {
				res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error)
				res.status(500).json({
					error: true,
					message: error.message
				})
			})
			.finally(async () => {
				await context.close();
			})
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