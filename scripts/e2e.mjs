import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787'
const OUT = '.shots'
fs.mkdirSync(OUT, { recursive: true })

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISP/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64',
)

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let createdOrderId = null
let createdCustomerId = null

function envPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD
  try {
    const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('APP_PASSWORD='))
    return line ? line.slice('APP_PASSWORD='.length).trim() : ''
  } catch { return '' }
}

const auth = await (await page.request.get(`${BASE}/api/auth/status`)).json()
if (auth.enabled) {
  const response = await page.request.post(`${BASE}/api/auth/login`, { data: { username: process.env.APP_USERNAME || 'xiaozuozhuangji', password: envPassword() } })
  assert.equal(response.status(), 200, 'E2E 登录失败')
}

try {
  console.log('1. 建立测试客户')
  const customerRes = await page.request.post(`${BASE}/api/customers`, {
    data: { name: 'E2E 自备客户', phone: '130-0000-0000', address: 'E2E 测试路 1 号 2 单元 301', district: '测试区' },
  })
  assert.equal(customerRes.status(), 201)
  const customer = await customerRes.json()
  createdCustomerId = customer.id

  await page.request.post(`${BASE}/api/service-items/defaults`)
  const servicesRes = await page.request.get(`${BASE}/api/service-items?active=1`)
  const services = await servicesRes.json()
  assert.ok(services.length > 0, '没有可用服务项目')
  const service = services[0]

  console.log('2. 打开新建工单，确认默认客户自备与服务费')
  await page.goto(`${BASE}/orders/new?customer=${customer.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  assert.ok(await page.getByText('客户自备配件不计费，本单只收取装机服务费').isVisible(), '未显示客户自备提示')
  assert.ok(await page.getByText('只收装机费').isVisible(), '未显示只收装机费')
  const address = await page.locator('textarea').first().inputValue()
  assert.ok(address.includes('E2E 测试路'), `地址未带出: ${address}`)

  console.log('3. 勾选上门前确认并保存')
  await page.getByRole('button', { name: /CPU 接口与主板一致/ }).click()
  await page.locator('label').filter({ hasText: '已向客户说明' }).locator('input').check()
  await page.getByRole('button', { name: '保存工单' }).first().click()
  await page.waitForURL(/\/orders\/\d+$/, { timeout: 15000 })
  createdOrderId = Number(page.url().split('/').pop())
  await page.waitForTimeout(500)

  const detail = await (await page.request.get(`${BASE}/api/orders/${createdOrderId}`)).json()
  assert.equal(detail.parts_source, 'customer', '配件来源不是客户自备')
  assert.equal(detail.total_cents, service.price_cents, `应收错误: ${detail.total_cents}`)
  assert.equal(detail.cost_cents, 0)
  assert.equal(detail.labor_fee_cents, service.price_cents)
  assert.equal(detail.services.length, 1)
  assert.equal(detail.parts_confirmed, 1)
  assert.equal(detail.precheck.filter((i) => i.done).length, 1)
  assert.equal(detail.items.length, 0)
  console.log(`   工单 #${createdOrderId}：客户自备，服务费 ¥${detail.total_cents / 100}`)

  console.log('4. 详情页显示自备、服务项目与上门前确认')
  assert.ok(await page.getByText('只收装机服务费').first().isVisible())
  assert.ok(await page.getByText('客户自备配件（未登记型号）').isVisible())
  assert.ok(await page.getByText('上门前确认').first().isVisible())

  console.log('5. 上传现场图片')
  await page.locator('input[type=file][accept="image/*"]').last().setInputFiles({
    name: 'e2e-test.jpg', mimeType: 'image/jpeg', buffer: JPEG,
  })
  await page.waitForResponse((r) => r.url().includes(`/api/orders/${createdOrderId}/media`) && r.status() === 201, { timeout: 20000 })
  await page.waitForTimeout(600)
  const withMedia = await (await page.request.get(`${BASE}/api/orders/${createdOrderId}`)).json()
  assert.equal(withMedia.media.length, 1, '媒体未写入')

  console.log('6. 勾选检查清单')
  await page.getByRole('button', { name: /核对配件型号与数量/ }).click()
  await page.waitForTimeout(600)
  const checked = await (await page.request.get(`${BASE}/api/orders/${createdOrderId}`)).json()
  assert.equal(checked.checklist[0].done, true, '检查项未保存')

  console.log('7. 记录一笔部分收款')
  await page.getByRole('button', { name: '收款记录' }).click()
  const payDialog = page.getByRole('dialog').filter({ hasText: '收款记录' })
  await payDialog.locator('input[inputmode="decimal"]').fill('100')
  await payDialog.getByRole('button', { name: '记录收款' }).click()
  await page.waitForTimeout(600)
  const paid = await (await page.request.get(`${BASE}/api/orders/${createdOrderId}`)).json()
  assert.equal(paid.paid_cents, 10000, '收款未保存')
  assert.equal(paid.payment_status, 'partial')
  assert.equal(paid.payments.length, 1)

  console.log('8. 状态流转到已预约')
  await page.getByRole('button', { name: /下一步：已预约/ }).click()
  await page.waitForTimeout(600)
  const scheduled = await (await page.request.get(`${BASE}/api/orders/${createdOrderId}`)).json()
  assert.equal(scheduled.status, 'scheduled')
  assert.ok(scheduled.logs.some((l) => l.action === '状态变更'))

  console.log('9. 打印页显示“客户自备”与服务项目')
  await page.goto(`${BASE}/orders/${createdOrderId}/print`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  assert.ok((await page.getByText('装机服务验收单').count()) > 0)
  assert.ok((await page.getByText('客户自备', { exact: true }).count()) > 0)
  assert.ok((await page.getByText('服务项目', { exact: true }).count()) > 0)
  await page.screenshot({ path: `${OUT}/e2e-print.png` })

  console.log('10. 删除到回收站并恢复')
  await page.goto(`${BASE}/orders/${createdOrderId}`, { waitUntil: 'networkidle' })
  await page.locator('button[aria-label="删除工单"]').click()
  await page.getByRole('button', { name: '移入回收站' }).click()
  await page.waitForURL(/\/orders$/, { timeout: 10000 })
  const after = await page.request.get(`${BASE}/api/orders/${createdOrderId}`)
  assert.equal(after.status(), 404, '工单未删除')
  await page.goto(`${BASE}/trash`, { waitUntil: 'networkidle' })
  const trashCard = page.locator('.card').filter({ hasText: detail.order_no }).first()
  assert.ok(await trashCard.isVisible(), '回收站里没有工单')
  await trashCard.getByRole('button', { name: '恢复' }).click()
  await page.waitForTimeout(500)
  const restored = await page.request.get(`${BASE}/api/orders/${createdOrderId}`)
  assert.equal(restored.status(), 200, '回收站恢复失败')
  await page.request.delete(`${BASE}/api/orders/${createdOrderId}?hard=1`)
  createdOrderId = null

  console.log('11. 移动端布局与底部导航')
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const navCount = await mobile.locator('nav.fixed a, nav.fixed button').count()
  assert.equal(navCount, 5, `底部导航项数 ${navCount}`)
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(overflow <= 1, `移动端横向溢出 ${overflow}px`)
  await mobile.getByRole('button', { name: '更多' }).click()
  await mobile.waitForTimeout(200)
  assert.ok((await mobile.getByText('员工', { exact: true }).count()) > 0)

  await mobile.goto(`${BASE}/orders/new`, { waitUntil: 'networkidle' })
  const sticky = mobile.locator('div.fixed.inset-x-0').filter({ hasText: '保存工单' }).last()
  const stickyBox = await sticky.boundingBox()
  const navBox = await mobile.locator('nav.fixed').boundingBox()
  assert.ok(stickyBox && navBox && stickyBox.y + stickyBox.height <= navBox.y + 1, '保存条与底部导航重叠')
  await mobile.screenshot({ path: `${OUT}/e2e-mobile-form.png` })
  await mobile.close()

  console.log('\nE2E 全部通过')
} catch (err) {
  console.error('\nE2E 失败:', err.message)
  await page.screenshot({ path: `${OUT}/e2e-failure.png`, fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  if (createdOrderId) {
    await page.request.delete(`${BASE}/api/orders/${createdOrderId}?hard=1`).catch(() => {})
    console.log(`已清理测试工单 #${createdOrderId}`)
  }
  if (createdCustomerId) {
    await page.request.delete(`${BASE}/api/customers/${createdCustomerId}?hard=1`).catch(() => {})
    console.log(`已清理测试客户 #${createdCustomerId}`)
  }
  if (errors.length) console.log('浏览器错误:', errors)
  await browser.close()
}
