import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import type { Customer, Order, Part } from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, money } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Tabs } from '../components/ui'
import { StatusBadge } from '../components/badges'

type TrashTab = 'orders' | 'customers' | 'parts'

export default function Trash() {
  useDocTitle('回收站')
  const { toast, confirm } = useFeedback()
  const [tab, setTab] = useState<TrashTab>('orders')
  const orders = useApi<Order[]>(() => api.trash.orders(), [])
  const customers = useApi<Customer[]>(() => api.trash.customers(), [])
  const parts = useApi<Part[]>(() => api.trash.parts(), [])

  const reloadAll = () => {
    orders.reload()
    customers.reload()
    parts.reload()
  }

  const restoreOrder = async (order: Order) => {
    try {
      await api.orders.restore(order.id)
      toast(`工单 ${order.order_no} 已恢复`)
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const purgeOrder = async (order: Order) => {
    const ok = await confirm({
      title: `彻底删除 ${order.order_no}？`,
      message: '工单、明细、收款记录和现场照片/视频都会永久删除，无法恢复。',
      confirmText: '彻底删除',
      danger: true,
    })
    if (!ok) return
    try {
      await api.orders.purge(order.id)
      toast('已彻底删除')
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const restoreCustomer = async (customer: Customer) => {
    try {
      await api.customers.restore(customer.id)
      toast(`客户 ${customer.name} 已恢复`)
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const purgeCustomer = async (customer: Customer) => {
    const ok = await confirm({ title: `彻底删除客户「${customer.name}」？`, message: '客户档案和地址会永久删除，无法恢复。', confirmText: '彻底删除', danger: true })
    if (!ok) return
    try {
      await api.customers.purge(customer.id)
      toast('客户已彻底删除')
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const restorePart = async (part: Part) => {
    try {
      await api.parts.restore(part.id)
      toast(`配件 ${part.name} 已恢复`)
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const purgePart = async (part: Part) => {
    const ok = await confirm({ title: `彻底删除配件「${part.name}」？`, message: '配件档案、价格历史和库存流水会永久删除；被工单引用时会阻止。', confirmText: '彻底删除', danger: true })
    if (!ok) return
    try {
      await api.parts.purge(part.id)
      toast('配件已彻底删除')
      reloadAll()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const loading = orders.loading || customers.loading || parts.loading
  const error = orders.error || customers.error || parts.error
  const currentCount = tab === 'orders' ? (orders.data?.length ?? 0) : tab === 'customers' ? (customers.data?.length ?? 0) : (parts.data?.length ?? 0)

  return (
    <div>
      <PageHeader
        title="回收站"
        description="工单、客户、配件删除后先放这里，确认无误后再彻底删除"
        actions={<Link to="/orders"><Button variant="secondary"><ArrowLeft size={14} /> 返回工单</Button></Link>}
      />

      <div className="card mb-4 p-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as TrashTab)}
          items={[
            { key: 'orders', label: '工单', count: orders.data?.length ?? 0 },
            { key: 'customers', label: '客户', count: customers.data?.length ?? 0 },
            { key: 'parts', label: '配件', count: parts.data?.length ?? 0 },
          ]}
        />
      </div>

      {error && <ErrorBlock message={error} onRetry={reloadAll} />}
      {loading && !orders.data && !customers.data && !parts.data && <LoadingBlock label="正在读取回收站…" />}
      {!error && currentCount === 0 && (
        <div className="card">
          <EmptyState icon={<Trash2 size={22} />} title="这一类回收站是空的" description="删除后会先出现在这里，可以恢复或彻底删除。" />
        </div>
      )}

      {tab === 'orders' && (orders.data?.length ?? 0) > 0 && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-slate-400">共 {orders.data!.length} 张工单，不会自动清理</p>
          {orders.data!.map((order) => (
            <div key={order.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{order.order_no}</span>
                  <StatusBadge status={order.status} />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">已删除</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{order.customer_name} · {order.address}</p>
                <p className="mt-1 text-[10px] text-slate-400">预约 {fmtDateTime(order.appointment_at)} · 删除于 {order.deleted_at ? fmtDateTime(order.deleted_at) : '—'}</p>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <span className="tabular mr-2 text-sm font-medium text-slate-700">{money(order.total_cents)}</span>
                <Button size="sm" variant="secondary" onClick={() => restoreOrder(order)}><RotateCcw size={13} /> 恢复</Button>
                <Button size="sm" variant="ghost" onClick={() => purgeOrder(order)} className="text-rose-500 hover:bg-rose-50"><Trash2 size={13} /> 彻底删除</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'customers' && (customers.data?.length ?? 0) > 0 && (
        <div className="space-y-2.5">
          {customers.data!.map((customer) => (
            <div key={customer.id} className="card flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{customer.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{customer.name} <span className="text-xs text-slate-400">{customer.phone}</span></p>
                <p className="mt-1 truncate text-[11px] text-slate-400">{customer.address || '无地址'} · 删除于 {customer.deleted_at ? fmtDateTime(customer.deleted_at) : '—'}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => restoreCustomer(customer)}><RotateCcw size={13} /> 恢复</Button>
              <Button size="sm" variant="ghost" onClick={() => purgeCustomer(customer)} className="text-rose-500 hover:bg-rose-50"><Trash2 size={13} /> 彻底删除</Button>
            </div>
          ))}
        </div>
      )}

      {tab === 'parts' && (parts.data?.length ?? 0) > 0 && (
        <div className="space-y-2.5">
          {parts.data!.map((part) => (
            <div key={part.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{part.name} <span className="text-xs text-slate-400">{part.brand} {part.model}</span></p>
                <p className="mt-1 text-[11px] text-slate-400">{part.category} · 库存 {part.stock} · 删除于 {part.deleted_at ? fmtDateTime(part.deleted_at) : '—'}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => restorePart(part)}><RotateCcw size={13} /> 恢复</Button>
              <Button size="sm" variant="ghost" onClick={() => purgePart(part)} className="text-rose-500 hover:bg-rose-50"><Trash2 size={13} /> 彻底删除</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
