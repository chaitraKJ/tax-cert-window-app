//AUTHOR: DHANUSH
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
	timeout: 90000
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if delinquent
const is_delq = (date) => {
	const today = new Date();
	const delq_date = new Date(date);
	return today >= delq_date;
};

// Helper function to parse currency
const parseCurrency = (str) => {
	if (!str) return 0;
	const cleaned = str.replace(/[$,()]/g, '').replace(/-/g, '');
	const value = parseFloat(cleaned) || 0;
	return str.includes('(') ? -value : value;
};

// Helper function to format currency with commas
const formatCurrency = (num) => {
	const absNum = Math.abs(num);
	return `$${absNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function to get due date
const getDueDate = (year, half) => {
	return half === 'First Half' ? `03/31/${year}` : `09/15/${year}`;
};

// Helper function to get delinquency date
const getDelqDate = (year, half) => {
	return half === 'First Half' ? `04/01/${year}` : `09/16/${year}`;
};

// Helper function to format date from DD-MMM-YYYY to MM/DD/YYYY
const formatDate = (dateStr) => {
	if (!dateStr || dateStr === 'N/A') return '';
	
	try {
		const parts = dateStr.split('-');
		if (parts.length === 3) {
			const day = parts[0].padStart(2, '0');
			const monthMap = {
				'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
				'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
				'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
			};
			const month = monthMap[parts[1]];
			const year = parts[2];
			return `${month}/${day}/${year}`;
		}
	} catch (e) {
		// Silent error handling
	}
	return dateStr;
};

// STEP 1: NAVIGATE TO SEARCH PAGE AND PERFORM SEARCH
const dc_1 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const url = `https://mytax.dc.gov/_/`;
			await page.goto(url, { waitUntil: "domcontentloaded" });
			await delay(2000);

			const cookieBanner = await page.$('button[data-testid="accept-cookies"], #cookie-accept, .cookie-accept');
			if (cookieBanner) {
				await cookieBanner.click();
				await delay(2000);
			}
			
			await page.waitForSelector('#Df-3-9 a', { timeout: 20000 });
			await page.click('#Df-3-9 a');
			await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });

			await page.waitForSelector("#Dc-b", { timeout: 15000 });
			
			const accountParts = account.match(/(\d+)\s*-\s*(\w*)\s*-\s*(\d+)/);
			if (!accountParts) {
				return reject({ error: true, message: "Invalid account format. Expected format: 1100- -0077" });
			}

			const square = accountParts[1];
			const suffix = accountParts[2] || "";
			const lot = accountParts[3];

			await page.waitForSelector('#Dc-b', timeout_option);
			await page.type('#Dc-b', square);

			await page.waitForSelector('#Dc-c', timeout_option);
			await page.type('#Dc-c', suffix);

			await page.waitForSelector('#Dc-d', timeout_option);
			await page.type('#Dc-d', lot);
			await delay(2000);

			await page.waitForSelector('button[data-linkid="Dc-s"]', timeout_option);
			await Promise.all([
				page.click('button[data-linkid="Dc-s"]'),
				page.waitForNavigation({ waitUntil: "domcontentloaded" })
			]);

			const resultsText = await page.$eval('#caption2_Dc-t', el => el.textContent);
			if (resultsText.includes('0 results')) {
				reject(new Error("No Record Found"));
			}

			await page.waitForSelector('a[data-linkid^="Dc-v-1"]', timeout_option);
			await page.click('a[data-linkid^="Dc-v-1"]');
			await Promise.all([
				page.click('a[data-linkid^="Dc-v-1"]'),
				page.waitForNavigation({ waitUntil: "domcontentloaded" })
			]);

			resolve(true);
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 2: EXTRACT BASIC PROPERTY DETAILS
const dc_2 = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('#fgvt_Dc-n', timeout_option);

			const page_data = await page.evaluate(() => {
				const datum = {
					processed_date: "",
					order_number: "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "DC Office of Tax and Revenue, 1101 4th Street SW, Suite 270 West, Washington, DC 20024, Ph: 202-727-4829",
					notes: "",
					delinquent: "NONE",
					balance_due: "",
					tax_history: []
				};

				datum['parcel_number'] = document.getElementById('fgvt_Dc-n')?.textContent?.trim() || "N/A";
				datum['property_address'] = document.getElementById('fgvt_Dc-o')?.textContent?.trim() || "N/A";
				datum['balance_due'] = document.getElementById('fgvt_Dc-p')?.textContent?.trim() || "$0.00";

				const ownerCell = document.getElementById('Dc-d1-1');
				if (ownerCell) {
					datum['owner_name'][0] = ownerCell.textContent?.trim() || "N/A";
				}

				return datum;
			});

			resolve(page_data);
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 3: NAVIGATE TO ASSESSMENT TAB AND EXTRACT VALUES
const dc_3 = async (page, data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('a[data-linkid="Dc-d"]', timeout_option);
			await page.click('a[data-linkid="Dc-d"]');
			await delay(2000);

			const assessment_data = await page.evaluate(() => {
				const assessments = [];
				const rows = document.querySelectorAll('#Dc-42 tbody tr[data-row]');

				rows.forEach(row => {
					const cells = row.querySelectorAll('td');
					if (cells.length >= 7) {
						assessments.push({
							half: cells[0]?.textContent?.trim() || "",
							tax_class: cells[1]?.textContent?.trim() || "",
							land_value: cells[2]?.textContent?.trim() || "",
							building_value: cells[3]?.textContent?.trim() || "",
							assessment_value: cells[4]?.textContent?.trim() || "",
							total_taxable: cells[5]?.textContent?.trim() || "",
							tax_relief: cells[6]?.textContent?.trim() || ""
						});
					}
				});

				const recentAssessment = assessments[0] || {};
				
				return {
					assessments: assessments,
					land_value: recentAssessment.land_value || "N/A",
					building_value: recentAssessment.building_value || "N/A",
					total_assessed_value: recentAssessment.assessment_value || "N/A",
					total_taxable_value: recentAssessment.total_taxable || "N/A"
				};
			});

			data['land_value'] = assessment_data.land_value;
			data['improvements'] = assessment_data.building_value;
			data['total_assessed_value'] = assessment_data.total_assessed_value;
			data['total_taxable_value'] = assessment_data.total_taxable_value;

			resolve({
				data: data,
				assessments: assessment_data.assessments
			});
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 4: NAVIGATE TO TAX INFORMATION TAB AND EXTRACT TAX SUMMARY
const dc_4 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('a[data-linkid="Dc-e"]', timeout_option);
			await page.click('a[data-linkid="Dc-e"]');
			await delay(2000);

			const tax_summary = await page.evaluate(() => {
				const summaries = {};
				let currentYear = "";
				
				const tableBody = document.querySelector('#Dc-g2 tbody');
				if (!tableBody) return summaries;
				
				const allRows = Array.from(tableBody.children);
				
				allRows.forEach(row => {
					if (row.classList.contains('OutlineHeader')) {
						currentYear = row.querySelector('.OutlineValue')?.textContent?.trim() || "";
						const yearMatch = currentYear.match(/^\d{4}/);
						if (yearMatch) {
							currentYear = yearMatch[0];
						}
					} else if (row.hasAttribute('data-row') && currentYear) {
						const cells = row.querySelectorAll('td');
						if (cells.length >= 3) {
							if (!summaries[currentYear]) {
								summaries[currentYear] = [];
							}
							
							summaries[currentYear].push({
								half: cells[0]?.textContent?.trim() || "",
								tax_type: cells[1]?.textContent?.trim() || "",
								balance: cells[2]?.textContent?.trim() || "$0.00"
							});
						}
					}
				});

				return summaries;
			});
			
			resolve({
				data: main_data.data,
				assessments: main_data.assessments,
				tax_summary: tax_summary
			});
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 5: NAVIGATE TO TAX HISTORY TAB
const dc_5 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('a[data-linkid="Dc-4"]', timeout_option);
			await page.click('a[data-linkid="Dc-4"]');
			await delay(3000);

			const tax_history_data = await page.evaluate(() => {
				const history = {};
				let currentYear = "";
				
				const allTables = document.querySelectorAll('table.DocTable');
				
				let targetTable = null;
				allTables.forEach(table => {
					const titleElement = document.querySelector(`#${table.id}_title`);
					if (titleElement && titleElement.textContent.includes('Past Years')) {
						targetTable = table;
					}
				});
				
				if (!targetTable) {
					allTables.forEach(table => {
						const hasOutline = table.querySelector('.OutlineHeader');
						const hasDataRows = table.querySelector('tr[data-row]');
						if (hasOutline && hasDataRows) {
							targetTable = table;
						}
					});
				}
				
				if (!targetTable) return history;
				
				const tbodies = targetTable.querySelectorAll('tbody.DocTableBody');
				
				tbodies.forEach((tbody) => {
					const allRows = Array.from(tbody.querySelectorAll('tr'));
					
					allRows.forEach((row) => {
						if (row.classList.contains('OutlineHeader')) {
							const yearCell = row.querySelector('.OutlineValue');
							if (yearCell) {
								currentYear = yearCell.textContent?.trim() || "";
							}
						} 
						else if (row.hasAttribute('data-row') && currentYear) {
							const cells = row.querySelectorAll('td');
							
							if (cells.length >= 3) {
								if (!history[currentYear]) {
									history[currentYear] = [];
								}
								
								history[currentYear].push({
									description: cells[0]?.textContent?.trim() || "",
									amount: cells[1]?.textContent?.trim() || "",
									balance: cells[2]?.textContent?.trim() || ""
								});
							}
						}
					});
				});

				return history;
			});
			
			resolve({
				data: main_data.data,
				assessments: main_data.assessments,
				tax_summary: main_data.tax_summary,
				tax_history: tax_history_data
			});
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 6: NAVIGATE TO PAYMENT HISTORY TAB
const dc_6 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			await page.waitForSelector('a[data-linkid="Dc-7"]', timeout_option);
			await page.click('a[data-linkid="Dc-7"]');
			await delay(3000);

			const payment_history = await page.evaluate(() => {
				const payments = [];
				
				const allTables = document.querySelectorAll('table.DocTable');
				
				let targetTable = null;
				allTables.forEach(table => {
					const titleElement = document.querySelector(`#${table.id}_title`);
					if (titleElement && titleElement.textContent.includes('Payments')) {
						targetTable = table;
					}
				});
				
				if (!targetTable) {
					allTables.forEach(table => {
						const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
						if (headers.some(h => h.includes('Deposit Date')) && headers.some(h => h.includes('Payment Amount'))) {
							targetTable = table;
						}
					});
				}
				
				if (!targetTable) return payments;
				
				const tbody = targetTable.querySelector('tbody');
				if (!tbody) return payments;
				
				const rows = tbody.querySelectorAll('tr[data-row]');

				rows.forEach((row) => {
					const cells = row.querySelectorAll('td');
					
					if (cells.length >= 4) {
						payments.push({
							deposit_date: cells[0]?.textContent?.trim() || "",
							payment_type: cells[1]?.textContent?.trim() || "",
							status: cells[2]?.textContent?.trim() || "",
							amount: cells[3]?.textContent?.trim() || ""
						});
					}
				});

				return payments;
			});
			
			resolve({
				data: main_data.data,
				assessments: main_data.assessments,
				tax_summary: main_data.tax_summary,
				tax_history: main_data.tax_history,
				payment_history: payment_history
			});
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 7: FORMAT AND STRUCTURE FINAL DATA
const dc_7 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const final_data = main_data.data;
			const tax_summary = main_data.tax_summary;
			const tax_history = main_data.tax_history;
			const payment_history = main_data.payment_history;

			if (!tax_history || Object.keys(tax_history).length === 0) {
				final_data.notes = "NO TAX HISTORY AVAILABLE";
				return resolve(final_data);
			}

			// Get all years from tax_history and sort (most recent first)
			const years = Object.keys(tax_history).sort((a, b) => parseInt(b) - parseInt(a));
			const max_year = years[0];

			// Group payments by year
			const paymentsByYear = {};
			payment_history.forEach(payment => {
				const dateStr = payment.deposit_date;
				const parts = dateStr.split('-');
				if (parts.length === 3) {
					const year = parts[2];
					if (!paymentsByYear[year]) {
						paymentsByYear[year] = [];
					}
					paymentsByYear[year].push({
						...payment,
						amount_value: parseCurrency(payment.amount),
						date_obj: new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`)
					});
				}
			});

			// Sort payments within each year by date
			Object.keys(paymentsByYear).forEach(year => {
				paymentsByYear[year].sort((a, b) => a.date_obj - b.date_obj);
			});

			// Build status_data object
			const status_data = {};
			
			for (const year of years) {
				const summaryItems = tax_summary[year] || [];
				const historyItems = tax_history[year] || [];
				
				// Find the base tax amount from history
				const taxItem = historyItems.find(h => 
					h.description.toLowerCase().includes('real property tax') && 
					!h.description.toLowerCase().includes('payment') &&
					!h.description.toLowerCase().includes('interest') &&
					!h.description.toLowerCase().includes('penalty') &&
					!h.description.toLowerCase().includes('fee')
				);

				if (!taxItem) continue;

				const totalYearTax = parseCurrency(taxItem.amount || "$0.00");
				const totalYearBalance = parseCurrency(taxItem.balance || "$0.00");
				const halfAmount = totalYearTax / 2;

				let firstHalfBalance, secondHalfBalance;
				
				if (summaryItems.length > 0) {
					const firstHalfItem = summaryItems.find(s => s.half === 'First Half' && s.tax_type.includes('Real Property Tax'));
					const secondHalfItem = summaryItems.find(s => s.half === 'Second Half' && s.tax_type.includes('Real Property Tax'));
					firstHalfBalance = parseCurrency(firstHalfItem?.balance || "$0.00");
					secondHalfBalance = parseCurrency(secondHalfItem?.balance || "$0.00");
				} else {
					firstHalfBalance = totalYearBalance / 2;
					secondHalfBalance = totalYearBalance / 2;
				}

				// Determine overall status for year
				let yearStatus = "Unpaid";
				if (firstHalfBalance < 0.10 && secondHalfBalance < 0.10) {
					yearStatus = "Paid";
				}

				status_data[year] = {
					status: yearStatus,
					base_amount: formatCurrency(totalYearTax),
					history: []
				};

				// Get payment dates
				const yearPayments = paymentsByYear[year] || [];
				
				let firstHalfDate = "";
				let secondHalfDate = "";

				if (yearPayments.length > 0) {
					if (firstHalfBalance < 0.10) {
						firstHalfDate = formatDate(yearPayments[0].deposit_date);
					}
					
					if (secondHalfBalance < 0.10) {
						if (yearPayments.length === 1 && yearPayments[0].amount_value >= totalYearTax * 0.95) {
							secondHalfDate = formatDate(yearPayments[0].deposit_date);
						} else if (yearPayments.length > 1) {
							secondHalfDate = formatDate(yearPayments[1].deposit_date);
						}
					}
				}

				// Calculate amounts paid
				const firstHalfPaid = Math.max(0, halfAmount - firstHalfBalance);
				const secondHalfPaid = Math.max(0, halfAmount - secondHalfBalance);

				// First Half Record
				const firstHalfStatus = firstHalfBalance < 0.10 ? "Paid" : "Due";
				const firstHalfActualBalance = firstHalfBalance < 0.10 ? 0 : firstHalfBalance;
				
				const firstHalfRecord = {
					jurisdiction: "County",
					year: year,
					payment_type: "Semi-Annual",
					status: firstHalfStatus,
					base_amount: formatCurrency(halfAmount),
					amount_paid: formatCurrency(firstHalfPaid),
					amount_due: formatCurrency(firstHalfActualBalance),
					penalty: "$0.00",
					interest: "$0.00",
					mailing_date: "N/A",
					due_date: getDueDate(year, "First Half"),
					delq_date: getDelqDate(year, "First Half"),
					paid_date: firstHalfDate,
					good_through_date: ""
				};

				if (firstHalfStatus === "Due" && is_delq(firstHalfRecord.delq_date)) {
					firstHalfRecord.status = "Delinquent";
					final_data.delinquent = "TAXES ARE DELINQUENT";
				}

				status_data[year].history.push(firstHalfRecord);

				// Second Half Record
				const secondHalfStatus = secondHalfBalance < 0.10 ? "Paid" : "Due";
				const secondHalfActualBalance = secondHalfBalance < 0.10 ? 0 : secondHalfBalance;
				
				const secondHalfRecord = {
					jurisdiction: "County",
					year: year,
					payment_type: "Semi-Annual",
					status: secondHalfStatus,
					base_amount: formatCurrency(halfAmount),
					amount_paid: formatCurrency(secondHalfPaid),
					amount_due: formatCurrency(secondHalfActualBalance),
					penalty: "$0.00",
					interest: "$0.00",
					mailing_date: "N/A",
					due_date: getDueDate(year, "Second Half"),
					delq_date: getDelqDate(year, "Second Half"),
					paid_date: secondHalfDate,
					good_through_date: ""
				};

				if (secondHalfStatus === "Due" && is_delq(secondHalfRecord.delq_date)) {
					secondHalfRecord.status = "Delinquent";
					final_data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
				}

				status_data[year].history.push(secondHalfRecord);
			}

			resolve({
				data: final_data,
				status_data: status_data,
				max_year: max_year
			});
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// STEP 8: FINALIZE DATA - Return only latest year + delinquent years
const dc_8 = async (page, main_data, account) => {
	return new Promise(async (resolve, reject) => {
		try {
			const final_data = main_data.data;
			const status_data = main_data.status_data;
			const max_year = main_data.max_year;

			// Get all years sorted
			const allYears = Object.keys(status_data).sort((a, b) => parseInt(b) - parseInt(a));

			// Check delinquency status for prior years
			const priorYears = allYears.filter(year => parseInt(year) < parseInt(max_year));
			const delinquentYears = priorYears.filter(year => {
				return status_data[year].history.some(h => h.status === "Delinquent");
			});

			const hasUnpaidPriors = priorYears.some(year => {
				return status_data[year].history.some(h => h.status === "Delinquent" || h.status === "Due");
			});

			// Set notes
			const onlyLatestPaid = allYears.length === 1 && status_data[max_year].status === "Paid";
			
			if (onlyLatestPaid) {
				final_data.notes = "ALL PRIORS ARE PAID";
			} else {
				if (priorYears.length > 0 && !hasUnpaidPriors) {
					final_data.notes = "ALL PRIORS ARE PAID";
				} else if (hasUnpaidPriors) {
					final_data.notes = "PRIORS ARE DELINQUENT";
				} else {
					final_data.notes = "";
				}
			}

			// Add latest year status
			const latestRecords = status_data[max_year].history;
			if (latestRecords.length > 0) {
				const firstHalf = latestRecords[0];
				const secondHalf = latestRecords[1];
				
				const firstStatus = (firstHalf?.status || 'UNKNOWN').toUpperCase();
				const secondStatus = (secondHalf?.status || 'UNKNOWN').toUpperCase();

				if (final_data.notes) {
					final_data.notes += `, ${max_year} 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
				} else {
					final_data.notes = `${max_year} 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMALLY TAXES ARE PAID SEMI-ANNUALLY.`;
				}

				final_data.notes += ` NORMAL DUE DATES ARE 03/31 AND 09/15 FOR SEMI-ANNUAL`;
			}

			// Build final tax_history array - ONLY latest year + delinquent years
			const main_history_data = [];
			
			// Always include latest year
			const yearsToInclude = [max_year];
			
			// Add delinquent years
			delinquentYears.forEach(year => {
				if (!yearsToInclude.includes(year)) {
					yearsToInclude.push(year);
				}
			});
			
			// Sort years to include (most recent first)
			yearsToInclude.sort((a, b) => parseInt(b) - parseInt(a));
			const sortedYears = Array.from(yearsToInclude).sort((a, b) => parseInt(a) - parseInt(b));
			// Append history in ascending year order
			// Within each year: First Half comes first, then Second Half (already in that order from dc_7)
			for (const year of sortedYears) {
				const history = status_data[year]?.history || [];
				history.forEach(h => {
					main_history_data.push(h);
				});
			}

			final_data.tax_history = main_history_data;

			final_data.tax_history = main_history_data;
			
			resolve(final_data);
		} catch (error) {
			reject(new Error(error.message));
		}
	});
};

