//AUTHOR: DHANUSH
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout_option = { timeout: 90000 };

/**
 * Parse dates in format "Wednesday, December 10, 2025"
 */
const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = dateStr.replace(/^[A-Za-z]+,\s*/i, '').trim();
    const date = new Date(clean);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Format date MM/DD/YYYY or empty string
 */
const formatDateSimple = (date) => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
};

/**
 * Format amount with $ and commas, e.g., $1,282.70
 */
const formatAmount = (amountRaw) => {
    const num = parseFloat(amountRaw);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Kern County due dates:
 * - 1st installment: due Nov 1, delinquent Dec 10
 * - 2nd installment: due Feb 1, delinquent Apr 10
 * - Redemption: due Feb 1
 */
const getDueDateFromDelq = (delqDateStr, installmentType = "", taxYearStr = null) => {
    const delq = parseDate(delqDateStr);
    if (!delq) return "";

    const typeLower = installmentType.toLowerCase().trim();

    if (typeLower.includes("first")) {
        // First installment: Nov 1 of same year as Dec delinquent
        const due = new Date(delq.getFullYear(), 10, 1); // Nov 1
        return formatDateSimple(due);
    }

    if (typeLower.includes("second")) {
        // Second installment: Feb 1 of same year as Apr delinquent
        const due = new Date(delq.getFullYear(), 1, 1); // Feb 1
        return formatDateSimple(due);
    }

    // Redemption / Single (Redemption)
    // For prior years like 2024, use 02/01 of taxYear + 1 (e.g., 02/01/2025), regardless of a later delinquent year.
    const taxYear = parseInt(taxYearStr || delq.getFullYear());
    const due = new Date(taxYear + 1, 1, 1); // Feb 1
    return formatDateSimple(due);
};

/**
 * Delinquent date in MM/DD/YYYY format
 */
const getDelqDateFormatted = (delqDateStr = "") => {
    const d = parseDate(delqDateStr);
    return d ? formatDateSimple(d) : (delqDateStr || "");
};

/**
 * Extract tax year from bill number
 * Examples: "25-1025450-00-8" → 2025, "24-1025375-00-5" → 2024
 */
const extractTaxYearFromBillNumber = (billNumber) => {
    if (!billNumber) return null;
    
    const match = billNumber.match(/^(\d{2})-/);
    if (match && match[1]) {
        const prefix = match[1];
        const year = parseInt(`20${prefix}`);
        if (year >= 2000 && year <= 2099) {
            return year.toString();
        }
    }
    
    return null;
};

/**
 * Determine if bill is a redemption bill
 */
const isRedemptionBill = (billNumber, installmentType) => {
    const billLower = (billNumber || "").toLowerCase();
    const typeLower = (installmentType || "").toLowerCase();
    
    return billLower.includes("redemption") || 
           typeLower.includes("single") || 
           typeLower.includes("redemption");
};

/**
 * Extract paid amount from status text
 */
const extractPaidAmount = (statusText = "") => {
    const text = statusText.toLowerCase().trim();

    if (!text.includes("paid") || text.includes("unpaid")) {
        return "0.00";
    }

    const patterns = [
        /paid\s*\$?([\d,]+\.\d{2})/i,
        /\$([\d,]+\.\d{2})/i,
        /paid\s*\$?([\d,]+)/i
    ];

    for (const regex of patterns) {
        const match = text.match(regex);
        if (match && match[1]) {
            const cleaned = match[1].replace(/,/g, '');
            const num = parseFloat(cleaned);
            if (!isNaN(num)) {
                return String(num);
            }
        }
    }

    return "0.00";
};

/**
 * Extract paid date from status
 */
const extractPaidDate = (statusText) => {
    const match = (statusText || "").match(/on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    return match ? match[1] : "-";
};

/**
 * Determine status: Paid, Due, or Delinquent
 */
const getInstallmentStatus = (statusText, delinquentDateStr) => {
    const text = (statusText || "").trim().toLowerCase().replace(/\.$/, "");

    if (text.includes("paid") && !text.includes("unpaid")) {
        return "Paid";
    }

    const delq = parseDate(delinquentDateStr);
    if (!delq) return "Due";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (today > delq) {
        return "Delinquent";
    }

    return "Due";
};

/**
 * CAPTCHA EXTRACTION
 */
const extractCaptcha = async (page) => {
    try {
        await page.waitForSelector("#ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaImage", {
            visible: true,
            timeout: 50000
        });

        const captchaSrc = await page.evaluate(() => {
            const img = document.getElementById("ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaImage");
            return img?.src || null;
        });

        if (!captchaSrc) throw new Error("CAPTCHA src not found");

        const imageArray = await page.evaluate(async (src) => {
            try {
                const response = await fetch(src);
                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                const ab = await response.arrayBuffer();
                return Array.from(new Uint8Array(ab));
            } catch (err) {
                throw new Error(err.message);
            }
        }, captchaSrc);

        if (!imageArray) throw new Error("Failed to fetch CAPTCHA image data");

        return Buffer.from(imageArray);
    } catch (error) {
        console.error("CAPTCHA fetch error:", error.message);
        throw error;
    }
};

/**
 * CAPTCHA PREPROCESSING
 */
const preprocessCaptcha = async (imageBuffer) => {
    try {
        const processed = await sharp(imageBuffer)
            .resize(360, 100, { kernel: sharp.kernel.lanczos3 })
            .greyscale()
            .normalize()
            .median(2)
            .sharpen({ sigma: 0.8 })
            .threshold(145)
            .extend({ 
                top: 10, bottom: 10, left: 10, right: 10, 
                background: { r: 255, g: 255, b: 255 } 
            })
            .png({ compressionLevel: 9 })
            .toBuffer();

        return processed;
    } catch (error) {
        throw new Error("Preprocessing failed: " + error.message);
    }
};

/**
 * OCR WITH TESSERACT
 */
const readCaptcha = async (imageBuffer) => {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imageBuffer,
            'eng',
            {
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                tessedit_pageseg_mode: '8',
                tessedit_ocr_engine_mode: '3',
                user_defined_dpi: '300',
                preserve_interword_spaces: '0',
            }
        );

        let cleaned = text
            .replace(/[^A-Z0-9]/gi, '')
            .trim();

        if (cleaned.length !== 5) {
            throw new Error(`CAPTCHA length invalid: expected 5, got ${cleaned.length} ("${cleaned}")`);
        }

        return cleaned;
    } catch (error) {
        throw new Error("OCR failed: " + error.message);
    }
};

