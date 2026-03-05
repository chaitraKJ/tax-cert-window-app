import puppeteer from "puppeteer";
import cp from "node:child_process";
import { readFileSync } from "fs"; 

let browser = null;

// LAUNCH A BROWSER INSTANCE
async function launch() {
	cp.spawn('node', ['utils/chromium/chromiumLauncher.js'], {
		detached: true,
		shell: true
	});
}

// GET THE WS-END-POINT FROM @wsEndPoint.json
async function getSettings() {
	try {
		const data = readFileSync('./utils/chromium/wsEndPoint.json');
		return JSON.parse(data);
	} 
	catch (error) {
		console.log(error);
		return null;
	}
}

// CONNECT TO THE BROWSER INSTANCE OR CREATE AND CONNECT TO NEW BROWSER INSTANCE
async function connect(){
	if(browser){
		return browser;
	}

	// GET THE BROWSER END POINTS
	let browser_data = await getSettings();
	if(!browser_data){
		await launch();
		browser_data = await getSettings();
	}
	else if(browser_data){
		if(!browser_data['wsEndPoint']){
			await launch();
			browser_data = await getSettings();
		}
	}

	try{
		browser = await puppeteer.connect({browserWSEndpoint: browser_data.wsEndpoint});
	}
	catch(e){
		console.log(e);
		const err = e.error || e;
	    if (err.code === "ECONNREFUSED") {
	      	console.log("con ref");
	      	await launch();
	      	browser_data = await getSettings();
	      	browser = await puppeteer.connect({browserWSEndpoint: browser_data.wsEndpoint});
	    }
	}
	return browser;
}

async function connect_start(){
	await launch();
	let browser_data = await getSettings();
	browser = await puppeteer.connect({browserWSEndpoint: browser_data.wsEndpoint});
	return browser;
}

export { connect_start, connect };