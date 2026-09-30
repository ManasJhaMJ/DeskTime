# ScreenWise 1.0.0

ScreenWise is the new name of DeskTime; the beta installers below still carry the old one. Existing data is picked up
on first start.

The first full release, on the Microsoft Store. Updates now arrive through the Store; the app itself makes no network
requests. Beta installs from GitHub keep working but no longer update: install from the Store and remove the old copy.

## New

**Applications shows the whole year.** The list now holds every application you have used this year, searchable and
scrollable, with its total time, active time and days used. Totals run up to yesterday and are computed once a day,
so today's use joins them after midnight; the detail panel still shows today, yesterday and the 7-day average.
Hidden applications are collapsed until you ask for them.

**Yearly reports.** Reports gains a Yearly tab: month-by-month bars against the previous year, averages per weekday,
top applications, categories and a comparison with the same part of last year. The Daily tab is gone; the Timeline
covers a single day.

**Click a day in any graph.** The weekly bars, the month grid and the year graph on Streaks open the day at a glance:
screen, active and idle time, sessions and the three most used applications.

**Days in a row.** Streaks has a built-in streak counting consecutive days with at least five minutes of screen time,
with current and best runs.

**Weekdays vs weekends.** Monthly and Yearly reports show the applications you reach for on work days beside the ones
you use on days off, as averages per day of each type.

**Personal records.** The Yearly tab lists your all-time bests: longest day, most active day, longest session, most app
switches, earliest start and latest finish, each with its date. Click the date to see that day.

## Improved

- New defaults: launch at Windows startup, the amber accent, Kat as companion, and full detail kept forever.
- Instant tooltips on buttons instead of the slow native ones; quitting asks in a dialog.
- Updates come from the Microsoft Store. Settings > About has "Check in Store"; the GitHub update check is gone.
- On the Timeline, "more applications" expands the list in place.
- The zoom hint sits above the lanes instead of in the page subtitle.

## Fixed

- **Active time by hour** rendered no bars, on the Timeline and on Reports. The chart now draws, is taller on the
  Timeline, and hovering a bar shows the hour and its active time.

# ScreenWise 0.2.0-beta.3

The first beta that arrives through the app itself: on beta.2, open Settings > About and press **Check now**.
Data and settings carry over.

## New

**Background audio is recorded.** Music, podcasts or a video in a background tab used to disappear, because only
the app in front counts as screen time. ScreenWise now reads the Windows audio session list, the same data the
volume mixer shows, and records apps that play sound behind another app as *listening* time. No sound is captured.

- Shows under the app's idle time, as a hatched block on its Timeline lane, and as "Listening to Spotify" on the Overview.
- Never added to the day's screen time, so totals, limits and streaks are unchanged.
- Turn it off under Settings > Tracking > Record background audio.

**Timeline is now the detailed view of your day.** Eight tiles cover screen time against yesterday, active and
passive, idle, focus, sessions, breaks, app switches and the day span. Below the lanes: active time by hour, time by
category, the top applications with their share, and the most common switches. Past days get the same breakdown.

**Quit from Settings.** A Quit card at the bottom of Settings offers "Keep running in background" or "Complete quit",
with a warning that a complete quit stops all monitoring.

**Companions have names.** Boo, Kat, Jell, Clove, Beep, Emjay and Drift. Hover an avatar in Settings to see who is who.

## Improved

- Settings is pinned to the bottom of the sidebar.
- Drop-downs match the rest of the controls: rounded, with icons and category colours, keyboard friendly.
- Option switches slide to the chosen value instead of jumping.
- Changing hardware acceleration or window glass shows a "Restart now" prompt. Hints that need a restart are in bold.
- Accent buttons darken on hover instead of brightening, so the label stays readable.
- Window glass is softer: the wallpaper tint reads whiter in light mode and calmer in dark mode.
- Reports > Monthly > By category shows how many applications each category holds.

## Fixed

- A thin strip above the first row of the Applications list.

## Update

**From beta.2:** Settings > About > **Check now**, then **Download** and **Restart to update**. A downloaded update also
installs the next time the app quits.

**From beta.1 or a fresh install:** run `DeskTime-Setup-0.2.0-beta.3.exe`. The installer is not code-signed yet, so
SmartScreen shows "Windows protected your PC": click **More info**, then **Run anyway**. Installs per user, no admin
rights needed.

# ScreenWise 0.1.0-beta.2

Second beta. Installs over beta.1; data and settings are kept (database schema moves from version 5 to 8). This is
the last release you have to install by hand: from here on the app updates itself.

## What changed

- **Auto-update.** The app checks GitHub Releases at startup and every six hours and offers the download in
  Settings > About (or press "Check now"). Downloads start only when you ask; the update installs on the next restart.
  This is the only network request the app makes, it sends nothing about you, and it can be turned off. beta.1 cannot
  update itself, so install this one by hand once.
