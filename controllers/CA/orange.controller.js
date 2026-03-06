// // Author: Dhanush

// const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
// const sharp = require('sharp');
// const Tesseract = require('tesseract.js');

// const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// const timeout_option = { timeout: 90000 };

// // Utility: Check if a given date is delinquent compared to today's date
// const is_delq = (date) => {
// 	let today = new Date();
// 	let delq_date = new Date(date);
// 	if(today >= delq_date){
// 		return true;
// 	}
// 	return false;
// }

// // Orange County configuration
// const COUNTY_CONFIG = {
// 	orange: {
// 		url: "https://taxbill.octreasurer.gov/secured/apn?apn=",
// 		taxing_authority: "Orange County Treasurer-Tax Collector, 601 N Ross St, Santa Ana, CA 92701, Ph: 714-834-3411"
// 	}
// };

// // Common selectors and dates for Orange County
// const COMMON_SELECTORS = {
// 	first_due_date: "11/01",
// 	first_delq_date: "12/11",
// 	second_due_date: "02/01",
// 	second_delq_date: "04/11",
// 	selectors: {
// 		captcha_image: "#captcha",
// 		captcha_input: "#captchaInput",
// 		verify_button: "#verify",
// 		property_info: '.info-value',
// 		bill_table: 'app-apn-secured .table tbody tr.ng-star-inserted',
// 		view_button: 'app-apn-secured button.btn.btn-info.btn-sm',
// 		installment_cards: '.installment-card',
// 		assessment_table: 'app-apn-nonsupp-detail .table tbody tr'
// 	}
// };

// /**
//  * Wait for a new CAPTCHA image to load by checking src change
//  */
// const waitForNewCaptcha = async (page, oldSrc, maxWaitAttempts = 50) => {
// 	let attempts = 0;
// 	while (attempts < maxWaitAttempts) {
// 		attempts++;
// 		const newSrc = await page.evaluate(() => document.getElementById("captcha")?.src || '');
// 		if (newSrc && newSrc !== oldSrc) {
// 			return true;
// 		}
// 		await delay(300);
// 	}
// 	throw new Error("Failed to load new CAPTCHA image after waiting");
// };

// /**
//  * Extract CAPTCHA image from page
//  */
// const extractCaptcha = async (page) => {
// 	try {
// 		await page.waitForSelector(COMMON_SELECTORS.selectors.captcha_image, {
// 			visible: true,
// 			timeout: 10000
// 		});
		
// 		await delay(300);
		
// 		const captchaSrc = await page.evaluate(() => {
// 			const img = document.getElementById("captcha");
// 			if (!img.complete) {
// 				return null;
// 			}
// 			return img?.src || null;
// 		});
		
// 		if (!captchaSrc) throw new Error("CAPTCHA src not found or not loaded");
		
// 		const base64 = captchaSrc.split(';base64,')[1];
// 		if (!base64) throw new Error("Invalid base64 in src");
		
// 		const buffer = Buffer.from(base64, 'base64');
// 		if (buffer.length < 500) throw new Error("CAPTCHA image buffer too small - likely invalid");
		
// 		return buffer;
// 	} catch (error) {
// 		console.error("CAPTCHA fetch error:", error.message);
// 		throw error;
// 	}
// };

// /**
//  * Preprocess CAPTCHA image for better OCR
//  */
// const preprocessCaptcha = async (imageBuffer) => {
// 	try {
// 		const processed = await sharp(imageBuffer)
// 			.resize(400, 100, { kernel: sharp.kernel.lanczos3 })
// 			.greyscale()
// 			.normalize()
// 			.linear(1.8, -80)
// 			.median(1)
// 			.blur(0.3)
// 			.sharpen({ sigma: 1.5 })
// 			.threshold(140)
// 			.extend({ 
// 				top: 15, 
// 				bottom: 15, 
// 				left: 15, 
// 				right: 15, 
// 				background: { r: 255, g: 255, b: 255 } 
// 			})
// 			.png({ compressionLevel: 9 })
// 			.toBuffer();
		
// 		return processed;
// 	} catch (error) {
// 		throw new Error("Preprocessing failed: " + error.message);
// 	}
// };

