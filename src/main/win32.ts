// Thin Win32 bindings via koffi (prebuilt FFI, no compilation).
// Only a handful of cheap calls per tick: GetForegroundWindow -> pid -> exe path (+ window sanity checks).
import koffi from 'koffi'
import { basename } from 'path'

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')
const powrprof = koffi.load('powrprof.dll')

const RECT = koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' })
const MONITORINFO = koffi.struct('MONITORINFO', { cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t' })

const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
const GetWindowThreadProcessId = user32.func(
  'uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* lpdwProcessId)'
)
const ShowWindow = user32.func('int __stdcall ShowWindow(void* hWnd, int nCmdShow)')
const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void* hWnd)')
const IsZoomed = user32.func('int __stdcall IsZoomed(void* hWnd)')
const GetWindowTextLengthW = user32.func('int __stdcall GetWindowTextLengthW(void* hWnd)')
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(void* hWnd, int nIndex)')
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void* hWnd, _Out_ RECT* lpRect)')
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void* hWnd, _Out_ char16_t* lpString, int nMaxCount)')
const MonitorFromWindow = user32.func('void* __stdcall MonitorFromWindow(void* hwnd, uint32_t dwFlags)')
const GetMonitorInfoW = user32.func('int __stdcall GetMonitorInfoW(void* hMonitor, _Inout_ MONITORINFO* lpmi)')
// SystemExecutionState: which ES_* requests are currently active system-wide (video players and browsers
// playing video hold ES_DISPLAY_REQUIRED so the screen does not sleep).
const CallNtPowerInformation = powrprof.func(
  'int32_t __stdcall CallNtPowerInformation(int32_t level, void* in, uint32_t inLen, _Out_ uint32_t* out, uint32_t outLen)'
)
const EnumChildProc = koffi.proto('int __stdcall EnumChildProc(void* hwnd, intptr_t lParam)')
const EnumChildWindows = user32.func(
  'int __stdcall EnumChildWindows(void* hWndParent, EnumChildProc* lpEnumFunc, intptr_t lParam)'
)
const OpenProcess = kernel32.func(
  'void* __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)'
)
const QueryFullProcessImageNameW = kernel32.func(
  'int __stdcall QueryFullProcessImageNameW(void* hProcess, uint32_t dwFlags, _Out_ char16_t* lpExeName, _Inout_ uint32_t* lpdwSize)'
)
// Packaged (Store / MSIX) apps: stable identity that survives updates, unlike the exe path.
const GetPackageFamilyName = kernel32.func(
  'int32_t __stdcall GetPackageFamilyName(void* hProcess, _Inout_ uint32_t* packageFamilyNameLength, _Out_ char16_t* packageFamilyName)'
)
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void* hObject)')

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const SW_MINIMIZE = 6
const GWL_EXSTYLE = -20
const GWL_STYLE = -16
const WS_CAPTION = 0x00c00000
const MONITOR_DEFAULTTONEAREST = 2
const SYSTEM_EXECUTION_STATE = 16
const ES_DISPLAY_REQUIRED = 0x2
const titleBuf = Buffer.alloc(2 * 512)
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_NOACTIVATE = 0x08000000

const pathBuf = Buffer.alloc(2 * 1024)
const pfnBuf = Buffer.alloc(2 * 256)
const procCache = new Map<number, { path: string; family: string | null; at: number }>()

function processInfo(pid: number): { path: string; family: string | null } | null {
  const cached = procCache.get(pid)
  const now = Date.now()
  if (cached && now - cached.at < 60_000) return cached
  const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
  if (!h) return null
  try {
    const size = [1024]
    const ok = QueryFullProcessImageNameW(h, 0, pathBuf, size)
    if (!ok) return null
    const path = pathBuf.toString('utf16le', 0, size[0] * 2)
    let family: string | null = null
    try {
      const len = [256]
      const rc = GetPackageFamilyName(h, len, pfnBuf)
      if (rc === 0 && len[0] > 1) family = pfnBuf.toString('utf16le', 0, (len[0] - 1) * 2)
    } catch {
      /* not available on this Windows */
    }
    const info = { path, family, at: now }
    procCache.set(pid, info)
    if (procCache.size > 500) procCache.clear()
    return info
  } finally {
    CloseHandle(h)
  }
}

