import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

const counties = [
  {
    county: "mobile",
    url: "https://mobile.capturecama.com/receiptsearch",
    taxing_authority:
      "Kim Hastie, Revenue Commissioner, 3925 Michael Blvd Suite G, Mobile, AL 36609",
  },
  {
    county: "shelby",
    url: "https://ptc.shelbyal.com/propsearch",
    taxing_authority:
      "Jacob Tidmore, Property Tax Commissioner, 102 Depot Street, Columbiana, AL 35051",
  },
  {
    county: "jefferson",
    url: "https://eringcapture.jccal.org/propsearch",
    taxing_authority:
      "Jacob Tidmore, Property Tax Commissioner, 102 Depot Street, Columbiana, AL 35051",
  },
];


const formatted_data = (data,county) => {
  // ----- DATE FORMATTER (MM/DD/YYYY) -----
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  // ----- MONEY FORMATTER ($1,234.56) -----
  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return "";
    const num = Number(amount);
    if (isNaN(num)) return "";
    return `$${num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const finalData = {
    processed_date: new Date().toISOString().split("T")[0],
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
    notes: "",
    delinquent: "",
    taxing_authority: "",
    bill_year: "",
    tax_history: [],
  };

  const parcel = data?.parcel_details?.[0] || {};
  const recentTaxData = data?.current_tax_details || [];

  // ---- PICK MOST RECENT YEAR ----
  let mostRecentYear = 0;

  if (recentTaxData.length > 0) {
    mostRecentYear = Math.max(
      ...recentTaxData.map((x) => Number(x.RecordYear))
    );
  }

  const currentYearData = recentTaxData.filter(
    (x) => Number(x.RecordYear) === mostRecentYear
  );

  // ---- PUSH ONLY THIS YEAR TAX HISTORY ----
  currentYearData.forEach((el) => {
    const {
      RecordYear: year,
      TotalTaxNFees: base_amount,
      LastPaidDate: paid_date,
      TotalPaid: amount_paid,
      DueDate,
      DelqDate,
    } = el;

    const isPaid = Number(amount_paid) > 0;

    finalData.tax_history.push({
      jurisdiction: "County",
      year,
      payment_type: "",
      status: isPaid ? "Paid" : "Due",
      base_amount: formatMoney(base_amount),
      amount_paid: formatMoney(amount_paid),
      amount_due: isPaid ? formatMoney(0) : formatMoney(base_amount),
      mailing_date: "N/A",
      due_date: formatDate(DueDate),
      delq_date: formatDate(DelqDate),
      paid_date: formatDate(paid_date),
      good_through_date: "",
      link: "",
    });
  });

  // ---- ASSIGN PAYMENT TYPES AND DUE DATES ----
  finalData.tax_history.forEach((h, i) => {
    const year = Number(h.year) || new Date().getFullYear();
    const totalForYear = finalData.tax_history.filter(
      (x) => x.year === h.year
    ).length;

    // Alabama: Taxes are due October 1st and delinquent after December 31st
    if (totalForYear === 1) {
      // Annual
      h.payment_type = "Annual";
      if (!h.due_date) h.due_date = `10/01/${year}`;
      if (!h.delq_date) h.delq_date = `01/01/${year + 1}`;
    } else {
      // Semi-Annual (if applicable)
      h.payment_type = "Semi-Annual";

      // Determine if this is 1st or 2nd installment
      if (i % 2 === 0) {
        // 1st installment
        if (!h.due_date) h.due_date = `10/01/${year}`;
        if (!h.delq_date) h.delq_date = `01/01/${year + 1}`;
      } else {
        // 2nd installment (if semi-annual payments exist)
        if (!h.due_date) h.due_date = `12/31/${year}`;
        if (!h.delq_date) h.delq_date = `01/01/${year + 1}`;
      }
    }
  });

  // ---- UPDATE STATUS BASED ON DATES ----
  if (finalData.tax_history.length > 0) {
    const today = new Date();

    finalData.tax_history = finalData.tax_history.map((el) => {
      const paid =
        el.status.toLowerCase() === "paid" || el.amount_paid !== formatMoney(0);
      const dueDate = el.due_date ? new Date(el.due_date) : null;
      const delqDate = el.delq_date ? new Date(el.delq_date) : null;

      if (paid) {
        el.status = "Paid";
      } else if (delqDate && today > delqDate) {
        el.status = "Delinquent";
      } else if (dueDate && today < dueDate) {
        el.status = "Due";
      } else {
        el.status = "Due";
      }

      return el;
    });

    // ---- SORT TAX HISTORY ----
    finalData.tax_history.sort((a, b) => {
      if (Number(a.year) !== Number(b.year)) {
        return Number(a.year) - Number(b.year);
      }
      const da = new Date(a.due_date || "01/01/1900");
      const db = new Date(b.due_date || "01/01/1900");
      return da - db;
    });
  }

  // ---- PARCEL INFO ----
  const {
    ParcelNo,
    MunDesc: countyName,
    TotalLandValue: landValue,
    TotalBldgValue: improvements,
    Address1,
    City,
    State,
    Zip,
    TaxableValue: total_taxable_value,
    AssessedValue: total_assessed_value,
    MigratedOwners,
    MigratedOwners1,
  } = parcel;

  finalData.parcel_number = ParcelNo || "";
  finalData.land_value = formatMoney(landValue);
  finalData.improvements = formatMoney(improvements);
  finalData.total_assessed_value = formatMoney(total_assessed_value);
  finalData.total_taxable_value = formatMoney(total_taxable_value);

  finalData.owner_name = [
    ...(MigratedOwners ? [MigratedOwners] : []),
    ...(MigratedOwners1 ? [MigratedOwners1] : []),
  ];

  finalData.property_address = [
    Address1?.trim(),
    City?.trim(),
    State?.trim(),
    Zip?.trim(),
  ]
    .filter(Boolean)
    .join(", ");

 switch (county) {
  case "mobile":
    finalData.taxing_authority =
      "Kim Hastie, Revenue Commissioner, 3925 Michael Blvd Suite G, Mobile, AL 36609";
    break;

  case "shelby":
    finalData.taxing_authority =
      "Jacob Tidmore, Property Tax Commissioner, 102 Depot Street, Columbiana, AL 35051";
    break;

  case "jefferson":
    finalData.taxing_authority =
      "Jefferson County Tax Collector, Birmingham, AL";
    break;
}


  finalData.bill_year = mostRecentYear || "";

  // ---- MARK DELINQUENT STATUS ----
  const hasDelinquent = finalData.tax_history.some(
    (el) => el.status === "Delinquent"
  );
  finalData.delinquent = hasDelinquent ? "YES" : "NONE";

  // ---- PREPARE SUMMARY NOTES ----
  let notes = "";
  const hist = finalData.tax_history;

  if (hist.length > 0) {
    const priorUnpaid = hist.some(
      (el) => Number(el.year) < mostRecentYear && el.status !== "Paid"
    );

    const maxYearRecords = hist.filter(
      (el) => Number(el.year) === mostRecentYear
    );

    if (maxYearRecords.length === 1) {
      // Annual payment
      const annualStatus = maxYearRecords[0].status.toUpperCase();
      notes = `${
        priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"
      }. ${mostRecentYear}: ANNUAL TAX STATUS IS ${annualStatus}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 10/01, DELINQUENT AFTER 12/31.`;
    } else {
      // Semi-Annual payments
      const firstStatus = maxYearRecords[0]?.status.toUpperCase() || "UNKNOWN";
      const secondStatus =
        maxYearRecords[1]?.status.toUpperCase() || "UNKNOWN";
      notes = `${
        priorUnpaid ? "PRIOR YEARS ARE DELINQUENT" : "ALL PRIOR YEARS ARE PAID"
      }. ${mostRecentYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, DUE DATE IS 10/01, DELINQUENT AFTER 12/31.`;
    }
  }

  finalData.notes = notes.trim();

  return finalData;
};

const ac_1 = async (page, url, account, county) => {
  return new Promise(async (resolve, reject) => {
    try {
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });
      account = account.replace(/[ \.]/g, "");

      // SELECT THE PARCEL SEARCH
      await page.waitForSelector("#main select", timeout_option);
      await page.select("#main select", "2");

      // FILL THE PARCEL INFO
      await page.waitForSelector("#main #searchText", timeout_option);
      await page.locator("#main #searchText").fill(account);

      // CLICK THE BUTTON

      await page.waitForSelector("#main #btnSearch", timeout_option);
      await page.locator("#main #btnSearch").click();

      // WAIT FOR THE RESULT
      page.on("response", async (response) => {
        if (
          (response.request().method() == "POST" &&
            response.url().includes("/SearchReceipts")) ||
          (response.request().method() == "POST" &&
            response.url().includes("/SearchRP"))
        ) {
          let data = await response.json();
          resolve(data);
        }
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const ac_2 = async (page, data, county) => {
  return new Promise(async (resolve, reject) => {
    try {
      let result_length = data.length;
      if (result_length == 0) {
        reject(new Error("No Record Found"));
      }

      // CLICK THE LINK
      if (county === "mobile") {
        await page.waitForSelector("#main .stackable .card a", timeout_option);
        await page.locator("#main .stackable .card a").click();
      } else if (county === "shelby" || county === "jefferson") {
        await page.waitForSelector(
          "#main a.ui.fluid.basic.orange.button.flex-1",
          timeout_option
        );
        await page
          .locator("#main a.ui.fluid.basic.orange.button.flex-1")
          .click();
      }

      let all_data = {};
      let parcel_details = false;
      let current_tax_details = false;
      let prior_tax_details = false;
      page.on("response", async (response) => {
        if (
          response.request().method() == "POST" &&
          response.url().includes("/GetParcelDetail")
        ) {
          all_data["parcel_details"] = await response.json();
          parcel_details = true;
        } else if (
          response.request().method() == "POST" &&
          response.url().includes("/GetCurrTaxPmts")
        ) {
          all_data["current_tax_details"] = await response.json();
          current_tax_details = true;
        } else if (
          response.request().method() == "POST" &&
          response.url().includes("/GetTaxPmts")
        ) {
          all_data["prior_tax_details"] = await response.json();
          prior_tax_details = true;
        }
        if (parcel_details && current_tax_details && prior_tax_details) {
          resolve(all_data);
        }
      });
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const ac_3 = async (page, data, county) => {
  return new Promise(async (resolve, reject) => {
    const finalData = formatted_data(data, county);
    resolve(finalData);
  });
};

const account_search = async (page, url, account, county) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account, county)
        .then((data1) => {
          ac_2(page, data1, county)
            .then((data2) => {
              ac_3(page, data2, county)  
                .then((data3) => {
                  resolve(data3);
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
    } catch (error) {
      console.log(error);
      reject(new Error(error.message));
    }
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    const county = req.path.replace(/^\/+/, "").toLowerCase();
    const url = counties.find((el) => el.county === county)?.url || "";

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        req.resourceType() === "stylesheet" ||
        req.resourceType() === "font" ||
        req.resourceType() === "image"
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page, url, account, county)
        .then((data) => {
          res.status(200).render("parcel_data_official", data);
        })
        .catch((error) => {
          console.log(error);
          res.status(200).render("error_data", {
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page, url, account, county)
        .then((data) => {
          res.status(200).json({
            result: data,
          });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    }
  } catch (error) {
    console.log(error);
    if (fetch_type == "html") {
      res.status(200).render("error_data", {
        error: true,
        message: error.message,
      });
    } else if (fetch_type == "api") {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};

export { search };