/**
 * VERIFY CAPTCHA
 */
const verifyInitialCaptcha = async (page, maxRetries = 10) => {
    let attempts = 0;

    while (attempts < maxRetries) {
        attempts++;

        try {
            const captchaImage = await extractCaptcha(page);
            const processed = await preprocessCaptcha(captchaImage);
            const captchaText = await readCaptcha(processed);

            await page.waitForSelector("#ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaTextBox", timeout_option);
            await page.evaluate(() => {
                const el = document.getElementById("ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaTextBox");
                if (el) el.value = '';
            });
            await page.locator("#ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaTextBox").fill(captchaText);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 50000 }).catch(() => null),
                page.locator("#ctl00_ContentPlaceHolder1_btnVerify").click(),
            ]);

            await delay(2000);

            const newUrl = page.url();

            if (!newUrl.includes("TTCCaptcha.aspx")) {
                return true;
            }

            const hasError = await page.evaluate(() => {
                const errEl = document.querySelector("#ctl00_ContentPlaceHolder1_RadCaptcha2_ctl00");
                if (!errEl) return false;
                const style = window.getComputedStyle(errEl);
                return style && style.display !== 'none' && errEl.textContent.trim().length > 0;
            });

            if (hasError) {
                console.log("Error message visible → wrong code");
            } else {
                console.log("No navigation → likely wrong code");
            }

            if (attempts < maxRetries) {
                await page.click("#ctl00_ContentPlaceHolder1_RadCaptcha2_CaptchaImage").catch(async () => {
                    await page.reload({ waitUntil: 'domcontentloaded' });
                });
                await delay(4000);
            }
        } catch (err) {
            console.error(`Attempt ${attempts} error:`, err.message);
            if (attempts >= maxRetries) {
                throw new Error("Failed to solve CAPTCHA after max retries");
            }
            await delay(3000);
        }
    }

    throw new Error("Max CAPTCHA attempts reached");
};

