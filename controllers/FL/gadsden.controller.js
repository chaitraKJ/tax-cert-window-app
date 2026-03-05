// Author --> Harsh Jha 

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import { getOHCompanyYears } from "../../utils/configs/OH.config.js";

const timeout_option = { timeout: 90000 };

// Fetches detail page URL after searching account
const get_detail_url = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.waitForSelector("input[title='Account Number']", timeout_option);
      await page.click("input[title='Account Number']", { clickCount: 3 });
      await page.type("input[title='Account Number']", account.trim());

      await Promise.all([
        page.click("button[title='Search']"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);

      await page.waitForSelector(".k-button-icontext.k-button.k-primary", timeout_option);

      await Promise.all([
        page.click(".k-button-icontext.k-button.k-primary"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);

      resolve(page.url());
    } catch (error) {
      console.log("Error in get_detail_url:", error.message);
      reject(new Error("Record Not Found"));
    }
  });
};

// all extraction
const ac_1 = async (page, detailLink) => {
  return new Promise(async (resolve, reject) => {
    try {
      //  Wait for all selectors in parallel
      await Promise.all([
        page.waitForSelector(".breakRow", timeout_option),
        page.waitForSelector(".public-access-payment-bill-module", timeout_option),
        page.waitForSelector("payment-bill-group", timeout_option),
      ]);

      //  Expand all sections first
      await page.evaluate(() => {
        const sectionHeaders = document.querySelectorAll(".bill-collapse-button");
        sectionHeaders.forEach((header) => {
          const icon = header.querySelector(".bento-expand-icon");
          if (icon && icon.classList.contains("bento-icon-plus-plain")) {
            header.click();
          }
        });
      });

      // Wait for expanded content to appear
      await page.waitForSelector("payment-bill-grid table", { timeout: 10000 }).catch(() => {
        console.log("No payment grids found after section expansion");
      });

      // Expand all bill group cards
      await page.evaluate(() => {
        const billGroups = document.querySelectorAll("payment-bill-group");
        billGroups.forEach((group) => {
          const cardButton = group.querySelector("button.card");
          if (cardButton && !cardButton.classList.contains("expanded-card")) {
            cardButton.click();
          }
        });
      });

      // Wait for card details to be visible
      await page.waitForFunction(
        () => {
          const cards = document.querySelectorAll("payment-bill-group button.card");
          if (cards.length === 0) return true;
          const expandedCards = document.querySelectorAll("payment-bill-group button.card.expanded-card");
          return expandedCards.length > 0;
        },
        { timeout: 5000 }
      ).catch(() => console.log("Cards may not have expanded fully"));

      // Extract all data in ONE evaluate call
      const result = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toISOString().split("T")[0], 
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "N/A",
          exemption: "",
          total_taxable_value: "N/A",
          taxing_authority: "The Gadsden County Tax Collector's Office, PO Box 817, Quincy, FL 32353",
          notes: "",
          delinquent: "",
          tax_history: [],
        };

        // Extract basic info
        document.querySelectorAll(".breakRow").forEach((span) => {
          const label = span.textContent.trim();
          const value = span.nextElementSibling?.nextElementSibling?.textContent?.trim() || "";
          if (label === "Account Number:") data.parcel_number = value;
          if (label === "Property Address:") data.property_address = value;
          if (label === "Mailing Address:") data.owner_name.push(value);
        });

        // Extract tax history
        let max_year = 0;
        const year_map = {};

        const get_tax_dates = (year, isPaid) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const fmt = (d) =>
            `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
          const dueDate = new Date(parseInt(year), 2, 31);
          const delqDate = new Date(parseInt(year), 3, 1);
          const status = isPaid ? "Paid" : today < delqDate ? "Due" : "Delinquent";
          return { due_date: fmt(dueDate), delq_date: fmt(delqDate), status };
        };

        const billGroups = document.querySelectorAll(".public-access-payment-bill-module payment-bill-group");

        billGroups.forEach((group) => {
          const tileHeader = group.querySelector(".tile-header");
          if (!tileHeader) return;

          const yearSpan = tileHeader.querySelector(".tile-header__value");
          if (!yearSpan) return;

          const year = yearSpan.textContent.trim();
          if (!/^[0-9]{4}$/.test(year)) return;

          if (!year_map[year]) year_map[year] = [];
          max_year = Math.max(max_year, parseInt(year));

          const groupButton = group.querySelector("button");
          let isPaid = false, isPastDue = false;

          if (groupButton) {
            if (groupButton.classList.contains("dark-grey-expand")) isPaid = true;
            else if (groupButton.classList.contains("red-expand")) isPastDue = true;
          }

          const statusText = tileHeader.textContent.toLowerCase();
          if (statusText.includes("paid")) isPaid = true;
          if (statusText.includes("past due") || statusText.includes("delinquent")) isPastDue = true;

          let gridTable = group.nextElementSibling?.querySelector("payment-bill-grid table");
          if (!gridTable) {
            const parentContent = group.closest(".mb-4");
            if (parentContent) gridTable = parentContent.querySelector("payment-bill-grid table");
          }
          if (!gridTable) return;

          const rows = gridTable.querySelectorAll("tbody tr");

          rows.forEach((row, idx) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 4) return;

            let statusCell, taxesCharges, amountDue, paidAmount;

            if (cells.length === 5) {
              statusCell = cells[0].textContent.trim();
              taxesCharges = cells[2].querySelector("b")?.textContent.trim() || "$0.00";
              amountDue = cells[3].querySelector("b")?.textContent.trim() || "$0.00";
              paidAmount = cells[4].textContent.trim();
            } else {
              statusCell = cells[0].textContent.trim();
              taxesCharges = cells[1].querySelector("b")?.textContent.trim() || "$0.00";
              amountDue = cells[2].querySelector("b")?.textContent.trim() || "$0.00";
              paidAmount = cells[3].textContent.trim();
            }

            let finalStatus = "Due";
            if (isPaid || statusCell.toLowerCase().includes("paid")) finalStatus = "Paid";
            else if (isPastDue || statusCell.toLowerCase().includes("past due")) finalStatus = "Delinquent";

            const paymentType = rows.length === 1 ? "Annual" : idx === 0 ? "Installment 1" : "Installment 2";
            const { due_date, delq_date } = get_tax_dates(year, finalStatus === "Paid");

            year_map[year].push({
              jurisdiction: "County",
              year,
              payment_type: paymentType,
              status: finalStatus,
              base_amount: taxesCharges,
              amount_paid: finalStatus === "Paid" ? paidAmount : "$0.00",
              amount_due: finalStatus === "Paid" ? "$0.00" : amountDue || taxesCharges,
              mailing_date: "N/A",
              due_date,
              delq_date,
              paid_date: "",
              good_through_date: "",
              link: "",
            });
          });
        });

        // Extract payment history
        const paidDates = {};
        const fmt = (d) =>
          `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
        const historyTable = document.querySelector('[moduleid="621"] table tbody');

        if (historyTable) {
          const rows = historyTable.querySelectorAll("tr");
          rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 6) return;

            const year = cells[0].querySelector("span")?.textContent.trim();
            const datePaidRaw = cells[2].querySelector("span")?.textContent.trim();
            const amountPaid = cells[5].querySelector("span")?.textContent.trim() || "$0.00";

            if (year && datePaidRaw) {
              const cleaned = datePaidRaw.replace(/\s+\d.*$/, "");
              const parsed = new Date(cleaned);
              const finalDate = isNaN(parsed.getTime()) ? datePaidRaw : fmt(parsed);
              paidDates[year] = { paid_date: finalDate, amount_paid: amountPaid };
            }
          });
        }

        // Merge paid dates
        for (let year in year_map) {
          if (paidDates[year]) {
            year_map[year].forEach((r) => {
              if (r.status === "Paid") {
                r.paid_date = paidDates[year].paid_date;
                r.amount_paid = paidDates[year].amount_paid;
              }
            });
          }
        }

        return { data, year_map, max_year };
      });

      resolve(result);
    } catch (error) {
      console.error("❌ ERROR in ac_1:", error);
      reject(error);
    }
  });
};

