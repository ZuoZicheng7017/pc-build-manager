import { useEffect, useState } from 'react'
import { Clock3, Pencil, Plus, Sparkles, Trash2, Wrench } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import { SERVICE_CATEGORIES } from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { money, moneyInput, parseMoney } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Badge, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea } from '../components/ui'

const empty = {
  name: '', category: '装机', price: '', duration: '60', description: '', status: 'active' as 'active' | 'inactive',
}

export default function Services() {
  useDocTitle('服务项目')
  const { toast, confirm } = useFeedback()
  const { data, loading, error, reload } = useApi<ServiceItem[]>(() => api.serviceItems.list(), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name, category: editing.category, price: moneyInput(editing.price_cents),
        duration: String(editing.duration_minutes), description: editing.description, status: editing.active,
      })
    } else {
      setForm({ ...empty })
    }
  }, [open, editing])

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写服务名称', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category: form.category,
        price_cents: parseMoney(form.price),
        duration_minutes: Number(form.duration) || 0,
        description: form.description,
        active: form.status,
      }
      if (editing) await api.serviceItems.update(editing.id, payload)
      else await api.serviceItems.create(payload)
      toast(editing ? '服务项目已更新' : '服务项目已添加')
      setOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const initDefaults = async () => {
    setInitializing(true)
    try {
      const result = await api.serviceItems.initDefaults()
      toast(result.added > 0 ? `已添加 ${result.added} 个常用服务，可按自己的价格修改` : '常用服务已存在')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setInitializing(false)
    }
  }

  const remove = async (item: ServiceItem) => {
    const ok = await confirm({
      title: `删除服务「${item.name}」？`,
      message: '已开出的工单会保留服务名称和价格快照，不受影响。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.serviceItems.remove(item.id)
      toast('服务项目已删除')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const activeCount = data?.filter((s) => s.active === 'active').length ?? 0
  const average = activeCount > 0
    ? Math.round((data ?? []).filter((s) => s.active === 'active').reduce((sum, s) => sum + s.price_cents, 0) / activeCount)
    : 0

  return (
    <div>
      <PageHeader
        title="服务项目"
        description="把上门装机、装系统、清灰、加收项目做成价目表，开单时勾选自动算服务费"
        actions={
          <>
            {(!data || data.length === 0) && <Button variant="secondary" onClick={initDefaults} loading={initializing}><Sparkles size={15} /> 添加常用服务</Button>}
            <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus size={16} /> 新增服务</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card p-4 sm:p-5">
          <p className="text-[13px] text-slate-500">在售服务</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{activeCount}</p>
          <p className="mt-1 text-xs text-slate-400">共 {data?.length ?? 0} 项</p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-[13px] text-slate-500">平均服务费</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{money(average)}</p>
          <p className="mt-1 text-xs text-slate-400">可按实际调整</p>
        </div>
        <div className="card col-span-2 bg-gradient-to-br from-ink-950 to-brand-900 p-4 text-white lg:col-span-1 sm:p-5">
          <p className="flex items-center gap-1.5 text-xs text-brand-200"><Wrench size={14} /> 开单自动带出</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">选中服务后自动合计服务费，也可额外加「其他服务费」。</p>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取服务项目…" />}

      {!error && data && data.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Wrench size={22} />}
            title="还没有服务项目"
            description="建议先添加「标准上门装机」「装系统」「清灰保养」等常用项目，也可以一键生成再改价。"
            action={<div className="flex gap-2"><Button onClick={initDefaults} loading={initializing}><Sparkles size={14} /> 一键添加常用服务</Button><Button variant="secondary" onClick={() => { setEditing(null); setOpen(true) }}>手动添加</Button></div>}
          />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((item) => (
            <div key={item.id} className={`card p-4 sm:p-5 ${item.active === 'inactive' ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{item.category}</Badge>
                    {item.active === 'inactive' && <Badge tone="slate">停用</Badge>}
                  </div>
                  <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{item.name}</h3>
                  {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{item.description}</p>}
                </div>
                <p className="tabular shrink-0 text-lg font-semibold text-slate-900">{money(item.price_cents)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={12} />约 {item.duration_minutes || 0} 分钟</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setEditing(item); setOpen(true) }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="编辑"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="删除"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑服务项目' : '新增服务项目'}
        description="价格会作为开单时的默认单价，实际可按单修改"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} loading={saving}>保存</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="服务名称" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：标准上门装机" autoFocus /></Field>
          <Field label="分类">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="服务费（元）"><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
          <Field label="预计工时（分钟）"><Input type="number" min={0} max={1440} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></Field>
          <Field label="状态">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">在售</option>
              <option value="inactive">停用（开单不显示）</option>
            </Select>
          </Field>
          <Field label="说明" className="sm:col-span-2"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="包含哪些工作、是否含系统安装等" /></Field>
        </div>
      </Modal>
    </div>
  )
}
