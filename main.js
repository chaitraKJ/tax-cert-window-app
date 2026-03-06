const electron = require('electron');
const { updateElectronApp } = require('update-electron-app');
// updateElectronApp();

let mainWindow;

function createWindow() {
    mainWindow = new electron.BrowserWindow({
        width: 1200,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
        },
    });

    electron.app.isPackaged
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

require("./index.js");

electron.app.on('on', () =>{ 
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