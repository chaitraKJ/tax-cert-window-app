//author -> Harsh Jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const ac_1 = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const data = await page.evaluate(() => {
      const fmt = (num) => `$${Number(num || 0).toFixed(2)}`;
      const parseNum = (str) => Number(str?.replace(/[$,]/g, "") || 0);
      const getText = (el, def = "") => el?.textContent.trim() || def;

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
        taxing_authority: "Kent County Levy Court - 555 Bay Rd Dover, DE 19901",
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      document.querySelectorAll("fieldset").forEach((fieldset) => {
        const legend = fieldset.querySelector("legend")?.textContent;
        if (legend === "Parcel Information") {
          const labelDiv = fieldset.querySelector("div.col-6.pl-0");
          if (labelDiv && labelDiv.textContent.includes("Map Number")) {
            data.parcel_number =
              labelDiv.textContent.replace("Map Number:", "").trim() || "";
          }
        }
        if (legend === "Owner") {
          const nameDiv = fieldset.querySelector(
            "div.col-12 > div.row.ml-2:nth-of-type(2)"
          );
          if (nameDiv) {
            data.owner_name.push(nameDiv.textContent.trim() || "");
          }
        }
        if (legend === "Location Information") {
          const addressDiv = fieldset.querySelector(
            "div.col-12 > div.row.ml-2:nth-of-type(2)"
          );
          if (addressDiv) {
            data.property_address = addressDiv.textContent.trim();
          }
        }
        if (legend === "Assessed Values") {
          const totalDiv = Array.from(
            fieldset.querySelectorAll("div.row.ml-2")
          ).find((div) => div.textContent.includes("Total:"));
          if (totalDiv) {
            let val = totalDiv.textContent.replace("Total:", "").trim();
            data.total_assessed_value = val;
            data.total_taxable_value = val;
          }
        }
      });

      //Tax------History

      const taxTab = document.querySelector("#ui-id-4");
      if (taxTab) {
        taxTab.click();
      } else {
        console.warn("Tax history tab not found");
      }
      setTimeout(() => {}, 10000);

      document.querySelectorAll("fieldset").forEach((fieldset) => {
        const legend = fieldset.querySelector("legend")?.textContent;
        if (legend === "Current Tax Account Information") {
          const getValue = (fieldset, label) => {
            const el = Array.from(fieldset.querySelectorAll("label")).find(
              (l) => l.textContent.trim().startsWith(label)
            );
            if (!el) return "";
            return el.parentElement.textContent
              .replace(el.textContent, "")
              .trim();
          };

          const baseTax = getValue(fieldset, "Base Tax:");
          const totalDue = getValue(fieldset, "Total Due:");
          const link = "";
          const cleanTotalDue =
            totalDue.replace(/Pay Taxes Online/gi, "").trim() || "$0.00";


            if(cleanTotalDue !== "$0.00"){
              data.tax_history.push({
                jurisdiction: "County",
                year: new Date().getFullYear().toString(),
                payment_type: "",
                status: "",
                base_amount: baseTax.replace('-',"") || "$0.00",
                amount_paid: "$0.00",
                amount_due: cleanTotalDue,
                mailing_date: "N/A",
                due_date: "",
                delq_date: "",
                paid_date: "",
                good_through_date: "",
                link,
              });
            }
        }
      });

      const urlToTaxHistory = document.querySelector(
        "iframe[name='TaxBillHistory']"
      ).src;

      return { data, urlToTaxHistory };
    });

    const mainData = data.data;
    await page.goto(data.urlToTaxHistory, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const datawithTaxHistory = await page.evaluate((mainData) => {
      document.querySelectorAll("#thtable tr").forEach((tr, i) => {
        if (i === 0) return; // skip header row

        const tds = tr.querySelectorAll("td");
        if (!tds.length) return;

        const type = tds[1].textContent.trim();
        if (type !== "PAYMENT") return;

        const paidDate = tds[0].textContent.trim();
        const amountPaid = tds[6].textContent.trim();

        let yearPart = paidDate.split("/")[2]?.trim();
        let year = "";
        if (yearPart) {
          const num = parseInt(yearPart);
          year = num < 50 ? `20${yearPart}` : `19${yearPart}`;
        }



        mainData.tax_history.push({
          jurisdiction: "County",
          year,
          payment_type: "",
          status: "",
          base_amount: amountPaid.replace('-',"") ,
          amount_paid: amountPaid.replace('-',"") ,
          amount_due: "$0.00",
          mailing_date: "N/A",
          due_date: "",
          delq_date: "",
          paid_date: paidDate,
          good_through_date: "",
          link: "",
        });
      });

      return mainData;
    }, mainData);

    // ---- Group tax records by year ----
    const yearGroups = new Map();
    datawithTaxHistory.tax_history.forEach((tax) => {
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
    datawithTaxHistory.tax_history = Array.from(yearGroups.values()).flat();

    // ---- Count number of records per year ----
    const yearCount = new Map();
    datawithTaxHistory.tax_history.forEach((h) => {
      yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
    });

    datawithTaxHistory.tax_history.forEach((h) => {
      h.payment_type = "Annual";
      h.due_date = `09/30/${h.year}`;
      h.delq_date = `10/01/${h.year}`; 
    });

    if (datawithTaxHistory.tax_history.length > 0) {
      const today = new Date();

      const maxYear = Math.max(
        ...datawithTaxHistory.tax_history.map((el) => Number(el.year))
      );

      // Update each record's final status
      // FIX: Changed from data.tax_history to datawithTaxHistory.tax_history
      datawithTaxHistory.tax_history = datawithTaxHistory.tax_history.map(
        (el) => {
          const paid =
            el.status.toLowerCase() === "paid" || el.amount_paid !== "$0.00";
          const dueDate = el.due_date ? new Date(el.due_date) : null;
          const delqDate = el.delq_date ? new Date(el.delq_date) : null;

          if (paid) el.status = "Paid";
          else if (dueDate && today < dueDate) el.status = "Due";
          else if (delqDate && today > delqDate) el.status = "Delinquent";
          else el.status = " ";

          return el;
        }
      );

      datawithTaxHistory.tax_history.sort((a, b) => {
        if (Number(a.year) !== Number(b.year)) {
          return Number(a.year) - Number(b.year);
        }

        const da = new Date(a.due_date || "01/01/1900");
        const db = new Date(b.due_date || "01/01/1900");

        return da - db;
      });

      // Keep latest year and any unpaid prior years
      datawithTaxHistory.tax_history = datawithTaxHistory.tax_history.filter(
        (el) => {
          if (Number(el.year) === maxYear) return true;
          return datawithTaxHistory.tax_history.some(
            (r) => r.year === el.year && r.status !== "Paid"
          );
        }
      );

      // ---- Mark delinquent status ----
      const hasDelinquent = datawithTaxHistory.tax_history.some(
        (el) => el.status === "Delinquent"
      );
      datawithTaxHistory.delinquent = hasDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";

      // ---- Prepare summary notes ----
      const priorUnpaid = datawithTaxHistory.tax_history.some(
        (el) => Number(el.year) < maxYear && el.status !== "Paid"
      );

      const maxYearRecords = datawithTaxHistory.tax_history.filter(
        (el) => Number(el.year) === maxYear
      );

      // Kent County has annual payments only
      if (maxYearRecords.length > 0) {
        datawithTaxHistory.notes = `${
          priorUnpaid
            ? "PRIOR YEARS ARE DELINQUENT"
            : "ALL PRIOR YEARS ARE PAID"
        }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 09/30.`;
      }
    }

    return datawithTaxHistory;
  } catch (error) {
    console.error("Scraping failed:", error.message);
    // throw new Error("Record not found");
    throw new Error(error.message);
  }
};

const account_search = (page, url) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url)
      .then((datawithTaxHistory) => {
        resolve(datawithTaxHistory);
      })
      .catch((error) => reject(error));
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  if (!account) {
    return res.status(400).render("error_data", {
      error: true,
      message: "Account number is required",
    });
  }

  if (!["html", "api"].includes(fetch_type)) {
    return res.status(400).render("error_data", {
      error: true,
      message: "Invalid Access",
    });
  }

  const formatAccount = (acct) => {
    const parts = acct.split("-");
    if (parts.length < 6) return acct;
    const [a, b, c, d, e, f] = parts;
    return `${a} ${b} ${c} ${d} ${e} ${f.slice(0, 3)}`;
  };

  const formattedAccount = formatAccount(account);
  const rawUrl = `https://pride.kentcountyde.gov/propertysearch/propertyinfopanel/${formattedAccount}/`;
  const url = encodeURI(rawUrl);
  // encode spaces safely to %20

  const browser = await getBrowserInstance();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  page.setDefaultNavigationTimeout(90000);

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["stylesheet", "font", "image"].includes(req.resourceType()))
      req.abort();
    else req.continue();
  });

  try {
    const data = await account_search(page, url);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (err) {
    console.error("Scraping error:", err);
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

module.exports = { search };