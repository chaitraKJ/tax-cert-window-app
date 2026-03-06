// Author: SANAM POOJITHA
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");
const { getOHCompanyYears } = require("../../utils/configs/OH.config.js");

const timeout_option = { timeout: 90000 };

const cl_1 = async (page, account, url) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#MainContent_txtSearchCriteria");
    await page.locator("#MainContent_txtSearchCriteria").fill(account);

    await Promise.all([
      page.locator("#MainContent_btnSearch").click(),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    const onDetailPage = await page.$("#MainContent_lblAccountBanner");
    if (onDetailPage) return page.url();

    await page.waitForSelector(
      "table[id^='MainContent_ListView1_PropertyTaxResults_']",
      { timeout: 15000 }
    );

    const detailUrl = await page.evaluate(() => {
      const table = document.querySelector(
        "table[id^='MainContent_ListView1_PropertyTaxResults_']"
      );
      const link = table?.querySelector("a[href*='PropertyDetail']");
      return link ? link.href : null;
    });

    if (!detailUrl) throw new Error(`No property detail found for ${account}`);
    return detailUrl;
  } catch (err) {
    throw new Error(err.message);
  }
};

// -------------------- STEP 2: Scrape general info + assessments --------------------
const cl_2 = async (page, detailUrl, county) => {
  try {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded" });

    return page.evaluate((county) => {
      const datum = {
        processed_date: "",
        order_number: "",
        borrower_name: "",
        owner_name: [],
        property_address: "",
        mailing_address: "",
        parcel_number: "",
        land_value: "",
        improvements: "",
        total_assessed_value: 0,
        total_taxable_value: 0,
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      datum.parcel_number =
        document.querySelector("#MainContent_lblAccountBanner font")
          ?.textContent.trim() ?? "";
      datum.property_address =
        document
          .querySelector("#MainContent_lblGIPhysicalAddress")
          ?.textContent.replace("PROPERTY ADDRESS:", "")
          .trim() ?? "";
      datum.owner_name = [
        document
          .querySelector("#MainContent_lblGIOwnerNameBanner")
          ?.textContent.replace("Owner:", "")
          .trim() ?? "",
      ];

      // Assessment totals
      const rows = document.querySelectorAll(
        "#MainContent_PropertyContainer_tpAssessments_AssessmentsGrid tr"
      );
      let totalLand = 0;
      let totalImprovements = 0;
      rows.forEach((row, index) => {
        if (index === 0) return;
        const cells = row.querySelectorAll("td");
        if (cells.length >= 3) {
          const improv = parseFloat(cells[2].innerText.replace(/,/g, "")) || 0;
          const land = parseFloat(cells[3].innerText.replace(/,/g, "")) || 0;
          totalImprovements += improv;
          totalLand += land;
        }
      });

      datum.total_assessed_value =
        "$" + (totalImprovements + totalLand).toLocaleString();
      datum.total_taxable_value = datum.total_assessed_value;

      // Taxing authority mapping
     const countyName = county.toLowerCase().replace(/-/g, "");
      if (countyName.includes("taylor")) {
        datum.taxing_authority = "Taylor County Tax Collector, Florida";
      } else if (countyName.includes("gilchrist")) {
        datum.taxing_authority = "Gilchrist County Tax Collector, Florida";
      } else if (countyName.includes("suwannee")) {
        datum.taxing_authority = "Suwannee County Tax Collector, Florida";
      } else if (countyName.includes("lafayette")) {
        datum.taxing_authority = "Lafayette County Tax Collector, Florida";
      } else if (countyName.includes("dixie")) {
        datum.taxing_authority = "Dixie County Tax Collector, Florida";
      } else if (countyName.includes("stjohns")) {
        datum.taxing_authority = "St. Johns County Tax Collector, Florida";
      }else if (countyName.includes("highlands")) {
        datum.taxing_authority = "Highlands County Tax Collector, Florida";
        }else if (countyName.includes("hendry")) {
        datum.taxing_authority = "Hendry County Tax Collector, Florida";
      } else if (countyName.includes("columbia")) {
        datum.taxing_authority = "columbia County Tax Collector, Florida";
      }else {
        datum.taxing_authority = "";
      }

      return datum;
    }, county);
  } catch (error) {
    throw new Error(error.message);
  }
};

// -------------------- STEP 3: Scrape paid transactions --------------------
const paid = async (page) => {
  return page.evaluate(() => {
    const table = Array.from(document.querySelectorAll("table")).find(
      (t) => t.innerText.includes("Payment Date") && t.innerText.includes("Paid")
    );
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll("tr")).slice(1);
    return rows
      .map((row) => {
        const tds = row.querySelectorAll("td");
        const year = tds[1]?.innerText.trim();
        const amountPaid = tds[6]?.innerText.trim();
        const paidDate = tds[5]?.innerText.trim();
        if (!year || !amountPaid || amountPaid === "$0.00") return null;

        return {
          jurisdiction: "County",
          year,
          status: "Paid",
          base_amount: amountPaid,
          amount_paid: amountPaid,
          amount_due: "$0.00",
          mailing_date: "N/A",
          due_date: "",
          delq_date: "",
          paid_date: paidDate,
          good_through_date: "",
        };
      })
      .filter(Boolean);
  });
};

