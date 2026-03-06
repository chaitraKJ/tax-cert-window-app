//Author: Dhanush
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
  timeout: 90000
};

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

const formatDollar = (value) => {
  if (!value || value === "") return "$0.00";
  const num = parseFloat(value.toString().replace(/[$ ,]/g, ""));
  return Number.isFinite(num)
    ? `$${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "$0.00";
};

const calculateTaxStatus = (taxHistory, now = new Date()) => {
  return taxHistory.map((item) => {
    if (item.status === "Paid") return { ...item, delinquent: "NONE" };

    const [mmD, ddD, yyyyD] = item.due_date.split("/").map(Number);
    const [mmQ, ddQ, yyyyQ] = item.delq_date.split("/").map(Number);

    const dueDate = new Date(yyyyD, mmD - 1, ddD);
    const delqDate = new Date(yyyyQ, mmQ - 1, ddQ);

    if (now < dueDate) {
      return { ...item, status: "Due", delinquent: "NONE" };
    } else if (now >= dueDate && now < delqDate) {
      return { ...item, status: "Unpaid", delinquent: "NONE" };
    } else {
      return { ...item, status: "Delinquent", delinquent: "YES" };
    }
  });
};

const generateNotes = (taxHistory) => {
  if (!taxHistory?.length) return "NO TAX PAYMENT HISTORY AVAILABLE.";

  const currentYear = new Date().getFullYear().toString();
  const latest = taxHistory[0];

  const cur = taxHistory.find((t) => t.year === currentYear) || latest;
  let curNote = "";
  
  if (cur.status === "Delinquent") {
    curNote = `${cur.year} ANNUAL TAXES ARE DELINQUENT`;
  } else if (cur.status === "Unpaid") {
    curNote = `${cur.year} ANNUAL TAXES ARE UNPAID`;
  } else if (cur.status === "Due") {
    curNote = `${cur.year} ANNUAL TAXES ARE DUE`;
  } else {
    if (cur.paid_date && cur.paid_date !== "-") {
      curNote = `${cur.year} TAXES ARE PAID IN FULL`;
    } else {
      curNote = `${cur.year} TAXES ARE PAID IN FULL`;
    }
  }

  const prior = taxHistory.filter((t) => t.year !== currentYear);
  const priorDelinquent = prior.some((t) => t.status === "Delinquent");
  const priorUnpaid = prior.some((t) => t.status === "Unpaid");
  let priorNote = "";
  
  if (priorDelinquent) {
    priorNote = "PRIOR YEAR(S) TAXES ARE DELINQUENT";
  } else if (priorUnpaid) {
    priorNote = "PRIOR YEAR(S) TAXES ARE DELINQUENT";
  } else {
    priorNote = "PRIOR YEAR(S) TAXES ARE PAID";
  }

  const hasInstallments = taxHistory.some((t) => t.payment_type === "Installment");
  const suffix = `, NORMALLY TAXES ARE PAID ANNUALLY${
    hasInstallments ? ", SOME INSTALLMENT PAYMENTS DETECTED" : ""
  }, NORMAL DUE DATE IS 11/30.`;

  return `${priorNote}, ${curNote}${suffix}`;
};

// STEP 1: NAVIGATE TO PROPERTY PAGE + VALIDATE PARCEL
const ac_1 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const cleanAccount = account.trim().toUpperCase();
      if (!cleanAccount) {
        return reject(new Error("Enter the parcel number"));
      }

      const url = `https://www.utahcounty.gov/LandRecords/SerialVersions.asp?av_serial=${encodeURIComponent(cleanAccount)}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Check for "No records found" message
      const noRecords = await page.evaluate(() => {
        return document.body.textContent.includes("No records found") ||
               document.body.textContent.includes("Invalid serial number");
      });

      if (noRecords) {
        return reject(new Error("Invalid Parcel Number or No Records Found"));
      }

      const serialLink = await page.evaluate((expectedSerial) => {
        const rows = document.querySelectorAll("table tbody tr");
        if (rows.length <= 1) return null; // only header

        for (let i = 1; i < rows.length; i++) {
          const firstCell = rows[i].querySelector('td:first-child');
          const link = firstCell?.querySelector('a');
          const serialText = firstCell?.textContent?.trim();

          // Match serial in the row text
          if (serialText && serialText.includes(expectedSerial) && link?.href) {
            return link.href;
          }
        }
        return null;
      }, cleanAccount);

      if (!serialLink) {
        return reject(new Error("Parcel not found in search results"));
      }

      await page.goto(serialLink, { waitUntil: "domcontentloaded", timeout: 60000 });

      resolve(true);

    }catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
  });
};

