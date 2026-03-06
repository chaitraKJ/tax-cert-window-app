//author -> Harsh Jha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

//timeout option for navigation
const timeout_option = {
  timeout: 90000,
};

//all county details (used to match taxing authority)
const counties = [
  {
    county: "walla-walla",
    url: "https://propertysearch.co.walla-walla.wa.us/PropertyAccess/propertysearch.aspx?cid=0",
    taxing_authority: "500 W Main St, Walla Walla, WA 99362, United States",
  },
  {
    county: "stevens",
    url: "https://propertysearch.trueautomation.com/PropertyAccess/?cid=0",
    taxing_authority:
      "Stevens County Courthouse, 215 S Oak St, Colville, WA 99114",
  },
  {
    county: "whatcom",
    url: "https://property.whatcomcounty.us/propertyaccess/?cid=0",
    taxing_authority:
      "Whatcom County Treasurer, 311 Grand Ave Suite 104, Bellingham, WA 98225",
  },
  {
    county: "island",
    url: "http://assessor.islandcountywa.gov/propertyaccess/?cid=0",
    taxing_authority:
      "Island County Treasurer, 1 NE 7th Street Coupeville, WA 98239",
  },
  {
    county: "san-juan",
    url: "https://parcel.sanjuancountywa.gov/PropertyAccess/PropertySearch.aspx?cid=0",
    taxing_authority: "San Juan County Treasurer, WA",
  },
  {
    county: "columbia",
    url: "http://64.184.153.98/PropertyAccess/PropertySearch.aspx?cid=0",
    taxing_authority: "Columbia County, WA",
  },
  {
    county: "pend-oreille",
    url: "http://taweb.pendoreille.org/PropertyAccess/PropertySearch.aspx?cid=0",
    taxing_authority: "Old County Courthouse 625 W 4th St. Newport, WA 99156",
  },
  {
    county: "wahkiakum",
    url: "https://apo.co.wahkiakum.wa.us/propertyaccess/?cid=0",
    taxing_authority: "Wahkiakum County 64 Main Street ,Cathlamet, WA 98612",
  },
  {
    county: "grant",
    url: "https://propertysearch.grantcountywa.gov/propertyaccess/PropertySearch.aspx?cid=10",
    taxing_authority:
      "Grant County Courthouse,35 C Street NW,P.O. Box 37, Ephrata, WA 98823",
  },
  {
    county: "jefferson",
    url: "https://trueweb.jeffcowa.us/propertyaccess/PropertySearch.aspx?cid=0",
    taxing_authority:
      "Jefferson County Courthouse,1820 Jefferson Street,P.O. Box 1220,Port Townsend, WA 98368",
  },
  {
    county: "benton",
    url: "https://propertysearch.co.benton.wa.us/propertyaccess/PropertySearch.aspx?cid=0",
    taxing_authority:
      "Benton County Treasurer,Tax Processing Center,7122 W Okanogan Pl #E110,Kennewick, WA 99336",
  },
  {
    county: "clallam",
    url: "https://websrv22.clallam.net/propertyaccess/?cid=0",
    taxing_authority:
      "Clallam County Courthouse , 223 E. 4th St, Suite 13,Port Angeles, WA 98362",
  },
  {
    county: "chelan",
    url: "https://pacs.co.chelan.wa.us/PropertyAccess/?cid=90",
    taxing_authority:
      "Chelan County,350 Orondo Ave,Suite 203 Wenatchee WA 98801",
  },
];


