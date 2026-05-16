/**
 * Post-build script: remove symlinked directory entries from .nft.json trace files.
 *
 * pnpm v9+ stores every package in a virtual store (.pnpm/) and exposes them via
 * symlinks. Next.js's file tracer includes these directory symlinks in .nft.json,
 * and Vercel's Lambda packager rejects any deployment package containing symlinked
 * directories.
 *
 * The symlinked directory entries are always REDUNDANT — the tracer already includes
 * the real files via their direct .pnpm/ paths. Removing the symlink entries fixes
 * the Vercel deploy without losing any required files.
 */

import { readFileSync, writeFileSync, lstatSync, readdirSync, realpathSync, existsSync } from 'fs'
import { resolve, relative, dirname, join } from 'path'

function findNftFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      findNftFiles(full, results)
    } else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
      results.push(full)
    }
  }
  return results
}

const serverDir = resolve('.next/server')
const nftFiles = findNftFiles(serverDir)

let totalFixed = 0

for (const nftPath of nftFiles) {
  const nftDir = dirname(nftPath)
  const data = JSON.parse(readFileSync(nftPath, 'utf8'))

  const originalCount = data.files.length
  const cleaned = []

  for (const f of data.files) {
    const fullPath = resolve(nftDir, f)

    let isSymlink = false
    try {
      const stat = lstatSync(fullPath)
      isSymlink = stat.isSymbolicLink()
    } catch {
      // File doesn't exist locally — keep as-is (may exist on build server)
    }

    if (isSymlink) {
      try {
        const realPath = realpathSync(fullPath)
        if (existsSync(realPath)) {
          const realStat = lstatSync(realPath)
          if (!realStat.isDirectory()) {
            // File symlink: replace with real path
            cleaned.push(relative(nftDir, realPath))
          }
          // Directory symlinks: omit — individual real files are separately traced.
          continue
        }
      } catch {
        // Fall through: keep original entry if resolution fails
      }
    }

    cleaned.push(f)
  }

  const deduped = [...new Set(cleaned)]

  if (deduped.length !== originalCount) {
    data.files = deduped
    writeFileSync(nftPath, JSON.stringify(data))
    const removed = originalCount - deduped.length
    console.log(`  Fixed ${nftPath.replace(process.cwd(), '.')} (removed ${removed} symlink entries)`)
    totalFixed++
  }
}

console.log(`\nfix-nft-symlinks: processed ${nftFiles.length} files, fixed ${totalFixed}.`)