// /**
//  * Read CAPTCHA text using OCR
//  */
// const readCaptcha = async (imageBuffer) => {
// 	try {
// 		const { data: { text } } = await Tesseract.recognize(
// 			imageBuffer,
// 			'eng',
// 			{
// 				tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
// 				tessedit_pageseg_mode: '8',
// 				tessedit_ocr_engine_mode: '1',
// 				user_defined_dpi: '300',
// 				preserve_interword_spaces: '0',
// 				tessedit_do_invert: '0',
// 			}
// 		);
		
// 		let cleaned = text
// 			.replace(/[^A-Z0-9]/gi, '')
// 			.toUpperCase()
// 			.trim();
		
// 		if (cleaned.length > 5) {
// 			cleaned = cleaned.substring(0, 5);
// 		}
		
// 		if (cleaned.length !== 5) {
// 			throw new Error(`Invalid CAPTCHA length: ${cleaned.length} ("${cleaned}")`);
// 		}
		
// 		return cleaned;
// 	} catch (error) {
// 		throw new Error("OCR failed: " + error.message);
// 	}
// };

// /**
//  * Solve CAPTCHA with retries
//  */
// const verifyCaptcha = async (page, maxRetries = 10) => {
// 	let attempts = 0;
	
// 	while (attempts < maxRetries) {
// 		attempts++;
		
// 		try {
// 			// Clear input field
// 			await page.waitForSelector(COMMON_SELECTORS.selectors.captcha_input, { timeout: 5000 });
// 			await page.evaluate(() => {
// 				const el = document.getElementById("captchaInput");
// 				if (el) {
// 					el.value = '';
// 					el.focus();
// 				}
// 			});
// 			await delay(500);
			
// 			// Extract and solve CAPTCHA
// 			const captchaImage = await extractCaptcha(page);
// 			const processed = await preprocessCaptcha(captchaImage);
// 			const captchaText = await readCaptcha(processed);
			
// 			// Type CAPTCHA text
// 			await page.type(COMMON_SELECTORS.selectors.captcha_input, captchaText, { delay: 80 });
// 			await delay(1000);
			
// 			// Click verify button
// 			await page.waitForSelector(COMMON_SELECTORS.selectors.verify_button, { timeout: 5000 });
// 			await page.click(COMMON_SELECTORS.selectors.verify_button);
// 			await delay(5000);
			
// 			// Check if modal closed (success)
// 			const modalClosed = await page.evaluate(() => {
// 				const modal = document.querySelector('ngb-modal-window');
// 				if (!modal) return true;
// 				const style = window.getComputedStyle(modal);
// 				return style.display === 'none' || !modal.classList.contains('show');
// 			});
			
// 			if (modalClosed) {
// 				return true;
// 			}
			
// 			// Check for incorrect message
// 			const incorrect = await page.evaluate(() => {
// 				return document.querySelector('.alert-warning')?.textContent.includes('Incorrect Captcha');
// 			});
			
// 			if (!incorrect) {
// 				throw new Error("Unexpected CAPTCHA state");
// 			}
			
// 			if (attempts < maxRetries) {
// 				// Clear input
// 				await page.evaluate(() => {
// 					const el = document.getElementById("captchaInput");
// 					if (el) el.value = '';
// 				}).catch(() => {});
// 				await delay(500);
				
// 				// Wait for new CAPTCHA
// 				const oldSrc = await page.evaluate(() => document.getElementById("captcha")?.src || '');
// 				try {
// 					await waitForNewCaptcha(page, oldSrc);
// 					await delay(2000);
// 				} catch (e) {
// 					console.log("Auto-refresh timeout, checking if modal closed...");
// 				}
// 			}
			
// 		} catch (err) {
// 			// Treat CAPTCHA failures as No Record Found
// 			if (err.message.includes('#captchaInput') || 
// 				err.message.includes('CAPTCHA src not found') || 
// 				err.message.includes('Failed to load new CAPTCHA')) {
// 				throw new Error("No Record Found");
// 			}

// 			console.error(`✗ Attempt ${attempts} error:`, err.message);
			
