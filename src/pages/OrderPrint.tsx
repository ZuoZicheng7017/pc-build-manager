import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, FileDown, Printer } from 'lucide-react'
import type { OrderDetail, Settings } from '../../shared/types'
import { SERVICE_TYPE_LABELS, PAYMENT_METHOD_LABELS, CUSTOMER_LEVEL_LABELS } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, fmtFullDate, money } from '../lib/format'
import { Button, ErrorBlock, LoadingBlock } from '../components/ui'

export default function OrderPrint() {
  const { id } = useParams()
  const orderId = Number(id)
  const { data: order, loading, error, reload } = useApi<OrderDetail>(() => api.orders.get(orderId), [orderId])
  const { data: settings } = useApi<Settings>(() => api.settings.get(), [])
  useDocTitle(order ? `${order.order_no} 验收单` : '打印验收单')

  if (loading && !order) return <LoadingBlock label="正在准备验收单…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!order) return null

  const itemsTotal = order.items.reduce((s, i) => s + i.qty * i.unit_price_cents, 0)
  const doneCount = order.checklist.filter((i) => i.done).length
  const precheckDone = order.precheck.filter((i) => i.done).length
  const shopName = settings?.shop_name || '装机管家'
  const signature = order.media.find((m) => m.category === 'signature')

  return (
    <div className="min-h-dvh bg-slate-100 py-4 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> 返回工单
        </Link>
        <div className="flex gap-2">
          <Link to={`/orders/${order.id}/edit`}><Button variant="secondary" size="sm">编辑工单</Button></Link>
          <a href={`/api/orders/${order.id}/quote.pdf`} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm"><FileDown size={14} /> 报价单 PDF</Button></a>
          <Button size="sm" onClick={() => window.print()}><Printer size={14} /> 打印 / 另存 PDF</Button>
        </div>
      </div>

      <div className="print-sheet mx-auto max-w-[210mm] bg-white px-8 py-10 shadow-xl shadow-slate-900/5 print:px-0 print:py-0 print:shadow-none sm:px-12">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">装</span>
              <div>
                <h1 className="text-lg font-bold tracking-wide text-slate-900">{shopName}</h1>
                <p className="text-[10px] tracking-[0.18em] text-slate-400">PC BUILD & SERVICE</p>
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-slate-500">
              <p>电话：{settings?.shop_phone || '—'}</p>
              <p>地址：{settings?.shop_address || '—'}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold tracking-[0.2em] text-slate-900">装机服务验收单</h2>
            <p className="mt-2 text-[11px] text-slate-500">单号：<span className="font-mono text-slate-800">{order.order_no}</span></p>
            <p className="mt-0.5 text-[11px] text-slate-500">打印日期：{fmtFullDate(new Date().toISOString())}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-[11px] leading-relaxed print:bg-slate-50">
          <p><span className="inline-block w-14 text-slate-400">客户</span><span className="font-medium text-slate-800">{order.customer_name}</span>{order.customer ? <span className="ml-1 text-slate-400">（{CUSTOMER_LEVEL_LABELS[order.customer.level]}）</span> : null}</p>
          <p><span className="inline-block w-14 text-slate-400">联系电话</span><span className="text-slate-800">{order.contact_phone || '—'}</span></p>
          <p><span className="inline-block w-14 text-slate-400">服务类型</span><span className="text-slate-800">{SERVICE_TYPE_LABELS[order.service_type]}</span></p>
          <p><span className="inline-block w-14 text-slate-400">配件来源</span><span className="text-slate-800">{order.parts_source === 'customer' ? '客户自备' : order.parts_source === 'mixed' ? '部分自备' : '我方提供'}</span></p>
          <p><span className="inline-block w-14 text-slate-400">预约时间</span><span className="text-slate-800">{fmtDateTime(order.appointment_at)}</span></p>
          <p className="col-span-2"><span className="inline-block w-14 align-top text-slate-400">上门地址</span><span className="text-slate-800">{order.address || '—'}</span></p>
          <p><span className="inline-block w-14 text-slate-400">装机师</span><span className="text-slate-800">{order.staff_name || '—'}</span></p>
          <p><span className="inline-block w-14 text-slate-400">质保</span><span className="text-slate-800">{order.warranty_months} 个月</span></p>
        </section>

        {order.services.length > 0 && (
          <section className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
              <span className="h-3 w-1 rounded-full bg-slate-900" /> 服务项目
            </h3>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] text-slate-500">
                  <th className="px-2 py-1.5 font-medium">服务</th>
                  <th className="w-10 px-2 py-1.5 text-center font-medium">数量</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">单价</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">小计</th>
                </tr>
              </thead>
              <tbody>
                {order.services.map((service) => (
                  <tr key={service.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-800">{service.name}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{service.qty}</td>
                    <td className="px-2 py-2 text-right tabular text-slate-600">{money(service.price_cents)}</td>
                    <td className="px-2 py-2 text-right tabular text-slate-800">{money(service.price_cents * service.qty)}</td>
                  </tr>
                ))}
                {order.service_extra_cents > 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-800">其他服务费</td>
                    <td className="px-2 py-2 text-center text-slate-600">1</td>
                    <td className="px-2 py-2 text-right tabular text-slate-600">{money(order.service_extra_cents)}</td>
                    <td className="px-2 py-2 text-right tabular text-slate-800">{money(order.service_extra_cents)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
            <span className="h-3 w-1 rounded-full bg-slate-900" /> 配件明细
            {order.parts_source === 'customer' && <span className="font-normal text-slate-400">（配件由客户自备，不计入收费）</span>}
          </h3>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] text-slate-500">
                <th className="px-2 py-1.5 font-medium">名称</th>
                <th className="px-2 py-1.5 font-medium">规格 / 说明</th>
                <th className="w-10 px-2 py-1.5 text-center font-medium">数量</th>
                <th className="w-20 px-2 py-1.5 text-right font-medium">{order.parts_source === 'customer' ? '计费' : '单价'}</th>
                <th className="w-20 px-2 py-1.5 text-right font-medium">{order.parts_source === 'customer' ? '收费' : '小计'}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-400">无配件明细（服务费见下方）</td></tr>
              ) : order.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-slate-800">{item.name}</td>
                  <td className="px-2 py-2 text-slate-500">{item.spec || '—'}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{item.qty}</td>
                  <td className="px-2 py-2 text-right tabular text-slate-600">{order.parts_source === 'customer' ? '自备' : money(item.unit_price_cents)}</td>
                  <td className="px-2 py-2 text-right tabular text-slate-800">{order.parts_source === 'customer' ? '—' : money(item.qty * item.unit_price_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-[11px]">
            {order.parts_source === 'customer' ? (
              <div className="flex justify-between"><span className="text-slate-400">客户自备配件</span><span className="text-emerald-700">不计费</span></div>
            ) : (
              <div className="flex justify-between"><span className="text-slate-400">配件小计</span><span className="tabular text-slate-700">{money(itemsTotal)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-400">服务费合计</span><span className="tabular text-slate-700">{money(order.labor_fee_cents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">上门费</span><span className="tabular text-slate-700">{money(order.travel_fee_cents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">材料费</span><span className="tabular text-slate-700">{money(order.material_fee_cents)}</span></div>
            {order.discount_cents > 0 && <div className="flex justify-between"><span className="text-slate-400">优惠</span><span className="tabular text-slate-700">-{money(order.discount_cents)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-slate-300 pt-2 text-sm font-bold"><span>应收合计</span><span className="tabular">{money(order.total_cents)}</span></div>
            <div className="flex justify-between text-[10px] text-slate-400"><span>已收（{PAYMENT_METHOD_LABELS[order.payment_method]}）</span><span className="tabular">{money(order.paid_cents)}</span></div>
            <div className="flex justify-between text-[10px] text-slate-400"><span>未收</span><span className="tabular">{money(Math.max(0, order.total_cents - order.paid_cents))}</span></div>
          </div>
        </section>

        {order.precheck.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
              <span className="h-3 w-1 rounded-full bg-slate-900" /> 上门前确认
              <span className="font-normal text-slate-400">（已完成 {precheckDone}/{order.precheck.length} 项{order.parts_confirmed ? '，客户已确认自备件风险' : ''}）</span>
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-slate-600">
              {order.precheck.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                    {item.done && <Check size={9} />}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
            {order.parts_confirm_note && <p className="mt-2 text-[10px] text-slate-500">备注：{order.parts_confirm_note}</p>}
          </section>
        )}

        <section className="mt-6">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
            <span className="h-3 w-1 rounded-full bg-slate-900" /> 装机检查清单
            <span className="font-normal text-slate-400">（已完成 {doneCount}/{order.checklist.length} 项）</span>
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-slate-600">
            {order.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                  {item.done && <Check size={9} />}
                </span>
                {item.label}
              </div>
            ))}
          </div>
        </section>

        {order.description && (
          <section className="mt-5">
            <h3 className="mb-1.5 text-xs font-bold text-slate-800">备注</h3>
            <p className="whitespace-pre-wrap rounded-md border border-slate-200 px-3 py-2 text-[10px] leading-relaxed text-slate-600">{order.description}</p>
          </section>
        )}

        <section className="mt-5 rounded-md border border-slate-200 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
          <p>
            · {order.parts_source === 'customer' ? `装机服务质保 ${order.warranty_months} 个月；配件由客户自备，配件质保按厂商政策由客户自行处理。` : `整机质保 ${order.warranty_months} 个月，配件质保以厂商政策为准；`}
            人为损坏、超频、进水不在质保范围。
          </p>
          {order.parts_source === 'customer' && (
            <p>· 本单配件由客户自备，仅收取服务费；配件兼容性、DOA 与数据风险由客户承担{order.parts_confirmed ? '（客户已确认）' : '（尚未确认）'}。</p>
          )}
          <p>· 请妥善保管本验收单，售后时出示单号即可查询装机记录与现场照片。</p>
          <p>· 系统与驱动已调试完成，建议客户当场核对配置并测试常用软件。</p>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-10 text-[11px]">
          <div>
            <p className="text-slate-400">客户签字确认</p>
            {signature ? (
              <img src={signature.url} alt="客户签名" className="mt-1 h-16 object-contain object-left" />
            ) : (
              <div className="mt-8 border-b border-slate-400" />
            )}
            <p className="mt-1 text-[10px] text-slate-400">日期：{fmtFullDate(order.completed_at || order.appointment_at)}</p>
          </div>
          <div>
            <p className="text-slate-400">装机师签字</p>
            <div className="mt-8 border-b border-slate-400" />
            <p className="mt-1 text-[10px] text-slate-400">日期：____ 年 __ 月 __ 日</p>
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[9px] text-slate-300">
          <span>{shopName} · 装机管家生成</span>
          <span>{order.order_no}</span>
        </footer>
      </div>
    </div>
  )
}
