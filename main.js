// Proceso principal de Electron.
// Se encarga de: la ventana, la configuración local (carpeta de datos elegida),
// leer/escribir los JSON de forma atómica, vigilar cambios externos (OneDrive)
// y crear respaldos diarios.

const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;

// Archivos de datos permitidos dentro de la carpeta elegida.
const ALLOWED = new Set(['movimientos.json', 'compras.json', 'tags.json', 'deudas.json', 'sueldos.json', 'ajustes.json']);
const BACKUP_DIR = 'respaldos';
const BACKUPS_TO_KEEP = 14;

const isDev = process.argv.includes('--dev');
const configPath = () => path.join(app.getPath('userData'), 'config.json');

let config = { dataDir: null, bounds: null, maximized: false };
let win = null;
let watcher = null;
let lastOwnWrite = 0;
let changeTimer = null;

const pad = (n) => String(n).padStart(2, '0');

// Registro de arranque en %TEMP%/app-finanzas-arranque.log (fuera de la carpeta de la app,
// por si esa carpeta está bloqueada). Sirve para diagnosticar si la ventana no aparece.
const TRACE_FILE = path.join(os.tmpdir(), 'app-finanzas-arranque.log');
function trace(msg) {
  try { fs.appendFileSync(TRACE_FILE, `[${new Date().toISOString()}] [pid ${process.pid}] ${msg}\n`); } catch { /* nada */ }
}
try { if (fs.statSync(TRACE_FILE).size > 200 * 1024) fs.writeFileSync(TRACE_FILE, ''); } catch { /* no existe */ }
trace(`--- inicio (main v4) exe=${process.execPath} packaged=${app.isPackaged}`);

