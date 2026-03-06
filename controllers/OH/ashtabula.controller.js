// Author: Harsh Jha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

// Puppeteer timeout configuration
const TIMEOUT_OPTIONS = { timeout: 90000 };

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "N/A") return "N/A";

  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const monthMap = {
      JAN: "01",
      FEB: "02",
      MAR: "03",
      APR: "04",
      MAY: "05",
      JUN: "06",
      JUL: "07",
      AUG: "08",
      SEP: "09",
      OCT: "10",
      NOV: "11",
      DEC: "12",
    };
    const month = monthMap[parts[1]];
    const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];

    if (month) return `${month}/${parts[0]}/${year}`;
  }
  return dateStr;
};

// Navigation: Extract navigation URLs from sidebar
const extractNavigationUrls = async (page) => {
  await page.waitForSelector(".contentpanel li", TIMEOUT_OPTIONS);

  return await page.evaluate(() => {
    const result = {};
    document.querySelectorAll(".contentpanel li").forEach((item) => {
      const label = item.textContent.trim();
      const href = item.querySelector("a")?.href;

      if (label === "Values") result.valuesUrl = href;
      if (label === "Payment History") result.paymentHistoryUrl = href;
      if (label === "Prior Tax Year") result.delinquentCheckUrl = href;
      if (label === "Yearly Summary") result.yearlySummaryUrl = href;
    });
    return result;
  });
};

// Values Page: Extract property values and owner info
const scrapeValuesPage = async (page, valuesUrl) => {
  await page.goto(valuesUrl, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT_OPTIONS.timeout,
  });

  await page.waitForSelector("#datalet_div_1", TIMEOUT_OPTIONS);
  await page.waitForSelector("#datalet_div_2", TIMEOUT_OPTIONS);

  return await page.evaluate(() => {
    const values = {};

    // Extract owner name and address from header
    const headerCells = document.querySelectorAll(".DataletHeaderBottom");
    if (headerCells.length >= 2) {
      values.ownerName = headerCells[0].textContent.trim();
      values.propertyAddress = headerCells[1].textContent.trim();
    }

    // Extract Appraised Value (100%)
    document
      .querySelectorAll("table[id='Appraised Value (100%)'] tr")
      .forEach((tr) => {
        const td1 = tr.querySelector("td:nth-child(1)");
        const td2 = tr.querySelector("td:nth-child(2)");
        if (!td1 || !td2) return;

        const key = td1.textContent.trim();
        const value = td2.textContent.trim();

        if (key === "Year") values.taxYear = value;
        if (key === "Appraised Land") values.landValue = value;
        if (key === "Appraised Building") values.improvements = value;
        if (key === "Appraised Total") values.appraisedValue = value;
      });

    // Extract Assessed Value (35%)
    document
      .querySelectorAll("table[id='Assessed Value (35%)'] tr")
      .forEach((tr) => {
        const td1 = tr.querySelector("td:nth-child(1)");
        const td2 = tr.querySelector("td:nth-child(2)");
        if (!td1 || !td2) return;

        const key = td1.textContent.trim();
        const value = td2.textContent.trim();

        if (key === "Assessed Total") values.assessedValue = value;
      });

    return values;
  });
};

// Prior Tax Year Page: Check for delinquent charges
const scrapeDelinquentCharges = async (page, delinquentCheckUrl) => {
  try {
    await page.goto(delinquentCheckUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_OPTIONS.timeout,
    });

    await page.waitForSelector("table#Delinquent\\ Charges", TIMEOUT_OPTIONS);

    return await page.evaluate(() => {
      let totalDelq = 0;

      document
        .querySelectorAll("table#Delinquent\\ Charges tr")
        .forEach((tr) => {
          const td1 = tr.querySelector("td:nth-child(1)");
          const td2 = tr.querySelector("td:nth-child(2)");
          if (!td1 || !td2) return;

          const key = td1.textContent.trim();
          const value = td2.textContent.trim();

          if (key === "Total Delq.") {
            totalDelq = parseFloat(value.replace(/[$,]/g, "")) || 0;
          }
        });

      return totalDelq;
    });
  } catch (err) {
    console.log("Delinquent Charges check error:", err.message);
    return 0;
  }
};

