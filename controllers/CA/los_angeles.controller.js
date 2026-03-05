import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
	timeout: 90000
};

const get_status = (status, date) => {
	const today = new Date();
	const delq_date = new Date(date);

	let real_status = "Due";
	let is_delq = false;

	if(today >= delq_date){
		real_status = "Delinquent";
		is_delq = true;
	}

	return { real_status, is_delq };
}

const ac_1 = async (page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "networkidle0"});

			await page.waitForSelector("#termsForm", timeout_option);
			await Promise.all([
				page.waitForNavigation(),
				page.evaluate(() => { document.querySelector("#termsForm").submit() })
			]);

			resolve("https://vcheck.ttc.lacounty.gov/proptax.php?page=screen");
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	})
}

const ac_2 = async (page, url, account) => {
	return new Promise (async (resolve, reject) => {
		try{
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			let new_account = account.replace(/[-]/g, '');
			let str_account = new_account.toString();

			if(str_account.length < 10 || str_account.length > 10){
				reject(new Error("Account/Parcel Information must be 10 digits"));
			}

			let part_1 = str_account.substring(0, 4);
			let part_2 = str_account.substring(4, 7);
			let part_3 = str_account.substring(7);
 
			const account_arr = account.split("-");
			await page.locator("#sform input[name='mapbook']").fill(part_1);
			await page.locator("#sform input[name='page']").fill(part_2);
			await page.locator("#sform input[name='parcel']").fill(part_3);

			await Promise.all([
				page.locator("#sform input[name='submit']").click(),
				page.waitForNavigation()
			]);

			page.waitForSelector("#inquirebutton", timeout_option);
			await Promise.all([
				page.locator("#inquirebutton").click(),
				page.waitForNavigation()
			]);

			const data = {
				processed_date : "",
				order_number : "",
				borrower_name: "",
				owner_name: ['N/A'],
				property_address: "N/A",
				parcel_number: account,
				land_value: "",
				improvements: "",
				total_assessed_value: "N/A",
				exemption: "",
				total_taxable_value: "N/A",
				taxing_authority: "LOS ANGELES COUNTY TAX COLLECTOR, KENNETH HAHN HALL OF ADMINISTRATION, 225 NORTH HILL STREET, ROOM 137, LOS ANGELES, CA 90012",
				notes: "",
				delinquent:"NONE",	
				tax_history: []
			}

			await page.waitForSelector(".installmenttable", timeout_option);
			const history_map = await page.evaluate(() => {
				const get_next_day = (date) => {
					const next_date = new Date(date);
					next_date.setDate(next_date.getDate() + 1);
					return (+next_date.getMonth() + 1) + "/" + next_date.getDate() + "/" + next_date.getFullYear();
				}
				let th_map = {};

				const tables = document.querySelectorAll(".installmenttable");
				for(let index=0; index<tables.length; index++){
					let table = tables[index];

					// GET THE YEAR VALUE
					let year = "";
					let installment_info = table.previousElementSibling;
					let info_bs = installment_info.querySelectorAll("b");
					for(let i=0; i<info_bs.length; i++){
						if(info_bs[i].textContent.includes("Year")){
							year = info_bs[i].nextSibling.textContent.trim();
							break;
						}
					}
					year = "20" + year;

					const install_1 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Installment 1",
						status: "",
						base_amount: "",
						amount_paid: "",
						amount_due: "",
						mailing_date: "N/A",
						due_date: "12/10/"+year,
						delq_date: "12/11/"+year,
						paid_date: "N/A",
						good_through_date: "",
					};

					const install_2 = {
						jurisdiction: "County",
						year: year,
						payment_type: "Installment 2",
						status: "",
						base_amount: "",
						amount_paid: "",
						amount_due: "",
						mailing_date: "N/A",
						due_date: "04/10/"+ (+year+1),
						delq_date: "04/11/"+ (+year+1),
						paid_date: "N/A",
						good_through_date: "",
					}
					
					const rows = table.querySelectorAll("tbody tr")
					rows.forEach((tr, i) => {
						if(i == 1){
							tr.querySelectorAll(".fakeform").forEach((td, i) => {
								if(i == 0){
									install_1['base_amount'] = td.textContent.trim();
								}
								else if(i == 1){
									install_2['base_amount'] = td.textContent.trim();
								}
							})
						}					
						else if(i == 4){
							tr.querySelectorAll(".fakeform").forEach((td, i) => {
								if(i == 0){
									install_1['amount_paid'] = td.textContent.trim();
								}
								else if(i == 1){
									install_2['amount_paid'] = td.textContent.trim();
								}
							})
						}
						else if(i == 5){
							tr.querySelectorAll(".fakeform").forEach((td, i) => {
								if(i == 0){
									install_1['amount_due'] = td.textContent.trim();
									install_1['status'] = (install_1['amount_due'] == "$0.00") ? "Paid" : "Unpaid";
								}
								else if(i == 1){
									install_2['amount_due'] = td.textContent.trim();
									install_2['status'] = (install_2['amount_due'] == "$0.00") ? "Paid" : "Unpaid";
								}
							})
						}
						else if(i == 6){
							tr.querySelectorAll(".fakeform").forEach((td, i) => {
								let due_date = td.textContent.trim();
								if(i == 0 && due_date != ""){
									install_1['due_date'] = due_date;
									install_1['delq_date'] = get_next_day(due_date);
								}
								else if(i == 1 && due_date != ""){
									install_2['due_date'] = due_date;
									install_2['delq_date'] = get_next_day(due_date);
								}
							})
						}
					});

					th_map[year] = [];
					th_map[year].push(install_1);
					th_map[year].push(install_2);
				}

				return th_map;
			});

			let max_year = 0;
			for(let year in history_map){
				max_year = (year > max_year) ? year : max_year;
				history_map[year].forEach((h, i) => {
					if(h['status'] == "Unpaid" && h['delq_date'] != ""){
						let { real_status, is_delq } = get_status(h['status'], h['delq_date']);
						h['status'] = real_status;
						if(is_delq){
							data['delinquent'] = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
						}
					}
					data['tax_history'].push(h);
				});
			}

			// NOTES
			let history_map_length = Object.keys(history_map).length;
			let install_1_status = history_map[max_year][0]['status'];
			let install_2_status = history_map[max_year][1]['status'];
			data['notes'] = (history_map_length > 1) ? "PRIORS ARE DELINQUENT, " : "ALL PRIORS ARE PAID, ";
			data['notes'] += `${max_year}-${+max_year+1} 1ST INSTALLMENT IS ${install_1_status.toUpperCase()}, 2ND INSTALLMENT IS ${install_2_status.toUpperCase()}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/10 AND 04/10`;
			
			resolve(data);
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
				.catch((error) => {
					console.log(error);
					reject(new Error(error.message))
				});

			})
			.catch((error) => {
				console.log(error);
				reject(new Error(error.message))
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	})
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

		const url = "https://vcheck.ttc.lacounty.gov/proptax.php?page=screen";

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

export {
	search
}