// Registro de errores en %APPDATA%/App Finanzas/errores.log (útil en la versión instalada).
function logError(...parts) {
  try {
    const line = `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack : String(p))).join(' ')}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'errores.log'), line);
  } catch { /* nada */ }
  trace(`ERROR ${parts.map((p) => (p instanceof Error ? p.stack : String(p))).join(' ')}`);
  console.error(...parts);
}
process.on('uncaughtException', (e) => logError('uncaughtException', e));
process.on('unhandledRejection', (e) => logError('unhandledRejection', e));

/** Descarta posiciones guardadas que quedaron fuera de todas las pantallas. */
function boundsValidos(b) {
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
  if (b.width < 400 || b.height < 300) return null;
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x
    && b.y + 50 < a.y + a.height && b.y + b.height - 50 > a.y);
  return visible ? b : null;
}

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch { /* primera vez */ }
  if (config.dataDir && !fs.existsSync(config.dataDir)) config.dataDir = null;
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('No se pudo guardar config:', e);
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    ...(boundsValidos(config.bounds) || {}),
    show: false,
    backgroundColor: '#080a12',
    title: 'App Finanzas',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 16 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#9aa1b8', height: 38 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  trace('ventana creada');
  win.on('show', () => trace(`ventana visible ${JSON.stringify(win.getBounds())}`));
  // En algunos equipos Windows una ventana oculta no se dibuja y 'ready-to-show' nunca llega,
  // así que se muestra apenas termina de cargar la página (el fondo oscuro evita parpadeos).
  win.webContents.on('did-finish-load', () => { trace('pagina cargada'); mostrar(); });
  const mostrar = () => {
    if (!win || win.isDestroyed() || win.isVisible()) return;
    if (config.maximized) win.maximize();
    win.show();
    win.focus();
  };
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { trace('ready-to-show'); mostrar(); });
  setTimeout(() => { trace('respaldo 4s'); mostrar(); }, 4000); // respaldo: nunca dejar la ventana oculta
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => { logError('did-fail-load', code, desc, url); mostrar(); });
  win.webContents.on('render-process-gone', (_e, d) => logError('render-process-gone', JSON.stringify(d)));
  win.webContents.on('console-message', (e) => {
    const level = e.level ?? e.params?.level;
    if (level === 'error' || level === 3) logError('renderer:', e.message ?? e.params?.message);
  });

  win.on('close', () => {
    // getNormalBounds evita guardar la posición "fuera de pantalla" de una ventana minimizada.
    config.bounds = win.getNormalBounds();
    config.maximized = win.isMaximized();
    saveConfig();
  });

  // Links externos siempre en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- Vigilancia de cambios externos (otro dispositivo vía OneDrive) ----------
function startWatcher() {
  stopWatcher();
  if (!config.dataDir) return;
  try {
    watcher = fs.watch(config.dataDir, (_evt, filename) => {
      if (!filename || !ALLOWED.has(String(filename))) return;
      if (Date.now() - lastOwnWrite < 2000) return; // fue nuestra propia escritura
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        if (win && !win.isDestroyed()) win.webContents.send('data:changed');
      }, 600);
    });
  } catch (e) {
    console.error('No se pudo vigilar la carpeta:', e);
  }
}

function stopWatcher() {
  if (watcher) watcher.close();
  watcher = null;
}

// ---------- Escritura atómica ----------
async function writeAtomic(file, data) {
  const text = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  lastOwnWrite = Date.now();
  await fsp.writeFile(tmp, text, 'utf8');
  try {
    await fsp.rename(tmp, file);
  } catch {
    // Algunos sincronizadores bloquean el rename: escribimos directo.
    await fsp.writeFile(file, text, 'utf8');
    await fsp.rm(tmp, { force: true });
  }
  lastOwnWrite = Date.now();
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => ({ dataDir: config.dataDir, platform: process.platform }));

ipcMain.handle('folder:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Elige la carpeta de datos',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  config.dataDir = res.filePaths[0];
  saveConfig();
  startWatcher();
  return config.dataDir;
});

ipcMain.handle('folder:open', async () => {
  if (config.dataDir) await shell.openPath(config.dataDir);
});

ipcMain.handle('data:read', async (_e, name) => {
  if (!ALLOWED.has(name) || !config.dataDir) return { ok: false, error: 'Archivo no permitido' };
  const file = path.join(config.dataDir, name);
  try {
    const text = await fsp.readFile(file, 'utf8');
    if (!text.trim()) return { ok: true, data: null, empty: true };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, data: null, missing: true };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('data:write', async (_e, name, data) => {
  if (!ALLOWED.has(name) || !config.dataDir) return { ok: false, error: 'Archivo no permitido' };
  try {
    await writeAtomic(path.join(config.dataDir, name), data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Un respaldo por día (se conservan los últimos 14).
ipcMain.handle('data:backup', async () => {
  if (!config.dataDir) return { ok: false };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const root = path.join(config.dataDir, BACKUP_DIR);
  const dir = path.join(root, stamp);
  if (fs.existsSync(dir)) return { ok: true, skipped: true };
  try {
    await fsp.mkdir(dir, { recursive: true });
    for (const f of ALLOWED) {
      try { await fsp.copyFile(path.join(config.dataDir, f), path.join(dir, f)); } catch { /* no existe aún */ }
    }
    const all = (await fsp.readdir(root)).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_TO_KEEP))) {
      await fsp.rm(path.join(root, old), { recursive: true, force: true });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Ciclo de vida ----------
// Una sola instancia: si ya está abierta, se trae al frente en vez de abrir otra.
const gotLock = app.requestSingleInstanceLock();
trace(`userData=${app.getPath('userData')} lock=${gotLock}`);
app.on('child-process-gone', (_e, d) => trace(`proceso hijo terminado: ${JSON.stringify(d)}`));
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  trace('app lista');
  if (!gotLock) { trace('otra instancia ya esta abierta: esta se cierra'); return; }
  loadConfig();
  trace(`config cargada dataDir=${config.dataDir}`);
  createWindow();
  startWatcher();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});
