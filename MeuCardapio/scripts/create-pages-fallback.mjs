import { copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')
const indexPath = join(distDir, 'index.html')
const fallbackPath = join(distDir, '404.html')

await stat(indexPath)
await copyFile(indexPath, fallbackPath)

