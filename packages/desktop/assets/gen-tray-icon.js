#!/usr/bin/env node
/**
 * Generates a minimal valid tray.png using pure Node.js (no external deps).
 *
 * Creates a 32x32 PNG with a phosphor-green rounded-square background and
 * a simple "b" glyph approximation drawn in a darker green.
 *
 * PNG structure:
 *  - Signature
 *  - IHDR chunk (32x32, 8-bit RGBA)
 *  - IDAT chunk (deflated scanlines)
 *  - IEND chunk
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const W = 32
const H = 32

// Phosphor green palette
const BG = [0x39, 0xff, 0x14, 0xff]   // #39FF14 — neon green background
const FG = [0x00, 0x7a, 0x00, 0xff]   // dark green glyph

function pixel(x, y) {
  // Rounded square mask (4px radius)
  const r = 4
  const inCorner = (cx, cy) => {
    const dx = Math.abs(x - cx)
    const dy = Math.abs(y - cy)
    return dx > r && dy > r && Math.hypot(dx - r, dy - r) > r
  }
  if (
    inCorner(r, r) ||
    inCorner(W - 1 - r, r) ||
    inCorner(r, H - 1 - r) ||
    inCorner(W - 1 - r, H - 1 - r)
  ) {
    return [0, 0, 0, 0] // transparent corner
  }

  // Draw a simple "b" — vertical bar + bump
  // Vertical bar: x in [10,13], y in [6,25]
  const inVBar = x >= 10 && x <= 13 && y >= 6 && y <= 25
  // Bump (half-circle right of bar): center at (13, 18), radius 5, right half only
  const bumpCx = 13, bumpCy = 18, bumpR = 6
  const inBump = (
    x >= bumpCx && x <= bumpCx + bumpR + 2 &&
    y >= bumpCy - bumpR && y <= bumpCy + bumpR &&
    Math.hypot(x - bumpCx, y - bumpCy) <= bumpR
  )

  return inVBar || inBump ? FG : BG
}

// Build raw RGBA image data
const raw = Buffer.alloc((W * 4 + 1) * H)
let offset = 0
for (let y = 0; y < H; y++) {
  raw[offset++] = 0 // filter type: None
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = pixel(x, y)
    raw[offset++] = r
    raw[offset++] = g
    raw[offset++] = b
    raw[offset++] = a
  }
}

const idat = zlib.deflateSync(raw, { level: 9 })

function uint32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBytes, data])
  return Buffer.concat([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(crcInput)),
  ])
}

// IHDR: width, height, bit depth, color type (6=RGBA), compression, filter, interlace
const ihdr = Buffer.concat([
  uint32(W),
  uint32(H),
  Buffer.from([8, 6, 0, 0, 0]),
])

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, 'tray.png')
fs.writeFileSync(outPath, png)
console.log('Written:', outPath, `(${png.length} bytes)`)
