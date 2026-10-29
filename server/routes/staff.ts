import { z } from 'zod'
import { db, nowIso } from '../db'
import { HttpError, readJson, sendJson, sendNoContent, validate, type Ctx, type Router } from '../http'
import type { Staff } from '../../shared/types'

const staffSchema = z.object({
  name: z.string().trim().min(1, '请填写姓名').max(40),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(['owner', 'engineer', 'apprentice']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB').optional(),
  status: z.enum(['active', 'inactive']).optional(),
  commission_rate: z.coerce.number().int().min(0).max(100).optional(),
  hired_at: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
})

function getStaff(id: number): Staff {
  const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(id) as Staff | undefined
  if (!row) throw new HttpError(404, '员工不存在')
  return row
}

function listStaff(ctx: Ctx): void {
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM active_orders o WHERE o.staff_id = s.id) AS order_count,
      (SELECT COUNT(*) FROM active_orders o WHERE o.staff_id = s.id AND o.status IN ('completed', 'after_sales')) AS completed_count
    FROM staff s
    ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.id
  `).all()
  sendJson(ctx.res, rows)
}

function createStaff(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const b = validate(staffSchema, await readJson(ctx.req))
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO staff (name, phone, role, color, status, commission_rate, hired_at, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.name, b.phone ?? '', b.role ?? 'engineer', b.color ?? '#4f46e5', b.status ?? 'active', b.commission_rate ?? 0, b.hired_at ?? '', b.notes ?? '', now)
    sendJson(ctx.res, getStaff(Number(info.lastInsertRowid)), 201)
  })()
}

function updateStaff(ctx: Ctx): Promise<void> | void {
  return (async () => {
    const id = Number(ctx.params.id)
    const old = getStaff(id)
    const b = validate(staffSchema, await readJson(ctx.req))
    db.prepare(`
      UPDATE staff SET name = ?, phone = ?, role = ?, color = ?, status = ?, commission_rate = ?, hired_at = ?, notes = ? WHERE id = ?
    `).run(
      b.name, b.phone ?? old.phone, b.role ?? old.role, b.color ?? old.color,
      b.status ?? old.status, b.commission_rate ?? old.commission_rate, b.hired_at ?? old.hired_at, b.notes ?? old.notes, id,
    )
    sendJson(ctx.res, getStaff(id))
  })()
}

function deleteStaff(ctx: Ctx): void {
  const id = Number(ctx.params.id)
  getStaff(id)
  const used = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE staff_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new HttpError(409, `该员工关联了 ${used.c} 条工单，无法删除；可将状态改为「停用」`)
  db.prepare('DELETE FROM staff WHERE id = ?').run(id)
  sendNoContent(ctx.res)
}

export function registerStaffRoutes(router: Router): void {
  router.get('/api/staff', listStaff)
  router.post('/api/staff', createStaff)
  router.put('/api/staff/:id', updateStaff)
  router.delete('/api/staff/:id', deleteStaff)
}