/**
 * SEARCH FOR PARCEL
 */
const searchParcel = async (page, parcelNumber) => {
    const url = "https://www.kcttc.co.kern.ca.us/payment/mainsearch.aspx";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delay(2000);

    let currentUrl = page.url();
    if (currentUrl.includes("TTCCaptcha.aspx")) {
        await verifyInitialCaptcha(page);
    }

    const inputCandidates = [
        "#ctl00_ContentPlaceHolder1_txtSearchbyNumber",
        "#ContentPlaceHolder1_txtSearchbyNumber",
        "input[name*='txtSearchbyNumber']"
    ];

    let inputSelector = null;
    for (const sel of inputCandidates) {
        try {
            await page.waitForSelector(sel, { timeout: 50000 });
            inputSelector = sel;
            break;
        } catch {}
    }

    if (!inputSelector) throw new Error("Parcel input not found");

    await page.locator(inputSelector).fill(parcelNumber);

    const btnCandidates = [
        "#ctl00_ContentPlaceHolder1_btnSearch1",
        "#ContentPlaceHolder1_btnSearch1",
        "input[type='submit'][id*='btnSearch']"
    ];

    let btnSelector = null;
    for (const sel of btnCandidates) {
        try {
            await page.waitForSelector(sel, { timeout: 50000 });
            btnSelector = sel;
            break;
        } catch {}
    }

    if (!btnSelector) throw new Error("Search button not found");

    const beforeUrl = page.url();
    await page.click(btnSelector);
    await delay(4000);

    const afterUrl = page.url();
    if (afterUrl === beforeUrl) {
        throw new Error("Search failed - no navigation");
    }

    return true;
};

/**
 * Extract property info from main page
 */
const extractPropertyInfo = async (page) => {
    try {
        await page.waitForSelector("#ContentPlaceHolder1_lblAddress", { timeout: 50000 }).catch(() => {});

        const data = await page.evaluate(() => {
            return {
                property_address: document.getElementById("ContentPlaceHolder1_lblAddress")?.textContent.trim().replace(/\s+/g, ' ') || "",
                parcel_number: document.getElementById("ContentPlaceHolder1_lblParent")?.textContent.trim().replace("ATN ", "") || "",
                total_amount_due: document.getElementById("ContentPlaceHolder1_lblTotalAmtDue")?.textContent.trim() || "$0.00"
            };
        });
        data.total_amount_due = formatAmount(data.total_amount_due.replace(/[$,]/g, ''));
        return data;
    } catch (err) {
        console.error("Property info extraction failed", err);
        return { property_address: "", parcel_number: "", total_amount_due: "$0.00" };
    }
};

/**
 * EXTRACT BILL DETAILS FROM TABLE
 */
