import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
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
      apiProcess = spawn(pythonPath, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8833"], {
        cwd: path.join(__dirname, "../backend"),
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
    } else {
      // Production: Use bundled Python executable (PyInstaller)
      const executablePath = path.join(
        process.resourcesPath,
        "backend",
        process.platform === "win32" ? "api.exe" : "api"
      );

      apiProcess = spawn(executablePath, ["--host", "127.0.0.1", "--port", "8833"], {
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

app.on("ready", async () => {
  await startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  // Kill the backend process
  if (apiProcess) {
    apiProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// File dialog for file picker
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "FITS Files", extensions: ["fits", "fit"] }],
  });
  return result.filePaths;
});
