import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

// Log everything to file for debugging
const fs = require("fs");
let logFile: string;

const initLog = () => {
  try {
    logFile = path.join(app.getPath("userData"), "app.log");
    // Create directory if needed
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    logFile = "/tmp/astrophotography-app.log";
  }
};

const log = (msg: string) => {
  if (!logFile) initLog();
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  console.log(logMsg);
  try {
    fs.appendFileSync(logFile, logMsg);
  } catch (e) {
    console.error("Failed to write to log:", e);
  }
};

// Get app directory - compute lazily to avoid __dirname issues
const getAppDir = (): string => {
  try {
    if (!app.isPackaged) {
      log("Dev mode: using cwd");
      return process.cwd();
    }
    // In production, resourcesPath should be defined
    const resourcesPath = process.resourcesPath;
    log(`Resources path: ${resourcesPath}`);
    
    if (!resourcesPath) {
      log("Warning: process.resourcesPath is undefined, using cwd");
      return process.cwd();
    }
    // Simple string concatenation instead of path.join
    const appDir = resourcesPath + "/app";
    log(`App dir: ${appDir}`);
    return appDir;
  } catch (e) {
    log(`Error getting app dir: ${e}`);
    return process.cwd();
  }
};

const getPreloadPath = (): string => {
  try {
    const appDir = getAppDir();
    if (!appDir) {
      log("Warning: appDir is empty");
      return "";
    }
    const preloadPath = appDir + "/dist-main/preload.cjs";
    log(`Preload path: ${preloadPath}`);
    return preloadPath;
  } catch (e) {
    log(`Error getting preload path: ${e}`);
    return "";
  }
};

const getBackendPath = (): string => {
  try {
    const appDir = getAppDir();
    if (!appDir) {
      log("Warning: appDir is empty");
      return "";
    }
    const backendPath = appDir + "/backend";
    log(`Backend path: ${backendPath}`);
    return backendPath;
  } catch (e) {
    log(`Error getting backend path: ${e}`);
    return "";
  }
};

const createWindow = () => {
  log("Creating window...");
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: getPreloadPath(),
      },
    });

    if (!app.isPackaged) {
      log("Loading dev URL: http://localhost:5173");
      mainWindow.loadURL("http://localhost:5173");
      mainWindow.webContents.openDevTools();
    } else {
      // In production, use relative path from the app root
      // The dist folder should be at the same level as dist-main
      const indexPath = "file://" + getAppDir() + "/dist/index.html";
      log(`Loading URL: ${indexPath}`);
      mainWindow.loadURL(indexPath);
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
      // FIXME: Only start backend in dev for now.  Eventually only start in production.
      //if (!app.isPackaged) {
      if (true) {
        // Development: Run FastAPI directly with Python
        const pythonPath = process.env.PYTHON_PATH || "python3";
        log(`Starting backend: ${pythonPath}`);
        
        const backendPath = getBackendPath();
        log(`Backend path: ${backendPath}`);
        
        if (!backendPath) {
          throw new Error("Backend path is empty");
        }
        
        apiProcess = spawn(pythonPath, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
          cwd: backendPath,
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
        // Production: For now, just resolve without backend
        log("Production mode: skipping backend for now");
        resolve();
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
  try {
    initLog();
    log("App ready event fired");
    log(`App packaged: ${app.isPackaged}`);
    log(`CWD: ${process.cwd()}`);
    log(`Resources path: ${process.resourcesPath}`);
    
    await startBackend();
    log("Backend started, creating window");
    createWindow();
  } catch (error) {
    const errMsg = `Error in app ready: ${error}`;
    log(errMsg);
    dialog.showErrorBox("Startup Error", errMsg);
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

process.on("uncaughtException", (error) => {
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
