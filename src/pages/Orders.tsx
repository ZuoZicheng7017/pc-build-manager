import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, FilterX, Plus, SlidersHorizontal } from 'lucide-react'
import type { Order, OrderListResult, Staff } from '../../shared/types'
import { ORDER_STATUSES, ORDER_STATUS_META } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDebounced, useDocTitle } from '../lib/hooks'
import { OrderCard } from '../components/OrderCard'
import { Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination, SearchInput, Select, Tabs } from '../components/ui'

const PAGE_SIZE = 10

export default function Orders() {
  useDocTitle('装机工单')
  const [searchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const [status, setStatus] = useState<string>(initialStatus && ORDER_STATUSES.includes(initialStatus as never) ? initialStatus : 'all')
  const [q, setQ] = useState('')
  const [staffId, setStaffId] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const debouncedQ = useDebounced(q)
  const { data: staff } = useApi<Staff[]>(() => api.staff.list(), [])

  useEffect(() => { setPage(1) }, [debouncedQ, status, staffId, from, to])

  const { data, loading, error, reload } = useApi<OrderListResult>(
    () => api.orders.list({
      q: debouncedQ,
      status: status === 'all' ? undefined : status,
      staffId: staffId || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedQ, status, staffId, from, to, page],
  )

  const hasFilters = !!q || status !== 'all' || staffId !== 0 || !!from || !!to
  const reset = () => {
    setQ('')
    setStatus('all')
    setStaffId(0)
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div>
      <PageHeader
        title="装机工单"
        description="从预约上门到验收收款，每一单都有迹可循"
        actions={
          <Link to="/orders/new">
            <Button><Plus size={16} /> 新建工单</Button>
          </Link>
        }
      />

      <div className="card mb-4 p-3 sm:p-4">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { key: 'all', label: '全部' },
            ...ORDER_STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_META[s].label })),
          ]}
        />

        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="搜索单号、客户、电话、地址…" className="w-full sm:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Select value={staffId} onChange={(e) => setStaffId(Number(e.target.value))} className="h-10 py-0 text-xs">
              <option value={0}>全部员工</option>
              {staff?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5">
              <span className="shrink-0 text-[11px] text-slate-400">起</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full min-w-0 bg-transparent text-xs text-slate-600 outline-none" />
            </label>
            <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5">
              <span className="shrink-0 text-[11px] text-slate-400">止</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full min-w-0 bg-transparent text-xs text-slate-600 outline-none" />
            </label>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-9 justify-start text-slate-400">
                <FilterX size={14} /> 清空筛选
              </Button>
            )}
          </div>
          <div className="ml-auto hidden items-center gap-1.5 text-[11px] text-slate-400 sm:flex">
            <SlidersHorizontal size={13} />
            {data ? `共 ${data.total} 单` : '按预约时间排序'}
          </div>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取工单…" />}

      {!error && data && data.items.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={hasFilters ? '没有符合条件的工单' : '还没有工单'}
            description={hasFilters ? '试试换个关键词或清空筛选条件。' : '新建第一张工单，把客户、配置和上门时间记下来。'}
            action={hasFilters
              ? <Button variant="secondary" size="sm" onClick={reset}>清空筛选</Button>
              : <Link to="/orders/new"><Button size="sm"><Plus size={14} /> 新建工单</Button></Link>}
          />
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={loading ? 'pointer-events-none opacity-60 transition' : ''}>
          <div className="space-y-2.5">
            {data.items.map((order: Order) => <OrderCard key={order.id} order={order} />)}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
