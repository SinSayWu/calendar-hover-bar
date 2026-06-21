const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Mouse / window
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  saveArrow: (pos) => ipcRenderer.send('save-arrow', pos),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (partial) => ipcRenderer.invoke('save-config', partial),

  // Google
  connect: () => ipcRenderer.invoke('google-connect'),
  disconnect: () => ipcRenderer.invoke('google-disconnect'),
  getCalendars: () => ipcRenderer.invoke('get-calendars'),
  setCalendarEnabled: (id, enabled) => ipcRenderer.invoke('set-calendar-enabled', { id, enabled }),
  addEvent: (text) => ipcRenderer.invoke('add-event', text),
  deleteEvent: (calendarId, id) => ipcRenderer.invoke('delete-event', { calendarId, id }),
  completeTask: (tasklist, id) => ipcRenderer.invoke('complete-task', { tasklist, id }),

  // Items (events + tasks)
  getItems: () => ipcRenderer.invoke('get-items'),
  refresh: () => ipcRenderer.send('refresh'),
  onItems: (cb) => ipcRenderer.on('items', (_e, payload) => cb(payload)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),

  // Misc
  openExternal: (url) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('quit-app')
});
