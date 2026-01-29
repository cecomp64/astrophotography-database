import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

// Log everything to file for debugging
const fs = require("fs");
const logFile = path.join(app.getPath("userData"), "app.log");
const log = (msg: string) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  console.log(logMsg);
  fs.appendFileSync(logFile, logMsg);
};

log(`App starting... isDev=${isDev}`);

const createWindow = () => {
  log("Creating window...");
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.cjs"),
      },
    });

    if (isDev) {
      log("Loading dev URL: http://localhost:5173");
      mainWindow.loadURL("http://localhost:5173");
      mainWindow.webContents.openDevTools();
    } else {
      const indexPath = path.join(__dirname, "../dist/index.html");
      log(`Loading file: ${indexPath}`);
      mainWindow.loadFile(indexPath);
    }

    mainWindow.on("closed", () => {
      log("Window closed");
      mainWindow = null;
    });

    mainWindow.webContents.on("crashed", () => {
      log("Renderer process crashed");
      dialog.showErrorBox("Error", "The application has crashed");
    });

    log("Window created successfully");
  } catch (error) {
    log(`Error creating window: ${error}`);
    throw error;
  }
};

const startBackend = async () => {
  return new Promise<void>((resolve, reject) => {
    try {
      if (isDev) {
        // Development: Run FastAPI directly with Python
        const pythonPath = process.env.PYTHON_PATH || "python3";
        log(`Starting backend: ${pythonPath}`);
        
        apiProcess = spawn(pythonPath, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
          cwd: path.join(__dirname, "../backend"),
          stdio: ["ignore", "pipe", "pipe"],
        });

        apiProcess.stdout?.on("data", (data) => {
          log(`[API] ${data}`);
          if (data.toString().includes("Uvicorn running")) {
            resolve();
          }
        });

        apiProcess.stderr?.on("data", (data) => {
          log(`[API Error] ${data}`);
        });

        apiProcess.on("error", (error) => {
          log(`Failed to start backend: ${error}`);
          reject(error);
        });
      } else {
        // Production: Use bundled Python executable (PyInstaller)
        const executablePath = path.join(
          process.resourcesPath,
          "backend",
          process.platform === "win32" ? "api.exe" : "api"
        );

        log(`Starting bundled backend: ${executablePath}`);

        apiProcess = spawn(executablePath, ["--host", "127.0.0.1", "--port", "8000"], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        apiProcess.stdout?.on("data", (data) => {
          log(`[API] ${data}`);
        });

        apiProcess.stderr?.on("data", (data) => {
          log(`[API Error] ${data}`);
        });

        apiProcess.on("error", (error) => {
          log(`Failed to start backend: ${error}`);
          reject(error);
        });
      }

      // Give the backend time to start
      setTimeout(() => {
        log("Backend startup timeout - proceeding anyway");
        resolve();
      }, 3000);
    } catch (error) {
      log(`Error in startBackend: ${error}`);
      reject(error);
    }
  });
};

app.on("ready", async () => {
  log("App ready event fired");
  try {
    await startBackend();
    log("Backend started, creating window");
    createWindow();
  } catch (error) {
    log(`Error in app ready: ${error}`);
    dialog.showErrorBox("Startup Error", `Failed to start application: ${error}`);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  log("All windows closed");
  // Kill the backend process
  if (apiProcess) {
    log("Killing backend process");
    apiProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  log("Activate event fired");
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("uncaught-exception", (error) => {
  log(`Uncaught exception: ${error}`);
  dialog.showErrorBox("Error", `An unexpected error occurred: ${error}`);
});

// File dialog for file picker
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "FITS Files", extensions: ["fits", "fit"] }],
  });
  return result.filePaths;
});
