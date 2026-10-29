import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { db, nowIso, touchOrder } from '../db'
import { HttpError, queryInt, queryStr, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import { ensureMonthDir, extFromMime, mimeFromName, removeUpload, resolveUpload } from '../helpers'
import {
  addPayment,
  changeStatus,
  createOrder,
  deleteOrder,
  deletePayment,
  getOrderDetail,
  replaceChecklist,
  replacePrecheck,
  restoreOrder,
  softDeleteOrder,
  updateFollowUp,
  updateOrder,
  updatePayment,
} from '../services/orders'
import { MEDIA_CATEGORIES, ORDER_STATUSES, type ChecklistItem, type MediaCategory, type OrderStatus, type PaymentKind, type SharedOrder } from '../../shared/types'
import { getSettingsMap } from '../db'
import { buildQuotePdf } from '../pdf'
import { hasFfmpeg, transcodeVideo } from '../video'
import { ZipArchive } from 'archiver'

const itemSchema = z.object({
  part_id: z.number().int().positive().nullable().optional(),
  name: z.string().max(200).optional(),
  spec: z.string().max(300).optional(),
  qty: z.coerce.number().int().min(1).max(99),
  unit_price_cents: z.coerce.number().int().min(0).max(100_000_000),
  cost_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  note: z.string().max(500).optional(),
})

const checklistSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  done: z.boolean(),
}))

const serviceSchema = z.object({
  service_item_id: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().max(100).optional(),
  price_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  qty: z.coerce.number().int().min(1).max(99),
  note: z.string().max(300).optional(),
})

const paymentSchema = z.object({
  kind: z.enum(['deposit', 'final', 'other', 'refund']),
  amount_cents: z.coerce.number().int().min(1).max(100_000_000),
  method: z.enum(['cash', 'wechat', 'alipay', 'xianyu', 'card', 'other']),
  note: z.string().max(500).optional(),
  paid_at: z.string().max(40).optional(),
})

const orderSchema = z.object({
  customer_id: z.coerce.number().int().positive(),
  staff_id: z.coerce.number().int().positive().nullable().optional(),
  template_id: z.coerce.number().int().positive().nullable().optional(),
  service_type: z.enum(['new', 'upgrade', 'repair', 'maintenance', 'other']).optional(),
  status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]).optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  parts_source: z.enum(['customer', 'shop', 'mixed']).optional(),
  appointment_at: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  contact_phone: z.string().max(50).optional(),
  description: z.string().max(5000).optional(),
  labor_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  service_extra_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  travel_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  material_fee_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  discount_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  paid_cents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  payment_method: z.enum(['cash', 'wechat', 'alipay', 'xianyu', 'card', 'other']).optional(),
  warranty_months: z.coerce.number().int().min(0).max(240).optional(),
  checklist: checklistSchema.optional(),
  precheck: checklistSchema.optional(),
  parts_confirmed: z.boolean().optional(),
  parts_confirm_note: z.string().max(2000).optional(),
  items: z.array(itemSchema).max(60).optional(),
  services: z.array(serviceSchema).max(40).optional(),
})

function listOrders(ctx: Ctx): void {
  const { url, res } = ctx
  const page = queryInt(url, 'page', 1, 1)
  const pageSize = queryInt(url, 'pageSize', 20, 1, 100)
  const q = queryStr(url, 'q')
  const status = queryStr(url, 'status')
  const staffId = queryInt(url, 'staffId', 0)
  const customerId = queryInt(url, 'customerId', 0)
  const from = queryStr(url, 'from')
  const to = queryStr(url, 'to')

  const where: string[] = ['1 = 1']
  const params: (string | number)[] = []
  if (q) {
    where.push('(o.order_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR o.address LIKE ? OR o.description LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter((s) => (ORDER_STATUSES as string[]).includes(s))
    if (list.length) {
      where.push(`o.status IN (${list.map(() => '?').join(',')})`)
      params.push(...list)
    }
  }
  if (staffId) {
    where.push('o.staff_id = ?')
    params.push(staffId)
  }
  if (customerId) {
    where.push('o.customer_id = ?')
    params.push(customerId)
  }
  if (from) {
    where.push('date(o.appointment_at) >= date(?)')
    params.push(from)
  }
  if (to) {
    where.push('date(o.appointment_at) <= date(?)')
    params.push(to)
  }

  const whereSql = where.join(' AND ')
  const totalRow = db.prepare(`
    SELECT COUNT(*) AS c FROM active_orders o JOIN customers c ON c.id = o.customer_id WHERE ${whereSql}
  `).get(...params) as { c: number }

  const rows = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS staff_name,
           t.name AS template_name,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
           (SELECT COUNT(*) FROM order_services sv WHERE sv.order_id = o.id) AS service_count,
           (SELECT COUNT(*) FROM order_media m WHERE m.order_id = o.id) AS media_count
    FROM active_orders o
    JOIN active_customers c ON c.id = o.customer_id
    LEFT JOIN staff s ON s.id = o.staff_id
    LEFT JOIN templates t ON t.id = o.template_id
    WHERE ${whereSql}
    ORDER BY o.appointment_at DESC, o.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize)

  sendJson(res, { items: rows, total: totalRow.c, page, pageSize })
}