// Processes combined history into final formatted output
const ac_2 = (main_data, yearsRequested = 1) => {
  return new Promise((resolve, reject) => {
    try {
      const data = main_data.data;
      const year_map = main_data.year_map;
      const max_year = main_data.max_year;

      let tax_history = [];
      const allYears = Object.keys(year_map).sort((a, b) => b - a);

      // Flatten year_map into tax_history
      for (let year of allYears) {
        const maps = year_map[year];
        if (maps.length === 1) {
          maps[0].payment_type = "Annual";
          tax_history.push(maps[0]);
        } else {
          maps.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
          tax_history.push(...maps);
        }
      }

      // --- COMMON FILTERING LOGIC START ---
      if (tax_history.length > 0) {
        // Identify unique years in descending order
        const uniqueYears = [...new Set(tax_history.map((h) => h.year))];
        const topYears = uniqueYears.slice(0, yearsRequested);

        // Filter for requested years OR unpaid/delinquent records
        tax_history = tax_history.filter((record) => {
          const isTopYear = topYears.includes(record.year);
          const statusLower = record.status.toLowerCase();
          const isUnpaid =
            statusLower === "unpaid" ||
            statusLower === "due" ||
            statusLower === "delinquent";
          return isTopYear || isUnpaid;
        });
      }
      // --- COMMON FILTERING LOGIC END ---

      data.tax_history = tax_history;

      // Calculate delinquent status and notes
      const delinquentYears = [...new Set(tax_history
        .filter(h => h.status.toLowerCase() === "delinquent")
        .map(h => h.year))].sort((a, b) => b - a);
      
      const dueYears = [...new Set(tax_history
        .filter(h => h.status.toLowerCase() === "due")
        .map(h => h.year))].sort((a, b) => b - a);

      data.delinquent = delinquentYears.length > 0
        ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
        : "NONE";

      const latestYear = allYears[0] || "N/A";
      const latestYearRecords = tax_history.filter(h => h.year === latestYear);
      
      const priorDelinquentYears = delinquentYears.filter(y => y !== latestYear);
      const priorDueYears = dueYears.filter(y => y !== latestYear);
      const allPriorUnpaid = [...new Set([...priorDelinquentYears, ...priorDueYears])].sort((a, b) => b - a);

      let priorNote = allPriorUnpaid.length > 0
        ? `PRIOR YEARS (${allPriorUnpaid.join(", ")}) ARE UNPAID, `
        : "ALL PRIOR YEARS ARE PAID, ";

      let currentNote = "";
      if (latestYearRecords.length > 0) {
        if (latestYearRecords.length === 1) {
          currentNote = `${latestYear} ANNUAL TAX STATUS IS ${latestYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS ${latestYearRecords[0].due_date}.`;
        } else {
          const inst1 = latestYearRecords[0];
          const inst2 = latestYearRecords[1];
          currentNote = `${latestYear} 1ST INSTALLMENT IS ${inst1.status.toUpperCase()}, 2ND INSTALLMENT IS ${inst2 ? inst2.status.toUpperCase() : "N/A"}, NORMAL DUE DATES ARE 12/10 AND 04/10.`;
        }
      } else {
        currentNote = `NO CURRENT YEAR (${latestYear}) DATA FOUND.`;
      }

      data.notes = priorNote + currentNote;

      resolve(data);
    } catch (error) {
      console.error("❌ ERROR in ac_2:", error);
      reject(error);
    }
  });
};