// Yearly Summary Page: Extract tax summary data
const scrapeYearlySummary = async (page, yearlySummaryUrl) => {
  try {
    await page.goto(yearlySummaryUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_OPTIONS.timeout,
    });

    await page.waitForSelector(
      "table#Tax\\ Summary\\ By\\ Year",
      TIMEOUT_OPTIONS
    );

    const summaryData = await page.evaluate(() => {
      const rows = [];

      document
        .querySelectorAll("table#Tax\\ Summary\\ By\\ Year tr")
        .forEach((tr, index) => {
          if (index === 0) return;

          const tds = tr.querySelectorAll("td");
          if (tds.length < 13) return;

          const year = tds[0].textContent.trim();
          const generalRE = tds[1].textContent.trim();
          const specialAssessment = tds[2].textContent.trim();
          const balanceDue = tds[12].textContent.trim();

          if (year && year !== "Total:" && !isNaN(parseInt(year))) {
            rows.push({
              year: year,
              generalRE: generalRE,
              specialAssessment: specialAssessment,
              balanceDue: balanceDue,
            });
          }
        });

      return rows;
    });

    return summaryData;
  } catch (err) {
    console.log("Yearly Summary page error:", err.message);
    return [];
  }
};

// Build tax history from summary data (2 most recent years)
const buildTaxHistory = (summaryData, years = 1) => {
  if (summaryData.length === 0) return { taxHistory: [], mostRecentYear: 0 };

  // Get 2 most recent years
  const sortedYears = summaryData
    .map((r) => parseInt(r.year))
    .sort((a, b) => b - a);

  const selectedYears = sortedYears.slice(0, years);

  const mostRecentYear = selectedYears[0];
  const secondMostRecentYear = selectedYears[1] || null;

  const taxHistory = [];

  // Process most recent year
  const currentYearData = summaryData.find(
    (r) => parseInt(r.year) === mostRecentYear
  );

  if (currentYearData) {
    const generalAmount =
      parseFloat(currentYearData.generalRE.replace(/[$,]/g, "")) || 0;
    const specialAmount =
      parseFloat(currentYearData.specialAssessment.replace(/[$,]/g, "")) || 0;
    const totalAmount = generalAmount + specialAmount;
    const balanceDue =
      parseFloat(currentYearData.balanceDue.replace(/[$,]/g, "")) || 0;

    const halfAmount = (totalAmount / 2).toFixed(2);
    const isPaid = balanceDue === 0;

    // First installment - current year
    taxHistory.push({
      jurisdiction: "County",
      year: `${mostRecentYear}-${mostRecentYear + 1}`,
      payment_type: "Semi-annual",
      status: isPaid ? "Paid" : "Due",
      base_amount: `$${halfAmount}`,
      amount_paid: `$${halfAmount}`,
      amount_due: "$0.00",
      mailing_date: "N/A",
      due_date: `02/28/${mostRecentYear + 1}`,
      delq_date: `03/01/${mostRecentYear + 1}`,
      paid_date: "N/A",
      good_through_date: "",
      link: "-",
    });

    // Second installment - current year
    taxHistory.push({
      jurisdiction: "County",
      year: `${mostRecentYear}-${mostRecentYear + 1}`,
      payment_type: "Semi-annual",
      status: isPaid ? "Paid" : "Due",
      base_amount: `$${halfAmount}`,
      amount_paid: `$${halfAmount}`,
      amount_due: "$0.00",
      mailing_date: "N/A",
      due_date: `07/31/${mostRecentYear + 1}`,
      delq_date: `08/01/${mostRecentYear + 1}`,
      paid_date: "N/A",
      good_through_date: "",
      link: "-",
    });
  }

  // Process second most recent year
  if (secondMostRecentYear) {
    const priorYearData = summaryData.find(
      (r) => parseInt(r.year) === secondMostRecentYear
    );

    if (priorYearData) {
      const generalAmount =
        parseFloat(priorYearData.generalRE.replace(/[$,]/g, "")) || 0;
      const specialAmount =
        parseFloat(priorYearData.specialAssessment.replace(/[$,]/g, "")) || 0;
      const totalAmount = generalAmount + specialAmount;
      const balanceDue =
        parseFloat(priorYearData.balanceDue.replace(/[$,]/g, "")) || 0;

      const halfAmount = (totalAmount / 2).toFixed(2);
      const isPaid = balanceDue === 0;

      // First installment - prior year
      taxHistory.push({
        jurisdiction: "County",
        year: `${secondMostRecentYear}-${secondMostRecentYear + 1}`,
        payment_type: "Semi-annual",
        status: isPaid ? "Paid" : "Due",
        base_amount: `$${halfAmount}`,
        amount_paid: `$${halfAmount}`,
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: `02/28/${secondMostRecentYear + 1}`,
        delq_date: `03/01/${secondMostRecentYear + 1}`,
        paid_date: "N/A",
        good_through_date: "",
        link: "-",
      });

      // Second installment - prior year
      taxHistory.push({
        jurisdiction: "County",
        year: `${secondMostRecentYear}-${secondMostRecentYear + 1}`,
        payment_type: "Semi-annual",
        status: isPaid ? "Paid" : "Due",
        base_amount: `$${halfAmount}`,
        amount_paid: `$${halfAmount}`,
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: `07/31/${secondMostRecentYear + 1}`,
        delq_date: `08/01/${secondMostRecentYear + 1}`,
        paid_date: "N/A",
        good_through_date: "",
        link: "-",
      });
    }
  }

  return { taxHistory, mostRecentYear };
};

