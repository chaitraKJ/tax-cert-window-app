//Author -> Harsh Jha

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const utils = {
  getText: (selector) =>
    document.querySelector(selector)?.textContent.trim() || "-",


  formatCurrency: (amount) => {
    if (!amount || amount === "-" || amount === "N/A") return amount;
    const numStr = amount.toString().replace(/[$,]/g, "");
    const num = parseFloat(numStr);
    if (isNaN(num)) return amount;
    return (
      "$" +
      num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  },
};


const extractParcelData = () => {
  const utils = {
    getText: (selector) =>
      document.querySelector(selector)?.textContent.trim() || "-",

    formatCurrency: (amount) => {
      if (!amount || amount === "-" || amount === "N/A") return amount;
      const numStr = amount.toString().replace(/[$,]/g, "");
      const num = parseFloat(numStr);
      if (isNaN(num)) return amount;
      return (
        "$" +
        num.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    },
  };


  const data = {
    processed_date: new Date().toISOString().split("T")[0],
    order_number: "-",
    borrower_name: "-",
    owner_name: [utils.getText("#MainContent_OwnerName_dlOwner_txtNameLabel_0")],
    property_address:
      utils.getText("#lblSiteAddress").split(":")[1]?.trim() || "-",
    parcel_number: utils.getText("#lblParcel").split(":")[1]?.trim() || "-",
    land_value: "-",
    improvements: "-",
    total_assessed_value: utils.formatCurrency(
      document
        .querySelector("#MainContent_AssessedValue_GridView4 tbody tr")
        ?.children[1]?.textContent.trim() || "0"
    ),
    exemption: "-",
    total_taxable_value: utils.formatCurrency(
      document
        .querySelector("#MainContent_AssessedValue_GridView4 tbody tr")
        ?.children[1]?.textContent.trim() || "0"
    ),
    taxing_authority:
      "Spokane County,1116 W Broadway Avenue,Spokane, WA 99260",
    notes: "-",
    delinquent: "-",
    tax_history: [],
  };


  const yearWithDateMap = new Map();
  const receiptTable = document.querySelector("#MainContent_TaxInfo_GridView17");
  if (receiptTable) {
    receiptTable.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const year = cells[0]?.textContent.trim() || "";
      const paidDate = cells[2]?.textContent.trim() || "";
      if (year) yearWithDateMap.set(year, paidDate);
    });
  }


  const taxTable = document.querySelector("#MainContent_TaxInfo_GridView17");
  if (taxTable) {
    taxTable.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (!tds.length) return;

      const year = tds[0]?.textContent.trim() || "";
      const paidDate = tds[2]?.textContent.trim() || "-";
      const base = utils.formatCurrency(tds[3]?.textContent.trim() || "0");
      const due = utils.formatCurrency(tds[5]?.textContent.trim() || "0");

      data.tax_history.push({
        jurisdiction: "County",
        year,
        payment_type: "",
        status: due !== "$0.00" ? "Unpaid" : "Paid",
        base_amount: base,
        amount_paid: due !== "$0.00" ? "$0.00" : base,
        amount_due: due,
        mailing_date: "N/A",
        due_date: "",
        delq_date: "",
        paid_date: due !== "$0.00" ? "-" : yearWithDateMap.get(year) || paidDate,
        good_through_date: "",
        link: "-",
      });
    });
  }

  const greyRows = document.querySelectorAll(
    "#MainContent_TaxInfo_GridView16 tr[style*='background-color:LightGrey'][style*='font-weight:bold']"
  );

  greyRows.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (!tds.length) return;

    const year = tds[1].textContent.split(" ")[3]?.trim() || "-";
    const base = parseFloat(tds[2]?.textContent.replace(/[$,]/g, "") || 0);
    const due = parseFloat(tds[3]?.textContent.replace(/[$,]/g, "") || 0);
    const paid = parseFloat(tds[4]?.textContent.replace(/[$,]/g, "") || 0);

    const semiBase =
      paid === 0
        ? utils.formatCurrency(base.toFixed(2))
        : utils.formatCurrency((base / 2).toFixed(2));

    data.tax_history.push({
      jurisdiction: "County",
      year,
      payment_type: paid === 0 ? "Annual" : "Semi-Annual",
      status: due === 0 ? "Paid" : "Unpaid",
      base_amount: semiBase,
      amount_paid: utils.formatCurrency(paid.toFixed(2)),
      amount_due: utils.formatCurrency(due.toFixed(2)),
      mailing_date: "N/A",
      due_date: "",
      delq_date: "",
      paid_date: paid === 0 ? "-" : "",
      good_through_date: "",
      link: "-",
    });
  });

  
  const unique = [];
  const seen = new Set();
  for (const h of data.tax_history) {
    const key = `${h.year}-${h.payment_type}-${h.amount_paid}-${h.amount_due}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(h);
    }
  }
  data.tax_history = unique;


  if (data.tax_history.length > 0) {
    const unpaidYears = [
      ...new Set(
        data.tax_history
          .filter((t) => {
            const status = t.status?.toLowerCase() || "";
            const amountDue = t.amount_due?.replace(/[$,]/g, "");
            return (
              status.includes("unpaid") ||
              (!status.includes("paid") && parseFloat(amountDue) > 0)
            );
          })
          .map((t) => Number(t.year))
      ),
    ];

    const allYears = data.tax_history.map((t) => Number(t.year));
    const maxYear = Math.max(...allYears);

    let filtered;
    if (unpaidYears.length > 0) {
      filtered = data.tax_history.filter((t) =>
        unpaidYears.includes(Number(t.year))
      );
    } else {
      filtered = data.tax_history.filter((t) => Number(t.year) === maxYear);
    }


    filtered = filtered.filter((t) => {
      const paid = parseFloat(t.amount_paid?.replace(/[$,]/g, "") || 0);
      const due = parseFloat(t.amount_due?.replace(/[$,]/g, "") || 0);
      return !(paid === 0 && due === 0);
    });

    data.tax_history = filtered;
  }


  const yearCount = new Map();
  data.tax_history.forEach((h) => {
    yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
  });

  data.tax_history.forEach((h) => {
    const count = yearCount.get(h.year);
    if (count === 1) {
      h.payment_type = "Annual";
      h.due_date = `04/30/${h.year}`;
      h.delq_date = `05/01/${h.year}`;
    } else {
      h.payment_type = "Semi-Annual";
      const index = data.tax_history.filter((t) => t.year === h.year).indexOf(h);
      h.due_date = index === 0 ? `04/30/${h.year}` : `10/31/${h.year}`;
      h.delq_date = index === 0 ? `05/01/${h.year}` : `11/01/${h.year}`;
    }
  });


  data.tax_history.sort((a, b) => a.year - b.year);

  if (data.tax_history.length) {
    const maxYear = Math.max(...data.tax_history.map((el) => Number(el.year)));
    const priorUnpaid = data.tax_history.some(
      (el) => Number(el.year) < maxYear && el.status === "Unpaid"
    );

    const hasDelinquent = data.tax_history.some((el) => {
      const dueDate = new Date(el.due_date);
      const isUnpaid =
        el.status.toLowerCase() === "unpaid" || el.amount_paid === "$0.00";
      return isUnpaid && dueDate < new Date();
    });

    data.delinquent = hasDelinquent ? "YES" : "NONE";

    const yearRecs = data.tax_history.filter((el) => Number(el.year) === maxYear);
    const annual = yearRecs.find((r) => r.payment_type === "Annual");

    let first = "",
      second = "";

    if (annual) {
      const status = annual.status === "Paid" ? "PAID" : "UNPAID";
      first = second = status;
    } else {
      yearRecs.forEach((el, i) => {
        const status = el.status === "Paid" ? "PAID" : "UNPAID";
        if (i === 0) first = status;
        if (i === 1) second = status;
      });
    }

    data.notes = `${
      priorUnpaid ? "PRIOR YEARS ARE UNPAID" : "ALL PRIOR YEARS ARE PAID"
    }. ${maxYear}: 1ST INSTALLMENT IS ${first}, 2ND INSTALLMENT IS ${second}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
  }

  return data;
};


const scrapeAccount = async (page, url, account) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input#txtSearch");
  await page.type("input#txtSearch", account);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click("input#ContentPlaceHolder1_btnSearch"),
  ]);

  await page.waitForSelector("#ContentPlaceHolder1_hlParcelInfo1");
  const parcelUrl = await page.$eval("#ContentPlaceHolder1_hlParcelInfo1", (el) => el.href);
  await page.goto(parcelUrl, { waitUntil: "domcontentloaded" });

  return await page.evaluate(extractParcelData);
};


const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  const url = "https://cp.spokanecounty.org/scout/SCOUTDashboard/";

  if (!["html", "api"].includes(fetch_type)) {
    return res.status(400).render("error_data", {
      error: true,
      message: "Invalid Access",
    });
  }

  const browser = await getBrowserInstance();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
  );
  page.setDefaultNavigationTimeout(90000);

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["stylesheet", "font", "image"].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  try {
    const data = await scrapeAccount(page, url, account);
    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (err) {
    const message = err.message || "Record not found";
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message });
    } else {
      res.status(500).json({ error: true, message });
    }
  } finally {
    await context.close();
  }
};

export { search };

