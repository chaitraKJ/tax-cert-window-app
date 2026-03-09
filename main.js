const electron = require('electron');
// require('update-electron-app')();
require("./index.js");

let mainWindow;

function createWindow() {
    mainWindow = new electron.BrowserWindow({
        width: 1200,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
        },
    });

    // electron.app.isPackaged
    //     ? mainWindow.loadFile(path.join(__dirname, "views/order_search.html")) // Prod
    //     : mainWindow.loadURL("http://localhost:3000"); // Dev

    mainWindow.loadURL("http://localhost:3000")

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

electron.app.whenReady().then(() =>{
    createWindow();

    electron.app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    })
});

electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') 
        electron.app.quit();
});