const account_search = async (page, url, account, yearsRequested = 1) => {
  return new Promise(async (resolve, reject) => {
    try {
      get_detail_url(page, url, account)
        .then((detailLink) => ac_1(page, detailLink))
        .then((data1) => ac_2(data1, yearsRequested))
        .then((data2) => resolve(data2))
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

//cleanup and resource management
const search = async (req, res) => {
  const { fetch_type, account, client } = req.body;
  let context = null;
  let page = null;
  
  try {
    const url = "https://fl-gadsden.publicaccessnow.com/TaxCollector/PropertyTaxSearch.aspx";

    if (!account || account.trim() === "") {
      return res.status(400).json({ message: "Please enter a valid account number" });
    }

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(400).json({ error: true, message: "Invalid Access" });
    }

    // Identify years requested based on client
    const yearsRequested = getOHCompanyYears(client);

    const browser = await getBrowserInstance();
    context = await browser.createBrowserContext();
    page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(30000);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (resourceType === "font" || resourceType === "image" || resourceType === "stylesheet") {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (fetch_type === "html") {
      account_search(page, url, account, yearsRequested)
        .then((data) => res.status(200).render("parcel_data_official", data))
        .catch((error) => {
          console.log(error);
          res.status(500).render("error_data", {
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          if (page) {
            try {
              page.removeAllListeners();
              await page.close();
            } catch (e) {
              console.error("Failed to close page:", e);
            }
          }
          if (context) {
            try {
              await context.close();
            } catch (e) {
              console.error("Failed to close context:", e);
            }
          }
        });
    } else if (fetch_type === "api") {
      account_search(page, url, account, yearsRequested)
        .then((data) => {
          res.status(200).json({ result: data });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            error: true,
            message: error.message,
          });
        })
        .finally(async () => {
          if (page) {
            try {
              page.removeAllListeners();
              await page.close();
            } catch (e) {
              console.error("Failed to close page:", e);
            }
          }
          if (context) {
            try {
              await context.close();
            } catch (e) {
              console.error("Failed to close context:", e);
            }
          }
        });
    }

  } catch (error) {
    console.log(error);
    if (fetch_type === "html") {
      res.status(500).render("error_data", { error: true, message: error.message });
    } else {
      res.status(500).json({ error: true, message: error.message });
    }
  }
};

export { search };