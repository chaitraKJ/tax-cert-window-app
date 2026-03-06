//Author -> Harsh Jha

const getBrowserInstance = require("../../utils/chromium/browserLaunch.js");

const timeout_option = {
  timeout: 90000,
};

const ac_1 = async (page, url, account) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Go to site and search parcel
      const status = await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("input#MainContent_mParcelID", timeout_option);
      await page.locator("input#MainContent_mParcelID").fill(account);

      await Promise.all([
        page.keyboard.press("Enter"),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ])
        .then(async () => {
          const data = await page.evaluate(() => {
            // Base structure
            let data = {
              processed_date: new Date().toISOString().split("T")[0],
              order_number: "",
              borrower_name: "",
              owner_name: [],
              property_address:
                document
                  .getElementById("MainContent_mSitusAddress")
                  ?.textContent.trim() || "",
              parcel_number:
                document
                  .getElementById("MainContent_mParcelNumber")
                  ?.textContent.trim() || "",
              land_value: "",
              improvements: "",
              total_assessed_value: "$0.00",
              exemption: "",
              total_taxable_value: "$0.00",
              taxing_authority:
                "Thurston County, 3000 Pacific Avenue SE, Olympia, WA 98501",
              notes: "",
              delinquent: "",
              tax_history: [],
            };

            data.owner_name.push(
              document
                .querySelectorAll("#MainContent_mParties tr")[2]
                ?.querySelectorAll("td")[2]
                .textContent.trim()
            );

            data["total_assessed_value"] = document
              .querySelectorAll("#MainContent_mPropertyValues tr")[1]
              .children[1].textContent.trim();
            data["total_taxable_value"] = document
              .querySelectorAll("#MainContent_mPropertyValues tr")[1]
              .children[1].textContent.trim();

            // ---------------- Unpaid Taxes ----------------
            const table = document.getElementById(
              "MainContent_mTaxChargesBalancePayment"
            );
            if (table) {
              table.querySelectorAll("tr").forEach((tr, i) => {
                if (i !== 0) {
                  const tds = tr.querySelectorAll("td");

                  let Tax = {
                    jurisdiction: "County",
                    year: tds[0].textContent.trim(),
                    payment_type: "",
                    status: "Unpaid",
                    base_amount: tds[5].textContent.trim(),
                    amount_paid: "$0.00",
                    amount_due: tds[5].textContent.trim(),
                    mailing_date: "N/A",
                    due_date: "",
                    delq_date: "",
                    paid_date: "",
                    good_through_date: "",
                    link: "",
                    installment_num: +tds[1].textContent.trim(), 
                  };

                  data.tax_history.push(Tax);
                }
              });
            }

            // ---------------- Paid Taxes (Receipts) ----------------
            document
              .querySelectorAll("#MainContent_ReceiptsPanel tr")
              .forEach((tr, i) => {
                if (i !== 0) {
                  const tds = tr.querySelectorAll("td");

                  const rawDate = tds[0]?.textContent.trim() || "";
                  const year = rawDate.split("/")[2]?.split(" ")[0] || "";

                  let Tax = {
                    jurisdiction: "County",
                    year: year,
                    payment_type: "",
                    status: "Paid",
                    base_amount: tds[2]?.textContent.trim() || "$0.00",
                    amount_paid: tds[4]?.textContent.trim() || "$0.00",
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: "",
                    delq_date: "",
                    paid_date: rawDate.split(" ")[0] || "",
                    good_through_date: "",
                    link: "",
                    installment_num: +tds[1]?.textContent.trim() || 0,
                  };

                  data.tax_history.push(Tax);
                }
              });

            // ---- Group tax records by year ----
            const yearGroups = new Map();
            data.tax_history.forEach((tax) => {
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
            data.tax_history = Array.from(yearGroups.values()).flat();

            // ---- Count number of records per year ----
            const yearCount = new Map();
            data.tax_history.forEach((h) => {
              yearCount.set(h.year, (yearCount.get(h.year) || 0) + 1);
            });

            // ---- Assign payment types and due dates ----
            data.tax_history.forEach((h) => {
              const countForYear = yearCount.get(h.year);

              if (countForYear === 1) {
                // Annual payment
                h.payment_type = "Annual";
                h.due_date = `04/30/${h.year}`;
                h.delq_date = `05/01/${h.year}`;
              } else {
                // Semi-annual payment
                h.payment_type = "Semi-Annual";

                // Use installment_num to determine which installment this is
                if (h.installment_num === 1) {
                  // 1st installment
                  h.due_date = `04/30/${h.year}`;
                  h.delq_date = `05/01/${h.year}`;
                } else if (h.installment_num === 2) {
                  // 2nd installment
                  h.due_date = `10/31/${h.year}`;
                  h.delq_date = `11/01/${h.year}`;
                } else {
                  // Fallback: determine by paid date or position
                  const sameYearRecs = data.tax_history.filter(
                    (t) => t.year === h.year
                  );

                  if (h.status === "Paid" && h.paid_date) {
                    const paidDate = new Date(h.paid_date);
                    const paidMonth = paidDate.getMonth() + 1;
                    if (paidMonth <= 6) {
                      h.due_date = `04/30/${h.year}`;
                      h.delq_date = `05/01/${h.year}`;
                    } else {
                      h.due_date = `10/31/${h.year}`;
                      h.delq_date = `11/01/${h.year}`;
                    }
                  } else {
                    // Use position as fallback
                    const idx = sameYearRecs.indexOf(h);
                    if (idx === 0) {
                      h.due_date = `04/30/${h.year}`;
                      h.delq_date = `05/01/${h.year}`;
                    } else {
                      h.due_date = `10/31/${h.year}`;
                      h.delq_date = `11/01/${h.year}`;
                    }
                  }
                }
              }

              delete h.installment_num;
            });

            if (data.tax_history.length > 0) {
              const today = new Date();

              // Find latest year
              const maxYear = Math.max(
                ...data.tax_history.map((el) => Number(el.year))
              );

              // Update each record’s final status
              data.tax_history = data.tax_history.map((el) => {
                const paid =
                  el.status.toLowerCase() === "paid" ||
                  el.amount_paid !== "$0.00";
                const dueDate = el.due_date ? new Date(el.due_date) : null;
                const delqDate = el.delq_date ? new Date(el.delq_date) : null;

                if (paid) el.status = "Paid";
                else if (dueDate && today < dueDate) el.status = "Due";
                else if (delqDate && today > delqDate) el.status = "Delinquent";
                else el.status = "Unpaid";

                return el;
              });

              data.tax_history.sort((a, b) => {
                if (Number(a.year) !== Number(b.year)) {
                  return Number(a.year) - Number(b.year);
                }

                const da = new Date(a.due_date || "01/01/1900");
                const db = new Date(b.due_date || "01/01/1900");

                return da - db;
              });

              // Keep latest year and any unpaid prior years
              data.tax_history = data.tax_history.filter((el) => {
                if (Number(el.year) === maxYear) return true;
                return data.tax_history.some(
                  (r) => r.year === el.year && r.status !== "Paid"
                );
              });

              // ---- Mark delinquent status ----
              const hasDelinquent = data.tax_history.some(
                (el) => el.status === "Delinquent"
              );
              data.delinquent = hasDelinquent ? "YES" : "NONE";

              // ---- Prepare summary notes ----
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

              // Build notes based on payment type
              if (maxYearRecords.length === 1) {
                data.notes = `${
                  priorUnpaid
                    ? "PRIOR YEARS ARE DELINQUENT"
                    : "ALL PRIOR YEARS ARE PAID"
                }. ${maxYear}: ANNUAL TAX STATUS IS ${maxYearRecords[0].status.toUpperCase()}, NORMAL TAXES ARE PAID ANNUALLY, DUE DATE IS 04/30.`;
              } else {
                data.notes = `${
                  priorUnpaid
                    ? "PRIOR YEARS ARE DELINQUENT"
                    : "ALL PRIOR YEARS ARE PAID"
                }. ${maxYear}: 1ST INSTALLMENT IS ${firstStatus}, 2ND INSTALLMENT IS ${secondStatus}, NORMAL TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 04/30 AND 10/31.`;
              }
            }

            return data;
          });

          resolve(data);
        })
        .catch(() => {
          reject(new Error("Record not found"));
        });
    } catch (error) {
      console.log(error);
      reject('Record Not Found');
    }
  });
};

const account_search = (page, url, account) => {
  return new Promise((resolve, reject) => {
    try {
      ac_1(page, url, account)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          console.log(error);
          reject(new Error(error.message));
        });
    } catch (error) {}
  });
};

const search = async (req, res) => {
  const { fetch_type, account } = req.body;
  try {
    const url = "https://tcproperty.co.thurston.wa.us/ascendweb/";

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

module.exports = { search };