// Payment History Page: Get actual payment dates for multiple years
const scrapePaymentHistory = async (page, paymentHistoryUrl, targetYears) => {
  try {
    await page.goto(paymentHistoryUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_OPTIONS.timeout,
    });

    await page.waitForSelector("table#Payment\\ History", TIMEOUT_OPTIONS);

    return await page.evaluate((years) => {
      const paymentsByYear = {};

      const formatDate = (dateStr) => {
        if (!dateStr || dateStr === "N/A") return "N/A";

        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const monthMap = {
            JAN: "01",
            FEB: "02",
            MAR: "03",
            APR: "04",
            MAY: "05",
            JUN: "06",
            JUL: "07",
            AUG: "08",
            SEP: "09",
            OCT: "10",
            NOV: "11",
            DEC: "12",
          };
          const month = monthMap[parts[1]];
          const yearStr = parts[2].length === 2 ? "20" + parts[2] : parts[2];

          if (month) return `${month}/${parts[0]}/${yearStr}`;
        }
        return dateStr;
      };

      document
        .querySelectorAll("table#Payment\\ History tr")
        .forEach((tr, index) => {
          if (index === 0) return;

          const tds = tr.querySelectorAll("td");
          if (tds.length < 5) return;

          const rowYear = tds[1].textContent.trim();
          const effectiveDate = tds[2].textContent.trim();

          if (years.includes(parseInt(rowYear))) {
            if (!paymentsByYear[rowYear]) {
              paymentsByYear[rowYear] = [];
            }
            paymentsByYear[rowYear].push({ date: formatDate(effectiveDate) });
          }
        });

      return paymentsByYear;
    }, targetYears);
  } catch (err) {
    console.log("Payment History page error:", err.message);
    return {};
  }
};

// Update tax history with payment dates and delinquent status
const updateTaxHistoryWithPayments = (taxHistory, paymentsByYear) => {
  taxHistory.forEach((item) => {
    // Extract the base year from the year range (e.g., "2024-2025" -> "2024")
    const baseYear = item.year.split("-")[0];
    const yearPayments = paymentsByYear[baseYear] || [];

    if (item.status === "Paid" && yearPayments.length > 0) {
      // Match payment to installment based on due date
      const isDueInFebruary = item.due_date.includes("02/28");

      if (isDueInFebruary && yearPayments[0]) {
        item.paid_date = yearPayments[0].date;
      } else if (!isDueInFebruary && yearPayments[1]) {
        item.paid_date = yearPayments[1].date;
      } else if (yearPayments[0]) {
        // If only one payment but both installments paid
        item.paid_date = yearPayments[0].date;
      }
    }

    // Update status to Delinquent if past delq_date
    if (item.status === "Due" && item.delq_date) {
      const today = new Date();
      const delinquentDate = new Date(item.delq_date);

      if (today > delinquentDate) {
        item.status = "Delinquent";
      }
    }
  });

  return taxHistory;
};

// Build final notes
const buildNotes = (delinquentAmount, taxHistory, mostRecentYear) => {
  const priorYearsStatus =
    delinquentAmount > 0 ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIORS ARE PAID";

  // Get unique years from tax history
  const uniqueYears = [...new Set(taxHistory.map((item) => item.year))];

  // Sort years in descending order
  uniqueYears.sort((a, b) => {
    const yearA = parseInt(a.split("-")[0]);
    const yearB = parseInt(b.split("-")[0]);
    return yearB - yearA;
  });

  let notes = `${priorYearsStatus}.`;

  // Build status for each year
  uniqueYears.forEach((yearRange) => {
    const yearItems = taxHistory.filter((item) => item.year === yearRange);

    if (yearItems.length === 2) {
      const firstStatus = yearItems[0].status.toUpperCase();
      const secondStatus = yearItems[1].status.toUpperCase();
      notes += ` ${yearRange} 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus},`;
    }
  });

  // Remove trailing comma and add final statement
  notes = notes.replace(/,$/, "");
  notes +=
    " NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/28 & 07/31";

  return notes;
};

