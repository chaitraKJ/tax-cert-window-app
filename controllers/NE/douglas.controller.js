// Author : Dhanush
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Helper function to clean text
const clean = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

// Initialize common data structure
const initData = (propertyData, total_taxable) => ({
  processed_date: new Date().toISOString().slice(0, 10),
  order_number: "",
  borrower_name: "",
  owner_name: propertyData.owner_name.length ? propertyData.owner_name : [""],
  property_address: propertyData.property_address || "",
  parcel_number: propertyData.parcel_number || "",
  land_value: propertyData.land_value || "",
  improvements: propertyData.improvements || "",
  total_assessed_value: total_taxable || "",
  exemption: propertyData.exemption || "",
  total_taxable_value: total_taxable || "",
  taxing_authority: "Douglas County Treasurer, 1819 Farnam St H-02, Omaha, NE 68183, Ph: (402) 444-7082",
  notes: "",
  delinquent: "NONE",
  tax_history: []
});

// Step 1: Navigate to tax info page and extract payment data
const dc_1 = async (page, account) => {
  try {
    if (!account) throw new Error("Account number is required");
    const url = `https://payments.dctreasurer.org/taxinfo.xhtml?parc=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForSelector("table", { timeout: 20000 }).catch(() => {
      throw new Error("Table selector not found");
    });

    const pageContent = await page.content();
    if (pageContent.includes("No records found") || pageContent.includes("Invalid")) {
      throw new Error("Record does not exist");
    }

    return await page.evaluate(() => {
      const clean = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

      let currentTaxAmount = "$0.00";
      let currentTaxYear = "";
      let total_taxable = "";
      const taxInfoRows = document.querySelectorAll("table tbody tr");

      for (const row of taxInfoRows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length >= 2) {
          const label = clean(cells[0]?.textContent || "");
          if (label.includes("Tax Amount:")) {
            currentTaxAmount = clean(cells[1]?.textContent || "$0.00");
          }
          if (label.includes("Tax Information for")) {
            const yearSpan = row.querySelector('span:nth-of-type(2)');
            if (yearSpan) {
              const yearText = clean(yearSpan.textContent);
              const match = yearText.match(/\d{4}/);
              if (match) currentTaxYear = match[0];
            } else {
              const text = clean(row.textContent);
              const match = text.match(/\d{4}/);
              if (match) currentTaxYear = match[0];
            }
          }
          if (label.includes("Taxable Value:")) {
            total_taxable = clean(cells[1]?.textContent || "$0.00");
          }
        }
      }

      if (!currentTaxYear || isNaN(parseInt(currentTaxYear))) {
        currentTaxYear = (new Date().getFullYear() - 1).toString();
      }

      const payments = [];
      const historyRows = document.querySelectorAll("#payHist table tbody tr");
      let lastTaxYear = "";

      for (const row of historyRows) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 7) {
          let taxYear = clean(cells[0]?.textContent);
          const taxAmount = clean(cells[1]?.textContent);
          let datePosted = clean(cells[2]?.textContent).replace(/-/g, '/');
          const principal = clean(cells[3]?.textContent);
          const interest = clean(cells[4]?.textContent);
          const advertising = clean(cells[5]?.textContent);
          const total = clean(cells[6]?.textContent);

          if (!taxYear && lastTaxYear) {
            taxYear = lastTaxYear;
          } else if (taxYear) {
            lastTaxYear = taxYear;
          }

          if (taxYear && datePosted) {
            const parsedDate = new Date(datePosted.slice(6,10) + '-' + datePosted.slice(0,2) + '-' + datePosted.slice(3,5));
            if (parsedDate > new Date()) continue;
            payments.push({
              taxYear,
              taxAmount,
              datePosted,
              principal,
              interest,
              advertising,
              total
            });
          }
        }
      }

      return { currentTaxYear, currentTaxAmount, total_taxable, payments };
    });
  } catch (error) {
    throw new Error(`Error in dc_1: ${error.message}`);
  }
};

// Step 2: Navigate to Beacon site and extract property details
const dc_2 = async (page, account) => {
  try {
    if (!account) throw new Error("Account number is required");
    const url = `https://beacon.schneidercorp.com/Application.aspx?App=DouglasCountyNE&PageTypeID=4&searchparcelid=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    try {
      const agreeBtn = await page.waitForSelector(".modal.in .btn.btn-primary.button-1", { timeout: 5000 });
      if (agreeBtn) {
        await agreeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // Disclaimer may not appear, continue
    }

    await page.waitForSelector("#ctlBodyPane_ctl01_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue", { timeout: 20000 }).catch(() => {
      throw new Error("Property data selector not found");
    });

    return await page.evaluate(() => {
      const clean = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

      const data = {
        parcel_number: "",
        property_address: "",
        owner_name: [],
        legal_description: ""
      };

      const parcelEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl00_pnlSingleValue span");
      if (parcelEl) data.parcel_number = clean(parcelEl.textContent);

      const addressEl = document.querySelector("#ctlBodyPane_ctl01_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl02_pnlSingleValue span");
      if (addressEl) data.property_address = clean(addressEl.textContent);

      const legalEl = document.querySelector("#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_rptrDynamicColumns_ctl03_pnlSingleValue span");
      if (legalEl) data.legal_description = clean(legalEl.textContent);

      const ownerLinks = document.querySelectorAll("#ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lnkSearch, #ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName2_lnkUpmSearchLinkSuppressed_lnkSearch, #ctlBodyPane_ctl02_ctl01_rptOwner_ctl00_sprOwnerName1_lnkUpmSearchLinkSuppressed_lblSearch");
      ownerLinks.forEach(link => {
        const name = clean(link.textContent);
        if (name) data.owner_name.push(name);
      });

      return data;
    });
  } catch (error) {
    throw new Error(`Error in dc_2: ${error.message}`);
  }
};

