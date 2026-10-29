import fs from 'node:fs'
import PDFDocument from 'pdfkit'
import type { OrderDetail, Settings } from '../shared/types'
import { PARTS_SOURCE_LABELS, PAYMENT_METHOD_LABELS, SERVICE_TYPE_LABELS } from '../shared/types'
import { resolveUpload } from './helpers'

const FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH || '',
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttf',
  'C:/Windows/Fonts/simsun.ttf',
]

function resolveFont(): string | null {
  for (const path of FONT_CANDIDATES) {
    if (path && fs.existsSync(path)) return path
  }
  return null
}

function yuan(cents: number): string {
  return `${(cents / 100).toFixed(2)} 元`
}

function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 16).replace('T', ' ')
}

export async function buildQuotePdf(order: OrderDetail, settings: Settings): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 44, bottom: 50, left: 46, right: 46 },
    bufferPages: true,
    info: { Title: `${order.order_no} 报价单`, Author: settings.shop_name || '装机管家' },
  })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const fontPath = resolveFont()
  const font = fontPath ? 'cn' : 'Helvetica'
  if (fontPath) {
    try { doc.registerFont('cn', fontPath) } catch { /* 字体加载失败时退回内置字体 */ }
  }

  const M = 46
  const W = 595.28 - M * 2
  const dark = '#0f172a'
  const muted = '#64748b'
  const line = '#e2e8f0'
  let y = 42

  doc.font(font)
  doc.fontSize(17).fillColor(dark).text(settings.shop_name || '装机管家', M, y, { width: W - 200 })
  doc.fontSize(8.5).fillColor(muted).text(settings.shop_phone || '', M, y + 24, { width: 180 })
  doc.text(settings.shop_address || '', M, y + 36, { width: 220 })
  doc.fontSize(9).fillColor(muted).text('报价单 / QUOTATION', M + W - 150, y + 2, { width: 150, align: 'right' })
  doc.fontSize(7.5).text(`单号 ${order.order_no}`, M + W - 170, y + 18, { width: 170, align: 'right' })
  doc.text(`日期 ${dateTime(order.created_at)}`, M + W - 170, y + 30, { width: 170, align: 'right' })
  y += 62
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.2).strokeColor(dark).stroke()
  y += 15

  doc.fontSize(15).fillColor(dark).text('上门服务报价单', M, y, { width: W })
  y += 24

  const meta = [
    ['客户', order.customer_name],
    ['联系电话', order.customer_phone || order.contact_phone],
    ['预约上门', dateTime(order.appointment_at)],
    ['服务类型', SERVICE_TYPE_LABELS[order.service_type]],
    ['配件来源', PARTS_SOURCE_LABELS[order.parts_source]],
    ['服务人员', order.staff_name || '本人'],
  ]
  const colW = W / 2
  for (let i = 0; i < meta.length; i += 2) {
    const left = meta[i]
    const right = meta[i + 1]
    if (!left) continue
    doc.fontSize(8.5).fillColor(muted).text(left[0] ?? '', M, y, { width: 55 })
    doc.fillColor(dark).text(left[1] ?? '—', M + 56, y, { width: colW - 64 })
    if (right) {
      doc.fillColor(muted).text(right[0] ?? '', M + colW, y, { width: 55 })
      doc.fillColor(dark).text(right[1] ?? '—', M + colW + 56, y, { width: colW - 64 })
    }
    y += 16
  }
  doc.fontSize(8.5).fillColor(muted).text('上门地址', M, y, { width: 55 })
  doc.fillColor(dark).text(order.address, M + 56, y, { width: W - 56 })
  y += 24

  const ensure = (need: number) => {
    if (y + need < 760) return
    doc.addPage()
    y = 50
    doc.font(font).fontSize(9).fillColor(muted).text('上门服务报价单（续）', M, y)
    y += 18
  }

  const tableHeader = (title: string, cols: { label: string; width: number; align?: 'left' | 'right' }[]) => {
    ensure(44)
    doc.fontSize(10).fillColor(dark).text(title, M, y)
    y += 16
    doc.rect(M, y, W, 22).fill(dark)
    let x = M
    doc.fontSize(8).fillColor('#ffffff')
    cols.forEach((col) => {
      doc.text(col.label, x + 5, y + 7, { width: col.width - 10, align: col.align ?? 'left' })
      x += col.width
    })
    y += 22
  }

  const tableRow = (values: string[], cols: { width: number; align?: 'left' | 'right' }[], index: number) => {
    ensure(24)
    if (index % 2 === 1) doc.rect(M, y, W, 21).fill('#f8fafc')
    let x = M
    doc.fontSize(8).fillColor(dark)
    values.forEach((value, i) => {
      doc.text(value, x + 5, y + 6, { width: cols[i].width - 10, align: cols[i].align ?? 'left', ellipsis: true, lineBreak: false })
      x += cols[i].width
    })
    doc.moveTo(M, y + 21).lineTo(M + W, y + 21).lineWidth(0.4).strokeColor(line).stroke()
    y += 21
  }

  const serviceCols = [
    { label: '服务项目', width: W - 190 },
    { label: '数量', width: 42, align: 'right' as const },
    { label: '单价', width: 70, align: 'right' as const },
    { label: '小计', width: 78, align: 'right' as const },
  ]
  tableHeader('服务项目', serviceCols)
  const serviceRows = order.services.length
    ? order.services.map((s) => [s.name, String(s.qty), yuan(s.price_cents), yuan(s.price_cents * s.qty)])
    : [['标准上门服务', '1', yuan(order.labor_fee_cents), yuan(order.labor_fee_cents)]]
  serviceRows.forEach((row, i) => tableRow(row, serviceCols, i))
  if (order.service_extra_cents > 0) tableRow(['其他服务费', '1', yuan(order.service_extra_cents), yuan(order.service_extra_cents)], serviceCols, serviceRows.length)

  if (order.items.length > 0) {
    y += 12
    const partCols = [
      { label: '配件', width: W - 190 },
      { label: '数量', width: 42, align: 'right' as const },
      { label: '单价', width: 70, align: 'right' as const },
      { label: '小计', width: 78, align: 'right' as const },
    ]
    tableHeader(order.parts_source === 'customer' ? '客户自备配件（仅记录，不计费）' : '配件明细', partCols)
    order.items.forEach((item, i) => tableRow([
      `${item.name}${item.spec ? ` / ${item.spec}` : ''}`,
      String(item.qty),
      order.parts_source === 'customer' ? '自备' : yuan(item.unit_price_cents),
      order.parts_source === 'customer' ? '¥0.00' : yuan(item.unit_price_cents * item.qty),
    ], partCols, i))
  }

  y += 14
  ensure(130)
  const boxX = M + W - 238
  const rows: [string, string][] = [
    ['服务费合计', yuan(order.labor_fee_cents)],
    ...(order.travel_fee_cents > 0 ? [['上门费', yuan(order.travel_fee_cents)] as [string, string]] : []),
    ...(order.material_fee_cents > 0 ? [['材料费', yuan(order.material_fee_cents)] as [string, string]] : []),
    ...(order.discount_cents > 0 ? [['优惠', `-${yuan(order.discount_cents)}`] as [string, string]] : []),
  ]
  doc.fontSize(8.5)
  rows.forEach(([label, value]) => {
    doc.fillColor(muted).text(label, boxX, y, { width: 120 })
    doc.fillColor(dark).text(value, boxX + 120, y, { width: 118, align: 'right' })
    y += 15
  })
  doc.moveTo(boxX, y + 2).lineTo(boxX + 238, y + 2).lineWidth(0.6).strokeColor(line).stroke()
  y += 9
  doc.fontSize(11).fillColor(dark).text('应收合计', boxX, y, { width: 120 })
  doc.fontSize(14).text(yuan(order.total_cents), boxX + 120, y - 2, { width: 118, align: 'right' })
  y += 28

  if (order.paid_cents > 0) {
    doc.fontSize(8.5).fillColor(muted).text(`已收 ${yuan(order.paid_cents)} · 待收 ${yuan(Math.max(0, order.total_cents - order.paid_cents))} · ${PAYMENT_METHOD_LABELS[order.payment_method] ?? ''}`, M, y, { width: W, align: 'right' })
    y += 20
  }

  if (order.description) {
    ensure(50)
    doc.fontSize(8.5).fillColor(muted).text('需求备注', M, y)
    y += 14
    doc.fillColor(dark).text(order.description, M, y, { width: W, height: 36, ellipsis: true })
    y += 42
  }

  ensure(112)
  doc.roundedRect(M, y, W, 78).fill('#f8fafc')
  doc.fontSize(8).fillColor(muted).text(
    `· 本报价按当前工单生成，服务费包含 ${order.services.length || 1} 项服务；配件由${PARTS_SOURCE_LABELS[order.parts_source]}。\n`
    + `· 整机服务质保 ${order.warranty_months} 个月；人为损坏、超频、进水不在质保范围。\n`
    + (order.parts_source === 'customer' ? '· 客户自备配件仅负责安装调试，配件兼容性、DOA 与数据风险由客户承担。\n' : '· 配件质保按厂商政策执行。\n')
    + '· 请在服务完成后当场核对外观、配置与运行状态。',
    M + 10, y + 10, { width: W - 20, lineGap: 3 },
  )
  y += 92

  const signature = order.media.find((m) => m.category === 'signature')
  ensure(80)
  doc.fontSize(8.5).fillColor(muted).text('客户确认', M, y)
  doc.text('服务人员', M + W / 2, y)
  if (signature) {
    try {
      doc.image(resolveUpload(signature.stored_name), M, y + 14, { fit: [130, 46] })
    } catch { /* 签名文件缺失时留空 */ }
  } else {
    doc.moveTo(M, y + 54).lineTo(M + 150, y + 54).lineWidth(0.6).strokeColor('#94a3b8').stroke()
  }
  doc.moveTo(M + W / 2, y + 54).lineTo(M + W / 2 + 130, y + 54).lineWidth(0.6).strokeColor('#94a3b8').stroke()
  doc.fontSize(7.5).fillColor(muted).text(`日期：${dateTime(order.completed_at || order.appointment_at)}`, M, y + 60)
  doc.text(`日期：${dateTime(order.completed_at || order.appointment_at)}`, M + W / 2, y + 60)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.fontSize(7).fillColor('#94a3b8').text(`${settings.shop_name || '装机管家'} · ${order.order_no} · 第 ${i + 1} / ${range.count} 页`, M, 780, { width: W, align: 'center', lineBreak: false })
  }

  doc.end()
  return finished
}
