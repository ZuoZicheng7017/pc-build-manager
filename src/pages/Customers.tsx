import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Pencil, Plus, Users } from 'lucide-react'
import type { Customer } from '../../shared/types'
import { CUSTOMER_LEVELS, CUSTOMER_LEVEL_LABELS } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDebounced, useDocTitle } from '../lib/hooks'
import { money, relativeTime } from '../lib/format'
import { Avatar, Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput, Tabs } from '../components/ui'
import { CustomerLevelBadge } from '../components/badges'
import { CustomerFormModal } from '../components/CustomerForm'

export default function Customers() {
  useDocTitle('客户')
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('all')
  const debouncedQ = useDebounced(q)
  const { data, loading, error, reload } = useApi<Customer[]>(
    () => api.customers.list({ q: debouncedQ, level: level === 'all' ? undefined : level }),
    [debouncedQ, level],
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  return (
    <div>
      <PageHeader
        title="客户"
        description="客户档案、地址与消费记录，一次上门终身可查"
        actions={<Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={16} /> 新建客户</Button>}
      />

      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <Tabs
          value={level}
          onChange={setLevel}
          items={[
            { key: 'all', label: '全部客户' },
            ...CUSTOMER_LEVELS.map((l) => ({ key: l, label: CUSTOMER_LEVEL_LABELS[l] })),
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="搜索姓名、电话、地址…" className="w-full sm:w-64" />
          <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">{data?.length ?? 0} 位</span>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="正在读取客户…" />}

      {!error && data && data.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Users size={22} />}
            title={q ? '没有找到匹配的客户' : '还没有客户'}
            description={q ? '换个关键词试试，或清空搜索。' : '录入第一位客户，之后开单就能直接带出电话和地址。'}
            action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={14} /> 新建客户</Button>}
          />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((customer) => (
            <div key={customer.id} className="card group relative p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5">
              <Link to={`/customers/${customer.id}`} className="absolute inset-0 rounded-2xl" aria-label={`查看 ${customer.name}`} />
              <div className="relative flex items-start gap-3">
                <Avatar name={customer.name} size="lg" color={customer.level === 'vip' ? '#b45309' : customer.level === 'key' ? '#4f46e5' : '#64748b'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-slate-900">{customer.name}</span>
                    <CustomerLevelBadge level={customer.level} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{customer.phone || '未填电话'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{customer.wechat ? `微信 ${customer.wechat}` : customer.source || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(customer); setFormOpen(true) }}
                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                  aria-label="编辑客户"
                >
                  <Pencil size={14} />
                </button>
                <ChevronRight size={16} className="mt-1 shrink-0 text-slate-200 transition group-hover:text-brand-400" />
              </div>

              <p className="relative mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                <MapPin size={13} className="mt-0.5 shrink-0 text-slate-300" />
                <span className="line-clamp-1">{customer.address || '未填写地址'}</span>
              </p>

              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {customer.district && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{customer.district}</span>}
                {customer.source && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{customer.source}</span>}
                {customer.tags?.split(',').filter(Boolean).slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600">#{tag.trim()}</span>)}
              </div>

              <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-[10px] text-slate-400">工单</p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-slate-800">{customer.order_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">累计消费</p>
                  <p className="tabular mt-0.5 text-sm font-semibold text-slate-800">{money(customer.total_spent_cents)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">最近</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{customer.last_order_at ? relativeTime(customer.last_order_at) : '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        onSaved={(customer) => {
          reload()
          if (!editing) navigate(`/customers/${customer.id}`)
          setEditing(null)
        }}
      />
    </div>
  )
}
