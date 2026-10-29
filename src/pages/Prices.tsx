import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, BadgeDollarSign, History, Pencil, TrendingUp, Wallet } from 'lucide-react'
import type { Part, PartPrice } from '../../shared/types'
import { PART_CATEGORIES } from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, marginPercent, money, moneyInput, parseMoney } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import {
  Badge, Button, Drawer, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, SearchInput, Select, StatCard,
} from '../components/ui'

type PricePart = Part & { last_price_at: string | null }

function marginClass(margin: number): string {
  if (margin >= 10) return 'text-emerald-600'
  if (margin >= 6) return 'text-amber-600'
  return 'text-rose-500'
}

export default function Prices() {
  useDocTitle('价格表')
  const { toast } = useFeedback()
  const { data, loading, error, reload } = useApi<PricePart[]>(() => api.prices.list(), [])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('全部')
  const [editing, setEditing] = useState<PricePart | null>(null)
  const [historyPart, setHistoryPart] = useState<PricePart | null>(null)
  const [form, setForm] = useState({ cost: '', sale: '', supplier: '', note: '' })
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (data ?? []).filter((p) => {
      if (category !== '全部' && p.category !== category) return false
      if (!keyword) return true
      return `${p.name} ${p.brand} ${p.model} ${p.supplier}`.toLowerCase().includes(keyword)
    })
  }, [data, q, category])

  const stats = useMemo(() => {
    const list = data ?? []
    const margins = list.filter((p) => p.sale_cents > 0).map((p) => marginPercent(p.cost_cents, p.sale_cents))
    const avg = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0
    const low = margins.filter((m) => m < 10).length
    const stockValue = list.reduce((sum, p) => sum + p.stock * p.cost_cents, 0)
    return { avg, low, stockValue, count: list.length }
  }, [data])

  const openAdjust = (part: PricePart) => {
    setForm({ cost: moneyInput(part.cost_cents), sale: moneyInput(part.sale_cents), supplier: part.supplier, note: '' })
    setEditing(part)
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.parts.updatePrice(editing.id, {
        cost_cents: parseMoney(form.cost),
        sale_cents: parseMoney(form.sale),
        supplier: form.supplier,
        note: form.note || '手动调价',
      })
      toast('价格已更新，历史记录已保存')
      setEditing(null)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const previewMargin = marginPercent(parseMoney(form.cost), parseMoney(form.sale))
  const delta = editing ? parseMoney(form.sale) - editing.sale_cents : 0

  return (
    <div>
      <PageHeader
        title="配件价格表"
        description="成本、售价与毛利一目了然；每次调价都会写入价格历史"
        actions={<Link to="/parts"><Button variant="secondary"><Pencil size={14} /> 管理配件档案</Button></Link>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="在册配件" value={stats.count} hint="含停用配件" icon={<BadgeDollarSign size={18} />} tone="brand" />
        <StatCard label="平均毛利率" value={`${stats.avg}%`} hint="按当前售价计算" icon={<TrendingUp size={18} />} tone="emerald" />
        <StatCard label="低毛利配件" value={stats.low} hint="毛利率低于 10%" icon={<ArrowDownRight size={18} />} tone={stats.low > 0 ? 'amber' : 'emerald'} />
        <StatCard label="库存成本" value={money(stats.stockValue)} hint="按成本价估算" icon={<Wallet size={18} />} tone="violet" />
      </div>

      <div className="card mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="搜索配件或供应商…" className="w-full sm:w-64" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 w-full py-0 text-xs sm:w-36">
            <option value="全部">全部分类</option>
            {PART_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <span className="text-[11px] text-slate-400">{filtered.length} 项 · 点击「调价」更新价格</span>
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取价格…" />}

      {!error && data && filtered.length === 0 && (
        <div className="card"><EmptyState icon={<BadgeDollarSign size={22} />} title="没有匹配的配件" description="换个关键词或分类筛选试试。" action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setCategory('全部') }}>清除筛选</Button>} /></div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">配件</th>
                    <th className="px-3 py-3 text-right font-medium">成本价</th>
                    <th className="px-3 py-3 text-right font-medium">售价</th>
                    <th className="px-3 py-3 text-right font-medium">毛利</th>
                    <th className="px-3 py-3 text-right font-medium">毛利率</th>
                    <th className="px-3 py-3 font-medium">最近调价</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((part) => {
                    const margin = marginPercent(part.cost_cents, part.sale_cents)
                    return (
                      <tr key={part.id} className="transition hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800">{part.name}</p>
                            <Badge tone="slate">{part.category}</Badge>
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-400">{part.supplier || '未填供应商'} · 库存 {part.stock}</p>
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-500">{money(part.cost_cents)}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-slate-800">{money(part.sale_cents)}</td>
                        <td className="tabular px-3 py-3 text-right text-emerald-600">{money(part.sale_cents - part.cost_cents)}</td>
                        <td className={`tabular px-3 py-3 text-right font-medium ${marginClass(margin)}`}>{margin}%</td>
                        <td className="px-3 py-3 text-[11px] text-slate-400">{part.last_price_at ? fmtDateTime(part.last_price_at).slice(5, 16) : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="soft" onClick={() => openAdjust(part)}>调价</Button>
                            <Button size="sm" variant="ghost" onClick={() => setHistoryPart(part)}><History size={13} /> 历史</Button>
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
              return (
                <div key={part.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900">{part.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{part.category} · {part.supplier || '未填供应商'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${marginClass(margin)} bg-slate-50`}>{margin}%</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[10px] text-slate-400">成本</p><p className="tabular mt-0.5 text-slate-600">{money(part.cost_cents)}</p></div>
                    <div><p className="text-[10px] text-slate-400">售价</p><p className="tabular mt-0.5 font-medium text-slate-800">{money(part.sale_cents)}</p></div>
                    <div><p className="text-[10px] text-slate-400">毛利</p><p className="tabular mt-0.5 text-emerald-600">{money(part.sale_cents - part.cost_cents)}</p></div>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-slate-100 pt-2.5">
                    <Button size="sm" variant="soft" className="flex-1" onClick={() => openAdjust(part)}>调价</Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setHistoryPart(part)}><History size={13} /> 历史</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `调整价格 · ${editing.name}` : '调整价格'}
        description={editing ? `当前成本 ${money(editing.cost_cents)} / 售价 ${money(editing.sale_cents)}` : undefined}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>取消</Button><Button onClick={save} loading={saving}>保存调价</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="成本价（元）"><Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
            <Field label="售价（元）"><Input value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
          </div>
          <Field label="供应商"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          <Field label="调价原因 / 备注"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="如：内存涨价、促销让利" /></Field>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-xs">
            <div>
              <p className="text-slate-400">调价后毛利</p>
              <p className="tabular mt-0.5 text-base font-semibold text-slate-900">{money(parseMoney(form.sale) - parseMoney(form.cost))}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">毛利率</p>
              <p className={`tabular mt-0.5 text-base font-semibold ${marginClass(previewMargin)}`}>{previewMargin}%</p>
            </div>
          </div>
          {delta !== 0 && (
            <p className={`flex items-center gap-1 text-[11px] ${delta > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              {delta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              售价比当前{delta > 0 ? '上调' : '下调'} {money(Math.abs(delta))}
            </p>
          )}
        </div>
      </Modal>

      {historyPart && <PriceHistoryDrawer part={historyPart} onClose={() => setHistoryPart(null)} />}
    </div>
  )
}

function PriceHistoryDrawer({ part, onClose }: { part: PricePart; onClose: () => void }) {
  const { data, loading, error } = useApi<PartPrice[]>(() => api.parts.prices(part.id), [part.id])
  return (
    <Drawer open onClose={onClose} title="价格历史" description={`${part.name} · 当前 ${money(part.sale_cents)}`}>
      {loading && !data && <LoadingBlock label="读取中…" />}
      {error && <ErrorBlock message={error} />}
      {data && data.length === 0 && <EmptyState title="暂无调价记录" description="保存一次调价后就会出现在这里。" />}
      {data && data.length > 0 && (
        <div className="relative space-y-0">
          {data.map((price, index) => {
            const prev = data[index + 1]
            const diff = prev ? price.sale_cents - prev.sale_cents : 0
            return (
              <div key={price.id} className="relative flex gap-3 pb-5">
                {index < data.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-slate-100" />}
                <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white ${index === 0 ? 'bg-brand-500' : 'bg-slate-300'} ring-1 ring-slate-100`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-sm font-semibold text-slate-900">{money(price.sale_cents)}</span>
                    <span className="text-[10px] text-slate-400">成本 {money(price.cost_cents)}</span>
                    {diff !== 0 && (
                      <span className={`tabular text-[10px] ${diff > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{diff > 0 ? '+' : ''}{money(diff)}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{price.note || '价格调整'}{price.supplier ? ` · ${price.supplier}` : ''}</p>
                  <p className="mt-0.5 text-[10px] text-slate-300">{fmtDateTime(price.recorded_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}
