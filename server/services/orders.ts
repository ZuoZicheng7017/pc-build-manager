import { db, getSettingsMap, nowIso, touchOrder } from '../db'
import {
  calcOrderTotal,
  paymentStatusOf,
  DEFAULT_CHECKLIST,
  DEFAULT_PRECHECK,
  ORDER_STATUS_META,
  PARTS_SOURCE_LABELS,
  PAYMENT_KIND_LABELS,
  SERVICE_TYPE_LABELS,
  type ChecklistItem,
  type OrderDetail,
  type OrderItem,
  type OrderPayment,
  type OrderService,
  type OrderStatus,
  type PartsSource,
  type PaymentKind,
  type ServiceType,
} from '../../shared/types'
import { HttpError } from '../http'

export interface ItemInput {
  part_id?: number | null
  name?: string
  spec?: string
  qty: number
  unit_price_cents: number
  cost_cents?: number
  note?: string
}

export interface ServiceInput {
  service_item_id?: number | null
  name?: string
  price_cents?: number
  qty: number
  note?: string
}

export interface OrderInput {
  customer_id: number
  staff_id?: number | null
  template_id?: number | null
  service_type?: ServiceType
  status?: OrderStatus
  priority?: 'normal' | 'urgent'
  parts_source?: PartsSource
  appointment_at?: string
  address?: string
  contact_name?: string
  contact_phone?: string
  description?: string
  labor_fee_cents?: number
  travel_fee_cents?: number
  material_fee_cents?: number
  discount_cents?: number
  service_extra_cents?: number
  paid_cents?: number
  payment_method?: string
  warranty_months?: number
  checklist?: ChecklistItem[]
  precheck?: ChecklistItem[]
  parts_confirmed?: boolean
  parts_confirm_note?: string
  items?: ItemInput[]
  services?: ServiceInput[]
}

type StockItem = { part_id: number | null; qty: number }

function stockLines(items: StockItem[]): Map<number, number> {
  const lines = new Map<number, number>()
  for (const item of items) {
    if (!item.part_id) continue
    lines.set(item.part_id, (lines.get(item.part_id) ?? 0) + Math.max(1, item.qty))
  }
  return lines
}

