import puppeteer from "puppeteer";
import fs from "fs";

(async () => {

    // BROWSER OPTIONS
    const launch_options = {
        headless: true,
        args: [
            '--disable-features=site-per-process', 
            '--disable-gpu',
            '--no-sandbox', 
            '--disable-setuid-sandbox',
        ],
    };

    // LAUNCH THE PUPPETEER
    const browser = await puppeteer.launch(launch_options);

    // STORE THE BROWSER ENDPOINT IN FILE - @wsEndPoint.json
    const wsEndPoint = browser.wsEndpoint();
    await fs.writeFile("./utils/chromium/wsEndPoint.json", JSON.stringify({ wsEndPoint }), null, (error) => {
        console.log(error);
    });

})();