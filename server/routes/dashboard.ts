import { db, monthKey, todayStr } from '../db'
import { sendJson, type Ctx, type Router } from '../http'
import type { DashboardData, OrderStatus } from '../../shared/types'

function dashboard(ctx: Ctx): void {
  const today = todayStr()
  const month = today.slice(0, 7)

  const todayOrders = (db.prepare(`
    SELECT COUNT(*) AS c FROM active_orders WHERE date(appointment_at) = date(?) AND status != 'cancelled'
  `).get(today) as { c: number }).c

  const upcoming7 = (db.prepare(`
    SELECT COUNT(*) AS c FROM active_orders
    WHERE date(appointment_at) > date(?) AND date(appointment_at) <= date(?, '+7 days')
      AND status NOT IN ('cancelled', 'completed')
  `).get(today, today) as { c: number }).c

  const pendingCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM active_orders WHERE status IN ('pending', 'scheduled', 'en_route', 'working')
  `).get() as { c: number }).c

  const monthOrders = (db.prepare(`
    SELECT COUNT(*) AS c FROM active_orders WHERE strftime('%Y-%m', created_at) = ?
  `).get(month) as { c: number }).c

  const monthAgg = db.prepare(`
    SELECT COUNT(*) AS completed, COALESCE(SUM(total_cents), 0) AS revenue,
           COALESCE(SUM(total_cents - cost_cents), 0) AS profit
    FROM active_orders
    WHERE status IN ('completed', 'after_sales') AND strftime('%Y-%m', COALESCE(completed_at, appointment_at)) = ?
  `).get(month) as { completed: number; revenue: number; profit: number }

  const totalCustomers = (db.prepare('SELECT COUNT(*) AS c FROM active_customers').get() as { c: number }).c
  const partsCount = (db.prepare('SELECT COUNT(*) AS c FROM active_parts').get() as { c: number }).c
  const lowStockCount = (db.prepare("SELECT COUNT(*) AS c FROM active_parts WHERE status = 'active' AND stock <= min_stock").get() as { c: number }).c

  const trend: DashboardData['trend'] = []
  for (let offset = -5; offset <= 0; offset++) {
    const key = monthKey(offset)
    const row = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS revenue
      FROM active_orders WHERE status IN ('completed', 'after_sales') AND strftime('%Y-%m', COALESCE(completed_at, appointment_at)) = ?
    `).get(key) as { count: number; revenue: number }
    trend.push({ month: key, count: row.count, revenueCents: row.revenue })
  }

  const statusRows = db.prepare('SELECT status, COUNT(*) AS count FROM active_orders GROUP BY status').all() as { status: OrderStatus; count: number }[]

  const orderSelect = `
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS staff_name,
      t.name AS template_name,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
      (SELECT COUNT(*) FROM order_services sv WHERE sv.order_id = o.id) AS service_count,
      (SELECT COUNT(*) FROM order_media m WHERE m.order_id = o.id) AS media_count
    FROM active_orders o
    JOIN active_customers c ON c.id = o.customer_id
    LEFT JOIN staff s ON s.id = o.staff_id
    LEFT JOIN templates t ON t.id = o.template_id
  `
  const todaySchedule = db.prepare(`${orderSelect}
    WHERE date(o.appointment_at) = date(?) AND o.status != 'cancelled'
    ORDER BY o.appointment_at ASC, o.id ASC`).all(today)

  const upcomingSchedule = db.prepare(`${orderSelect}
    WHERE date(o.appointment_at) > date(?) AND date(o.appointment_at) <= date(?, '+7 days')
      AND o.status NOT IN ('cancelled', 'completed')
    ORDER BY o.appointment_at ASC, o.id ASC LIMIT 8`).all(today, today)

  const lowStock = db.prepare(`
    SELECT * FROM active_parts WHERE status = 'active' AND stock <= min_stock
    ORDER BY (stock - min_stock) ASC, stock ASC LIMIT 8
  `).all()

  const recentOrders = db.prepare(`${orderSelect} ORDER BY o.created_at DESC, o.id DESC LIMIT 6`).all()

  const staffRanking = db.prepare(`
    SELECT s.id, s.name, s.color, COUNT(o.id) AS count, COALESCE(SUM(o.total_cents), 0) AS revenueCents,
      CAST(COALESCE(SUM(o.total_cents), 0) * s.commission_rate / 100.0 AS INTEGER) AS commissionCents
    FROM active_orders o JOIN staff s ON s.id = o.staff_id
    WHERE o.status IN ('completed', 'after_sales') AND strftime('%Y-%m', COALESCE(o.completed_at, o.appointment_at)) = ?
    GROUP BY s.id ORDER BY revenueCents DESC LIMIT 5
  `).all(month)

  const reminders: DashboardData['reminders'] = []
  const todayRows = db.prepare(`
    SELECT o.id, o.order_no, o.appointment_at, c.name AS customer_name
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE date(o.appointment_at) = date(?) AND o.status IN ('pending', 'scheduled', 'en_route', 'working')
    ORDER BY o.appointment_at LIMIT 10
  `).all(today) as { id: number; order_no: string; appointment_at: string; customer_name: string }[]
  for (const row of todayRows) {
    reminders.push({
      id: `today-${row.id}`, kind: 'today', order_id: row.id,
      title: `今天 ${row.appointment_at.slice(11, 16)} 上门`,
      detail: `${row.customer_name} · ${row.order_no}`, tone: 'blue',
    })
  }

  const overdueRows = db.prepare(`
    SELECT o.id, o.order_no, o.appointment_at, c.name AS customer_name
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE date(o.appointment_at) < date(?) AND o.status IN ('pending', 'scheduled', 'en_route', 'working')
    ORDER BY o.appointment_at LIMIT 10
  `).all(today) as { id: number; order_no: string; appointment_at: string; customer_name: string }[]
  for (const row of overdueRows) {
    reminders.push({
      id: `overdue-${row.id}`, kind: 'overdue', order_id: row.id,
      title: `预约已过期待处理`,
      detail: `${row.appointment_at.slice(5, 10).replace('-', '/')} ${row.customer_name} · ${row.order_no}`, tone: 'red',
    })
  }

  const unpaidRows = db.prepare(`
    SELECT o.id, o.order_no, o.total_cents, o.paid_cents, c.name AS customer_name
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE o.status IN ('completed', 'after_sales') AND o.paid_cents < o.total_cents
    ORDER BY o.completed_at DESC LIMIT 10
  `).all() as { id: number; order_no: string; total_cents: number; paid_cents: number; customer_name: string }[]
  for (const row of unpaidRows) {
    reminders.push({
      id: `unpaid-${row.id}`, kind: 'unpaid', order_id: row.id,
      title: `待收 ¥${((row.total_cents - row.paid_cents) / 100).toFixed(0)}`,
      detail: `${row.customer_name} · ${row.order_no}`, tone: 'amber',
    })
  }

  const warrantyRows = db.prepare(`
    SELECT o.id, o.order_no, o.warranty_months, o.completed_at, c.name AS customer_name,
           date(o.completed_at, '+' || o.warranty_months || ' months') AS warranty_until
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE o.status IN ('completed', 'after_sales') AND o.warranty_months > 0 AND o.completed_at IS NOT NULL
      AND date(o.completed_at, '+' || o.warranty_months || ' months') BETWEEN date('now') AND date('now', '+30 days')
    ORDER BY warranty_until LIMIT 10
  `).all() as { id: number; order_no: string; customer_name: string; warranty_until: string }[]
  for (const row of warrantyRows) {
    reminders.push({
      id: `warranty-${row.id}`, kind: 'warranty', order_id: row.id,
      title: `保修 ${row.warranty_until.slice(5).replace('-', '/')} 到期`,
      detail: `${row.customer_name} · ${row.order_no}`, tone: 'violet',
    })
  }

  const followupRows = db.prepare(`
    SELECT o.id, o.order_no, o.completed_at, c.name AS customer_name
    FROM active_orders o JOIN active_customers c ON c.id = o.customer_id
    WHERE o.status IN ('completed', 'after_sales') AND o.completed_at IS NOT NULL AND o.follow_up_at = ''
      AND date(o.completed_at) <= date(?, '-7 days')
    ORDER BY o.completed_at LIMIT 10
  `).all(today) as { id: number; order_no: string; customer_name: string }[]
  for (const row of followupRows) {
    reminders.push({
      id: `followup-${row.id}`, kind: 'followup', order_id: row.id,
      title: '该回访了',
      detail: `${row.customer_name} · ${row.order_no} · 完工 7 天以上`, tone: 'blue',
    })
  }

  const data: DashboardData = {
    stats: {
      todayOrders,
      upcoming7,
      pendingCount,
      monthOrders,
      monthCompleted: monthAgg.completed,
      monthRevenueCents: monthAgg.revenue,
      monthProfitCents: monthAgg.profit,
      totalCustomers,
      partsCount,
      lowStockCount,
    },
    trend,
    statusDistribution: statusRows,
    todaySchedule: todaySchedule as unknown as DashboardData['todaySchedule'],
    upcomingSchedule: upcomingSchedule as unknown as DashboardData['upcomingSchedule'],
    lowStock: lowStock as unknown as DashboardData['lowStock'],
    recentOrders: recentOrders as unknown as DashboardData['recentOrders'],
    staffRanking: staffRanking as unknown as DashboardData['staffRanking'],
    reminders,
  }
  sendJson(ctx.res, data)
}

export function registerDashboardRoutes(router: Router): void {
  router.get('/api/dashboard', dashboard)
}
