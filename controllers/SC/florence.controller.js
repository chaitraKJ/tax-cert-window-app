//Author:- Nithyananda R S
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const handleNotFound = (mapNumber, reason = "No tax records found for this identification number.") => ({
    processed_date: new Date().toISOString().split('T')[0],
    owner_name: ["No records found"],
    property_address: "No records found",
    parcel_number: mapNumber,
    land_value: "N/A",
    improvements: "N/A",
    total_assessed_value: "N/A",
    exemption: "N/A",
    total_taxable_value: "N/A",
    taxing_authority: "Florence County Tax Office, Florence, SC",
    notes: reason,
    delinquent: "N/A",
    tax_history: []
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatCurrency = (str) => {
    if (!str) return "$0.00";
    const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? "$0.00" : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const parseMapBlockParcel = (parcelId) => {
    if (!parcelId || parcelId.length < 10) {
        return null;
    }
    return {
        map: parcelId.substring(0, 5),
        block: parcelId.substring(5, 7),
        parcel: parcelId.substring(7, 10)
    };
};

const retryPromise = (fn, maxRetries = 3, baseDelay = 1000) => {
    return new Promise((resolve, reject) => {
        const attempt = (retryCount = 0) => {
            fn()
                .then(resolve)
                .catch((err) => {
                    if (retryCount < maxRetries) {
                        setTimeout(() => attempt(retryCount + 1), baseDelay * Math.pow(2, retryCount));
                    } else {
                        reject(err);
                    }
                });
        };
        attempt();
    });
};

const setInputValue = (page, selector, value) => {
    return page.evaluate((sel, val) => {
        const input = document.querySelector(sel);
        if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }, selector, value);
};

const extractTaxDetailsFromPage = (page) => {
    return retryPromise(() => page.waitForSelector('table', { timeout: 15000 }))
        .then(() => page.evaluate(() => {
            const getTableValue = (label) => {
                const rows = Array.from(document.querySelectorAll('table tr'));
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const firstCellText = cells[0].innerText || cells[0].textContent || '';
                        const labelText = firstCellText.trim();
                        if (labelText === label) {
                            const secondCellText = cells[1].innerText || cells[1].textContent || '';
                            const value = secondCellText.trim();
                            return value || "0";
                        }
                    }
                }
                const htmlContent = document.body.innerHTML;
                const escapedLabel = label.replace(/[-+()=.]/g, '\\$&').replace(/\s/g, '\\s*');
                const regex = new RegExp(escapedLabel + '\\s*<font color="?blue"?>\\s*([\\d,]+\\.?\\d*)', 'i');
                const numberMatch = htmlContent.match(regex);
                if (numberMatch) {
                    return numberMatch[1];
                }
                const labelIndex = htmlContent.indexOf(label);
                if (labelIndex > -1) {
                    const afterLabel = htmlContent.substring(labelIndex);
                    const simpleNumberMatch = afterLabel.match(/[\d,]+\.?[\d]*/);
                    if (simpleNumberMatch) {
                        return simpleNumberMatch[0];
                    }
                }
                return "0";
            };

            const htmlContent = document.body.innerHTML;

            let ownerName = "N/A";
            let ownerAddress = "N/A";
            const ownerInfoRegex = /Name:\s*<font color="?blue"?>([\s\S]*?)<font color="?black"?>Map:/i;
            const ownerInfoMatch = htmlContent.match(ownerInfoRegex);
            if (ownerInfoMatch) {
                const content = ownerInfoMatch[1].trim();
                const parts = content.split(/<br\s*\/?>/).map(p => p.replace(/<[^>]+>/g, '').trim()).filter(p => p);
                if (parts.length > 0) {
                    ownerName = parts[0].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                    ownerAddress = parts.slice(1).join(", ").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                }
            } else {
                const nameOnlyRegex = /Name:\s*<font color="?blue"?>\s*([A-Z0-9\s&,.-]+)/i;
                const nameMatch = htmlContent.match(nameOnlyRegex);
                if (nameMatch) {
                    ownerName = nameMatch[1].replace(/\s+$/, '').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                }
            }

            const mapMatch = htmlContent.match(/Map:\s*<font color="?blue"?>\s*(\d+)/i);
            const blockMatch = htmlContent.match(/Block:\s*<font color="?blue"?>\s*(\d+)/i);
            const parcelMatch = htmlContent.match(/Parcel:\s*<font color="?blue"?>\s*(\d+)/i);

            const map = mapMatch ? mapMatch[1].trim() : "";
            const block = blockMatch ? blockMatch[1].trim() : "";
            const parcel = parcelMatch ? parcelMatch[1].trim() : "";

            let propertyAddress = "N/A";
            const addressRegex = /Address:<br>\s*<font color="?blue"?>([\s\S]*?)<font color="?black"?>Lot Desc:/i;
            const addressMatch = htmlContent.match(addressRegex);
            if (addressMatch) {
                const rawContent = addressMatch[1];
                const lines = rawContent.split(/<br\s*\/?>/i)
                                         .map(line => line.replace(/<[^>]+>|<\/font>|&nbsp;/g, '').trim())
                                         .filter(line => line && line.length > 0 && line !== '&nbsp;');
                if (lines.length > 0) {
                    propertyAddress = lines.join(", ");
                }
            }

            const paidDateMatch = htmlContent.match(/Paid:\s*<font color="?blue"?>\s*([^\s<]+)/i);
            const paidDate = paidDateMatch ? paidDateMatch[1].trim() : "--/--/--";

            const isTaxAbated = htmlContent.match(/Tax Abated|Fee Abated/i);
            const isPaid = paidDate !== "--/--/--" || isTaxAbated;

            const cityTax = getTableValue("City Tax");
            const countyTax = getTableValue("+ County Tax");
            const cityCredit = getTableValue("- City Prop. Tax Credit");
            const countyCredit = getTableValue("- County Prop. Tax Credit");
            const hsSeExemption = getTableValue("- HS/SE Exemption");
            const totalTax = getTableValue("= Total Tax");
            const taxPenalty = getTableValue("+ Tax Penalty");
            const cost = getTableValue("+ Cost");
            const taxDue = getTableValue("= Tax Due");
            const solidWasteFee = getTableValue("+ Solid Waste Fee");
            const respondersFee = getTableValue("+ Responders Fee");
            const totalDue = getTableValue("= Total Due");

            let landValue = null;
            let bldgsValue = null;
            const landValueMatch = htmlContent.match(/Land Value.*?\s*<font color="?blue"?>\s*([\d,]+)/i);
            if (landValueMatch) {
                landValue = landValueMatch[1].replace(/,/g, '');
            }

            const bldgsValueMatch = htmlContent.match(/Bldgs Value.*?\s*<font color="?blue"?>\s*([\d,]+)/i);
            if (bldgsValueMatch) {
                bldgsValue = bldgsValueMatch[1].replace(/,/g, '');
            }

            if ((landValue === null || landValue === "0") && (bldgsValue === null || bldgsValue === "0")) {
                const assessedValueRegex = /<td[^>]*align="?right"?[^>]*>\s*<font color="?blue"?>\s*([\d,]*)\s*<br>\s*([\d,]*)\s*<br>\s*([\d,]+)\s*<\/font>/i;
                const assessedMatch = htmlContent.match(assessedValueRegex);

                if (assessedMatch) {
                    const totalAssessed = assessedMatch[3].replace(/,/g, '');
                    const firstValue = assessedMatch[1].replace(/,/g, '');
                    const secondValue = assessedMatch[2].replace(/,/g, '');

                    if (firstValue && firstValue !== "0") {
                        landValue = firstValue;
                    }
                    if (secondValue && secondValue !== "0") {
                        bldgsValue = secondValue;
                    }

                    if ((!landValue || landValue === "0") && (!bldgsValue || bldgsValue === "0") && totalAssessed !== "0") {
                        bldgsValue = totalAssessed;
                        landValue = "0";
                    }
                }
            }

            if (!landValue || landValue === "0") landValue = "N/A";
            if (!bldgsValue || bldgsValue === "0") bldgsValue = "N/A";

            const homesteadMatch = htmlContent.match(/Homestead Exemption\/%:\s*<\/font>\s*([\d.]+)/i);
            const schoolExemptionMatch = htmlContent.match(/School Exemption:\s*<\/font>\s*([\d.]+)/i);

            const homesteadExemption = homesteadMatch ? homesteadMatch[1].trim() : "0";
            const schoolExemption = schoolExemptionMatch ? schoolExemptionMatch[1].trim() : "0";

            const yearMatch = htmlContent.match(/Notice\s*#\s*<font color="?blue"?>\s*(\d{2})/i);
            let noticeYear = new Date().getFullYear().toString();
            if (yearMatch) {
                noticeYear = `20${yearMatch[1]}`;
            }

            return {
                owner_name: ownerName,
                owner_mailing_address: ownerAddress,
                property_address: propertyAddress,
                map: map,
                block: block,
                parcel: parcel,
                parcel_number: `${map}${block}${parcel}`,
                land_value: landValue,
                improvements: bldgsValue,
                city_tax: cityTax,
                county_tax: countyTax,
                city_credit: cityCredit,
                county_credit: countyCredit,
                hs_se_exemption: hsSeExemption,
                homestead_exemption: homesteadExemption,
                school_exemption: schoolExemption,
                total_tax: totalTax,
                tax_penalty: taxPenalty,
                cost: cost,
                tax_due: taxDue,
                solid_waste_fee: solidWasteFee,
                responders_fee: respondersFee,
                total_due: totalDue,
                paid_date: paidDate,
                is_paid: isPaid,
                year: noticeYear
            };
        }))
        .catch((error) => {
            console.error('Extract failed:', error.message);
            return null;
        });
};

const searchByParcelId = (page, parcelId, attemptNumber = 1, maxAttempts = 3) => {
    const parsed = parseMapBlockParcel(parcelId);
    if (!parsed) {
        return Promise.resolve(null);
    }

    const searchUrl = "https://web.florenceco.org/cgi-bin/ta/tax-inq.cgi";
    const mapBlockParcel = `${parsed.map}${parsed.block}${parsed.parcel}`;

    return page.setViewport({ width: 800, height: 600 })
        .then(() => page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 25000 }))
        .then(() => delay(800))
        .then(() => {
            return page.waitForSelector('input[name="map"]', { visible: true, timeout: 10000 })
                .then(() => {
                    return setInputValue(page, 'input[name="map"]', parsed.map)
                        .then((setMap) => {
                            if (!setMap) throw new Error('Map input not found');
                            return delay(300).then(() => setInputValue(page, 'input[name="block"]', parsed.block));
                        })
                        .then((setBlock) => {
                            if (!setBlock) throw new Error('Block input not found');
                            return delay(300).then(() => setInputValue(page, 'input[name="parcel"]', parsed.parcel));
                        })
                        .then((setParcel) => {
                            if (!setParcel) throw new Error('Parcel input not found');
                            return page.evaluate(() => ({
                                mapVal: document.querySelector('input[name="map"]').value,
                                blockVal: document.querySelector('input[name="block"]').value,
                                parcelVal: document.querySelector('input[name="parcel"]').value
                            }));
                        });
                })
                .then(() => {
                    return Promise.race([
                        page.click('input[type="submit"]')
                            .then(() => page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 })),
                        delay(15000).then(() => page.url())
                    ]);
                })
                .catch((navError) => {
                    return page.url().then(url => {
                        if (url.includes('tax-inq.cgi')) {
                            return Promise.resolve();
                        }
                        throw navError;
                    });
                });
        })
        .then(() => delay(800))
        .then(() => page.evaluate(() => document.body.innerHTML.includes("NO RECORDS FOUND")))
        .then((noResults) => {
            if (noResults) {
                return null;
            }
            const currentYearUrl = `https://web.florenceco.org/cgi-bin/ta/tax-inq.cgi?step=3&file=rpcpubf&mbp=${mapBlockParcel}`;
            
            return page.goto(currentYearUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
                .then(() => delay(800))
                .then(() => page.evaluate(() => document.body.innerHTML.includes("Notice #")))
                .then((hasResults) => {
                    if (!hasResults) {
                        return null;
                    }
                    return extractTaxDetailsFromPage(page)
                        .then((currentYearData) => ({
                            currentYearData,
                            map: parsed.map,
                            block: parsed.block,
                            parcel: parsed.parcel
                        }));
                })
                .catch((navError) => {
                    throw new Error('CURRENT_YEAR_NAV_FAILED');
                });
        })
        .catch((error) => {
            if (attemptNumber < maxAttempts && 
                (error.message === 'CURRENT_YEAR_NAV_FAILED' || 
                 error.message.includes('Navigation timeout') ||
                 error.message.includes('timeout'))) {
                return delay(2000).then(() => searchByParcelId(page, parcelId, attemptNumber + 1, maxAttempts));
            }
            
            if (error.message === 'CURRENT_YEAR_NAV_FAILED' || error.message.includes('timeout')) {
                return null;
            }
            return null;
        });
};

