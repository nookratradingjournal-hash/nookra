import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Update pipeline (CJS helper) ────────────────────────────────────────
// Registers IPC handlers: update:get-latest, update:get-current-version,
// update:get-platform, update:open-download, update:list, update:save,
// update:delete. See electron/updatePipeline.cjs for details.
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

// ── IPC: window resize (compact activation ↔ full journal) ─────────────────
// macOS quirk: setSize() is silently dropped when the window is currently
// non-resizable. The window is created with resizable:false, so resize
// requests were no-ops. Unlock briefly, commit the size, then restore.
ipcMain.on('resize-window', (event, { width, height, animate, resizable, maximize }) => {
  if (!mainWindow) return;

  const prevResizable = mainWindow.isResizable();
  if (!prevResizable) {
    mainWindow.setResizable(true);
    mainWindow.setMaximizable(true);
  }

  if (maximize) {
    mainWindow.maximize();
  } else {
    const [curW, curH] = mainWindow.getSize();
    if (curW !== width || curH !== height) {
      if (animate && process.platform === 'darwin') {
        const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
        mainWindow.setSize(width, height, true);
        mainWindow.setPosition(
          Math.round((sw - width) / 2),
          Math.round((sh - height) / 2),
          true
        );
      } else {
        mainWindow.setSize(width, height);
        mainWindow.center();
      }
    }
  }

  if (typeof resizable === 'boolean') {
    mainWindow.setResizable(resizable);
    mainWindow.setMaximizable(resizable);
  }

  if (!mainWindow.isVisible()) mainWindow.show();
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 580,
    resizable: false,
    maximizable: false,
    show: false,
    center: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

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