import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  CreditCard,
  ExternalLink,
  FileDown,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  PenLine,
  Printer,
  Share2,
  Trash2,
  Upload,
  User,
  Video,
  Wallet,
} from 'lucide-react'
import type { ChecklistItem, MediaCategory, OrderDetail as OrderDetailType, OrderMedia, OrderStatus, PaymentKind } from '../../shared/types'
import {
  DEFAULT_CHECKLIST,
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  ORDER_STATUS_META,
  PAYMENT_KINDS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SERVICE_TYPE_LABELS,
} from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { fmtDateTime, formatBytes, money, moneyInput, parseMoney, relativeTime, fmtTime, fmtDate } from '../lib/format'
import { prepareImage } from '../lib/media'
import { useFeedback } from '../lib/feedback'
import { Avatar, Badge, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, ProgressBar, Select } from '../components/ui'
import { CustomerLevelBadge, PartsSourceBadge, PaymentBadge, ServiceBadge, StatusBadge } from '../components/badges'
import { FollowUpCard } from '../components/FollowUpCard'
import { SignaturePad } from '../components/SignaturePad'

const MAIN_STEPS: OrderStatus[] = ['pending', 'scheduled', 'en_route', 'working', 'completed']

interface UploadTask {
  id: string
  name: string
  progress: number
  kind: 'image' | 'video'
}

