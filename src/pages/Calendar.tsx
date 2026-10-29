import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus } from 'lucide-react'
import type { Order } from '../../shared/types'
import { ORDER_STATUS_META } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { money } from '../lib/format'
import { Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '../components/ui'
import { StatusBadge } from '../components/badges'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function Calendar() {
  useDocTitle('日程')
  const [cursor, setCursor] = useState(dayjs().startOf('month'))
  const [selected, setSelected] = useState(dayjs().format('YYYY-MM-DD'))

  const gridStart = cursor.startOf('month').startOf('week')
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day')), [gridStart.valueOf()])
  const from = days[0].format('YYYY-MM-DD')
  const to = days[41].format('YYYY-MM-DD')

  const { data, loading, error, reload } = useApi(
    () => api.orders.list({ from, to, pageSize: 100 }),
    [from, to],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const order of data?.items ?? []) {
      if (order.status === 'cancelled') continue
      const key = order.appointment_at.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(order)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.appointment_at.localeCompare(b.appointment_at))
    return map
  }, [data])

  const selectedOrders = grouped.get(selected) ?? []
  const monthOrders = (data?.items ?? []).filter((o) => o.appointment_at.slice(0, 7) === cursor.format('YYYY-MM') && o.status !== 'cancelled')
  const completed = monthOrders.filter((o) => o.status === 'completed' || o.status === 'after_sales')
  const revenue = completed.reduce((sum, o) => sum + o.total_cents, 0)
  const today = dayjs().format('YYYY-MM-DD')

  const changeMonth = (offset: number) => {
    const next = cursor.add(offset, 'month').startOf('month')
    setCursor(next)
    setSelected(next.format('YYYY-MM-DD'))
  }

  return (
    <div>
      <PageHeader
        title="日程"
        description="按月查看上门安排，点日期查看当天路线与订单"
        actions={<Link to="/orders/new"><Button><Plus size={15} /> 新建工单</Button></Link>}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-400">本月工单</p>
          <p className="tabular mt-1 text-xl font-semibold text-slate-900">{monthOrders.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">已完成</p>
          <p className="tabular mt-1 text-xl font-semibold text-emerald-600">{completed.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">完工收入</p>
          <p className="tabular mt-1 text-xl font-semibold text-slate-900">{money(revenue)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => changeMonth(-1)} aria-label="上个月"><ChevronLeft size={16} /></Button>
            <h2 className="min-w-[110px] text-center text-sm font-semibold text-slate-900">{cursor.format('YYYY 年 M 月')}</h2>
            <Button size="icon" variant="ghost" onClick={() => changeMonth(1)} aria-label="下个月"><ChevronRight size={16} /></Button>
            <Button size="sm" variant="secondary" className="ml-1" onClick={() => { const now = dayjs(); setCursor(now.startOf('month')); setSelected(now.format('YYYY-MM-DD')) }}>今天</Button>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            {Object.entries(ORDER_STATUS_META).filter(([key]) => key !== 'cancelled').map(([key, meta]) => (
              <span key={key} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
            ))}
          </div>
        </div>

        {error && <ErrorBlock message={error} onRetry={reload} />}
        {loading && !data && <LoadingBlock label="正在读取日历…" />}

        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
          {WEEKDAYS.map((day) => <div key={day} className="py-2 text-center text-[10px] font-medium text-slate-400">周{day}</div>)}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = day.format('YYYY-MM-DD')
            const orders = grouped.get(key) ?? []
            const inMonth = day.month() === cursor.month()
            const isToday = key === today
            const isSelected = key === selected
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`min-h-[86px] border-b border-r border-slate-100 p-1.5 text-left align-top transition sm:min-h-[104px] sm:p-2 ${inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 text-slate-300'} ${isSelected ? 'ring-2 ring-inset ring-brand-400' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>{day.date()}</span>
                  {orders.length > 0 && <span className="rounded-full bg-brand-50 px-1.5 text-[9px] font-medium text-brand-600">{orders.length}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {orders.slice(0, 2).map((order) => (
                    <span key={order.id} className="hidden items-center gap-1 truncate rounded bg-slate-50 px-1 py-0.5 text-[9px] text-slate-500 sm:flex">
                      <span className={`h-1 w-1 shrink-0 rounded-full ${ORDER_STATUS_META[order.status].dot}`} />
                      <span className="shrink-0 text-slate-400">{order.appointment_at.slice(11, 16)}</span>
                      <span className="truncate">{order.customer_name}</span>
                    </span>
                  ))}
                  <span className="flex gap-0.5 sm:hidden">
                    {orders.slice(0, 4).map((order) => <span key={order.id} className={`h-1.5 w-1.5 rounded-full ${ORDER_STATUS_META[order.status].dot}`} />)}
                  </span>
                  {orders.length > 2 && <span className="hidden text-[9px] text-slate-300 sm:block">+{orders.length - 2} 单</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card mt-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CalendarDays size={15} className="text-brand-500" />{dayjs(selected).format('M 月 D 日')} {selected === today ? '· 今天' : ''}</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">{selectedOrders.length} 单安排</p>
          </div>
          <Link to={`/orders/new?appointment=${selected}T10:00`} className="text-xs font-medium text-brand-600 hover:text-brand-700">+ 安排到这天</Link>
        </div>

        {selectedOrders.length === 0 ? (
          <EmptyState icon={<CalendarDays size={20} />} title="这一天没有安排" description="点击其他日期查看，或者新建一单。" className="py-8" />
        ) : (
          <div className="mt-3 space-y-2">
            {selectedOrders.map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-50/60">
                <div className="w-12 shrink-0 text-center">
                  <p className="tabular text-[13px] font-semibold text-slate-900">{order.appointment_at.slice(11, 16)}</p>
                  <p className="text-[9px] text-slate-400">{order.service_type === 'new' ? '装机' : '服务'}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-800">{order.customer_name}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-400"><MapPin size={10} />{order.address}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 size={10} />{order.service_count ? `${order.service_count} 项服务` : ''}{(order.item_count ?? 0) > 0 ? ` · ${order.item_count} 项配件` : ''}</p>
                </div>
                <span className="tabular shrink-0 text-xs font-medium text-slate-700">{money(order.total_cents)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
