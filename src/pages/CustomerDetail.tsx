import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { Customer, CustomerAddress } from '../../shared/types'
import { CUSTOMER_LEVEL_LABELS } from '../../shared/types'
import { api, errorMessage, type CustomerDetailData } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, money, moneyPlain, monthDay } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Avatar, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, StatCard } from '../components/ui'
import { CustomerLevelBadge, ServiceBadge, StatusBadge } from '../components/badges'
import { OrderCard } from '../components/OrderCard'
import { CustomerFormModal } from '../components/CustomerForm'

export default function CustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { data, loading, error, reload } = useApi<CustomerDetailData>(() => api.customers.get(customerId), [customerId])
  const [editOpen, setEditOpen] = useState(false)
  const [addressOpen, setAddressOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null)
  const [addressForm, setAddressForm] = useState({ label: '', address: '', contact_name: '', phone: '' })
  const [addressSaving, setAddressSaving] = useState(false)
  useDocTitle(data ? data.name : '客户详情')

  if (loading && !data) return <LoadingBlock label="正在读取客户档案…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!data) return null

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label}已复制`)
    } catch {
      toast('复制失败，请手动选择文本', 'error')
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `删除客户「${data.name}」？`,
      message: data.stats.order_count > 0
        ? `该客户有 ${data.stats.order_count} 条工单，需先彻底删除工单才能删除客户。`
        : '客户会移入回收站，可在「回收站」恢复或彻底删除。',
      confirmText: '移入回收站',
      danger: true,
    })
    if (!ok) return
    try {
      await api.customers.remove(data.id)
      toast('客户已移入回收站')
      navigate('/customers')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const openAddress = (address?: CustomerAddress) => {
    setEditingAddress(address ?? null)
    setAddressForm(address
      ? { label: address.label, address: address.address, contact_name: address.contact_name, phone: address.phone }
      : { label: '家', address: '', contact_name: data.name, phone: data.phone })
    setAddressOpen(true)
  }

  const saveAddress = async () => {
    if (!addressForm.address.trim()) {
      toast('请填写地址', 'error')
      return
    }
    setAddressSaving(true)
    try {
      if (editingAddress) await api.customers.updateAddress(editingAddress.id, addressForm)
      else await api.customers.createAddress(data.id, addressForm)
      toast(editingAddress ? '地址已更新' : '地址已添加')
      setAddressOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setAddressSaving(false)
    }
  }

  const makeDefaultAddress = async (address: CustomerAddress) => {
    try {
      await api.customers.setDefaultAddress(address.id)
      toast('默认地址已更新')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const removeAddress = async (address: CustomerAddress) => {
    const ok = await confirm({ title: `删除地址「${address.label}」？`, message: '删除后不影响历史工单。', confirmText: '删除', danger: true })
    if (!ok) return
    try {
      await api.customers.deleteAddress(address.id)
      toast('地址已删除')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link to="/customers" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={13} /> 返回客户列表</Link>
      </div>

      <div className="card mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={data.name} color={data.level === 'vip' ? '#b45309' : data.level === 'key' ? '#4f46e5' : '#64748b'} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-slate-900">{data.name}</h1>
              <CustomerLevelBadge level={data.level} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Phone size={12} className="text-slate-300" />{data.phone || '未填电话'}</span>
              <span className="inline-flex items-center gap-1"><MessageSquare size={12} className="text-slate-300" />{data.wechat || '未填微信'}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-300" />{data.district || '未填区域'}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={14} /> 编辑资料</Button>
          {data.orders.length > 0 && (
            <Link to={`/orders/new?customer=${data.id}&copy=${data.orders[0].id}`}>
              <Button variant="secondary"><Copy size={14} /> 复制上一单</Button>
            </Link>
          )}
          <Link to={`/orders/new?customer=${data.id}`}><Button><Plus size={15} /> 给 TA 开单</Button></Link>
          <Button variant="ghost" size="icon" onClick={remove} className="text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="删除客户"><Trash2 size={16} /></Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="历史工单" value={data.stats.order_count} hint={`已完成 ${data.stats.completed_count} 单`} icon={<ShoppingBag size={18} />} tone="brand" />
        <StatCard label="累计消费" value={money(data.stats.total_spent_cents)} hint="仅统计已完成工单" icon={<Wallet size={18} />} tone="emerald" />
        <StatCard label="客单价" value={data.stats.completed_count > 0 ? money(Math.round(data.stats.total_spent_cents / data.stats.completed_count)) : '—'} hint="已完成工单平均" icon={<TrendingUp size={18} />} tone="violet" />
        <StatCard label="最近预约" value={data.stats.last_order_at ? monthDay(data.stats.last_order_at) : '—'} hint={data.stats.last_order_at ? fmtDateTime(data.stats.last_order_at) : '还没有记录'} icon={<CalendarDays size={18} />} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="space-y-4 xl:col-span-2">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">联系与地址</h2>
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><Phone size={14} /></span>
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400">手机号</p>
                  {data.phone ? <a href={`tel:${data.phone}`} className="mt-0.5 block font-medium text-slate-700 hover:text-brand-600">{data.phone}</a> : <p className="mt-0.5 font-medium text-slate-700">未填写</p>}
                </div>
                {data.phone && <button type="button" onClick={() => copy(data.phone, '电话')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-50 hover:text-slate-600"><Copy size={14} /></button>}
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><MessageSquare size={14} /></span>
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400">微信</p>
                  <p className="mt-0.5 font-medium text-slate-700">{data.wechat || '未填写'}</p>
                </div>
                {data.wechat && <button type="button" onClick={() => copy(data.wechat, '微信号')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-50 hover:text-slate-600"><Copy size={14} /></button>}
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><MapPin size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-400">常用地址</p>
                    <button type="button" onClick={() => openAddress()} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">+ 添加地址</button>
                  </div>
                  {data.addresses.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400">还没有保存地址</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {data.addresses.map((address) => (
                        <div key={address.id} className={`rounded-xl border p-2.5 ${address.is_default ? 'border-brand-100 bg-brand-50/30' : 'border-slate-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">{address.label}</span>
                            {address.is_default === 1 && <span className="text-[10px] text-brand-600">默认</span>}
                          </div>
                          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700">{address.address}</p>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-[10px]">
                            <button type="button" onClick={() => copy(address.address, '地址')} className="text-brand-600">复制</button>
                            <a href={`https://uri.amap.com/search?keyword=${encodeURIComponent(address.address)}`} target="_blank" rel="noreferrer" className="text-brand-600">高德地图</a>
                            {address.is_default !== 1 && <button type="button" onClick={() => makeDefaultAddress(address)} className="text-slate-400 hover:text-brand-600">设为默认</button>}
                            <button type="button" onClick={() => openAddress(address)} className="text-slate-400 hover:text-brand-600">编辑</button>
                            <button type="button" onClick={() => removeAddress(address)} className="text-slate-300 hover:text-rose-500">删除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(data.tags || data.notes) && <div className="mt-4 border-t border-slate-100 pt-3">
              {data.tags && <div className="flex flex-wrap gap-1.5">{data.tags.split(',').filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600">#{tag.trim()}</span>)}</div>}
              {data.notes && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">{data.notes}</p>}
            </div>}
          </section>

          <section>
            <div className="mb-2.5 flex items-end justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">历史工单</h2>
                <p className="mt-0.5 text-xs text-slate-400">共 {data.orders.length} 条</p>
              </div>
              <Link to={`/orders/new?customer=${data.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">+ 新建工单</Link>
            </div>
            {data.orders.length === 0 ? (
              <div className="card"><EmptyState icon={<ShoppingBag size={22} />} title="还没有工单" description="给这位客户安排第一单，地址和电话会自动带出。" action={<Link to={`/orders/new?customer=${data.id}`}><Button size="sm"><Plus size={14} /> 新建工单</Button></Link>} /></div>
            ) : (
              <div className="space-y-2.5">
                {data.orders.map((order) => <OrderCard key={order.id} order={{ ...order, customer_name: data.name }} />)}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">客户概览</h2>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">客户等级</span><span className="font-medium text-slate-700">{CUSTOMER_LEVEL_LABELS[data.level]}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">来源渠道</span><span className="font-medium text-slate-700">{data.source || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">所在区域</span><span className="font-medium text-slate-700">{data.district || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">建档时间</span><span className="text-slate-600">{fmtDateTime(data.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">首单时间</span><span className="text-slate-600">{data.stats.first_order_at ? fmtDateTime(data.stats.first_order_at) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">最近预约</span><span className="text-slate-600">{data.stats.last_order_at ? fmtDateTime(data.stats.last_order_at) : '—'}</span></div>
            </div>
          </section>

          <section className="card p-4 text-xs leading-relaxed text-slate-500 sm:p-5">
            <div className="flex items-center gap-2 text-slate-700"><Wallet size={14} className="text-brand-500" /> 客户价值</div>
            <p className="mt-2">累计消费 {money(data.stats.total_spent_cents)}，共完成 {data.stats.completed_count} 单。{data.stats.completed_count >= 2 ? '老客户，可优先安排并主动回访。' : '新客户，完工后记得邀请评价与转介绍。'}</p>
            <p className="mt-2 text-[11px] text-slate-400">平均客单价 {data.stats.completed_count > 0 ? `¥${moneyPlain(Math.round(data.stats.total_spent_cents / data.stats.completed_count))}` : '—'}</p>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">最近订单状态</h2>
            {data.orders.slice(0, 3).map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="mt-3 flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={order.status} />
                  <ServiceBadge type={order.service_type} />
                </div>
                <span className="tabular shrink-0 text-slate-500">{money(order.total_cents)}</span>
              </Link>
            ))}
            {data.orders.length === 0 && <p className="mt-3 text-xs text-slate-400">暂无订单</p>}
          </section>
        </aside>
      </div>

      <Modal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        title={editingAddress ? '编辑地址' : '添加常用地址'}
        footer={<><Button variant="secondary" onClick={() => setAddressOpen(false)}>取消</Button><Button onClick={saveAddress} loading={addressSaving}>保存</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="标签"><Input value={addressForm.label} onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })} placeholder="家 / 公司 / 父母家" /></Field>
          <Field label="联系电话"><Input value={addressForm.phone} onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="地址" required className="sm:col-span-2"><Input value={addressForm.address} onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })} placeholder="小区、楼栋、单元、门牌号" autoFocus /></Field>
          <Field label="现场联系人" className="sm:col-span-2"><Input value={addressForm.contact_name} onChange={(e) => setAddressForm({ ...addressForm, contact_name: e.target.value })} placeholder="默认客户本人" /></Field>
        </div>
      </Modal>

      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={data as Customer}
        onSaved={() => reload()}
      />
    </div>
  )
}
