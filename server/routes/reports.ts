import dayjs from 'dayjs'
import { db } from '../db'
import { queryInt, sendJson, type Ctx, type Router } from '../http'
import type { ReportData } from '../../shared/types'

function report(ctx: Ctx): void {
  const months = queryInt(ctx.url, 'months', 6, 1, 24)
  const end = dayjs().endOf('month')
  const start = end.subtract(months - 1, 'month').startOf('month')
  const from = start.format('YYYY-MM-DD')
  const to = end.format('YYYY-MM-DD')

  const statsRow = db.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN total_cents ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN cost_cents ELSE 0 END), 0) AS cost,
      COALESCE(SUM(CASE WHEN status IN ('completed', 'after_sales') THEN MAX(total_cents - paid_cents, 0) ELSE 0 END), 0) AS unpaid
    FROM active_orders
    WHERE date(appointment_at) BETWEEN date(?) AND date(?)
  `).get(from, to) as { orders: number; completed: number; revenue: number; cost: number; unpaid: number }

  const monthly: ReportData['monthly'] = []
  for (let i = months - 1; i >= 0; i--) {
    const month = dayjs().subtract(i, 'month').format('YYYY-MM')
    const row = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS revenue
      FROM active_orders WHERE status IN ('completed', 'after_sales') AND strftime('%Y-%m', COALESCE(completed_at, appointment_at)) = ?
    `).get(month) as { count: number; revenue: number }
    monthly.push({ month, count: row.count, revenueCents: row.revenue })
  }

  const services = db.prepare(`
    SELECT os.name, SUM(os.qty) AS qty, SUM(os.qty * os.price_cents) AS revenue
    FROM order_services os JOIN active_orders o ON o.id = os.order_id
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY os.name ORDER BY revenue DESC LIMIT 10
  `).all(from, to) as { name: string; qty: number; revenue: number }[]
  const extraRow = db.prepare(`
    SELECT COALESCE(SUM(service_extra_cents), 0) AS revenue
    FROM active_orders WHERE status IN ('completed', 'after_sales') AND date(appointment_at) BETWEEN date(?) AND date(?)
  `).get(from, to) as { revenue: number }
  if (extraRow.revenue > 0) services.push({ name: '其他服务费', qty: 1, revenue: extraRow.revenue })

  const sources = db.prepare(`
    SELECT COALESCE(NULLIF(c.source, ''), '未填写') AS source, COUNT(*) AS count, COALESCE(SUM(o.total_cents), 0) AS revenue
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY source ORDER BY revenue DESC LIMIT 8
  `).all(from, to) as { source: string; count: number; revenue: number }[]

  const weekdays = db.prepare(`
    SELECT CAST(strftime('%w', o.appointment_at) AS INTEGER) AS weekday, COUNT(*) AS count, COALESCE(SUM(o.total_cents), 0) AS revenue
    FROM active_orders o
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY weekday ORDER BY weekday
  `).all(from, to) as { weekday: number; count: number; revenue: number }[]

  const hours = db.prepare(`
    SELECT CAST(strftime('%H', o.appointment_at) AS INTEGER) AS hour, COUNT(*) AS count
    FROM active_orders o
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY hour ORDER BY hour
  `).all(from, to) as { hour: number; count: number }[]

  const topCustomers = db.prepare(`
    SELECT c.id, c.name, COUNT(*) AS count, COALESCE(SUM(o.total_cents), 0) AS revenue
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY c.id ORDER BY revenue DESC LIMIT 6
  `).all(from, to) as { id: number; name: string; count: number; revenue: number }[]

  const staff = db.prepare(`
    SELECT s.id, s.name, s.color, COUNT(*) AS count, COALESCE(SUM(o.total_cents), 0) AS revenue,
      CAST(COALESCE(SUM(o.total_cents), 0) * s.commission_rate / 100.0 AS INTEGER) AS commission
    FROM active_orders o JOIN staff s ON s.id = o.staff_id
    WHERE o.status IN ('completed', 'after_sales') AND date(o.appointment_at) BETWEEN date(?) AND date(?)
    GROUP BY s.id ORDER BY revenue DESC
  `).all(from, to) as { id: number; name: string; color: string; count: number; revenue: number; commission: number }[]

  const data: ReportData = {
    range: { from, to, months },
    stats: {
      orders: statsRow.orders,
      completed: statsRow.completed,
      revenueCents: statsRow.revenue,
      costCents: statsRow.cost,
      profitCents: statsRow.revenue - statsRow.cost,
      avgTicketCents: statsRow.completed > 0 ? Math.round(statsRow.revenue / statsRow.completed) : 0,
      unpaidCents: statsRow.unpaid,
    },
    monthly,
    services: services.map((s) => ({ name: s.name, qty: s.qty, revenueCents: s.revenue })),
    sources: sources.map((s) => ({ source: s.source, count: s.count, revenueCents: s.revenue })),
    weekdays: weekdays.map((w) => ({ weekday: w.weekday, count: w.count, revenueCents: w.revenue })),
    hours,
    topCustomers: topCustomers.map((c) => ({ id: c.id, name: c.name, count: c.count, revenueCents: c.revenue })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.count, revenueCents: s.revenue, commissionCents: s.commission })),
  }
  sendJson(ctx.res, data)
}

export function registerReportRoutes(router: Router): void {
  router.get('/api/reports', report)
}
