// Generate placeholder icons for Tauri using only built-in Node APIs
// Creates minimal valid PNG files at required sizes

const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons')
fs.mkdirSync(iconsDir, { recursive: true })

// Minimal valid 1x1 red PNG (base64 encoded)
// We'll generate proper sizes using pixel data
function createPNG(width, height, r, g, b) {
  const { createCanvas } = require('canvas')
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  
  // Orange gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height)
  grad.addColorStop(0, '#f97316')
  grad.addColorStop(1, '#ea580c')
  ctx.fillStyle = grad
  ctx.roundRect(0, 0, width, height, width * 0.18)
  ctx.fill()
  
  // White rupee symbol
  ctx.fillStyle = 'white'
  ctx.font = `bold ${Math.floor(width * 0.55)}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('₹', width / 2, height / 2 + height * 0.04)
  
  return canvas.toBuffer('image/png')
}

// Try canvas, fallback to minimal raw PNG
function tryCreateIcon(size, outPath) {
  try {
    const buf = createPNG(size, size)
    fs.writeFileSync(outPath, buf)
    console.log(`Created ${outPath}`)
  } catch (e) {
    // Fallback: write a minimal valid PNG header (white square)
    const raw = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e0000000c4944415408d76360f8cfc00000000200012177668a0000000049454e44ae426082',
      'hex'
    )
    fs.writeFileSync(outPath, raw)
    console.log(`Created placeholder ${outPath}`)
  }
}

// Required icon sizes for Tauri Windows bundle
const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
]

for (const { name, size } of sizes) {
  tryCreateIcon(size, path.join(iconsDir, name))
}

// icon.ico — copy 32x32 png as ico placeholder. Windows needs this.
// Real icon generation would use a proper .ico encoder.
// For Tauri dev mode this is fine.
const ico32 = path.join(iconsDir, '32x32.png')
fs.copyFileSync(ico32, path.join(iconsDir, 'icon.ico'))
fs.copyFileSync(ico32, path.join(iconsDir, 'icon.icns'))

console.log('Icons generated!')