// 			if (attempts < maxRetries) {
// 				try {
// 					// Clear input
// 					await page.evaluate(() => {
// 						const el = document.getElementById("captchaInput");
// 						if (el) el.value = '';
// 					}).catch(() => {});
// 					await delay(500);
					
// 					// Check if modal closed
// 					const modalClosed = await page.evaluate(() => {
// 						const modal = document.querySelector('ngb-modal-window');
// 						return !modal || window.getComputedStyle(modal).display === 'none';
// 					});
					
// 					if (modalClosed) {
// 						return true;
// 					}
					
// 					// Wait for new CAPTCHA
// 					const oldSrc = await page.evaluate(() => document.getElementById("captcha")?.src || '');
// 					await waitForNewCaptcha(page, oldSrc);
// 					await delay(2000);
// 				} catch (refreshErr) {
// 					console.error("Could not refresh CAPTCHA:", refreshErr.message);
// 				}
// 			}
// 		}
// 	}
	
// 	throw new Error(`Failed to solve CAPTCHA after ${maxRetries} attempts`);
// };

// // STEP 1 — Navigate to Orange County site and handle CAPTCHA
// const orange_step1 = async (page, account, county) => {
// 	return new Promise(async (resolve, reject) => {
// 		try{
// 			// Remove hyphens from parcel number
// 			const cleanParcel = (account || "").replace(/-/g, '');
// 			const config = COUNTY_CONFIG[county];
// 			const url = `${config.url}${cleanParcel}`;

// 			// Navigate to site
// 			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
// 			await delay(2000);

// 			// Check for CAPTCHA
// 			let hasCaptcha;
// 			try {
// 				hasCaptcha = await page.waitForSelector(COMMON_SELECTORS.selectors.captcha_image, {
// 					visible: true, 
// 					timeout: 10000
// 				});
// 			} catch {
// 				hasCaptcha = false;
// 			}
			
// 			// Solve CAPTCHA if present
// 			if (hasCaptcha) {
// 				await verifyCaptcha(page);
// 				await delay(3000);
// 			}

// 			// Wait for account page to load
// 			try {
// 				await page.waitForSelector('app-apn-account', { timeout: 30000 });
// 			} catch (e) {
// 				// If still on search page, record not found
// 				const onSearchPage = await page.evaluate(() => !!document.querySelector('app-apn-form'));
// 				if (onSearchPage) {
// 					reject(new Error("No Record Found"));
// 					return;
// 				}
// 				reject(e);
// 				return;
// 			}

// 			resolve(true);
// 		}
// 		catch(error){
// 			console.log(error);
// 			reject(new Error(error.message));
// 		}
// 	});
// }

// // STEP 2 — Extract property info and bill summary list
// const orange_step2 = async (page, account, county) => {
// 	return new Promise(async (resolve, reject) => {
// 		try{
// 			// Extract property information
// 			await page.waitForSelector(COMMON_SELECTORS.selectors.property_info, { timeout: 10000 });
// 			const propertyData = await page.evaluate(() => {
// 				const values = Array.from(document.querySelectorAll('.info-value'))
// 					.map(el => el.textContent.trim());
// 				return {
// 					parcel_number: values[0] || "",
// 					property_address: values[1] || ""
// 				};
// 			});

// 			// Extract bill summary from table
// 			await page.waitForSelector('app-apn-secured .table', { timeout: 10000 });
// 			const bills = await page.evaluate(() => {
// 				const billList = [];
// 				const rows = document.querySelectorAll('app-apn-secured .table tbody tr.ng-star-inserted');
				
// 				rows.forEach(row => {
// 					const tds = row.querySelectorAll('td');
// 					if (tds.length >= 6) {
// 						const hasButton = tds[0].querySelector('button');
// 						const year = tds[3]?.textContent.trim() || "";
// 						const status = tds[5]?.querySelector('span')?.textContent.trim() || "";
						
// 						if (hasButton && year && status) {
// 							billList.push({
// 								apn: tds[1]?.textContent.trim() || "",
// 								tax_year: year,
// 								roll_type: tds[4]?.textContent.trim() || "",
// 								status: status
// 							});
// 						}
// 					}
// 				});
				
// 				return billList;
// 			});

