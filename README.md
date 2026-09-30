# ScreenWise — Screen Time for Windows

A privacy-first desktop utility that answers one question: **how am I actually spending my time on my computer?**

It runs quietly in the system tray, tracks which application is in the foreground and whether you are actually
using the PC, and shows the result in a dark, minimal dashboard. Everything is stored locally in SQLite. There is no
account, no cloud and no server, and the app makes no network requests at all.

## Getting it

ScreenWise is distributed through the Microsoft Store, which also delivers updates in the background. Settings > About
has a "Check in Store" button that opens the listing. A pending update installs the next time the app is quit
completely (Settings > Quit), since Windows will not replace a package while it is running in the tray.

- Known limitations: no browser tab or website tracking, no multi-device sync, and Store apps get their proper icon and
  name after their first launch.
- Reporting a problem: include your Windows version, the newest log (Settings > About > Open logs) and a screenshot of
  Settings > Diagnostics while the problem is happening. Logs never contain your activity.

## What it tracks

- Foreground application and how long it stays active
- Active, passive and idle time. No input for the idle threshold (default 1 min) turns a session passive (reading,
  thinking); past the passive band (default 5 min) the whole no-input stretch becomes idle. Passive time is part of the
  active total and shown separately
- Media mode keeps time active while a fullscreen app or a video holds the display awake; call mode does the same while
  any app holds the microphone or camera (read from the Windows privacy consent store, no audio is touched)
- Screen-off cap: once idle exceeds the power plan's display-sleep timeout, nothing more counts as screen time until
  input returns
- Screen lock / unlock and sleep / resume
- Continuous usage sessions and application switches
- Focus sessions, app limits and break reminders

It never records window titles, keystrokes, screenshots, URLs or browser tabs.

## Features