export interface ForegroundInfo {
  hwnd: unknown
  pid: number
  exePath: string
  exeName: string
  /** Package family name for Store/MSIX apps, null for classic desktop apps. */
  packageFamily: string | null
  /** False for invisible, untitled, tiny or tool windows: splash screens, brokers, focus-stealing helpers. */
  isRealWindow: boolean
  /** Window covers its whole monitor (video, presentation, game). */
  fullscreen: boolean
}

/** True fullscreen only: a borderless window sized to its monitor. Maximized windows have a caption and are excluded. */
function isFullscreen(hwnd: unknown): boolean {
  try {
    if (IsZoomed(hwnd)) return false
    const style = Number(GetWindowLongPtrW(hwnd, GWL_STYLE))
    if ((style & WS_CAPTION) === WS_CAPTION) return false
    const r = {} as { left: number; top: number; right: number; bottom: number }
    if (!GetWindowRect(hwnd, r)) return false
    const mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)
    if (!mon) return false
    const mi = { cbSize: 40, rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 }, rcWork: { left: 0, top: 0, right: 0, bottom: 0 }, dwFlags: 0 }
    if (!GetMonitorInfoW(mon, mi)) return false
    const m = mi.rcMonitor
    return r.left <= m.left + 1 && r.top <= m.top + 1 && r.right >= m.right - 1 && r.bottom >= m.bottom - 1
  } catch {
    return false
  }
}

/** True while some process asks Windows to keep the display on (video playback, presentations). */
export function isDisplayRequired(): boolean {
  try {
    const out = [0]
    const rc = CallNtPowerInformation(SYSTEM_EXECUTION_STATE, null, 0, out, 4)
    return rc === 0 && (out[0] & ES_DISPLAY_REQUIRED) !== 0
  } catch {
    return false
  }
}

/** Current title of a window (only called when the user opted into title tracking). */
export function windowTitle(hwnd: unknown): string {
  try {
    const n = GetWindowTextW(hwnd, titleBuf, 512)
    return n > 0 ? titleBuf.toString('utf16le', 0, n * 2) : ''
  } catch {
    return ''
  }
}

function isRealWindow(hwnd: unknown): boolean {
  try {
    if (!IsWindowVisible(hwnd)) return false
    if (GetWindowTextLengthW(hwnd) <= 0) return false
    const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
    if (ex & WS_EX_TOOLWINDOW || ex & WS_EX_NOACTIVATE) return false
    const r = {} as { left: number; top: number; right: number; bottom: number }
    if (GetWindowRect(hwnd, r)) {
      if (r.right - r.left < 200 || r.bottom - r.top < 120) return false
    }
    return true
  } catch {
    return true
  }
}

/** Returns the foreground application, resolving UWP frame hosts to the real app when possible. */
export function getForeground(): ForegroundInfo | null {
  const hwnd = GetForegroundWindow()
  if (!hwnd) return null
  const out = [0]
  GetWindowThreadProcessId(hwnd, out)
  let pid = out[0]
  if (!pid) return null
  let info = processInfo(pid)
  if (!info) return null
  let exeName = basename(info.path)

  // UWP / packaged apps are hosted by ApplicationFrameHost; the real app owns a visible child window.
  if (exeName.toLowerCase() === 'applicationframehost.exe') {
    let childPid = 0
    try {
      EnumChildWindows(
        hwnd,
        (child: unknown) => {
          const o = [0]
          GetWindowThreadProcessId(child, o)
          if (o[0] && o[0] !== pid && IsWindowVisible(child)) {
            childPid = o[0]
            return 0
          }
          return 1
        },
        0
      )
    } catch {
      /* ignore */
    }
    if (childPid) {
      const p = processInfo(childPid)
      if (p) {
        pid = childPid
        info = p
        exeName = basename(p.path)
      }
    }
  }
  return {
    hwnd,
    pid,
    exePath: info.path,
    exeName,
    packageFamily: info.family,
    isRealWindow: isRealWindow(hwnd),
    fullscreen: isFullscreen(hwnd)
  }
}

