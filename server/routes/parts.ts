import { z } from 'zod'
import { db, nowIso } from '../db'
import { HttpError, queryStr, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import type { Part, PartPrice, StockMovement } from '../../shared/types'

const partSchema = z.object({
  name: z.string().trim().min(1, '请填写配件名称').max(160),
  category: z.string().trim().max(30).optional(),
  brand: z.string().trim().max(60).optional(),
  model: z.string().trim().max(120).optional(),
  spec: z.string().trim().max(300).optional(),
  unit: z.string().trim().max(10).optional(),
  cost_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  sale_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  stock: z.coerce.number().int().min(0).max(100000).optional(),
  min_stock: z.coerce.number().int().min(0).max(100000).optional(),
  supplier: z.string().trim().max(120).optional(),
  warranty_months: z.coerce.number().int().min(0).max(240).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().trim().max(2000).optional(),
  price_note: z.string().trim().max(200).optional(),
})

const stockSchema = z.object({
  kind: z.enum(['in', 'out', 'set']),
  qty: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(200).optional(),
})

const priceSchema = z.object({
  cost_cents: z.coerce.number().int().min(0).max(100_000_000),
  sale_cents: z.coerce.number().int().min(0).max(100_000_000),
  supplier: z.string().trim().max(120).optional(),
  note: z.string().trim().max(200).optional(),
})

function listParts(ctx: Ctx): void {
  const { url, res } = ctx
  const q = queryStr(url, 'q')
  const category = queryStr(url, 'category')
  const lowStock = queryStr(url, 'lowStock') === '1'
  const status = queryStr(url, 'status')
  const where: string[] = ['1 = 1']
  const params: (string | number)[] = []
  if (q) {
    where.push('(name LIKE ? OR brand LIKE ? OR model LIKE ? OR spec LIKE ? OR supplier LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  if (category && category !== '全部') {
    where.push('category = ?')
    params.push(category)
  }
  if (lowStock) where.push('stock <= min_stock')
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const rows = db.prepare(`
    SELECT * FROM active_parts WHERE ${where.join(' AND ')}
    ORDER BY CASE category
      WHEN 'CPU' THEN 1 WHEN '主板' THEN 2 WHEN '内存' THEN 3 WHEN '硬盘' THEN 4
      WHEN '显卡' THEN 5 WHEN '电源' THEN 6 WHEN '散热' THEN 7 WHEN '机箱' THEN 8
      WHEN '显示器' THEN 9 WHEN '外设' THEN 10 ELSE 11 END, name
  `).all(...params)
  sendJson(res, rows)
}

function getPart(id: number): Part {
  const row = db.prepare('SELECT * FROM active_parts WHERE id = ?').get(id) as Part | undefined
  if (!row) throw new HttpError(404, '配件不存在')
  return row
}

function recordPrice(partId: number, cost: number, sale: number, supplier: string, note: string, at = nowIso()): void {
  db.prepare(`
    INSERT INTO part_prices (part_id, cost_cents, sale_cents, supplier, note, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(partId, cost, sale, supplier, note, at)
}

function createPart(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(partSchema, await readJson(ctx.req))
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO parts (name, category, brand, model, spec, unit, cost_cents, sale_cents, stock, min_stock, supplier, warranty_months, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name, b.category ?? '其他', b.brand ?? '', b.model ?? '', b.spec ?? '', b.unit ?? '个',
      b.cost_cents ?? 0, b.sale_cents ?? 0, b.stock ?? 0, b.min_stock ?? 0,
      b.supplier ?? '', b.warranty_months ?? 36, b.status ?? 'active', b.notes ?? '', now, now,
    )
    const id = Number(info.lastInsertRowid)
    recordPrice(id, b.cost_cents ?? 0, b.sale_cents ?? 0, b.supplier ?? '', '新建配件', now)
    sendJson(ctx.res, getPart(id), 201)
  })()
}

function updatePart(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getPart(id)
    const b = validate(partSchema, await readJson(ctx.req))
    const now = nowIso()
    const next = {
      name: b.name,
      category: b.category ?? old.category,
      brand: b.brand ?? old.brand,
      model: b.model ?? old.model,
      spec: b.spec ?? old.spec,
      unit: b.unit ?? old.unit,
      cost_cents: b.cost_cents ?? old.cost_cents,
      sale_cents: b.sale_cents ?? old.sale_cents,
      stock: b.stock ?? old.stock,
      min_stock: b.min_stock ?? old.min_stock,
      supplier: b.supplier ?? old.supplier,
      warranty_months: b.warranty_months ?? old.warranty_months,
      status: b.status ?? old.status,
      notes: b.notes ?? old.notes,
    }
    db.prepare(`
      UPDATE parts SET name = ?, category = ?, brand = ?, model = ?, spec = ?, unit = ?,
        cost_cents = ?, sale_cents = ?, stock = ?, min_stock = ?, supplier = ?,
        warranty_months = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(
      next.name, next.category, next.brand, next.model, next.spec, next.unit,
      next.cost_cents, next.sale_cents, next.stock, next.min_stock, next.supplier,
      next.warranty_months, next.status, next.notes, now, id,
    )
    if (next.cost_cents !== old.cost_cents || next.sale_cents !== old.sale_cents) {
      recordPrice(id, next.cost_cents, next.sale_cents, next.supplier, b.price_note ?? '编辑配件时调价', now)
    }
    if (next.stock !== old.stock) {
      db.prepare(`
        INSERT INTO stock_movements (part_id, order_id, kind, qty, note, created_at)
        VALUES (?, NULL, 'adjust', ?, ?, ?)
      `).run(id, next.stock - old.stock, b.price_note ?? '编辑配件调整库存', now)
    }
    sendJson(ctx.res, getPart(id))
  })()
}

function updatePrice(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getPart(id)
    const b = validate(priceSchema, await readJson(ctx.req))
    const now = nowIso()
    db.prepare('UPDATE parts SET cost_cents = ?, sale_cents = ?, supplier = ?, updated_at = ? WHERE id = ?')
      .run(b.cost_cents, b.sale_cents, b.supplier ?? old.supplier, now, id)
    recordPrice(id, b.cost_cents, b.sale_cents, b.supplier ?? old.supplier, b.note ?? '手动调价', now)
    sendJson(ctx.res, getPart(id))
  })()
}