const extractBillDetails = async (page) => {
    try {
        await page.waitForSelector("#ContentPlaceHolder1_tblBills", timeout_option);

        const bills = await page.evaluate(() => {
            const bills = [];
            const table = document.getElementById("ContentPlaceHolder1_tblBills");
            if (!table) return bills;

            const rows = table.querySelectorAll("tr");
            let currentBillNumber = "";

            rows.forEach((row, idx) => {
                const cells = row.querySelectorAll("td");

                // Capture bill number from header row
                if (cells.length >= 1 && cells[0].textContent.includes("Tax Bill")) {
                    const link = cells[0].querySelector("a");
                    if (link) {
                        currentBillNumber = link.textContent.trim();
                    } else {
                        // Handle case where bill number is just text (no link)
                        const text = cells[0].textContent.trim();
                        const match = text.match(/Tax Bill\s+([\d-]+)/);
                        if (match) {
                            currentBillNumber = match[1];
                        }
                    }
                }

                // Main installment row (5 cells)
                if (cells.length === 5 && cells[1].textContent.trim() && !cells[0].hasAttribute("colspan")) {
                    const installment = {
                        bill_number: currentBillNumber,
                        installment_type: cells[1].textContent.trim(),
                        delinquent_date: cells[2].textContent.trim(),
                        amount_due: cells[3].textContent.trim(),
                        status: cells[4].textContent.trim()
                    };

                    // Check next row for penalty
                    const nextRow = rows[idx + 1];
                    if (nextRow) {
                        const nextCells = nextRow.querySelectorAll("td");
                        if (nextCells.length >= 2 && nextCells[0].textContent.includes("Penalty")) {
                            installment.penalty_if_delinquent = nextCells[1].textContent.trim();
                        }
                    }

                    bills.push(installment);
                }
            });

            return bills;
        });
        return bills;
    } catch (error) {
        console.error("Bill details error:", error.message);
        throw error;
    }
};

/**
 * NAVIGATE TO BILL SUMMARY
 */
const navigateToLatestBill = async (page) => {
    try {
        const billLink = await page.$('#ContentPlaceHolder1_tblBills a[href*="BillSummary.aspx"]');
        if (!billLink) throw new Error("No bill link found");

        await Promise.all([
            billLink.click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {})
        ]);

        await delay(2000);

        return await extractDetailedBillInfo(page);
    } catch (error) {
        console.error("Navigate to bill error:", error.message);
        throw error;
    }
};

/**
 * EXTRACT DETAILED BILL INFO
 */
const extractDetailedBillInfo = async (page) => {
    try {
        await page.waitForSelector("#ContentPlaceHolder1_lblBillNumber", timeout_option);

        const data = await page.evaluate(() => {
            const data = {
                bill_number: document.getElementById("ContentPlaceHolder1_lblBillNumber")?.textContent.trim() || "",
                assessor_tax_number: document.getElementById("ContentPlaceHolder1_lnkParent")?.textContent.trim() || "",
                tax_rate_area: document.getElementById("ContentPlaceHolder1_lblTaxRateArea")?.textContent.trim() || "",
                total_amount_due: document.getElementById("ContentPlaceHolder1_lblTotalAmountDue")?.textContent.trim() || "",
                property_address: document.getElementById("ContentPlaceHolder1_lblAddress")?.textContent.trim().replace(/\s+/g, ' ') || "",
                assessed_values: {
                    land: document.getElementById("ContentPlaceHolder1_lblLand")?.textContent.trim() || "",
                    improvements: document.getElementById("ContentPlaceHolder1_lblImprovements")?.textContent.trim() || "",
                    minerals: document.getElementById("ContentPlaceHolder1_lblMinerals")?.textContent.trim() || "",
                    personal_property: document.getElementById("ContentPlaceHolder1_lblPersonalProperty")?.textContent.trim() || "",
                    other_improvements: document.getElementById("ContentPlaceHolder1_lblOtherImprovements")?.textContent.trim() || "",
                    exemptions: document.getElementById("ContentPlaceHolder1_lblExemptions")?.textContent.trim() || "",
                    net_assessed_value: document.getElementById("ContentPlaceHolder1_lblNetAssessedValue")?.textContent.trim() || ""
                },
                installments: []
            };

            const table = document.getElementById("ContentPlaceHolder1_tblInstallments");
            if (table) {
                const rows = table.querySelectorAll("tr");

                rows.forEach((row, idx) => {
                    const cells = row.querySelectorAll("td");

                    if (cells.length === 5 && !row.classList.contains("bgNavyTableHeader")) {
                        const installment = {
                            installment_type: cells[1].textContent.trim(),
                            delinquent_date: cells[2].textContent.trim(),
                            amount_due: cells[3].textContent.trim(),
                            status: cells[4].textContent.trim()
                        };

                        const nextRow = rows[idx + 1];
                        if (nextRow) {
                            const nextCells = nextRow.querySelectorAll("td");
                            if (nextCells.length >= 2 && nextCells[0].textContent.includes("Penalty")) {
                                installment.penalty_if_delinquent = nextCells[1].textContent.trim();
                            }
                        }

                        data.installments.push(installment);
                    }
                });
            }

            return data;
        });
        data.total_amount_due = formatAmount(data.total_amount_due.replace(/[$,]/g, ''));
        Object.keys(data.assessed_values).forEach(key => {
            data.assessed_values[key] = formatAmount(data.assessed_values[key].replace(/[$,]/g, ''));
        });
        return data;
    } catch (error) {
        console.error("Detailed bill error:", error.message);
        throw error;
    }
};

