const arrowEl = document.getElementById('arrow');
const arrowDot = document.getElementById('arrowDot');
const meetBar = document.getElementById('meetBar');
const meetBanner = document.getElementById('meetBanner');
const panelEl = document.getElementById('panel');
const listEl = document.getElementById('list');
const headSub = document.getElementById('headSub');
const headTitle = document.getElementById('headTitle');
const settingsEl = document.getElementById('settings');
const mainView = document.getElementById('mainView');
const addBar = document.getElementById('addBar');
const quickAdd = document.getElementById('quickAdd');
const addSpin = document.getElementById('addSpin');
const addBtn = document.getElementById('addBtn');
const addHint = document.getElementById('addHint');
const toastEl = document.getElementById('toast');
const presetRow = document.getElementById('presetRow');
const presetEditor = document.getElementById('presetEditor');
const npLabel = document.getElementById('npLabel');
const npText = document.getElementById('npText');

const TRASH_SVG = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let cfg = null;
let items = [];
let lastPayload = { needsAuth: true };
let expanded = false;
let mouseSolid = false;
let collapseTimer = null;
let dragging = false;
let settingsOpen = false;
let detailOpen = false;
let imminentMeeting = null;

const detailEl = document.getElementById('detail');
const ICON_CLOCK = `<svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_PIN = `<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const ICON_CAL = `<svg viewBox="0 0 24 24" width="13" height="13"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const GAP = 8, EDGE = 8, HIT_PAD = 10;

// --------------------------------------------------------------- bootstrap
init();
async function init() {
  cfg = await window.api.getConfig();
  applySide(cfg.side || 'right');
  positionArrow();
  applyConnectedUi();
  items = await window.api.getItems();
  renderList();
  updateArrowState();

  window.api.onItems((payload) => {
    lastPayload = payload;
    items = payload.items || [];
    if (!settingsOpen) { renderList(); if (expanded) requestAnimationFrame(positionPanel); }
    updateArrowState();
  });
  window.api.onOpenSettings(() => { forceExpand(); openSettings(); });

  setInterval(() => { if (!settingsOpen) renderList(); updateArrowState(); }, 20000);
}

function applyConnectedUi() {
  addBar.hidden = !(cfg.google && cfg.google.connected);
  renderPresets();
}

// Preset chips above the add box: clicking one fills the input.
function renderPresets() {
  const presets = cfg.presets || [];
  const connected = !!(cfg.google && cfg.google.connected);
  if (!connected || lastPayload.needsAuth) {
    presetRow.hidden = true;
    presetRow.innerHTML = '';
    presetEditor.hidden = true;
    return;
  }
  presetRow.innerHTML = '';
  for (const p of presets) {
    const b = document.createElement('button');
    b.className = 'preset-chip';
    b.innerHTML = `<span class="plus">+</span>${escapeHtml(p.label || p.text)}`;
    b.title = p.text || '';
    b.addEventListener('click', () => usePreset(p.text || ''));
    presetRow.appendChild(b);
  }
  // Always offer an inline "create a preset" chip.
  const add = document.createElement('button');
  add.className = 'preset-chip new';
  add.textContent = '+ New';
  add.title = 'Create a new preset';
  add.addEventListener('click', openPresetEditor);
  presetRow.appendChild(add);
  presetRow.hidden = false;
}

function usePreset(text) {
  quickAdd.value = text;
  quickAdd.focus();
  try { quickAdd.setSelectionRange(text.length, text.length); } catch {}
  addHint.hidden = false;
  if (expanded) requestAnimationFrame(positionPanel);
}

// Inline preset creator (no need to open settings).
function openPresetEditor() {
  // Prefill the text with whatever's already in the add box, if anything.
  npText.value = quickAdd.value.trim();
  npLabel.value = '';
  presetEditor.hidden = false;
  npLabel.focus();
  if (expanded) requestAnimationFrame(positionPanel);
}
function closePresetEditor() {
  presetEditor.hidden = true;
  npLabel.value = '';
  npText.value = '';
  if (expanded) requestAnimationFrame(positionPanel);
}
async function saveNewPreset() {
  const label = npLabel.value.trim();
  const text = npText.value.trim();
  if (!label || !text) {
    if (!label) npLabel.style.borderColor = '#ff8a8a';
    if (!text) npText.style.borderColor = '#ff8a8a';
    setTimeout(() => { npLabel.style.borderColor = ''; npText.style.borderColor = ''; }, 1200);
    return;
  }
  const arr = [...(cfg.presets || []), { label, text }];
  await persist({ presets: arr });
  closePresetEditor();
  showToast('Preset saved ✓');
}
document.getElementById('npSave').addEventListener('click', saveNewPreset);
document.getElementById('npCancel').addEventListener('click', closePresetEditor);
npText.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNewPreset(); if (e.key === 'Escape') closePresetEditor(); });
npLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter') npText.focus(); if (e.key === 'Escape') closePresetEditor(); });

// --------------------------------------------------------------- side / layout
function applySide(side) {
  document.body.classList.toggle('side-right', side !== 'left');
  document.body.classList.toggle('side-left', side === 'left');
}
function vh() { return window.innerHeight; }
function vw() { return window.innerWidth; }

function positionArrow() {
  const h = arrowEl.offsetHeight || 64;
  let top = (cfg.arrowTop ?? 0.42) * vh();
  top = Math.max(EDGE, Math.min(top, vh() - h - EDGE));
  setHandleTop(top);
}
function setHandleTop(top) {
  arrowEl.style.top = `${top}px`;
  meetBar.style.top = `${top}px`;
}
// The visible handle is the meeting bar when one is imminent and we're collapsed,
// otherwise the arrow.
function handleEl() { return meetBar.hidden ? arrowEl : meetBar; }

function positionPanel() {
  const side = document.body.classList.contains('side-left') ? 'left' : 'right';
  // The panel always anchors to the thin arrow's width, so it sits flush whether
  // the handle is the arrow or the (wider) meeting bar.
  const offset = (arrowEl.offsetWidth || 26) + GAP;
  if (side === 'left') { panelEl.style.left = `${offset}px`; panelEl.style.right = 'auto'; }
  else { panelEl.style.right = `${offset}px`; panelEl.style.left = 'auto'; }

  const arrowRect = arrowEl.getBoundingClientRect();
  const arrowMid = arrowRect.top + arrowRect.height / 2;
  const ph = panelEl.offsetHeight || 300;
  let top = arrowMid - ph / 2;
  top = Math.max(EDGE, Math.min(top, vh() - ph - EDGE));
  panelEl.style.top = `${top}px`;
}
window.addEventListener('resize', () => { positionArrow(); if (expanded) positionPanel(); });

// --------------------------------------------------------------- expand / collapse
function setExpanded(v) {
  if (expanded === v) return;
  expanded = v;
  document.body.classList.toggle('expanded', v);
  panelEl.setAttribute('aria-hidden', String(!v));
  updateHandles();
  if (v) requestAnimationFrame(positionPanel);
}

// Decide whether the collapsed handle is the arrow or the meeting bar, and whether
// the expanded banner is shown.
function updateHandles() {
  const showMeetBar = !!imminentMeeting && !expanded;
  meetBar.hidden = !showMeetBar;
  arrowEl.style.display = showMeetBar ? 'none' : '';
  meetBanner.hidden = !imminentMeeting;
}
function forceExpand() { clearTimeout(collapseTimer); setSolid(true); setExpanded(true); }
function setSolid(v) { if (mouseSolid === v) return; mouseSolid = v; window.api.setIgnoreMouse(!v); }

function overInteractive(x, y) {
  if (dragging || settingsOpen || detailOpen) return true;
  // Keep open while typing in any panel input.
  const ae = document.activeElement;
  if (ae && panelEl.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
  if (inRect(handleEl().getBoundingClientRect(), x, y, HIT_PAD)) return true;
  if (expanded && inRect(panelEl.getBoundingClientRect(), x, y, HIT_PAD)) return true;
  return false;
}
function inRect(r, x, y, pad) {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

window.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const over = overInteractive(e.clientX, e.clientY);
  if (over) {
    clearTimeout(collapseTimer);
    setSolid(true);
    setExpanded(true);
  } else if (expanded || mouseSolid) {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (settingsOpen || detailOpen) return;
      const ae = document.activeElement;
      if (ae && panelEl.contains(ae) && ae.tagName === 'INPUT') return;
      setExpanded(false);
      setSolid(false);
    }, 230);
  }
});

// --------------------------------------------------------------- dragging
// Both the arrow and the meeting bar can be dragged to reposition the widget.
let dragStart = null, dragEl = null;
function onHandleDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest('.meet-join')) return; // pressing Join shouldn't start a drag
  dragEl = e.currentTarget;
  dragStart = { x: e.clientX, y: e.clientY, top: dragEl.getBoundingClientRect().top, moved: false };
  dragEl.setPointerCapture(e.pointerId);
}
function onHandleMove(e) {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
  if (!dragStart.moved && Math.hypot(dx, dy) < 5) return;
  if (!dragStart.moved) {
    dragStart.moved = true; dragging = true;
    dragEl.classList.add('dragging'); setExpanded(false);
  }
  const h = dragEl.offsetHeight;
  let top = Math.max(EDGE, Math.min(dragStart.top + dy, vh() - h - EDGE));
  setHandleTop(top);
  applySide(e.clientX < vw() / 2 ? 'left' : 'right');
}
function onHandleUp(e) {
  if (!dragStart) return;
  dragEl.releasePointerCapture?.(e.pointerId);
  if (dragStart.moved) {
    const side = e.clientX < vw() / 2 ? 'left' : 'right';
    applySide(side);
    const top = dragEl.getBoundingClientRect().top;
    cfg.side = side; cfg.arrowTop = top / vh();
    window.api.saveArrow({ side, arrowTop: cfg.arrowTop });
  }
  dragging = false; dragEl.classList.remove('dragging'); dragStart = null; dragEl = null;
}
for (const el of [arrowEl, meetBar]) {
  el.addEventListener('pointerdown', onHandleDown);
  el.addEventListener('pointermove', onHandleMove);
  el.addEventListener('pointerup', onHandleUp);
}
// Join buttons (collapsed bar + expanded banner) open the meeting link.
meetBar.addEventListener('click', (e) => {
  if (e.target.closest('.meet-join') && imminentMeeting && imminentMeeting.meetLink) {
    window.api.openExternal(imminentMeeting.meetLink);
  }
});
meetBanner.addEventListener('click', (e) => {
  if (e.target.closest('.meet-join')) {
    if (imminentMeeting && imminentMeeting.meetLink) window.api.openExternal(imminentMeeting.meetLink);
    return;
  }
  if (imminentMeeting) openDetail(imminentMeeting);
});

// --------------------------------------------------------------- buttons
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const homeBtn = document.getElementById('homeBtn');
refreshBtn.addEventListener('click', () => window.api.refresh());
settingsBtn.addEventListener('click', openSettings);
homeBtn.addEventListener('click', closeSettings);
document.getElementById('connectBtn').addEventListener('click', doConnect);
document.getElementById('disconnectBtn').addEventListener('click', doDisconnect);
document.getElementById('setupHelp').addEventListener('click', (e) => {
  e.preventDefault();
  const h = document.getElementById('helpSteps');
  h.hidden = !h.hidden;
});
// External links inside settings.
settingsEl.addEventListener('click', (e) => {
  const a = e.target.closest('[data-ext]');
  if (a) { e.preventDefault(); window.api.openExternal(a.getAttribute('data-ext')); }
});

// Quick add
quickAdd.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdd(); });
addBtn.addEventListener('click', submitAdd);
quickAdd.addEventListener('focus', () => { addHint.hidden = false; });
quickAdd.addEventListener('blur', () => { addHint.hidden = true; });

async function submitAdd() {
  const text = quickAdd.value.trim();
  if (!text) { quickAdd.focus(); return; }
  addSpin.hidden = false;
  quickAdd.disabled = true;
  const r = await window.api.addEvent(text);
  quickAdd.disabled = false;
  addSpin.hidden = true;
  quickAdd.focus();
  if (r && r.ok) { quickAdd.value = ''; showToast('Added ✓'); }
  else { showToast((r && r.error) ? 'Failed: ' + r.error : 'Could not add event', true); }
}

let toastTimer = null;
function showToast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', isErr);
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 200);
  }, isErr ? 4000 : 1900);
}

// Row actions: complete a task, or arm/confirm an event delete.
listEl.addEventListener('click', async (e) => {
  const checkBtn = e.target.closest('[data-action="complete"]');
  if (checkBtn) {
    const row = checkBtn.closest('.event');
    row.classList.add('completing');
    const r = await window.api.completeTask(row.dataset.list, row.dataset.id);
    if (!(r && r.ok)) { row.classList.remove('completing'); showToast('Could not complete task', true); }
    return;
  }
  const delBtn = e.target.closest('[data-action="delete"]');
  if (delBtn) {
    const row = delBtn.closest('.event');
    if (!delBtn.classList.contains('armed')) {
      // First click arms; auto-disarms shortly or when leaving the row.
      delBtn.classList.add('armed');
      delBtn.textContent = 'Delete?';
      delBtn._disarm = setTimeout(() => disarm(delBtn), 3000);
      row.addEventListener('mouseleave', () => disarm(delBtn), { once: true });
    } else {
      clearTimeout(delBtn._disarm);
      row.classList.add('deleting');
      const r = await window.api.deleteEvent(row.dataset.cal, row.dataset.id);
      if (!(r && r.ok)) { row.classList.remove('deleting'); showToast('Could not delete event', true); }
    }
    return;
  }
  // Plain click on a row → show details.
  const row = e.target.closest('.event');
  if (row && row.dataset.idx != null) openDetail(items[+row.dataset.idx]);
});
function disarm(btn) {
  clearTimeout(btn._disarm);
  btn.classList.remove('armed');
  btn.innerHTML = TRASH_SVG;
}

// ---- Detail popup ----
function metaRow(icon, text) {
  const d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = `<span class="ic">${icon}</span>`;
  const s = document.createElement('span');
  s.textContent = text;
  d.appendChild(s);
  return d;
}
function dateLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatRange(start, end, allDay) {
  if (allDay) return `${dateLabel(start)} · All day`;
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return `${dateLabel(start)} · ${fmtTime(start)} – ${fmtTime(end)}`;
  return `${dateLabel(start)} ${fmtTime(start)} – ${dateLabel(end)} ${fmtTime(end)}`;
}

// Google descriptions can be HTML. Convert to neat plain text without executing
// anything (DOMParser builds an inert document — no scripts run, no resources load).
function looksLikeHtml(s) {
  return /<\/?[a-z][\s\S]*>/i.test(s) || /&[a-z]+;|&#\d+;/i.test(s);
}
function htmlToText(raw) {
  if (!raw) return '';
  if (!looksLikeHtml(raw)) return raw.replace(/ /g, ' ').trim();
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  // Keep link targets visible: show "text (url)" when they differ.
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const t = (a.textContent || '').trim();
    if (/^https?:\/\//i.test(href)) a.textContent = (t && t !== href) ? `${t} (${href})` : href;
  });
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3').forEach((el) => el.append('\n'));
  const text = (doc.body ? doc.body.textContent : '') || '';
  return text.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (m) => {
    const tail = (m.match(/[).,;:\]]+$/) || [''])[0];
    const url = tail ? m.slice(0, -tail.length) : m;
    return `<a class="dlink" data-href="${url}">${url}</a>${tail}`;
  });
}
function setDesc(el, raw) {
  const plain = htmlToText(raw);
  el.innerHTML = plain ? linkify(escapeHtml(plain)) : '';
  el.hidden = !plain;
}

function openDetail(it) {
  if (!it) return;
  detailOpen = true;
  forceExpand();

  document.getElementById('detailColor').style.background = it.color || 'var(--accent)';

  // The title doubles as the "open in Google Calendar" link when one exists.
  const titleEl = document.getElementById('detailTitle');
  titleEl.textContent = it.title || '(no title)';
  const link = it.type === 'event' ? it.htmlLink : '';
  titleEl.classList.toggle('clickable', !!link);
  titleEl.title = link ? 'Open in Google Calendar' : '';
  titleEl.onclick = link ? () => window.api.openExternal(link) : null;

  const meta = document.getElementById('detailMeta');
  meta.innerHTML = '';
  const desc = document.getElementById('detailDesc');

  if (it.type === 'event') {
    meta.appendChild(metaRow(ICON_CLOCK, formatRange(new Date(it.start), new Date(it.end), it.allDay)));
    if (it.location) meta.appendChild(metaRow(ICON_PIN, it.location));
    if (it.calName) meta.appendChild(metaRow(ICON_CAL, it.calName));
    setDesc(desc, it.description);
  } else {
    meta.appendChild(metaRow(ICON_CLOCK, it.due ? `Due ${dateLabel(new Date(it.due))}` : 'No due date'));
    if (it.listName) meta.appendChild(metaRow(ICON_CAL, it.listName));
    setDesc(desc, it.notes);
  }

  detailEl.hidden = false;
  requestAnimationFrame(positionPanel);
}
function closeDetail() {
  detailOpen = false;
  detailEl.hidden = true;
}
document.getElementById('detailClose').addEventListener('click', closeDetail);
document.getElementById('detailDone').addEventListener('click', closeDetail);
detailEl.addEventListener('click', (e) => { if (e.target === detailEl) closeDetail(); });
document.getElementById('detailDesc').addEventListener('click', (e) => {
  const a = e.target.closest('[data-href]');
  if (a) { e.preventDefault(); window.api.openExternal(a.getAttribute('data-href')); }
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && detailOpen) closeDetail(); });

// --------------------------------------------------------------- rendering
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }

function groupLabel(date, now) {
  const days = dayDiff(date, now);
  if (days < 0) return 'Today';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
}
function relTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), rem = m % 60;
  if (h < 24) return rem ? `in ${h}h ${rem}m` : `in ${h}h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d > 1 ? 's' : ''}`;
}

function renderList() {
  listEl.innerHTML = '';
  renderPresets();

  if (lastPayload.needsAuth) {
    addBar.hidden = true;
    listEl.innerHTML = `<div class="empty"><span class="big">📅</span>
      Not connected.<br>Open <b>settings</b> to connect your Google account.</div>`;
    headSub.textContent = '';
    return;
  }
  addBar.hidden = false;

  if (lastPayload.error && items.length === 0) {
    listEl.innerHTML = `<div class="empty"><span class="big">⚠️</span>
      Couldn't load.<br><span style="font-size:10.5px">${escapeHtml(lastPayload.error)}</span></div>`;
    headSub.textContent = '';
    return;
  }
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty"><span class="big">✨</span>Nothing coming up.<br>Enjoy the calm.</div>`;
    headSub.textContent = lastPayload.fetchedAt ? `updated ${fmtTime(new Date(lastPayload.fetchedAt))}` : '';
    return;
  }

  const now = new Date();
  let lastLabel = null, nextUpcoming = null, idx = 0;

  for (const it of items) {
    let label;
    if (it.type === 'task' && !it.due) label = 'To-do';
    else {
      const d = new Date(it.type === 'event' ? it.start : it.due);
      label = groupLabel(d, now);
    }
    const urgency = label === 'Today' ? 'today' : label === 'Tomorrow' ? 'tomorrow' : '';
    if (label !== lastLabel) {
      const g = document.createElement('div');
      g.className = 'group-label' + (urgency ? ' gl-' + urgency : '');
      g.textContent = label;
      listEl.appendChild(g);
      lastLabel = label;
    }

    const row = document.createElement('div');
    if (it.type === 'task') {
      const overdue = it.due && dayDiff(new Date(it.due), now) < 0;
      row.className = 'event task' + (overdue ? ' overdue' : '') + (urgency ? ' urgent-' + urgency : '');
      row.dataset.id = it.id || '';
      row.dataset.list = it.tasklist || '';
      row.innerHTML = `
        <button class="check" data-action="complete" title="Mark done" aria-label="Mark done"></button>
        <div class="body">
          <div class="title">${escapeHtml(it.title)}</div>
          ${overdue ? `<div class="meta">overdue</div>` : ''}
        </div>`;
    } else {
      const start = new Date(it.start), end = new Date(it.end);
      const ongoing = start <= now && end > now;
      if (!ongoing && !nextUpcoming && start > now) nextUpcoming = start;
      row.className = 'event' + (ongoing ? ' now' : '') + (urgency ? ' urgent-' + urgency : '');
      row.dataset.id = it.id || '';
      row.dataset.cal = it.calendarId || '';
      const timeStr = it.allDay ? 'All day' : fmtTime(start);
      row.innerHTML = `
        <div class="bar" style="background:${it.color || 'var(--accent)'}"></div>
        <div class="body">
          <div class="title">${escapeHtml(it.title)}</div>
          <div class="meta">
            <span>${timeStr}</span>
            ${it.location ? `<span class="loc">· ${escapeHtml(it.location)}</span>` : ''}
          </div>
        </div>
        <div class="row-actions">
          <button class="row-btn" data-action="delete" title="Delete event">${TRASH_SVG}</button>
        </div>`;
    }
    row.dataset.idx = idx++;
    listEl.appendChild(row);
  }

  if (nextUpcoming) headSub.textContent = `next ${relTime(nextUpcoming - now)}`;
  else headSub.textContent = lastPayload.fetchedAt ? `updated ${fmtTime(new Date(lastPayload.fetchedAt))}` : '';
}

