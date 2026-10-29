import { z } from 'zod'
import { db, nowIso } from '../db'
import { HttpError, queryStr, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import type { Customer, CustomerAddress } from '../../shared/types'

const customerSchema = z.object({
  name: z.string().trim().min(1, '请填写客户称呼').max(60),
  phone: z.string().trim().max(40).optional(),
  wechat: z.string().trim().max(80).optional(),
  address: z.string().trim().max(500).optional(),
  district: z.string().trim().max(40).optional(),
  source: z.string().trim().max(40).optional(),
  level: z.enum(['normal', 'key', 'vip']).optional(),
  tags: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(3000).optional(),
})

const addressSchema = z.object({
  label: z.string().trim().max(30).optional(),
  address: z.string().trim().min(1, '请填写地址').max(500),
  contact_name: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  is_default: z.coerce.number().int().min(0).max(1).optional(),
})

function getAddress(id: number): CustomerAddress {
  const row = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(id) as CustomerAddress | undefined
  if (!row) throw new HttpError(404, '地址不存在')
  return row
}

function getCustomer(id: number): Customer {
  const row = db.prepare('SELECT * FROM active_customers WHERE id = ?').get(id) as Customer | undefined
  if (!row) throw new HttpError(404, '客户不存在')
  return row
}

function listCustomers(ctx: Ctx): void {
  const q = queryStr(ctx.url, 'q')
  const level = queryStr(ctx.url, 'level')
  const where: string[] = ['1 = 1']
  const params: string[] = []
  if (q) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.address LIKE ? OR c.wechat LIKE ? OR c.tags LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  if (level) {
    where.push('c.level = ?')
    params.push(level)
  }
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM active_orders o WHERE o.customer_id = c.id) AS order_count,
      (SELECT COALESCE(SUM(o.total_cents), 0) FROM active_orders o WHERE o.customer_id = c.id AND o.status IN ('completed', 'after_sales')) AS total_spent_cents,
      (SELECT MAX(o.appointment_at) FROM active_orders o WHERE o.customer_id = c.id) AS last_order_at
    FROM active_customers c
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(last_order_at, c.updated_at) DESC, c.id DESC
  `).all(...params)
  sendJson(ctx.res, rows)
}

function customerDetail(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const customer = getCustomer(id)
  const orders = db.prepare(`
    SELECT o.*, s.name AS staff_name,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
      (SELECT COUNT(*) FROM order_media m WHERE m.order_id = o.id) AS media_count
    FROM active_orders o LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.customer_id = ? ORDER BY o.appointment_at DESC, o.id DESC
  `).all(id)
  const stats = db.prepare(`
    SELECT COUNT(*) AS order_count,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN total_cents ELSE 0 END), 0) AS total_spent_cents,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN 1 ELSE 0 END), 0) AS completed_count,
      MIN(appointment_at) AS first_order_at,
      MAX(appointment_at) AS last_order_at
    FROM active_orders WHERE customer_id = ?
  `).get(id)
  const addresses = db.prepare('SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id').all(id)
  sendJson(ctx.res, { ...customer, orders, stats, addresses })
}

function createCustomer(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(customerSchema, await readJson(ctx.req))
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO customers (name, phone, wechat, address, district, source, level, tags, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.name, b.phone ?? '', b.wechat ?? '', b.address ?? '', b.district ?? '', b.source ?? '', b.level ?? 'normal', b.tags ?? '', b.notes ?? '', now, now)
    const id = Number(info.lastInsertRowid)
    if ((b.address ?? '').trim()) {
      db.prepare(`INSERT INTO customer_addresses (customer_id, label, address, contact_name, phone, is_default, created_at) VALUES (?, '默认地址', ?, ?, ?, 1, ?)`)
        .run(id, b.address!.trim(), b.name, b.phone ?? '', now)
    }
    sendJson(ctx.res, getCustomer(id), 201)
  })()
}

function updateCustomer(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getCustomer(id)
    const b = validate(customerSchema, await readJson(ctx.req))
    const now = nowIso()
    db.prepare(`
      UPDATE customers SET name = ?, phone = ?, wechat = ?, address = ?, district = ?, source = ?,
        level = ?, tags = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(
      b.name, b.phone ?? old.phone, b.wechat ?? old.wechat, b.address ?? old.address,
      b.district ?? old.district, b.source ?? old.source, b.level ?? old.level,
      b.tags ?? old.tags, b.notes ?? old.notes, now, id,
    )
    const addressCount = db.prepare('SELECT COUNT(*) AS c FROM customer_addresses WHERE customer_id = ?').get(id) as { c: number }
    if (addressCount.c === 0 && (b.address ?? '').trim()) {
      db.prepare(`INSERT INTO customer_addresses (customer_id, label, address, contact_name, phone, is_default, created_at) VALUES (?, '默认地址', ?, ?, ?, 1, ?)`)
        .run(id, b.address!.trim(), b.name, b.phone ?? old.phone, now)
    }
    sendJson(ctx.res, getCustomer(id))
  })()
}

