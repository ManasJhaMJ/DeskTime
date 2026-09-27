# DeskTime 0.1.0-beta.1

First public beta of DeskTime, a local-only screen time and digital wellbeing tracker for Windows 10/11.

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