// 			resolve({
// 				property: propertyData,
// 				bills: bills
// 			});
// 		}
// 		catch(error){
// 			console.log(error);
// 			reject(new Error(error.message));
// 		}
// 	});
// }

// // STEP 3 — Click View button for latest year and extract installment details
// const orange_step3 = async (page, billData, county) => {
// 	return new Promise(async (resolve, reject) => {
// 		try{
// 			// Click the FIRST (latest) View button
// 			await page.waitForSelector('app-apn-secured .table', { timeout: 10000 });
// 			const viewButtonSelector = COMMON_SELECTORS.selectors.view_button;
// 			await page.waitForSelector(viewButtonSelector, { timeout: 10000 });
			
// 			await page.evaluate(() => {
// 				const buttons = document.querySelectorAll('app-apn-secured button.btn.btn-info.btn-sm');
// 				if (buttons && buttons.length > 0) {
// 					buttons[0].click();
// 				}
// 			});
			
// 			await delay(3000);
			
// 			// Wait for detailed view to load
// 			await page.waitForSelector('app-apn-statement', { timeout: 15000 });

// 			// Extract installment details
// 			await page.waitForSelector(COMMON_SELECTORS.selectors.installment_cards, { timeout: 10000 });
// 			const installments = await page.evaluate(() => {
// 				const instList = [];
// 				const cards = document.querySelectorAll('.installment-card');
				
// 				cards.forEach(card => {
// 					const title = card.querySelector('.installment-title')?.textContent.trim() || "";
// 					const infoItems = card.querySelectorAll('.info-item');
// 					const amountItems = card.querySelectorAll('.amount-item');
					
// 					const installment = {
// 						title: title,
// 						deadline: "",
// 						status: "",
// 						amount_due: "",
// 						amount_paid: "",
// 						date_paid: "",
// 						tax_amount: "",
// 						penalty: ""
// 					};
					
// 					infoItems.forEach(item => {
// 						const label = item.querySelector('.item-label')?.textContent.trim() || "";
// 						const value = item.querySelector('.item-value')?.textContent.trim() || "";
						
// 						if (label.includes("Deadline")) installment.deadline = value;
// 						if (label.includes("Status")) installment.status = value;
// 					});
					
// 					amountItems.forEach(item => {
// 						const label = item.querySelector('.amount-label')?.textContent.trim() || "";
// 						const value = item.querySelector('.amount-value')?.textContent.trim() || "";
						
// 						if (label.includes("Amount Due")) installment.amount_due = value;
// 						if (label.includes("Amount Paid")) installment.amount_paid = value;
// 						if (label.includes("Date Paid")) installment.date_paid = value;
// 						if (label.includes("Tax Amount") || label.includes("Base Tax")) installment.tax_amount = value;
// 						if (label.includes("Penalty")) installment.penalty = value;
// 					});
					
// 					instList.push(installment);
// 				});
				
// 				return instList;
// 			});

// 			// Extract assessment values
// 			await page.waitForSelector(COMMON_SELECTORS.selectors.assessment_table, { timeout: 10000 });
// 			const assessments = await page.evaluate(() => {
// 				const rows = document.querySelectorAll('app-apn-nonsupp-detail .table tbody tr');
// 				const values = {
// 					land_value: "",
// 					improvements: "",
// 					total_values: "",
// 					exemption: "",
// 					net_taxable_value: "",
// 					total_due: ""
// 				};
				
// 				rows.forEach(row => {
// 					const cells = row.querySelectorAll('td');
// 					if (cells.length >= 2) {
// 						const label = cells[0]?.textContent.trim() || "";
// 						const value = cells[1]?.textContent.trim() || "";
						
// 						if (label.includes("Land") && !label.includes("Mineral")) {
// 							values.land_value = value;
// 						}
// 						if (label.includes("Improvements")) {
// 							values.improvements = value;
// 						}
// 						if (label.includes("Total Values")) {
// 							values.total_values = value;
// 						}
// 						if (label.includes("Exemptions")) {
// 							values.exemption = value;
// 						}
// 						if (label.includes("Total Net Taxable Value")) {
// 							values.net_taxable_value = value;
// 						}
// 						if (label.includes("Total Due and Payable")) {
// 							const dueValue = cells[2]?.textContent.trim() || value;
// 							values.total_due = dueValue;
// 						}
// 					}
// 				});
				