// -------------------- STEP 4: Scrape unpaid transactions --------------------
const unpaid = async (page) => {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("tr[id^='MainContent_YearRow']");
    return Array.from(rows)
      .map((row) => {
        const yearLink = row.querySelector("a[id^='MainContent_hlYear']");
        const amountSpan = row.querySelector("span[id^='MainContent_h1Amount']");
        if (!yearLink || !amountSpan) return null;

        const year = yearLink.innerText.trim();
        const amount = amountSpan.innerText.trim();
        if (amount === "$0.00") return null;

        return {
          jurisdiction: "County",
          year,
          status: "Due",
          base_amount: amount,
          amount_paid: "$0.00",
          amount_due: amount,
          mailing_date: "N/A",
          due_date: "",
          delq_date: "",
          paid_date: "",
          good_through_date: "",
        };
      })
      .filter(Boolean);
  });
};

// -------------------- STEP 5: Merge Paid + Unpaid --------------------

const mergeTaxes = (paid, unpaid, isInstallment, noOfYears = 1) => {
  if (isInstallment) {
    const all = [...paid, ...unpaid];
    const recentYear = Math.max(...all.map((t) => parseInt(t.year)));
    const recentTaxes = all.filter((t) => parseInt(t.year) === recentYear);
    recentTaxes.sort(
      (a, b) =>
        new Date(a.paid_date || a.payment_date) - new Date(b.paid_date || b.payment_date)
    );

    const installmentMap = {
      1: ["06/30", "07/01"],
      2: ["09/30", "10/01"],
      3: ["12/31", "01/01"],
      4: ["03/31", "04/01"],
    };

    recentTaxes.forEach((t, index) => {
      const installmentNo = index + 1;
      t.payment_type = `Installment #${installmentNo}`;
      const [due, delq] = installmentMap[installmentNo] || ["", ""];
      t.due_date = due ? `${due}/${t.year}` : "";
      t.delq_date = delq ? `${delq}/${t.year}` : "";
      if (t.status.toLowerCase() === "unpaid") t.status = "Due";
    });

    return recentTaxes;
} else {
  // ---------- NORMAL (NON-INSTALLMENT) ----------

const unpaidYears = unpaid
  .map((t) => ({
    ...t,
    status: "Due",
    payment_type: "Annual",
    due_date: `03/31/${t.year}`,
    delq_date: `04/01/${parseInt(t.year) + 1}`,
  }))
  .sort((a, b) => parseInt(a.year) - parseInt(b.year));

const sortedPaid = [...paid]
  .map((t) => ({
    ...t,
    status: "Paid",
    payment_type: "Annual",
    due_date: `03/31/${t.year}`,
    delq_date: `04/01/${parseInt(t.year) + 1}`,
  }))
  .sort((a, b) => parseInt(b.year) - parseInt(a.year));

/**
 * RULE 1: More than 1 due year → return ALL due years
 * (ignore noOfYears completely)
 */
if (unpaidYears.length > 1) {
  return unpaidYears;
}

/**
 * RULE 2: Exactly 1 due year
 * → return due year + (noOfYears - 1) paid years
 */
if (unpaidYears.length === 1) {
  const paidCount = Math.max(noOfYears - 1, 0);
  return [
    ...unpaidYears,
    ...sortedPaid.slice(0, paidCount),
  ].sort((a, b) => parseInt(a.year) - parseInt(b.year));
}

/**
 * RULE 3: No due years
 * → return noOfYears paid years
 */
return sortedPaid
  .slice(0, noOfYears)
  .sort((a, b) => parseInt(a.year) - parseInt(b.year));

}

};





