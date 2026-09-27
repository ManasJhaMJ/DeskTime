const { app } = require('electron')
app.whenReady().then(() => {
  const out = {}
  try { const D = require('better-sqlite3'); const db = new D(':memory:'); out.sqlite = db.prepare('select sqlite_version() v').get().v } catch (e) { out.sqliteErr = String(e) }
  try {
    const koffi = require('koffi')
    const u = koffi.load('user32.dll'); const k = koffi.load('kernel32.dll')
    const GFW = u.func('void* __stdcall GetForegroundWindow()')
    const GWTPID = u.func('uint32_t __stdcall GetWindowThreadProcessId(void* h, _Out_ uint32_t* pid)')
    const OP = k.func('void* __stdcall OpenProcess(uint32_t a, int b, uint32_t pid)')
    const Q = k.func('int __stdcall QueryFullProcessImageNameW(void* h, uint32_t f, _Out_ char16_t* s, _Inout_ uint32_t* n)')
    const h = GFW(); const pid = [0]; GWTPID(h, pid)
    const ph = OP(0x1000, 0, pid[0]); const buf = Buffer.alloc(2048); const n = [1024]; Q(ph, 0, buf, n)
    out.foreground = buf.toString('utf16le', 0, n[0] * 2); out.pid = pid[0]
  } catch (e) { out.koffiErr = String(e) }
  out.node = process.versions.node; out.electron = process.versions.electron
  const { powerMonitor } = require('electron'); out.idle = powerMonitor.getSystemIdleTime()
  console.log(JSON.stringify(out)); app.quit()
})
