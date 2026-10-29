import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Boxes, Layers, Pencil, Plus, Search, ShoppingCart, Trash2, Wallet } from 'lucide-react'
import type { BuildTemplate } from '../../shared/types'
import { TEMPLATE_LEVEL_LABELS, TEMPLATE_PURPOSES, TEMPLATE_PURPOSE_LABELS } from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { marginPercent, money } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Badge, Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput, StatCard, Tabs } from '../components/ui'

export default function Templates() {
  useDocTitle('常用配置')
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { data, loading, error, reload } = useApi<BuildTemplate[]>(() => api.templates.list(), [])
  const [purpose, setPurpose] = useState('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (data ?? []).filter((tpl) => {
      if (purpose !== 'all' && tpl.purpose !== purpose) return false
      if (!keyword) return true
      return `${tpl.name} ${tpl.notes}`.toLowerCase().includes(keyword)
    })
  }, [data, purpose, q])

  const stats = useMemo(() => {
    const list = data ?? []
    const avgBudget = list.length ? Math.round(list.reduce((s, t) => s + t.budget_cents, 0) / list.length) : 0
    const avgMargin = list.length ? Math.round(list.reduce((s, t) => s + marginPercent(t.cost_cents ?? 0, t.total_cents ?? 0), 0) / list.length) : 0
    const parts = list.reduce((s, t) => s + (t.item_count ?? 0), 0)
    return { count: list.length, avgBudget, avgMargin, parts }
  }, [data])

  const remove = async (tpl: BuildTemplate) => {
    const ok = await confirm({ title: `删除配置「${tpl.name}」？`, message: '删除模板不会影响已创建的工单。', confirmText: '删除', danger: true })
    if (!ok) return
    try {
      await api.templates.remove(tpl.id)
      toast('配置已删除')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="常用配置"
        description="把常卖的整机方案存成模板，下次报价十秒完成"
        actions={<Link to="/templates/new"><Button><Plus size={16} /> 新建配置</Button></Link>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="配置模板" value={stats.count} hint={`共 ${stats.parts} 个配件项`} icon={<Layers size={18} />} tone="brand" />
        <StatCard label="平均预算" value={money(stats.avgBudget)} hint="模板参考预算均值" icon={<Wallet size={18} />} tone="emerald" />
        <StatCard label="平均毛利率" value={`${stats.avgMargin}%`} hint="按当前售价与成本" icon={<Boxes size={18} />} tone="violet" />
        <StatCard label="可快速开单" value={stats.count} hint="选择模板即可带入清单" icon={<ShoppingCart size={18} />} tone="amber" />
      </div>

      <div className="card mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <Tabs
          value={purpose}
          onChange={setPurpose}
          items={[
            { key: 'all', label: '全部' },
            ...TEMPLATE_PURPOSES.map((p) => ({ key: p, label: TEMPLATE_PURPOSE_LABELS[p] })),
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="搜索配置名称…" className="w-full sm:w-60" />
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取配置…" />}

      {!error && data && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Search size={22} />}
            title={data.length === 0 ? '还没有常用配置' : '没有匹配的配置'}
            description={data.length === 0 ? '把 3000 元办公、7000 元游戏这类常卖方案存下来，报价更快。' : '换个用途或关键词试试。'}
            action={data.length === 0 ? <Link to="/templates/new"><Button size="sm"><Plus size={14} /> 新建配置</Button></Link> : <Button size="sm" variant="secondary" onClick={() => { setQ(''); setPurpose('all') }}>清除筛选</Button>}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((tpl) => {
            const margin = marginPercent(tpl.cost_cents ?? 0, tpl.total_cents ?? 0)
            const parts = tpl.items ?? []
            const overBudget = (tpl.budget_cents ?? 0) > 0 && (tpl.total_cents ?? 0) > tpl.budget_cents
            return (
              <div key={tpl.id} className="card group flex flex-col p-4 transition hover:border-brand-200 hover:shadow-md sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{TEMPLATE_PURPOSE_LABELS[tpl.purpose]}</Badge>
                      <Badge tone="slate">{TEMPLATE_LEVEL_LABELS[tpl.level]}</Badge>
                    </div>
                    <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{tpl.name}</h3>
                    {tpl.notes && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{tpl.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-lg font-semibold text-slate-900">{money(tpl.total_cents)}</p>
                    <p className={`mt-0.5 text-[10px] ${overBudget ? 'text-rose-500' : 'text-slate-400'}`}>
                      {tpl.budget_cents ? `预算 ${money(tpl.budget_cents)}` : '未设预算'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {parts.slice(0, 4).map((item) => (
                    <span key={`${item.id}-${item.part_id}`} className="max-w-full truncate rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
                      <span className="mr-1 text-slate-300">{item.part_category}</span>{item.part_name} ×{item.qty}
                    </span>
                  ))}
                  {parts.length > 4 && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-400">+{parts.length - 4} 项</span>}
                  {parts.length === 0 && <span className="text-[11px] text-slate-400">暂未添加配件</span>}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div><p className="text-[10px] text-slate-400">配件</p><p className="mt-0.5 font-medium text-slate-700">{parts.length} 项</p></div>
                  <div><p className="text-[10px] text-slate-400">人工费</p><p className="tabular mt-0.5 font-medium text-slate-700">{money(tpl.labor_fee_cents)}</p></div>
                  <div><p className="text-[10px] text-slate-400">毛利率</p><p className={`tabular mt-0.5 font-medium ${margin >= 15 ? 'text-emerald-600' : 'text-amber-600'}`}>{margin}%</p></div>
                </div>

                <div className="mt-3 flex items-center gap-2 pt-1">
                  <Button size="sm" className="flex-1" onClick={() => navigate(`/orders/new?template=${tpl.id}`)}>
                    <ShoppingCart size={14} /> 用此配置开单 <ArrowRight size={13} />
                  </Button>
                  <Link to={`/templates/${tpl.id}/edit`}><Button size="sm" variant="secondary"><Pencil size={13} /></Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => remove(tpl)} className="text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
