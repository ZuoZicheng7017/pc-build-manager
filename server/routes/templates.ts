import { z } from 'zod'
import { db, nowIso } from '../db'
import { HttpError, queryStr, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import { createOrder } from '../services/orders'
import type { BuildTemplate, TemplateItem } from '../../shared/types'

const templateItemSchema = z.object({
  part_id: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).max(99),
  unit_price_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(300).optional(),
})

const templateSchema = z.object({
  name: z.string().trim().min(1, '请填写配置名称').max(100),
  purpose: z.enum(['office', 'gaming', 'design', 'video', 'stream', 'home', 'other']).optional(),
  budget_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  level: z.enum(['entry', 'mainstream', 'high', 'flagship']).optional(),
  labor_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  notes: z.string().trim().max(3000).optional(),
  items: z.array(templateItemSchema).max(60).optional(),
})

type TemplateRow = Record<string, unknown> & {
  id: number
  name: string
  purpose: BuildTemplate['purpose']
  budget_cents: number
  level: BuildTemplate['level']
  labor_fee_cents: number
  notes: string
  created_at: string
  updated_at: string
}

function effectivePrice(item: TemplateItem): number {
  if (item.unit_price_cents > 0) return item.unit_price_cents
  return item.current_sale_cents ?? 0
}

function withItems(row: TemplateRow, items: TemplateItem[]): BuildTemplate {
  const total = items.reduce((s, i) => s + i.qty * effectivePrice(i), 0) + row.labor_fee_cents
  const cost = items.reduce((s, i) => s + i.qty * (i.current_cost_cents ?? 0), 0)
  return {
    ...(row as unknown as BuildTemplate),
    items,
    total_cents: total,
    cost_cents: cost,
    item_count: items.length,
  }
}

function loadItems(templateId: number): TemplateItem[] {
  return db.prepare(`
    SELECT ti.*, p.name AS part_name, p.spec AS part_spec, p.category AS part_category,
           p.sale_cents AS current_sale_cents, p.cost_cents AS current_cost_cents
    FROM template_items ti LEFT JOIN active_parts p ON p.id = ti.part_id
    WHERE ti.template_id = ? ORDER BY ti.id
  `).all(templateId) as unknown as TemplateItem[]
}

function listTemplates(ctx: Ctx): void {
  const q = queryStr(ctx.url, 'q')
  const purpose = queryStr(ctx.url, 'purpose')
  const where: string[] = ['1 = 1']
  const params: string[] = []
  if (q) {
    where.push('(name LIKE ? OR notes LIKE ?)')
    params.push(`%${q}%`, `%${q}%`)
  }
  if (purpose) {
    where.push('purpose = ?')
    params.push(purpose)
  }
  const rows = db.prepare(`SELECT * FROM templates WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC`).all(...params) as unknown as TemplateRow[]
  const result = rows.map((row) => withItems(row, loadItems(row.id)))
  sendJson(ctx.res, result)
}

function getTemplate(id: number): BuildTemplate {
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
  if (!row) throw new HttpError(404, '配置模板不存在')
  return withItems(row, loadItems(id))
}

function saveItems(templateId: number, items: { part_id: number; qty: number; unit_price_cents?: number; note?: string }[]): void {
  const check = db.prepare('SELECT id FROM active_parts WHERE id = ?')
  const ins = db.prepare('INSERT INTO template_items (template_id, part_id, qty, unit_price_cents, note) VALUES (?, ?, ?, ?, ?)')
  for (const [i, item] of items.entries()) {
    if (!check.get(item.part_id)) throw new HttpError(422, `第 ${i + 1} 行配件不存在`)
    ins.run(templateId, item.part_id, item.qty, item.unit_price_cents ?? 0, item.note ?? '')
  }
}

function createTemplate(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(templateSchema, await readJson(ctx.req))
    const now = nowIso()
    db.exec('BEGIN')
    try {
      const info = db.prepare(`
        INSERT INTO templates (name, purpose, budget_cents, level, labor_fee_cents, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(b.name, b.purpose ?? 'other', b.budget_cents ?? 0, b.level ?? 'mainstream', b.labor_fee_cents ?? 0, b.notes ?? '', now, now)
      const id = Number(info.lastInsertRowid)
      saveItems(id, b.items ?? [])
      db.exec('COMMIT')
      sendJson(ctx.res, getTemplate(id), 201)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })()
}

function updateTemplate(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getTemplate(id)
    const b = validate(templateSchema, await readJson(ctx.req))
    const now = nowIso()
    db.exec('BEGIN')
    try {
      db.prepare(`
        UPDATE templates SET name = ?, purpose = ?, budget_cents = ?, level = ?, labor_fee_cents = ?, notes = ?, updated_at = ? WHERE id = ?
      `).run(b.name, b.purpose ?? old.purpose, b.budget_cents ?? old.budget_cents, b.level ?? old.level,
        b.labor_fee_cents ?? old.labor_fee_cents, b.notes ?? old.notes, now, id)
      db.prepare('DELETE FROM template_items WHERE template_id = ?').run(id)
      saveItems(id, b.items ?? [])
      db.exec('COMMIT')
      sendJson(ctx.res, getTemplate(id))
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })()
}

function deleteTemplate(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getTemplate(id)
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  sendNoContent(ctx.res)
}

function createOrderFromTemplate(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const template = getTemplate(id)
    const b = validate(z.object({
      customer_id: z.coerce.number().int().positive(),
      staff_id: z.coerce.number().int().positive().nullable().optional(),
      appointment_at: z.string().max(40).optional(),
      address: z.string().max(500).optional(),
      contact_name: z.string().max(100).optional(),
      contact_phone: z.string().max(50).optional(),
      notes: z.string().max(2000).optional(),
    }), await readJson(ctx.req))
    const order = createOrder({
      customer_id: b.customer_id,
      staff_id: b.staff_id ?? null,
      template_id: id,
      service_type: 'new',
      status: 'pending',
      appointment_at: b.appointment_at,
      address: b.address,
      contact_name: b.contact_name,
      contact_phone: b.contact_phone,
      description: b.notes ?? template.notes,
      labor_fee_cents: template.labor_fee_cents,
      items: (template.items ?? []).map((i) => ({
        part_id: i.part_id,
        qty: i.qty,
        unit_price_cents: effectivePrice(i),
      })),
    })
    sendJson(ctx.res, order, 201)
  })()
}

export function registerTemplateRoutes(router: Router): void {
  router.get('/api/templates', listTemplates)
  router.get('/api/templates/:id', (ctx) => sendJson(ctx.res, getTemplate(Number(ctx.params.id))))
  router.post('/api/templates', createTemplate)
  router.put('/api/templates/:id', updateTemplate)
  router.delete('/api/templates/:id', deleteTemplate)
  router.post('/api/templates/:id/create-order', createOrderFromTemplate)
}