/** Minimizes the given window (used for strict limits / focus restrictions). */
export function minimizeWindow(hwnd: unknown): void {
  try {
    ShowWindow(hwnd, SW_MINIMIZE)
  } catch {
    /* ignore */
  }
}

/** Package family name derived from a WindowsApps install path (Publisher.Name_version_arch__hash -> Publisher.Name_hash). */
export function familyFromWindowsAppsPath(exePath: string): string | null {
  const m = /\\WindowsApps\\([^\\]+)\\/i.exec(exePath)
  if (!m) return null
  const parts = m[1].split('_')
  if (parts.length < 2) return null
  return `${parts[0]}_${parts[parts.length - 1]}`
}

/**
 * Windows shell pieces and vendor helpers that grab the foreground for a moment but are never
 * "what the user is doing". Recorded, but hidden from statistics by default (user can unhide).
 */
export const SYSTEM_PROCESSES = new Set(
  [
    'searchhost.exe',
    'searchapp.exe',
    'startmenuexperiencehost.exe',
    'shellexperiencehost.exe',
    'shellhost.exe',
    'lockapp.exe',
    'logonui.exe',
    'textinputhost.exe',
    'applicationframehost.exe',
    'runtimebroker.exe',
    'omapsvcbroker.exe',
    'systemsettingsbroker.exe',
    'credentialuibroker.exe',
    'pickerhost.exe',
    'dllhost.exe',
    'rundll32.exe',
    'consent.exe',
    'ctfmon.exe',
    'sihost.exe',
    'taskhostw.exe',
    'widgets.exe',
    'wwahost.exe',
    'msedgewebview2.exe',
    'securityhealthsystray.exe',
    'gamebar.exe',
    'gamebarftserver.exe',
    'xboxgamebarwidgets.exe',
    'nvidia overlay.exe',
    'nvcontainer.exe',
    'rtkauduservice64.exe',
    'useroobebroker.exe',
    'smartscreen.exe',
    'msiexec.exe',
    'openwith.exe',
    'werfault.exe',
    'wscript.exe',
    'conhost.exe'
  ].map((s) => s.toLowerCase())
)

const FRIENDLY: Record<string, string> = {
  'code.exe': 'Visual Studio Code',
  'cursor.exe': 'Cursor',
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Firefox',
  'brave.exe': 'Brave',
  'opera.exe': 'Opera',
  'arc.exe': 'Arc',
  'discord.exe': 'Discord',
  'spotify.exe': 'Spotify',
  'explorer.exe': 'File Explorer',
  'windowsterminal.exe': 'Terminal',
  'cmd.exe': 'Command Prompt',
  'powershell.exe': 'PowerShell',
  'pwsh.exe': 'PowerShell',
  'notion.exe': 'Notion',
  'obsidian.exe': 'Obsidian',
  'slack.exe': 'Slack',
  'teams.exe': 'Microsoft Teams',
  'ms-teams.exe': 'Microsoft Teams',
  'winword.exe': 'Word',
  'excel.exe': 'Excel',
  'powerpnt.exe': 'PowerPoint',
  'outlook.exe': 'Outlook',
  'olk.exe': 'Outlook',
  'onenote.exe': 'OneNote',
  'steam.exe': 'Steam',
  'steamwebhelper.exe': 'Steam',
  'epicgameslauncher.exe': 'Epic Games',
  'vlc.exe': 'VLC',
  'telegram.exe': 'Telegram',
  'whatsapp.exe': 'WhatsApp',
  'whatsapp.root.exe': 'WhatsApp',
  'obs64.exe': 'OBS Studio',
  'photoshop.exe': 'Photoshop',
  'figma.exe': 'Figma',
  'idea64.exe': 'IntelliJ IDEA',
  'pycharm64.exe': 'PyCharm',
  'webstorm64.exe': 'WebStorm',
  'devenv.exe': 'Visual Studio',
  'notepad.exe': 'Notepad',
  'notepad++.exe': 'Notepad++',
  'acrobat.exe': 'Acrobat Reader',
  'sumatrapdf.exe': 'SumatraPDF',
  'zoom.exe': 'Zoom',
  'applicationframehost.exe': 'Windows App',
  'searchhost.exe': 'Windows Search',
  'startmenuexperiencehost.exe': 'Start Menu',
  'shellexperiencehost.exe': 'Windows Shell',
  'taskmgr.exe': 'Task Manager',
  'systemsettings.exe': 'Settings',
  'electron.exe': 'DeskTime (dev)',
  'desktime.exe': 'DeskTime'
}