const uploadLimits: Record<string, number> = {
  image: 25 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  file: 50 * 1024 * 1024,
}

async function uploadMedia(ctx: Ctx): Promise<void> {
  const { req, res, url, params } = ctx
  const orderId = Number(params.id)
  const order = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(orderId)
  if (!order) throw new HttpError(404, '工单不存在')

  const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  let rawName = String(req.headers['x-file-name'] ?? 'upload')
  try { rawName = decodeURIComponent(rawName) } catch { /* 保留原始文件名 */ }
  const fileName = rawName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || 'upload'
  const resolvedMime = mime && mime !== 'application/octet-stream' ? mime : mimeFromName(fileName)
  const ext = extFromMime(resolvedMime)
  if (!ext) throw new HttpError(415, '仅支持常见图片（JPG/PNG/WebP/GIF）与视频（MP4/MOV/WebM）格式')
  const kind = resolvedMime.startsWith('image/') ? 'image' : resolvedMime.startsWith('video/') ? 'video' : 'file'
  const limit = uploadLimits[kind] ?? uploadLimits.file
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, `文件超过 ${Math.round(limit / 1024 / 1024)}MB 上限`)

  const { month } = ensureMonthDir()
  const storedName = `${month}/${randomUUID()}.${ext}`
  const target = resolveUpload(storedName)
  let size = 0
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length
      if (size > limit) {
        cb(new HttpError(413, `文件超过 ${Math.round(limit / 1024 / 1024)}MB 上限`))
        return
      }
      cb(null, chunk)
    },
  })

  try {
    await pipeline(req, limiter, createWriteStream(target))
  } catch (err) {
    try { fs.unlinkSync(target) } catch { /* ignore */ }
    throw err
  }
  if (size === 0) {
    try { fs.unlinkSync(target) } catch { /* ignore */ }
    throw new HttpError(400, '没有收到文件内容')
  }

  // 手机视频常见 HEVC/H.265 / MOV / 10-bit，浏览器只有声音没有画面。
  // 统一转成 H.264 + AAC 的 MP4；转码失败时保留原文件，至少可下载。
  let finalStoredName = storedName
  let finalFileName = fileName
  let finalMime = resolvedMime
  let finalSize = size
  if (kind === 'video' && hasFfmpeg()) {
    const convertedStored = `${month}/${randomUUID()}.mp4`
    const convertedTarget = resolveUpload(convertedStored)
    try {
      await transcodeVideo(target, convertedTarget)
      try { fs.unlinkSync(target) } catch { /* ignore */ }
      finalStoredName = convertedStored
      finalFileName = `${fileName.replace(/\.[^.]+$/, '') || 'video'}.mp4`
      finalMime = 'video/mp4'
      finalSize = fs.statSync(convertedTarget).size
    } catch (err) {
      console.error('[video transcode]', err)
      try { fs.unlinkSync(convertedTarget) } catch { /* ignore */ }
    }
  }

  const caption = (queryStr(url, 'caption') || '').slice(0, 200)
  const categoryInput = queryStr(url, 'category')
  const category: MediaCategory = (MEDIA_CATEGORIES as string[]).includes(categoryInput) ? categoryInput as MediaCategory : 'during'
  const now = nowIso()
  const info = db.prepare(`
    INSERT INTO order_media (order_id, kind, file_name, stored_name, mime, size, category, caption, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, kind, finalFileName, finalStoredName, finalMime, finalSize, category, caption, now)
  touchOrder(orderId, kind === 'video' ? '上传现场视频' : '上传现场图片', finalFileName, '我', now)
  sendJson(res, {
    id: Number(info.lastInsertRowid),
    order_id: orderId,
    kind,
    file_name: finalFileName,
    stored_name: finalStoredName,
    mime: finalMime,
    size: finalSize,
    category,
    caption,
    created_at: now,
    url: `/uploads/${finalStoredName}`,
  }, 201)
}

function downloadMedia(ctx: Ctx): void {
  const orderId = Number(ctx.params.id)
  const order = db.prepare('SELECT order_no FROM active_orders WHERE id = ?').get(orderId) as { order_no: string } | undefined
  if (!order) throw new HttpError(404, '工单不存在')
  const media = db.prepare('SELECT file_name, stored_name FROM order_media WHERE order_id = ? ORDER BY id').all(orderId) as { file_name: string; stored_name: string }[]
  if (media.length === 0) throw new HttpError(404, '该工单还没有现场媒体')
  ctx.res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${order.order_no}-media.zip"`,
    'Cache-Control': 'no-store',
  })
  const archive = new ZipArchive({ zlib: { level: 6 } })
  archive.on('error', (err) => { console.error('[media zip]', err); ctx.res.end() })
  archive.pipe(ctx.res)
  media.forEach((item, index) => {
    const safeName = item.file_name.replace(/[\\/:*?"<>|]/g, '_')
    try {
      archive.file(resolveUpload(item.stored_name), { name: `${String(index + 1).padStart(2, '0')}-${safeName}` })
    } catch {
      // 文件丢失则跳过
    }
  })
  void archive.finalize()
}

async function quotePdf(ctx: Ctx): Promise<void> {
  const order = getOrderDetail(Number(ctx.params.id))
  const settings = getSettingsMap()
  const buffer = await buildQuotePdf(order, settings as unknown as Parameters<typeof buildQuotePdf>[1])
  ctx.res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${order.order_no}-quote.pdf"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  })
  ctx.res.end(buffer)
}

function createShare(ctx: Ctx): void {
  const orderId = Number(ctx.params.id)
  const order = db.prepare('SELECT id, share_token FROM active_orders WHERE id = ?').get(orderId) as { id: number; share_token: string | null } | undefined
  if (!order) throw new HttpError(404, '工单不存在')
  const token = order.share_token || randomUUID()
  if (!order.share_token) db.prepare('UPDATE orders SET share_token = ?, updated_at = ? WHERE id = ?').run(token, nowIso(), orderId)
  sendJson(ctx.res, { token })
}

function revokeShare(ctx: Ctx): void {
  const orderId = Number(ctx.params.id)
  const order = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(orderId)
  if (!order) throw new HttpError(404, '工单不存在')
  db.prepare('UPDATE orders SET share_token = NULL, updated_at = ? WHERE id = ?').run(nowIso(), orderId)
  sendNoContent(ctx.res)
}

function publicShare(ctx: Ctx): void {
  const token = ctx.params.token
  const row = db.prepare('SELECT id FROM active_orders WHERE share_token = ?').get(token) as { id: number } | undefined
  if (!row) throw new HttpError(404, '分享链接不存在或已失效')
  const detail = getOrderDetail(row.id)
  const settings = getSettingsMap()
  const data: SharedOrder = {
    shop: { name: settings.shop_name, phone: settings.shop_phone, address: settings.shop_address },
    order: {
      order_no: detail.order_no,
      status: detail.status,
      service_type: detail.service_type,
      parts_source: detail.parts_source,
      appointment_at: detail.appointment_at,
      address: detail.address,
      contact_name: detail.contact_name,
      warranty_months: detail.warranty_months,
      total_cents: detail.total_cents,
      labor_fee_cents: detail.labor_fee_cents,
      travel_fee_cents: detail.travel_fee_cents,
      material_fee_cents: detail.material_fee_cents,
      discount_cents: detail.discount_cents,
      description: detail.description,
      completed_at: detail.completed_at,
    },
    customer_name: detail.customer_name ?? detail.contact_name,
    staff_name: detail.staff_name ?? null,
    services: detail.services,
    items: detail.items,
    media: detail.media,
    checklist: {
      done: detail.checklist.filter((item) => item.done).length,
      total: detail.checklist.length,
    },
  }
  sendJson(ctx.res, data)
}

function deleteMedia(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const row = db.prepare('SELECT order_id, stored_name FROM order_media WHERE id = ?').get(id) as
    | { order_id: number; stored_name: string }
    | undefined
  if (!row) throw new HttpError(404, '媒体不存在')
  db.prepare('DELETE FROM order_media WHERE id = ?').run(id)
  removeUpload(row.stored_name)
  touchOrder(row.order_id, '删除现场媒体', '')
  sendNoContent(ctx.res)
}

export function registerOrderRoutes(router: Router): void {
  router.get('/api/orders', listOrders)
  router.post('/api/orders', async (ctx) => {
    const body = validate(orderSchema, await readJson(ctx.req))
    const order = createOrder(body)
    sendJson(ctx.res, order, 201)
  })
  router.get('/api/orders/:id', (ctx) => {
    sendJson(ctx.res, getOrderDetail(Number(ctx.params.id)))
  })
  router.put('/api/orders/:id', async (ctx) => {
    const body = validate(orderSchema, await readJson(ctx.req))
    sendJson(ctx.res, updateOrder(Number(ctx.params.id), body))
  })
  router.delete('/api/orders/:id', (ctx) => {
    const id = Number(ctx.params.id)
    if (queryStr(ctx.url, 'hard') === '1') {
      const files = deleteOrder(id)
      for (const f of files) removeUpload(f)
    } else {
      softDeleteOrder(id)
    }
    sendNoContent(ctx.res)
  })
  router.get('/api/trash/orders', (ctx) => {
    const rows = db.prepare(`
      SELECT o.*, c.name AS customer_name
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at <> ''
      ORDER BY o.deleted_at DESC LIMIT 200
    `).all()
    sendJson(ctx.res, rows)
  })
  router.post('/api/trash/orders/:id/restore', (ctx) => {
    sendJson(ctx.res, restoreOrder(Number(ctx.params.id)))
  })
  router.delete('/api/trash/orders/:id', (ctx) => {
    const files = deleteOrder(Number(ctx.params.id))
    for (const f of files) removeUpload(f)
    sendNoContent(ctx.res)
  })
  router.patch('/api/orders/:id/status', async (ctx) => {
    const body = validate(z.object({
      status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]),
      note: z.string().max(500).optional(),
    }), await readJson(ctx.req))
    sendJson(ctx.res, changeStatus(Number(ctx.params.id), body.status, body.note ?? ''))
  })
  router.patch('/api/orders/:id/checklist', async (ctx) => {
    const body = validate(z.object({ checklist: checklistSchema }), await readJson(ctx.req))
    sendJson(ctx.res, replaceChecklist(Number(ctx.params.id), body.checklist as ChecklistItem[]))
  })
  router.patch('/api/orders/:id/payment', async (ctx) => {
    const body = validate(z.object({
      paid_cents: z.coerce.number().int().min(0).max(100_000_000),
      payment_method: z.enum(['cash', 'wechat', 'alipay', 'xianyu', 'card', 'other']),
    }), await readJson(ctx.req))
    sendJson(ctx.res, updatePayment(Number(ctx.params.id), body.paid_cents, body.payment_method))
  })
  router.post('/api/orders/:id/payments', async (ctx) => {
    const body = validate(paymentSchema, await readJson(ctx.req))
    sendJson(ctx.res, addPayment(Number(ctx.params.id), {
      kind: body.kind as PaymentKind,
      amount_cents: body.amount_cents,
      method: body.method,
      note: body.note,
      paid_at: body.paid_at,
    }), 201)
  })
  router.delete('/api/payments/:id', (ctx) => {
    sendJson(ctx.res, deletePayment(Number(ctx.params.id)))
  })
  router.patch('/api/orders/:id/followup', async (ctx) => {
    const body = validate(z.object({
      follow_up_at: z.string().max(40).optional(),
      follow_up_note: z.string().max(2000).optional(),
      rating: z.coerce.number().int().min(0).max(5).optional(),
    }), await readJson(ctx.req))
    sendJson(ctx.res, updateFollowUp(Number(ctx.params.id), {
      follow_up_at: body.follow_up_at ?? '',
      follow_up_note: body.follow_up_note ?? '',
      rating: body.rating ?? 0,
    }))
  })
  router.patch('/api/orders/:id/precheck', async (ctx) => {
    const body = validate(z.object({
      precheck: checklistSchema,
      parts_confirmed: z.boolean().optional(),
      parts_confirm_note: z.string().max(2000).optional(),
    }), await readJson(ctx.req))
    sendJson(ctx.res, replacePrecheck(Number(ctx.params.id), body.precheck as ChecklistItem[], body.parts_confirmed, body.parts_confirm_note))
  })
  router.post('/api/orders/:id/media', uploadMedia)
  router.get('/api/orders/:id/media.zip', downloadMedia)
  router.get('/api/orders/:id/quote.pdf', quotePdf)
  router.post('/api/orders/:id/share', createShare)
  router.delete('/api/orders/:id/share', revokeShare)
  router.get('/api/share/:token', publicShare)
  router.delete('/api/media/:id', deleteMedia)
}
