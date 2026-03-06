//author: Harsh jha
const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

// Puppeteer timeout configuration
const timeout_option = { timeout: 90000 };

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Load tax bill details page
      await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.waitForSelector(".bill , .address-wrapper", {
        ...timeout_option,
      });

      const data = await page.evaluate(() => {
        let data = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: ["N/A"],
          property_address: "",
          parcel_number: "",
          land_value: "",
          improvements: "",
          total_assessed_value: "N/A",
          exemption: "",
          total_taxable_value: "N/A",
          notes: "",
          delinquent: "",
          taxing_authority:
            " Alameda County Assessor's Office ,1221 Oak Street, Room 145, Oakland CA, 94612",
          tax_history: [],
        };

        function addOneDay(dateStr) {
          if (!dateStr) return "";
          const d = new Date(dateStr);
          d.setDate(d.getDate() + 1);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yyyy = d.getFullYear();
          return `${mm}/${dd}/${yyyy}`;
        }

        function formatDateMDY(dateStr) {
          const d = new Date(dateStr);
          if (isNaN(d)) return ""; // invalid date
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yyyy = d.getFullYear();
          return `${mm}/${dd}/${yyyy}`;
        }

        function getDueDates(year, payment_type) {
          const [startYear, endYear] = year.split("-");

          if (payment_type.toLowerCase().includes("1st")) {
            return `12/10/${startYear}`; // December of first year
          }
          if (payment_type.toLowerCase().includes("2nd")) {
            return `04/10/${endYear}`; // April of next year
          }

          return "";
        }

        // Extract property address and parcel number
        data.property_address = document
          .querySelector(".address-wrapper span")
          ?.textContent.trim() || "N/A";
        data.parcel_number = document
          .querySelector(".no-link")
          ?.textContent.trim() || "N/A";

        // --- EXTRACT CURRENT YEAR TAX DETAILS ---
        let currentYear = "";
        const billElement = document.querySelector(".bill");
        
        if (billElement) {
          // Extract year from the heading
          const yearHeading = billElement.querySelector(".current-tax-heading");
          if (yearHeading) {
            const yearMatch = yearHeading.textContent.match(/(\d{4}-\d{4})/);
            currentYear = yearMatch ? yearMatch[1] : "";
          }

          // Process each installment paragraph
          const installmentParagraphs = billElement.querySelectorAll("p");
          
          installmentParagraphs.forEach((p) => {
            const fullText = p.textContent.trim();
            
            // Skip if not an installment paragraph
            if (!fullText.includes("installment")) return;

            // Determine if it's 1st or 2nd installment
            let payment_type = "";
            if (fullText.toLowerCase().includes("1st installment")) {
              payment_type = "1st Installment";
            } else if (fullText.toLowerCase().includes("2nd installment")) {
              payment_type = "2nd Installment";
            } else {
              return; // Skip if not a valid installment
            }

            // Extract amount
            const amountMatch = fullText.match(/\$\s?[\d,]+\.\d{2}/);
            const amount = amountMatch ? amountMatch[0] : "$0.00";

            // Determine status (Paid, Due, or Delinquent)
            let status = "";
            let paid_date = "";
            let due_date = "";
            
            const textLower = fullText.toLowerCase();
            
            if (textLower.includes("paid")) {
              status = "Paid";
              // Extract paid date - format: "Dec 2, 2025" or "December 2, 2025"
              const paidDateMatch = fullText.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\b/);
              if (paidDateMatch) {
                paid_date = formatDateMDY(paidDateMatch[0]);
              }
            } else if (textLower.includes("due")) {
              // Check if it's delinquent (past due date)
              const dueDateMatch = fullText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
              if (dueDateMatch) {
                due_date = dueDateMatch[0];
                const dueDateTime = new Date(due_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dueDateTime.setHours(0, 0, 0, 0);
                
                if (today > dueDateTime) {
                  status = "Delinquent";
                } else {
                  status = "Due";
                }
              } else {
                status = "Due";
                // If no date found in text, use standard due dates
                due_date = getDueDates(currentYear, payment_type);
              }
            }

            // Calculate delinquent date
            const delq_date = due_date ? addOneDay(due_date) : "";
            
            // Determine amounts based on status
            let amount_paid = "$0.00";
            let amount_due = amount;
            
            if (status === "Paid") {
              amount_paid = amount;
              amount_due = "$0.00";
            }

            // Add to tax history
            data.tax_history.push({
              jurisdiction: "County",
              year: currentYear,
              payment_type: payment_type,
              status: status,
              base_amount: amount,
              amount_paid: amount_paid,
              amount_due: amount_due,
              mailing_date: "N/A",
              due_date: due_date || getDueDates(currentYear, payment_type),
              delq_date: delq_date || addOneDay(getDueDates(currentYear, payment_type)),
              paid_date: paid_date,
              good_through_date: "",
              link: "",
            });
          });
        }

        // --- EXTRACT PAID HISTORICAL DATA (Previous Years) ---
        document.querySelectorAll(".accordion__content").forEach((section) => {
          const title = section.parentElement
            .querySelector(".accordion__title")
            ?.textContent.trim();

          if (!title) return;

          const yearMatch = title.match(/\d{4}-\d{4}/);
          if (!yearMatch) return;

          const year = yearMatch[0];

          section
            .querySelectorAll(".installment-title")
            .forEach((installTitle) => {
              const payment_type = installTitle.textContent.trim();
              const parent = installTitle.parentElement;

              const amount =
                parent
                  .querySelector(".installment-amount + p")
                  ?.textContent.trim() || "$0.00";

              const paidText =
                Array.from(parent.querySelectorAll(".prior-year-bill p"))
                  .map((p) => p.textContent.trim())
                  .find((t) => t.toLowerCase().includes("paid")) || "";

              // Only add if there's a paid date (skip unpaid historical records)
              const paidDateMatch = paidText.match(/\w+\s+\d{1,2},\s+\d{4}/);
              if (!paidDateMatch) return;

              const paid_date = formatDateMDY(paidDateMatch[0]);
              const due_date = getDueDates(year, payment_type);
              const delq_date = due_date ? addOneDay(due_date) : "";

              // Only push PAID historical data
              data.tax_history.push({
                jurisdiction: "County",
                year,
                payment_type,
                status: "Paid",
                base_amount: amount,
                amount_paid: amount,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: due_date,
                delq_date: delq_date,
                paid_date,
                good_through_date: "",
                link: "",
              });
            });
        });

        // --- FILTERING LOGIC: Keep most recent year + previous year if it has unpaid ---
        const grouped = {};
        data.tax_history.forEach((item) => {
          if (!grouped[item.year]) grouped[item.year] = [];
          grouped[item.year].push(item);
        });

        const sortedYears = Object.keys(grouped).sort((a, b) => {
          const aStart = Number(a.split("-")[0]);
          const bStart = Number(b.split("-")[0]);
          return bStart - aStart;
        });

        const mostRecentYear = sortedYears[0];
        const previousYear = sortedYears[1];

        function hasUnpaid(year) {
          return grouped[year]?.some(
            (rec) => rec.status.toLowerCase() === "due" || rec.status.toLowerCase() === "delinquent"
          ) || false;
        }

        let finalYears = [mostRecentYear];

        if (previousYear && hasUnpaid(previousYear)) {
          finalYears.push(previousYear);
        }

        data.tax_history = data.tax_history.filter((rec) =>
          finalYears.includes(rec.year)
        );

        // Check for delinquency
        const hasDelinquent = data.tax_history.some(
          (rec) => rec.status.toLowerCase() === "delinquent"
        );

        data.delinquent = hasDelinquent
          ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF"
          : "NONE";

        // Generate notes
        if (data.tax_history.length >= 2) {
          const first = data.tax_history[0];
          const second = data.tax_history[1];

          data.notes = `${
            data.delinquent === "NONE"
              ? "ALL PRIOR YEARS ARE PAID, "
              : "PRIOR YEARS ARE DELINQUENT, "
          }${currentYear}: 1ST INSTALLMENT IS ${first.status.toUpperCase()}, 2ND INSTALLMENT IS ${second.status.toUpperCase()}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/10 AND 04/10.`;
        } else if (data.tax_history.length === 1) {
          const first = data.tax_history[0];
          data.notes = `${currentYear}: ${first.payment_type.toUpperCase()} IS ${first.status.toUpperCase()}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 12/10 AND 04/10.`;
        }

        return data;
      });

      resolve(data);
    } catch (error) {
      reject(error);
    }
  });
};

const account_search = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      ac_1(page, url, account)
        .then((data) => resolve(data))
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

// Main controller: handles API and HTML routes
const search = async (req, res) => {
  const { fetch_type, account } = req.body;

  // Basic validation for account number
  if (!account || account.trim() === "") {
    return res.status(400).json({
      message: "Please enter a valid account number",
    });
  }

  try {
    // Construct target URL dynamically
    const url = `https://propertytax.alamedacountyca.gov/account-summary?address=&apn=&displayApn=${account}`;

    // Reject unknown request type
    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
      return res.status(200).render("error_data", {
        error: true,
        message: "Invalid Access",
      });
    }

    // Launch Chromium instance
    const browser = await getBrowserInstance();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    );
    page.setDefaultNavigationTimeout(90000);

    // Optimize requests: block unnecessary resources
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

    // Handle frontend rendering requests
    if (fetch_type == "html") {
      account_search(page, url, account)
        .then((data) => res.status(200).render("parcel_data_official", data))
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

      // Handle API responses (JSON format)
    } else if (fetch_type == "api") {
      account_search(page, url, account)
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

module.exports = { search };