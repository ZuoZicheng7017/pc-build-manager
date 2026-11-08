import fs from 'node:fs'
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx'
import type { OrderDetail, Settings } from '../shared/types'
import { CUSTOMER_LEVEL_LABELS, PARTS_SOURCE_LABELS, PAYMENT_METHOD_LABELS, SERVICE_TYPE_LABELS } from '../shared/types'
import { resolveUpload } from './helpers'

const FONT = '微软雅黑'
const BLACK = '000000'

function money(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

function when(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—'
}

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function run(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({ text, bold: opts.bold, size: opts.size ?? 21, color: opts.color ?? BLACK, font: FONT })
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 80, line: 300 },
    children: [run(text, { bold: opts.bold, size: opts.size })],
  })
}

const border = { style: BorderStyle.SINGLE, size: 8, color: BLACK }
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number; shade?: string } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: opts.align, children: [run(text, { bold: opts.bold, size: 19 })] })],
  })
}

function table(rows: string[][], widths: number[], header = true): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: rows.map((row, index) => new TableRow({
      children: row.map((value, column) => cell(value, {
        bold: header && index === 0,
        shade: header && index === 0 ? 'E5E5E5' : undefined,
        width: widths[column],
        align: column === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
      })),
    })),
  })
}

export async function buildAcceptanceDocx(order: OrderDetail, settings: Settings): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [run(settings.shop_name || '装机管家', { bold: true, size: 34 })],
  }))
  children.push(p(`电话：${settings.shop_phone || '—'}    地址：${settings.shop_address || '—'}`, { size: 19, after: 160 }))
  children.push(p('装机服务验收单', { bold: true, size: 38, align: AlignmentType.CENTER, after: 100 }))
  children.push(p(`单号：${order.order_no}    打印日期：${nowLocal()}`, { size: 19, align: AlignmentType.RIGHT, after: 160 }))

  const meta: string[][] = [
    ['客户', order.customer_name + (order.customer ? `（${CUSTOMER_LEVEL_LABELS[order.customer.level]}）` : ''), '联系电话', order.contact_phone || '—'],
    ['服务类型', SERVICE_TYPE_LABELS[order.service_type], '配件来源', PARTS_SOURCE_LABELS[order.parts_source]],
    ['预约时间', when(order.appointment_at), '装机师', order.staff_name || '—'],
    ['上门地址', order.address || '—', '质保', `${order.warranty_months} 个月`],
  ]
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: meta.map((row) => new TableRow({
      children: [
        cell(row[0], { bold: true, width: 14, shade: 'F2F2F2' }),
        cell(row[1], { width: 36 }),
        cell(row[2], { bold: true, width: 14, shade: 'F2F2F2' }),
        cell(row[3], { width: 36 }),
      ],
    })),
  }))
  children.push(p('', { after: 120 }))

  children.push(p('服务项目', { bold: true, size: 24, before: 80, after: 60 }))
  const serviceRows = [['服务', '数量', '单价', '小计']]
  if (order.services.length === 0) serviceRows.push(['标准上门服务', '1', money(order.labor_fee_cents), money(order.labor_fee_cents)])
  for (const s of order.services) serviceRows.push([s.name, String(s.qty), money(s.price_cents), money(s.price_cents * s.qty)])
  if (order.service_extra_cents > 0) serviceRows.push(['其他服务费', '1', money(order.service_extra_cents), money(order.service_extra_cents)])
  children.push(table(serviceRows, [52, 12, 18, 18]))

  if (order.items.length > 0) {
    children.push(p('配件明细', { bold: true, size: 24, before: 160, after: 60 }))
    const partRows = [['名称', '规格', '数量', '单价', '小计']]
    for (const item of order.items) {
      partRows.push([
        item.name,
        item.spec || '—',
        String(item.qty),
        order.parts_source === 'customer' ? '自备' : money(item.unit_price_cents),
        order.parts_source === 'customer' ? '¥0.00' : money(item.unit_price_cents * item.qty),
      ])
    }
    children.push(table(partRows, [34, 30, 10, 13, 13]))
  }

  children.push(p('费用合计', { bold: true, size: 24, before: 160, after: 60 }))
  const feeRows: string[][] = [
    ['服务费合计', money(order.labor_fee_cents)],
    ['上门费', money(order.travel_fee_cents)],
    ['材料费', money(order.material_fee_cents)],
    ['优惠', `-${money(order.discount_cents)}`],
    ['应收合计', money(order.total_cents)],
    ['已收', money(order.paid_cents)],
    ['待收', money(Math.max(0, order.total_cents - order.paid_cents))],
  ]
  children.push(new Table({
    width: { size: 62, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.RIGHT,
    borders,
    rows: feeRows.map((row, index) => new TableRow({
      children: [
        cell(row[0], { bold: true, width: 50, shade: 'F2F2F2' }),
        cell(row[1], { bold: index >= 4, width: 50 }),
      ],
    })),
  }))
  children.push(p(`收款方式：${PAYMENT_METHOD_LABELS[order.payment_method] || '—'}`, { size: 19, before: 80 }))

  if (order.precheck.length > 0) {
    children.push(p('上门前确认', { bold: true, size: 24, before: 160, after: 60 }))
    children.push(p(order.precheck.map((item) => `${item.done ? '☑' : '☐'} ${item.label}`).join('    '), { size: 19 }))
  }
  children.push(p('装机检查清单', { bold: true, size: 24, before: 140, after: 60 }))
  children.push(p(order.checklist.map((item) => `${item.done ? '☑' : '☐'} ${item.label}`).join('    '), { size: 19 }))

  if (order.description) {
    children.push(p('需求备注', { bold: true, size: 24, before: 140, after: 50 }))
    children.push(p(order.description, { size: 19 }))
  }

  children.push(p('售后说明', { bold: true, size: 24, before: 140, after: 50 }))
  children.push(p(`· 装机服务质保 ${order.warranty_months} 个月；人为损坏、超频、进水不在质保范围。`, { size: 18 }))
  children.push(p(
    order.parts_source === 'customer'
      ? '· 配件由客户自备，仅收取服务费；兼容性、DOA 与数据风险由客户承担。'
      : '· 配件质保按厂商政策执行。',
    { size: 18 },
  ))
  children.push(p('· 请当场核对配置、外观与运行状态，妥善保管本验收单。', { size: 18 }))

  children.push(p('客户签字：____________________          装机师签字：____________________', { size: 21, before: 260 }))
  children.push(p(`日期：${when(order.completed_at || order.appointment_at)}`, { size: 18 }))

  const signature = order.media.find((m) => m.category === 'signature')
  if (signature) {
    try {
      children.push(new Paragraph({
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(resolveUpload(signature.stored_name)), transformation: { width: 120, height: 48 } })],
      }))
    } catch { /* 签名文件缺失时留空 */ }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21, color: BLACK } } } },
    sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
  })
  return Packer.toBuffer(doc)
}
