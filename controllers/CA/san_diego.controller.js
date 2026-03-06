const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const fs = require("fs");
const PDFParser = require("pdf2json");
const base64 = require('base64topdf');

const timeout_option = {
	timeout: 90000
};

const get_half_amount = (amount) => {
	let num = amount.replace(/[$,]/g, "");
	let half = (num/2).toFixed(2);
	return "$"+half;
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// CLICK THE DIV TO OPEN INPUT
			await page.waitForSelector("#BillSearchPanelGroup-heading-SearchByBillNumberBlock a", timeout_option);
			await page.locator("#BillSearchPanelGroup-heading-SearchByBillNumberBlock a").click();

			// FILL THE PARCEL INPUT
			await page.waitForSelector("#billNumber", timeout_option);
			await page.locator("#billNumber").fill(account);

			// CLICK THE BUTTON AND WAIT FOR URL CHANGE
			Promise.all([
				page.waitForNavigation(),
				page.locator("#search-by-bill-number-block-form button").click()
			])
			.then(async () => {

				await page.waitForSelector("#PaymentApplicationContent_gvSecured tbody tr", timeout_option);

				const page_content = await page.evaluate((account) => {
					const is_delq = (date) => {
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
						owner_name: ['N/A'],
						property_address: "N/A",
						parcel_number: account,
						land_value: "",
						improvements: "",
						total_assessed_value: "",
						exemption: "",
						total_taxable_value: "",
						taxing_authority: "San Diego Treasurer-Tax Collector, 1600 Pacific Highway, Room 162, San Diego, CA 92101",
						notes: "",
						delinquent:"NONE",				
						tax_history: []
					};

					let start_year = "";
					let end_year = "";

					const rows = document.querySelectorAll("#PaymentApplicationContent_gvSecured tbody tr");
					for(let i=0; i<rows.length-1; i=i+2){
						let start_year = "";
						let end_year = "";

						const first_tr = rows[i];						
						const second_tr = rows[i+1];						

						if(first_tr && second_tr){
							const tds_1 = Array.from(first_tr.querySelectorAll("td"));
							const parcel_number = tds_1[1].textContent.trim().replace(/[-]/g, "");
							if(parcel_number  ==  account){

								// --- FIRST ROW ---
								const th_1 = {
									jurisdiction: "County",
									year: "",
									payment_type: "",
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
								
								const tds_arr_1 = tds_1.filter((td) => { if(!td.classList.contains("visible-xs") && !td.hasAttribute("rowspan")) return td });
								tds_arr_1.forEach((td, i) => {
									let data = td.textContent.trim();
									if(i == 0){
										th_1['payment_type'] = data;
									}
									else if(i == 1){
										th_1['base_amount'] = data;
									}
									else if(i == 2){								
										start_year = data.split("/")[2];
										th_1['delq_date'] = data;
										th_1['due_date'] = `11/01/${start_year}`;
									}
									else if(i == 3){
										let txt = data.split(" ");
										th_1['status'] = txt[0] ? txt[0]?.toUpperCase() : "";
										th_1['paid_date'] = txt[2] ? txt[2] : "";
									}
									else if(i == 4){
										th_1['amount_due'] = data;
									}
								});


								// --- SECOND ROW ---
								const th_2 = {
									jurisdiction: "County",
									year: "",
									payment_type: "",
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
								const tds_2 = Array.from(second_tr.querySelectorAll("td"));
								const tds_arr_2 = tds_2.filter((td) => { if(!td.classList.contains("visible-xs") && !td.hasAttribute("rowspan")) return td });
								tds_arr_2.forEach((td, i) => {
									let data = td.textContent.trim();
									if(i == 0){
										th_2['payment_type'] = data;
									}
									else if(i == 1){
										th_2['base_amount'] = data;
									}
									else if(i == 2){
										end_year = data.split("/")[2];
										th_2['delq_date'] = data;
										th_2['due_date'] = `02/01/${end_year}`;							
									}
									else if(i == 3){
										let txt = data.split(" ");
										th_2['status'] = txt[0] ? txt[0]?.toUpperCase() : "";
										th_2['paid_date'] = txt[2] ? txt[2] : "";
									}
									else if(i == 4){
										th_2['amount_due'] = data;
									}
								});

								const tax_year = String(start_year) + "-" + String(end_year);
								th_1['year'] = tax_year;
								th_2['year'] = tax_year;															

								// DELINQUENT AND STATUS
								let delq_status = false;
								if(th_1['status'] != "PAID"){
									if(is_delq(th_1['delq_date'])){
										delq_status = true;
										th_1['status'] = "Delinquent";
									}
								}
								if(th_2['status'] != "PAID"){
									if(is_delq(th_2['delq_date'])){
										delq_status = true;
										th_2['status'] = "Delinquent";
									}
								}
								data['delinquent'] = (delq_status) ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

								// NOTES
								data['notes'] = `ALL PRIORS ARE PAID, ${tax_year} 1ST INSTALLMENT IS ${th_1['status']}, 2ND INSTALLMENT IS ${th_2['status']}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/10 AND 04/10`;

								data['tax_history'].push(th_1);
								data['tax_history'].push(th_2);
							}
						}
					}					

					return data;
				}, account);

				resolve(page_content);
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
	});
}

const ac_2 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const account = main_data['parcel_number'];
			const url = `https://wps.sdttc.com/webapi/api/billTemplates?merchantName=CoSDTreasurer2&billType=Secured&id1=${account}`;
			const file_name = Date.now() + "-" + account;
			const path = `./pdfs/${file_name}.pdf`;

			fetch(url, { method: "GET", headers: { "Accept": "application/octet-stream" } })
			.then((res) => res.arrayBuffer())
			.then(data => {
				var base64Str = Buffer.from(data).toString('base64');
				base64.base64Decode(base64Str, path);
			})
			.then(() => {
				const pdfParser = new PDFParser();
				pdfParser.loadPDF(path);

				pdfParser.on("pdfParser_dataError", (errData) =>{
					console.error(errData.parserError);
				});

				pdfParser.on("pdfParser_dataReady", async (pdfData) => {
					let data = [];
					pdfData['Pages'].forEach((p, i) => {
						p['Texts'].forEach((t, i) => {
							let text = t["R"][0]["T"];
							text = decodeURIComponent(text);
							if(text != null && text != " "){
								data.push(text);
							}
						});
					});

					let value = {
						assessed_value: "$0.00",
						tax_value: "$0.00"
					};
					data.forEach((d, i) => {
						if(d.includes("NET TAXABLE VALUE")){
							value['assessed_value'] = data[i+1];
						}
						else if(d.includes("TOTAL AMOUNT")){
							value['tax_value'] = data[i+1];
						}
					});

					// ASSESSED VALUE
					main_data['total_assessed_value'] = value['assessed_value'];
					main_data['total_taxable_value'] = value['assessed_value'];

					// BASE AMOUNT AND AMOUNT PAID
					let half_amount = get_half_amount(value['tax_value']);
					main_data['tax_history'].forEach((d, i) => {
						d['base_amount'] = half_amount;
						if(d['status'] == "PAID"){
							d['amount_paid'] = half_amount;
						}
						else{
							d['amount_due'] = half_amount;
						}
					});

					// DELETE THE PDF FILE
					fs.unlink(path, err => {
						if (err) {
							console.log(`An error occurred ${err.message}`);
						} else {
							console.log(`Deleted the file under ${path}`);
						}
					});

					resolve(main_data);			
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

const account_search = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{

			ac_1(page, url, account)
			.then((data1) => {
				
				ac_2(page, data1, account)
				.then((data2) => {
					resolve(data2);
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

		const url = "https://wps.sdttc.com/webpayments/CoSDTreasurer2/search";

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
			// FRONTEND ENDPOINT
			account_search(page, url, account)
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
			account_search(page, url, account)
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