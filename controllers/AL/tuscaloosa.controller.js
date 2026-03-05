//Author-> Harsh Jha
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

      await page.waitForSelector(
        "#ctl00_ContentPlaceHolder2_ddlSearchType",
        timeout_option
      );

      await page.select("#ctl00_ContentPlaceHolder2_ddlSearchType", "parcel");

      await page.waitForSelector("#ctl00_ContentPlaceHolder2_tbSearch", {
        visible: true,
        timeout: 60000,
      });

      await page.evaluate((acct) => {
        const input = document.querySelector(
          "#ctl00_ContentPlaceHolder2_tbSearch"
        );
        if (input) {
          input.value = acct;
          // Trigger input event to notify any listeners
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, account);

      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify the value was entered (trim to remove any mask characters)
      const inputValue = await page.$eval(
        "#ctl00_ContentPlaceHolder2_tbSearch",
        (el) => el.value.trim().replace(/_+$/, "") // Remove trailing underscores
      );

      if (inputValue !== account) {
        console.log("⚠️ Input value mismatch, but proceeding anyway");
        console.log(`Expected: ${account}, Got: ${inputValue}`);
      }
      // Use Promise.all to wait for both click and navigation
      await Promise.all([
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 90000,
        }),
        page.click("#ctl00_ContentPlaceHolder2_btnSearch"),
      ]);
      // Wait for page to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Check if we're on a results page or error page
      const currentUrl = page.url();

      // Wait for either the results or an error message
      try {
        await page.waitForSelector(
          "#ctl00_ContentPlaceHolder2_btnViewBDetails_0, .error-message, .no-results",
          {
            timeout: 10000,
          }
        );
      } catch (e) {
        console.log(
          "Neither results nor error message found, checking page content..."
        );
      }

      // Check if results are present
      const hasResults = await page.evaluate(() => {
        return !!document.querySelector(
          "#ctl00_ContentPlaceHolder2_btnViewBDetails_0"
        );
      });

      if (!hasResults) {
        throw new Error(
          "No search results found for the provided parcel number"
        );
      }

      const taxdetailurl = await page.$eval(
        "#ctl00_ContentPlaceHolder2_btnViewBDetails_0",
        (el) => el.href
      );

      if (!taxdetailurl) {
        throw new Error("Tax detail URL not found");
      }


      // Navigate to tax detail page
      await page.goto(taxdetailurl, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });

      // Wait for the container to ensure page is fully loaded
      await page.waitForSelector(".container", { timeout: 30000 });

      console.log("Page loaded:", await page.title());

      // Extract data from the page
      const data = await page.evaluate(() => {
        const data = {
          processed_date: new Date().toLocaleDateString(),
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: "",
          parcel_number: "",
          land_value: "$0.00",
          improvements: "$0.00",
          total_assessed_value: "N/A",
          exemption: "N/A",
          total_taxable_value: "N/A",
          taxing_authority:
            "Tuscaloosa County Courthouse, 714 Greensboro Avenue, Tuscaloosa,  AL 35401",
          notes: "",
          delinquent: "NONE",
          tax_history: [],
        };

        // Extract Owner Names
        const ownerEl = document.querySelector(
          "#ctl00_ContentPlaceHolder2_lblOwner"
        );
        if (ownerEl) {
          data.owner_name.push(ownerEl.textContent.trim());
        }

        // Extract Parcel Number
        const parcelEl = document.querySelector(
          "#ctl00_ContentPlaceHolder2_lblParcel"
        );
        if (parcelEl) {
          data.parcel_number = parcelEl.textContent.trim();
        }

        // Extract Property Address
        const addressEl = document.querySelector(
          "#ctl00_ContentPlaceHolder2_lblPhysAddr"
        );
        if (addressEl) {
          data.property_address = addressEl.textContent.trim();
        }

        // Extract Assessed Values
        const assessedValue = document.querySelector(
          "#ctl00_ContentPlaceHolder2_lblAssessed"
        );
        if (assessedValue) {
          const val = `$${assessedValue.textContent.trim()}`;
          data.total_assessed_value = val;
          data.total_taxable_value = val;
        }

        // Extract Current Year Tax History
        const divTransTable = document.querySelector(
          "#ctl00_ContentPlaceHolder2_tblDivTrans"
        );
        if (divTransTable && divTransTable.children[1]) {
          const divs = divTransTable.children[1].querySelectorAll(
            ".col-md-1, .col-md-2"
          );

          let year, ispaid, baseAmount, amount;

          divs.forEach((div, i) => {
            const text = div.textContent.trim().split(":")[1]?.trim();

            if (i === 1) year = text;
            if (i === 2) ispaid = text;
            if (i === 5) baseAmount = text;
            if (i === 7) amount = text;
          });

          if (year && baseAmount) {
            const isPaid = ispaid && ispaid !== "NO";

            data.tax_history.push({
              jurisdiction: "County",
              year,
              payment_type: "",
              status: "",
              base_amount: baseAmount || "",
              amount_paid: isPaid ? amount || "$0.00" : "$0.00",
              amount_due: isPaid ? "$0.00" : amount || "$0.00",
              mailing_date: "N/A",
              due_date: "",
              delq_date: "",
              paid_date: isPaid ? ispaid : "",
              good_through_date: "",
              link: "",
            });
          }
        }

        // Extract Previous Years Tax History
        const previousValues = document.querySelectorAll(
          "#ctl00_ContentPlaceHolder2_tblPayHist > .row.roweven, #ctl00_ContentPlaceHolder2_tblPayHist > .row.rowodd"
        );

        if (previousValues && previousValues.length > 0) {
          let year, baseAmount, amount, paiddate, paidByText;

          for (let index = 0; index < previousValues.length; index++) {
            const cols = previousValues[index].querySelectorAll(":scope > div");

            year = cols[0]
              ?.querySelector(".col-xs-6.text-right, .col-xs-6.col-sm-offset-2")
              ?.textContent.trim();

            amount = cols[2]
              ?.querySelector(".col-xs-6.text-right, .col-xs-6.col-sm-offset-2")
              ?.textContent.trim();

            paidByText =
              cols[4]
                ?.querySelector(".col-xs-6.col-sm-offset-2")
                ?.textContent.trim() || "";

            const dateMatch = paidByText?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
            paiddate = dateMatch ? dateMatch[0] : "";

            if (year && baseAmount) {
              const isPaid =
                parseFloat(amount) === 0 &&
                (!paidByText || paidByText.trim() === "");

              const amountPaid = isPaid ? `$${amount} ` : "$0.00";
              const amountDue = !isPaid ? `$${amount} ` : "$0.00";

              data.tax_history.push({
                jurisdiction: "County",
                year: year || "",
                payment_type: "",
                status: "",
                base_amount: `${amount}` || "",
                amount_paid: amountPaid,
                amount_due: amountDue,
                mailing_date: "N/A",
                due_date: "",
                delq_date: "",
                paid_date: paiddate || "",
                good_through_date: "",
                link: "",
              });
            }
          }
        }

        // Process tax history dates and status
        data.tax_history.forEach((h) => {
          const year = Number(h.year) || new Date().getFullYear();
          const recordsForYear = data.tax_history.filter(
            (x) => x.year === h.year
          );

          if (recordsForYear.length === 1) {
            h.payment_type = "Annual";
            h.due_date = `10/01/${year}`;
            h.delq_date = `01/01/${year + 1}`;
          } else {
            h.payment_type = "Semi-Annual";
            const indexInYear = recordsForYear.indexOf(h);

            if (indexInYear === 0) {
              h.due_date = `10/01/${year}`;
              h.delq_date = `11/15/${year}`;
            } else {
              h.due_date = `12/31/${year}`;
              h.delq_date = `01/01/${year + 1}`;
            }
          }
        });

        if (data.tax_history.length > 0) {
          const today = new Date();
          const maxYear = Math.max(
            ...data.tax_history.map((el) => Number(el.year))
          );

          // Update status
          data.tax_history = data.tax_history.map((el) => {
            const yearNum = Number(el.year);
            const currentYear = new Date().getFullYear();

            // Check if paid based on amount_paid and paid_date
            const hasPaidAmount =
              el.amount_paid !== "$0.00" &&
              parseFloat(el.amount_paid.replace(/[$,]/g, "")) > 0;
            const hasPaidDate =
              el.paid_date && el.paid_date !== "" && el.paid_date !== "-";
            const isPaid = hasPaidAmount && hasPaidDate;

            const dueDate = el.due_date ? new Date(el.due_date) : null;
            const delqDate = el.delq_date ? new Date(el.delq_date) : null;

            if (isPaid) {
              el.status = "Paid";
            } else if (yearNum < currentYear) {
              // Past year with no payment = Delinquent
              el.status = "Delinquent";
            } else if (yearNum === currentYear) {
              // Current year - check if past delinquent date
              if (delqDate && today > delqDate) {
                el.status = "Delinquent";
              } else if (dueDate && today > dueDate) {
                el.status = "Due";
              } else {
                el.status = "Due";
              }
            } else {
              el.status = "Due";
            }

            return el;
          });

          // Sort by year and due date
          data.tax_history.sort((a, b) => {
            if (Number(a.year) !== Number(b.year)) {
              return Number(b.year) - Number(a.year);
            }
            const da = new Date(a.due_date || "01/01/1900");
            const db = new Date(b.due_date || "01/01/1900");
            return da - db;
          });

          // Filter: Keep current year + last 3 years (paid or unpaid) + any unpaid years
          const currentYear = new Date().getFullYear();
          const keepYears = [
            currentYear,
            currentYear - 1,
            currentYear - 2,
            currentYear - 3,
          ];

          data.tax_history = data.tax_history.filter((el) => {
            const yearNum = Number(el.year);
            // Keep if: recent year OR unpaid
            return keepYears.includes(yearNum) || el.status !== "Paid";
          });

          // Check for delinquent taxes
          const hasDelinquent = data.tax_history.some(
            (el) => el.status === "Delinquent"
          );
          data.delinquent = hasDelinquent ? "YES" : "NONE";

          // Generate notes
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

          if (maxYearRecords.length === 1) {
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 10/01.`;
          } else {
            data.notes = `${
              priorUnpaid
                ? "PRIOR YEARS ARE DELINQUENT"
                : "ALL PRIOR YEARS ARE PAID"
            }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, DUE DATES ARE 10/01 AND 12/31.`;
          }
        }

        return data;
      });

      console.log("✅ Data extraction complete");
      resolve(data);
    } catch (error) {
      console.error("❌ Scraping failed:", error.message);
      reject(new Error(`Tuscaloosa scraper error: ${error.message}`));
    }
  });
};

const account_search = (page, url, account) =>
  new Promise((resolve, reject) => {
    ac_1(page, url, account).then(resolve).catch(reject);
  });

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

  const url = `https://altags.com/Tuscaloosa_Revenue/property.aspx`;

  const browser = await getBrowserInstance();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  page.setDefaultNavigationTimeout(90000);

  try {
    const data = await account_search(page, url, account);

    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data);
    } else {
      res.status(200).json({ result: data });
    }
  } catch (err) {
    console.error("❌ Scraping error:", err);
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