// Step 3: Process paid status for current year
const dc_paid = async (taxData, propertyData) => {
  try {
    const currentTaxYear = parseInt(taxData.currentTaxYear, 10);
    if (isNaN(currentTaxYear)) throw new Error("Invalid current tax year");
    const total_taxable = taxData.total_taxable;
    const currentTaxAmount = parseFloat(taxData.currentTaxAmount.replace(/[^0-9.-]+/g, '')) || 0;

    const data = initData(propertyData, total_taxable);
    const currentYearPayments = taxData.payments.filter(p => parseInt(p.taxYear) === currentTaxYear);

    let isSemiAnnual = false;
    if (currentYearPayments.length === 1) {
      const paymentTotal = parseFloat(currentYearPayments[0].total.replace(/[^0-9.-]+/g, '')) || 0;
      isSemiAnnual = paymentTotal < currentTaxAmount * 0.75;
    } else if (currentYearPayments.length >= 2) {
      isSemiAnnual = true;
    }

    currentYearPayments.sort((a, b) => {
      const dateA = a.datePosted ? new Date(a.datePosted.slice(6,10) + '-' + a.datePosted.slice(0,2) + '-' + a.datePosted.slice(3,5)) : new Date(0);
      const dateB = b.datePosted ? new Date(b.datePosted.slice(6,10) + '-' + b.datePosted.slice(0,2) + '-' + b.datePosted.slice(3,5)) : new Date(0);
      return dateA - dateB;
    });

    currentYearPayments.forEach((payment, payIdx) => {
      const installment = isSemiAnnual ? (payIdx === 0 ? "Installment #1" : "Installment #2") : "Annual";
      let dueDate = isSemiAnnual && installment === "Installment #1" ? new Date(currentTaxYear + 1, 2, 31) : new Date(currentTaxYear + 1, 6, 31);

      if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
      else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);

      const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
      const delqDate = new Date(dueDate);
      delqDate.setDate(delqDate.getDate() + 1);

      data.tax_history.push({
        jurisdiction: "County",
        year: currentTaxYear.toString(),
        payment_type: installment,
        status: "Paid",
        base_amount: payment.principal || payment.taxAmount || "",
        amount_paid: payment.total || payment.principal || "",
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: fmt(dueDate),
        delq_date: fmt(delqDate),
        paid_date: payment.datePosted || "",
        good_through_date: ""
      });
    });

    data.notes = `ALL PRIORS ARE PAID, ${currentTaxYear} TAXES ARE PAID IN ${isSemiAnnual ? 'SEMI-ANNUALLY, 1ST INSTALLMENT IS PAID AND 2ND INSTALLMENT IS PAID' : 'ANNUAL PAYMENT'}. NORMAL DUE DATES ARE ${isSemiAnnual ? '03/31 & 07/31' : '07/31'}.`;
    return data;
  } catch (error) {
    throw new Error(`Error in dc_paid: ${error.message}`);
  }
};
// Calculate tax status function
const calculateTaxStatus = (taxHistory, currentDate = new Date()) => {
  return taxHistory.map((item) => {
    if (item.status === "Paid") {
      return { ...item, status: "Paid", delinquent: "NONE" };
    }

    const dueParts = item.due_date ? item.due_date.split("/") : null;
    const delqParts = item.delq_date ? item.delq_date.split("/") : null;

    let dueDate = null;
    let delqDate = null;

    if (dueParts && dueParts.length === 3) {
      const [mm, dd, yyyy] = dueParts.map(Number);
      dueDate = new Date(yyyy, mm - 1, dd);
    }

    if (delqParts && delqParts.length === 3) {
      const [mm, dd, yyyy] = delqParts.map(Number);
      delqDate = new Date(yyyy, mm - 1, dd);
    }

    if (!dueDate || isNaN(dueDate.getTime())) {
      return { ...item, status: "Unpaid", delinquent: "NONE" };
    }

    if (!delqDate || isNaN(delqDate.getTime())) {
      delqDate = new Date(dueDate);
      delqDate.setDate(delqDate.getDate() + 1);
    }

   if (delqDate > currentDate) {
      return { ...item, status: "Due", delinquent: "NONE" };
    } else {
      return { ...item, status: "Delinquent", delinquent: "YES" };
    }
  });
};

