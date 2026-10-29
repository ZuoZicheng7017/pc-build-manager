import assert from 'node:assert/strict'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787'
let COOKIE = ''

function envPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD
  try {
    const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('APP_PASSWORD='))
    return line ? line.slice('APP_PASSWORD='.length).trim() : ''
  } catch { return '' }
}

const authStatus = await (await fetch(BASE + '/api/auth/status')).json()
if (authStatus.enabled) {
  const password = envPassword()
  assert.ok(password, '服务启用了访问密码，但 .env 中没有 APP_PASSWORD')
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  assert.equal(login.status, 200, '测试登录失败')
  COOKIE = (login.headers.get('set-cookie') || '').split(';')[0]
  assert.ok(COOKIE, '测试登录未拿到 Cookie')
}
const TODAY = new Date().toISOString().slice(0, 10)
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISP/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64',
)

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}), ...(options.headers || {}) },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { res, body }
}

const created = { part: null, customer: null, order: null, customerOrder: null, serviceOrder: null, template: null, staff: null, trashCustomer: null, trashPart: null }
let passed = 0
function ok(label) { passed += 1; console.log(`  ✓ ${label}`) }

try {
  console.log('基础接口')
  let r = await req('/api/health')
  assert.equal(r.res.status, 200)
  assert.equal(r.body.ok, true)
  ok('健康检查')

  r = await req('/api/dashboard')
  assert.equal(r.res.status, 200)
  assert.ok(Array.isArray(r.body.trend) && r.body.trend.length === 6)
  assert.ok(Array.isArray(r.body.reminders))
  ok('工作台聚合数据')

  r = await req('/api/auth/status')
  assert.equal(r.res.status, 200)
  assert.equal(typeof r.body.enabled, 'boolean')
  ok('登录状态接口')

  console.log('服务价目表')
  r = await req('/api/service-items/defaults', { method: 'POST' })
  assert.equal(r.res.status, 200)
  r = await req('/api/service-items?active=1')
  assert.ok(Array.isArray(r.body) && r.body.length >= 1, '服务项目为空')
  const service = r.body[0]
  ok('服务项目与常用服务')

  console.log('配件与价格历史')
  r = await req('/api/parts', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E 测试配件', category: '其他', cost_cents: 10000, sale_cents: 15000, stock: 2, min_stock: 1 }),
  })
  assert.equal(r.res.status, 201, JSON.stringify(r.body))
  created.part = r.body.id
  ok('创建配件')

  r = await req(`/api/parts/${created.part}/prices`)
  assert.equal(r.body.length, 1)
  r = await req(`/api/parts/${created.part}/price`, {
    method: 'PUT',
    body: JSON.stringify({ cost_cents: 12000, sale_cents: 18000, note: 'E2E 调价' }),
  })
  assert.equal(r.res.status, 200)
  assert.equal(r.body.sale_cents, 18000)
  r = await req(`/api/parts/${created.part}/prices`)
  assert.equal(r.body.length, 2)
  assert.equal(r.body[0].note, 'E2E 调价')
  ok('调价写入价格历史')

  console.log('客户 / 工单 / 关联校验')
  r = await req('/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E 测试客户', phone: '130-0000-0000', address: '测试路 1 号', district: '测试区' }),
  })
  assert.equal(r.res.status, 201)
  created.customer = r.body.id

  r = await req(`/api/customers/${created.customer}/addresses`)
  assert.ok(Array.isArray(r.body) && r.body.length === 1)
  assert.equal(r.body[0].is_default, 1)
  r = await req(`/api/customers/${created.customer}/addresses`, {
    method: 'POST',
    body: JSON.stringify({ label: '公司', address: '测试市公司路 2 号', is_default: 1 }),
  })
  assert.equal(r.res.status, 201)
  assert.equal(r.body.is_default, 1)
  r = await req(`/api/customers/${created.customer}/addresses`)
  assert.equal(r.body.length, 2)
  ok('创建客户 + 多地址')

  r = await req('/api/staff', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E 提成员工', commission_rate: 20 }),
  })
  assert.equal(r.res.status, 201)
  created.staff = r.body.id
  assert.equal(r.body.commission_rate, 20)
  ok('员工提成比例')

  r = await req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: created.customer,
      staff_id: created.staff,
      appointment_at: `${TODAY}T10:00`,
      labor_fee_cents: 10000,
      travel_fee_cents: 5000,
      items: [{ part_id: created.part, qty: 1, unit_price_cents: 18000 }],
    }),
  })
  assert.equal(r.res.status, 201, JSON.stringify(r.body))
  created.order = r.body.id
  assert.equal(r.body.total_cents, 33000)
  assert.equal(r.body.cost_cents, 12000)
  assert.equal(r.body.items.length, 1)
  const quote = await fetch(`${BASE}/api/orders/${created.order}/quote.pdf`, { headers: { Cookie: COOKIE } })
  const quoteBytes = Buffer.from(await quote.arrayBuffer())
  assert.equal(quote.status, 200)
  assert.match(quote.headers.get('content-type') || '', /application\/pdf/)
  assert.equal(quoteBytes.subarray(0, 4).toString(), '%PDF')
  assert.ok(quoteBytes.length > 5000)
  ok('服务端报价单 PDF')
  r = await req(`/api/parts/${created.part}`)
  assert.equal(r.body.stock, 1, '下单未扣库存')
  r = await req(`/api/parts/${created.part}/movements`)
  assert.equal(r.body[0].kind, 'order_out')
  assert.equal(r.body[0].qty, -1)
  ok('创建工单并计算金额 + 自动扣库存')

  r = await req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: created.customer,
      parts_source: 'customer',
      appointment_at: `${TODAY}T11:00`,
      labor_fee_cents: 20000,
      travel_fee_cents: 0,
      items: [{ name: '客户自带显卡', spec: '客户自备', qty: 1, unit_price_cents: 500000, cost_cents: 400000 }],
    }),
  })
  assert.equal(r.res.status, 201, JSON.stringify(r.body))
  created.customerOrder = r.body.id
  assert.equal(r.body.parts_source, 'customer')
  assert.equal(r.body.total_cents, 20000, '客户自备单不应计配件费')
  assert.equal(r.body.cost_cents, 0)
  assert.equal(r.body.items[0].unit_price_cents, 0)
  ok('客户自备配件只收服务费')

  r = await req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: created.customer,
      parts_source: 'customer',
      appointment_at: `${TODAY}T12:00`,
      services: [{ service_item_id: service.id, qty: 1 }],
      service_extra_cents: 1000,
      travel_fee_cents: 0,
      precheck: [{ id: 'cpu', label: 'CPU 接口与主板一致', done: true }],
      parts_confirmed: true,
      parts_confirm_note: 'E2E 已确认',
    }),
  })
  assert.equal(r.res.status, 201, JSON.stringify(r.body))
  created.serviceOrder = r.body.id
  assert.equal(r.body.services.length, 1)
  assert.equal(r.body.total_cents, service.price_cents + 1000)
  assert.equal(r.body.parts_confirmed, 1)
  assert.equal(r.body.precheck.length, 1)

  r = await req(`/api/orders/${created.serviceOrder}/payments`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'deposit', amount_cents: 5000, method: 'xianyu', note: '闲鱼定金' }),
  })
  assert.equal(r.body.paid_cents, 5000)
  assert.equal(r.body.payment_status, 'partial')
  assert.equal(r.body.payments.length, 1)
  assert.equal(r.body.payments[0].method, 'xianyu')

  r = await req(`/api/orders/${created.serviceOrder}/payments`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'refund', amount_cents: 5000, method: 'wechat', note: '退款' }),
  })
  assert.equal(r.body.paid_cents, 0)
  assert.equal(r.body.payment_status, 'unpaid')
  assert.equal(r.body.payments.length, 2)
  ok('服务项目计费 + 定金/退款流水')

  r = await req(`/api/orders/${created.serviceOrder}/precheck`, {
    method: 'PATCH',
    body: JSON.stringify({
      precheck: [{ id: 'cpu', label: 'CPU 接口与主板一致', done: true }, { id: 'ram', label: '内存代数一致', done: false }],
      parts_confirmed: false,
      parts_confirm_note: '待确认',
    }),
  })
  assert.equal(r.body.precheck.length, 2)
  assert.equal(r.body.parts_confirmed, 0)
  ok('上门前检查清单与风险确认')

  r = await req(`/api/orders/${created.serviceOrder}/share`, { method: 'POST' })
  assert.equal(r.res.status, 200)
  assert.equal(r.body.token.length, 36)
  const token = r.body.token
  r = await req(`/api/share/${token}`)
  assert.equal(r.res.status, 200)
  assert.match(r.body.order.order_no, /^SO/)
  assert.equal(r.body.services.length, 1)
  assert.equal(r.body.order.cost_cents, undefined)
  ok('客户分享链接（只读、不含内部成本）')

  r = await req(`/api/orders/${created.serviceOrder}/share`, { method: 'DELETE' })
  assert.equal(r.res.status, 204)
  assert.equal((await req(`/api/share/${token}`)).res.status, 404)
  r = await req(`/api/orders/${created.serviceOrder}/share`, { method: 'POST' })
  assert.equal(r.res.status, 200)
  ok('分享链接撤销后立即失效')

  r = await req(`/api/orders/${created.serviceOrder}`, { method: 'DELETE' })
  assert.equal(r.res.status, 204)
  assert.equal((await req(`/api/orders/${created.serviceOrder}`)).res.status, 404)
  r = await req('/api/trash/orders')
  assert.ok(r.body.some((o) => o.id === created.serviceOrder))
  r = await req(`/api/trash/orders/${created.serviceOrder}/restore`, { method: 'POST' })
  assert.equal(r.res.status, 200)
  assert.equal(r.body.id, created.serviceOrder)
  ok('工单软删除 → 回收站 → 恢复')

  r = await req('/api/customers', { method: 'POST', body: JSON.stringify({ name: 'E2E 回收站客户', phone: '13000009999' }) })
  created.trashCustomer = r.body.id
  r = await req(`/api/customers/${created.trashCustomer}`, { method: 'DELETE' })
  assert.equal(r.res.status, 204)
  assert.equal((await req(`/api/customers/${created.trashCustomer}`)).res.status, 404)
  r = await req('/api/trash/customers')
  assert.ok(r.body.some((c) => c.id === created.trashCustomer))
  r = await req(`/api/trash/customers/${created.trashCustomer}/restore`, { method: 'POST' })
  assert.equal(r.res.status, 200)
  ok('客户软删除 → 回收站 → 恢复')

  r = await req('/api/parts', { method: 'POST', body: JSON.stringify({ name: 'E2E 回收站配件', stock: 1 }) })
  created.trashPart = r.body.id
  r = await req(`/api/parts/${created.trashPart}`, { method: 'DELETE' })
  assert.equal(r.res.status, 204)
  assert.equal((await req(`/api/parts/${created.trashPart}`)).res.status, 404)
  r = await req('/api/trash/parts')
  assert.ok(r.body.some((p) => p.id === created.trashPart))
  r = await req(`/api/trash/parts/${created.trashPart}/restore`, { method: 'POST' })
  assert.equal(r.res.status, 200)
  ok('配件软删除 → 回收站 → 恢复')

  r = await req(`/api/customers/${created.customer}`, { method: 'DELETE' })
  assert.equal(r.res.status, 409)
  ok('有工单的客户禁止删除')

  r = await req(`/api/parts/${created.part}?hard=1`, { method: 'DELETE' })
  assert.equal(r.res.status, 409)
  ok('被工单引用的配件禁止彻底删除')

  r = await req(`/api/orders/${created.order}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) })
  assert.equal(r.body.status, 'completed')
  assert.ok(r.body.completed_at)
  r = await req(`/api/orders/${created.order}/payment`, { method: 'PATCH', body: JSON.stringify({ paid_cents: 33000, payment_method: 'cash' }) })
  assert.equal(r.body.payment_status, 'paid')
  r = await req(`/api/orders/${created.order}/followup`, {
    method: 'PATCH',
    body: JSON.stringify({ follow_up_at: TODAY, follow_up_note: 'E2E 回访正常', rating: 5 }),
  })
  assert.equal(r.body.rating, 5)
  assert.ok(r.body.follow_up_at)
  ok('状态流转与收款结清 + 回访记录')

  console.log('媒体上传校验与 Range')
  r = await fetch(`${BASE}/api/orders/${created.order}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/svg+xml', 'X-File-Name': 'bad.svg', Cookie: COOKIE },
    body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  })
  assert.equal(r.status, 415)
  ok('拒绝 SVG 上传（XSS 防护）')

  const uploaded = await fetch(`${BASE}/api/orders/${created.order}/media?category=serial`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'range-test.jpg', Cookie: COOKIE },
    body: JPEG,
  })
  assert.equal(uploaded.status, 201)
  const media = await uploaded.json()
  assert.equal(media.category, 'serial')
  const range = await fetch(BASE + media.url, { headers: { Range: 'bytes=0-99' } })
  assert.equal(range.status, 206)
  assert.match(range.headers.get('content-range') || '', /^bytes 0-99\//)
  assert.equal((await range.arrayBuffer()).byteLength, 100)
  ok('媒体分类与 Range')

  r = await req('/api/reports?months=1')
  assert.equal(r.res.status, 200)
  assert.ok(Array.isArray(r.body.monthly) && r.body.monthly.length === 1)
  assert.ok(r.body.stats.orders >= 1)
  assert.ok(Array.isArray(r.body.services))
  assert.ok(Array.isArray(r.body.staff) && r.body.staff.length >= 1)
  assert.ok(r.body.staff.some((s) => s.commissionCents > 0))
  ok('经营报表 + 员工提成')

  console.log('模板接口')
  r = await req('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E 测试配置', purpose: 'office', budget_cents: 500000, labor_fee_cents: 20000, items: [{ part_id: created.part, qty: 2, unit_price_cents: 0 }] }),
  })
  assert.equal(r.res.status, 201)
  created.template = r.body.id
  assert.equal(r.body.total_cents, 20000 + 36000)
  ok('创建配置并按当前售价汇总')

  r = await req(`/api/templates/${created.template}`, { method: 'PUT', body: JSON.stringify({ name: 'E2E 测试配置改', purpose: 'office', labor_fee_cents: 10000, items: [{ part_id: created.part, qty: 1 }] }) })
  assert.equal(r.body.name, 'E2E 测试配置改')
  assert.equal(r.body.total_cents, 28000)
  ok('更新配置')

  console.log('备份与导出')
  r = await req('/api/settings')
  assert.equal(r.res.status, 200)
  assert.ok(r.body.shop_name)
  const settings = r.body
  r = await req('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
  assert.equal(r.res.status, 200)
  ok('读取 / 保存设置')

  const backup = await fetch(`${BASE}/api/backup`, { headers: { Cookie: COOKIE } })
  assert.equal(backup.status, 200)
  assert.match(backup.headers.get('content-type') || '', /application\/zip/)
  const zip = Buffer.from(await backup.arrayBuffer())
  assert.ok(zip.length > 1000)
  assert.equal(zip.subarray(0, 2).toString(), 'PK')
  ok('完整备份下载（zip 含数据库 + 媒体）')

  const exportRes = await fetch(`${BASE}/api/export`, { headers: { Cookie: COOKIE } })
  assert.equal(exportRes.status, 200)
  const data = await exportRes.json()
  assert.ok(Array.isArray(data.orders) && Array.isArray(data.parts))
  assert.equal(data.app, '装机管家')
  ok('全量 JSON 导出')

  console.log(`\nAPI 冒烟测试通过：${passed} 项`)
} catch (err) {
  console.error('\nAPI 冒烟测试失败:', err.message)
  process.exitCode = 1
} finally {
  if (created.customerOrder) await req(`/api/orders/${created.customerOrder}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.serviceOrder) await req(`/api/orders/${created.serviceOrder}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.order) await req(`/api/orders/${created.order}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.staff) await req(`/api/staff/${created.staff}`, { method: 'DELETE' }).catch(() => {})
  if (created.template) await req(`/api/templates/${created.template}`, { method: 'DELETE' }).catch(() => {})
  if (created.part) await req(`/api/parts/${created.part}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.trashPart) await req(`/api/parts/${created.trashPart}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.trashCustomer) await req(`/api/customers/${created.trashCustomer}?hard=1`, { method: 'DELETE' }).catch(() => {})
  if (created.customer) await req(`/api/customers/${created.customer}?hard=1`, { method: 'DELETE' }).catch(() => {})
  console.log('测试数据已清理')
}
