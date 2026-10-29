import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, PackagePlus, Plus, Save, Trash2 } from 'lucide-react'
import type { BuildTemplate, Part } from '../../shared/types'
import {
  TEMPLATE_LEVELS,
  TEMPLATE_LEVEL_LABELS,
  TEMPLATE_PURPOSES,
  TEMPLATE_PURPOSE_LABELS,
} from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { marginPercent, money, moneyInput, parseMoney } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Button, Field, Input, LoadingBlock, PageHeader, Select, Textarea } from '../components/ui'

interface Row {
  key: string
  partId: number
  qty: number
  price: string
  note: string
}

let rowSeq = 0
const newRow = (): Row => ({ key: `tpl-row-${++rowSeq}`, partId: 0, qty: 1, price: '', note: '' })

export default function TemplateForm() {
  const { id } = useParams()
  const isEdit = !!id
  const templateId = Number(id)
  const navigate = useNavigate()
  const { toast } = useFeedback()
  useDocTitle(isEdit ? '编辑配置' : '新建配置')

  const { data: existing, loading: loadingTemplate } = useApi<BuildTemplate | null>(
    () => (isEdit ? api.templates.get(templateId) : Promise.resolve(null)),
    [templateId, isEdit],
  )
  const { data: parts } = useApi<Part[]>(() => api.parts.list(), [])

  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<string>('gaming')
  const [level, setLevel] = useState<string>('mainstream')
  const [budget, setBudget] = useState('')
  const [labor, setLabor] = useState('200')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!existing || initialized.current) return
    setName(existing.name)
    setPurpose(existing.purpose)
    setLevel(existing.level)
    setBudget(moneyInput(existing.budget_cents))
    setLabor(moneyInput(existing.labor_fee_cents))
    setNotes(existing.notes)
    setRows((existing.items ?? []).map((item) => ({
      key: `tpl-edit-${++rowSeq}`,
      partId: item.part_id,
      qty: item.qty,
      price: item.unit_price_cents > 0 ? moneyInput(item.unit_price_cents) : '',
      note: item.note,
    })))
    initialized.current = true
  }, [existing])

  const groups = useMemo(() => {
    const map = new Map<string, Part[]>()
    for (const part of parts ?? []) {
      if (part.status === 'inactive') continue
      const list = map.get(part.category) ?? []
      list.push(part)
      map.set(part.category, list)
    }
    return [...map.entries()]
  }, [parts])

  const effectivePrice = (row: Row): number => {
    if (parseMoney(row.price) > 0) return parseMoney(row.price)
    return parts?.find((p) => p.id === row.partId)?.sale_cents ?? 0
  }
  const cost = (row: Row): number => parts?.find((p) => p.id === row.partId)?.cost_cents ?? 0
  const partsTotal = rows.reduce((sum, row) => sum + row.qty * effectivePrice(row), 0)
  const total = partsTotal + parseMoney(labor)
  const totalCost = rows.reduce((sum, row) => sum + row.qty * cost(row), 0)
  const margin = marginPercent(totalCost, total)

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key))

  const save = async () => {
    if (!name.trim()) {
      toast('请填写配置名称', 'error')
      return
    }
    if (rows.some((r) => !r.partId)) {
      toast('有配置项还没选择配件', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name,
        purpose,
        level,
        budget_cents: parseMoney(budget),
        labor_fee_cents: parseMoney(labor),
        notes,
        items: rows.map((row) => ({
          part_id: row.partId,
          qty: row.qty,
          unit_price_cents: parseMoney(row.price),
          note: row.note,
        })),
      }
      if (isEdit) await api.templates.update(templateId, payload)
      else await api.templates.create(payload)
      toast(isEdit ? '配置已更新' : '配置已创建')
      navigate('/templates')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && loadingTemplate && !existing) return <LoadingBlock label="正在读取配置…" />

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/templates" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={13} /> 返回常用配置</Link>}
        title={isEdit ? `编辑配置` : '新建常用配置'}
        description={isEdit ? existing?.name : '把整机方案存成模板，开单时一键带入配件与价格'}
        actions={<><Button variant="secondary" onClick={() => navigate('/templates')}>取消</Button><Button onClick={save} loading={saving}><Save size={15} /> 保存配置</Button></>}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="space-y-4 xl:col-span-2">
          <section className="card p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">基本信息</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="配置名称" required className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：7000 元主流游戏主机" autoFocus /></Field>
              <Field label="用途">
                <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {TEMPLATE_PURPOSES.map((p) => <option key={p} value={p}>{TEMPLATE_PURPOSE_LABELS[p]}</option>)}
                </Select>
              </Field>
              <Field label="档位">
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  {TEMPLATE_LEVELS.map((l) => <option key={l} value={l}>{TEMPLATE_LEVEL_LABELS[l]}</option>)}
                </Select>
              </Field>
              <Field label="参考预算（元）"><Input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="默认人工费（元）"><Input value={labor} onChange={(e) => setLabor(e.target.value)} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="配置说明" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="适合人群、用途、外观主题…" /></Field>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">配件清单</h3>
                <p className="mt-0.5 text-xs text-slate-400">单价留空表示跟随配件当前售价</p>
              </div>
              <Button size="sm" variant="secondary" onClick={addRow}><Plus size={14} /> 添加配件</Button>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                <PackagePlus size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">还没有配件，添加 CPU、主板、内存等</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={addRow}><Plus size={14} /> 添加配件</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const part = parts?.find((p) => p.id === row.partId)
                  const price = effectivePrice(row)
                  return (
                    <div key={row.key} className="rounded-xl border border-slate-200 p-3">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-12 sm:items-end">
                        <div className="col-span-2 sm:col-span-5">
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">配件</label>
                          <Select value={row.partId || ''} onChange={(e) => update(row.key, { partId: Number(e.target.value) })} className="h-9 py-0 text-xs">
                            <option value="">选择配件…</option>
                            {groups.map(([category, list]) => (
                              <optgroup key={category} label={category}>
                                {list.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.sale_cents)}</option>)}
                              </optgroup>
                            ))}
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">数量</label>
                          <Input type="number" min={1} max={99} value={row.qty} onChange={(e) => update(row.key, { qty: Math.max(1, Number(e.target.value) || 1) })} className="h-9 py-0 text-center text-xs" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">单价（留空跟随售价）</label>
                          <Input value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} placeholder="跟随售价" inputMode="decimal" className="h-9 py-0 text-right text-xs tabular" />
                        </div>
                        <div className="sm:col-span-2 sm:text-right">
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">小计</label>
                          <p className="tabular flex h-9 items-center justify-end text-[13px] font-semibold text-slate-800">{money(row.qty * price)}</p>
                        </div>
                        <div className="flex justify-end sm:col-span-1">
                          <button type="button" onClick={() => remove(row.key)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="删除"><Trash2 size={15} /></button>
                        </div>
                      </div>
                      {part && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          {part.category} · 成本 {money(part.cost_cents)} · 当前售价 {money(part.sale_cents)} · 库存 {part.stock}
                        </p>
                      )}
                    </div>
                  )
                })}
                <Button size="sm" variant="ghost" onClick={addRow}><Plus size={14} /> 继续添加</Button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">配置报价</h3>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">配件小计</span><span className="tabular text-slate-700">{money(partsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">人工费</span><span className="tabular text-slate-700">{money(parseMoney(labor))}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><span className="text-slate-400">配置总价</span><span className="tabular text-base font-semibold text-slate-900">{money(total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">配件成本</span><span className="tabular text-slate-500">{money(totalCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">预计毛利</span><span className="tabular font-medium text-emerald-600">{money(total - totalCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">毛利率</span><span className={`tabular font-medium ${margin >= 15 ? 'text-emerald-600' : 'text-amber-600'}`}>{margin}%</span></div>
            </div>
            {parseMoney(budget) > 0 && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${total > parseMoney(budget) ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {total > parseMoney(budget) ? `超出预算 ${money(total - parseMoney(budget))}` : `在预算内，剩余 ${money(parseMoney(budget) - total)}`}
              </p>
            )}
          </section>

          <section className="card bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-500">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">模板说明</h3>
            <p>模板保存的是「选哪些件、各几件、什么价格」。开单时会复制一份快照到工单，之后调价不会影响历史工单。</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
