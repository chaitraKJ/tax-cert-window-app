const puppeteer = require("puppeteer");
const fs = require('fs'); 
const path = require("path");
const electron = require('electron');

let exPath="";

let instance = null;
const getBrowserInstance = async () => { 
    try{
        if (!instance){
            let local_file_path = path.join(electron.app.getPath('userData'), 'chrome_file_path.txt');
            if (fs.existsSync(local_file_path)) {
                const data = fs.readFileSync(local_file_path, 'utf-8');
                exPath = data;

                instance = await puppeteer.launch({
                    executablePath: exPath,
                    headless: true,
                    args: [
                        '--disable-gpu',
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--lang="en-US"',
                        '--disable-features=HttpsFirstBalancedModeAutoEnable'
                    ]
                });
                console.log("Instance Initiated");
            }
        }    
        return instance;       
    }
    catch(error){
        console.log(error);
    }
}

module.exports = getBrowserInstance;