/**
 * FORMAT FINAL DATA - THE CRITICAL FUNCTION
 */
const formatFinalData = (propertyData, billsData, detailedBillData) => {
    const today = new Date();
    const processedDate = today.toISOString().split('T')[0];
    const currentCalendarYear = today.getFullYear();

    const finalData = {
        processed_date: processedDate,
        order_number: "",
        borrower_name: "",
        owner_name: ["N/A"],
        property_address: detailedBillData.property_address || propertyData.property_address || "",
        parcel_number: detailedBillData.assessor_tax_number || propertyData.parcel_number || "",
        land_value: detailedBillData.assessed_values?.land || "",
        improvements: detailedBillData.assessed_values?.improvements || "",
        total_assessed_value: detailedBillData.assessed_values?.net_assessed_value || "",
        exemption: detailedBillData.assessed_values?.exemptions || "",
        total_taxable_value: detailedBillData.assessed_values?.net_assessed_value || "",
        tax_rate_area: detailedBillData.tax_rate_area || "",
        taxing_authority: "Kern County Treasurer and Tax Collector, 1115 Truxtun Avenue, Bakersfield, CA 93301, Ph: 661-868-3485",
        notes: "",
        delinquent: "NONE",
        total_amount_due: propertyData.total_amount_due || "$0.00",
        tax_history: []
    };

    const tax_history = [];

    billsData.forEach((inst) => {
        let taxYear = extractTaxYearFromBillNumber(inst.bill_number);
        if (!taxYear) {
            taxYear = currentCalendarYear.toString();
        }

        const isRedemption = isRedemptionBill(inst.bill_number, inst.installment_type);
        const paymentType = isRedemption ? "Annual" : "Semi-Annual";

        let displayInstallment = inst.installment_type;
        if (isRedemption) {
            displayInstallment = "Single (Redemption)";
        }

        const status = getInstallmentStatus(inst.status, inst.delinquent_date);

        const amountDueRaw = (inst.amount_due || "0").replace(/[$,]/g, '');
        const paidAmt = extractPaidAmount(inst.status);
        const isPaid = status === "Paid";

        const base_amount = formatAmount(isPaid ? paidAmt.replace(/[$,]/g, '') : amountDueRaw);
        const amount_paid = formatAmount(isPaid ? paidAmt.replace(/[$,]/g, '') : "0.00");
        const amount_due = formatAmount(isPaid ? "0.00" : amountDueRaw);

        const delqDateStr = inst.delinquent_date?.trim() || "";
        const delq = parseDate(delqDateStr);

        tax_history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: paymentType,
            installment_type: displayInstallment,
            status,
            base_amount,
            amount_paid,
            amount_due,
            mailing_date: "N/A",
            due_date: getDueDateFromDelq(delqDateStr, inst.installment_type, taxYear),
            delq_date: getDelqDateFormatted(delqDateStr),
            paid_date: extractPaidDate(inst.status),
            good_through_date: "",
            penalty_if_delinquent: inst.penalty_if_delinquent || ""
        });
    });

    // Sort: newest → oldest, First > Second > Redemption
    tax_history.sort((a, b) => {
        const y1 = Number(a.year);
        const y2 = Number(b.year);
        if (y1 !== y2) return y2 - y1;

        const order = { "First": 1, "Second": 2, "Single (Redemption)": 3 };
        return (order[a.installment_type] || 99) - (order[b.installment_type] || 99);
    });

    finalData.tax_history = tax_history;

    // ────────────── Find current + prior ──────────────
    const years = [...new Set(tax_history.map(h => h.year))].sort((a, b) => Number(b) - Number(a));
    const currentTaxYear = years[0] || currentCalendarYear.toString();
    const priorYears = years.slice(1);

    const currentItems = tax_history.filter(h => h.year === currentTaxYear);
    const priorItems = tax_history.filter(h => priorYears.includes(h.year));

    const currentDelinquent = currentItems.filter(h => h.status === "Delinquent").length;
    const priorUnpaid = priorItems.filter(h => h.status !== "Paid").length;

    // ────────────── Delinquent flag logic ──────────────
    if (priorUnpaid > 0 || currentDelinquent > 0) {
        finalData.delinquent = "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF";
    } else {
        finalData.delinquent = "NONE";
    }

    // ────────────── Notes in Maricopa style ──────────────
    let notes = "";
    if (priorUnpaid > 0) {
        notes = "PRIORS ARE DELINQUENT";
    } else {
        notes = "ALL PRIORS ARE PAID";
    }

    if (currentItems.length > 0) {
        const firstItem = currentItems.find(h => (h.installment_type || "").toLowerCase().startsWith("first"));
        const secondItem = currentItems.find(h => (h.installment_type || "").toLowerCase().startsWith("second"));
        const singleItem = currentItems.find(h => (h.installment_type || "").toLowerCase().includes("redemption") || (h.installment_type || "").toLowerCase().includes("single"));

        if (singleItem) {
            notes += `, ${currentTaxYear} Single (Redemption) is ${singleItem.status}`;
        } else {
            const parts = [];
            if (firstItem) parts.push(`1ST INSTALLMENT IS ${firstItem.status.toUpperCase()}`);
            if (secondItem) parts.push(`2ND INSTALLMENT IS ${secondItem.status.toUpperCase()}`);
            if (parts.length > 0) {
                notes += `, ${currentTaxYear} ${parts.join(", ")}`;
            }
        }
    }

    notes += ", NORMALLY TAXES ARE PAID SEMI-ANNUALLY. NORMAL DUE DATES ARE 11/01 AND 02/01 FOR SEMI-ANNUAL";

    finalData.notes = notes + ".";

    return finalData;
};

/**
 * MAIN SEARCH FUNCTION
 */
const account_search = async (page, parcelNumber) => {
    try {
        await searchParcel(page, parcelNumber);
        const propertyData = await extractPropertyInfo(page);
        const billsData = await extractBillDetails(page);
        const detailedBillData = await navigateToLatestBill(page);
        const finalData = formatFinalData(propertyData, billsData, detailedBillData);
        return finalData;
    } catch (error) {
        console.error("Account search failed:", error.message);
        throw error;
    }
};

/**
 * EXPRESS ROUTE HANDLER
 */
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        if (!fetch_type || (fetch_type != "html" && fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
        else if (fetch_type == "api") {
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }

    }
    catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        }
        else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
}

export { search }; 
