// Generates PNG icons without any image library: a soft purple orb on transparent background.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}
// Orb: dark rounded square background, purple ring, white core.
function orb(x, y, s) {
  const cx = s / 2 - 0.5, cy = s / 2 - 0.5
  const dx = x - cx, dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy) / (s / 2)
  const aa = 1.5 / s
  const smooth = (edge, v) => Math.max(0, Math.min(1, (edge - v) / aa + 0.5))
  // background disc
  const bgA = smooth(0.98, d)
  if (bgA <= 0) return [0, 0, 0, 0]
  let r = 0x12, g = 0x15, b = 0x1a
  // ring
  const ringA = smooth(0.78, d) * (1 - smooth(0.52, d))
  r = r + (0x7c - r) * ringA; g = g + (0x5c - g) * ringA; b = b + (0xff - b) * ringA
  // core
  const coreA = smooth(0.3, d)
  r = r + (0xff - r) * coreA; g = g + (0xff - g) * coreA; b = b + (0xff - b) * coreA
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(255 * bgA)]
}
// Tray: simple filled purple circle with white dot (reads well at 16px).
function tray(x, y, s) {
  const cx = s / 2 - 0.5, cy = s / 2 - 0.5
  const dx = x - cx, dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy) / (s / 2)
  const aa = 1.5 / s
  const smooth = (edge, v) => Math.max(0, Math.min(1, (edge - v) / aa + 0.5))
  const a = smooth(0.95, d)
  if (a <= 0) return [0, 0, 0, 0]
  const core = smooth(0.38, d)
  const r = 0x7c + (0xff - 0x7c) * core, g = 0x5c + (0xff - 0x5c) * core, b = 0xff
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(255 * a)]
}
// ICO container holding PNG-compressed frames (supported since Vista). Windows picks the size it needs,
// so the tray icon stays crisp at 100%, 125% and 150% scaling.
function ico(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4)
  const dir = Buffer.alloc(16 * frames.length)
  let offset = 6 + dir.length
  frames.forEach(({ size, data }, i) => {
    const o = i * 16
    dir[o] = size >= 256 ? 0 : size; dir[o + 1] = size >= 256 ? 0 : size
    dir[o + 2] = 0; dir[o + 3] = 0
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...frames.map((f) => f.data)])
}
const out = resolve('resources')
if (!existsSync(out)) mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, 'icon.png'), png(256, orb))
writeFileSync(resolve(out, 'tray.png'), png(32, tray))
writeFileSync(resolve(out, 'tray@2x.png'), png(64, tray))
const paused = (x, y, s) => { const p = tray(x, y, s); return [0x8b, 0x91, 0x9c, p[3]] }
writeFileSync(resolve(out, 'tray-paused.png'), png(32, paused))
const traySizes = [16, 20, 24, 32, 48, 64]
writeFileSync(resolve(out, 'tray.ico'), ico(traySizes.map((n) => ({ size: n, data: png(n, tray) }))))
writeFileSync(resolve(out, 'tray-paused.ico'), ico(traySizes.map((n) => ({ size: n, data: png(n, paused) }))))
writeFileSync(resolve(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map((n) => ({ size: n, data: png(n, orb) }))))
console.log('icons written to', out)
