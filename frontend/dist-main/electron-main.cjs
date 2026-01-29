"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const child_process_1 = require("child_process");
const isDev = !electron_1.app.isPackaged;
let mainWindow = null;
let apiProcess = null;
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, "preload.cjs"),
        },
    });
    if (isDev) {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, "../dist/index.html"));
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
};
const startBackend = async () => {
    return new Promise((resolve) => {
        if (isDev) {
            // Development: Run FastAPI directly with Python
            const pythonPath = process.env.PYTHON_PATH || "python3";
            apiProcess = (0, child_process_1.spawn)(pythonPath, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
                cwd: path_1.default.join(__dirname, "../backend"),
                stdio: ["ignore", "pipe", "pipe"],
            });
            apiProcess.stdout?.on("data", (data) => {
                console.log(`[API] ${data}`);
                if (data.toString().includes("Uvicorn running")) {
                    resolve(true);
                }
            });
            apiProcess.stderr?.on("data", (data) => {
                console.error(`[API Error] ${data}`);
            });
        }
        else {
            // Production: Use bundled Python executable (PyInstaller)
            const executablePath = path_1.default.join(process.resourcesPath, "backend", process.platform === "win32" ? "api.exe" : "api");
            apiProcess = (0, child_process_1.spawn)(executablePath, ["--host", "127.0.0.1", "--port", "8000"], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            apiProcess.stdout?.on("data", (data) => {
                console.log(`[API] ${data}`);
            });
            apiProcess.stderr?.on("data", (data) => {
                console.error(`[API Error] ${data}`);
            });
        }
        // Give the backend time to start
        setTimeout(() => resolve(true), 3000);
    });
};
electron_1.app.on("ready", async () => {
    await startBackend();
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    // Kill the backend process
    if (apiProcess) {
        apiProcess.kill();
    }
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});
// File dialog for file picker
electron_1.ipcMain.handle("open-file-dialog", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "FITS Files", extensions: ["fits", "fit"] }],
    });
    return result.filePaths;
});
//# sourceMappingURL=electron-main.cjs.map