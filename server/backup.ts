import { ZipArchive } from 'archiver'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, UPLOAD_DIR, db, getSettingsMap, nowIso, writeSetting } from './db'

export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DATA_DIR), 'backups')
const AUTO_DIR = path.join(BACKUP_DIR, 'auto')

export interface BackupResult {
  path: string
  name: string
  size: number
  created_at: string
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 备份 app.db + uploads，生成可直接恢复的 zip */
export async function createBackupZip(options: { dir?: string; prefix?: string } = {}): Promise<BackupResult> {
  const dir = options.dir ?? path.join(BACKUP_DIR, 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  const created = nowIso()
  const name = `${options.prefix ?? 'pc-build-backup'}-${stamp()}.zip`
  const target = path.join(dir, name)

  // 先把 WAL 落盘，避免 zip 里的 app.db 缺少最近写入
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* ignore */ }

  const counts = {
    customers: (db.prepare('SELECT COUNT(*) AS c FROM active_customers').get() as { c: number }).c,
    orders: (db.prepare('SELECT COUNT(*) AS c FROM active_orders').get() as { c: number }).c,
    parts: (db.prepare('SELECT COUNT(*) AS c FROM active_parts').get() as { c: number }).c,
    media: (db.prepare('SELECT COUNT(*) AS c FROM order_media').get() as { c: number }).c,
  }
  const manifest = {
    app: '装机管家',
    version: '1.2.0',
    created_at: created,
    counts,
    note: '恢复时停止服务，将 app.db 与 uploads/ 放回 data/ 目录',
  }

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(target)
    const archive = new ZipArchive({ zlib: { level: 9 } })
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
    archive.file(path.join(DATA_DIR, 'app.db'), { name: 'app.db' })
    if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, 'uploads')
    void archive.finalize()
  })

  return { path: target, name, size: fs.statSync(target).size, created_at: created }
}

export async function runAutoBackup(reason = '每日自动备份'): Promise<BackupResult | null> {
  const settings = getSettingsMap()
  if (settings.auto_backup_enabled === '0') return null
  fs.mkdirSync(AUTO_DIR, { recursive: true })
  const result = await createBackupZip({ dir: AUTO_DIR, prefix: 'auto-backup' })
  const retention = Math.max(1, Number(settings.auto_backup_retention || 7))
  const files = fs.readdirSync(AUTO_DIR)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => ({ f, time: fs.statSync(path.join(AUTO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
  for (const old of files.slice(retention)) {
    try { fs.unlinkSync(path.join(AUTO_DIR, old.f)) } catch { /* ignore */ }
  }
  writeSetting('last_auto_backup_at', result.created_at)
  console.log(`[backup] ${reason}：${result.name}（${Math.round(result.size / 1024)} KB）`)
  return result
}

async function backupIfDue(): Promise<void> {
  try {
    const settings = getSettingsMap()
    if (settings.auto_backup_enabled === '0') return
    const last = settings.last_auto_backup_at ? Date.parse(settings.last_auto_backup_at) : 0
    if (last && Date.now() - last < 24 * 60 * 60 * 1000) return
    await runAutoBackup('每日自动备份')
  } catch (err) {
    console.error('[backup] 自动备份失败', err)
  }
}

export function startAutoBackupLoop(): void {
  // 启动后稍等，避免和建库/迁移抢磁盘；之后每 6 小时检查一次是否满 24 小时
  setTimeout(() => { void backupIfDue() }, 30_000).unref()
  setInterval(() => { void backupIfDue() }, 6 * 60 * 60 * 1000).unref()
}
