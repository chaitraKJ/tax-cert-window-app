//author -> harsh jha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

const counties = [
  {
    county: "adams",
    url: "https://adamswa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Adams County Treasurer, 210 W Broadway Suite 203, Ritzville, WA 99169",
  },
  {
    county: "douglas",
    url: "https://douglaswa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Douglas County Courthouse, 203 S Rainier Street, Waterville, WA 98858",
  },
  {
    county: "whitman",
    url: "http://terrascan.whitmancounty.net/Taxsifter/Search/Results.aspx",
    taxing_authority:
      "The Whitman County Treasurer, 400 N Main Street, Colfax, WA 99111",
  },
  {
    county: "ferry",
    url: "https://ferrywa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Ferry County Treasurer, 350 East Delaware Ave, Republic, WA 99166",
  },
  {
    county: "lincoln",
    url: "https://lincolnwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Lincoln County Treasurer, P.O. Box 370, Davenport, WA 99122",
  },
  {
    county: "skamania",
    url: "https://skamaniawa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Skamania County Courthouse, 240 NW Vancouver Ave, Stevenson, WA 98648",
  },
  {
    county: "mason",
    url: "https://property.masoncountywa.gov/TaxSifter/Search/Results.aspx",
    taxing_authority: "Mason County Treasurer, 411 N 5th St, Shelton, WA 98584",
  },
  {
    county: "pacific",
    url: "https://pacificwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Pacific County Treasurer, P.O. Box 98, South Bend, WA 98586",
  },
  {
    county: "grays-harbor",
    url: "https://graysharborwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Grays Harbor County Treasurer, 100 W Broadway Suite 2, Montesano, WA 98563",
  },
  {
    county: "Kittitas",
    url: "https://taxsifter.co.kittitas.wa.us/Search/Results.aspx",
    taxing_authority:
      "Kittitas County Assessor ,205 W 5th AVE Suite 101 Ellensburg WA 98926",
  },
  {
    county: "Franklin",
    url: "http://terra.co.franklin.wa.us/TaxSifter/Search/Results.aspx",
    taxing_authority:
      "Franklin County Courthouse,1016 N 4th Avenue,Pasco, WA 99301",
  },
  {
    county: "Okanogan",
    url: "https://okanoganwa-taxsifter.publicaccessnow.com/Search/Results.aspx",
    taxing_authority:
      "Okanogan County, WA 149 N 3rd Avenue, Okanogan, WA 98840",
  },
];

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Go to site
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });

      // --- I AGREE PAGE ---
      await page.waitForSelector("#cphContent_btnAgree", timeout_option);
      await Promise.all([
        page.locator("input[name='ctl00$cphContent$btnAgree']").click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);
      //fill input and wait for url list
      await page.waitForSelector("input#q", timeout_option);
      await page.locator("input#q").fill(account);
      await page.locator("#countyName");
      await Promise.all([
        page.keyboard.press("Enter"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);
      page
        .waitForSelector("#cphContent_Repeater1_pnlResult_0 a", timeout_option)
        .then(async () => {
          const nextUrls = await page.evaluate(() => {
            let urls = { Assessor: "", Treasurer: "", county: "" };
            const links =
              document.querySelectorAll("li a") ||
              document.querySelectorAll(".nav li");

            if (links.length > 0) urls.Assessor = links[0].href || "";
            if (links.length > 1) urls.Treasurer = links[1].href || "";

            urls.county = document
              .querySelector("#countyName")
              .textContent.trim();

            return urls;
          });

          resolve(nextUrls);
        })
        .catch((error) => {
          reject(new Error("Record does not Exists"));
        });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const ac_2 = async (page, account, nextUrls) => {
  return new Promise(async (resolve, reject) => {
    try {
      // ---------------------------
      // Step 1: Go to Assessor Page
      // ---------------------------
      await page.goto(nextUrls.Assessor, { waitUntil: "domcontentloaded" });

      const data = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "$0.00",
          exemption: "",
          total_taxable_value: "$0.00",
          taxing_authority: "",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        // ---- Basic property info ----
        data.parcel_number =
          document
            .querySelector("#cphContent_ParcelOwnerInfo1_lbParcelNumber")
            ?.textContent.trim() || "";

        data.owner_name.push(
          document
            .querySelector("#cphContent_ParcelOwnerInfo1_lbOwnerName")
            ?.textContent.trim() || ""
        );

        data.property_address =
          document
            .querySelector("#cphContent_ParcelOwnerInfo1_lbSitus")
            ?.textContent.trim() || "";

        // ---- Get assessed/taxable values ----
        const table =
          document.querySelector("#cphContent_ctl02_grdValuations") ??
          document.querySelector("#cphContent_ctl04_grdValuations");

        if (table) {
          const trs = table.querySelectorAll("tbody tr");
          for (let i = 1; i < trs.length; i++) {
            const year = +trs[i].children[0]?.textContent.trim();
            const amt = trs[i].lastElementChild?.textContent.trim();
            if (year === 2024) {
              data.total_assessed_value = amt;
              data.total_taxable_value = amt;
              break;
            }
          }
        }

    

        return data;
      });

      // ---------------------------
      // Step 2: Go to Treasurer Page
      // ---------------------------
      await page.goto(nextUrls.Treasurer, { waitUntil: "domcontentloaded" });

      // ---------------------------
      // Step 3: Extract Tax History
      // ---------------------------
      const dataWithTax = await page.evaluate((data) => {
        const unpaidTaxes = [];
        const paidTaxes = [];

        // ---- Unpaid (current due) ----
        const currentTaxTable = document.getElementById(
          "cphContent_CurrentTaxYearInterest1_GridView1"
        );
        if (currentTaxTable) {
          currentTaxTable.querySelectorAll("tbody tr").forEach((tr, i) => {
            if (i === 0) return;
            const tds = tr.querySelectorAll("td");
            const year = tds[3]?.textContent.trim().slice(0, 4);
            if (!year) return;

            unpaidTaxes.push({
              jurisdiction: "County",
              year,
              payment_type: "",
              status: "Due",
              base_amount: tds[4]?.textContent.trim() || "$0.00",
              amount_paid: "$0.00",
              amount_due: tds[7]?.textContent.trim() || "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: "",
              good_through_date: "",
              link: "",
            });
          });
        }

        // ---- Paid Taxes ----
        const paidTable = document.querySelector(".dataGridPrimary tbody");
        if (paidTable) {
          const rows = Array.from(paidTable.children);
          for (let i = 1; i < rows.length; i += 4) {
            const next_tr = rows[i + 1];
            const subs = next_tr?.querySelectorAll(".dataGridSecondary tbody");
            if (!subs) continue;

            subs.forEach((tbody) => {
              tbody.querySelectorAll("tr").forEach((tr, i) => {
                if (i === 0) return;
                const tds = tr.querySelectorAll("td");
                if (!tds.length) return;

                const year = tds[0]?.textContent.split("-")[0];
                if (!year) return;

                paidTaxes.push({
                  jurisdiction: "County",
                  year,
                  payment_type: "",
                  status: "Paid",
                  base_amount: tds[2]?.textContent.trim() || "$0.00",
                  amount_paid: tds[4]?.textContent.trim() || "$0.00",
                  amount_due: "$0.00",
                  mailing_date: "N/A",
                  due_date: "",
                  delq_date: "",
                  paid_date: tds[1]?.textContent.trim() || "",
                  good_through_date: "",
                  link: "",
                });
              });
            });
          }
        }

        data.tax_history = [...paidTaxes, ...unpaidTaxes];

        // ---- Group tax records by year ----
        const yearGroups = new Map();
        data.tax_history.forEach((tax) => {
          if (!yearGroups.has(tax.year)) yearGroups.set(tax.year, []);
          yearGroups.get(tax.year).push(tax);
        });

        // ---- Keep only top 2 paid records if too many ----
        yearGroups.forEach((records, year) => {
          const paidRecords = records.filter((r) => r.status === "Paid");
          const unpaidRecords = records.filter((r) => r.status !== "Paid");

          if (paidRecords.length > 1) {
            paidRecords.sort((a, b) => {
              const aNum = parseFloat(a.base_amount.replace(/[$,]/g, ""));
              const bNum = parseFloat(b.base_amount.replace(/[$,]/g, ""));
              return bNum - aNum;
            });

            const maxPaid =
              unpaidRecords.length === 0 ? 2 : 2 - unpaidRecords.length;
            const filteredPaid = paidRecords.slice(0, maxPaid);

            yearGroups.set(year, [...filteredPaid, ...unpaidRecords]);
          }
        });

        // Flatten the year groups back into one list
        data.tax_history = Array.from(yearGroups.values()).flat();

        // ---- Count number of records per year ----
        const yearCount = new Map();
        data.tax_history.forEach((h) => {
          yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
        });

        // ---- Assign payment types and due dates ----
        data.tax_history.forEach((h) => {
          const countForYear = yearCount.get(h.year);

          if (countForYear === 1) {
            // Annual payment
            h.payment_type = "Annual";
            h.due_date = `04/30/${h.year}`;
            h.delq_date = `05/01/${h.year}`;
          } else {
            // Semi-annual payment
            h.payment_type = "Semi-Annual";
            const sameYearRecs = data.tax_history.filter(
              (t) => t.year === h.year
            );
            const idx = sameYearRecs.indexOf(h);

            // Decide installment based on paid date or position
            if (h.status === "Paid" && h.paid_date) {
              const paidDate = new Date(h.paid_date);
              const paidMonth = paidDate.getMonth() + 1;
              if (paidMonth < 7) {
                h.due_date = `04/30/${h.year}`;
                h.delq_date = `05/01/${h.year}`;
              } else {
                h.due_date = `10/31/${h.year}`;
                h.delq_date = `11/01/${h.year}`;
              }
            } else {
              if (idx === 0) {
                h.due_date = `04/30/${h.year}`;
                h.delq_date = `05/01/${h.year}`;
              } else {
                h.due_date = `10/31/${h.year}`;
                h.delq_date = `11/01/${h.year}`;
              }
            }
          }
        });

        // ---- Post-processing tax history ----
        if (data.tax_history.length > 0) {
          const today = new Date();

          // Find latest year
          const maxYear = Math.max(
            ...data.tax_history.map((el) => Number(el.year))
          );

          // Update each record’s final status
          data.tax_history = data.tax_history.map((el) => {
            const paid =
              el.status.toLowerCase() === "paid" || el.amount_paid !== "$0.00";
            const dueDate = el.due_date ? new Date(el.due_date) : null;
            const delqDate = el.delq_date ? new Date(el.delq_date) : null;

            if (paid) el.status = "Paid";
            else if (dueDate && today < dueDate) el.status = "Due";
            else if (delqDate && today > delqDate) el.status = "Delinquent";
            else el.status = "Due";

            return el;
          });

          // Sort by year (desc) and due date
          data.tax_history.sort((a, b) => {
            if (a.year !== b.year) return Number(b.year) - Number(a.year);
            return new Date(a.due_date) - new Date(b.due_date);
          });

          // Keep latest year and any unpaid prior years
          data.tax_history = data.tax_history.filter((el) => {
            if (Number(el.year) === maxYear) return true;
            return data.tax_history.some(
              (r) => r.year === el.year && r.status !== "Paid"
            );
          });

          // ---- Mark delinquent status ----
          const hasDelinquent = data.tax_history.some(
            (el) => el.status === "Delinquent"
          );
          data.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";

          // ---- Prepare summary notes ----
          const priorUnpaid = data.tax_history.some(
            (el) => Number(el.year) < maxYear && el.status !== "Paid"
          );

          const maxYearRecords = data.tax_history.filter(
            (el) => Number(el.year) === maxYear
          );

          let firstStatus = "";
          let secondStatus = "";

          maxYearRecords.forEach((el, i) => {
            if (i === 0) firstStatus = el.status.toUpperCase();
            else if (i === 1) secondStatus = el.status.toUpperCase();
          });

          // Build notes based on payment type
          if (maxYearRecords.length === 1) {
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 04/30.`;
          } else {
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
          }
        }

        return data;
      }, data);


          dataWithTax.taxing_authority =
          counties.find(
            (el) =>
              nextUrls.county &&
              nextUrls.county.toLowerCase().includes(el.county.toLowerCase())
          )?.taxing_authority || "";

      resolve(dataWithTax);
    } catch (err) {
      reject(err);
    }
  });
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    ac_1(page, url, account)
      .then((nextUrls) => {
        ac_2(page, account, nextUrls)
          .then((dataWithTax) => {
            resolve(dataWithTax);
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
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    // ✅ Validate fetch_type properly
    if (!["html", "api"].includes(fetch_type)) {
      return res.status(400).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    // ✅ Normalize county name (remove leading/trailing slashes)
    const county = req.path.replace(/^\/+|\/+$/g, "").toLowerCase();

    // ✅ Case-insensitive county lookup
    const url =
      counties.find((el) => el.county.toLowerCase() === county)?.url || "";

    if (!url) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid Route",
      });
    }

    // ✅ Setup browser context
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    // ✅ Block fonts & images for faster scraping
    await page.setRequestInterception(true);
    page.on("request", (reqIntercept) => {
      const type = reqIntercept.resourceType();
      if (type === "font" || type === "image") {
        reqIntercept.abort();
      } else {
        reqIntercept.continue();
      }
    });

    // ✅ Handle both fetch types
    const data = await account_search(page, url, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }

    await context.close();
  } catch (error) {
    console.error(error);

    // ✅ Proper error handling per fetch_type
    if (fetch_type === "html") {
      res.status(500).render("error_data", {
        error: true,
        message: error.message,
      });
    } else {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};

export { search };
