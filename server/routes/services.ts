import { z } from 'zod'
import { db, nowIso } from '../db'
import { HttpError, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import { DEFAULT_SERVICE_ITEMS, type ServiceItem } from '../../shared/types'

const schema = z.object({
  name: z.string().trim().min(1, '请填写服务名称').max(80),
  category: z.string().trim().max(20).optional(),
  price_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  duration_minutes: z.coerce.number().int().min(0).max(1440).optional(),
  description: z.string().trim().max(500).optional(),
  active: z.enum(['active', 'inactive']).optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
})

type Row = Omit<ServiceItem, 'active'> & { active: number }

function toItem(row: Row): ServiceItem {
  return { ...row, active: row.active ? 'active' : 'inactive' }
}

function getItem(id: number): ServiceItem {
  const row = db.prepare('SELECT * FROM service_items WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new HttpError(404, '服务项目不存在')
  return toItem(row)
}

function list(ctx: Ctx): void {
  const active = ctx.url.searchParams.get('active')
  const where = active === '1' ? 'WHERE active = 1' : active === '0' ? 'WHERE active = 0' : ''
  const rows = db.prepare(`SELECT * FROM service_items ${where} ORDER BY sort_order, id`).all() as Row[]
  sendJson(ctx.res, rows.map(toItem))
}

function create(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(schema, await readJson(ctx.req))
    const now = nowIso()
    const maxSort = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM service_items').get() as { m: number }).m
    const info = db.prepare(`
      INSERT INTO service_items (name, category, price_cents, duration_minutes, description, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.name, b.category ?? '装机', b.price_cents ?? 0, b.duration_minutes ?? 0, b.description ?? '', b.active === 'inactive' ? 0 : 1, b.sort_order ?? maxSort + 10, now, now)
    sendJson(ctx.res, getItem(Number(info.lastInsertRowid)), 201)
  })()
}

function update(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getItem(id)
    const b = validate(schema, await readJson(ctx.req))
    const now = nowIso()
    db.prepare(`
      UPDATE service_items SET name = ?, category = ?, price_cents = ?, duration_minutes = ?, description = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      b.name, b.category ?? old.category, b.price_cents ?? old.price_cents,
      b.duration_minutes ?? old.duration_minutes, b.description ?? old.description,
      (b.active ?? old.active) === 'inactive' ? 0 : 1, b.sort_order ?? old.sort_order, now, id,
    )
    sendJson(ctx.res, getItem(id))
  })()
}

function remove(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getItem(id)
  db.prepare('DELETE FROM service_items WHERE id = ?').run(id)
  sendNoContent(ctx.res)
}

function initDefaults(ctx: Ctx): void {
  const now = nowIso()
  const find = db.prepare('SELECT id FROM service_items WHERE name = ?')
  const insert = db.prepare(`
    INSERT INTO service_items (name, category, price_cents, duration_minutes, description, active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `)
  let added = 0
  for (const [index, item] of DEFAULT_SERVICE_ITEMS.entries()) {
    if (find.get(item.name)) continue
    insert.run(item.name, item.category, item.price_cents, item.duration_minutes, item.description, (index + 1) * 10, now, now)
    added += 1
  }
  sendJson(ctx.res, { added })
}

export function registerServiceRoutes(router: Router): void {
  router.get('/api/service-items', list)
  router.post('/api/service-items', create)
  router.post('/api/service-items/defaults', initDefaults)
  router.put('/api/service-items/:id', update)
  router.delete('/api/service-items/:id', remove)
}