// 				return values;
// 			});

// 			resolve({
// 				installments: installments,
// 				assessments: assessments
// 			});
// 		}
// 		catch(error){
// 			console.log(error);
// 			reject(new Error(error.message));
// 		}
// 	});
// }

// // STEP 4 — Consolidate all data into final tax report format
// const orange_step4 = async (page, step2Data, step3Data, account, county) => {
// 	return new Promise(async (resolve, reject) => {
// 		try{
// 			const config = COUNTY_CONFIG[county];
// 			const propertyData = step2Data.property;
// 			const billSummary = step2Data.bills;
// 			const installmentDetails = step3Data.installments;
// 			const assessmentValues = step3Data.assessments;

// 			// Prepare main structure
// 			const main_data = {
// 				processed_date: new Date().toISOString().split('T')[0],
// 				order_number: "",
// 				borrower_name: "",
// 				owner_name: ["N/A"],
// 				property_address: propertyData.property_address || "",
// 				parcel_number: propertyData.parcel_number || "",
// 				land_value: assessmentValues.land_value || "",
// 				improvements: assessmentValues.improvements || "",
// 				total_assessed_value: assessmentValues.total_values || "",
// 				exemption: assessmentValues.exemption || "",
// 				total_taxable_value: assessmentValues.net_taxable_value || "",
// 				taxing_authority: config.taxing_authority,
// 				notes: "",
// 				delinquent: "NONE",
// 				tax_history: []
// 			};

// 			const latestYear = billSummary[0]?.tax_year || "";

// 			// Process each installment for latest year
// 			installmentDetails.forEach(inst => {
// 				const isPaid = inst.status.toUpperCase() === "PAID";
// 				const title = inst.title.toLowerCase();
				
// 				// Determine due and delinquent dates based on installment type
// 				let due_date = "";
// 				let delq_date = "";
				
// 				if (title.includes("first") || title.includes("1st")) {
// 					due_date = `${COMMON_SELECTORS.first_due_date}/${latestYear}`;
// 					delq_date = `${COMMON_SELECTORS.first_delq_date}/${latestYear}`;
// 				} else if (title.includes("second") || title.includes("2nd")) {
// 					const nextYear = parseInt(latestYear) + 1;
// 					due_date = `${COMMON_SELECTORS.second_due_date}/${nextYear}`;
// 					delq_date = `${COMMON_SELECTORS.second_delq_date}/${nextYear}`;
// 				}

// 				// Determine status
// 				let status = isPaid ? "Paid" : "Due";
// 				if (!isPaid && is_delq(delq_date)) {
// 					status = "Delinquent";
// 				}

// 				// Add to tax history
// 				main_data.tax_history.push({
// 					jurisdiction: "County",
// 					year: latestYear,
// 					payment_type: inst.title,
// 					status: status,
// 					base_amount: inst.tax_amount || (isPaid ? inst.amount_paid : inst.amount_due) || "",
// 					amount_paid: isPaid ? inst.amount_paid : "$0.00",
// 					amount_due: inst.amount_due || "$0.00",
// 					mailing_date: "N/A",
// 					due_date: due_date,
// 					delq_date: delq_date,
// 					paid_date: inst.date_paid || "-",
// 					good_through_date: "-",
// 					penalty_if_delinquent: inst.penalty || ""
// 				});
// 			});

// 			// Check prior years
// 			const allPriorPaid = billSummary.length <= 1 || 
// 				billSummary.slice(1).every(b => b.status.toUpperCase().includes("PAID"));

// 			// Build notes
// 			if (allPriorPaid) {
// 				main_data.notes += "ALL PRIOR YEARS TAXES ARE PAID. ";
// 			} else {
// 				const unpaidPrior = billSummary.slice(1)
// 					.filter(b => !b.status.toUpperCase().includes("PAID")).length;
// 				main_data.notes += `${unpaidPrior} PRIOR YEARS TAXES ARE DELINQUENT. `;
// 			}

