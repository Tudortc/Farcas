#!/usr/bin/env node
/**
 * Generates a 512x512 icon.png for bool desktop using pure Node.js (no external deps).
 *
 * On-brand phosphor-green glyph ("b") on a near-black background.
 * electron-builder derives icns/ico from a >=512 png automatically.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const W = 512
const H = 512

// Near-black background (matches #0f0f10 from index.html)
const BG = [0x0f, 0x0f, 0x10, 0xff]
// Phosphor green glyph (#39FF14)
const FG = [0x39, 0xff, 0x14, 0xff]
// Transparent
const TR = [0x00, 0x00, 0x00, 0x00]

function pixel(x, y) {
  // Rounded square background with 64px corner radius
  const r = 64
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
    return TR // transparent corner
  }

  // Draw a "b" glyph scaled to 512x512
  // Vertical bar: x in [155,210], y in [96,420]
  const inVBar = x >= 155 && x <= 210 && y >= 96 && y <= 420

  // Bump (right side of "b"): center at (210, 300), radius 105
  const bumpCx = 210, bumpCy = 300, bumpR = 105
  const inBump = (
    x >= bumpCx &&
    y >= bumpCy - bumpR && y <= bumpCy + bumpR &&
    Math.hypot(x - bumpCx, y - bumpCy) <= bumpR
  )

  return (inVBar || inBump) ? FG : BG
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

const outPath = path.join(__dirname, 'icon.png')
fs.writeFileSync(outPath, png)
console.log('Written:', outPath, `(${png.length} bytes)`)
