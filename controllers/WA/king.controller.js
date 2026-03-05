//author ->  harsh
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, url, account) => {
  try {
    // 1. Navigate to the page
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // 2. Wait for search input
    await page.waitForSelector("input#searchParcel", { timeout: 30000 });

    // 3. Fill in the account/parcel number
    await page.type("input#searchParcel", account);

    // 4. Trigger search
    await Promise.all([
      page.keyboard.press("Enter"),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    // 5. Wait for the main container instead of specific elements
    await page.waitForSelector(".pt-account-card-header", { timeout: 30000 });

    // 6. Get parcel number first
    const parcelNumber = await page.evaluate(() => {
      const parcelEl = document.querySelector(".pt-account-card-header h5");
      return parcelEl ? parcelEl.textContent.split("#")[1].trim() : "";
    });

    // Click to expand Payment History
    const paymentHistoryExpanded = await page.evaluate(() => {
      const el = Array.from(
        document.querySelectorAll(".pt-account-card-section-title")
      ).find((el) => el.textContent.trim() === "Payment History");

      if (el) {
        el.click();
        return true;
      }
      return false;
    });

    // Wait for the payment history section to expand
    if (paymentHistoryExpanded && parcelNumber) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 7. Extract data
    const data = await page.evaluate(() => {
      let data = {
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
        taxing_authority:
          "King Street Center,201 South Jackson Street #710 Seattle, WA 98104",
        notes: "",
        delinquent: "",
        tax_history: [],
      };

      // Owner
      const ownerEl = document.querySelector(".pt-account-card-header h3");
      if (ownerEl)
        data.owner_name.push(ownerEl.textContent.split(":")[1].trim());

      // Parcel
      const parcelEl = document.querySelector(".pt-account-card-header h5");
      if (parcelEl)
        data.parcel_number = parcelEl.textContent.split("#")[1].trim();

      // All installments
      const taxContainers = document.querySelectorAll(
        ".pt-account-card-billing-details-details.collapsed"
      );

      if (!taxContainers.length) {
        console.log("No tax containers found, skipping.");
      } else {
        taxContainers.forEach((container) => {
          try {
            // Check for "NO TAXES ARE DUE" message
            const noTaxMsg = container.querySelector(
              ".inline-notification.danger p"
            );
            if (noTaxMsg?.textContent?.includes("NO TAXES ARE DUE")) {
              console.log("Skipping: No taxes due");
              return; // skip this container
            }

            // Look for checkbox amounts within this container
            const checkboxRows = container.querySelectorAll(
              ".pt-account-card-billing-details-details-checkbox-amounts"
            );

            checkboxRows.forEach((row) => {
              try {
                // Safely get label text
                const labelText =
                  row.querySelector("label")?.textContent?.trim() || "";
                if (!labelText) return; // skip if label is missing

                const [year, ...rest] = labelText.split(" ");
                const installment = rest.join(" ");

                // Safely get due amount
                const dueAmount =
                  row.querySelector("span")?.textContent?.trim() || "$0.00";

                // Push to tax history
                data.tax_history.push({
                  jurisdiction: "County",
                  year,
                  payment_type: installment,
                  status: "",
                  base_amount: dueAmount,
                  amount_paid: "$0.00",
                  amount_due: dueAmount,
                  mailing_date: "N/A",
                  due_date: "",
                  delq_date: "",
                  paid_date: "",
                  good_through_date: "",
                  link: "",
                });
              } catch (err) {
                console.warn(
                  "Skipping a checkbox row due to unexpected structure:",
                  err
                );
              }
            });
          } catch (err) {
            console.warn(
              "Skipping a container due to unexpected structure:",
              err
            );
          }
        });
      }

      // Check if payment history table is present
      const table = document.getElementById(
        `collapsePaymentHistory${data.parcel_number}`
      );

      if (table) {
        const rows = table.querySelectorAll("tbody tr"); // only tbody rows

        rows.forEach((tr) => {
          const tds = tr.querySelectorAll("td");
          if (!tds.length) return; // skip rows without cells

          // Extract date and year
          const dateText = tds[0]?.textContent?.trim() || "N/A";
          const year = dateText !== "N/A" ? dateText.split("/")[2] : "N/A";

          // Extract base amount and penalty
          const baseAmountText =
            tds[2]?.querySelector("span")?.textContent?.trim() || "$0.00";
          const penaltyText =
            tds[3]?.querySelector("span")?.textContent?.trim() || "$0.00";

          // Convert to numbers
          const baseAmount =
            parseFloat(baseAmountText.replace(/[$,]/g, "")) || 0;
          const penalty = parseFloat(penaltyText.replace(/[$,]/g, "")) || 0;

          // Total paid = base + penalty
          const totalPaid = baseAmount + penalty;

          data.tax_history.push({
            jurisdiction: "County",
            year,
            payment_type: "",
            status: "",
            base_amount: baseAmountText,
            amount_paid: `$${totalPaid.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}`,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: "",
            delq_date: "",
            paid_date: dateText,
            good_through_date: "",
            link: "",
          });
        });
      } else {
        console.log("Table not found");
      }

      data.tax_history.forEach((el) => {
        if (el.amount_due !== "$0.00") {
          el.status = "Unpaid";
        } else {
          el.status = "Paid";
        }
      });

      const yearCount = new Map();
      data.tax_history.forEach((h) => {
        yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
      });
      data.tax_history.forEach((h) => {
        const countForYear = yearCount.get(h.year);
        if (countForYear === 1) {
          h.payment_type = "Annual";
          // Annual bills are usually treated as a full-year (2nd half) payment
          h.due_date = `10/31/${h.year}`;
          h.delq_date = `11/01/${h.year}`;
        } else {
          h.payment_type = "Semi-Annual";

          const isFirstInstallment =
            data.tax_history.filter((t) => t.year === h.year).indexOf(h) === 0;

          if (isFirstInstallment) {
            h.due_date = `10/31/${h.year}`;
            h.delq_date = `11/01/${h.year}`;
          } else {
            h.due_date = `04/30/${h.year}`;
            h.delq_date = `05/01/${h.year}`;
          }
        }
      });

      data.tax_history.sort((a, b) => {
        return (
          a["year"] - b["year"] ||
          new Date(a["due_date"]) - new Date(b["due_date"])
        );
      });

      if (data.tax_history.length > 0) {
        const maxYear = Math.max(
          ...data.tax_history.map((el) => Number(el.year))
        );

        data.tax_history = data.tax_history.filter((el) => {
          if (Number(el.year) === maxYear) return true;
          return data.tax_history.some(
            (r) => r.year === el.year && r.status === "Unpaid"
          );
        });

        const priorUnpaid = data.tax_history.some(
          (el) => Number(el.year) < maxYear && el.status === "Unpaid"
        );

        const maxYearStatus = data.tax_history.some(
          (el) => Number(el.year) === maxYear && el.status === "Unpaid"
        )
          ? "UNPAID"
          : "PAID";

        data.delinquent = maxYearStatus === "PAID" ? "NONE" : "YES";

        // Find payment statuses for maxYear installments
        const maxYearRecords = data.tax_history.filter(
          (el) => Number(el.year) === maxYear
        );

        let firstStatus = "PAID";
        let secondStatus = "PAID";

        // Sort by payment_type to ensure consistent ordering
        maxYearRecords.sort((a, b) => {
          if (a.payment_type === "Annual" && b.payment_type === "Semi-Annual")
            return -1;
          if (a.payment_type === "Semi-Annual" && b.payment_type === "Annual")
            return 1;
          return 0;
        });

        maxYearRecords.forEach((el, i) => {
          const status = el.status === "Paid" ? "PAID" : "UNPAID";
          if (i === 0) {
            firstStatus = status;
          } else if (i === 1) {
            secondStatus = status;
          }
        });

        // Build notes string
        if (maxYearRecords.length === 1) {
          data.notes = `${
            priorUnpaid ? "PRIOR YEARS ARE UNPAID" : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: ANNUAL TAX IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 04/30.`;
        } else {
          data.notes = `${
            priorUnpaid ? "PRIOR YEARS ARE UNPAID" : "ALL PRIOR YEARS ARE PAID"
          }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
        }
      }

      return data;
    });

    //assesorpage link
    const assessorUrl = `https://blue.kingcounty.com/Assessor/eRealProperty/Dashboard.aspx?ParcelNbr=${data.parcel_number}`;

    await page.goto(assessorUrl, { waitUntil: "domcontentloaded" });

    const somedetails = await page.evaluate(() => {
      const table = document.getElementById(
        "cphContent_DetailsViewDashboardHeader"
      );
      if (!table) return null;

      const rows = table.querySelectorAll("tbody tr");
      const details = {};

      rows.forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 2) return;

        const key = tds[0].textContent.trim();
        const value = tds[1].textContent.trim();

        switch (key) {
          case "Parcel Number":
            details.parcelNumber = value;
            break;
          case "Name":
            details.ownerName = value;
            break;
          case "Site Address":
            details.siteAddress = value;
            break;
          case "Legal":
            details.legal = value;
            break;
        }
      });

      return details;
    });

    data.property_address = somedetails.siteAddress;

    const taxableTotal = await page.evaluate(() => {
      const table = document.getElementById("cphContent_GridViewDBTaxRoll");
      if (!table) return null;

      const firstRow = table.querySelector(
        "tbody tr.GridViewRowStyle, tbody tr.GridViewAlternatingRowStyle"
      );
      if (!firstRow) return null;

      const tds = firstRow.querySelectorAll("td");
      return tds[8]?.textContent.trim() || "0"; // taxable total column
    });

    data.total_taxable_value = "$" + taxableTotal;
    data.total_assessed_value =  "$" + taxableTotal;

    return data;
  } catch (error) {
    console.error(error);
    throw new Error(
      error.message || "Record not found or an unexpected error occurred."
    );
  }
};

const account_search = (page, url, account) => {
  return new Promise((resolve, reject) => {
    ac_1(page, url, account)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        console.error(err);
        reject(err);
      });
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const url = "https://payment.kingcounty.gov/Home/Index?app=PropertyTaxes";

    if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
      return res.status(200).render("error_data", {
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
      account_search(page, url, account)
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
      account_search(page, url, account)
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