function changeStock(partId: number, delta: number, kind: string, orderId: number | null, note: string): void {
  if (delta === 0) return
  const part = db.prepare('SELECT id FROM parts WHERE id = ?').get(partId)
  if (!part) return
  db.prepare('UPDATE parts SET stock = stock + ?, updated_at = ? WHERE id = ?').run(delta, nowIso(), partId)
  db.prepare(`
    INSERT INTO stock_movements (part_id, order_id, kind, qty, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(partId, orderId, kind, delta, note, nowIso())
}

function deductInventory(orderId: number, items: StockItem[], partsSource: PartsSource, note = '工单占用'): void {
  if (partsSource === 'customer') return
  const lines = stockLines(items)
  if (lines.size === 0) return
  for (const [partId, qty] of lines) changeStock(partId, -qty, 'order_out', orderId, note)
  db.prepare('UPDATE orders SET inventory_applied = 1 WHERE id = ?').run(orderId)
}

function restoreInventory(orderId: number, note = '工单释放'): void {
  const order = db.prepare('SELECT inventory_applied FROM orders WHERE id = ?').get(orderId) as { inventory_applied: number } | undefined
  if (!order?.inventory_applied) return
  const items = db.prepare('SELECT part_id, qty FROM order_items WHERE order_id = ?').all(orderId) as StockItem[]
  for (const [partId, qty] of stockLines(items)) changeStock(partId, qty, 'order_in', orderId, note)
  db.prepare('UPDATE orders SET inventory_applied = 0 WHERE id = ?').run(orderId)
}

function nextOrderNo(dateStr: string): string {
  const datePart = (dateStr || todayCompact()).slice(0, 10).replace(/-/g, '')
  const prefix = `SO${datePart}-`
  const row = db
    .prepare("SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1")
    .get(`${prefix}%`) as { order_no: string } | undefined
  const last = row ? Number.parseInt(row.order_no.slice(prefix.length), 10) : 0
  return `${prefix}${String((Number.isNaN(last) ? 0 : last) + 1).padStart(3, '0')}`
}

function todayCompact(): string {
  return nowIso().slice(0, 10)
}

function normalizeItems(items: ItemInput[]): Omit<OrderItem, 'id' | 'order_id'>[] {
  const partStmt = db.prepare('SELECT id, name, spec, cost_cents FROM active_parts WHERE id = ?')
  return items.map((raw, i) => {

    const qty = Math.max(1, Math.floor(raw.qty || 1))
    if (raw.part_id) {
      const part = partStmt.get(raw.part_id) as { id: number; name: string; spec: string; cost_cents: number } | undefined
      if (!part) throw new HttpError(422, `第 ${i + 1} 行配件不存在`)
      const unit = Math.max(0, Math.round(raw.unit_price_cents ?? 0))
      return {
        part_id: part.id,
        name: raw.name?.trim() || part.name,
        spec: raw.spec?.trim() || part.spec,
        qty,
        unit_price_cents: unit,
        cost_cents: part.cost_cents,
        note: raw.note?.trim() || '',
      }
    }
    const name = raw.name?.trim()
    if (!name) throw new HttpError(422, `第 ${i + 1} 行请选择配件或填写名称`)
    return {
      part_id: null,
      name,
      spec: raw.spec?.trim() || '',
      qty,
      unit_price_cents: Math.max(0, Math.round(raw.unit_price_cents ?? 0)),
      cost_cents: Math.max(0, Math.round(raw.cost_cents ?? 0)),
      note: raw.note?.trim() || '',
    }
  })
}

/**
 * 客户自备配件时，配件仅作型号记录，不参与计费，成本也归零。
 * 这样即使前端误传了价格，工单金额仍然只包含服务费。
 */
function applyPartsSource(
  items: Omit<OrderItem, 'id' | 'order_id'>[],
  source: PartsSource,
): Omit<OrderItem, 'id' | 'order_id'>[] {
  if (source !== 'customer') return items
  return items.map((item) => ({ ...item, unit_price_cents: 0, cost_cents: 0 }))
}

function normalizeServices(services: ServiceInput[] | undefined, extraCents: number): {
  services: Omit<OrderService, 'id' | 'order_id'>[]
  total: number
} {
  const stmt = db.prepare('SELECT id, name, price_cents, active FROM service_items WHERE id = ?')
  const rows = (services ?? []).map((raw, index) => {
    const qty = Math.max(1, Math.floor(raw.qty || 1))
    if (raw.service_item_id) {
      const item = stmt.get(raw.service_item_id) as { id: number; name: string; price_cents: number; active: number } | undefined
      if (!item) throw new HttpError(422, `第 ${index + 1} 个服务项目不存在`)
      return {
        service_item_id: item.id,
        name: item.name,
        price_cents: Math.max(0, Math.round(item.price_cents)),
        qty,
        note: raw.note?.trim() || '',
      }
    }
    const name = raw.name?.trim()
    if (!name) throw new HttpError(422, `第 ${index + 1} 个服务项目请填写名称`)
    return {
      service_item_id: null,
      name,
      price_cents: Math.max(0, Math.round(raw.price_cents ?? 0)),
      qty,
      note: raw.note?.trim() || '',
    }
  })
  const total = rows.reduce((sum, row) => sum + row.price_cents * row.qty, 0) + Math.max(0, Math.round(extraCents))
  return { services: rows, total }
}

function recalcOrderPayment(orderId: number): void {
  const order = db.prepare('SELECT total_cents FROM orders WHERE id = ?').get(orderId) as { total_cents: number } | undefined
  if (!order) return
  const rows = db.prepare('SELECT kind, amount_cents FROM order_payments WHERE order_id = ?').all(orderId) as { kind: PaymentKind; amount_cents: number }[]
  const paid = Math.max(0, rows.reduce((sum, row) => sum + (row.kind === 'refund' ? -row.amount_cents : row.amount_cents), 0))
  db.prepare('UPDATE orders SET paid_cents = ?, payment_status = ?, updated_at = ? WHERE id = ?')
    .run(paid, paymentStatusOf(order.total_cents, paid), nowIso(), orderId)
}

export function addPayment(
  orderId: number,
  input: { kind: PaymentKind; amount_cents: number; method: string; note?: string; paid_at?: string },
  operator = '我',
): OrderDetail {
  const order = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(orderId)
  if (!order) throw new HttpError(404, '工单不存在')
  const amount = Math.max(0, Math.round(input.amount_cents))
  if (amount <= 0) throw new HttpError(422, '收款金额必须大于 0')
  const now = nowIso()
  db.prepare(`
    INSERT INTO order_payments (order_id, kind, amount_cents, method, note, paid_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, input.kind, amount, input.method, input.note?.trim() || '', input.paid_at?.trim() || now, now)
  recalcOrderPayment(orderId)
  const label = PAYMENT_KIND_LABELS[input.kind] ?? '收款'
  touchOrder(orderId, '新增收款', `${label} ${(amount / 100).toFixed(2)} 元 · ${input.method}`, operator, now)
  return getOrderDetail(orderId)
}

export function deletePayment(paymentId: number, operator = '我'): OrderDetail {
  const row = db.prepare('SELECT order_id, kind, amount_cents FROM order_payments WHERE id = ?').get(paymentId) as
    | { order_id: number; kind: PaymentKind; amount_cents: number }
    | undefined
  if (!row) throw new HttpError(404, '收款记录不存在')
  db.prepare('DELETE FROM order_payments WHERE id = ?').run(paymentId)
  recalcOrderPayment(row.order_id)
  touchOrder(row.order_id, '删除收款', `${PAYMENT_KIND_LABELS[row.kind] ?? '收款'} ${(row.amount_cents / 100).toFixed(2)} 元`, operator)
  return getOrderDetail(row.order_id)
}

export function createOrder(input: OrderInput, operator = '我'): OrderDetail {
  const customer = db.prepare('SELECT * FROM active_customers WHERE id = ?').get(input.customer_id) as
    | { id: number; name: string; phone: string; address: string }
    | undefined
  if (!customer) throw new HttpError(422, '请选择有效的客户')
  if (input.staff_id) {
    const staff = db.prepare('SELECT id FROM staff WHERE id = ?').get(input.staff_id)
    if (!staff) throw new HttpError(422, '指派的员工不存在')
  }
  if (input.template_id) {
    const tpl = db.prepare('SELECT id FROM templates WHERE id = ?').get(input.template_id)
    if (!tpl) throw new HttpError(422, '来源配置不存在')
  }

  const settings = getSettingsMap()
  const normalized = normalizeItems(input.items ?? [])
  const partsSource: PartsSource = input.parts_source ?? (normalized.length > 0 ? 'shop' : 'customer')
  const items = applyPartsSource(normalized, partsSource)
  const hasServicePayload = input.services !== undefined || input.service_extra_cents !== undefined
  const serviceExtra = Math.max(0, Math.round(
    input.service_extra_cents ?? (hasServicePayload ? 0 : (input.labor_fee_cents ?? Number(settings.default_labor_fee_cents))),
  ))
  const serviceData = normalizeServices(input.services, serviceExtra)
  const labor = serviceData.total
  const travel = Math.max(0, Math.round(input.travel_fee_cents ?? Number(settings.default_travel_fee_cents)))
  const material = Math.max(0, Math.round(input.material_fee_cents ?? 0))
  const discount = Math.max(0, Math.round(input.discount_cents ?? 0))
  const paid = Math.max(0, Math.round(input.paid_cents ?? 0))
  const { total, cost } = calcOrderTotal({
    items,
    labor_fee_cents: labor,
    travel_fee_cents: travel,
    material_fee_cents: material,
    discount_cents: discount,
  })
  const paymentStatus = paymentStatusOf(total, paid)
  const now = nowIso()
  const appointment = input.appointment_at?.trim() || now.slice(0, 16)
  const checklist = input.checklist?.length ? input.checklist : DEFAULT_CHECKLIST.map((c) => ({ ...c }))
  const precheck = input.precheck ?? (partsSource === 'customer' ? DEFAULT_PRECHECK.map((c) => ({ ...c })) : [])
  const partsConfirmed = input.parts_confirmed ? 1 : 0
  const status = input.status ?? 'pending'
  const orderNo = nextOrderNo(appointment)

  db.exec('BEGIN')
  try {
    const info = db.prepare(`
      INSERT INTO orders (
        order_no, customer_id, staff_id, template_id, service_type, status, priority, parts_source,
        appointment_at, address, contact_name, contact_phone, description,
        labor_fee_cents, service_extra_cents, travel_fee_cents, material_fee_cents, discount_cents,
        total_cents, cost_cents, paid_cents, payment_method, payment_status,
        warranty_months, checklist_json, precheck_json, parts_confirmed, parts_confirm_note,
        completed_at, share_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      orderNo,
      customer.id,
      input.staff_id ?? null,
      input.template_id ?? null,
      input.service_type ?? 'new',
      status,
      input.priority ?? 'normal',
      partsSource,
      appointment,
      input.address?.trim() || customer.address,
      input.contact_name?.trim() || customer.name,
      input.contact_phone?.trim() || customer.phone,
      input.description?.trim() || '',
      labor,
      serviceExtra,
      travel,
      material,
      discount,
      total,
      cost,
      paid,
      input.payment_method ?? 'wechat',
      paymentStatus,
      Math.max(0, Math.round(input.warranty_months ?? Number(settings.default_warranty_months))),
      JSON.stringify(checklist),
      JSON.stringify(precheck),
      partsConfirmed,
      input.parts_confirm_note?.trim() || '',
      status === 'completed' ? now : null,
      now,
      now,
    )
    const orderId = Number(info.lastInsertRowid)
    const insItem = db.prepare(`
      INSERT INTO order_items (order_id, part_id, name, spec, qty, unit_price_cents, cost_cents, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const item of items) {
      insItem.run(orderId, item.part_id, item.name, item.spec, item.qty, item.unit_price_cents, item.cost_cents, item.note)
    }
    deductInventory(orderId, items, partsSource)
    if (status === 'cancelled') restoreInventory(orderId, '取消工单释放库存')
    const insService = db.prepare(`
      INSERT INTO order_services (order_id, service_item_id, name, price_cents, qty, note)
      VALUES (?, ?, ?, ?, ?, ?)`)
    for (const service of serviceData.services) {
      insService.run(orderId, service.service_item_id, service.name, service.price_cents, service.qty, service.note)
    }
    if (paid > 0) {
      db.prepare(`
        INSERT INTO order_payments (order_id, kind, amount_cents, method, note, paid_at, created_at)
        VALUES (?, 'deposit', ?, ?, '下单时预收', ?, ?)
      `).run(orderId, paid, input.payment_method ?? 'wechat', now, now)
    }
    db.prepare(`
      INSERT INTO order_logs (order_id, action, detail, operator, created_at)
      VALUES (?, '创建工单', ?, ?, ?)
    `).run(orderId, `${SERVICE_TYPE_LABELS[input.service_type ?? 'new']} · ${PARTS_SOURCE_LABELS[partsSource]} · 服务费 ${(labor / 100).toFixed(2)} 元`, operator, now)
    db.prepare('UPDATE customers SET updated_at = ? WHERE id = ?').run(now, customer.id)
    db.exec('COMMIT')
    return getOrderDetail(orderId)
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function updateOrder(id: number, input: OrderInput, operator = '我'): OrderDetail {
  const old = db.prepare('SELECT * FROM active_orders WHERE id = ?').get(id) as
    | {
        status: OrderStatus
        total_cents: number
        paid_cents: number
        checklist_json: string
        precheck_json: string
        parts_confirmed: number
        parts_confirm_note: string
        parts_source: PartsSource
        service_extra_cents: number
        labor_fee_cents: number
        payment_method: string
      }
    | undefined
  if (!old) throw new HttpError(404, '工单不存在')
  const customer = db.prepare('SELECT * FROM active_customers WHERE id = ?').get(input.customer_id) as
    | { id: number; name: string; phone: string; address: string }
    | undefined
  if (!customer) throw new HttpError(422, '请选择有效的客户')

  const normalized = normalizeItems(input.items ?? [])
  const partsSource: PartsSource = input.parts_source ?? old.parts_source
  const items = applyPartsSource(normalized, partsSource)
  const replaceServices = input.services !== undefined || input.service_extra_cents !== undefined
  const serviceData = replaceServices
    ? normalizeServices(input.services, input.service_extra_cents ?? 0)
    : { services: [] as Omit<OrderService, 'id' | 'order_id'>[], total: old.labor_fee_cents }
  const labor = serviceData.total
  const serviceExtra = replaceServices ? Math.max(0, Math.round(input.service_extra_cents ?? 0)) : old.service_extra_cents
  const travel = Math.max(0, Math.round(input.travel_fee_cents ?? 0))
  const material = Math.max(0, Math.round(input.material_fee_cents ?? 0))
  const discount = Math.max(0, Math.round(input.discount_cents ?? 0))
  const { total, cost } = calcOrderTotal({
    items,
    labor_fee_cents: labor,
    travel_fee_cents: travel,
    material_fee_cents: material,
    discount_cents: discount,
  })
  const paymentStatus = paymentStatusOf(total, old.paid_cents)
  const status = input.status ?? old.status
  const checklist = input.checklist ?? safeParseChecklist(old.checklist_json)
  const precheck = input.precheck ?? safeParseChecklist(old.precheck_json)
  const partsConfirmed = input.parts_confirmed === undefined ? old.parts_confirmed : (input.parts_confirmed ? 1 : 0)
  const partsConfirmNote = input.parts_confirm_note ?? old.parts_confirm_note
  const now = nowIso()
  const completedAt = status === 'completed' ? now : null

  db.exec('BEGIN')
  try {
    restoreInventory(id, '编辑工单释放旧配件')
    db.prepare(`
      UPDATE orders SET
        customer_id = ?, staff_id = ?, template_id = ?, service_type = ?, status = ?, priority = ?, parts_source = ?,
        appointment_at = ?, address = ?, contact_name = ?, contact_phone = ?, description = ?,
        labor_fee_cents = ?, service_extra_cents = ?, travel_fee_cents = ?, material_fee_cents = ?, discount_cents = ?,
        total_cents = ?, cost_cents = ?, payment_method = ?, payment_status = ?,
        warranty_months = ?, checklist_json = ?, precheck_json = ?, parts_confirmed = ?, parts_confirm_note = ?,
        completed_at = COALESCE(completed_at, ?),
        updated_at = ?
      WHERE id = ?
    `).run(
      customer.id,
      input.staff_id ?? null,
      input.template_id ?? null,
      input.service_type ?? 'new',
      status,
      input.priority ?? 'normal',
      partsSource,
      input.appointment_at?.trim() || now.slice(0, 16),
      input.address?.trim() || customer.address,
      input.contact_name?.trim() || customer.name,
      input.contact_phone?.trim() || customer.phone,
      input.description?.trim() || '',
      labor,
      serviceExtra,
      travel,
      material,
      discount,
      total,
      cost,
      input.payment_method ?? old.payment_method,
      paymentStatus,
      Math.max(0, Math.round(input.warranty_months ?? 0)),
      JSON.stringify(checklist),
      JSON.stringify(precheck),
      partsConfirmed,
      partsConfirmNote,
      completedAt,
      now,
      id,
    )
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id)
    const insItem = db.prepare(`
      INSERT INTO order_items (order_id, part_id, name, spec, qty, unit_price_cents, cost_cents, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const item of items) {
      insItem.run(id, item.part_id, item.name, item.spec, item.qty, item.unit_price_cents, item.cost_cents, item.note)
    }
    deductInventory(id, items, partsSource, '编辑工单占用新配件')
    if (status === 'cancelled') restoreInventory(id, '取消工单释放库存')
    if (replaceServices) {
      db.prepare('DELETE FROM order_services WHERE order_id = ?').run(id)
      const insService = db.prepare(`
        INSERT INTO order_services (order_id, service_item_id, name, price_cents, qty, note)
        VALUES (?, ?, ?, ?, ?, ?)`)
      for (const service of serviceData.services) {
        insService.run(id, service.service_item_id, service.name, service.price_cents, service.qty, service.note)
      }
    }
    if (status !== old.status) {
      touchOrder(id, '状态变更', `${ORDER_STATUS_META[old.status].label} → ${ORDER_STATUS_META[status].label}`, operator, now)
    }
    touchOrder(id, '更新工单', `应收 ${(total / 100).toFixed(2)} 元`, operator, now)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return getOrderDetail(id)
}

export function getOrderDetail(id: number): OrderDetail {
  const row = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
           s.name AS staff_name, t.name AS template_name
    FROM active_orders o
    JOIN active_customers c ON c.id = o.customer_id
    LEFT JOIN staff s ON s.id = o.staff_id
    LEFT JOIN templates t ON t.id = o.template_id
    WHERE o.id = ?
  `).get(id) as (Record<string, unknown> & { checklist_json: string; customer_id: number; staff_id: number | null }) | undefined
  if (!row) throw new HttpError(404, '工单不存在')

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id) as unknown as OrderItem[]
  const services = db.prepare('SELECT * FROM order_services WHERE order_id = ? ORDER BY id').all(id) as unknown as OrderService[]
  const payments = db.prepare('SELECT * FROM order_payments WHERE order_id = ? ORDER BY paid_at, id').all(id) as unknown as OrderPayment[]
  const mediaRows = db.prepare('SELECT * FROM order_media WHERE order_id = ? ORDER BY id DESC').all(id) as {
    id: number; order_id: number; kind: 'image' | 'video' | 'file'; file_name: string; stored_name: string
    mime: string; size: number; category: 'before' | 'during' | 'after' | 'serial' | 'signature' | 'other'; caption: string; created_at: string
  }[]
  const media = mediaRows.map((m) => ({ ...m, url: `/uploads/${m.stored_name}` }))
  const logs = db.prepare('SELECT * FROM order_logs WHERE order_id = ? ORDER BY created_at DESC, id DESC').all(id)
  const customer = db.prepare('SELECT * FROM active_customers WHERE id = ?').get(row.customer_id) as unknown as OrderDetail['customer']
  const staff = row.staff_id
    ? (db.prepare('SELECT * FROM staff WHERE id = ?').get(row.staff_id) as unknown as OrderDetail['staff'])
    : null

  return {
    ...(row as unknown as OrderDetail),
    checklist: safeParseChecklist(row.checklist_json),
    precheck: safeParseChecklist((row as { precheck_json?: string }).precheck_json ?? '[]'),
    items,
    services,
    payments,
    media,
    logs: logs as unknown as OrderDetail['logs'],
    customer,
    staff,
  }
}

export function safeParseChecklist(json: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((i) => i && typeof i.label === 'string').map((i) => ({
      id: String(i.id ?? Math.random().toString(36).slice(2)),
      label: String(i.label),
      done: Boolean(i.done),
    }))
  } catch {
    return []
  }
}

export function changeStatus(id: number, status: OrderStatus, note = '', operator = '我'): OrderDetail {
  const row = db.prepare('SELECT status FROM active_orders WHERE id = ?').get(id) as { status: OrderStatus } | undefined
  if (!row) throw new HttpError(404, '工单不存在')
  if (!ORDER_STATUS_META[status]) throw new HttpError(422, '无效的工单状态')
  if (row.status === status) return getOrderDetail(id)
  const now = nowIso()
  db.prepare(`
    UPDATE orders SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END,
      updated_at = ? WHERE id = ?
  `).run(status, status, now, now, id)
  if (status === 'cancelled') {
    restoreInventory(id, '取消工单释放库存')
  } else if (row.status === 'cancelled') {
    const current = db.prepare('SELECT parts_source, inventory_applied FROM orders WHERE id = ?').get(id) as { parts_source: PartsSource; inventory_applied: number } | undefined
    if (current && !current.inventory_applied && current.parts_source !== 'customer') {
      const items = db.prepare('SELECT part_id, qty FROM order_items WHERE order_id = ?').all(id) as StockItem[]
      deductInventory(id, items, current.parts_source, '恢复工单重新占用库存')
    }
  }
  touchOrder(id, '状态变更', `${ORDER_STATUS_META[row.status].label} → ${ORDER_STATUS_META[status].label}${note ? ` · ${note}` : ''}`, operator, now)
  return getOrderDetail(id)
}

export function updatePayment(id: number, paidCents: number, method: string): OrderDetail {
  const row = db.prepare('SELECT paid_cents FROM active_orders WHERE id = ?').get(id) as { paid_cents: number } | undefined
  if (!row) throw new HttpError(404, '工单不存在')
  const target = Math.max(0, Math.round(paidCents))
  const delta = target - row.paid_cents
  if (delta === 0) return getOrderDetail(id)
  return addPayment(id, {
    kind: delta > 0 ? 'other' : 'refund',
    amount_cents: Math.abs(delta),
    method,
    note: '手动调整收款',
  })
}

export function replacePrecheck(
  id: number,
  precheck: ChecklistItem[],
  partsConfirmed?: boolean,
  note?: string,
): OrderDetail {
  const row = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '工单不存在')
  const now = nowIso()
  if (partsConfirmed === undefined) {
    db.prepare('UPDATE orders SET precheck_json = ?, parts_confirm_note = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(precheck), note ?? '', now, id)
  } else {
    db.prepare('UPDATE orders SET precheck_json = ?, parts_confirmed = ?, parts_confirm_note = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(precheck), partsConfirmed ? 1 : 0, note ?? '', now, id)
  }
  return getOrderDetail(id)
}

export function updateFollowUp(
  id: number,
  input: { follow_up_at: string; follow_up_note: string; rating: number },
  operator = '我',
): OrderDetail {
  const row = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '工单不存在')
  const rating = Math.max(0, Math.min(5, Math.round(input.rating)))
  const now = nowIso()
  db.prepare('UPDATE orders SET follow_up_at = ?, follow_up_note = ?, rating = ?, updated_at = ? WHERE id = ?')
    .run(input.follow_up_at?.trim() || now.slice(0, 10), input.follow_up_note?.trim() || '', rating, now, id)
  touchOrder(id, '记录回访', `${rating > 0 ? `${rating} 星 · ` : ''}${input.follow_up_note?.trim() || '已完成回访'}`, operator, now)
  return getOrderDetail(id)
}

export function replaceChecklist(id: number, checklist: ChecklistItem[]): OrderDetail {
  const row = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '工单不存在')
  const now = nowIso()
  db.prepare('UPDATE orders SET checklist_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(checklist), now, id)
  return getOrderDetail(id)
}

export function softDeleteOrder(id: number): void {
  const order = db.prepare('SELECT id FROM active_orders WHERE id = ?').get(id)
  if (!order) throw new HttpError(404, '工单不存在')
  restoreInventory(id, '删除工单释放库存')
  const now = nowIso()
  db.prepare('UPDATE orders SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

export function restoreOrder(id: number): OrderDetail {
  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND deleted_at <> ?').get(id, '')
  if (!order) throw new HttpError(404, '回收站里没有这张工单')
  db.prepare('UPDATE orders SET deleted_at = ?, updated_at = ? WHERE id = ?').run('', nowIso(), id)
  const restored = db.prepare('SELECT parts_source, status FROM orders WHERE id = ?').get(id) as { parts_source: PartsSource; status: OrderStatus }
  if (restored.status !== 'cancelled' && restored.parts_source !== 'customer') {
    const items = db.prepare('SELECT part_id, qty FROM order_items WHERE order_id = ?').all(id) as StockItem[]
    deductInventory(id, items, restored.parts_source, '恢复工单占用库存')
  }
  return getOrderDetail(id)
}

export function deleteOrder(id: number): string[] {
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(id)
  if (!order) throw new HttpError(404, '工单不存在')
  restoreInventory(id, '彻底删除工单释放库存')
  const files = db.prepare('SELECT stored_name FROM order_media WHERE order_id = ?').all(id) as { stored_name: string }[]
  db.prepare('DELETE FROM orders WHERE id = ?').run(id)
  return files.map((f) => f.stored_name)
}
