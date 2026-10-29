import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Cpu, History, PackagePlus, Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react'
import type { Part, StockMovement } from '../../shared/types'
import { PART_CATEGORIES } from '../../shared/types'
import { api, errorMessage, type PartPayload } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, marginPercent, money, moneyInput, parseMoney } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import {
  Badge, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, SearchInput, Select, StatCard, Tabs, Textarea,
} from '../components/ui'

interface PartForm {
  name: string
  category: string
  brand: string
  model: string
  spec: string
  unit: string
  cost: string
  sale: string
  stock: string
  min_stock: string
  supplier: string
  warranty: string
  status: 'active' | 'inactive'
  notes: string
  price_note: string
}

const emptyForm: PartForm = {
  name: '', category: 'CPU', brand: '', model: '', spec: '', unit: '个', cost: '', sale: '', stock: '0', min_stock: '0',
  supplier: '', warranty: '36', status: 'active', notes: '', price_note: '',
}

function marginClass(margin: number): string {
  if (margin >= 10) return 'text-emerald-600'
  if (margin >= 6) return 'text-amber-600'
  return 'text-rose-500'
}

export default function Parts() {
  useDocTitle('配件')
  const { toast, confirm } = useFeedback()
  const { data: parts, loading, error, reload } = useApi<Part[]>(() => api.parts.list(), [])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('全部')
  const [lowStock, setLowStock] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Part | null>(null)
  const [form, setForm] = useState<PartForm>({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [stockPart, setStockPart] = useState<Part | null>(null)
  const [stockOpen, setStockOpen] = useState(false)
  const [stockKind, setStockKind] = useState<'in' | 'out' | 'set'>('in')
  const [stockQty, setStockQty] = useState('1')
  const [stockNote, setStockNote] = useState('')
  const [stockSaving, setStockSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPart, setHistoryPart] = useState<Part | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name, category: editing.category, brand: editing.brand, model: editing.model, spec: editing.spec,
        unit: editing.unit, cost: moneyInput(editing.cost_cents), sale: moneyInput(editing.sale_cents),
        stock: String(editing.stock), min_stock: String(editing.min_stock), supplier: editing.supplier,
        warranty: String(editing.warranty_months), status: editing.status, notes: editing.notes, price_note: '编辑配件时调价',
      })
    } else {
      setForm({ ...emptyForm })
    }
  }, [open, editing])

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (parts ?? []).filter((part) => {
      if (category !== '全部' && part.category !== category) return false
      if (lowStock && part.stock > part.min_stock) return false
      if (keyword) {
        const haystack = `${part.name} ${part.brand} ${part.model} ${part.spec} ${part.supplier}`.toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      return true
    })
  }, [parts, q, category, lowStock])

  const stats = useMemo(() => {
    const list = parts ?? []
    const low = list.filter((p) => p.stock <= p.min_stock).length
    const stockValue = list.reduce((sum, p) => sum + p.stock * p.cost_cents, 0)
    const margins = list.filter((p) => p.sale_cents > 0).map((p) => marginPercent(p.cost_cents, p.sale_cents))
    const avgMargin = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0
    return { total: list.length, low, stockValue, avgMargin }
  }, [parts])

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const part of parts ?? []) map.set(part.category, (map.get(part.category) ?? 0) + 1)
    return map
  }, [parts])

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写配件名称', 'error')
      return
    }
    const payload: PartPayload = {
      name: form.name,
      category: form.category,
      brand: form.brand,
      model: form.model,
      spec: form.spec,
      unit: form.unit || '个',
      cost_cents: parseMoney(form.cost),
      sale_cents: parseMoney(form.sale),
      stock: Number(form.stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      supplier: form.supplier,
      warranty_months: Number(form.warranty) || 0,
      status: form.status,
      notes: form.notes,
      price_note: form.price_note,
    }
    setSaving(true)
    try {
      if (editing) await api.parts.update(editing.id, payload)
      else await api.parts.create(payload)
      toast(editing ? '配件已更新' : '配件已添加')
      setOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const openStock = (part: Part) => {
    setStockPart(part)
    setStockKind('in')
    setStockQty('1')
    setStockNote('')
    setStockOpen(true)
  }

  const saveStock = async () => {
    if (!stockPart) return
    const qty = Number(stockQty)
    if (!Number.isFinite(qty) || qty < 0) {
      toast('请输入有效数量', 'error')
      return
    }
    setStockSaving(true)
    try {
      await api.parts.changeStock(stockPart.id, { kind: stockKind, qty, note: stockNote })
      toast(stockKind === 'in' ? '入库成功' : stockKind === 'out' ? '出库成功' : '库存已调整')
      setStockOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setStockSaving(false)
    }
  }

  const showHistory = async (part: Part) => {
    setHistoryPart(part)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      setMovements(await api.parts.movements(part.id))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const remove = async (part: Part) => {
    const ok = await confirm({
      title: `删除配件「${part.name}」？`,
      message: '配件会移入回收站，保留价格与库存流水；可在「回收站」恢复或彻底删除。',
      confirmText: '移入回收站',
      danger: true,
    })
    if (!ok) return
    try {
      await api.parts.remove(part.id)
      toast('配件已移入回收站')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="配件库"
        description="管理配件档案、库存与售价；调价会自动留痕"
        actions={<Button onClick={() => { setEditing(null); setOpen(true) }}><Plus size={16} /> 新增配件</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="配件总数" value={stats.total} hint={`覆盖 ${categoryCounts.size} 个分类`} icon={<Cpu size={18} />} tone="brand" />
        <StatCard label="低库存" value={stats.low} hint="库存 ≤ 预警值" icon={<AlertTriangle size={18} />} tone={stats.low > 0 ? 'rose' : 'emerald'} />
        <StatCard label="库存成本" value={money(stats.stockValue)} hint="按当前成本价估算" icon={<Wallet size={18} />} tone="amber" />
        <StatCard label="平均毛利率" value={`${stats.avgMargin}%`} hint="全部有售价的配件" icon={<Boxes size={18} />} tone="violet" />
      </div>

      <div className="card mb-4 p-3 sm:p-4">
        <Tabs
          value={category}
          onChange={setCategory}
          items={[
            { key: '全部', label: '全部', count: parts?.length },
            ...PART_CATEGORIES.map((c) => ({ key: c, label: c, count: categoryCounts.get(c) ?? 0 })),
          ]}
        />
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="搜索名称、品牌、型号、供应商…" className="w-full sm:max-w-xs" />
          <button
            type="button"
            onClick={() => setLowStock((v) => !v)}
            className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${lowStock ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            <AlertTriangle size={14} /> 仅看低库存
          </button>
          <span className="text-[11px] text-slate-400 sm:ml-auto">{filtered.length} / {parts?.length ?? 0} 项</span>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !parts && <LoadingBlock label="正在读取配件…" />}

      {!error && parts && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Search size={22} />}
            title="没有匹配的配件"
            description={parts.length === 0 ? '先录入常用配件，报价时就能直接选。' : '换个关键词或清除分类筛选。'}
            action={parts.length === 0 ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={14} /> 新增配件</Button> : <Button size="sm" variant="secondary" onClick={() => { setQ(''); setCategory('全部'); setLowStock(false) }}>清除筛选</Button>}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">配件</th>
                    <th className="px-3 py-3 font-medium">分类</th>
                    <th className="px-3 py-3 text-right font-medium">成本价</th>
                    <th className="px-3 py-3 text-right font-medium">售价</th>
                    <th className="px-3 py-3 text-right font-medium">毛利率</th>
                    <th className="px-3 py-3 text-center font-medium">库存</th>
                    <th className="px-3 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((part) => {
                    const margin = marginPercent(part.cost_cents, part.sale_cents)
                    const low = part.stock <= part.min_stock
                    return (
                      <tr key={part.id} className="transition hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{part.name}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{[part.brand, part.model, part.spec].filter(Boolean).join(' · ') || '—'}</p>
                        </td>
                        <td className="px-3 py-3"><Badge tone="slate">{part.category}</Badge></td>
                        <td className="tabular px-3 py-3 text-right text-slate-500">{money(part.cost_cents)}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-slate-800">{money(part.sale_cents)}</td>
                        <td className={`tabular px-3 py-3 text-right font-medium ${marginClass(margin)}`}>{margin}%</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`tabular inline-flex min-w-[40px] justify-center rounded-full px-2 py-0.5 text-[10px] font-medium ${low ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{part.stock}</span>
                          <span className="ml-1 text-[9px] text-slate-300">/ {part.min_stock}</span>
                        </td>
                        <td className="px-3 py-3">
                          {part.status === 'active' ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />在售</span> : <span className="text-[11px] text-slate-400">停用</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => openStock(part)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600" aria-label="库存"><PackagePlus size={14} /></button>
                            <button type="button" onClick={() => showHistory(part)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600" aria-label="库存流水"><History size={14} /></button>
                            <button type="button" onClick={() => { setEditing(part); setOpen(true) }} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600" aria-label="编辑"><Pencil size={14} /></button>
                            <button type="button" onClick={() => remove(part)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="删除"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((part) => {
              const margin = marginPercent(part.cost_cents, part.sale_cents)
              const low = part.stock <= part.min_stock
              return (
                <div key={part.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900">{part.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{[part.brand, part.model, part.spec].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <Badge tone="slate">{part.category}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[10px] text-slate-400">成本</p><p className="tabular mt-0.5 text-slate-600">{money(part.cost_cents)}</p></div>
                    <div><p className="text-[10px] text-slate-400">售价</p><p className="tabular mt-0.5 font-medium text-slate-800">{money(part.sale_cents)}</p></div>
                    <div><p className="text-[10px] text-slate-400">毛利率</p><p className={`tabular mt-0.5 font-medium ${marginClass(margin)}`}>{margin}%</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${low ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>库存 {part.stock} / 预警 {part.min_stock}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openStock(part)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="库存"><PackagePlus size={14} /></button>
                      <button type="button" onClick={() => showHistory(part)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="库存流水"><History size={14} /></button>
                      <button type="button" onClick={() => { setEditing(part); setOpen(true) }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(part)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑配件' : '新增配件'}
        description={editing ? '成本或售价变化会自动记录价格历史' : '价格与库存随时可以调整'}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} loading={saving}>保存配件</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="配件名称" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：i5-14600KF 盒装" autoFocus /></Field>
          <Field label="分类">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {PART_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="单位"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="品牌"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="型号"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="规格参数" className="sm:col-span-2"><Input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="接口、频率、容量、功率等" /></Field>
          <Field label="成本价（元）"><Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
          <Field label="售价（元）"><Input value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
          <Field label="当前库存"><Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="低库存预警值"><Input type="number" min={0} value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></Field>
          <Field label="供应商"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          <Field label="质保月数"><Input type="number" min={0} value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} /></Field>
          <Field label="状态">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Part['status'] })}>
              <option value="active">在售</option>
              <option value="inactive">停用（开单时不显示）</option>
            </Select>
          </Field>
          {editing && <Field label="调价备注"><Input value={form.price_note} onChange={(e) => setForm({ ...form, price_note: e.target.value })} placeholder="如：供应商涨价" /></Field>}
          <Field label="备注" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        title={`调整库存 · ${stockPart?.name ?? ''}`}
        description={stockPart ? `当前库存 ${stockPart.stock} ${stockPart.unit}` : ''}
        footer={<><Button variant="secondary" onClick={() => setStockOpen(false)}>取消</Button><Button onClick={saveStock} loading={stockSaving}>确认</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="操作">
            <Select value={stockKind} onChange={(e) => { setStockKind(e.target.value as 'in' | 'out' | 'set'); setStockQty(e.target.value === 'set' ? String(stockPart?.stock ?? 0) : '1') }}>
              <option value="in">采购入库（增加）</option>
              <option value="out">领用出库（减少）</option>
              <option value="set">盘点调整（设为）</option>
            </Select>
          </Field>
          <Field label={stockKind === 'set' ? '调整后库存' : stockKind === 'in' ? '入库数量' : '出库数量'} required>
            <Input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} inputMode="numeric" autoFocus />
          </Field>
          <Field label="备注" className="sm:col-span-2"><Input value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="如：供应商到货 / 装机领用 / 盘点" /></Field>
        </div>
        <p className="mt-3 text-[10px] text-slate-400">工单保存时会按配件数量自动占用库存，取消/删除/编辑工单会自动回补或重算。</p>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`库存流水 · ${historyPart?.name ?? ''}`}
        description="最近 200 条，含工单占用与手工入库"
        size="lg"
      >
        {historyLoading ? <LoadingBlock label="正在读取流水…" /> : movements.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">还没有库存流水</p> : (
          <div className="divide-y divide-slate-100">
            {movements.map((movement) => {
              const labels: Record<string, string> = { in: '采购入库', out: '手工出库', adjust: '盘点调整', order_out: '工单占用', order_in: '工单释放' }
              return (
                <div key={movement.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-700">{labels[movement.kind] ?? movement.kind}{movement.order_no ? ` · ${movement.order_no}` : ''}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{movement.note || '—'} · {fmtDateTime(movement.created_at)}</p>
                  </div>
                  <span className={`tabular shrink-0 font-semibold ${movement.qty > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{movement.qty > 0 ? '+' : ''}{movement.qty}</span>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