const collectHistoricalData = (page, map, block, parcel, currentYearData) => {
    const taxHistory = [];
    const mapBlockParcel = `${map}${block}${parcel}`;
    const currentDate = new Date();

    if (currentYearData && currentYearData.is_paid !== undefined) {
        const landVal = currentYearData.land_value === "N/A" ? 0 : parseFloat(currentYearData.land_value || 0);
        const improvVal = currentYearData.improvements === "N/A" ? 0 : parseFloat(currentYearData.improvements || 0);

        let totalAssessed = "N/A";
        if (landVal !== 0 || improvVal !== 0) {
            totalAssessed = (landVal + improvVal).toString();
        }

        const taxYear = parseInt(currentYearData.year);
        const dueDate = new Date(taxYear + 1, 0, 15);
        const delinquencyDate = new Date(taxYear + 1, 0, 16);

        let status;
        if (currentYearData.is_paid) {
            status = "Paid";
        } else if (currentDate > delinquencyDate) {
            status = "Delinquent";
        } else if (currentDate > dueDate) {
            status = "Due";
        } else {
            status = "Due";
        }

        taxHistory.push({
            jurisdiction: "County",
            year: currentYearData.year,
            status: status,
            payment_type: "Annual",
            base_amount: formatCurrency(currentYearData.total_tax),
            tax_penalty: formatCurrency(currentYearData.tax_penalty),
            cost: formatCurrency(currentYearData.cost),
            tax_due: formatCurrency(currentYearData.tax_due),
            solid_waste_fee: formatCurrency(currentYearData.solid_waste_fee),
            responders_fee: formatCurrency(currentYearData.responders_fee),
            total_due: formatCurrency(currentYearData.total_due),
            amount_paid: currentYearData.is_paid ? formatCurrency(currentYearData.total_due) : "$0.00",
            amount_due: currentYearData.is_paid ? "$0.00" : formatCurrency(currentYearData.total_due),
            paid_date: currentYearData.is_paid ? currentYearData.paid_date : " ",
            due_date: `01/15/${parseInt(currentYearData.year) + 1}`,
            delq_date: `01/16/${parseInt(currentYearData.year) + 1}`,
            land_value: currentYearData.land_value === "N/A" ? "N/A" : formatCurrency(currentYearData.land_value),
            improvements: currentYearData.improvements === "N/A" ? "N/A" : formatCurrency(currentYearData.improvements),
            total_assessed_value: totalAssessed === "N/A" ? "N/A" : formatCurrency(totalAssessed),
            tax_breakdown: {
                city_tax: formatCurrency(currentYearData.city_tax),
                county_tax: formatCurrency(currentYearData.county_tax),
                city_credit: formatCurrency(currentYearData.city_credit),
                county_credit: formatCurrency(currentYearData.county_credit),
                hs_se_exemption: formatCurrency(currentYearData.hs_se_exemption),
                homestead_exemption: formatCurrency(currentYearData.homestead_exemption),
                school_exemption: formatCurrency(currentYearData.school_exemption)
            }
        });
    }

    const currentYear = parseInt(currentYearData?.year || new Date().getFullYear().toString());
    const historicalFiles = [
        { file: 'rpcpubp1', year: (currentYear - 1).toString() },
        { file: 'rpcpubp2', year: (currentYear - 2).toString() },
        { file: 'rpcpubp3', year: (currentYear - 3).toString() }
    ];

    const collectedYears = new Set(taxHistory.map(h => h.year));

    return historicalFiles.reduce((promiseChain, historical) => {
        if (collectedYears.has(historical.year)) {
            return promiseChain;
        }
        return promiseChain.then(() => {
            const url = `https://web.florenceco.org/cgi-bin/ta/tax-inq.cgi?step=3&file=${historical.file}&mbp=${mapBlockParcel}`;
            return retryPromise(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }), 2, 500)
                .then(() => delay(300))
                .then(() => extractTaxDetailsFromPage(page))
                .then((yearData) => {
                    if (yearData && yearData.parcel_number === mapBlockParcel) {
                        const landVal = yearData.land_value === "N/A" ? 0 : parseFloat(yearData.land_value || 0);
                        const improvVal = yearData.improvements === "N/A" ? 0 : parseFloat(yearData.improvements || 0);

                        let totalAssessed = "N/A";
                        if (landVal !== 0 || improvVal !== 0) {
                            totalAssessed = (landVal + improvVal).toString();
                        }

                        const taxYear = parseInt(historical.year);
                        const dueDate = new Date(taxYear + 1, 0, 15);
                        const delinquencyDate = new Date(taxYear + 1, 0, 16);

                        let status;
                        if (yearData.is_paid) {
                            status = "Paid";
                        } else if (currentDate > delinquencyDate) {
                            status = "Delinquent";
                        } else if (currentDate > dueDate) {
                            status = "Due";
                        } else {
                            status = "Due";
                        }

                        taxHistory.push({
                            jurisdiction: "County",
                            year: historical.year,
                            status: status,
                            payment_type: "Annual",
                            base_amount: formatCurrency(yearData.total_tax),
                            tax_penalty: formatCurrency(yearData.tax_penalty || "0"),
                            cost: formatCurrency(yearData.cost || "0"),
                            tax_due: formatCurrency(yearData.tax_due),
                            solid_waste_fee: formatCurrency(yearData.solid_waste_fee),
                            responders_fee: formatCurrency(yearData.responders_fee || "0"),
                            total_due: formatCurrency(yearData.total_due),
                            amount_paid: yearData.is_paid ? formatCurrency(yearData.total_due) : "$0.00",
                            amount_due: yearData.is_paid ? "$0.00" : formatCurrency(yearData.total_due),
                            paid_date: yearData.is_paid ? yearData.paid_date : " ",
                            due_date: `01/15/${parseInt(historical.year) + 1}`,
                            delq_date: `01/16/${parseInt(historical.year) + 1}`,
                            land_value: yearData.land_value === "N/A" ? "N/A" : formatCurrency(yearData.land_value),
                            improvements: yearData.improvements === "N/A" ? "N/A" : formatCurrency(yearData.improvements),
                            total_assessed_value: totalAssessed === "N/A" ? "N/A" : formatCurrency(totalAssessed),
                            tax_breakdown: {
                                city_tax: formatCurrency(yearData.city_tax),
                                county_tax: formatCurrency(yearData.county_tax),
                                city_credit: formatCurrency(yearData.city_credit),
                                county_credit: formatCurrency(yearData.county_credit),
                                hs_se_exemption: formatCurrency(yearData.hs_se_exemption),
                                homestead_exemption: formatCurrency(yearData.homestead_exemption),
                                school_exemption: formatCurrency(yearData.school_exemption)
                            }
                        });
                    }
                })
                .catch(() => {});
        });
    }, Promise.resolve())
        .then(() => taxHistory);
};

