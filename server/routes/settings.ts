import fs from 'node:fs'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { z } from 'zod'
import { DATA_DIR, UPLOAD_DIR, db, getSettingsMap, nowIso, writeSetting } from '../db'
import { readJson, sendJson, validate, type Ctx, type Router } from '../http'
import { BACKUP_DIR, createBackupZip, runAutoBackup } from '../backup'
import type { Settings } from '../../shared/types'

const settingsSchema = z.object({
  shop_name: z.string().trim().max(100).optional(),
  shop_phone: z.string().trim().max(40).optional(),
  shop_address: z.string().trim().max(200).optional(),
  default_travel_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  default_warranty_months: z.coerce.number().int().min(0).max(240).optional(),
  default_labor_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  auto_backup_enabled: z.boolean().optional(),
  auto_backup_retention: z.coerce.number().int().min(1).max(60).optional(),
  ui_mode: z.enum(['full', 'service']).optional(),
})

function currentSettings(): Settings {
  const m = getSettingsMap()
  return {
    shop_name: m.shop_name,
    shop_phone: m.shop_phone,
    shop_address: m.shop_address,
    default_travel_fee_cents: Number(m.default_travel_fee_cents),
    default_warranty_months: Number(m.default_warranty_months),
    default_labor_fee_cents: Number(m.default_labor_fee_cents),
    auto_backup_enabled: m.auto_backup_enabled !== '0',
    auto_backup_retention: Number(m.auto_backup_retention || 7),
    last_auto_backup_at: m.last_auto_backup_at || '',
    ui_mode: m.ui_mode === 'service' ? 'service' : 'full',
  }
}

function getSettings(ctx: Ctx): void {
  sendJson(ctx.res, currentSettings())
}

function updateSettings(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(settingsSchema, await readJson(ctx.req))
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue
      if (typeof v === 'boolean') writeSetting(k, v ? '1' : '0')
      else writeSetting(k, String(v))
    }
    sendJson(ctx.res, currentSettings())
  })()
}

function exportData(ctx: Ctx): void {
  const tables = ['staff', 'customers', 'parts', 'part_prices', 'templates', 'template_items', 'service_items', 'orders', 'order_items', 'order_services', 'order_payments', 'order_media', 'order_logs', 'settings']
  const data: Record<string, unknown> = {
    app: '装机管家',
    version: 1,
    exported_at: nowIso(),
  }
  for (const table of tables) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all()
  }
  ctx.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="pc-build-export-${nowIso().slice(0, 10)}.json"`,
    'Cache-Control': 'no-store',
  })
  ctx.res.end(JSON.stringify(data, null, 2))
}

async function backupDatabase(ctx: Ctx): Promise<void> {
  const result = await createBackupZip()
  ctx.res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': result.size,
    'Content-Disposition': `attachment; filename="${result.name}"`,
    'Cache-Control': 'no-store',
  })
  const stream = createReadStream(result.path)
  stream.pipe(ctx.res)
  stream.on('close', () => {
    try { fs.unlinkSync(result.path) } catch { /* ignore */ }
  })
}

async function backupNow(ctx: Ctx): Promise<void> {
  const result = await runAutoBackup('手动备份')
  if (!result) {
    // 自动备份关闭时，手动备份仍然执行
    fs.mkdirSync(path.join(BACKUP_DIR, 'auto'), { recursive: true })
    const manual = await createBackupZip({ dir: path.join(BACKUP_DIR, 'auto'), prefix: 'manual-backup' })
    writeSetting('last_auto_backup_at', manual.created_at)
    sendJson(ctx.res, manual)
    return
  }
  sendJson(ctx.res, result)
}

function dirSize(dir: string): number {
  let total = 0
  try {
    for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        try { total += fs.statSync(path.join(entry.parentPath, entry.name)).size } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return total
}

function systemInfo(ctx: Ctx): void {
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c
  sendJson(ctx.res, {
    version: '1.2.0',
    node: process.version,
    platform: process.platform,
    data_dir: DATA_DIR,
    backup_dir: BACKUP_DIR,
    last_auto_backup_at: getSettingsMap().last_auto_backup_at || '',
    db_size: fs.existsSync(path.join(DATA_DIR, 'app.db'))
      ? fs.statSync(path.join(DATA_DIR, 'app.db')).size + (fs.existsSync(path.join(DATA_DIR, 'app.db-wal')) ? fs.statSync(path.join(DATA_DIR, 'app.db-wal')).size : 0)
      : 0,
    uploads_size: dirSize(UPLOAD_DIR),
    counts: {
      customers: count('SELECT COUNT(*) AS c FROM active_customers'),
      orders: count('SELECT COUNT(*) AS c FROM active_orders'),
      parts: count('SELECT COUNT(*) AS c FROM active_parts'),
      staff: count('SELECT COUNT(*) AS c FROM staff'),
      templates: count('SELECT COUNT(*) AS c FROM templates'),
      services: count('SELECT COUNT(*) AS c FROM service_items'),
      media: count('SELECT COUNT(*) AS c FROM order_media'),
    },
    started_at: nowIso(),
  })
}

export function registerSettingsRoutes(router: Router): void {
  router.get('/api/settings', getSettings)
  router.put('/api/settings', updateSettings)
  router.get('/api/export', exportData)
  router.get('/api/backup', backupDatabase)
  router.post('/api/backup/run', backupNow)
  router.get('/api/system/info', systemInfo)
}
