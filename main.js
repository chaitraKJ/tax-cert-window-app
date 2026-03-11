const electron = require('electron');
const fs = require('fs'); 
const path = require("path");

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

    electron.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [  
            { name: 'All Files', extensions: ['*'] }
        ]
    }).then(result => {
        let is_cancelled = result.canceled;
        let filePaths = result.filePaths;

        if(is_cancelled || filePaths.length == 0){
            electron.app.quit();
        }
        else{
            let chrome_file_path = filePaths[0];
            let local_file_path = path.join(electron.app.getPath('userData'), 'chrome_file_path.txt');
            fs.writeFileSync(local_file_path, chrome_file_path, 'utf-8');
            mainWindow.loadURL("http://localhost:3000");
        }        
    }).catch(err => {
        console.log(err);
    });

    // electron.app.isPackaged
    //     ? mainWindow.loadFile(path.join(__dirname, "views/order_search.html")) // Prod
    //     : mainWindow.loadURL("http://localhost:3000"); // Dev   

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