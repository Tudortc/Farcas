/**
 * Generates bool PWA icons as valid PNGs using pure Node.js (no native deps).
 * Method: raw PNG construction using zlib deflate for image data.
 *
 * Colors: background #0a0c0d (near-black), glyph #39e08b (phosphor green)
 * Draws a rounded "b" glyph as a simple pixel-art pattern at each size.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')

// Colors
const BG = [0x0a, 0x0c, 0x0d]   // #0a0c0d
const FG = [0x39, 0xe0, 0x8b]   // #39e08b

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([typeBytes, data])
  const crc = Buffer.allocUnsafe(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function makePNG(size) {
  // IHDR
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)   // width
  ihdr.writeUInt32BE(size, 4)   // height
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: RGB
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  // Build pixel data: draw a stylised "b" letter
  // We'll draw using relative coordinates on an NxN grid
  const rows = []
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38  // glyph bounding radius

  // Precompute which pixels are "on" (part of the glyph)
  // The "b" is: vertical bar on left + bump on right side of lower half
  const glyphPixels = new Uint8Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / r  // -1..1 normalised coords
      const ny = (y - cy) / r

      // Vertical stem: left third, full height, rounded ends
      const stemX = nx + 0.45  // offset so stem is on the left
      const stemThick = 0.18
      if (Math.abs(stemX) < stemThick && Math.abs(ny) < 0.85) {
        // Slightly round the top end
        const topRound = ny < -0.70 ? Math.hypot(stemX, ny + 0.70) < stemThick : true
        if (topRound) glyphPixels[y * size + x] = 1
      }

      // Bowl: circle on right side, lower half
      const bx = nx - 0.22  // center of bowl
      const by = ny + 0.20  // slightly below center
      const bowlR = 0.48
      const bowlInner = 0.26
      const dist = Math.hypot(bx, by)
      if (dist < bowlR && dist > bowlInner) {
        glyphPixels[y * size + x] = 1
      }
    }
  }

  for (let y = 0; y < size; y++) {
    // PNG filter byte 0 = None
    const row = Buffer.allocUnsafe(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const color = glyphPixels[y * size + x] ? FG : BG
      row[1 + x * 3] = color[0]
      row[1 + x * 3 + 1] = color[1]
      row[1 + x * 3 + 2] = color[2]
    }
    rows.push(row)
  }

  const raw = Buffer.concat(rows)
  const compressed = deflateSync(raw)

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Generate icon-192.png
writeFileSync(join(publicDir, 'icon-192.png'), makePNG(192))
console.log('Generated icon-192.png')

// Generate icon-512.png
writeFileSync(join(publicDir, 'icon-512.png'), makePNG(512))
console.log('Generated icon-512.png')

// Generate icon-maskable-512.png (same design but with safe zone padding for maskable)
// Maskable icons should have the key content within the central 80% (safe area)
function makeMaskablePNG(size) {
  const rows = []
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.30  // smaller radius = more padding for safe zone

  const glyphPixels = new Uint8Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / r
      const ny = (y - cy) / r

      const stemX = nx + 0.45
      const stemThick = 0.18
      if (Math.abs(stemX) < stemThick && Math.abs(ny) < 0.85) {
        const topRound = ny < -0.70 ? Math.hypot(stemX, ny + 0.70) < stemThick : true
        if (topRound) glyphPixels[y * size + x] = 1
      }

      const bx = nx - 0.22
      const by = ny + 0.20
      const bowlR = 0.48
      const bowlInner = 0.26
      const dist = Math.hypot(bx, by)
      if (dist < bowlR && dist > bowlInner) {
        glyphPixels[y * size + x] = 1
      }
    }
  }

  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const color = glyphPixels[y * size + x] ? FG : BG
      row[1 + x * 3] = color[0]
      row[1 + x * 3 + 1] = color[1]
      row[1 + x * 3 + 2] = color[2]
    }
    rows.push(row)
  }

  const raw = Buffer.concat(rows)
  const compressed = deflateSync(raw)

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(publicDir, 'icon-maskable-512.png'), makeMaskablePNG(512))
console.log('Generated icon-maskable-512.png')

console.log('All icons generated successfully.')