// searching account and getting detail page url
const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      //opening county site
      await page.goto(url, { waitUntil: "domcontentloaded" });


      
      
      //checking which search input is present (each county different UI)
      const searchInputPresent = await page.evaluate(() => {
        if (document.querySelectorAll("#propertySearchOptions_ownerName")) {
          return false;
        } else {
          return true;
        }
      });
      
      //if direct geoid input box available
      if (searchInputPresent) {
        const inputSelector = "input#propertySearchOptions_geoid";
        await page.waitForSelector(inputSelector);
        await page.click(inputSelector);
        await page.type(inputSelector, account);

        //triggering search
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          page.keyboard.press("Enter"),
        ]);
      }

      //if dropdown search present (some counties use select → account number)
      if (!searchInputPresent) {
        await page.waitForSelector(
          "select[name='propertySearchOptions$searchType']",
          { visible: true }
        );

        //selecting account-number option
        await page.select(
          "select[name='propertySearchOptions$searchType']",
          "account-number"
        );

        //typing account value
        await page.waitForSelector("input[name='propertySearchOptions$geoid']", {
          visible: true,
        });

        await page.click("input[name='propertySearchOptions$geoid']", {
          clickCount: 3,
        });
        await page.type("input[name='propertySearchOptions$geoid']", account, {
          delay: 100,
        });

        //submit search
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          page.keyboard.press("Enter"),
        ]);
      }

      //extracting detail page url from results
      const Url = await page.evaluate(() => {
        const rows = document.querySelectorAll(
          "#propertySearchResults_resultsTable tbody tr"
        );

        for (let i = 0; i < rows.length; i++) {
          if (i !== 0 && i !== 2) {
            let link = rows[i].querySelector("td:nth-last-child(2) a")?.href;
            if (link) return link;
          }
        }
        return null;
      });

      //if no record found
      if (!Url) reject(new Error("Record not found"));
      resolve(Url);
    } catch (error) {
      console.log(error);
      reject(new Error("Record not found"));
    }
  });
};

