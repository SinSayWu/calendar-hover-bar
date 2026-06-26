const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');

// ---------------------------------------------------------------------------
// Single instance lock — only ever one overlay.
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks'
];

const DEFAULT_CONFIG = {
  google: { clientId: '', clientSecret: '', refreshToken: '', email: '' },
  enabledCalendars: {},   // calId -> false to hide; missing => shown
  showTasks: true,
  presets: [
    { label: 'Tutoring', text: 'Tutoring at Seneca Tutoring Center ' },
    { label: 'Volunteering', text: 'Volunteering at the retirement home ' }
  ],
  side: 'right',
  arrowTop: 0.42,
  refreshMins: 5,
  lookaheadDays: 3,       // how many days ahead to show, for both events and tasks
  meetLeadMins: 5,        // how many minutes before a meeting the "up next" bar appears
  openAtLogin: true
};

let config = loadConfig();
let win = null;
let tray = null;
let cachedItems = [];
let refreshTimer = null;
let connecting = false;

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      google: { ...DEFAULT_CONFIG.google, ...(raw.google || {}) },
      enabledCalendars: raw.enabledCalendars || {}
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Never expose the client secret or refresh token to the renderer.
function publicConfig() {
  return {
    google: {
      clientId: config.google.clientId || '',
      hasSecret: !!config.google.clientSecret,
      email: config.google.email || '',
      connected: !!config.google.refreshToken
    },
    showTasks: config.showTasks,
    presets: config.presets || [],
    side: config.side,
    arrowTop: config.arrowTop,
    refreshMins: config.refreshMins,
    lookaheadDays: config.lookaheadDays,
    meetLeadMins: config.meetLeadMins,
    openAtLogin: config.openAtLogin
  };
}

// ---------------------------------------------------------------------------
// Google auth
// ---------------------------------------------------------------------------
function oauthClient(redirectUri) {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, redirectUri);
}

function authedClient() {
  const g = config.google;
  if (!g.clientId || !g.clientSecret || !g.refreshToken) return null;
  const o = new google.auth.OAuth2(g.clientId, g.clientSecret);
  o.setCredentials({ refresh_token: g.refreshToken });
  o.on('tokens', (t) => {
    if (t.refresh_token) { config.google.refreshToken = t.refresh_token; saveConfig(); }
  });
  return o;
}

function isAuthError(e) {
  const code = e && (e.code || (e.response && e.response.status));
  const msg = ((e && e.message) || '').toLowerCase();
  return code === 401 || msg.includes('invalid_grant') || msg.includes('invalid_credentials');
}

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Connected</title><style>
html,body{height:100%;margin:0;font-family:Segoe UI,system-ui,sans-serif;
background:#11131a;color:#e8ecf3;display:flex;align-items:center;justify-content:center}
.card{text-align:center}.c{font-size:48px;margin-bottom:14px}
h1{font-size:20px;font-weight:600;margin:0 0 6px}p{color:#8b93a4;font-size:13px;margin:0}
</style></head><body><div class="card"><div class="c">✅</div>
<h1>Calendar Hover Bar is connected</h1><p>You can close this tab and return to the widget.</p>
</div></body></html>`;

function connectGoogle() {
  return new Promise((resolve) => {
    if (connecting) { resolve({ error: 'A sign-in is already in progress.' }); return; }
    if (!config.google.clientId || !config.google.clientSecret) {
      resolve({ error: 'Enter your Client ID and Client secret first.' });
      return;
    }
    connecting = true;
    const server = http.createServer();
    let oauth = null;

    const cleanup = () => { connecting = false; clearTimeout(timer); try { server.close(); } catch {} };
    const timer = setTimeout(() => { cleanup(); resolve({ error: 'Sign-in timed out. Try again.' }); }, 5 * 60 * 1000);

    server.on('request', async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        const err = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        if (err) {
          res.end('Sign-in cancelled. You can close this tab.');
          cleanup(); resolve({ error: 'Sign-in cancelled.' });
          return;
        }
        if (!code) { res.end('Waiting for authorization…'); return; }

        const { tokens } = await oauth.getToken(code);
        oauth.setCredentials(tokens);
        if (tokens.refresh_token) config.google.refreshToken = tokens.refresh_token;

        // Capture the account's primary email for display.
        let email = '';
        try {
          const cal = google.calendar({ version: 'v3', auth: oauth });
          const cl = await cal.calendarList.list();
          const primary = (cl.data.items || []).find((i) => i.primary);
          if (primary) email = primary.id;
        } catch {}
        config.google.email = email;
        saveConfig();

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);
        cleanup();
        resolve({ ok: true, email });
      } catch (e) {
        res.end('Error completing sign-in: ' + (e.message || e));
        cleanup();
        resolve({ error: e.message || String(e) });
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      oauth = oauthClient(`http://127.0.0.1:${port}`);
      const authUrl = oauth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
      });
      shell.openExternal(authUrl);
    });

    server.on('error', (e) => { cleanup(); resolve({ error: 'Local server error: ' + e.message }); });
  });
}