// A meeting is "imminent" if it's a timed event starting within 5 minutes, or that
// started up to 15 minutes ago and is still going (so you can still hop in).
function computeImminent() {
  const now = Date.now();
  const lead = Math.max(1, (cfg && cfg.meetLeadMins) || 5) * 60000;
  let best = null, bestStart = Infinity;
  for (const it of items) {
    if (it.type !== 'event' || it.allDay) continue;
    const s = new Date(it.start).getTime();
    const e = new Date(it.end).getTime();
    if (e <= now) continue;
    if (s <= now + lead && s >= now - 15 * 60000 && s < bestStart) {
      best = it; bestStart = s;
    }
  }
  return best;
}

function renderMeetUI() {
  if (!imminentMeeting) { meetBar.innerHTML = ''; meetBanner.innerHTML = ''; return; }
  const it = imminentMeeting;
  const mins = Math.round((new Date(it.start) - new Date()) / 60000);
  const whenLong = mins <= 0 ? 'happening now' : `in ${mins} min`;
  const whenShort = mins <= 0 ? 'now' : `in ${mins} min`;

  meetBar.innerHTML = `
    <span class="meet-pulse"></span>
    <div class="meet-info">
      <div class="meet-title">${escapeHtml(it.title)}</div>
      <div class="meet-when">${whenShort}${it.meetLabel ? ' · ' + escapeHtml(it.meetLabel) : ''}</div>
    </div>
    ${it.meetLink ? '<button class="meet-join">Join</button>' : ''}`;

  meetBanner.innerHTML = `
    <div class="mb-label">Up next · ${whenLong}</div>
    <div class="mb-title">${escapeHtml(it.title)}</div>
    <div class="mb-time">${formatRange(new Date(it.start), new Date(it.end), it.allDay)}${it.location && !it.meetLink ? ' · ' + escapeHtml(it.location) : ''}</div>
    ${it.meetLink ? `<button class="meet-join lg">Join ${escapeHtml(it.meetLabel || 'meeting')}</button>` : ''}`;
}