// 			main_data.notes += `${latestYear}: `;
// 			main_data.tax_history.forEach((h, idx) => {
// 				if (idx > 0) main_data.notes += ", ";
// 				main_data.notes += `${h.payment_type.toUpperCase()} IS ${h.status.toUpperCase()}`;
// 			});
// 			main_data.notes += ". NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 11/01 AND 02/01.";

// 			// Set delinquent status
// 			const hasUnpaidPrior = !allPriorPaid;
// 			const hasDelqCurrent = main_data.tax_history.some(h => h.status === "Delinquent");
			
// 			if (hasUnpaidPrior || hasDelqCurrent) {
// 				main_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
// 			}

// 			resolve(main_data);
// 		}
// 		catch(error){
// 			console.log(error);
// 			reject(new Error(error.message));
// 		}
// 	});
// }

// // Main Orchestrator — Runs step1 → step2 → step3 → step4 in order
// const account_search = (page, account, county) => {
// 	return new Promise((resolve, reject) => {

// 		// Step 1: Navigate and handle CAPTCHA
// 		orange_step1(page, account, county)
// 			.then(() => {

// 				// Step 2: Get property info and bill list
// 				orange_step2(page, account, county)
// 					.then((step2Data) => {

// 						// Step 3: Click View and get installment details
// 						orange_step3(page, step2Data, county)
// 							.then((step3Data) => {

// 								// Step 4: Process complete tax report
// 								orange_step4(page, step2Data, step3Data, account, county)
// 									.then((finalData) => {
// 										resolve(finalData);
// 									})
// 									.catch((error) => {
// 										console.log(error.message);
// 										reject(error);
// 									});

// 							})
// 							.catch((error) => {
// 								console.log(error.message);
// 								reject(error);
// 							});

// 					})
// 					.catch((error) => {
// 						console.log(error.message);
// 						reject(error);
// 					});

// 			})
// 			.catch((error) => {
// 				console.log(error.message);
// 				reject(error);
// 			});

// 	});
// };

// // Express Route — Handles both HTML view and API JSON responses
// const search = async (req, res) => {
// 	const { fetch_type, account } = req.body;
// 	const county = "orange"; // Orange County, CA

// 	try{
// 		// Validate missing account number
// 		if (!account || account.trim() === '') {
// 			return res.status(200).render("error_data", {
// 				error: true,
// 				message: "Enter the Account Number..."
// 			});
// 		}

// 		if(!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
// 			return res.status(200).render('error_data', {
// 				error: true,
// 				message: "Invalid Access"
// 			});
// 		}

// 		const browser = await getBrowserInstance();
// 		const context = await browser.createBrowserContext();
// 		const page = await context.newPage();

// 		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

// 		page.setDefaultNavigationTimeout(90000);
// 		await page.setRequestInterception(true);
// 		page.on('request', (req) => {
// 			if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
// 				req.abort();
// 			} else {
// 				req.continue();
// 			}
// 		});

// 		// HTML response mode
// 		if(fetch_type == "html"){
// 			account_search(page, account, county)
// 			.then((data) => {
// 				res.status(200).render("parcel_data_official", data);
// 			})
// 			.catch((error) => {
// 				console.log(error)
// 				res.status(200).render('error_data', {
// 					error: true,
// 					message: error.message
// 				});
// 			})
// 			.finally(async () => {
// 				await context.close();
// 			})
// 		}

// 		// API JSON response mode
// 		else if(fetch_type == "api"){
// 			account_search(page, account, county)
// 			.then((data) => {
// 				res.status(200).json({
// 					result: data
// 				})
// 			})
// 			.catch((error) => {
// 				console.log(error)
// 				res.status(500).json({
// 					error: true,
// 					message: error.message
// 				})
// 			})
// 			.finally(async () => {
// 				await context.close();
// 			})
// 		}

// 	}
// 	catch(error){
// 		console.log(error);

// 		// HTML error
// 		if(fetch_type == "html"){
// 			res.status(200).render('error_data', {
// 				error: true,
// 				message: error.message
// 			});
// 		}
// 		// API error
// 		else if(fetch_type == "api"){
// 			res.status(500).json({
// 				error: true,
// 				message: error.message
// 			});
// 		}
// 	}
// }

// module.exports = {
// 	search
// }
