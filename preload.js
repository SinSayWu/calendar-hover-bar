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
  addTask: (title, due) => ipcRenderer.invoke('add-task', { title, due }),
  updateEvent: (calendarId, id, patch) => ipcRenderer.invoke('update-event', { calendarId, id, patch }),
  deleteEvent: (calendarId, id) => ipcRenderer.invoke('delete-event', { calendarId, id }),
  deleteTask: (tasklist, id) => ipcRenderer.invoke('delete-task', { tasklist, id }),
  completeTask: (tasklist, id) => ipcRenderer.invoke('complete-task', { tasklist, id }),
  convertToTask: (calendarId, eventId, title, due) => ipcRenderer.invoke('convert-to-task', { calendarId, eventId, title, due }),
  convertToEvent: (tasklist, taskId, title, date) => ipcRenderer.invoke('convert-to-event', { tasklist, taskId, title, date }),

  // Items (events + tasks)
  getItems: () => ipcRenderer.invoke('get-items'),
  refresh: () => ipcRenderer.send('refresh'),
  onItems: (cb) => ipcRenderer.on('items', (_e, payload) => cb(payload)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),

  // Misc
  openExternal: (url) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('quit-app')
});