// Main extraction function
const ac_1 = (page, url, parcelId, years = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Load initial page
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_OPTIONS.timeout,
      });

      // Accept agreement
      await page.waitForSelector("button#btAgree", TIMEOUT_OPTIONS);
      await page.click("button#btAgree");
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_OPTIONS.timeout,
      });

      // Enter parcel number
      await page.waitForSelector("input#inpParid", TIMEOUT_OPTIONS);
      // await page.locator("input#inpParid").fill(parcelId);

      await page.evaluate((parcelId) => {
        let input = document.querySelector("#inpParid")
        input.value = parcelId
      },parcelId)

      // Submit and wait for navigation
      await Promise.all([
         page.keyboard.press("Enter"),
         page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_OPTIONS.timeout,
        })

      ])

      // Check for multiple results
      const multipleResults = await page
        .waitForSelector(".searchResults", { timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (multipleResults) {
        return reject("Multiple Records Found, Please refine your search");
      }

      // Extract navigation URLs
      const navigationUrls = await extractNavigationUrls(page);

      // Scrape Values page
      const valuesPageData = await scrapeValuesPage(
        page,
        navigationUrls.valuesUrl
      );

      // Scrape delinquent charges
      const delinquentAmount = await scrapeDelinquentCharges(
        page,
        navigationUrls.delinquentCheckUrl
      );

      // Scrape yearly summary
      const summaryData = await scrapeYearlySummary(
        page,
        navigationUrls.yearlySummaryUrl
      );

      // Build tax history
      let { taxHistory, mostRecentYear } = buildTaxHistory(summaryData, years);

      // Get years to fetch payment history for
      const yearsToFetch = [
        ...new Set(taxHistory.map((item) => parseInt(item.year.split("-")[0]))),
      ];

      // Scrape payment history for both years
      const paymentsByYear = await scrapePaymentHistory(
        page,
        navigationUrls.paymentHistoryUrl,
        yearsToFetch
      );

      // Update tax history with payment dates
      taxHistory = updateTaxHistoryWithPayments(taxHistory, paymentsByYear);

      // Build final data structure
      const delinquentAmountDue =
        delinquentAmount > 0 ? `$${delinquentAmount.toFixed(2)}` : "$0.00";

      const delinquent =
        delinquentAmount > 0
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

      const notes = buildNotes(delinquentAmount, taxHistory, mostRecentYear);

      const data = {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "",
        owner_name: valuesPageData.ownerName ? [valuesPageData.ownerName] : [],
        property_address: valuesPageData.propertyAddress || "",
        parcel_number: parcelId,
        land_value: valuesPageData.landValue || "N/A",
        improvements: valuesPageData.improvements || "N/A",
        total_assessed_value: valuesPageData.assessedValue || "N/A",
        exemption: "",
        total_taxable_value: valuesPageData.assessedValue || "N/A",
        taxing_authority:
          "Ashtabula County Treasurer, 25 W Jefferson St, Jefferson, Ohio.",
        notes: notes,
        delinquent: delinquent,
        delinquent_amount: delinquentAmountDue,
        tax_history: taxHistory,
      };

      resolve(data);
    } catch (error) {
      console.log("Error in ac_1:", error.message);
      reject("Record Not Found");
    }
  });
};

// Wrapper function for account search
const accountSearch = (page, url, account, years) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account, years)
        .then((data) => resolve(data))
        .catch((error) => reject(error));
    } catch (error) {
      reject(error);
    }
  });
};

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;

  const finalYears = getOHCompanyYears(client);

  // Validate account number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      error: true,
      message: "Please enter a valid account number",
    });
  }

  // Validate fetch_type
  if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
    const errorResponse = {
      error: true,
      message: "Invalid Access. fetch_type must be 'html' or 'api'",
    };

    return fetch_type === "html"
      ? res.status(400).render("error_data", errorResponse)
      : res.status(400).json(errorResponse);
  }

  let context;

  try {
    const url = `https://auditor.ashtabulacounty.us/PT/search/commonsearch.aspx?mode=parid`;

    // Launch browser
    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(TIMEOUT_OPTIONS.timeout);

    // Block unnecessary resources for performance
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      if ([ "font", "image"].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Handle frontend rendering requests
    if (fetch_type === "html") {
      accountSearch(page, url, account, finalYears)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", {
            error: true,
            message: error.message || error,
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });
    }
    // Handle API responses (JSON format)
    else if (fetch_type === "api") {
      accountSearch(page, url, account, finalYears)
        .then((data) => {
          res.status(200).json({ result: data });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message || error,
          });
        })
        .finally(async () => {
          if (context) await context.close();
        });
    }
  } catch (error) {
    console.log("Main error:", error.message);
    if (context) await context.close();

    if (fetch_type === "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message || "An error occurred during the search",
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: error.message || "An error occurred during the search",
      });
    }
  }
};

module.exports = { search };