// go to detail page and scrap full tax data
const ac_2 = async (page, account, url) => {
  return new Promise(async (resolve, reject) => {
    try {
      //go to account detail page
      await page.goto(url, { waitUntil: "domcontentloaded", timeout_option });
      await page.waitForSelector("#header h1", timeout_option)

      //extracting all property and tax details
      const data = await page.evaluate((counties) => {
        //formatter helper
        const fmt = (num) => `$${Number(num || 0).toFixed(2)}`;
        const parseNum = (str) => Number(str?.replace(/[$,]/g, "") || 0);
        const getText = (el, def = "") => el?.textContent.trim() || def;

        //object to store all data
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

        //match and set taxing authority
        const county = document.querySelector("#header h1").textContent.trim();

        data.taxing_authority =
          counties.find((el) => {
            if (!county) return false;
            const cleanCounty = county.toLowerCase().replace(/[\s-]/g, "");
            const cleanName = el.county.toLowerCase().replace(/[\s-]/g, "");
            return cleanCounty.includes(cleanName);
          })?.taxing_authority || "";

        //getting property related info
        const propRows = document.querySelectorAll(
          "#propertyDetails table tbody tr"
        );
        if (propRows[2])
          data.parcel_number = getText(propRows[2].querySelectorAll("td")[1]);
        if (propRows[11])
          data.property_address = getText(
            propRows[11].querySelectorAll("td")[1]
          );
        if (propRows[15])
          data.owner_name.push(getText(propRows[15].querySelectorAll("td")[1]));

        //getting assessed values
        const taxRows = document.querySelectorAll(
          "#taxingJurisdictionPanel_TaxingJurisdictionDetails1_ownerTable tbody tr"
        );
        if (taxRows[2]) {
          const val = document
            .querySelector(
              "#valuesDetailsPanel_ValuesDetails_detailsTable  tbody"
            )
            .lastElementChild.querySelector(".currency")
            .textContent.trim();
          data.total_assessed_value = val;
          data.total_taxable_value = val;
        }

        //extracting tax history table
        const histRows = document.querySelectorAll(
          "#ctl00_details_detailsTable .rowEnd"
        );

        histRows.forEach((tr) => {
          const tds = tr.querySelectorAll("td");

          const year = getText(tds[0], "-");
          const firstBase = parseNum(getText(tds[2]));
          const secondBase = parseNum(getText(tds[3]));
          const basePaid = parseNum(getText(tds[6]));

          // pushing 1st installment data
          const firstPaid = Math.min(basePaid, firstBase);
          const firstDue = Math.max(firstBase - firstPaid, 0);

          data.tax_history.push({
            jurisdiction: "County",
            year,
            payment_type: "Semi-Annual",
            status: "",
            base_amount: fmt(firstBase),
            amount_paid: fmt(firstPaid),
            amount_due: fmt(firstDue),
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: "",
            good_through_date: "",
            link: "",
          });

          // pushing 2nd installment data
          const secondPaid = Math.max(0, basePaid - firstBase);
          const secondDue = Math.max(secondBase - secondPaid, 0);

          data.tax_history.push({
            jurisdiction: "County",
            year,
            payment_type: "Semi-Annual",
            status: "",
            base_amount: fmt(secondBase),
            amount_paid: fmt(secondPaid),
            amount_due: fmt(secondDue),
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: "",
            good_through_date: "",
            link: "",
          });
        });

        // grouping all tax history by year
        const yearGroups = new Map();
        data.tax_history.forEach((tax) => {
          if (!yearGroups.has(tax.year)) yearGroups.set(tax.year, []);
          yearGroups.get(tax.year).push(tax);
        });

        //keeping max 2 paid records if too many exist
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

        //flatten back
        data.tax_history = Array.from(yearGroups.values()).flat();

        //assigning due dates based on yearly record count
        const yearCount = new Map();
        data.tax_history.forEach((h) => {
          yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
        });

        data.tax_history.forEach((h) => {
          const countForYear = yearCount.get(h.year);

          //annual record
          if (countForYear === 1) {
            h.payment_type = "Annual";
            h.due_date = `04/30/${h.year}`;
            h.delq_date = `05/01/${h.year}`;
          } else {
            //semi annual
            h.payment_type = "Semi-Annual";
            const sameYearRecs = data.tax_history.filter(
              (t) => t.year === h.year
            );
            const idx = sameYearRecs.indexOf(h);

            //if paid record then decide by paid date
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
              //fallback by index order
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

      
        //final tax status post processing
        if (data.tax_history.length > 0) {
          const today = new Date();

          //latest year
          const maxYear = Math.max(
            ...data.tax_history.map((el) => Number(el.year))
          );

          //assign final statuses
          data.tax_history = data.tax_history.map((el) => {
            const paid =
              el.status.toLowerCase() === "paid" || el.amount_paid !== "$0.00";
            const dueDate = el.due_date ? new Date(el.due_date) : null;
            const delqDate = el.delq_date ? new Date(el.delq_date) : null;

            if (paid) el.status = "Paid";
            else if (dueDate && today < dueDate) el.status = "Due";
            else if (delqDate && today > delqDate) el.status = "Delinquent";
            else el.status = " ";

            return el;
          });

          //sorting by year then due date
          data.tax_history.sort((a, b) => {
            if (Number(a.year) !== Number(b.year))
              return Number(a.year) - Number(b.year);

            const da = new Date(a.due_date || "01/01/1900");
            const db = new Date(b.due_date || "01/01/1900");

            return da - db;
          });

          //keeping latest year always + unpaid previous years
          data.tax_history = data.tax_history.filter((el) => {
            if (Number(el.year) === maxYear) return true;
            return data.tax_history.some(
              (r) => r.year === el.year && r.status !== "Paid"
            );
          });

          //mark delinquent status
          const hasDelinquent = data.tax_history.some(
            (el) => el.status === "Delinquent"
          );
          data.delinquent = hasDelinquent
            ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
            : "NONE";


          //preparing summary notes
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

          //if annual
          if (maxYearRecords.length === 1) {
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 04/30.`;
          } else {
            //if semi annual
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
          }
        }

        return data;
      }, counties);

      resolve(data);
    } catch (error) {
      console.log("Scraping failed:", error.message);
      reject(new Error(`Failed to scrape tax data: ${error.message}`));
    }
  });
};


// wrapper to combine both functions
const account_search = (page, url, account) => {
  return new Promise((resolve, reject) => {
    //first get detail page url
    ac_1(page, url, account)
      .then((Url) =>
        //then scrape detail
        ac_2(page, account, Url)
          .then((data) => {
            //returning scraped data
            resolve(data);
          })
          .catch((error) => reject(error))
      )
      .catch((error) => reject(error));
  });
};


// route controller - main entry
const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  let context;

  try {
    //validate request type
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(500).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    //extract county from route
    const county = req.path.replace(/^\/+/, "").toLowerCase();
    const url = counties.find((el) => el.county === county)?.url || "";

    if (!url) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid Route",
      });
    }

    //launching browser
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    //setting user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(90000);

    //blocking heavy resources
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    //searching account and getting data
    const result = await account_search(page, url, account);

    //response type based on request
    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", result);
    } else {
      res.status(200).json({ result });
    }
  } catch (error) {
    console.log(error);
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
  } finally {
    //closing browser context
    if (context) {
      await context.close();
    }
  }
};

module.exports = { search };