const getTaxData = (page, parcelId) => {
    return searchByParcelId(page, parcelId)
        .then((searchResult) => {
            if (!searchResult || !searchResult.currentYearData) {
                return handleNotFound(parcelId);
            }

            const { currentYearData, map, block, parcel } = searchResult;

            return collectHistoricalData(page, map, block, parcel, currentYearData)
                .then((taxHistory) => {
                    const landVal = currentYearData.land_value === "N/A" ? 0 : parseFloat(currentYearData.land_value || 0);
                    const improvVal = currentYearData.improvements === "N/A" ? 0 : parseFloat(currentYearData.improvements || 0);

                    let totalAssessed = "N/A";
                    if (landVal !== 0 || improvVal !== 0) {
                        totalAssessed = (landVal + improvVal).toString();
                    }

                    const totalExemptions = parseFloat(currentYearData.homestead_exemption || 0) +
                                             parseFloat(currentYearData.school_exemption || 0);

                    let totalTaxable = "N/A";
                    if (totalAssessed !== "N/A") {
                        const taxableCalc = parseFloat(totalAssessed) - totalExemptions;
                        if (taxableCalc > 0) {
                            totalTaxable = taxableCalc.toString();
                        }
                    }

                    const unpaidRecords = taxHistory.filter(record => record.status !== "Paid");
                    const paidRecords = taxHistory.filter(record => record.status === "Paid");

                    let delinquencyStatus;
                    let notes;
                    let filteredTaxHistory;

                    const currentDate = new Date();
                    const ANNUAL_PAYMENT_NOTE = 'NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/15';

                    if (unpaidRecords.length > 0) {
                        filteredTaxHistory = unpaidRecords;

                        const unpaidYears = unpaidRecords.map(r => parseInt(r.year)).sort((a, b) => a - b);
                        const latestYear = unpaidYears[unpaidYears.length - 1];

                        const isDelinquent = unpaidRecords.some(record => {
                            const taxYear = parseInt(record.year);
                            const delinquencyDate = new Date(taxYear + 1, 0, 16);
                            return currentDate > delinquencyDate;
                        });

                        delinquencyStatus = isDelinquent ? "TAXES ARE DELINQUENT, NEED TO CALL FOR PAYOFF" : "NONE";
                        const latestYearDueDate = new Date(latestYear + 1, 0, 15);
                        const latestYearDelqDate = new Date(latestYear + 1, 0, 16);

                        let latestYearStatus;
                        if (currentDate > latestYearDelqDate) {
                            latestYearStatus = "DELINQUENT";
                        } else if (currentDate > latestYearDueDate) {
                            latestYearStatus = "DUE";
                        } else {
                            latestYearStatus = "DUE";
                        }
                        if (unpaidYears.length > 1) {
                            notes = `PRIORS ARE DELINQUENT, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`;
                        } else {
                            notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE ${latestYearStatus}, ${ANNUAL_PAYMENT_NOTE}`;
                        }

                    } else {
                        delinquencyStatus = "NONE";

                        paidRecords.sort((a, b) => parseInt(b.year) - parseInt(a.year));
                        const latestYearRecord = paidRecords.length > 0 ? paidRecords[0] : null;

                        if (latestYearRecord) {
                            const latestYear = parseInt(latestYearRecord.year);
                            notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID, ${ANNUAL_PAYMENT_NOTE}`;
                            filteredTaxHistory = [latestYearRecord];
                        } else {
                            notes = `ALL PRIORS ARE PAID, NORMALLY TAXES ARE PAID ANNUAL, NORMAL DUE DATE IS 01/15`;
                            filteredTaxHistory = [];
                        }
                    }

                    filteredTaxHistory.sort((a, b) => {
                        const aYear = parseInt(a.year);
                        const bYear = parseInt(b.year);
                        const aUnpaid = a.status !== "Paid";
                        const bUnpaid = b.status !== "Paid";

                        if (aUnpaid && bUnpaid) {
                            return aYear - bYear;
                        } else if (!aUnpaid && !bUnpaid) {
                            return bYear - aYear;
                        }
                        return aUnpaid ? -1 : 1;
                    });

                    return {
                        processed_date: new Date().toISOString().split('T')[0],
                        owner_name: [currentYearData.owner_name],
                        owner_mailing_address: currentYearData.owner_mailing_address,
                        property_address: currentYearData.property_address,
                        parcel_number: currentYearData.parcel_number,
                        land_value: currentYearData.land_value === "N/A" ? "N/A" : formatCurrency(currentYearData.land_value),
                        improvements: currentYearData.improvements === "N/A" ? "N/A" : formatCurrency(currentYearData.improvements),
                        total_assessed_value: totalAssessed === "N/A" ? "N/A" : formatCurrency(totalAssessed),
                        exemption: formatCurrency(totalExemptions.toString()),
                        total_taxable_value: totalTaxable === "N/A" ? "N/A" : formatCurrency(totalTaxable),
                        taxing_authority: "Florence County Tax Office, Florence, SC",
                        notes: notes,
                        delinquent: delinquencyStatus,
                        tax_history: filteredTaxHistory,
                        property_details: {
                            map: map,
                            block: block,
                            parcel: parcel,
                            acres: "N/A",
                            lot_description: "N/A"
                        }
                    };
                });
        })
        .catch((error) => {
            console.error('getTaxData failed:', error.message);
            return handleNotFound(parcelId);
        });
};