// ---------------------------------------------------------------------------
// Window — fullscreen transparent click-through overlay.
// ---------------------------------------------------------------------------
// Leave the bottom edge uncovered so Windows doesn't treat us as a fullscreen app
// (which would suppress an auto-hide taskbar) and so the taskbar's reveal zone is free.
const EDGE_GAP = 2;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  win = new BrowserWindow({
    x, y, width, height: height - EDGE_GAP,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Stay reliably on top. The auto-hide taskbar still reveals fine because we no
  // longer cover the full screen (see EDGE_GAP) — our transparent pixels let it
  // show through, and Windows no longer classifies us as a fullscreen app.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  const refit = () => {
    if (!win) return;
    const d = screen.getPrimaryDisplay().workArea;
    win.setBounds({ x: d.x, y: d.y, width: d.width, height: d.height - EDGE_GAP });
  };
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function makeTrayIcon() {
  // A tiny calendar glyph (BGRA): light body with an accent header band.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const accent = [254, 168, 110]; // B,G,R of #6ea8fe
  const body = [245, 238, 235];   // B,G,R of #ebeef5 (light)
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      const i = (yy * size + xx) * 4;
      const inset = xx >= 2 && xx <= 13 && yy >= 2 && yy <= 13;
      if (!inset) { buf[i + 3] = 0; continue; }
      const col = yy <= 5 ? accent : body; // top rows = header band
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Calendar Hover Bar');
  const menu = Menu.buildFromTemplate([
    { label: 'Refresh now', click: () => refreshItems() },
    { label: 'Open settings', click: () => win && win.webContents.send('open-settings') },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: config.openAtLogin,
      click: (item) => { config.openAtLogin = item.checked; saveConfig(); applyLoginItem(); }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => win && win.webContents.send('open-settings'));
}

function applyLoginItem() {
  const opts = { openAtLogin: !!config.openAtLogin };
  // When running unpackaged (electron .), the default login entry would launch a
  // bare Electron with no app. Point it at this project so it relaunches us.
  if (!app.isPackaged) {
    opts.path = process.execPath;            // electron.exe
    opts.args = [path.resolve(__dirname)];   // this app's folder
  }
  app.setLoginItemSettings(opts);
}

// ---------------------------------------------------------------------------
// Fetching calendar events + tasks
// ---------------------------------------------------------------------------
function labelFromUrl(u) {
  if (/meet\.google\.com/i.test(u)) return 'Google Meet';
  if (/zoom\.us|zoomgov\.com/i.test(u)) return 'Zoom';
  if (/teams\.(microsoft|live)\.com/i.test(u)) return 'Teams';
  if (/webex\.com/i.test(u)) return 'Webex';
  if (/whereby\.com/i.test(u)) return 'Whereby';
  return 'Meeting';
}

// Find a video-meeting link from the event's conferencing fields, then fall back
// to scanning the location/description for a known provider URL (e.g. pasted Zoom).
function extractMeet(ev) {
  if (ev.hangoutLink) return { link: ev.hangoutLink, label: 'Google Meet' };
  const cd = ev.conferenceData;
  if (cd && Array.isArray(cd.entryPoints)) {
    const vid = cd.entryPoints.find((p) => p.entryPointType === 'video') || cd.entryPoints[0];
    if (vid && vid.uri) {
      const label = (cd.conferenceSolution && cd.conferenceSolution.name) || labelFromUrl(vid.uri);
      return { link: vid.uri, label };
    }
  }
  const text = `${ev.location || ''}\n${ev.description || ''}`;
  const urls = text.match(/https?:\/\/[^\s"'<>)]+/g);
  if (urls) {
    const known = urls.find((u) => /(meet\.google\.com|zoom\.us|zoomgov\.com|teams\.(microsoft|live)\.com|webex\.com|whereby\.com)/i.test(u));
    if (known) return { link: known, label: labelFromUrl(known) };
  }
  return { link: '', label: '' };
}

async function refreshItems() {
  const auth = authedClient();
  if (!auth) {
    cachedItems = [];
    send({ items: [], error: null, needsAuth: true });
    return;
  }

  const now = new Date();
  const days = Math.max(1, config.lookaheadDays || 3);
  const horizon = new Date(now.getTime() + days * 86400000);
  const items = [];
  const errors = [];

  try {
    const cal = google.calendar({ version: 'v3', auth });
    const cl = await cal.calendarList.list();
    const calendars = cl.data.items || [];

    for (const c of calendars) {
      if (config.enabledCalendars[c.id] === false) continue;
      try {
        const r = await cal.events.list({
          calendarId: c.id,
          timeMin: now.toISOString(),
          timeMax: horizon.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50
        });
        for (const ev of (r.data.items || [])) {
          if (ev.status === 'cancelled') continue;
          const allDay = !!(ev.start && ev.start.date);
          const start = ev.start.dateTime || ev.start.date;
          const end = (ev.end && (ev.end.dateTime || ev.end.date)) || start;
          const meet = extractMeet(ev);
          items.push({
            type: 'event',
            id: ev.id,
            calendarId: c.id,
            title: ev.summary || '(no title)',
            location: ev.location || '',
            description: ev.description || '',
            htmlLink: ev.htmlLink || '',
            meetLink: meet.link,
            meetLabel: meet.label,
            allDay,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            color: c.backgroundColor || '#6ea8fe',
            calName: c.summary || ''
          });
        }
      } catch (e) {
        errors.push(`${c.summary || c.id}: ${e.message || e}`);
      }
    }
  } catch (e) {
    if (isAuthError(e)) {
      // Refresh token revoked/expired — force reconnect.
      config.google.refreshToken = '';
      saveConfig();
      cachedItems = [];
      send({ items: [], error: 'Google sign-in expired. Reconnect in settings.', needsAuth: true });
      return;
    }
    errors.push(e.message || String(e));
  }

  // Tasks (optional)
  if (config.showTasks) {
    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      const tl = await tasksApi.tasklists.list();
      for (const list of (tl.data.items || [])) {
        const tr = await tasksApi.tasks.list({ tasklist: list.id, showCompleted: false, maxResults: 100 });
        for (const t of (tr.data.items || [])) {
          if (t.status === 'completed' || !t.title) continue;
          let due = t.due ? new Date(t.due).toISOString() : null;
          // Only show dated tasks within the look-ahead window (overdue + undated still show).
          if (due && new Date(due) > horizon) continue;
          items.push({ type: 'task', id: t.id, tasklist: list.id, title: t.title, due, notes: t.notes || '', color: '#9aa4b2', listName: list.title || '' });
        }
      }
    } catch (e) {
      errors.push('Tasks: ' + (e.message || e));
    }
  }

  // Sort: by event start / task due; undated tasks go last.
  const keyOf = (it) => {
    if (it.type === 'event') return new Date(it.start).getTime();
    return it.due ? new Date(it.due).getTime() : Number.MAX_SAFE_INTEGER;
  };
  items.sort((a, b) => keyOf(a) - keyOf(b));

  cachedItems = items;
  send({ items, error: errors.length ? errors.join('\n') : null, needsAuth: false, fetchedAt: now.toISOString() });
}

function send(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('items', payload);
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const mins = Math.max(1, config.refreshMins || 5);
  refreshTimer = setInterval(() => refreshItems(), mins * 60000);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.handle('get-config', () => publicConfig());

ipcMain.handle('save-config', (_e, partial) => {
  if (partial.google) config.google = { ...config.google, ...partial.google };
  const { google: _g, ...rest } = partial;
  config = { ...config, ...rest };
  saveConfig();
  applyLoginItem();
  scheduleRefresh();
  return publicConfig();
});

ipcMain.handle('google-connect', async () => {
  const r = await connectGoogle();
  if (r.ok) { scheduleRefresh(); refreshItems(); }
  return { ...r, config: publicConfig() };
});

ipcMain.handle('google-disconnect', () => {
  config.google.refreshToken = '';
  config.google.email = '';
  saveConfig();
  cachedItems = [];
  send({ items: [], needsAuth: true });
  return publicConfig();
});

ipcMain.handle('get-calendars', async () => {
  const auth = authedClient();
  if (!auth) return [];
  try {
    const cal = google.calendar({ version: 'v3', auth });
    const cl = await cal.calendarList.list();
    return (cl.data.items || []).map((c) => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor || '#6ea8fe',
      primary: !!c.primary,
      enabled: config.enabledCalendars[c.id] !== false
    }));
  } catch {
    return [];
  }
});

ipcMain.handle('set-calendar-enabled', (_e, { id, enabled }) => {
  config.enabledCalendars[id] = enabled;
  saveConfig();
  refreshItems();
  return true;
});

ipcMain.handle('add-event', async (_e, text) => {
  const auth = authedClient();
  if (!auth) return { error: 'Not connected.' };
  if (!text || !text.trim()) return { error: 'Empty.' };
  try {
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.quickAdd({ calendarId: 'primary', text: text.trim() });
    await refreshItems();
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('delete-event', async (_e, { calendarId, id }) => {
  const auth = authedClient();
  if (!auth) return { error: 'Not connected.' };
  try {
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.delete({ calendarId: calendarId || 'primary', eventId: id });
    await refreshItems();
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('update-event', async (_e, { calendarId, id, patch }) => {
  const auth = authedClient();
  if (!auth) return { error: 'Not connected.' };
  try {
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.patch({ calendarId: calendarId || 'primary', eventId: id, requestBody: patch });
    await refreshItems();
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('add-task', async (_e, { title }) => {
  const auth = authedClient();
  if (!auth) return { error: 'Not connected.' };
  if (!title || !title.trim()) return { error: 'Empty.' };
  try {
    const t = google.tasks({ version: 'v1', auth });
    await t.tasks.insert({ tasklist: '@default', requestBody: { title: title.trim() } });
    await refreshItems();
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('complete-task', async (_e, { tasklist, id }) => {
  const auth = authedClient();
  if (!auth) return { error: 'Not connected.' };
  try {
    const t = google.tasks({ version: 'v1', auth });
    await t.tasks.patch({ tasklist: tasklist || '@default', task: id, requestBody: { status: 'completed' } });
    await refreshItems();
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('get-items', () => cachedItems);
ipcMain.on('refresh', () => refreshItems());
ipcMain.on('save-arrow', (_e, { side, arrowTop }) => {
  if (side) config.side = side;
  if (typeof arrowTop === 'number') config.arrowTop = arrowTop;
  saveConfig();
});
ipcMain.on('open-external', (_e, url) => shell.openExternal(url));
ipcMain.on('quit-app', () => app.quit());

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.on('second-instance', () => { if (win) win.webContents.send('open-settings'); });

app.whenReady().then(() => {
  createWindow();
  createTray();
  applyLoginItem();
  scheduleRefresh();
  refreshItems();
});

app.on('window-all-closed', () => { /* tray-resident; stay alive */ });
