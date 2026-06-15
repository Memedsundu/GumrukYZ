/**
 * One-shot brand asset generator from logo/Mizan_logo.png.
 * Run: node scripts/generate-brand-assets.mjs
 */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import toIco from 'to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(webRoot, '../..')
const sourcePath = path.join(repoRoot, 'logo/Mizan_logo.png')

const brandDir = path.join(webRoot, 'public/brand')
const appDir = path.join(webRoot, 'src/app')

const LOCKUP_MAX_WIDTH = 640
const MARK_WIDTH_RATIO = 0.38

async function main() {
  await mkdir(brandDir, { recursive: true })

  const trimmedBuffer = await sharp(sourcePath).trim({ threshold: 10 }).png().toBuffer()
  const meta = await sharp(trimmedBuffer).metadata()
  const height = meta.height ?? 0
  const width = meta.width ?? 0

  const lockupPath = path.join(brandDir, 'mizan-logo.png')
  await sharp(trimmedBuffer)
    .resize({ width: LOCKUP_MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(lockupPath)

  const markSize = Math.min(height, Math.round(width * MARK_WIDTH_RATIO))
  const markPath = path.join(brandDir, 'mizan-mark.png')
  await sharp(trimmedBuffer)
    .extract({ left: 0, top: 0, width: markSize, height: markSize })
    .png({ compressionLevel: 9 })
    .toFile(markPath)

  const markBuffer = await sharp(markPath).png().toBuffer()

  const icon32 = await sharp(markBuffer).resize(32, 32, { fit: 'contain', background: '#ffffff' }).png().toBuffer()
  const icon180 = await sharp(markBuffer).resize(180, 180, { fit: 'contain', background: '#ffffff' }).png().toBuffer()
  const icon16 = await sharp(markBuffer).resize(16, 16, { fit: 'contain', background: '#ffffff' }).png().toBuffer()

  await writeFile(path.join(appDir, 'icon.png'), icon32)
  await writeFile(path.join(appDir, 'apple-icon.png'), icon180)

  const favicon = await toIco([icon16, icon32])
  await writeFile(path.join(appDir, 'favicon.ico'), favicon)

  console.log('Generated brand assets:')
  console.log(`  lockup: ${width}x${height} -> ${lockupPath}`)
  console.log(`  mark: ${markSize}x${markSize} -> ${markPath}`)
  console.log(`  ${path.join(appDir, 'icon.png')}`)
  console.log(`  ${path.join(appDir, 'apple-icon.png')}`)
  console.log(`  ${path.join(appDir, 'favicon.ico')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
