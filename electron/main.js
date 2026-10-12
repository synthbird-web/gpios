const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('./server');

// Catch any unhandled error, log it and show an informative dialog
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()}\n${err.stack || err.message}\n\n`);
  } catch {}
  dialog.showErrorBox('GPIOS — Unexpected error', `${err.message}\n\n${err.stack || ''}`);
});

let mainWindow = null;
let localServer = null;
let serverUrl = null;

// Database location (persistent, writable copy when packaged)
function getDatabasePath() {
  const seedDbPath = fs.existsSync(path.join(__dirname, '..', 'gpios.db'))
    ? path.join(__dirname, '..', 'gpios.db')
    : path.join(__dirname, '..', 'cuaderno.db');

  if (!app.isPackaged) return seedDbPath;

  // In production the app bundle is read-only: work on a copy inside userData
  const userDataDir = app.getPath('userData');
  const userDbPath = path.join(userDataDir, 'gpios.db');
  const legacyUserDbPath = path.join(userDataDir, 'cuaderno.db');

  if (!fs.existsSync(userDbPath)) {
    if (fs.existsSync(legacyUserDbPath)) {
      try {
        fs.renameSync(legacyUserDbPath, userDbPath);
        console.log(`[DB] Renamed legacy user database to: ${userDbPath}`);
      } catch (e) {
        return legacyUserDbPath;
      }
    } else if (fs.existsSync(seedDbPath)) {
      try {
        fs.copyFileSync(seedDbPath, userDbPath);
        console.log(`[DB] Seed database copied to: ${userDbPath}`);
      } catch (e) {
        console.error('[DB] Could not copy seed database:', e);
        return seedDbPath;
      }
    }
  }
  return fs.existsSync(userDbPath) ? userDbPath : seedDbPath;
}

// Minimal menu. On macOS an Edit menu is required, otherwise Cmd+C / Cmd+V
// do not work inside text fields.
function setupMenu() {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
}

// Allow only the permissions the app actually needs (GPS location)
function setupPermissions() {
  const allowed = new Set(['geolocation']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

async function ensureServer() {
  if (serverUrl) return serverUrl;
  localServer = createServer({ baseDir: path.join(__dirname, '..'), dbPath: getDatabasePath() });
  // Fixed preferred port keeps the web origin stable between launches; fall back to a random one
  try {
    ({ url: serverUrl } = await localServer.start(47615, '127.0.0.1'));
  } catch {
    localServer = createServer({ baseDir: path.join(__dirname, '..'), dbPath: getDatabasePath() });
    ({ url: serverUrl } = await localServer.start(0, '127.0.0.1'));
  }
  return serverUrl;
}

async function createWindow() {
  try {
    const url = await ensureServer();

    mainWindow = new BrowserWindow({
      width: 1366,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      title: 'GPIOS',
      icon: path.join(__dirname, '..', 'static', 'icon-256.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      },
      backgroundColor: '#0f1f18'
    });

    // External links (map attributions, docs) open in the system browser,
    // never inside the app window.
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:\/\//.test(target)) shell.openExternal(target);
      return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, target) => {
      if (!target.startsWith(url)) {
        event.preventDefault();
        if (/^https?:\/\//.test(target)) shell.openExternal(target);
      }
    });

    await mainWindow.loadURL(url);
    mainWindow.on('closed', () => { mainWindow = null; });
  } catch (err) {
    console.error('[FATAL START ERROR]', err);
    dialog.showErrorBox('GPIOS — Startup error', `The internal service could not be started:\n\n${err.message}`);
  }
}

app.whenReady().then(() => {
  setupMenu();
  setupPermissions();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Persist the database exactly once, when the app really quits
app.on('before-quit', async (event) => {
  if (!localServer) return;
  event.preventDefault();
  const srv = localServer;
  localServer = null;
  try { await srv.stop(); } catch {}
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
