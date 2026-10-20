// Hollow Pines – Desktop-Version (Electron). Startet das Spiel in einem eigenen Vollbild-Fenster.
// Die Spieldateien werden über einen lokalen Mini-Server ausgeliefert (feste Adresse, damit
// Einstellungen und Rekorde zwischen Starts erhalten bleiben und das Mikrofon erlaubt ist).
const { app, BrowserWindow, session, globalShortcut, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(port));
  });
}

async function createWindow() {
  let port = 47120;
  for (;;) { try { await startServer(port); break; } catch (e) { if (++port > 47140) throw e; } }

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write'].includes(permission));
  });

  const win = new BrowserWindow({
    width: 1280, height: 720, fullscreen: true, backgroundColor: '#040506', autoHideMenuBar: true,
    title: 'Hollow Pines', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  win.setMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
  // externe Links im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  globalShortcut.register('F11', () => win.setFullScreen(!win.isFullScreen()));
}

app.commandLine.appendSwitch('ignore-gpu-blocklist'); // ältere Intel-Grafik trotzdem mit WebGL2
app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
