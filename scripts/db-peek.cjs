// Dev helper: prints recent sessions. Run with: ELECTRON_RUN_AS_NODE=1 npx electron scripts/db-peek.cjs
const Database = require('better-sqlite3')
const path = require('path')
const db = new Database(path.join(process.env.APPDATA, 'DeskTime', 'desktime.db'), { readonly: true })
const f = (t) => new Date(t).toLocaleTimeString()
for (const r of db.prepare('SELECT s.id, a.display_name, s.start_ts, s.end_ts, s.is_idle FROM sessions s JOIN apps a ON a.id=s.app_id ORDER BY s.start_ts DESC LIMIT 8').all())
  console.log(r.id, r.display_name.padEnd(20), f(r.start_ts), '->', f(r.end_ts), r.is_idle ? 'idle' : 'active', Math.round((r.end_ts - r.start_ts) / 1000) + 's')
console.log('apps:', db.prepare('SELECT display_name, exe_name, icon IS NOT NULL AS has_icon FROM apps').all())