/** Default category per executable; anything not listed starts uncategorized. */
export const DEFAULT_CATEGORIES: { name: string; color: string; exes: string[] }[] = [
  {
    name: 'Work',
    color: '#5b5bd6',
    exes: ['code.exe', 'cursor.exe', 'windowsterminal.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'notion.exe', 'obsidian.exe',
      'winword.exe', 'excel.exe', 'powerpnt.exe', 'onenote.exe', 'figma.exe', 'idea64.exe', 'pycharm64.exe', 'webstorm64.exe',
      'devenv.exe', 'notepad++.exe', 'acrobat.exe', 'sumatrapdf.exe', 'photoshop.exe', 'obs64.exe']
  },
  {
    name: 'Communication',
    color: '#2a78d6',
    exes: ['discord.exe', 'slack.exe', 'teams.exe', 'ms-teams.exe', 'outlook.exe', 'olk.exe', 'telegram.exe', 'whatsapp.exe',
      'whatsapp.root.exe', 'zoom.exe']
  },
  { name: 'Browsing', color: '#1baf7a', exes: ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'arc.exe'] },
  { name: 'Entertainment', color: '#e87ba4', exes: ['spotify.exe', 'vlc.exe'] },
  { name: 'Games', color: '#eb6834', exes: ['steam.exe', 'steamwebhelper.exe', 'epicgameslauncher.exe'] },
  { name: 'Tools', color: '#c98500', exes: ['explorer.exe', 'taskmgr.exe', 'systemsettings.exe', 'notepad.exe', 'snippingtool.exe'] }
]

/** Strip the trailing app name browsers and editors append to their titles ("Docs - Brave", "index.ts - Visual Studio Code"). */
export function cleanTitle(title: string, appName: string): string {
  let t = title.trim()
  const suffixes = [appName, 'Google Chrome', 'Microsoft Edge', 'Mozilla Firefox', 'Brave', 'Opera', 'Visual Studio Code',
    'Visual Studio', 'Personal - Microsoft​ Edge', 'and \d+ more pages? - Personal - Microsoft Edge']
  for (const s of suffixes) {
    const re = new RegExp(`\\s+[-—–|·]\\s+${s}$`, 'i')
    t = t.replace(re, '')
  }
  t = t.replace(/^\(\d+\)\s+/, '') // notification counters like "(3) WhatsApp"
  t = t.replace(/^[●•*]\s+/, '') // unsaved-changes markers
  return t.slice(0, 200)
}

export function friendlyName(exeName: string): string {
  const key = exeName.toLowerCase()
  if (FRIENDLY[key]) return FRIENDLY[key]
  const base = exeName
    .replace(/\.exe$/i, '')
    .replace(/\.(root|app|main|desktop|ui|host)$/i, '')
    .replace(/[_-]+/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function isKnownFriendly(exeName: string): boolean {
  return exeName.toLowerCase() in FRIENDLY
}