export default function OrderDetail() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { data: order, loading, error, reload, setData } = useApi<OrderDetailType>(() => api.orders.get(orderId), [orderId])
  useDocTitle(order ? `工单 ${order.order_no}` : '工单详情')

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payKind, setPayKind] = useState<PaymentKind>('final')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('wechat')
  const [payNote, setPayNote] = useState('')
  const [savingPay, setSavingPay] = useState(false)
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const [mediaCategory, setMediaCategory] = useState<MediaCategory>('during')
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [signatureSaving, setSignatureSaving] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const steps = MAIN_STEPS
  const currentIndex = order ? steps.indexOf(order.status) : -1
  const closed = order?.status === 'cancelled' || order?.status === 'after_sales'

  const checklistDone = useMemo(() => order?.checklist.filter((i) => i.done).length ?? 0, [order])
  const precheckDone = useMemo(() => order?.precheck.filter((i) => i.done).length ?? 0, [order])

  if (loading && !order) return <LoadingBlock label="正在读取工单详情…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!order) return null

  const applyStatus = async (next: OrderStatus) => {
    if (next === order.status) return
    if (next === 'cancelled') {
      const ok = await confirm({ title: '取消这张工单？', message: '取消后仍会保留记录，可随时改回其他状态。', confirmText: '取消工单', danger: true })
      if (!ok) return
    }
    try {
      const updated = await api.orders.setStatus(order.id, next)
      setData(updated)
      toast(`已更新为「${ORDER_STATUS_META[next].label}」`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const toggleChecklist = async (item: ChecklistItem) => {
    const next = order.checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
    const previous = order.checklist
    setData({ ...order, checklist: next })
    try {
      const updated = await api.orders.setChecklist(order.id, next)
      setData(updated)
    } catch (err) {
      setData({ ...order, checklist: previous })
      toast(errorMessage(err), 'error')
    }
  }

  const completeAllChecklist = async () => {
    const next = order.checklist.map((i) => ({ ...i, done: true }))
    try {
      const updated = await api.orders.setChecklist(order.id, next)
      setData(updated)
      toast('检查清单已全部勾选')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const resetChecklist = async () => {
    const next = DEFAULT_CHECKLIST.map((i) => ({ ...i }))
    try {
      const updated = await api.orders.setChecklist(order.id, next)
      setData(updated)
      toast('已恢复默认检查清单')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const openPayment = () => {
    const owedNow = Math.max(0, order.total_cents - order.paid_cents)
    setPayKind('final')
    setPayAmount(owedNow > 0 ? moneyInput(owedNow) : '')
    setPayMethod(order.payment_method)
    setPayNote('')
    setPayOpen(true)
  }

  const savePayment = async () => {
    if (parseMoney(payAmount) <= 0) {
      toast('请输入大于 0 的收款金额', 'error')
      return
    }
    setSavingPay(true)
    try {
      const updated = await api.orders.addPayment(order.id, {
        kind: payKind,
        amount_cents: parseMoney(payAmount),
        method: payMethod,
        note: payNote,
      })
      setData(updated)
      setPayOpen(false)
      toast(`${PAYMENT_KIND_LABELS[payKind]}已记录`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSavingPay(false)
    }
  }

  const removePayment = async (paymentId: number) => {
    const ok = await confirm({ title: '删除这笔收款记录？', message: '会重新计算已收金额与欠款。', confirmText: '删除', danger: true })
    if (!ok) return
    try {
      const updated = await api.orders.deletePayment(paymentId)
      setData(updated)
      toast('收款记录已删除')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const togglePrecheck = async (item: ChecklistItem) => {
    const next = order.precheck.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
    const previous = order.precheck
    setData({ ...order, precheck: next })
    try {
      const updated = await api.orders.setPrecheck(order.id, next)
      setData(updated)
    } catch (err) {
      setData({ ...order, precheck: previous })
      toast(errorMessage(err), 'error')
    }
  }

  const confirmPartsRisk = async () => {
    try {
      const updated = await api.orders.setPrecheck(order.id, order.precheck, true, order.parts_confirm_note)
      setData(updated)
      toast('已标记客户确认自备件风险')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const uploadFiles = async (files: FileList | null, kind: 'image' | 'video') => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    for (const file of list) {
      const maxSize = kind === 'video' ? 300 * 1024 * 1024 : 25 * 1024 * 1024
      if (file.size > maxSize) {
        toast(`${file.name} 超过 ${kind === 'video' ? '300MB' : '25MB'} 上限`, 'error')
        continue
      }
      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setUploads((prev) => [...prev, { id: taskId, name: file.name, progress: 0, kind }])
      try {
        const prepared = kind === 'image' ? await prepareImage(file) : file
        const media = await api.uploadMedia(
          order.id,
          prepared,
          kind === 'image' ? `${MEDIA_CATEGORY_LABELS[mediaCategory]}照片` : `${MEDIA_CATEGORY_LABELS[mediaCategory]}视频`,
          (progress) => setUploads((prev) => prev.map((t) => (t.id === taskId ? { ...t, progress } : t))),
          mediaCategory,
        )
        setData((prev) => (prev ? { ...prev, media: [media, ...prev.media] } : prev))
        toast(`${kind === 'image' ? '图片' : '视频'}上传成功`)
      } catch (err) {
        toast(errorMessage(err), 'error')
      } finally {
        setUploads((prev) => prev.filter((t) => t.id !== taskId))
      }
    }
    if (imageInput.current) imageInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
    if (videoInput.current) videoInput.current.value = ''
  }

  const deleteMedia = async (media: OrderMedia) => {
    const ok = await confirm({ title: '删除这段现场记录？', message: '文件会从本机删除，无法恢复。', confirmText: '删除', danger: true })
    if (!ok) return
    try {
      await api.orders.deleteMedia(media.id)
      setData({ ...order, media: order.media.filter((m) => m.id !== media.id) })
      setPreviewIndex(null)
      toast('已删除')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const deleteOrder = async () => {
    const ok = await confirm({
      title: `删除工单 ${order.order_no}？`,
      message: '工单会移入回收站，现场照片和收款记录会保留；可在「回收站」恢复或彻底删除。',
      confirmText: '移入回收站',
      danger: true,
    })
    if (!ok) return
    try {
      await api.orders.remove(order.id)
      toast('工单已移入回收站')
      navigate('/orders')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const shareOrder = async () => {
    setShareBusy(true)
    try {
      const { token } = await api.orders.share(order.id)
      setShareToken(token)
      setShareOpen(true)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setShareBusy(false)
    }
  }

  const revokeShare = async () => {
    const ok = await confirm({
      title: '撤销客户分享链接？',
      message: '撤销后原链接立即失效，客户无法再查看。需要时可重新生成新链接。',
      confirmText: '撤销链接',
      danger: true,
    })
    if (!ok) return
    try {
      await api.orders.revokeShare(order.id)
      setShareToken('')
      toast('分享链接已撤销')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : ''

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label}已复制`)
    } catch {
      toast('复制失败，请手动选择文本', 'error')
    }
  }

  const signature = order.media.find((m) => m.category === 'signature')
  const saveSignature = async (blob: Blob) => {
    setSignatureSaving(true)
    try {
      const file = new File([blob], `signature-${order.id}.png`, { type: 'image/png' })
      await api.uploadMedia(order.id, file, '客户签名', undefined, 'signature')
      const updated = await api.orders.get(order.id)
      setData(updated)
      setSignatureOpen(false)
      toast('客户签名已保存')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSignatureSaving(false)
    }
  }

  const preview = previewIndex !== null ? order.media[previewIndex] : null
  const paid = order.paid_cents
  const owed = Math.max(0, order.total_cents - paid)
  const profit = order.total_cents - order.cost_cents
  const mapHref = `https://uri.amap.com/search?keyword=${encodeURIComponent(order.address || '')}`

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/orders" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={13} /> 返回工单列表</Link>}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {order.order_no}
            <StatusBadge status={order.status} />
            <PartsSourceBadge source={order.parts_source} />
            {order.priority === 'urgent' && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 ring-1 ring-inset ring-rose-200">加急</span>}
          </span>
        }
        description={`${order.customer_name} · ${SERVICE_TYPE_LABELS[order.service_type]} · 预约 ${fmtDateTime(order.appointment_at)}`}
        actions={
          <>
            <Link to={`/orders/${order.id}/edit`}><Button variant="secondary"><Pencil size={14} /> 编辑</Button></Link>
            <Link to={`/orders/${order.id}/print`}><Button variant="secondary"><Printer size={14} /> 打印</Button></Link>
            <a href={`/api/orders/${order.id}/quote.pdf`} target="_blank" rel="noreferrer"><Button variant="secondary"><FileDown size={14} /> 报价单 PDF</Button></a>
            <Button variant="secondary" onClick={shareOrder} loading={shareBusy}><Share2 size={14} /> 分享</Button>
            <Button variant="ghost" size="icon" onClick={deleteOrder} aria-label="删除工单" className="text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></Button>
          </>
        }
      />

      <section className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><ClipboardCheck size={20} /></span>
            <div>
              <p className="text-xs text-slate-400">当前进度</p>
              <p className="text-sm font-semibold text-slate-900">{ORDER_STATUS_META[order.status].label}{order.status === 'completed' ? ' · 已验收' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CalendarClock size={14} />
            {fmtDate(order.appointment_at)} {fmtTime(order.appointment_at)}
            {order.staff_name && <><span className="text-slate-200">|</span><User size={13} />{order.staff_name}</>}
          </div>
        </div>

        <div className="no-scrollbar mt-5 overflow-x-auto pb-1">
          <div className="flex w-full items-center">
          {steps.map((step, index) => {
            const done = currentIndex >= 0 && index <= currentIndex && !closed
            const active = index === currentIndex && !closed
            return (
              <div key={step} className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                <button
                  type="button"
                  onClick={() => applyStatus(step)}
                  className="group flex shrink-0 flex-col items-center gap-1.5"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-4 transition sm:h-8 sm:w-8 sm:text-[11px] ${
                    active ? 'bg-brand-600 text-white ring-brand-100' : done ? 'bg-brand-50 text-brand-600 ring-brand-50' : 'bg-slate-100 text-slate-400 ring-slate-50 group-hover:bg-slate-200'
                  }`}>
                    {done && !active ? <Check size={13} /> : index + 1}
                  </span>
                  <span className={`whitespace-nowrap text-[9px] sm:text-[10px] ${active ? 'font-semibold text-brand-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>{ORDER_STATUS_META[step].label}</span>
                </button>
                {index < steps.length - 1 && <div className={`mx-1 h-0.5 flex-1 rounded-full sm:mx-2 ${currentIndex > index && !closed ? 'bg-brand-200' : 'bg-slate-100'}`} />}
              </div>
            )
          })}
          </div>
        </div>

        {closed && (
          <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs ${order.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>
            <span>{order.status === 'cancelled' ? '该工单已取消，可点击上方步骤恢复进度。' : '该工单正在售后处理中，可在处理完成后改回「已完成」。'}</span>
            <button type="button" onClick={() => applyStatus('completed')} className="shrink-0 font-medium underline-offset-2 hover:underline">标记完成</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {currentIndex >= 0 && currentIndex < steps.length - 1 && (
            <Button size="sm" onClick={() => applyStatus(steps[currentIndex + 1])}>
              下一步：{ORDER_STATUS_META[steps[currentIndex + 1]].label}
            </Button>
          )}
          {order.status !== 'after_sales' && <Button size="sm" variant="secondary" onClick={() => applyStatus('after_sales')}>转售后</Button>}
          {order.status !== 'cancelled' && <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => applyStatus('cancelled')}>取消工单</Button>}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="min-w-0 space-y-4 xl:col-span-2 xl:space-y-5">
          <section className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><MapPin size={19} /></span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">上门地址</p>
                  <p className="mt-0.5 text-[15px] font-semibold leading-relaxed text-slate-900">{order.address || '未填写地址'}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{order.contact_name}</span>
                    <span>{order.contact_phone}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => copy(order.address, '地址')}><Copy size={13} /> <span className="hidden sm:inline">复制</span></Button>
                <a href={mapHref} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary"><MapPin size={13} /> <span className="hidden sm:inline">导航</span></Button></a>
              </div>
            </div>
            {order.description && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
                <MessageSquare size={13} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{order.description}</span>
              </div>
            )}
          </section>

          {order.precheck.length > 0 && (
            <section className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">上门前确认</h2>
                  <p className="mt-0.5 text-xs text-slate-400">兼容性核对 · {precheckDone} / {order.precheck.length} 项完成</p>
                </div>
                {order.parts_confirmed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-600"><Check size={12} /> 客户已确认风险</span>
                ) : order.parts_source !== 'shop' ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-600">待客户确认</span>
                ) : null}
              </div>

              {!order.parts_confirmed && order.parts_source !== 'shop' && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800">
                  <span>自备件兼容性、DOA 与数据风险需客户确认，避免售后争议。</span>
                  <button type="button" onClick={confirmPartsRisk} className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-amber-700">标记已确认</button>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {order.precheck.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePrecheck(item)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[11px] transition ${item.done ? 'border-emerald-100 bg-emerald-50/50 text-slate-400' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{item.done && <Check size={10} />}</span>
                    <span className={item.done ? 'line-through' : ''}>{item.label}</span>
                  </button>
                ))}
              </div>
              {order.parts_confirm_note && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">{order.parts_confirm_note}</p>}
            </section>
          )}

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{order.parts_source === 'customer' ? '客户自备配件' : '配置清单'}</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {order.items.length} 项
                  {order.parts_source === 'customer' ? ' · 仅记录型号，不计费' : ` · 共 ${money(order.items.reduce((s, i) => s + i.qty * i.unit_price_cents, 0))}`}
                </p>
              </div>
              <Link to={`/orders/${order.id}/edit`} className="text-xs font-medium text-brand-600 hover:text-brand-700">编辑清单</Link>
            </div>
            {order.items.length === 0 ? (
              <EmptyState
                icon={<Package size={20} />}
                title={order.parts_source === 'customer' ? '客户自备配件（未登记型号）' : '无配件明细'}
                description={order.parts_source === 'customer' ? '本单只收装机服务费；如需留档，可在编辑工单里登记客户自带的型号。' : '维修、清灰等服务可以不填配件，费用记在装机服务费里。'}
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium sm:px-5">配件</th>
                      <th className="px-2 py-2.5 text-center font-medium">数量</th>
                      <th className="px-2 py-2.5 text-right font-medium">{order.parts_source === 'customer' ? '计费' : '成交单价'}</th>
                      <th className="px-4 py-2.5 text-right font-medium sm:px-5">{order.parts_source === 'customer' ? '收费' : '小计'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 sm:px-5">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          {item.spec && <p className="mt-0.5 text-[10px] text-slate-400">{item.spec}</p>}
                        </td>
                        <td className="tabular px-2 py-3 text-center text-slate-500">×{item.qty}</td>
                        <td className="tabular px-2 py-3 text-right text-slate-600">
                          {order.parts_source === 'customer' ? <span className="text-emerald-600">自备</span> : money(item.unit_price_cents)}
                        </td>
                        <td className="tabular px-4 py-3 text-right font-medium text-slate-900 sm:px-5">
                          {order.parts_source === 'customer' ? <span className="text-slate-300">—</span> : money(item.qty * item.unit_price_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">费用与收款</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {order.parts_source === 'customer' ? '客户自备配件，本单只收服务费' : '成本与毛利仅自己可见'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={openPayment}><CreditCard size={14} /> 收款记录</Button>
            </div>

            {order.services.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">服务项目</p>
                <div className="space-y-1 text-xs">
                  {order.services.map((service) => (
                    <div key={service.id} className="flex justify-between gap-3">
                      <span className="text-slate-600">{service.name}{service.qty > 1 ? ` ×${service.qty}` : ''}</span>
                      <span className="tabular text-slate-700">{money(service.price_cents * service.qty)}</span>
                    </div>
                  ))}
                  {order.service_extra_cents > 0 && (
                    <div className="flex justify-between gap-3"><span className="text-slate-600">其他服务费</span><span className="tabular text-slate-700">{money(order.service_extra_cents)}</span></div>
                  )}
                  <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 font-medium"><span className="text-slate-500">服务费合计</span><span className="tabular text-slate-800">{money(order.labor_fee_cents)}</span></div>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
              <div className="space-y-2">
                {order.parts_source === 'customer' ? (
                  <div className="flex justify-between"><span className="text-slate-400">客户自备配件</span><span className="text-emerald-600">不计费</span></div>
                ) : (
                  <div className="flex justify-between"><span className="text-slate-400">配件小计</span><span className="tabular text-slate-700">{money(order.items.reduce((s, i) => s + i.qty * i.unit_price_cents, 0))}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-400">服务费合计</span><span className="tabular text-slate-700">{money(order.labor_fee_cents)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">上门费</span><span className="tabular text-slate-700">{money(order.travel_fee_cents)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">材料费</span><span className="tabular text-slate-700">{money(order.material_fee_cents)}</span></div>
                {order.discount_cents > 0 && <div className="flex justify-between"><span className="text-slate-400">优惠</span><span className="tabular text-rose-500">-{money(order.discount_cents)}</span></div>}
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-2 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                <div className="flex justify-between"><span className="text-slate-400">{order.parts_source === 'customer' ? '配件成本（自备）' : '配件成本'}</span><span className="tabular text-slate-600">{money(order.cost_cents)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">毛利</span><span className="tabular font-medium text-emerald-600">{money(profit)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">已收款</span><span className="tabular text-slate-700">{money(paid)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">欠款</span><span className={`tabular font-medium ${owed > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{money(owed)}</span></div>
                <div className="flex items-center justify-between pt-1"><span className="text-slate-400">收款状态</span><PaymentBadge status={order.payment_status} /></div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3.5 text-white">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">应收合计</p>
                <p className="tabular mt-0.5 text-2xl font-semibold">{money(order.total_cents)}</p>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                <p>{order.parts_source === 'customer' ? '客户自备 · 仅收装机服务费' : '配件 + 服务费'}</p>
                <p className="mt-0.5">{PAYMENT_METHOD_LABELS[order.payment_method]} · {order.payment_status === 'paid' ? '已结清' : owed > 0 ? `待收 ${money(owed)}` : '已结清'}</p>
                <p className="mt-0.5">质保 {order.warranty_months} 个月</p>
              </div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">现场记录</h2>
                <p className="mt-0.5 text-xs text-slate-400">照片与视频保存在本机，图片上传前会自动压缩</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={mediaCategory} onChange={(e) => setMediaCategory(e.target.value as MediaCategory)} className="h-8 w-auto min-w-[96px] py-0 text-[11px]">
                  {MEDIA_CATEGORIES.map((category) => <option key={category} value={category}>{MEDIA_CATEGORY_LABELS[category]}</option>)}
                </Select>
                <Button size="sm" variant="secondary" onClick={() => cameraInput.current?.click()}><Camera size={14} /> 拍照</Button>
                <Button size="sm" variant="secondary" onClick={() => imageInput.current?.click()}><ImageIcon size={14} /> 相册</Button>
                <Button size="sm" variant="secondary" onClick={() => videoInput.current?.click()}><Video size={14} /> 视频</Button>
                <Button size="sm" variant="secondary" onClick={() => setSignatureOpen(true)}><PenLine size={14} /> 客户签名</Button>
                {order.media.length > 0 && (
                  <a href={`/api/orders/${order.id}/media.zip`}><Button size="sm" variant="ghost"><Upload size={13} /> 打包下载</Button></a>
                )}
              </div>
            </div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadFiles(e.target.files, 'image')} />
            <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files, 'image')} />
            <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={(e) => uploadFiles(e.target.files, 'video')} />

            {uploads.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploads.map((task) => (
                  <div key={task.id} className="rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5 text-brand-700">
                        <Upload size={12} /> <span className="truncate">{task.name}</span>
                      </span>
                      <span className="tabular text-brand-500">{task.progress}%</span>
                    </div>
                    <ProgressBar value={task.progress} total={100} className="mt-2" />
                  </div>
                ))}
              </div>
            )}

            {signature && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <img src={signature.url} alt="客户签名" className="h-14 w-32 rounded-lg border border-slate-200 bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700">客户签名已留存</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{fmtDateTime(signature.created_at)} · 可打印在验收单</p>
                </div>
                <button type="button" onClick={() => deleteMedia(signature)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="删除签名"><Trash2 size={14} /></button>
              </div>
            )}

            {order.media.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                <Camera size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">还没有现场记录，拍照或上传一段视频留个底</p>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {order.media.map((media, index) => (
                  <div key={media.id} className="group relative overflow-hidden rounded-xl bg-slate-900">
                    <button type="button" onClick={() => setPreviewIndex(index)} className="block aspect-[4/3] w-full">
                      {media.kind === 'image' ? (
                        <img src={media.url} alt={media.caption || media.file_name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-800">
                          <video src={media.url} preload="metadata" muted className="absolute inset-0 h-full w-full object-cover opacity-80" />
                          <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg"><Video size={18} /></span>
                        </div>
                      )}
                    </button>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-2 pt-6">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-white/15 px-1 py-0.5 text-[8px] text-white/80">{MEDIA_CATEGORY_LABELS[media.category] ?? '现场'}</span>
                        <p className="truncate text-[10px] font-medium text-white">{media.caption || (media.kind === 'video' ? '现场视频' : '现场照片')}</p>
                      </div>
                      <p className="text-[9px] text-white/50">{formatBytes(media.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteMedia(media)}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/55 text-white opacity-0 backdrop-blur transition hover:bg-rose-600 group-hover:opacity-100"
                      aria-label="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">装机检查清单</h2>
                <p className="mt-0.5 text-xs text-slate-400">{checklistDone} / {order.checklist.length} 项已完成</p>
              </div>
              <div className="flex gap-2">
                {order.checklist.length === 0 && <Button size="sm" variant="secondary" onClick={resetChecklist}>使用默认清单</Button>}
                {order.checklist.length > 0 && checklistDone < order.checklist.length && <Button size="sm" variant="ghost" onClick={completeAllChecklist}><CheckCircle2 size={14} /> 全部完成</Button>}
              </div>
            </div>
            <ProgressBar value={checklistDone} total={order.checklist.length || 1} className="mt-3" tone={checklistDone === order.checklist.length && order.checklist.length > 0 ? 'emerald' : 'brand'} />
            {order.checklist.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">暂无检查项，可恢复默认清单</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {order.checklist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleChecklist(item)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs transition ${item.done ? 'border-emerald-100 bg-emerald-50/50 text-slate-400' : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200'}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {item.done && <Check size={12} />}
                    </span>
                    <span className={item.done ? 'line-through' : ''}>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {(order.status === 'completed' || order.status === 'after_sales') && (
            <FollowUpCard order={order} onUpdated={setData} />
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:space-y-5">
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">客户信息</h2>
              {order.customer && <Link to={`/customers/${order.customer.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">客户档案</Link>}
            </div>
            {order.customer ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <Avatar name={order.customer.name} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{order.customer.name}</p>
                      <CustomerLevelBadge level={order.customer.level} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{order.customer.district || '未填区域'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5 text-xs">
                  <button type="button" onClick={() => copy(order.customer?.phone || '', '电话')} className="flex w-full items-center gap-2 text-left text-slate-600 hover:text-brand-600">
                    <Phone size={13} className="text-slate-300" /> {order.customer.phone || '未填电话'} <Copy size={11} className="ml-auto text-slate-300" />
                  </button>
                  <div className="flex items-center gap-2 text-slate-600"><MessageSquare size={13} className="text-slate-300" /> 微信 {order.customer.wechat || '—'}</div>
                  <div className="flex items-start gap-2 text-slate-500"><MapPin size={13} className="mt-0.5 shrink-0 text-slate-300" /><span className="leading-relaxed">{order.customer.address || '未填默认地址'}</span></div>
                </div>
                {order.customer.tags && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {order.customer.tags.split(',').filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">#{tag.trim()}</span>)}
                  </div>
                )}
                {order.customer.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">{order.customer.notes}</p>}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">客户信息已删除</p>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">工单信息</h2>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between gap-3"><span className="shrink-0 text-slate-400">工单号</span><button type="button" onClick={() => copy(order.order_no, '单号')} className="font-medium text-slate-700 hover:text-brand-600">{order.order_no}</button></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">服务类型</span><ServiceBadge type={order.service_type} /></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">指派员工</span><span className="font-medium text-slate-700">{order.staff_name || '未指派'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">来源配置</span><span className="max-w-[150px] truncate text-right font-medium text-slate-700">{order.template_name || '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">创建时间</span><span className="text-slate-600">{fmtDateTime(order.created_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">完成时间</span><span className="text-slate-600">{order.completed_at ? fmtDateTime(order.completed_at) : '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">质保</span><span className="text-slate-600">{order.warranty_months} 个月</span></div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">进度时间线</h2>
              <span className="text-[10px] text-slate-400">{order.logs.length} 条</span>
            </div>
            {order.logs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">暂无记录</p>
            ) : (
              <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
                {order.logs.map((log, index) => (
                  <div key={log.id} className="relative flex gap-3">
                    {index < order.logs.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-slate-100" />}
                    <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand-400 ring-1 ring-brand-100" />
                    <div className="min-w-0 pb-1">
                      <p className="text-xs font-medium text-slate-700">{log.action}</p>
                      {log.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{log.detail}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-300">{fmtDateTime(log.created_at)} · {relativeTime(log.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 text-xs leading-relaxed text-slate-500 sm:p-5">
            <div className="flex items-center gap-2 text-slate-700"><Wallet size={14} className="text-brand-500" /> 收款提示</div>
            <p className="mt-2">完工后请当场和客户核对费用，在「收款记录」中登记定金、尾款或退款，欠款会自动计算。</p>
          </section>
        </aside>
      </div>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="客户分享链接"
        description="只读页面，客户可查看服务进度、配件、照片与费用，不包含成本和内部备注"
        footer={<Button variant="secondary" onClick={() => setShareOpen(false)}>关闭</Button>}
      >
        {shareUrl ? (
          <>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="font-mono text-[11px]" />
              <Button variant="secondary" onClick={() => copy(shareUrl, '分享链接')}>复制</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={shareUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary"><ExternalLink size={13} /> 预览</Button></a>
              <Button size="sm" variant="ghost" onClick={revokeShare} className="text-rose-500 hover:bg-rose-50"><Trash2 size={13} /> 撤销链接</Button>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">链接长期有效，请只发给当前客户；撤销后需要重新生成。</p>
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-slate-500">链接已撤销或尚未生成。</p>
            <Button size="sm" className="mt-3" onClick={shareOrder}>重新生成链接</Button>
          </div>
        )}
      </Modal>

      <Modal
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        title="客户签名确认"
        description="请客户确认服务已完成、费用无误后签名"
        size="lg"
      >
        <SignaturePad onSave={saveSignature} saving={signatureSaving} />
      </Modal>

      {preview && previewIndex !== null && (
        <Modal
          open
          onClose={() => setPreviewIndex(null)}
          title={preview.caption || (preview.kind === 'video' ? '现场视频' : '现场照片')}
          description={`${preview.file_name} · ${formatBytes(preview.size)}`}
          size="xl"
          footer={
            <>
              <Button variant="secondary" size="sm" disabled={previewIndex <= 0} onClick={() => setPreviewIndex(previewIndex - 1)}><ChevronLeft size={14} /> 上一张</Button>
              <Button variant="secondary" size="sm" disabled={previewIndex >= order.media.length - 1} onClick={() => setPreviewIndex(previewIndex + 1)}>下一张 <ChevronRight size={14} /></Button>
              <Button variant="danger" size="sm" onClick={() => deleteMedia(preview)}><Trash2 size={14} /> 删除</Button>
            </>
          }
        >
          <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-slate-950">
            {preview.kind === 'video' ? (
              <video src={preview.url} controls autoPlay className="max-h-[68vh] w-full" />
            ) : (
              <img src={preview.url} alt={preview.caption} className="max-h-[68vh] w-full object-contain" />
            )}
          </div>
        </Modal>
      )}

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="收款记录"
        description={`应收 ${money(order.total_cents)} · 已收 ${money(order.paid_cents)} · 欠款 ${money(owed)}`}
        size="md"
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>关闭</Button><Button onClick={savePayment} loading={savingPay}><CreditCard size={14} /> 记录收款</Button></>}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">已收 / 应收</p>
              <p className="tabular mt-0.5 text-lg font-semibold">{money(order.paid_cents)} <span className="text-xs font-normal text-slate-400">/ {money(order.total_cents)}</span></p>
            </div>
            <PaymentBadge status={order.payment_status} />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">历史收款</p>
            {order.payments.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3.5 py-4 text-center text-[11px] text-slate-400">还没有收款记录</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {order.payments.map((payment) => {
                  const tone = payment.kind === 'refund' ? 'red' : payment.kind === 'deposit' ? 'blue' : payment.kind === 'final' ? 'green' : 'slate'
                  return (
                    <div key={payment.id} className="flex items-center gap-2 px-3 py-2.5 text-xs">
                      <Badge tone={tone}>{PAYMENT_KIND_LABELS[payment.kind]}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="tabular font-medium text-slate-800">{payment.kind === 'refund' ? '-' : ''}{money(payment.amount_cents)}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{PAYMENT_METHOD_LABELS[payment.method]} · {fmtDateTime(payment.paid_at)}{payment.note ? ` · ${payment.note}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => removePayment(payment.id)} className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="删除收款"><Trash2 size={13} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-3 text-xs font-medium text-slate-600">新增收款</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="类型">
                <Select value={payKind} onChange={(e) => setPayKind(e.target.value as PaymentKind)}>
                  {PAYMENT_KINDS.map((kind) => <option key={kind} value={kind}>{PAYMENT_KIND_LABELS[kind]}</option>)}
                </Select>
              </Field>
              <Field label="方式">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="金额（元）" className="mt-3">
              <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" autoFocus className="text-right tabular" />
            </Field>
            <Field label="备注（选填）" className="mt-3">
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="如：微信收到尾款" />
            </Field>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              退款请选择「退款」，金额填正数；已收金额会自动重新计算。
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
