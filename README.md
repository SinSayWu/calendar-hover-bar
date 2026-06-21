# Calendar Hover Bar

An aesthetic, always-on-top desktop overlay for Windows. A small semi-transparent
arrow lives on the edge of your screen; **hover** it to expand a glassy panel that
shows your upcoming Google Calendar events and Tasks at a glance, and lets you
**add events** by typing. **Drag** the arrow anywhere — it snaps to the nearest side
and remembers where you put it.

## One-time Google setup (~5–10 min, free)

The widget talks to the Google Calendar + Tasks API using your own OAuth
credentials. Everything stays local on your machine.

1. **Create a project** — [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate).
2. **Enable APIs** — turn on the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   and the [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com).
3. **OAuth consent screen** — choose **External**, fill the required name/email,
   and add your own Google address as a **test user**.
   Then set the **publishing status to "In production"** (you do *not* need to
   submit for verification). This stops Google from expiring your login every 7 days.
4. **Create credentials** — [Credentials](https://console.cloud.google.com/apis/credentials)
   → *Create credentials* → *OAuth client ID* → **Desktop app**.
5. Copy the **Client ID** and **Client secret**.
6. In the widget: hover the arrow → **⚙ gear** → paste both → **Connect Google**.
   A browser opens; sign in. You'll see a *"Google hasn't verified this app"* screen —
   click **Advanced → Go to (app) (unsafe)** (it's your own app). Done — the settings
   panel collapses back to the scannable view.

## Using it

- **Hover** the arrow → events + tasks grouped Today / Tomorrow / Later, plus undated
  to-dos. Header shows time to your next event.
- **Add an event** → type into the box at the bottom (e.g. `Lunch with Sam 1pm Friday`)
  and press Enter. It uses Google's natural-language quick-add on your primary calendar.
- **Drag** the arrow to reposition; drag past the screen midline to flip sides.
- A glowing **dot** appears on the arrow when an event starts within an hour
  (pulses inside 15 minutes).
- **Settings** (⚙): toggle which calendars show (each keeps its Google color),
  show/hide Tasks, refresh interval, start-at-login, or disconnect.
- **System tray icon**: refresh, settings, start-at-login, quit.

## Running

```bash
npm install      # first time only
npm start
```

Auto-launches at login by default (toggle in settings or the tray menu).

### Build a standalone installer (optional)

```bash
npm run dist     # NSIS installer in dist/
```

## How it works

- **Electron** fullscreen transparent overlay; click-through everywhere except the
  arrow/panel (`setIgnoreMouseEvents` with forwarding) so it never blocks apps behind it.
- **googleapis** in the main process: OAuth loopback flow, `events.list`
  (recurring expanded server-side), `tasks.list`, and `events.quickAdd` for adding.
- Config + tokens live in `%APPDATA%/calendar-hover-bar/config.json` (local only).

## Tweaking the look

Colors, sizes, blur and transparency are CSS variables at the top of
`renderer/styles.css` (`--bg`, `--accent`, `--arrow-w`, `--panel-w`, …).
