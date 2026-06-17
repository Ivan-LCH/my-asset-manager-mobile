// PWA 아이콘 생성 스크립트 (1회 실행용).
// public/icon.svg → 192/512/apple-touch-icon/favicon PNG.
// 사용: npm install sharp --no-save && node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const svg = readFileSync(path.join(root, 'public', 'icon.svg'))
const pub = (n) => path.join(root, 'public', n)

await sharp(svg).resize(192, 192).png().toFile(pub('icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(pub('icon-512.png'))
await sharp(svg).resize(180, 180).png().toFile(pub('apple-touch-icon.png'))
await sharp(svg).resize(32, 32).png().toFile(pub('favicon-32.png'))

console.log('icons generated: 192, 512, apple-touch-icon(180), favicon(32)')