- **Data retention.** Settings > Your data > "Keep full detail for" (3 months to forever, default one year). Days older
  than that are folded into per-app daily totals, so reports, averages and categories stay identical while the database
  stays small and fast; only the minute-by-minute timelines of those old days are removed. The database row now shows
  the file size and how many days are kept as totals, and Compact runs the fold right away.
- **Streaks page.** Set daily goals such as "screen time under 6h", "at least 2h of Work", "Brave under 1h" or "25m of
  focus a day". Each shows its current and best run, today's state and the last two weeks; a GitHub-style graph shows
  this year's screen time or any streak's hits and misses. Streaks count every recorded day, including compacted ones.
  Each streak has three freeze days a month to cover a miss (click a missed day in its row), and an evening reminder
  (Settings > Notifications) warns when a streak is not met yet or close to breaking.
- **Companion.** A small animated character sits on the Overview card with the greeting and live status. It hops when
  you switch apps, rocks while media or a call keeps the day active, and dozes off at night, while nothing is tracked,
  or never, your choice. Pick one of seven bots, use your own picture, or turn it off, all under Settings > Companion.
- **Day starts at** (Settings > Tracking, and asked on first run): pick an hour up to 6 AM; use before it counts toward
  the previous day, so a night owl's 1 AM session stays on the evening it belongs to. Overview, Timeline, limits, streaks
  and digests all follow it, and changing it re-files what was recorded so far.
- **Overview redesigned** as a single calm column: one large screen-time figure with a category strip beneath it, a
  ring splitting active, passive and idle time, a half-hour heat strip for the shape of the day, and chips for the three
  most used apps. Tiles, lanes and lists moved to the Timeline and Applications pages.
- **Timeline** zooms with the mouse wheel over the lanes (shift+wheel pans, Reset returns to the full day) and shows
  the day's sessions and app switches.
- **Focus custom duration.** The field now accepts `20`, `45m`, `1h`, `1h 30m`, `1.5h` and `1:30`, shows the resolved
  length on the Start button, flags text it cannot read instead of silently starting a 60-minute session, and Enter
  starts the session. Anything above 12 hours is clamped.
- **App limits** take any length you type (`45m`, `1h 30m`, `1:30`) instead of a fixed dropdown.
- **Applications** > Manage card is titled with the selected app's name; the name field is always editable and Save
  lights up as soon as the text differs. The "Report together with" merge option is gone. Selected rows no longer spill
  past the card edge.
- **New logo.** New app icon in the window, taskbar, installer and notifications; the tray icon is a white silhouette
  of it so it stays visible on a dark taskbar, gray while tracking is paused.
- **Fonts.** The dashboard now uses the Windows system font (Segoe UI Variable) by default, with Comic Neue, Saira,
  Roboto and Caveat bundled as alternatives under Settings > Appearance. Manrope is gone; if you had it selected you are
  moved to System.
- **Colors.** Categories choose from eighteen swatches instead of nine, and the custom accent has a proper color picker.
- **Toggles** no longer get squeezed in narrow rows, which could leave the knob outside the track.
- **Removed: window-title recording.** The opt-in setting, its data and the "Windows today" list are gone; any titles
  recorded by beta.1 are deleted on first start. The first-run screen asks about your day start instead.

## Install

1. Download `DeskTime-Setup-0.1.0-beta.2.exe`.
2. Run it. The installer is still not code-signed, so SmartScreen shows "Windows protected your PC".
   Click **More info**, then **Run anyway**. Installs per user, no admin rights needed.

# ScreenWise 0.1.0-beta.1

First public beta of ScreenWise, a local-only screen time and digital wellbeing tracker for Windows 10/11.

## Install

1. Download `DeskTime-Setup-0.1.0-beta.1.exe` (98 MB).
2. Verify it: in PowerShell run `Get-FileHash .\DeskTime-Setup-0.1.0-beta.1.exe -Algorithm SHA256` and compare:

   `568cef39efed9e59b93385c30d04b5b1a77f9c0ff72c7f8868878c6400520b9d`

3. Run it. The installer is not code-signed yet, so SmartScreen shows "Windows protected your PC".
   Click **More info**, then **Run anyway**. Installs per user, no admin rights needed.

## What you get

- Foreground app tracking with active, passive and idle time; media and call detection; screen-off cap
- 24h timeline, per-app breakdown, categories, focus sessions, app limits, break reminders
- Daily, weekly (with last-week comparison) and monthly reports, digests, tray popup
- Light and dark themes following Windows, with customizable surfaces, accent, corners, motion and font
- Everything stored locally in SQLite. No account, no cloud, no network use.

## Known limitations

- No browser tab or website tracking yet
- No sync between PCs
- Store apps show a generic icon and name until their first launch after install
- The data format may change between betas; export from Settings before upgrading

## Reporting problems

Open an issue with your Windows version, the newest log (Settings > About > Open logs) and a screenshot of
Settings > Diagnostics while the problem is happening. Logs contain app health only, never your activity.
