import dayjs from 'dayjs'

export function money(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  const decimals = Number.isInteger(value) ? 0 : 2
  return '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })
}

export function moneyPlain(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  return value.toLocaleString('zh-CN', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })
}

export function compactMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  if (Math.abs(value) >= 10000) return `¥${(value / 10000).toFixed(value % 10000 === 0 ? 0 : 1)}万`
  return money(cents)
}

export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Math.round(value * 100)
  const n = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function moneyInput(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return '未设置'
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

export function fmtShortDateTime(value?: string | null): string {
  if (!value) return '待定'
  return dayjs(value).format('MM/DD HH:mm')
}

export function fmtDate(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('M月D日')
}

export function monthLabel(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('M月')
}

export function fmtFullDate(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('YYYY年M月D日')
}

export function fmtTime(value?: string | null): string {
  if (!value) return '--:--'
  return dayjs(value).format('HH:mm')
}

export function weekdayCN(value?: string | null): string {
  if (!value) return ''
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(value).day()]
}

export function dayNumber(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('DD')
}

export function monthDay(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('M/D')
}

export function relativeTime(value?: string | null): string {
  if (!value) return ''
  const then = dayjs(value)
  const minutes = dayjs().diff(then, 'minute')
  if (minutes < 0) return then.format('MM-DD HH:mm')
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return then.format('YYYY-MM-DD')
}

export function toDateInput(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export function toDateTimeInput(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 16)
}

export function defaultAppointment(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function nowDateTimeInput(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function marginPercent(costCents: number, saleCents: number): number {
  if (saleCents <= 0) return 0
  return Math.round(((saleCents - costCents) / saleCents) * 1000) / 10
}

export function initials(name: string): string {
  return (name || '?').trim().slice(0, 1).toUpperCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function currentDateLabel(): string {
  return `${dayjs().format('M月D日')} ${weekdayCN(dayjs().format('YYYY-MM-DD'))}`
}