function updateArrowState() {
  imminentMeeting = computeImminent();
  renderMeetUI();
  updateHandles();
  if (expanded) requestAnimationFrame(positionPanel);

  const now = new Date();
  let soonest = null;
  for (const it of items) {
    if (it.type !== 'event') continue;
    const start = new Date(it.start), end = new Date(it.end);
    if (start > now) { soonest = start; break; }
    if (start <= now && end > now) { soonest = now; break; }
  }
  if (soonest) {
    const mins = (soonest - now) / 60000;
    if (mins <= 60) {
      arrowDot.hidden = false;
      arrowDot.classList.toggle('soon', mins <= 15);
      return;
    }
  }
  arrowDot.hidden = true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --------------------------------------------------------------- settings
function openSettings() {
  settingsOpen = true;
  forceExpand();
  mainView.hidden = true;
  headTitle.textContent = 'Settings';
  headSub.textContent = '';
  homeBtn.hidden = false;
  refreshBtn.hidden = true;
  settingsBtn.hidden = true;
  settingsEl.hidden = false;
  renderSettings();
  requestAnimationFrame(positionPanel);
}
function closeSettings() {
  settingsOpen = false;
  settingsEl.hidden = true;
  mainView.hidden = false;
  headTitle.textContent = 'Upcoming';
  homeBtn.hidden = true;
  refreshBtn.hidden = false;
  settingsBtn.hidden = false;
  applyConnectedUi();
  renderList();
  requestAnimationFrame(positionPanel);
}

async function renderSettings() {
  const connected = !!(cfg.google && cfg.google.connected);
  document.getElementById('connectBox').hidden = connected;
  document.getElementById('accountBox').hidden = !connected;
  document.getElementById('settingsErr').hidden = true;

  document.getElementById('openAtLogin').checked = !!cfg.openAtLogin;
  document.getElementById('openAtLogin').onchange = (e) => persist({ openAtLogin: e.target.checked });

  if (!connected) {
    document.getElementById('clientId').value = cfg.google.clientId || '';
    document.getElementById('clientSecret').value = '';
    return;
  }

  document.getElementById('accountEmail').textContent = cfg.google.email || 'Connected';
  document.getElementById('lookaheadDays').value = cfg.lookaheadDays || 3;
  document.getElementById('lookaheadDays').onchange = (e) => {
    persist({ lookaheadDays: Math.max(1, Math.min(60, +e.target.value || 3)) });
    window.api.refresh();
  };
  document.getElementById('meetLeadMins').value = cfg.meetLeadMins || 5;
  document.getElementById('meetLeadMins').onchange = (e) => {
    persist({ meetLeadMins: Math.max(1, Math.min(60, +e.target.value || 5)) });
    updateArrowState();
  };
  document.getElementById('refreshMins').value = cfg.refreshMins || 5;
  document.getElementById('refreshMins').onchange = (e) =>
    persist({ refreshMins: Math.max(1, +e.target.value || 5) });
  document.getElementById('showTasks').checked = !!cfg.showTasks;
  document.getElementById('showTasks').onchange = (e) => { persist({ showTasks: e.target.checked }); window.api.refresh(); };

  renderPresetEditor();
  document.getElementById('presetAddBtn').onclick = addPreset;
  document.getElementById('presetText').onkeydown = (e) => { if (e.key === 'Enter') addPreset(); };

  // Calendar toggles
  const wrap = document.getElementById('calToggles');
  wrap.innerHTML = '<div class="cal-toggle" style="opacity:.5">Loading…</div>';
  const cals = await window.api.getCalendars();
  wrap.innerHTML = '';
  if (!cals.length) { wrap.innerHTML = '<div class="cal-toggle" style="opacity:.5">No calendars found.</div>'; }
  for (const c of cals) {
    const row = document.createElement('label');
    row.className = 'cal-toggle';
    row.innerHTML = `
      <span class="swatch" style="background:${c.color}"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.name)}</span>
      <input type="checkbox" ${c.enabled ? 'checked' : ''} />`;
    row.querySelector('input').addEventListener('change', (e) => {
      window.api.setCalendarEnabled(c.id, e.target.checked);
    });
    wrap.appendChild(row);
  }
  requestAnimationFrame(positionPanel);
}

async function doConnect() {
  const err = document.getElementById('settingsErr');
  err.hidden = true;
  const clientId = document.getElementById('clientId').value.trim();
  const clientSecret = document.getElementById('clientSecret').value.trim();
  if (!clientId || !clientSecret) {
    err.textContent = 'Enter both Client ID and Client secret.';
    err.hidden = false;
    return;
  }
  const btn = document.getElementById('connectBtn');
  btn.disabled = true; btn.textContent = 'Opening Google…';
  await window.api.saveConfig({ google: { clientId, clientSecret } });
  const r = await window.api.connect();
  btn.disabled = false; btn.textContent = 'Connect Google';
  if (r && r.ok) {
    cfg = r.config;
    applyConnectedUi();
    closeSettings();           // collapse straight to the scannable view
  } else {
    err.textContent = (r && r.error) || 'Could not connect.';
    err.hidden = false;
  }
}

async function doDisconnect() {
  cfg = await window.api.disconnect();
  lastPayload = { needsAuth: true };
  items = [];
  renderSettings();
}

function renderPresetEditor() {
  const list = document.getElementById('presetList');
  list.innerHTML = '';
  const presets = cfg.presets || [];
  if (!presets.length) {
    list.innerHTML = '<div class="preset-item" style="opacity:.5">No presets yet.</div>';
  }
  presets.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <span class="pl">${escapeHtml(p.label)}</span>
      <span class="pt">${escapeHtml(p.text)}</span>
      <span class="rm" title="Remove">✕</span>`;
    item.querySelector('.rm').addEventListener('click', async () => {
      const arr = [...(cfg.presets || [])];
      arr.splice(i, 1);
      await persist({ presets: arr });
      renderPresetEditor();
    });
    list.appendChild(item);
  });
}

async function addPreset() {
  const labelI = document.getElementById('presetLabel');
  const textI = document.getElementById('presetText');
  const err = document.getElementById('settingsErr');
  err.hidden = true;
  const label = labelI.value.trim();
  const text = textI.value.trim();
  if (!label || !text) {
    err.textContent = 'Enter both a label and the event text for the preset.';
    err.hidden = false;
    return;
  }
  const arr = [...(cfg.presets || []), { label, text }];
  await persist({ presets: arr });
  labelI.value = '';
  textI.value = '';
  renderPresetEditor();
  requestAnimationFrame(positionPanel);
}

async function persist(partial) {
  cfg = await window.api.saveConfig(partial);
  applySide(cfg.side || 'right');
  renderPresets();
}
