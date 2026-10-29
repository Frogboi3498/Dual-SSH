const { app, BrowserWindow, ipcMain, clipboard, safeStorage, nativeTheme, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('ssh2');

const MAX_SERVERS = 4;

// First-run defaults. Everything can be changed in the app (Edit / Add server).
const DEFAULT_SERVERS = [
  { name: 'Node 1', host: '100.73.151.98', port: 22, username: 'server1', password: '1234' },
  { name: 'Node 2', host: '100.84.158.22', port: 22, username: 'server2', password: '1234' },
];

// ---------------------------------------------------------------- storage
const storeFile = () => path.join(app.getPath('userData'), 'servers.json');

function encryptPw(plain) {
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return { e: safeStorage.encryptString(String(plain)).toString('base64') };
    }
  } catch (_) {}
  return { p: String(plain) };
}

function decryptPw(obj) {
  if (!obj) return '';
  try {
    if (obj.e) return safeStorage.decryptString(Buffer.from(obj.e, 'base64'));
  } catch (_) {}
  return obj.p || '';
}

function makeRecord(s, existing) {
  const port = parseInt(s.port, 10);
  const hasNewPw = typeof s.password === 'string' && s.password !== '';
  return {
    id: (existing && existing.id) || crypto.randomUUID(),
    name: String(s.name || s.host || 'Server').slice(0, 60),
    host: String(s.host || '').trim(),
    port: port > 0 && port < 65536 ? port : 22,
    username: String(s.username || '').trim(),
    pw: hasNewPw ? encryptPw(s.password) : (existing && existing.pw) || encryptPw(''),
  };
}

let servers = [];

function loadServers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    if (Array.isArray(parsed)) {
      servers = parsed
        .filter((s) => s && s.id && s.host && s.username)
        .slice(0, MAX_SERVERS);
      return;
    }
  } catch (_) {}
  servers = DEFAULT_SERVERS.map((s) => makeRecord(s));
  persist();
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(servers, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('could not save servers:', e.message);
  }
}

const publicList = () =>
  servers.map(({ id, name, host, port, username }) => ({ id, name, host, port, username }));

// ---------------------------------------------------------------- ssh
const sessions = new Map(); // id -> { conn, stream }
let win = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try { if (s.stream) s.stream.close(); } catch (_) {}
  try { s.conn.end(); } catch (_) {}
}

function connect(id, cols, rows) {
  const rec = servers.find((s) => s.id === id);
  if (!rec) return;
  closeSession(id);

  const password = decryptPw(rec.pw);
  const conn = new Client();
  const session = { conn, stream: null };
  sessions.set(id, session);
  const live = () => sessions.get(id) === session; // ignore events from replaced sessions

  send('ssh:status', { id, state: 'connecting' });

  conn.on('ready', () => {
    if (!live()) return conn.end();
    conn.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (err) {
        if (live()) send('ssh:status', { id, state: 'error', message: err.message });
        return;
      }
      session.stream = stream;
      send('ssh:status', { id, state: 'connected' });
      stream.on('data', (d) => { if (live()) send('ssh:out', { id, data: d }); });
      stream.stderr.on('data', (d) => { if (live()) send('ssh:out', { id, data: d }); });
      stream.on('close', () => {
        if (!live()) return;
        sessions.delete(id);
        send('ssh:status', { id, state: 'closed' });
        conn.end();
      });
    });
  });

  conn.on('error', (err) => {
    if (live()) send('ssh:status', { id, state: 'error', message: err.message });
  });

  conn.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
    finish(prompts.map(() => password));
  });

  conn.connect({
    host: rec.host,
    port: rec.port || 22,
    username: rec.username,
    password,
    tryKeyboard: true,
    readyTimeout: 15000,
    keepaliveInterval: 30000,
  });
}

// ---------------------------------------------------------------- ipc
ipcMain.handle('servers:list', () => publicList());

ipcMain.handle('servers:save', (_e, list) => {
  const input = (Array.isArray(list) ? list : []).slice(0, MAX_SERVERS);
  const next = [];
  for (const item of input) {
    if (!item || !String(item.host || '').trim() || !String(item.username || '').trim()) continue;
    const existing = item.id ? servers.find((s) => s.id === item.id) : null;
    next.push(makeRecord(item, existing));
  }
  const keep = new Set(next.map((s) => s.id));
  for (const id of [...sessions.keys()]) {
    if (!keep.has(id)) closeSession(id);
  }
  servers = next;
  persist();
  return publicList();
});

ipcMain.on('ssh:connect', (_e, { id, cols, rows }) => connect(id, cols, rows));
ipcMain.on('ssh:input', (_e, { id, data }) => {
  const s = sessions.get(id);
  if (s && s.stream) s.stream.write(data);
});
ipcMain.on('ssh:resize', (_e, { id, cols, rows }) => {
  const s = sessions.get(id);
  if (s && s.stream && cols > 0 && rows > 0) s.stream.setWindow(rows, cols, 0, 0);
});
ipcMain.handle('clip:read', () => clipboard.readText());
ipcMain.on('clip:write', (_e, text) => clipboard.writeText(String(text)));

// ---------------------------------------------------------------- helper function for icons
function getTargetNativeImage() {
  const filename = nativeTheme.shouldUseDarkColors ? 'icon-dark.png' : 'icon-light.png';
  
  // Safe runtime execution path
  let iconPath = path.join(__dirname, filename);
  if (app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, filename);
    if (fs.existsSync(packagedPath)) {
      iconPath = packagedPath;
    }
  }
    
  return nativeImage.createFromPath(iconPath);
}

// ---------------------------------------------------------------- window
function createWindow() {
  const initialIcon = getTargetNativeImage();

  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 700,
    minHeight: 420,
    backgroundColor: '#1e1e1e',
    title: 'Dual SSH',
    icon: initialIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.platform === 'darwin') {
    try {
      app.dock.setIcon(initialIcon);
    } catch (_) {}
  }
}

// All app initialization blocks are strictly executed inside the safe whenReady lifecycle hook
app.whenReady().then(() => {
  loadServers();
  createWindow();

  nativeTheme.on('updated', () => {
    const freshIcon = getTargetNativeImage();
    if (win && !win.isDestroyed()) {
      win.setIcon(freshIcon);
    }
    if (process.platform === 'darwin') {
      try {
        app.dock.setIcon(freshIcon);
      } catch (_) {}
    }
  });
});

app.on('window-all-closed', () => {
  for (const id of [...sessions.keys()]) {
    closeSession(id);
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