function deleteCustomer(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getCustomer(id)
  const used = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new HttpError(409, `该客户有 ${used.c} 条工单记录（含回收站），无法删除；请先彻底删除相关工单`)
  if (queryStr(ctx.url, 'hard') === '1') {
    db.prepare('DELETE FROM customer_addresses WHERE customer_id = ?').run(id)
    db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  } else {
    db.prepare('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id)
  }
  sendNoContent(ctx.res)
}

function restoreCustomer(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const row = db.prepare("SELECT id FROM customers WHERE id = ? AND deleted_at <> ''").get(id)
  if (!row) throw new HttpError(404, '回收站里没有这个客户')
  db.prepare("UPDATE customers SET deleted_at = '', updated_at = ? WHERE id = ?").run(nowIso(), id)
  sendJson(ctx.res, getCustomer(id))
}

function purgeCustomer(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const row = db.prepare("SELECT id FROM customers WHERE id = ? AND deleted_at <> ''").get(id)
  if (!row) throw new HttpError(404, '回收站里没有这个客户')
  const used = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new HttpError(409, '该客户仍有关联工单，无法彻底删除')
  db.prepare('DELETE FROM customer_addresses WHERE customer_id = ?').run(id)
  db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  sendNoContent(ctx.res)
}

function listAddresses(ctx: Ctx): void {
  const rows = db.prepare('SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id').all(Number(ctx.params.id))
  sendJson(ctx.res, rows)
}

function createAddress(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const customerId = Number(ctx.params.id)
    getCustomer(customerId)
    const b = validate(addressSchema, await readJson(ctx.req))
    const now = nowIso()
    const count = db.prepare('SELECT COUNT(*) AS c FROM customer_addresses WHERE customer_id = ?').get(customerId) as { c: number }
    const isDefault = b.is_default === 1 || count.c === 0 ? 1 : 0
    if (isDefault) db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(customerId)
    const info = db.prepare(`
      INSERT INTO customer_addresses (customer_id, label, address, contact_name, phone, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(customerId, b.label || '常用地址', b.address, b.contact_name ?? '', b.phone ?? '', isDefault, now)
    sendJson(ctx.res, getAddress(Number(info.lastInsertRowid)), 201)
  })()
}

function updateAddress(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getAddress(id)
    const b = validate(addressSchema, await readJson(ctx.req))
    if (b.is_default === 1) db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(old.customer_id)
    db.prepare(`
      UPDATE customer_addresses SET label = ?, address = ?, contact_name = ?, phone = ?, is_default = ? WHERE id = ?
    `).run(b.label || old.label, b.address, b.contact_name ?? old.contact_name, b.phone ?? old.phone, b.is_default === 1 ? 1 : old.is_default, id)
    sendJson(ctx.res, getAddress(id))
  })()
}

function setDefaultAddress(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const old = getAddress(id)
  db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(old.customer_id)
  db.prepare('UPDATE customer_addresses SET is_default = 1 WHERE id = ?').run(id)
  sendJson(ctx.res, getAddress(id))
}

function deleteAddress(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  const old = getAddress(id)
  db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(id)
  if (old.is_default) {
    const next = db.prepare('SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id LIMIT 1').get(old.customer_id) as { id: number } | undefined
    if (next) db.prepare('UPDATE customer_addresses SET is_default = 1 WHERE id = ?').run(next.id)
  }
  sendNoContent(ctx.res)
}

export function registerCustomerRoutes(router: Router): void {
  router.get('/api/customers', listCustomers)
  router.get('/api/customers/:id', customerDetail)
  router.post('/api/customers', createCustomer)
  router.put('/api/customers/:id', updateCustomer)
  router.delete('/api/customers/:id', deleteCustomer)
  router.get('/api/customers/:id/addresses', listAddresses)
  router.post('/api/customers/:id/addresses', createAddress)
  router.put('/api/addresses/:id', updateAddress)
  router.delete('/api/addresses/:id', deleteAddress)
  router.patch('/api/addresses/:id/default', setDefaultAddress)
  router.get('/api/trash/customers', (ctx) => {
    const rows = db.prepare("SELECT * FROM customers WHERE deleted_at <> '' ORDER BY deleted_at DESC LIMIT 200").all()
    sendJson(ctx.res, rows)
  })
  router.post('/api/trash/customers/:id/restore', restoreCustomer)
  router.delete('/api/trash/customers/:id', purgeCustomer)
}
