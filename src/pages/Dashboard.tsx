import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  HardHat,
  MapPin,
  PackageOpen,
  Plus,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react'
import type { DashboardData } from '../../shared/types'
import { ORDER_STATUS_META, ORDER_STATUSES } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { compactMoney, currentDateLabel, fmtTime, greeting, money, monthDay, weekdayCN } from '../lib/format'
import { Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard } from '../components/ui'
import { StatusBadge } from '../components/badges'

export default function Dashboard() {
  useDocTitle('工作台')
  const { data, loading, error, reload } = useApi<DashboardData>(() => api.dashboard(), [])

  if (loading && !data) return <LoadingBlock label="正在整理今天的工作…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!data) return null

  const { stats, trend, todaySchedule, upcomingSchedule, lowStock, recentOrders, statusDistribution, staffRanking, reminders } = data
  const margin = stats.monthRevenueCents > 0 ? Math.round((stats.monthProfitCents / stats.monthRevenueCents) * 100) : 0
  const maxRevenue = Math.max(1, ...trend.map((t) => t.revenueCents))
  const statusCounts = new Map(statusDistribution.map((s) => [s.status, s.count]))
  const nowMonth = new Date().toISOString().slice(0, 7)
  const needsSetup = stats.totalCustomers === 0 && stats.monthOrders === 0
  const trendEmpty = trend.every((t) => t.revenueCents === 0)

  return (
    <div>
      <PageHeader
        eyebrow={currentDateLabel()}
        title={<span>{greeting()}，今天也要一次点亮 <span className="align-middle text-xl">⚡</span></span>}
        description={
          stats.todayOrders > 0
            ? `今天安排了 ${stats.todayOrders} 单，下一单 ${todaySchedule[0] ? `${fmtTime(todaySchedule[0].appointment_at)} · ${todaySchedule[0].customer_name}` : '待确认'}。`
            : '今天暂时没有上门安排，可以整理配件价格或维护常用配置。'
        }
        actions={
          <>
            <Link to="/orders">
              <Button variant="secondary" size="md">查看全部工单</Button>
            </Link>
            <Link to="/orders/new">
              <Button><Plus size={16} /> 新建工单</Button>
            </Link>
          </>
        }
      />

      {needsSetup && (
        <section className="card mb-4 overflow-hidden border-brand-100 bg-gradient-to-br from-white via-white to-brand-50/60 p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/25"><Sparkles size={19} /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">欢迎使用装机管家，先完成这几步</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                  当前为空库。默认按「客户自备配件」开单，只收装机服务费；需要卖配件时再切换为我方提供。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { to: '/settings', label: '设置店铺', icon: Store },
                { to: '/staff', label: '添加员工', icon: HardHat },
                { to: '/customers', label: '添加客户', icon: UserPlus },
                { to: '/orders/new', label: '开第一单', icon: ClipboardList },
              ].map((step, index) => {
                const Icon = step.icon
                return (
                  <Link key={step.to} to={step.to} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-700">{index + 1}</span>
                    <span className="min-w-0 flex-1 text-[11px] font-medium text-slate-700">{step.label}</span>
                    <Icon size={13} className="shrink-0 text-slate-300 group-hover:text-brand-400" />
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="今日预约" value={stats.todayOrders} hint={`未来 7 天还有 ${stats.upcoming7} 单`} tone="brand" icon={<CalendarClock size={18} />} />
        <StatCard label="待办工单" value={stats.pendingCount} hint={`本月新建 ${stats.monthOrders} 单`} tone="amber" icon={<ClipboardList size={18} />} />
        <StatCard label="本月收入" value={compactMoney(stats.monthRevenueCents)} hint={`已完成 ${stats.monthCompleted} 单`} tone="emerald" icon={<TrendingUp size={18} />} />
        <StatCard label="本月毛利" value={compactMoney(stats.monthProfitCents)} hint={`毛利率约 ${margin}%`} tone="violet" icon={<Wallet size={18} />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="space-y-4 xl:col-span-2 xl:space-y-5">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">今日日程</h2>
                <p className="mt-0.5 text-xs text-slate-400">{currentDateLabel()} · 共 {todaySchedule.length} 单</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                全部 <ArrowRight size={13} />
              </Link>
            </div>

            {todaySchedule.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={22} />}
                title="今天没有上门安排"
                description={upcomingSchedule.length > 0 ? `未来 7 天还有 ${upcomingSchedule.length} 单，注意提前备件。` : '给自己放个假，或者去维护一下常用配置。'}
                action={<Link to="/orders/new"><Button size="sm" variant="secondary"><Plus size={14} /> 安排一单</Button></Link>}
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {todaySchedule.map((order) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50/80 sm:px-5">
                    <div className="flex w-12 shrink-0 flex-col items-center">
                      <span className="tabular text-[15px] font-semibold text-slate-900">{fmtTime(order.appointment_at)}</span>
                      <span className="mt-0.5 text-[10px] text-slate-400">{weekdayCN(order.appointment_at)}</span>
                    </div>
                    <div className="h-8 w-px shrink-0 bg-slate-100" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{order.customer_name}</span>
                        <StatusBadge status={order.status} />
                        {order.priority === 'urgent' && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600">加急</span>}
                      </div>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                        <MapPin size={12} className="shrink-0 text-slate-300" />
                        <span className="truncate">{order.address}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {order.service_type === 'new' ? '新机组装' : order.service_type === 'upgrade' ? '升级改造' : order.service_type === 'repair' ? '故障维修' : order.service_type === 'maintenance' ? '清灰保养' : '其他服务'}
                        {order.item_count ? ` · ${order.item_count} 项配件` : ''}
                        {order.staff_name ? ` · ${order.staff_name}` : ''}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="tabular text-sm font-semibold text-slate-900">{money(order.total_cents)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">应收</p>
                    </div>
                    <ArrowUpRight size={16} className="shrink-0 text-slate-300 transition group-hover:text-brand-500" />
                  </Link>
                ))}
              </div>
            )}

            {upcomingSchedule.length > 0 && (
              <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500 sm:px-5">
                <CalendarClock size={13} className="text-brand-500" />
                接下来：{upcomingSchedule.slice(0, 3).map((o) => `${monthDay(o.appointment_at)} ${o.customer_name}`).join(' · ')}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">收入趋势</h2>
                <p className="mt-0.5 text-xs text-slate-400">近 6 个月已完工工单收入</p>
              </div>
              <div className="text-right">
                <p className="tabular text-lg font-semibold text-slate-900">{compactMoney(trend.reduce((s, t) => s + t.revenueCents, 0))}</p>
                <p className="text-[10px] text-slate-400">累计</p>
              </div>
            </div>

            {trendEmpty ? (
              <div className="mt-5 flex h-44 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/40">
                <CalendarDays size={20} className="text-slate-300" />
                <p className="text-xs text-slate-400">完成第一单后，这里会出现收入趋势</p>
              </div>
            ) : (
            <div className="mt-5 flex h-44 items-end gap-2 sm:gap-4">
              {trend.map((item) => {
                const height = Math.max(4, (item.revenueCents / maxRevenue) * 100)
                const isCurrent = item.month === nowMonth
                return (
                  <div key={item.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="tabular text-[10px] font-medium text-slate-400 opacity-0 transition group-hover:opacity-100">{money(item.revenueCents)}</span>
                    <div className="flex w-full max-w-[46px] flex-1 items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${isCurrent ? 'bg-gradient-to-t from-brand-600 to-brand-400' : 'bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-brand-300 group-hover:to-brand-200'}`}
                        style={{ height: `${height}%` }}
                        title={`${item.month} · ${item.count} 单 · ${money(item.revenueCents)}`}
                      />
                    </div>
                    <span className={`text-[10px] ${isCurrent ? 'font-semibold text-brand-600' : 'text-slate-400'}`}>{item.month.slice(5)}月</span>
                  </div>
                )
              })}
            </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900">最近工单</h2>
              <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">全部 <ArrowRight size={13} /></Link>
            </div>
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={20} />}
                title="还没有工单"
                description="新建第一张工单后，最近的记录会出现在这里。"
                action={<Link to="/orders/new"><Button size="sm" variant="secondary"><Plus size={14} /> 新建工单</Button></Link>}
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentOrders.map((order) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/80 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-slate-800">{order.customer_name}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{order.order_no} · {order.template_name || order.staff_name || '—'}</p>
                    </div>
                    <span className="tabular shrink-0 text-[13px] font-medium text-slate-700">{money(order.total_cents)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4 xl:space-y-5">
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Bell size={15} className="text-brand-500" /> 待办提醒</h2>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">{reminders.length}</span>
            </div>
            {reminders.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">没有待办，安心干活 👌</p>
            ) : (
              <div className="mt-2 space-y-1">
                {reminders.slice(0, 8).map((reminder) => {
                  const dots = { blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-rose-500', violet: 'bg-violet-500' }
                  return (
                    <Link key={reminder.id} to={`/orders/${reminder.order_id}`} className="flex items-start gap-2.5 rounded-lg px-1.5 py-2 transition hover:bg-slate-50">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dots[reminder.tone]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-slate-700">{reminder.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">{reminder.detail}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">工单状态</h2>
              <span className="text-[11px] text-slate-400">{stats.pendingCount} 单未完成</span>
            </div>
            <div className="mt-4 space-y-3">
              {ORDER_STATUSES.map((status) => {
                const count = statusCounts.get(status) ?? 0
                const total = Math.max(1, [...statusCounts.values()].reduce((a, b) => a + b, 0))
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${ORDER_STATUS_META[status].dot}`} />
                        {ORDER_STATUS_META[status].label}
                      </span>
                      <span className="tabular text-slate-400">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${ORDER_STATUS_META[status].dot} opacity-80`} style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">低库存提醒</h2>
                <p className="mt-0.5 text-[11px] text-slate-400">库存 ≤ 预警值</p>
              </div>
              <Link to="/parts" className="text-xs font-medium text-brand-600 hover:text-brand-700">去补货</Link>
            </div>
            {lowStock.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                {stats.partsCount === 0 ? '还没有配件，先去配件库添加；客户自备配件可以不建库存。' : '库存充足，放心接单 👍'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {lowStock.slice(0, 5).map((part) => (
                  <div key={part.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-700">{part.name}</p>
                      <p className="text-[10px] text-slate-400">{part.category}{part.supplier ? ` · ${part.supplier}` : ''}</p>
                    </div>
                    <span className={`tabular rounded-full px-2 py-0.5 text-[10px] font-medium ${part.stock === 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                      剩 {part.stock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">员工本月业绩</h2>
              <HardHat size={15} className="text-slate-300" />
            </div>
            {staffRanking.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">本月还没有完工单</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {staffRanking.map((staff, index) => (
                  <div key={staff.id} className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] font-semibold text-slate-300">{index + 1}</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: staff.color }}>
                      {staff.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700">{staff.name}</p>
                      <p className="text-[10px] text-slate-400">{staff.count} 单{staff.commissionCents > 0 ? ` · 提成 ${compactMoney(staff.commissionCents)}` : ''}</p>
                    </div>
                    <span className="tabular text-xs font-medium text-slate-600">{compactMoney(staff.revenueCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card bg-gradient-to-br from-ink-950 to-brand-900 p-4 text-white sm:p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-brand-200">
              <PackageOpen size={15} /> 小提示
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              上门前先看工单里的地址和配件清单，现场照片直接手机拍摄上传，完工后让客户在验收单上签字。
            </p>
            <Link to="/templates" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-200 hover:text-white">
              管理常用配置 <ArrowRight size={12} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}