// MAIN SEARCH FUNCTION
const account_search = async (page, account) => {
    return new Promise((resolve, reject) => {
        try {
            dc_1(page, account)
            .then((data1) => {
                dc_2(page, account)
                .then((data2) => {
                   dc_3(page, data2,account)
                    .then((data3) => {
                        dc_4(page, data3, account)
                        .then((data4) => {
                            dc_5(page, data4, account)
                            .then((data5) => {
                                dc_6(page, data5, account)
                                .then((data6) => {
                                    dc_7(page, data6, account)
                                    .then((data7) => {
                                        dc_8(page, data7, account)
                                        .then((data8) => {
                                            resolve(data8);
                                        })
                                        .catch((error) => {
                                            console.log("Error in dc_8:", error);
                                            reject(error);
                                        });
                                    })
                                    .catch((error) => {
                                        console.log("Error in dc_7:", error);
                                        reject(error);
                                    });
                                })
                                .catch((error) => {
                                    console.log("Error in dc_6:", error);
                                    reject(error);
                                });
                            })
                            .catch((error) => {
                                console.log("Error in dc_5:", error);
                                reject(error);
                            });
                        })
                        .catch((error) => {
                            console.log("Error in dc_4:", error);
                            reject(error);
                        });
                    })
                    .catch((error) => {
                        console.log("Error in dc_3:", error);
                        reject(error);
                    });
                })
                .catch((error) => {
                    console.log("Error in dc_2:", error);
                    reject(error);
                });
            })
            .catch((error) => {
                console.log("Error in dc_1:", error);
                reject(error);
            });
        } catch (error) {
            console.log("Synchronous error:", error);
            reject(new Error(error.message));
        }
    });
};
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!account || account.trim() === '') {
			return res.status(200).render("error_data", {
				error: true,
				message: "Enter the Account Number..."
			});
		}

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
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

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account)
            .then((data) => {
                res.status(200).render("parcel_data_official", data);
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
            });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
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
            .finally(async () => {
                await context.close();
            });
        }

    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

module.exports = { search };