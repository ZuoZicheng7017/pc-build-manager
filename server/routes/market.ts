import { z } from 'zod'
import { db, nowIso } from '../db'
import { inspectProductLink, refreshMarketPrice } from '../market-link'
import { HttpError, queryStr, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'

const marketSchema = z.object({
  category: z.string().trim().min(1).max(30).default('其他'),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  specs: z.string().trim().max(1000).optional(),
  platform: z.enum(['pdd', 'jd', 'taobao', 'manual']).default('manual'),
  url: z.string().trim().max(1000).optional(),
  image_url: z.string().trim().max(1000).optional(),
  price_cents: z.coerce.number().int().min(0).max(100_000_000).default(0),
  shop_name: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
})

function listMarket(ctx: Ctx): void {
  const q = queryStr(ctx.url, 'q').trim()
  const category = queryStr(ctx.url, 'category')
  const platform = queryStr(ctx.url, 'platform')
  const where: string[] = []
  const params: (string | number)[] = []
  if (q) {
    where.push('(name LIKE ? OR brand LIKE ? OR model LIKE ? OR specs LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (category) { where.push('category = ?'); params.push(category) }
  if (platform) { where.push('platform = ?'); params.push(platform) }
  const rows = db.prepare(`SELECT * FROM market_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 300`).all(...params)
  sendJson(ctx.res, rows)
}

async function createMarket(ctx: Ctx): Promise<void> {
  const body = validate(marketSchema, await readJson(ctx.req))
  const info = db.prepare(`
    INSERT INTO market_items (category, name, brand, model, specs, platform, url, image_url, price_cents, shop_name, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(body.category ?? '其他'), body.name, body.brand ?? '', body.model ?? '', body.specs ?? '', String(body.platform ?? 'manual'),
    body.url ?? '', body.image_url ?? '', Number(body.price_cents ?? 0), body.shop_name ?? '', body.note ?? '', nowIso(), nowIso(),
  )
  sendJson(ctx.res, db.prepare('SELECT * FROM market_items WHERE id = ?').get(Number(info.lastInsertRowid)), 201)
}

async function updateMarket(ctx: Ctx): Promise<void> {
  const id = Number(ctx.params.id)
  if (!db.prepare('SELECT id FROM market_items WHERE id = ?').get(id)) throw new HttpError(404, '配件行情不存在')
  const body = validate(marketSchema, await readJson(ctx.req))
  db.prepare(`
    UPDATE market_items SET category = ?, name = ?, brand = ?, model = ?, specs = ?, platform = ?, url = ?, image_url = ?, price_cents = ?, shop_name = ?, note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    String(body.category ?? '其他'), body.name, body.brand ?? '', body.model ?? '', body.specs ?? '', String(body.platform ?? 'manual'),
    body.url ?? '', body.image_url ?? '', Number(body.price_cents ?? 0), body.shop_name ?? '', body.note ?? '', nowIso(), id,
  )
  sendJson(ctx.res, db.prepare('SELECT * FROM market_items WHERE id = ?').get(id))
}

function removeMarket(ctx: Ctx): void {
  db.prepare('DELETE FROM market_items WHERE id = ?').run(Number(ctx.params.id))
  sendNoContent(ctx.res)
}

async function inspectLink(ctx: Ctx): Promise<void> {
  const body = await readJson<{ url?: string }>(ctx.req)
  try {
    sendJson(ctx.res, await inspectProductLink(String(body.url ?? '')))
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : '链接读取失败')
  }
}

async function refreshPrice(ctx: Ctx): Promise<void> {
  try {
    sendJson(ctx.res, await refreshMarketPrice(Number(ctx.params.id)))
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : '价格更新失败')
  }
}

export function registerMarketRoutes(router: Router): void {
  router.get('/api/market', listMarket)
  router.post('/api/market', createMarket)
  router.post('/api/market/inspect', inspectLink)
  router.post('/api/market/:id/refresh', refreshPrice)
  router.put('/api/market/:id', updateMarket)
  router.delete('/api/market/:id', removeMarket)
}