const search = (req, res) => {
    const { fetch_type, account } = req.body;

    if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
        return res.status(400).send("Invalid request type.");
    }

    if (!account || !account.trim()) {
        return res.status(400).send("Parcel ID is required.");
    }

    const trimmedAccount = account.trim().replace(/\s+/g, '');

    let browserContext = null;
    let page = null;

    getBrowserInstance()
        .then((browser) => browser.createBrowserContext())
        .then((context) => {
            browserContext = context;
            return context.newPage();
        })
        .then((newPage) => {
            page = newPage;
            page.setDefaultNavigationTimeout(30000);
            return page.setRequestInterception(true);
        })
        .then(() => {
            page.on("request", (reqInt) => {
                const resourceType = reqInt.resourceType();
                if (["stylesheet", "font", "image", "media", "other"].includes(resourceType)) {
                    reqInt.abort();
                } else {
                    reqInt.continue();
                }
            });
            return getTaxData(page, trimmedAccount);
        })
        .then((data) => {
            if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
            } else {
                res.status(200).json({ result: data });
            }
        })
        .catch((error) => {
            const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
            console.error('Overall search failed:', errorMessage);
            if (fetch_type === "html") {
                res.status(500).render('error_data', { error: true, message: errorMessage });
            } else {
                res.status(500).json({ error: true, message: errorMessage });
            }
        })
        .finally(() => {
            if (browserContext) {
                browserContext.close().catch((err) => console.error('Context close failed:', err));
            }
        });
};

export { search };
