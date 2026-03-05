import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import get_client_years from "../../utils/configs/client.config.js";

const timeout_option = {
	timeout: 90000
};

const annual_due_and_delq_date = (year) => {
	return {
		due_date: `31/03/${+year+1}`,
		delq_date: `01/04/${+year+1}`,
	};
}

const installment_due_and_delq_date = (year, i) => {
	let due_date = '';
	let delq_date = '';
	switch(i){
		case 0: due_date=`30/06/${year}`; delq_date=`01/07/${year}`;  break;
		case 1: due_date=`30/09/${year}`; delq_date=`01/10/${year}`;  break;
		case 2: due_date=`31/12/${year}`; delq_date=`01/01/${+year+1}`;  break;
		case 3: due_date=`31/03/${+year+1}`; delq_date=`01/04/${+year+1}`;  break;
		default: break;
	}
	return {
		due_date: due_date,
		delq_date: delq_date,
	};
}

const generate_notes = (year, keys, status, type) => {
	let notes = "";
	try{
		notes = (keys == 1) ? `ALL PRIORS ARE PAID. ${year} ` : `PRIORS ARE DELINQUENT. ${year} `;

		if(type == "Annual"){
			notes += `TAXES ARE ${status[0].toUpperCase()},`;
			notes += ` NORMALLY TAXES ARE PAID ANNUALLY,`;
		}
		else{
			status.forEach((s, i) => {
				notes += `#${i+1} INSTALLMENT IS ${status[i].toUpperCase()}, `
			});
			notes += ` NORMALLY TAXES ARE PAID QUARTERLY,`;
		}
		notes += ` NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31 FOR QUARTERLY PAYMENT AND 03/31 FOR ANNUAL PAYMENT`;
	}
	catch(error){
		console.log(error);
	}
	finally{
		return notes;
	}
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			// SEARCH PAGE
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// FILL THE SEARCH INPUT
			await page.waitForSelector("input[title='Account']", timeout_option);
			await page.locator("input[title='Account']").fill(account);
			
			// CLICK THE SEARCH BUTTON
			await page.waitForSelector("#TabSearch-panel button", timeout_option);
			await page.locator("#TabSearch-panel button").click();
			
			// CLICK ENTER AND WAIT FOR AJAX RESPONSE
			let result_url = 'https://sarasotataxcollector.publicaccessnow.com/DesktopModules/QuickSearch/API/Module/GetData';
			page.on('response', async (response) => {
				if (response.url().includes(result_url)) {
					let res = await response.json();
					if(res['total'] > 0){
						resolve(res);
					}
					else{
						reject(new Error("No record found"));					
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

const ac_2 = async (page, data) => {
	return new Promise(async(resolve, reject) => {
		try{
			let result = data['items'][0]['fields'];
			let url = `https://sarasotataxcollector.publicaccessnow.com/TaxCollector/PropertyTaxSearch/PropertyTaxProcessing.aspx?p=${result['Account']}&a=${result['AlternateKey']}&y=${result['Year']}`;

			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			const ajax_url_1 = "https://sarasotataxcollector.publicaccessnow.com/API/PaymentBill/Bill/GetData";
			const ajax_url_2 = "https://sarasotataxcollector.publicaccessnow.com/API/DataDisplay/DataSources/GetData";
			const _m = "_m=634";

			let ajax_data = {};
			let first_flag = false;
			let second_flag = false;
			page.on('response', async (response) => {
				if (response.url().includes(ajax_url_1)) {
					let res = await response.json();
					ajax_data['due_data'] = res;
					first_flag = true;
				}
				else if (response.url().includes(ajax_url_2) && response.url().includes(_m)) {
					let res = await response.json();	
					ajax_data['history_data'] = res;
					second_flag = true;
				}

				if(first_flag && second_flag){				
					resolve({ result, ajax_data });
				}
			});
			
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_3 = async (main_data, account, client_years) => {
	return new Promise(async(resolve, reject) => {
		try{
			let th = {
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
			let delinquent_status = "NONE";
			let max_year = 0;
			let second_max_year = 0;

			// DUE DATA
			const due_data = main_data['ajax_data']['due_data'];
			due_data['sections'].forEach((data) => {
				if(data['name'] == "Current Tax Year Installment" || data['name'] == "Curr Reg" || data['name'] == "Past Tax Years"){			
					if(data['groups'].length > 0){
						data['groups'].forEach((group) => {
							let year = group['tile']['fields'][0]['value'];
							max_year = (year > max_year) ? year : max_year;
							second_max_year = (year > second_max_year && year != max_year) ? year : second_max_year;

							year_map[year] = {
								base_amount: "",								
								history: [],
								type: (data['name'] == "Current Tax Year Installment") ? "Installment" : (data['name'] == "Curr Reg") ? "Annual" : "Past",
							};
							
							group['items'].forEach((item) => {						
								let status = "";
								let base_amount = "";
								let amount_due = "";

								item['columns'].forEach((column) => {
									let field = column['displayText'];
									let value = column['value'];
									if(field == "Status"){
										status = value;
									}								
									else if(field == "Amount Due"){
										amount_due = value;
										column['valueDetails'].forEach((vd) => {
											if(vd['displayText'] == "Gross Taxes"){
												base_amount = vd['value'];											
											}
										});
									}
								});
								if(status != "Paid"){									
									let h = {...th};

									h['year'] = year;
									h['status'] = (status == "Due" || status == "Pending") ? "Due" : "Delinquent";
									h['amount_paid'] = "$0.00";
									h['amount_due'] = (data['name'] == "Current Tax Year Installment") ? "$"+data['amountDue'] : "$"+amount_due;			

									year_map[year]['history'].push(h);

									if (h['status'] == "Delinquent"){ 
										delinquent_status = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
									}
								}
								year_map[year]['base_amount'] = base_amount ? base_amount : "";
							});							
						});
					}
				}
			});

			// HISTORY DATA
			const history_data = main_data['ajax_data']['history_data'];
			const history_rows = history_data['groups'][0]['rows'];
			if(history_rows && history_rows.length > 0){
				history_rows.forEach((row) => {
					let year = "";
					let amount_paid = "";
					let paid_date = "";
					row['values'].forEach((value) => {
						let field = value['column'];
						let f_value = value['value'];
						if(field == "Year"){
							year = f_value;
						}
						else if(field == "Date_Paid"){
							paid_date = f_value.split(" ")[0];
						}
						else if(field == "Paid"){
							amount_paid = f_value;
						}
					});				
					if(year_map[year]){
						let h = {...th};
						h['year'] = year;
						h['status'] = "Paid";
						h['amount_paid'] = "$"+amount_paid;
						h['amount_due'] = "$0.00";
						h['paid_date'] = paid_date;
						year_map[year]['history'].unshift(h);
					}
				});
			}

			// MANIPULATE THE DATA
			let { Owner, Situs } = main_data['result'];
			const data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: [Owner],
				property_address: Situs,
				parcel_number: account,
				land_value: "",
				improvements: "",
				total_assessed_value: "",
				exemption: "",
				total_taxable_value: "",
				taxing_authority: "Sarasota County Tax Collector, PO BOX 30332 Tampa FL 33630-3332",
				notes: "",
				delinquent: delinquent_status,
				tax_history: []
			};
			let history = [];
			for(let year in year_map){	
				let type = year_map[year]['type'];
				let status = [];
				if(type == "Annual"){
					let { due_date, delq_date }	= annual_due_and_delq_date(year);
					year_map[year]['history'].forEach((h, i) => {
						h['payment_type'] = "Annual";
						h['base_amount'] = "$"+year_map[year]['base_amount'];
						h['due_date'] = due_date;
						h['delq_date'] = delq_date;

						if(+year == max_year){ status.push(h['status']); }
						data['tax_history'].push(h);
					});
					if(+year == max_year){
						data['notes'] = generate_notes(max_year, Object.keys(year_map).length, status, "Annual");
					}
				}
				else if(type == "Installment"){
					let base_amount = (+year_map[year]['base_amount'] / 4).toFixed(2);
					year_map[year]['history'].forEach((h, i) => {
						let { due_date, delq_date }	= installment_due_and_delq_date(year, i);
						h['payment_type'] = `Installment ${i+1}`;
						h['base_amount'] = "$"+base_amount;
						h['due_date'] = due_date;
						h['delq_date'] = delq_date;

						if(+year == max_year){ status.push(h['status']); }
						data['tax_history'].push(h);
					});
					if(+year == max_year){
						data['notes'] = generate_notes(max_year, Object.keys(year_map).length, status, "Installment");
					}
				}
				else{
					let count = year_map[year]['history'].length;
					if(count == 1){
						let { due_date, delq_date }	= annual_due_and_delq_date(year);
						year_map[year]['history'].forEach((h, i) => {
							h['payment_type'] = "Annual";
							h['base_amount'] = "$"+year_map[year]['base_amount'];
							h['due_date'] = due_date;
							h['delq_date'] = delq_date;

							data['tax_history'].push(h);
						});
					}
					else if(count > 1){
						let base_amount = (+year_map[year]['base_amount'] / 4).toFixed(2);
						year_map[year]['history'].forEach((h, i) => {
							let { due_date, delq_date }	= installment_due_and_delq_date(year, i);
							h['payment_type'] = `Installment ${i+1}`;
							h['base_amount'] = "$"+base_amount;
							h['due_date'] = due_date;
							h['delq_date'] = delq_date;

							data['tax_history'].push(h);
						});
					}
				}
			}	

			resolve(data);		
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_4 = async (page, data, account) => {
	return new Promise (async (resolve, reject) => {
		try{
			const url = `https://www.sc-pa.com/propertysearch/parcel/details/${account}`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("footer", timeout_option);

			let value = await page.evaluate(() => {
				let assessed_value = "";
				let taxable_value = "";

				document.querySelectorAll(".h2").forEach((h2, i) => { 
					let text = h2.textContent; 
					if(text == "Values"){ 
						let table = h2.nextElementSibling; 
						let tr = table?.querySelector("tbody tr");
						if(tr){
							let tds = tr.querySelectorAll("td");
							if(tds.length >= 9){
								assessed_value = tds[5].textContent.trim();
								taxable_value = tds[7].textContent.trim();
							}
						}
					} 
				});

				return { assessed_value, taxable_value };
			})

			data['total_assessed_value'] = value['assessed_value'];
			data['total_taxable_value'] = value['taxable_value'];
			resolve(data);
		}
		catch(error){
			console.log(error);
			resolve(data);
		}
	})
}

const account_search = async (page, url, account, client_years) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {

				ac_2(page, data1)
				.then((data2) => {

					ac_3(data2, account, client_years)
					.then((data3) => {
						
						ac_4(page, data3, account)
						.then((data4) => {
							resolve(data4);
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

			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message));
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	})
}

const search = async (req, res) => {
	const { fetch_type, account, client } = req.body;
	try{
		const client_years = get_client_years(client);

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

		const url = "https://sarasotataxcollector.publicaccessnow.com/TaxCollector/PropertyTaxSearch.aspx";

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
			account_search(page, url, account, client_years)
			.then((data) => {
				res.status(200).render('parcel_data_official', data);
			})
			.catch((error) => {
				console.log(error);
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
			account_search(page, url, account, client_years)
			.then((data) => {
				return res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error);
				return res.status(500).json({
					error:true,
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

export {
	search
}