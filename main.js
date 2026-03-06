const { app, BrowserWindow } = require('electron');
const { updateElectronApp } = require('update-electron-app');
// updateElectronApp();

require("./index.js");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
            width: 1200,
            height: 700,
            webPreferences: {
                nodeIntegration: true,
        },
    });

    app.isPackaged
        ? mainWindow.loadFile(path.join(__dirname, "views/order_search.html")) // Prod
        : mainWindow.loadURL("http://localhost:3000"); // Dev

    mainWindow.on('ready-to-show', () => {
        if (!mainWindow) {
              throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
              mainWindow.minimize();
        } else {
              mainWindow.show();
        }
    });

    mainWindow.on("closed", function () {
            mainWindow = null;
    });
}

if (app){ 
    app.on("ready", createWindow);

    app.on("resize", function (e, x, y) {
        mainWindow.setSize(x, y);
    });

    app.on("window-all-closed", function () {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
}

