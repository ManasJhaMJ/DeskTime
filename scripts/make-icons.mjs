// Builds every icon the app ships from resources/logo.png, without any image library:
//   icon.png / icon.ico          window, installer, notifications (logo as drawn, white background keyed out)
//   tray*.png / tray*.ico        white silhouette of the logo so it stays visible on a dark taskbar; gray when paused
// Runs on postinstall and via `npm run icons`.
import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ---- PNG encode ------------------------------------------------------------------------------
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
/** rgba: Uint8Array of size*size*4 */
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => { raw[y * (size * 4 + 1) + 1 + i] = v })
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- PNG decode (8-bit, non-interlaced; gray, gray+alpha, RGB, RGBA and palette) ---------------
function decodePng(buf) {
  let pos = 8
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0
  let palette = null, trns = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`logo.png must be 8-bit non-interlaced (got depth ${bitDepth}, interlace ${interlace})`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = new Uint8Array(raw.subarray(p, p + stride)); p += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const s = x * channels
      if (colorType === 3) {
        const idx = line[s]
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2]
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255
      } else if (colorType === 6) { out.set(line.subarray(s, s + 4), o) }
      else if (colorType === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255 }
      else if (colorType === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1] }
      else { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255 }
    }
    prev = line
  }
  return { width, height, data: out }
}

/**
 * A logo exported on a white background has no alpha. Treat white as transparent and paint every remaining pixel in
 * the logo's ink color, with alpha from how far the pixel is from white, so anti-aliased edges stay smooth.
 */
function keyOutWhite(img) {
  const { data } = img
  let hasAlpha = false
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { hasAlpha = true; break }
  if (hasAlpha) return img
  let ink = [0, 0, 0], darkest = 1e9
  for (let i = 0; i < data.length; i += 4) {
    const sum = data[i] + data[i + 1] + data[i + 2]
    if (sum < darkest) { darkest = sum; ink = [data[i], data[i + 1], data[i + 2]] }
  }
  const inkMax = Math.max(...ink)
  for (let i = 0; i < data.length; i += 4) {
    const px = Math.max(data[i], data[i + 1], data[i + 2])
    // 255 (white) -> 0, ink -> 1, linear in between
    const a = Math.max(0, Math.min(1, (255 - px) / Math.max(1, 255 - inkMax)))
    data[i] = ink[0]; data[i + 1] = ink[1]; data[i + 2] = ink[2]; data[i + 3] = Math.round(a * 255)
  }
  return img
}

/** Area-averaging downsample to a square of `size`; the source is fitted (contain) and centered. */
function resample(img, size) {
  const { width, height, data } = img
  const scale = Math.max(width, height) / size
  const offX = (size - width / scale) / 2, offY = (size - height / scale) / 2
  const out = new Uint8Array(size * size * 4)
  const k = Math.max(1, Math.ceil(scale))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = 0; sy < k; sy++) {
        for (let sx = 0; sx < k; sx++) {
          const srcX = Math.floor((x - offX + (sx + 0.5) / k) * scale)
          const srcY = Math.floor((y - offY + (sy + 0.5) / k) * scale)
          n++
          if (srcX < 0 || srcY < 0 || srcX >= width || srcY >= height) continue
          const o = (srcY * width + srcX) * 4
          const al = data[o + 3] / 255
          r += data[o] * al; g += data[o + 1] * al; b += data[o + 2] * al; a += al
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a) }
      out[o + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

/** Same shape, flat color: tray icons are silhouettes. */
function tint(rgba, [r, g, b]) {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = rgba[i + 3] }
  return out
}

// ICO container holding PNG-compressed frames (supported since Vista). Windows picks the size it needs,
// so icons stay crisp at 100%, 125% and 150% scaling.
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
const logo = keyOutWhite(decodePng(readFileSync(resolve(out, 'logo.png'))))
const app = (n) => png(n, resample(logo, n))
const tray = (n) => png(n, tint(resample(logo, n), [255, 255, 255]))
const paused = (n) => png(n, tint(resample(logo, n), [0x8b, 0x91, 0x9c]))

writeFileSync(resolve(out, 'icon.png'), app(256))
writeFileSync(resolve(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map((n) => ({ size: n, data: app(n) }))))
writeFileSync(resolve(out, 'tray.png'), tray(32))
writeFileSync(resolve(out, 'tray@2x.png'), tray(64))
writeFileSync(resolve(out, 'tray-paused.png'), paused(32))
const traySizes = [16, 20, 24, 32, 48, 64]
writeFileSync(resolve(out, 'tray.ico'), ico(traySizes.map((n) => ({ size: n, data: tray(n) }))))
writeFileSync(resolve(out, 'tray-paused.ico'), ico(traySizes.map((n) => ({ size: n, data: paused(n) }))))
console.log(`icons written to ${out} from logo.png (${logo.width}x${logo.height})`)
