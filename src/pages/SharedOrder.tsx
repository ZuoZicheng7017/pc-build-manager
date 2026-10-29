import { Link, useParams } from 'react-router-dom'
import { CalendarDays, Check, MapPin, Phone, ShieldCheck, Wrench } from 'lucide-react'
import type { SharedOrder as SharedOrderType } from '../../shared/types'
import { MEDIA_CATEGORY_LABELS, SERVICE_TYPE_LABELS, PARTS_SOURCE_LABELS } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, money, relativeTime } from '../lib/format'
import { ErrorBlock, LoadingBlock } from '../components/ui'
import { StatusBadge } from '../components/badges'

export default function SharedOrder() {
  const { token } = useParams()
  const { data, loading, error, reload } = useApi<SharedOrderType>(() => api.shared(token ?? ''), [token])
  useDocTitle(data ? `${data.order.order_no} 服务进度` : '服务进度')

  if (loading && !data) return <LoadingBlock label="正在加载服务进度…" />
  if (error) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4"><ErrorBlock message={error} onRetry={reload} /></div>
  if (!data) return null

  const { order, shop } = data
  const mediaImages = data.media.filter((m) => m.kind === 'image' && m.category !== 'signature')
  const signature = data.media.find((m) => m.category === 'signature')

  return (
    <div className="min-h-dvh bg-slate-100 pb-8">
      <header className="bg-gradient-to-br from-ink-950 via-ink-950 to-brand-900 px-5 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-semibold ring-1 ring-white/15">装</span>
            <div>
              <p className="text-sm font-semibold">{shop.name || '装机管家'}</p>
              <p className="text-[10px] tracking-wider text-slate-400">上门装机服务 · 进度查询</p>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-400">您好，{order.contact_name || data.customer_name}</p>
          <h1 className="mt-1 text-xl font-semibold">
            {order.status === 'completed' ? '您的装机服务已完成' : order.status === 'cancelled' ? '这张工单已取消' : '您的装机服务进度'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] text-slate-300">{SERVICE_TYPE_LABELS[order.service_type]}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] text-slate-300">{PARTS_SOURCE_LABELS[order.parts_source]}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-lg space-y-3 px-4">
        <section className="card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><CalendarDays size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-slate-400">预约上门</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{fmtDateTime(order.appointment_at)}</p>
              <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-slate-500"><MapPin size={12} className="mt-0.5 shrink-0" />{order.address}</p>
            </div>
          </div>
          {order.completed_at && <p className="mt-2 text-[10px] text-emerald-600">完成于 {fmtDateTime(order.completed_at)}</p>}
          {order.description && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">{order.description}</p>}
        </section>

        <section className="card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Wrench size={15} className="text-brand-500" /> 服务项目</h2>
          <div className="mt-2 space-y-1.5 text-xs">
            {data.services.length === 0 ? <p className="text-slate-400">标准上门服务</p> : data.services.map((service) => (
              <div key={service.id} className="flex justify-between gap-3">
                <span className="text-slate-600">{service.name}{service.qty > 1 ? ` ×${service.qty}` : ''}</span>
                <span className="tabular text-slate-700">{money(service.price_cents * service.qty)}</span>
              </div>
            ))}
          </div>
        </section>

        {data.items.length > 0 && (
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{order.parts_source === 'customer' ? '您的自备配件' : '配件明细'}</h2>
              <span className="text-[10px] text-slate-400">{order.parts_source === 'customer' ? '仅记录，不计费' : ''}</span>
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              {data.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3">
                  <span className="text-slate-600">{item.name} <span className="text-slate-400">×{item.qty}</span></span>
                  <span className="tabular text-slate-700">{order.parts_source === 'customer' ? '自备' : money(item.unit_price_cents * item.qty)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] text-slate-400">应收合计</p>
              <p className="tabular mt-0.5 text-2xl font-semibold text-slate-900">{money(order.total_cents)}</p>
            </div>
            <div className="text-right text-[10px] text-slate-400">
              <p>装机服务费 {money(order.labor_fee_cents)}</p>
              {order.travel_fee_cents > 0 && <p>上门费 {money(order.travel_fee_cents)}</p>}
              {order.discount_cents > 0 && <p>优惠 -{money(order.discount_cents)}</p>}
              <p>质保 {order.warranty_months} 个月</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700">
            <ShieldCheck size={13} /> {order.parts_source === 'customer' ? '配件由您自备，本单仅收取服务费' : '配件与服务费按工单结算'}
          </div>
        </section>

        {data.checklist.total > 0 && (
          <section className="card p-4">
            <div className="flex items-center justify-between text-xs">
              <h2 className="text-sm font-semibold text-slate-900">装机检查</h2>
              <span className="text-slate-400">{data.checklist.done} / {data.checklist.total} 项完成</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.checklist.total ? (data.checklist.done / data.checklist.total) * 100 : 0}%` }} />
            </div>
            {data.checklist.done === data.checklist.total && <p className="mt-2 flex items-center gap-1 text-[10px] text-emerald-600"><Check size={12} /> 全部检查项已完成</p>}
          </section>
        )}

        {mediaImages.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900">现场照片</h2>
            <p className="mt-0.5 text-[10px] text-slate-400">共 {mediaImages.length} 张</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {mediaImages.map((media) => (
                <a key={media.id} href={media.url} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-xl bg-slate-900">
                  <img src={media.url} alt={media.caption} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" />
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-slate-950/60 px-1.5 py-0.5 text-[8px] text-white">{MEDIA_CATEGORY_LABELS[media.category] ?? '现场'}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {signature && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900">客户签名</h2>
            <img src={signature.url} alt="客户签名" className="mt-2 h-20 rounded-lg border border-slate-100 bg-white object-contain" />
          </section>
        )}

        {data.media.some((m) => m.kind === 'video') && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900">现场视频</h2>
            <div className="mt-2 space-y-2">
              {data.media.filter((m) => m.kind === 'video').map((media) => (
                <video key={media.id} src={media.url} controls preload="metadata" className="w-full rounded-xl bg-slate-950" />
              ))}
            </div>
          </section>
        )}

        <section className="card p-4">
          <p className="text-xs font-medium text-slate-700">需要联系装机师？</p>
          <a href={`tel:${shop.phone}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-medium text-white">
            <Phone size={15} /> {shop.phone || '电话联系'}
          </a>
          <p className="mt-2 text-center text-[10px] text-slate-400">服务由 {shop.name} 提供 · 单号 {order.order_no}</p>
        </section>

        <div className="flex items-center justify-between px-2 text-[10px] text-slate-400">
          <span>更新于 {relativeTime(order.completed_at || order.appointment_at)}</span>
          <Link to="/" className="hover:text-brand-500">装机管家</Link>
        </div>
      </main>
    </div>
  )
}