| Area | What you get |
| --- | --- |
| Overview | Companion avatar (seven characters or your own picture) with greeting and live status, one screen-time figure with yesterday comparison, category strip, active/passive/idle ring, half-hour heat strip, three most-used apps as chips |
| Timeline | Full 24h lanes per application with idle overlay, scroll to zoom and shift+scroll to pan, hover details, click for exact start/end, sessions and app switches, activity log |
| Applications | Per-app breakdown, today vs. day before, 7-day average, sessions, longest session, 7-day chart. Rename apps or hide them from statistics |
| Focus | Timed sessions with a label, allowed and restricted apps; restricted apps are minimized with a reminder; history and stats |
| Limits | Daily active-time caps per app, typed as minutes or hours, with three modes: warning only, repeating reminder, strict (minimize) |
| Streaks | Daily goals (screen time under, active for at least, a category or app under a limit, focus a day) with current and best runs, a 14-day dot row, three freeze days a month, an evening at-risk reminder, and a GitHub-style graph of this year's screen time or of any streak's hits, misses and frozen days |
| Categories | Editable categories (Work, Communication, Browsing, Entertainment, Games, Tools by default) with a time-by-category bar on the Overview |
| Digests | Daily notification at a time you choose and a Monday weekly summary, both click through to the dashboard |
| Reports | Weekly, monthly and yearly reports (calendar heatmap, month-by-month against last year, top apps, weekdays vs weekends, personal records), usage insights (patterns, not scores); any day in a graph opens at a glance |
| Settings | Idle threshold, day start hour (late nights count toward the previous day), background audio, startup behavior, notifications, break reminders, hardware acceleration, how long to keep full detail (older days become daily totals), data export and deletion |
| Tray | Click for a compact popup (today's total, one-line breakdown, Open / Focus / Pause); double-click opens the dashboard. Multi-size ICO icon, screen time at a glance, open dashboard, start focus, take a break, pause/resume tracking, quit |
| Startup | Launch at Windows sign-in (registers under the current user's Run key), optionally staying in the tray |

## Accuracy tools

- Settings has a live Diagnostics view: foreground exe, package family, window flags, idle timer, display timeout, media
  and call flags, and the session being written. Use it when something looks misattributed.
- A first-run screen states what is recorded and what never is, and asks about startup up front.

## Logs and crash handling

- `%APPDATA%\ScreenWise\logs\screenwise.log` (rotated at 1 MB, three files kept). Settings > About > Open logs.
- Contains app health only: start and quit, versions, tracker errors, renderer warnings and crashes, uncaught
  exceptions. Never window titles or usage data.
- Uncaught errors in the main process are logged and the app keeps running; the tracker tick guards itself, so a
  single bad event does not end the tray process. Renderer crashes are logged with reason and exit code.
- When reporting a problem, attach the newest log and a screenshot of Settings > Diagnostics.

## What counts as an app

- A window only counts after it has been in front for two seconds and is a real window: visible, titled, not a
  tool window, at least 200 by 120 pixels. Splash screens, brokers and focus-stealing helpers never become apps.
- Known Windows shell pieces and vendor helpers (search host, start menu, lock screen, brokers, consent prompts) are
  recorded but hidden from statistics by default. Unhide them from the Applications page if you want them.
- Store / MSIX apps are identified by their package family name, so updates do not create duplicates, and their
  display name and logo come from the Windows package manager.
- Apps under two minutes in a day fold into a single "Other" row in lists and the timeline. Nothing is lost.

## Design

- Settings > Appearance: theme mode, dark surface family (Forest, Navy, Graphite, Neutral), light surface (Cool white,
  Warm paper, Mist, Sage), nine accent presets or a custom color (auto-adjusted for readability per mode), corner roundness, motion
  level and font (the Windows system font, or bundled Comic Neue, Saira, Roboto and Caveat). Every change previews instantly and persists.
- Light and dark themes that follow the Windows setting live, or can be forced in Settings. Tokens live as CSS
  variables in one place; Tailwind utilities read them, so every surface switches together.
- Segoe UI Variable by default, with tabular numerals for figures; four bundled alternatives work offline.
- Palette: cool white light mode and a dark green-gray "forest" dark mode, both with a coral accent (`#D9503F` light, `#FF7A6B` dark).
- Subtle depth: solid cards with soft shadows and a faint accent wash behind the page. No glass by default; Windows
  Mica or Acrylic remain available under Settings > Performance.
- Categorical chart colors have separate light and dark steps, both validated for colorblind separation on their
  card surfaces.
- Motion: staggered card entrances, sliding sidebar indicator, count-up figures, a progress ring around the focus
  timer, a pulsing live indicator. Honors `prefers-reduced-motion`.

## Tech stack

- Electron 37, React 19, TypeScript, Vite (via electron-vite)
- Tailwind CSS 4, Lucide icons, Framer Motion, Recharts
- SQLite via better-sqlite3 (WAL mode)
- Win32 via [koffi](https://koffi.dev) FFI: `GetForegroundWindow`, `GetWindowThreadProcessId`,
  `QueryFullProcessImageNameW`, `ShowWindow`; idle and lock detection via Electron's `powerMonitor`
- electron-builder for the NSIS installer

No C++ toolchain is needed: koffi ships prebuilt binaries and better-sqlite3 is fetched as an Electron prebuild by
`@electron/rebuild` during `npm install`.

## Architecture

```
src/
  main/        Electron main process
    index.ts     app lifecycle, window, IPC handlers, power events
    tracker.ts   1 Hz foreground/idle poller, session writer
    guardian.ts  focus mode, app limits, break reminders
    db.ts        SQLite schema, queries, aggregations
    win32.ts     koffi bindings and friendly app names
    tray.ts      tray icon and menu
    audio.ts     which processes are producing sound (Core Audio sessions via koffi), for the listening track
  preload/     contextBridge API exposed as window.api
  renderer/    React dashboard (pages, components, lib)
  shared/      types shared by all three
```

Data lives in `%APPDATA%\ScreenWise\screenwise.db`. Sessions are rows of `(app, start, end, is_idle, day)`; everything
on screen is aggregated from them at query time. Hiding and merging apps are flags on the `apps` table applied at
query time, so both are reversible and never rewrite recorded sessions. The app never records its own window.

Retention keeps the database small: days older than the window in Settings (default one year) are folded into
`daily_totals` (per app and day: active, passive, idle, session count, longest session) and `daily_summary` (per day:
device-level stretches, switches, first and last activity), then their raw sessions are deleted.
Every range query reads both tables, so reports, averages and categories are identical before and after; only the
minute-by-minute timeline of those old days is gone. Each day moves in its own transaction and the file is vacuumed at
most once a week.

## Background footprint

- Polling does four cheap Win32 calls per second; measured CPU is about 0.1% across all processes while idle.
- The live session is held in memory and flushed to SQLite every 15 seconds or on change.
- Closing the dashboard destroys the renderer process; only the main process and Chromium helpers stay resident
  (about 110 MB private memory in total on Windows 11 with the default settings).
- Hardware acceleration is off by default: measured 111 MB private memory resident with the dashboard closed versus 188 MB with it on. Enable it in Settings if you prefer GPU-composited animations.

## Development

```bash
npm install          # also rebuilds better-sqlite3 for Electron and generates icons
npm run dev          # electron-vite dev server with HMR
npm run typecheck    # main + renderer
npm run build        # production bundles into out/
npm run dist         # NSIS installer into release/
```

If you launch Electron from a shell that has `ELECTRON_RUN_AS_NODE=1` set (some IDE terminals do), unset it first,
otherwise Electron starts as plain Node and `app` is undefined.

Dev helpers in `scripts/`:

- `make-icons.mjs` builds every app and tray icon from `resources/logo.png` (the source logo) without any image library; the tray uses a white silhouette so it stays visible on a dark taskbar.
- Offscreen page capture without touching the screen (dev builds only):
  `SCREENWISE_CAPTURE="reports:C:/tmp/reports.png" SCREENWISE_CAPTURE_H=1500 npx electron .`
  Add `SCREENWISE_CAPTURE_THEME=light|dark` to force a mode, `SCREENWISE_CAPTURE_SCROLL=1700` to capture lower content,
  `SCREENWISE_CAPTURE_TEXT=1` to also print the page text and a diagnostics snapshot, `SCREENWISE_CAPTURE_JS='(async () => ...)()'`
  to run a script in the page (its result is printed) before the shot.
- `SCREENWISE_USER_DATA=C:/tmp/profile` (dev builds only) uses a scratch profile with its own database and single-instance
  lock, so a dev launch works while the installed app is running and never touches its data.

## Code signing

Unsigned installers trigger a SmartScreen warning on other PCs. The build is wired for signing; only the certificate
is missing, because a trusted certificate has to be bought and identity-verified.

- **Test the pipeline locally** with a self-signed certificate:
  `powershell -ExecutionPolicy Bypass -File scripts/sign-dev.ps1` then `npm run dist:signed`.
  The installer and exe are signed and timestamped, but SmartScreen still warns on machines that do not trust
  that certificate. Useful to verify nothing breaks, nothing more.
- **Ship without warnings** with a certificate from a public CA. Cheapest reasonable route in 2026 is
  Azure Trusted Signing (pay-as-you-go, identity validation, no hardware token); the classic route is an OV or EV
  code-signing certificate from DigiCert, Sectigo or similar (EV skips SmartScreen reputation building).
  Set `CSC_LINK` (path to the PFX) and `CSC_KEY_PASSWORD` in the environment and run `npm run dist`;
  electron-builder signs the exe, the uninstaller and the installer and timestamps them against DigiCert.
- Store builds need none of this: the Microsoft Store signs the package on submission.

## Releasing

1. Bump `version` in `package.json` and add a section to `RELEASE_NOTES.md`.
2. `npm run dist:store` writes `release/ScreenWise-<version>.appx` with the Partner Center identity from the `appx`
   block in `package.json`. Upload it to a new submission in Partner Center with the release notes as the "What's new"
   text. Launch at startup in this build is a `windows.startupTask` (`resources/appx-extensions.xml`) toggled through
   the StartupTask API (`src/main/startupTask.ts`); the classic build keeps using the Run key.
3. Once certified, the Store rolls it out; installed copies pick it up in the background within about a day.
4. `npm run dist` still produces a classic installer for local testing; it is not distributed.

## Roadmap

- Browser extensions for website and tab tracking
- Android integration and multi-device dashboard
- Optional encrypted cloud backup and sync
- Categories and richer insights
- Limit snooze, per-weekday limits