function listPrices(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getPart(id)
  const rows = db.prepare('SELECT * FROM part_prices WHERE part_id = ? ORDER BY recorded_at DESC, id DESC').all(id) as unknown as PartPrice[]
  sendJson(ctx.res, rows)
}

function changeStock(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const part = getPart(id)
    const b = validate(stockSchema, await readJson(ctx.req))
    let delta = 0
    if (b.kind === 'in') delta = b.qty
    else if (b.kind === 'out') delta = -b.qty
    else delta = b.qty - part.stock
    if (part.stock + delta < 0) throw new HttpError(422, '出库数量不能大于当前库存')
    const now = nowIso()
    db.prepare('UPDATE parts SET stock = stock + ?, updated_at = ? WHERE id = ?').run(delta, now, id)
    db.prepare(`
      INSERT INTO stock_movements (part_id, order_id, kind, qty, note, created_at)
      VALUES (?, NULL, ?, ?, ?, ?)
    `).run(id, b.kind === 'set' ? 'adjust' : b.kind, delta, b.note || (b.kind === 'in' ? '手动入库' : b.kind === 'out' ? '手动出库' : '盘点调整'), now)
    sendJson(ctx.res, getPart(id))
  })()
}

function listMovements(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getPart(id)
  const rows = db.prepare(`
    SELECT m.*, o.order_no FROM stock_movements m
    LEFT JOIN orders o ON o.id = m.order_id
    WHERE m.part_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 200
  `).all(id) as unknown as StockMovement[]
  sendJson(ctx.res, rows)
}

function deletePart(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getPart(id)
  if (queryStr(ctx.url, 'hard') === '1') {
    const used = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE part_id = ?').get(id) as { c: number }
    if (used.c > 0) throw new HttpError(409, `该配件已被 ${used.c} 条工单明细引用，无法彻底删除；可先恢复或彻底删除相关工单`)
    db.prepare('DELETE FROM parts WHERE id = ?').run(id)
  } else {
    db.prepare('UPDATE parts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id)
  }
  sendNoContent(ctx.res)
}

function restorePart(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const row = db.prepare("SELECT id FROM parts WHERE id = ? AND deleted_at <> ''").get(id)
  if (!row) throw new HttpError(404, '回收站里没有这个配件')
  db.prepare("UPDATE parts SET deleted_at = '', updated_at = ? WHERE id = ?").run(nowIso(), id)
  sendJson(ctx.res, getPart(id))
}

function purgePart(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const row = db.prepare("SELECT id FROM parts WHERE id = ? AND deleted_at <> ''").get(id)
  if (!row) throw new HttpError(404, '回收站里没有这个配件')
  const used = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE part_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new HttpError(409, '该配件仍被工单引用，无法彻底删除')
  db.prepare('DELETE FROM parts WHERE id = ?').run(id)
  sendNoContent(ctx.res)
}

export function registerPartRoutes(router: Router): void {
  router.get('/api/parts', listParts)
  router.get('/api/parts/:id', (ctx) => sendJson(ctx.res, getPart(Number(ctx.params.id))))
  router.post('/api/parts', createPart)
  router.put('/api/parts/:id', updatePart)
  router.put('/api/parts/:id/price', updatePrice)
  router.get('/api/parts/:id/prices', listPrices)
  router.post('/api/parts/:id/stock', changeStock)
  router.get('/api/parts/:id/movements', listMovements)
  router.delete('/api/parts/:id', deletePart)
  router.get('/api/trash/parts', (ctx) => {
    const rows = db.prepare("SELECT * FROM parts WHERE deleted_at <> '' ORDER BY deleted_at DESC LIMIT 200").all()
    sendJson(ctx.res, rows)
  })
  router.post('/api/trash/parts/:id/restore', restorePart)
  router.delete('/api/trash/parts/:id', purgePart)
  router.get('/api/prices', (ctx) => {
    const rows = db.prepare(`
      SELECT p.*, (SELECT MAX(recorded_at) FROM part_prices pp WHERE pp.part_id = p.id) AS last_price_at
      FROM active_parts p ORDER BY p.category, p.name
    `).all()
    sendJson(ctx.res, rows)
  })
}
