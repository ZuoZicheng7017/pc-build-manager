import { useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { BarChart3, TrendingUp, Users, Wallet } from 'lucide-react'
import type { ReportData } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { compactMoney, money } from '../lib/format'
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, ProgressBar, StatCard, Tabs } from '../components/ui'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function Reports() {
  useDocTitle('报表')
  const [months, setMonths] = useState(6)
  const { data, loading, error, reload } = useApi<ReportData>(() => api.reports(months), [months])

  const maxRevenue = Math.max(1, ...(data?.monthly.map((m) => m.revenueCents) ?? [1]))
  const maxService = Math.max(1, ...(data?.services.map((s) => s.revenueCents) ?? [1]))
  const maxSource = Math.max(1, ...(data?.sources.map((s) => s.revenueCents) ?? [1]))
  const maxHour = Math.max(1, ...(data?.hours.map((h) => h.count) ?? [1]))
  const totalWeekday = data?.weekdays.reduce((sum, w) => sum + w.count, 0) ?? 0
  const hasData = (data?.stats.orders ?? 0) > 0

  return (
    <div>
      <PageHeader
        title="经营报表"
        description="只看上门服务收入与毛利，找到更值钱的服务和时间段"
        actions={<Tabs value={String(months)} onChange={(v) => setMonths(Number(v))} items={[{ key: '1', label: '本月' }, { key: '3', label: '近 3 月' }, { key: '6', label: '近 6 月' }, { key: '12', label: '近 1 年' }]} />}
      />

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在汇总…" />}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="完工收入" value={compactMoney(data.stats.revenueCents)} hint={`${data.stats.completed} 单已完成`} icon={<Wallet size={18} />} tone="emerald" />
            <StatCard label="服务毛利" value={compactMoney(data.stats.profitCents)} hint={`成本 ${money(data.stats.costCents)}`} icon={<TrendingUp size={18} />} tone="brand" />
            <StatCard label="平均客单价" value={compactMoney(data.stats.avgTicketCents)} hint="已完工工单" icon={<BarChart3 size={18} />} tone="violet" />
            <StatCard label="总工单" value={data.stats.orders} hint={`完工率 ${data.stats.orders ? Math.round((data.stats.completed / data.stats.orders) * 100) : 0}%`} icon={<Users size={18} />} tone="amber" />
            <StatCard label="待收款" value={compactMoney(data.stats.unpaidCents)} hint="已完成未结清" icon={<Wallet size={18} />} tone="rose" />
          </div>

          {!hasData && (
            <div className="card mb-4">
              <EmptyState icon={<BarChart3 size={22} />} title="这个时间段还没有完工数据" description="完成工单并收款后，这里会出现收入、服务类型和时段分析。" action={<Link to="/orders/new" className="text-xs font-medium text-brand-600">去新建工单</Link>} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="card p-4 sm:p-5 xl:col-span-2">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">月度收入</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{data.range.from} ~ {data.range.to}</p>
                </div>
                <p className="tabular text-lg font-semibold text-slate-900">{compactMoney(data.monthly.reduce((s, m) => s + m.revenueCents, 0))}</p>
              </div>
              <div className="mt-5 flex h-48 items-end gap-2 sm:gap-3">
                {data.monthly.map((item) => (
                  <div key={item.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="tabular text-[9px] text-slate-400 opacity-0 group-hover:opacity-100">{compactMoney(item.revenueCents)}</span>
                    <div className="flex w-full max-w-[48px] flex-1 items-end">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-all" style={{ height: `${Math.max(3, (item.revenueCents / maxRevenue) * 100)}%` }} title={`${item.month} · ${item.count} 单 · ${money(item.revenueCents)}`} />
                    </div>
                    <span className="text-[10px] text-slate-400">{item.month.slice(5)}月</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">服务项目贡献</h2>
              <p className="mt-0.5 text-xs text-slate-400">按服务名称汇总，不含配件</p>
              {data.services.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">暂无服务数据</p> : (
                <div className="mt-3 space-y-2.5">
                  {data.services.map((item) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-slate-600">{item.name} <span className="text-slate-400">×{item.qty}</span></span>
                        <span className="tabular shrink-0 text-slate-500">{money(item.revenueCents)}</span>
                      </div>
                      <ProgressBar value={item.revenueCents} total={maxService} className="mt-1" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">客户来源</h2>
              <p className="mt-0.5 text-xs text-slate-400">按已完工收入排序</p>
              {data.sources.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">暂无数据</p> : (
                <div className="mt-3 space-y-2.5">
                  {data.sources.map((item) => (
                    <div key={item.source}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{item.source} <span className="text-slate-400">{item.count} 单</span></span>
                        <span className="tabular text-slate-500">{money(item.revenueCents)}</span>
                      </div>
                      <ProgressBar value={item.revenueCents} total={maxSource} className="mt-1" tone="emerald" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">一周分布</h2>
              <p className="mt-0.5 text-xs text-slate-400">哪天最忙</p>
              <div className="mt-3 space-y-1.5">
                {WEEKDAYS.map((label, index) => {
                  const item = data.weekdays.find((w) => w.weekday === index)
                  const count = item?.count ?? 0
                  return (
                    <div key={label} className="flex items-center gap-2 text-[11px]">
                      <span className="w-8 text-slate-400">{label}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                        <div className="h-full rounded bg-brand-400" style={{ width: `${totalWeekday ? (count / Math.max(1, ...data.weekdays.map((w) => w.count))) * 100 : 0}%` }} />
                      </div>
                      <span className="tabular w-8 text-right text-slate-500">{count}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">上门时段</h2>
              <p className="mt-0.5 text-xs text-slate-400">集中在哪些小时</p>
              <div className="mt-3 flex h-32 items-end gap-1">
                {data.hours.length === 0 ? <p className="w-full py-8 text-center text-xs text-slate-400">暂无数据</p> : data.hours.map((item) => (
                  <div key={item.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t bg-violet-400" style={{ height: `${Math.max(4, (item.count / maxHour) * 100)}%` }} title={`${item.hour}:00 · ${item.count} 单`} />
                    <span className="text-[8px] text-slate-400">{item.hour}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-4 sm:p-5 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">客户消费排行</h2>
                <span className="text-[10px] text-slate-400">已完工收入</span>
              </div>
              {data.topCustomers.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">暂无数据</p> : (
                <div className="mt-2 divide-y divide-slate-100">
                  {data.topCustomers.map((customer, index) => (
                    <Link key={customer.id} to={`/customers/${customer.id}`} className="flex items-center gap-3 py-2.5 text-xs hover:text-brand-600">
                      <span className="w-4 text-center text-slate-300">{index + 1}</span>
                      <span className="flex-1 truncate font-medium text-slate-700">{customer.name}</span>
                      <span className="text-slate-400">{customer.count} 单</span>
                      <span className="tabular font-medium text-slate-700">{money(customer.revenueCents)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {data.staff.length > 0 && (
              <section className="card p-4 sm:p-5 xl:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">员工贡献与提成</h2>
                  <span className="text-[10px] text-slate-400">按已完工工单应收 × 提成比例</span>
                </div>
                <div className="mt-2 divide-y divide-slate-100">
                  {data.staff.map((staff) => (
                    <div key={staff.id} className="flex items-center gap-2.5 py-2.5 text-xs">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: staff.color }}>{staff.name.slice(0, 1)}</span>
                      <span className="flex-1 truncate font-medium text-slate-700">{staff.name}</span>
                      <span className="text-slate-400">{staff.count} 单</span>
                      <span className="tabular w-20 text-right text-slate-600">{money(staff.revenueCents)}</span>
                      <span className="tabular w-20 text-right font-medium text-brand-600">{money(staff.commissionCents)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="card bg-gradient-to-br from-ink-950 to-brand-900 p-4 text-white sm:p-5">
              <h2 className="text-sm font-semibold">经营提示</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                当前是{months === 1 ? '本月' : `近 ${months} 个月`}数据。客户自备配件模式下，收入主要来自服务费；重点看完工量、客单价和待收款。
              </p>
              <p className="mt-2 text-[10px] text-slate-400">统计范围：{dayjs(data.range.from).format('M/D')} - {dayjs(data.range.to).format('M/D')}</p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
