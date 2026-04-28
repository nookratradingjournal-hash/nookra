import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Update pipeline — shared handlers ───────────────────────────────────
const require = createRequire(import.meta.url);
const updatePipeline = require('./electron/updatePipeline.cjs');
updatePipeline.register();

// ── IPC: device name ────────────────────────────────────────────────────────
ipcMain.on('get-device-name', (event) => {
  let name;
  if (process.platform === 'darwin') {
    try {
      name = execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8' }).trim();
    } catch {
      name = os.hostname().replace(/\.local$/, '');
    }
  } else {
    name = os.hostname();
  }
  event.returnValue = name;
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dist-admin', 'admin.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
