const puppeteer = require("puppeteer");

let instance = null;
const getBrowserInstance = async () => {
    if (!instance){
        instance = await puppeteer.launch({
            headless: true,
            args: [
                '--disable-gpu',
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--lang="en-US"',
                '--disable-features=HttpsFirstBalancedModeAutoEnable'
            ]
        });
        console.log("Instance Initiated")
    }    
    return instance;
}

module.exports = getBrowserInstance;