// Step 4: Process unpaid or partially paid status for current year
const dc_unpaid = async (page, taxData, propertyData) => {
  try {
    const currentTaxYear = parseInt(taxData.currentTaxYear, 10);
    if (isNaN(currentTaxYear)) throw new Error("Invalid current tax year");
    const total_taxable = taxData.total_taxable;

    const data = initData(propertyData, total_taxable);

    const paymentUrl = `https://payments.dctreasurer.org/pay1.xhtml?parc=${propertyData.parcel_number}`;
    await page.goto(paymentUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    const unpaidData = await page.evaluate(() => {
      const clean = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
      const unpaid = [];

      const rows = document.querySelectorAll("#paymentTable table tbody tr");
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 6) {
          const paymentType = clean(cells[0]?.textContent || "");
          const principal = clean(cells[1]?.textContent || "");
          const interest = clean(cells[2]?.textContent || "");
          const advertising = clean(cells[3]?.textContent || "");
          const paymentAmount = clean(cells[4]?.textContent || "");

          if (
            paymentType &&
            paymentAmount &&
            !(principal === "$0.00" && interest === "$0.00" && advertising === "$0.00")
          ) {
            unpaid.push({
              paymentType,
              principal,
              interest,
              advertising,
              paymentAmount
            });
          }
        }
      });

      return unpaid;
    });

    const currentYearPayments = taxData.payments.filter(p => 
      parseInt(p.taxYear) === currentTaxYear &&
      !(p.principal === "$0.00" && p.interest === "$0.00" && p.advertising === "$0.00")
    );
    const currentYearUnpaid = unpaidData.filter(u => {
      const match = u.paymentType.match(/(\d{4})/);
      return match && parseInt(match[1]) === currentTaxYear;
    });

    const isFullyUnpaid = currentYearPayments.length === 0 && currentYearUnpaid.length >= 1;

    if (isFullyUnpaid && currentYearUnpaid.length === 1) {
      let dueDate = new Date(currentTaxYear + 1, 6, 31);
      if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
      else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);

      const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
      const delqDate = new Date(dueDate);
      delqDate.setDate(delqDate.getDate() + 1);

      const totalAmountDue = currentYearUnpaid.reduce((sum, u) => 
        sum + parseFloat(u.paymentAmount.replace(/[^0-9.-]+/g, '')) || 0, 0
      );
      const formattedAmountDue = totalAmountDue > 0 ? `$${totalAmountDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : taxData.currentTaxAmount;

      data.tax_history.push({
        jurisdiction: "County",
        year: currentTaxYear.toString(),
        payment_type: "Annual",
        status: "Unpaid", // Initial status, will be updated by calculateTaxStatus
        base_amount: taxData.currentTaxAmount || "",
        amount_paid: "$0.00",
        amount_due: formattedAmountDue,
        mailing_date: "N/A",
        due_date: fmt(dueDate),
        delq_date: fmt(delqDate),
        paid_date: "-",
        good_through_date: ""
      });
    } else {
      const baseInstallmentAmount = `$${(parseFloat(taxData.currentTaxAmount.replace(/[^0-9.-]+/g, '')) / 2).toFixed(2)}`;

      currentYearPayments.sort((a, b) => {
        const dateA = a.datePosted ? new Date(a.datePosted.slice(6,10) + '-' + a.datePosted.slice(0,2) + '-' + a.datePosted.slice(3,5)) : new Date(0);
        const dateB = b.datePosted ? new Date(b.datePosted.slice(6,10) + '-' + b.datePosted.slice(0,2) + '-' + b.datePosted.slice(3,5)) : new Date(0);
        return dateA - dateB;
      });

      currentYearPayments.forEach((payment, idx) => {
        const installment = idx === 0 ? "Installment #1" : "Installment #2";
        let dueDate = installment === "Installment #1" ? new Date(currentTaxYear + 1, 2, 31) : new Date(currentTaxYear + 1, 6, 31);

        if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
        else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);

        const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        const delqDate = new Date(dueDate);
        delqDate.setDate(delqDate.getDate() + 1);

        data.tax_history.push({
          jurisdiction: "County",
          year: currentTaxYear.toString(),
          payment_type: installment,
          status: "Paid",
          base_amount: payment.principal || baseInstallmentAmount,
          amount_paid: payment.total || payment.principal || baseInstallmentAmount,
          amount_due: "$0.00",
          mailing_date: "N/A",
          due_date: fmt(dueDate),
          delq_date: fmt(delqDate),
          paid_date: payment.datePosted || "NONE",
          good_through_date: ""
        });
      });

      currentYearUnpaid.forEach(unpaid => {
        const isFirstHalf = unpaid.paymentType.toLowerCase().includes("1st") || 
                           unpaid.paymentType.toLowerCase().includes("first");
        const installment = isFirstHalf ? "Installment #1" : "Installment #2";
        let dueDate = isFirstHalf ? new Date(currentTaxYear + 1, 2, 31) : new Date(currentTaxYear + 1, 6, 31);

        if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
        else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);

        const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        const delqDate = new Date(dueDate);
        delqDate.setDate(delqDate.getDate() + 1);

        data.tax_history.push({
          jurisdiction: "County",
          year: currentTaxYear.toString(),
          payment_type: installment,
          status: "Unpaid", // Initial status, will be updated by calculateTaxStatus
          base_amount: unpaid.principal || baseInstallmentAmount,
          amount_paid: "$0.00",
          amount_due: unpaid.paymentAmount || baseInstallmentAmount,
          mailing_date: "N/A",
          due_date: fmt(dueDate),
          delq_date: fmt(delqDate),
          paid_date: "-",
          good_through_date: ""
        });
      });

      const hasFirst = data.tax_history.some(h => h.payment_type === "Installment #1");
      const hasSecond = data.tax_history.some(h => h.payment_type === "Installment #2");

      if (!hasFirst) {
        let dueDate = new Date(currentTaxYear + 1, 2, 31);
        if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
        else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);
        const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        const delqDate = new Date(dueDate);
        delqDate.setDate(delqDate.getDate() + 1);

        data.tax_history.push({
          jurisdiction: "County",
          year: currentTaxYear.toString(),
          payment_type: "Installment #1",
          status: "Unpaid", // Initial status, will be updated by calculateTaxStatus
          base_amount: baseInstallmentAmount,
          amount_paid: "$0.00",
          amount_due: baseInstallmentAmount,
          mailing_date: "N/A",
          due_date: fmt(dueDate),
          delq_date: fmt(delqDate),
          paid_date: "-",
          good_through_date: ""
        });
      }

      if (!hasSecond) {
        let dueDate = new Date(currentTaxYear + 1, 6, 31);
        if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);
        else if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);
        const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        const delqDate = new Date(dueDate);
        delqDate.setDate(delqDate.getDate() + 1);

        data.tax_history.push({
          jurisdiction: "County",
          year: currentTaxYear.toString(),
          payment_type: "Installment #2",
          status: "Unpaid", // Initial status, will be updated by calculateTaxStatus
          base_amount: baseInstallmentAmount,
          amount_paid: "$0.00",
          amount_due: baseInstallmentAmount,
          mailing_date: "N/A",
          due_date: fmt(dueDate),
          delq_date: fmt(delqDate),
          paid_date: "-",
          good_through_date: ""
        });
      }
    }

    // Sort tax_history by payment_type
    data.tax_history.sort((a, b) => a.payment_type.localeCompare(b.payment_type));

    // Apply calculateTaxStatus to update status and delinquent fields
    data.tax_history = calculateTaxStatus(data.tax_history);

    // Determine overall delinquent status
    data.delinquent = data.tax_history.some(h => h.delinquent === "YES") ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

    // Update notes based on updated tax_history
    const currentYearHistory = data.tax_history.filter(p => parseInt(p.year) === currentTaxYear);
    const first = currentYearHistory.find(p => p.payment_type === "Installment #1") || { status: "Unpaid" };
    const second = currentYearHistory.find(p => p.payment_type === "Installment #2") || { status: "Unpaid" };

    let currentNote = `${currentTaxYear} `;
    if (isFullyUnpaid && currentYearUnpaid.length === 1) {
      currentNote += `TAXES ARE ${data.tax_history[0].status.toUpperCase()}`;
    } else {
      if (first.status === "Paid" && second.status === "Paid") {
        currentNote += "1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS PAID";
      } else if (first.status === "Paid" && second.status !== "Paid") {
        currentNote += `1ST INSTALLMENT IS PAID, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
      } else if (first.status !== "Paid" && second.status === "Paid") {
        currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS PAID`;
      } else {
        currentNote += `1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}`;
      }
    }

    currentNote += `. NORMALLY TAXES ARE PAID IN ${isFullyUnpaid && currentYearUnpaid.length === 1 ? 'ANNUAL' : 'SEMI-ANNUAL'}, NORMAL DUE DATES ARE ${isFullyUnpaid && currentYearUnpaid.length === 1 ? '07/31' : '03/31 & 07/31'}.`;
    data.notes = `ALL PRIORS ARE PAID, ${currentNote}`;

    return data;
  } catch (error) {
    throw new Error(`Error in dc_unpaid: ${error.message}`);
  }
};

// Optimized account search function
const account_search = async (page, account) => {
  try {
    const taxData = await dc_1(page, account);
    const propertyData = await dc_2(page, account);

    const currentTaxYear = parseInt(taxData.currentTaxYear, 10);
    if (isNaN(currentTaxYear)) throw new Error("Invalid current tax year");

    const currentYearPayments = taxData.payments.filter(p => parseInt(p.taxYear) === currentTaxYear);
    const taxAmount = parseFloat(taxData.currentTaxAmount.replace(/[^0-9.-]+/g, ''));
    const paidAmount = currentYearPayments.reduce((sum, p) => sum + parseFloat(p.total.replace(/[^0-9.-]+/g, '')) || 0, 0);

    const isPaid = paidAmount >= taxAmount * 0.99;
    return isPaid ? await dc_paid(taxData, propertyData) : await dc_unpaid(page, taxData, propertyData);
  } catch (error) {
    throw new Error(`Error in account_search: ${error.message}`);
  }
};

// Main search function (Express route handler)
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  try {
    if (!account) {
      return res.status(400).json({ error: true, message: "Account number is required" });
    }
    if (fetch_type !== "html" && fetch_type !== "api") {
      return res.status(400).json({ error: true, message: "Invalid fetch_type" });
    }

    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    page.setDefaultNavigationTimeout(90000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["stylesheet", "font", "image"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    try {
      const data = await account_search(page, account);
      if (fetch_type === "html") {
        res.status(200).render("parcel_data_official", data);
      } else {
        res.status(200).json({ result: data });
      }
    } catch (error) {
      if (fetch_type === "html") {
        res.status(200).render("error_data", { error: true, message: error.message });
      } else {
        res.status(500).json({ error: true, message: error.message });
      }
    } finally {
      await context.close();
    }
  } catch (error) {
    if (fetch_type === "html") {
      res.status(200).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };