import { useEffect, useState } from 'react'
import { HardHat, Pencil, Phone, Plus, Trash2, TrendingUp } from 'lucide-react'
import type { Staff } from '../../shared/types'
import { STAFF_ROLES, STAFF_ROLE_LABELS } from '../../shared/types'
import { api, errorMessage, type StaffPayload } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { useFeedback } from '../lib/feedback'
import { Avatar, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard, Textarea } from '../components/ui'
import { StaffRoleBadge } from '../components/badges'

const COLORS = ['#4f46e5', '#0891b2', '#7c3aed', '#059669', '#d97706', '#e11d48', '#475569']
const empty: StaffPayload = { name: '', phone: '', role: 'engineer', color: '#4f46e5', status: 'active', commission_rate: 0, hired_at: '', notes: '' }

export default function StaffPage() {
  useDocTitle('员工')
  const { toast, confirm } = useFeedback()
  const { data, loading, error, reload } = useApi<Staff[]>(() => api.staff.list(), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState<StaffPayload>({ ...empty })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { name: editing.name, phone: editing.phone, role: editing.role, color: editing.color, status: editing.status, commission_rate: editing.commission_rate ?? 0, hired_at: editing.hired_at, notes: editing.notes }
      : { ...empty })
  }, [open, editing])

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写姓名', 'error')
      return
    }
    setSaving(true)
    try {
      if (editing) await api.staff.update(editing.id, form)
      else await api.staff.create(form)
      toast(editing ? '员工信息已更新' : '员工已添加')
      setOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (staff: Staff) => {
    const ok = await confirm({
      title: `删除员工「${staff.name}」？`,
      message: staff.order_count ? `该员工关联 ${staff.order_count} 条工单，无法删除，建议改为「停用」。` : '删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.staff.remove(staff.id)
      toast('员工已删除')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const active = data?.filter((s) => s.status === 'active') ?? []
  const totalOrders = data?.reduce((sum, s) => sum + (s.order_count ?? 0), 0) ?? 0

  return (
    <div>
      <PageHeader
        title="员工"
        description="记录每位装机师的角色与工单量，个人工作室也能管得清楚"
        actions={<Button onClick={() => { setEditing(null); setOpen(true) }}><Plus size={16} /> 添加员工</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="在职员工" value={active.length} hint={`共 ${data?.length ?? 0} 人`} icon={<HardHat size={18} />} tone="brand" />
        <StatCard label="累计工单" value={totalOrders} hint="包含所有状态" icon={<TrendingUp size={18} />} tone="violet" />
        <StatCard label="人均工单" value={active.length ? Math.round(totalOrders / active.length) : 0} hint="按在职员工计算" icon={<HardHat size={18} />} tone="emerald" />
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取员工…" />}

      {!error && data && data.length === 0 && (
        <div className="card"><EmptyState icon={<HardHat size={22} />} title="还没有员工" description="先添加自己或搭档，开单时就能指派。" action={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={14} /> 添加员工</Button>} /></div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((staff) => (
            <div key={staff.id} className={`card p-4 sm:p-5 ${staff.status === 'inactive' ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <Avatar name={staff.name} color={staff.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-slate-900">{staff.name}</span>
                    <StaffRoleBadge role={staff.role} />
                    {staff.status === 'inactive' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">已停用</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Phone size={11} className="text-slate-300" />{staff.phone || '未填电话'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{staff.hired_at ? `入职 ${staff.hired_at}` : '未填入职时间'}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setEditing(staff); setOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-100 hover:text-slate-600" aria-label="编辑"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(staff)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-600" aria-label="删除"><Trash2 size={14} /></button>
                </div>
              </div>

              {staff.notes && <p className="mt-3 line-clamp-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">{staff.notes}</p>}

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-[10px] text-slate-400">关联工单</p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-slate-800">{staff.order_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">已完成</p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-slate-800">{staff.completed_count ?? 0}</p>
                </div>
              </div>
              {(staff.commission_rate ?? 0) > 0 && <p className="mt-2 text-[10px] text-brand-600">提成比例 {staff.commission_rate}% · 报表自动计算</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑员工' : '添加员工'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} loading={saving}>保存</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="姓名" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="手机号"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="角色">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Staff['role'] })}>
              {STAFF_ROLES.map((role) => <option key={role} value={role}>{STAFF_ROLE_LABELS[role]}</option>)}
            </Select>
          </Field>
          <Field label="状态">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Staff['status'] })}>
              <option value="active">在职</option>
              <option value="inactive">停用</option>
            </Select>
          </Field>
          <Field label="提成比例（%）" hint="按已完工工单应收计算，0 表示不计算"><Input type="number" min={0} max={100} value={form.commission_rate ?? 0} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} inputMode="numeric" /></Field>
          <Field label="入职时间"><Input type="date" value={form.hired_at} onChange={(e) => setForm({ ...form, hired_at: e.target.value })} /></Field>
          <Field label="标识颜色">
            <div className="flex h-10 items-center gap-2">
              {COLORS.map((color) => (
                <button key={color} type="button" onClick={() => setForm({ ...form, color })} className={`h-6 w-6 rounded-full ring-2 ring-offset-2 transition ${form.color === color ? 'ring-slate-400' : 'ring-transparent'}`} style={{ backgroundColor: color }} aria-label={`选择颜色 ${color}`} />
              ))}
            </div>
          </Field>
          <Field label="备注" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="擅长领域、排班偏好…" /></Field>
        </div>
      </Modal>
    </div>
  )
}