// -------------------- Notes --------------------
const generateNotes = (taxes, isInstallment) => {
  if (!taxes.length) return "ALL TAXES ARE PAID, NO TAXES DUE";

  if (isInstallment) {
    const sorted = [...taxes].sort((a, b) => {
      if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
      const getNum = (pt) =>
        parseInt(pt.match(/Installment #(\d+)/)?.[1] || "0");
      return getNum(a.payment_type) - getNum(b.payment_type);
    });

    const recent = sorted[sorted.length - 1];
    const priorUnpaid = sorted.filter(
      (t) =>
        (parseInt(t.year) < parseInt(recent.year) ||
          (t.year === recent.year && t.payment_type !== recent.payment_type)) &&
        ["unpaid", "due", "delinquent"].includes(t.status.toLowerCase())
    );

    const hasPriorUnpaid = priorUnpaid.length > 0;
    const recentStatus = recent.status.toLowerCase();

    const match = recent.payment_type.match(/Installment #(\d+)/);
    const num = match ? match[1] : "";
    const ordinal =
      num === "1"
        ? "1ST"
        : num === "2"
          ? "2ND"
          : num === "3"
            ? "3RD"
            : num
              ? `${num}TH`
              : "";

    let baseText = "";
    if (!hasPriorUnpaid && recentStatus === "paid") {
      baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS PAID`;
    } else if (!hasPriorUnpaid && recentStatus === "unpaid") {
      baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS DUE`;
    } else if (!hasPriorUnpaid && recentStatus === "due") {
      baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS DUE`;
    } else if (!hasPriorUnpaid && recentStatus === "delinquent") {
      baseText = `ALL PRIORS ARE PAID, ${recent.year} ${ordinal} INSTALLMENT IS DELINQUENT`;
    } else if (hasPriorUnpaid && ["unpaid", "delinquent"].includes(recentStatus)) {
      baseText = `PRIORS ARE DELINQUENT, ${recent.year} ${ordinal} INSTALLMENT IS ${recent.status.toUpperCase()}`;
    } else if (hasPriorUnpaid && recentStatus === "paid") {
      baseText = `PRIORS ARE DELINQUENT, ${recent.year} ${ordinal} INSTALLMENT IS PAID`;
    }

    return `${baseText}, NORMALLY TAXES ARE PAID QUARTERLY, NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31.`.toUpperCase();
  }

  // ---------------- ANNUAL (Non-Installment) ----------------
  const sorted = [...taxes].sort((a, b) => parseInt(a.year) - parseInt(b.year));
  const recent = sorted[sorted.length - 1];
  const priorUnpaid = sorted.filter(
    (t) =>
      parseInt(t.year) < parseInt(recent.year) &&
      ["unpaid", "due", "delinquent"].includes(t.status.toLowerCase())
  );

  const hasPriorUnpaid = priorUnpaid.length > 0;
  const recentStatus = recent.status.toLowerCase();

  let baseText = "";
  if (hasPriorUnpaid && recentStatus === "paid") {
    baseText = `PRIOR YEAR(S) TAXES ARE DUE, ${recent.year} TAXES ARE PAID`;
  } else if (!hasPriorUnpaid && recentStatus === "paid") {
    baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE PAID`;
  } else if (!hasPriorUnpaid && recentStatus === "unpaid") {
    baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE DUE `;
  } else if (!hasPriorUnpaid && recentStatus === "due") {
    baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE DUE `;
  } else if (!hasPriorUnpaid && recentStatus === "delinquent") {
    baseText = `ALL PRIORS ARE PAID, ${recent.year} TAXES ARE DELINQUENT`;
  } else if (hasPriorUnpaid && ["unpaid", "due", "delinquent"].includes(recentStatus)) {
    baseText = `PRIORS ARE DELINQUENT, ${recent.year} TAXES ARE ${recent.status.toUpperCase()}`;
  }

  return `${baseText}, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATE IS 03/31.`.toUpperCase();
};


// -------------------- Orchestrator --------------------
const account_search = async (page, account, url, county, client = "OTHERS") => {
  const detailUrl = await cl_1(page, account, url);
  const data = await cl_2(page, detailUrl, county);

  const paidData = await paid(page);
  const unpaidData = await unpaid(page);

  const bannerText = await page.evaluate(
    () =>
      document.querySelector("#MainContent_lblGIInstallmentBanner")
        ?.innerText || ""
  );
  const isInstallment = bannerText.toLowerCase().includes("installment");

  const noOfYears = getOHCompanyYears(client); // <-- get number of years based on client
  const mergedTaxes = mergeTaxes(paidData, unpaidData, isInstallment, noOfYears);

  // --- Update status based on due/delinquent dates ---
  const today = new Date();
  mergedTaxes.forEach((t) => {
    const status = t.status.toLowerCase();
    if (status === "paid") {
      t.status = "Paid"; // keep paid as-is
      return;
    }

    const dueDate = t.due_date ? new Date(t.due_date) : null;
    const delqDate = t.delq_date ? new Date(t.delq_date) : null;

    if (dueDate && today < dueDate) {
      t.status = "Due";
    } else if (dueDate && delqDate && today >= dueDate && today < delqDate) {
      t.status = "Due";
    } else if (delqDate && today >= delqDate) {
      t.status = "Delinquent";
    } else {
      t.status = "Due";
    }
  });

  data.tax_history = mergedTaxes;
  data.notes = generateNotes(mergedTaxes, isInstallment);

  // set delinquent status
  if (mergedTaxes.some((t) => t.status.toLowerCase() === "delinquent")) {
    data.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
  } else if (mergedTaxes.some((t) => t.status.toLowerCase() === "due")) {
    data.delinquent = "NONE";
  } else {
    data.delinquent = "NONE";
  }

  return data;
};

// -------------------- Express API --------------------
const search = async (req, res) => {
 
   const { fetch_type, account, client } = req.body; 
  const county = req.path.replace(/^\/+/, "");

  if (!account) {
    return res.status(400).json({ error: true, message: "Missing account" });
  }
  if (!county) {
    return res.status(400).json({ error: true, message: "Missing county" });
  }

  let browser;
  let context;

  try {
const countyUrls = {
  taylor: "https://taylor.floridatax.us/AccountSearch?s=pt",
  gilchrist: "https://gilchrist.floridatax.us/AccountSearch?s=pt",
  suwannee: "https://suwannee.floridatax.us/AccountSearch?s=pt",
  lafayette: "https://lafayette.floridatax.us/AccountSearch?s=pt",
  dixie: "https://dixie.floridatax.us/AccountSearch?s=pt",
  stjohns: "https://www.stjohnstax.us/AccountSearch?s=pt",
  highlands:"https://highlands.floridatax.us/AccountSearch?s=pt",
  hendry:"https://hendry.floridatax.us/AccountSearch?s=pt",
  columbia:"https://columbia.floridatax.us/AccountSearch?s=pt",
};

const cleanedCounty = county.replace(/-/g, "").toLowerCase();
const url = countyUrls[cleanedCounty];

if (!url) throw new Error(`Unknown county: ${county}`);


    browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font" || req.resourceType() === "image") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type == "html") {
      // FRONTEND ENDPOINT
      account_search(page, account, url, county,client)
        .then((result) => {
          res.status(200).render("parcel_data_official", result);
        })
        .catch((error) => {
          res.status(500).render("error_data", {
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          await context.close();
        });
    } else if (fetch_type == "api") {
      // API ENDPOINT
      account_search(page, account, url, county,client)
        .then((result) => {
          return res.status(200).json({
            result,
          });
        })
        .catch((error) => {
          return res.status(500).json({
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
      res.status(500).render("error_data", {
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

module.exports = { search };