// STEP 2: EXTRACT BASIC PROPERTY INFO
const ac_2 = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Inside ac_2 page.evaluate
      const page_data = await page.evaluate((parcel) => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const datum = {
          processed_date: new Date().toISOString().slice(0, 10),
          order_number: "",
          borrower_name: "",
          owner_name: [""],
          property_address: "",
          parcel_number: parcel,
          land_value: "-",
          improvements: "-",
          total_assessed_value: "",
          exemption: "-",
          total_taxable_value: "",
          taxing_authority: "Utah County Treasurer, 100 E Center St, Provo, UT 84606, Ph: 801-851-8244",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        // Serial / Parcel
        for (const s of document.querySelectorAll("td strong")) {
          if (s.textContent.includes("Serial Number")) {
            const m = s.parentElement.textContent.match(/Serial Number:\s*(\S+)/);
            if (m) datum.parcel_number = clean(m[1]);
            break;
          }
        }

        // Property address
        for (const s of document.querySelectorAll("td strong")) {
          if (s.textContent.includes("Property Address")) {
            const m = s.parentElement.textContent.match(
              /Property Address:\s*(.+?)(?:more see|$)/i
            );
            if (m) datum.property_address = clean(m[1]);
            break;
          }
        }

        // Owner(s)
        const owners = [];
        for (const tbl of document.querySelectorAll('table[border="0"]')) {
          for (const row of tbl.querySelectorAll("tr")) {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 3 && clean(cells[0].textContent).includes("...")) {
              const a = cells[2].querySelector("a");
              if (a) {
                const name = clean(a.textContent);
                if (name && !owners.includes(name)) owners.push(name);
              }
            }
          }
          if (owners.length) break;
        }
        if (owners.length) datum.owner_name = owners;

        return datum;
      }, account);

      resolve({
        data: page_data,
        propertyPageUrl: page.url()
      });

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// STEP 3: EXTRACT RESIDENTIAL TAXABLE VALUE
const ac_3 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const year = new Date().getFullYear();
      const url = `https://www.utahcounty.gov/LandRecords/PropertyValues.asp?av_serial=${account}&av_year=${year}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      const residentialValue = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        for (const tbl of document.querySelectorAll('table[cellspacing="1"]')) {
          const rows = tbl.querySelectorAll("tr");
          for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll("td");
            if (cells.length >= 4 && clean(cells[1].textContent) === "Residential") {
              let underRealEstate = false;
              for (let j = i - 1; j >= 0; j--) {
                const txt = rows[j].textContent;
                if (txt.includes("* * Real Estate")) { underRealEstate = true; break; }
                if (txt.includes("* * Improvements")) break;
              }
              if (underRealEstate) return clean(cells[3].textContent);
            }
          }
        }
        return "";
      });

      main_data.data.total_assessed_value = residentialValue;
      main_data.data.total_taxable_value = residentialValue;

      resolve(main_data);

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// STEP 4: EXTRACT TAX HISTORY
const ac_4 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Navigate back to property page
      await page.goto(main_data.propertyPageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Click Tax History tab
      await page.evaluate(() => {
        for (const tab of document.querySelectorAll(".TabbedPanelsTab")) {
          if (tab.textContent.includes("Tax History")) { tab.click(); break; }
        }
      });

      const taxHistory = await page.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
        const fmt = (v) => {
          const n = parseFloat(v.replace(/[$ ,]/g, ""));
          return Number.isFinite(n)
            ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "$0.00";
        };

        const rows =
          document.querySelectorAll(".TabbedPanelsContentVisible table tbody tr") ||
          document.querySelectorAll(".TabbedPanelsContent table tbody tr") ||
          document.querySelectorAll('div[style*="block"] table tbody tr');

        const history = [];
        for (const r of rows) {
          const c = r.querySelectorAll("td");
          if (c.length < 8) continue;
          const a = c[0].querySelector("a");
          if (!a) continue;

          const year = clean(c[0].textContent);
          const yearNum = parseInt(year);
          const net = clean(c[3].textContent).replace(/[()]/g, "");
          const bal = clean(c[6].textContent).replace(/[()]/g, "");

          const baseAmount = fmt(net);
          const amountDue = fmt(bal);
          
          if (baseAmount === "$0.00" && amountDue === "$0.00") continue;

          const balNum = parseFloat(bal.replace(/[$ ,]/g, ""));
          const isPaid = balNum <= 0;

          const detailUrl = a.href;

          history.push({
            jurisdiction: "County",
            year,
            yearNum,
            payment_type: "Annual",
            status: isPaid ? "Paid" : "Unpaid",
            base_amount: baseAmount,
            amount_paid: isPaid ? baseAmount : "$0.00",
            amount_due: isPaid ? "$0.00" : amountDue,
            mailing_date: "N/A",
            due_date: `11/30/${yearNum}`,
            delq_date: `12/01/${yearNum}`,
            paid_date: isPaid ? "Paid" : "-",
            good_through_date: "",
            tax_detail_url: detailUrl
          });
        }

        history.sort((a, b) => b.yearNum - a.yearNum);

        const filtered = [];
        for (let i = 0; i < history.length; i++) {
          if (i === 0 || history[i].status !== "Paid") filtered.push(history[i]);
        }
        
        filtered.forEach((e) => delete e.yearNum);
        
        return filtered;
      });

      resolve({
        data: main_data.data,
        tax_history: taxHistory
      });

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// STEP 5: ENRICH TAX HISTORY WITH PAYMENT DETAILS
const ac_5 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const taxHistory = main_data.tax_history;

      for (const entry of taxHistory) {
        if (!entry.tax_detail_url) continue;

        try {
          await page.goto(entry.tax_detail_url, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });

          const info = await page.evaluate(() => {
            const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
            const fmt = (v) => {
              const n = parseFloat(v.replace(/[$ ,]/g, ""));
              return Number.isFinite(n)
                ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "$0.00";
            };

            const payments = [];
            let totalPaid = 0;
            let balance = "$0.00";
            let netTaxes = "$0.00";

            const netTaxMatch = document.body.textContent.match(/Net Taxes:\s*\$?([\d,]+\.?\d*)/i);
            if (netTaxMatch) {
              netTaxes = fmt(netTaxMatch[1]);
            }

            const paymentRows = document.querySelectorAll("table table tbody tr");
            for (const row of paymentRows) {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 4) {
                const dateStr = clean(cells[0].textContent);
                const timeStr = clean(cells[1].textContent);
                const amtStr = clean(cells[2].textContent);
                const method = clean(cells[3].textContent);

                if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  const amount = parseFloat(amtStr.replace(/[$ ,]/g, ""));
                  if (amount > 0) {
                    payments.push({
                      date: dateStr,
                      time: timeStr,
                      amount: fmt(amtStr),
                      method: method
                    });
                    totalPaid += amount;
                  }
                }
              }
            }

            const balMatch = document.body.textContent.match(/Tax Balance:\s*\$?([\d,]+\.?\d*)/i);
            if (balMatch) {
              balance = fmt(balMatch[1]);
            }

            const isInstallment = payments.length > 1;

            let paidDate = "-";
            let latestPaymentDate = null;
            
            if (payments.length > 0) {
              payments.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
              });
              
              latestPaymentDate = payments[0].date;
              paidDate = latestPaymentDate;
            }

            return {
              paidDate,
              isInstallment,
              totalPaid: fmt(totalPaid.toString()),
              balance,
              netTaxes,
              payments,
              hasPayments: payments.length > 0
            };
          });

          entry.payment_type = info.isInstallment ? "Installment" : "Annual";
          // entry.payment_details = info.payments; //to display the payemnt data  

          if (info.netTaxes && info.netTaxes !== "$0.00") {
            entry.base_amount = info.netTaxes;
          }

          const baseAmountNum = parseFloat(entry.base_amount.replace(/[$ ,]/g, ""));
          const totalPaidNum = parseFloat(info.totalPaid.replace(/[$ ,]/g, ""));
          const calculatedBalance = baseAmountNum - totalPaidNum;
          const isPaidInFull = calculatedBalance <= 0.01;
          
          if (info.hasPayments) {
            entry.paid_date = info.paidDate;
            entry.amount_paid = info.totalPaid;
            
            if (isPaidInFull) {
              entry.status = "Paid";
              entry.amount_due = "$0.00";
            } else {
              entry.status = "Unpaid";
              const remainingBalance = Math.max(0, calculatedBalance);
              entry.amount_due = `$${remainingBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
            }
          } else {
            entry.paid_date = "-";
            entry.amount_paid = "$0.00";
            entry.amount_due = entry.base_amount;
          }

        } catch (e) {
          console.log(`Detail page failed for ${entry.year}: ${e.message}`);
        }
      }

      resolve({
        data: main_data.data,
        tax_history: taxHistory
      });

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// STEP 6: CALCULATE STATUS AND GENERATE NOTES
const ac_6 = async (page, main_data, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      const finalHistory = calculateTaxStatus(main_data.tax_history);
      main_data.data.tax_history = finalHistory;

      main_data.data.delinquent = finalHistory.some((t) => t.delinquent === "YES") 
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" 
        : "NONE";

      main_data.data.notes = generateNotes(finalHistory);

      resolve(main_data.data);

    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

// MAIN ACCOUNT SEARCH FUNCTION
const account_search = async (page, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, account)
        .then((data) => {
          ac_2(page, account)
            .then((data1) => {
              ac_3(page, data1, account)
                .then((data2) => {
                  ac_4(page, data2, account)
                    .then((data3) => {
                      ac_5(page, data3, account)
                        .then((data4) => {
                          ac_6(page, data4, account)
                            .then((data5) => {
                              resolve(data5);
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
            });
        })
        .catch((error) => {
          console.log(error);
          reject(error);
        });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};


const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		// await page.setViewport({ width: 1366, height: 768});
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

module.exports = { search };