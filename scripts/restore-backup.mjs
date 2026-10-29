import AdmZip from 'adm-zip'
import fs from 'node:fs'
import path from 'node:path'

const zipPath = process.argv[2]
const yes = process.argv.includes('--yes')
if (!zipPath) {
  console.error('用法：node scripts/restore-backup.mjs <备份.zip> [--yes]')
  process.exit(1)
}
const file = path.resolve(zipPath)
if (!fs.existsSync(file)) {
  console.error(`备份文件不存在：${file}`)
  process.exit(1)
}

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data')
const port = process.env.PORT || '8787'
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
  if (res.ok) {
    console.error(`服务正在运行（端口 ${port}），请先停止服务再恢复，避免覆盖正在写入的数据库。`)
    process.exit(1)
  }
} catch {
  // 服务未运行，可以继续
}

const zip = new AdmZip(file)
const entries = zip.getEntries()
const names = entries.map((e) => e.entryName.replace(/\\/g, '/'))
const hasDb = names.includes('app.db')
if (!hasDb) {
  console.error('不是有效的装机管家备份：缺少 app.db')
  process.exit(1)
}
const bad = names.find((name) => name.startsWith('/') || name.includes('../') || !(name === 'app.db' || name === 'manifest.json' || name.startsWith('uploads/')))
if (bad) {
  console.error(`备份包含不允许的路径：${bad}`)
  process.exit(1)
}

const manifest = entries.find((e) => e.entryName === 'manifest.json')
if (manifest) {
  try { console.log('备份信息：', JSON.parse(manifest.getData().toString('utf8'))) } catch { /* ignore */ }
}
console.log(`将恢复到：${dataDir}`)
if (!yes) {
  console.log('当前为预演模式。确认后加 --yes 执行，例如：')
  console.log(`  node scripts/restore-backup.mjs "${file}" --yes`)
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
fs.mkdirSync(path.join(process.cwd(), 'backups'), { recursive: true })
if (fs.existsSync(dataDir)) {
  const safe = path.join(process.cwd(), 'backups', `pre-restore-${stamp}`)
  fs.cpSync(dataDir, safe, { recursive: true })
  console.log(`当前数据已备份到：${safe}`)
  fs.rmSync(dataDir, { recursive: true, force: true })
}
fs.mkdirSync(dataDir, { recursive: true })
zip.extractAllTo(dataDir, true)
console.log('恢复完成，请重新启动服务：pnpm start')
