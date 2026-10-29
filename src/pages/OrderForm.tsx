import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, MapPin, PackagePlus, Plus, Save, Trash2, UserPlus, Wand2 } from 'lucide-react'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  ORDER_STATUS_META,
  ORDER_STATUSES,
  PARTS_SOURCES,
  PARTS_SOURCE_DESCRIPTIONS,
  PARTS_SOURCE_LABELS,
  DEFAULT_PRECHECK,
  calcOrderTotal,
  type BuildTemplate,
  type ChecklistItem,
  type Customer,
  type CustomerAddress,
  type OrderDetail,
  type OrderStatus,
  type Part,
  type PartsSource,
  type ServiceItem,
  type ServiceType,
  type Settings,
  type Staff,
} from '../../shared/types'
import { api, errorMessage, type CustomerPayload } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { defaultAppointment, moneyInput, money, parseMoney, toDateTimeInput } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { CustomerSelect } from '../components/CustomerSelect'
import {
  Button,
  Field,
  FormGrid,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui'

interface Row {
  key: string
  kind: 'part' | 'custom'
  partId: number | null
  name: string
  spec: string
  qty: number
  price: string
  costCents: number
  note: string
}

interface SelectedService {
  key: string
  serviceItemId: number
  name: string
  priceCents: number
  qty: number
}

let rowSeq = 0
function newRow(): Row {
  rowSeq += 1
  return { key: `row-${rowSeq}`, kind: 'part', partId: null, name: '', spec: '', qty: 1, price: '', costCents: 0, note: '' }
}

const emptyCustomer: CustomerPayload = {
  name: '', phone: '', wechat: '', address: '', district: '', source: '转介绍', level: 'normal', tags: '', notes: '',
}

export default function OrderForm() {
  const { id } = useParams()
  const isEdit = !!id
  const orderId = Number(id)
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const [searchParams] = useSearchParams()
  const templateParam = Number(searchParams.get('template')) || 0
  const customerParam = Number(searchParams.get('customer')) || 0
  const copyParam = Number(searchParams.get('copy')) || 0
  const appointmentParam = searchParams.get('appointment') || ''
  useDocTitle(isEdit ? '编辑工单' : '新建工单')

  const { data: existing, loading: loadingOrder } = useApi<OrderDetail | null>(
    () => (isEdit ? api.orders.get(orderId) : Promise.resolve(null)),
    [orderId, isEdit],
  )
  const { data: customers, reload: reloadCustomers } = useApi<Customer[]>(() => api.customers.list(), [])
  const { data: staff } = useApi<Staff[]>(() => api.staff.list(), [])
  const { data: parts } = useApi<Part[]>(() => api.parts.list(), [])
  const { data: templates } = useApi<BuildTemplate[]>(() => api.templates.list(), [])
  const { data: settings } = useApi<Settings>(() => api.settings.get(), [])
  const { data: catalogServices } = useApi<ServiceItem[]>(() => api.serviceItems.list(true), [])
  const { data: copySource } = useApi<OrderDetail | null>(
    () => (copyParam ? api.orders.get(copyParam) : Promise.resolve(null)),
    [copyParam],
  )

  const [customerId, setCustomerId] = useState(0)
  const { data: customerAddresses } = useApi<CustomerAddress[]>(
    () => (customerId ? api.customers.addresses(customerId) : Promise.resolve([])),
    [customerId],
  )
  const [staffId, setStaffId] = useState(0)
  const [serviceType, setServiceType] = useState<ServiceType>('new')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [partsSource, setPartsSource] = useState<PartsSource>('customer')
  const [status, setStatus] = useState<OrderStatus>('pending')
  const [appointment, setAppointment] = useState(appointmentParam || defaultAppointment())
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [description, setDescription] = useState('')
  const [services, setServices] = useState<SelectedService[]>([])
  const [serviceExtra, setServiceExtra] = useState('0')
  const [travel, setTravel] = useState('')
  const [material, setMaterial] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [paid, setPaid] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('wechat')
  const [warranty, setWarranty] = useState('12')
  const [items, setItems] = useState<Row[]>([])
  const [precheck, setPrecheck] = useState<ChecklistItem[]>(DEFAULT_PRECHECK.map((c) => ({ ...c })))
  const [partsConfirmed, setPartsConfirmed] = useState(false)
  const [partsConfirmNote, setPartsConfirmNote] = useState('')
  const [templateId, setTemplateId] = useState(0)
  const [saving, setSaving] = useState(false)
  const [customerModal, setCustomerModal] = useState(false)
  const [newCustomer, setNewCustomer] = useState<CustomerPayload>({ ...emptyCustomer })
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const selectedCustomer = customers?.find((c) => c.id === customerId)

  useEffect(() => {
    if (!isEdit && settings) {
      setTravel((prev) => prev || moneyInput(settings.default_travel_fee_cents))
      setWarranty((prev) => (prev === '12' ? String(settings.default_warranty_months) : prev))
    }
  }, [settings, isEdit])

  useEffect(() => {
    if (!existing || initialized) return
    setCustomerId(existing.customer_id)
    setStaffId(existing.staff_id ?? 0)
    setServiceType(existing.service_type)
    setPriority(existing.priority)
    setPartsSource(existing.parts_source ?? 'shop')
    setStatus(existing.status)
    setAppointment(toDateTimeInput(existing.appointment_at))
    setAddress(existing.address)
    setContactName(existing.contact_name)
    setContactPhone(existing.contact_phone)
    setDescription(existing.description)
    setServices((existing.services ?? []).map((service) => {
      rowSeq += 1
      return {
        key: `svc-${rowSeq}`,
        serviceItemId: service.service_item_id ?? 0,
        name: service.name,
        priceCents: service.price_cents,
        qty: service.qty,
      }
    }))
    setServiceExtra(moneyInput(existing.service_extra_cents ?? existing.labor_fee_cents))
    setTravel(moneyInput(existing.travel_fee_cents))
    setMaterial(moneyInput(existing.material_fee_cents))
    setDiscount(moneyInput(existing.discount_cents))
    setPaid(moneyInput(existing.paid_cents))
    setPaymentMethod(existing.payment_method)
    setWarranty(String(existing.warranty_months))
    setPrecheck(existing.precheck?.length ? existing.precheck : DEFAULT_PRECHECK.map((c) => ({ ...c })))
    setPartsConfirmed(Boolean(existing.parts_confirmed))
    setPartsConfirmNote(existing.parts_confirm_note ?? '')
    setTemplateId(existing.template_id ?? 0)
    setItems(existing.items.map((item) => {
      rowSeq += 1
      return {
        key: `edit-${rowSeq}`,
        kind: item.part_id ? 'part' : 'custom',
        partId: item.part_id,
        name: item.name,
        spec: item.spec,
        qty: item.qty,
        price: moneyInput(item.unit_price_cents),
        costCents: item.cost_cents,
        note: item.note,
      }
    }))
    setInitialized(true)
  }, [existing, initialized])

  const autoServiceApplied = useRef(false)
  useEffect(() => {
    if (isEdit || copyParam || autoServiceApplied.current || !catalogServices || !settings || templateParam) return
    autoServiceApplied.current = true
    if (catalogServices.length > 0) {
      const first = catalogServices[0]
      setServices([{ key: `svc-default-${first.id}`, serviceItemId: first.id, name: first.name, priceCents: first.price_cents, qty: 1 }])
      setServiceExtra('0')
    } else {
      setServiceExtra(moneyInput(settings.default_labor_fee_cents))
    }
  }, [catalogServices, settings, isEdit, templateParam])

  const appliedTemplate = useRef(false)
  const applyTemplate = (tpl: BuildTemplate) => {
    setTemplateId(tpl.id)
    setServices([])
    setServiceExtra(moneyInput(tpl.labor_fee_cents))
    setItems((tpl.items ?? []).map((item) => {
      rowSeq += 1
      const price = item.unit_price_cents > 0 ? item.unit_price_cents : (item.current_sale_cents ?? 0)
      return {
        key: `tpl-${rowSeq}`,
        kind: 'part' as const,
        partId: item.part_id,
        name: item.part_name ?? '',
        spec: item.part_spec ?? '',
        qty: item.qty,
        price: moneyInput(price),
        costCents: item.current_cost_cents ?? 0,
        note: item.note,
      }
    }))
    if (!description) setDescription(tpl.notes)
  }

  useEffect(() => {
    if (isEdit || !templates || !templateParam || appliedTemplate.current) return
    const tpl = templates.find((t) => t.id === templateParam)
    if (tpl) {
      applyTemplate(tpl)
      appliedTemplate.current = true
    }
  }, [templates, templateParam, isEdit])

  const copyApplied = useRef(false)
  useEffect(() => {
    if (isEdit || copyParam === 0 || !copySource || copyApplied.current) return
    copyApplied.current = true
    setCustomerId(copySource.customer_id)
    setServiceType(copySource.service_type)
    setPriority(copySource.priority)
    setPartsSource(copySource.parts_source)
    setAddress(copySource.address)
    setContactName(copySource.contact_name)
    setContactPhone(copySource.contact_phone)
    setDescription(copySource.description)
    setServices((copySource.services ?? []).map((service) => {
      rowSeq += 1
      return { key: `copy-svc-${rowSeq}`, serviceItemId: service.service_item_id ?? 0, name: service.name, priceCents: service.price_cents, qty: service.qty }
    }))
    setServiceExtra(moneyInput(copySource.service_extra_cents ?? copySource.labor_fee_cents))
    setItems(copySource.items.map((item) => {
      rowSeq += 1
      return {
        key: `copy-${rowSeq}`,
        kind: item.part_id ? 'part' : 'custom',
        partId: item.part_id,
        name: item.name,
        spec: item.spec,
        qty: item.qty,
        price: moneyInput(item.unit_price_cents),
        costCents: item.cost_cents,
        note: item.note,
      }
    }))
    setPrecheck(DEFAULT_PRECHECK.map((c) => ({ ...c })))
    setPartsConfirmed(false)
    setPartsConfirmNote('')
    setStatus('pending')
    setWarranty(String(copySource.warranty_months))
  }, [copyParam, copySource, isEdit])

  const appliedAddressCustomer = useRef(0)
  useEffect(() => {
    if (isEdit || copyParam || !customerId || !customerAddresses || customerAddresses.length === 0) return
    if (appliedAddressCustomer.current === customerId) return
    appliedAddressCustomer.current = customerId
    const preferred = customerAddresses.find((a) => a.is_default === 1) ?? customerAddresses[0]
    setAddress(preferred.address)
    if (preferred.contact_name) setContactName(preferred.contact_name)
    if (preferred.phone) setContactPhone(preferred.phone)
  }, [customerId, customerAddresses, isEdit, copyParam])

  const appliedCustomer = useRef(false)
  useEffect(() => {
    if (isEdit || copyParam || !customers || !customerParam || appliedCustomer.current) return
    const c = customers.find((x) => x.id === customerParam)
    if (c) {
      setCustomerId(c.id)
      setAddress(c.address)
      setContactName(c.name)
      setContactPhone(c.phone)
      appliedCustomer.current = true
    }
  }, [customers, customerParam, isEdit, copyParam])

  const chooseCustomer = (nextId: number) => {
    setCustomerId(nextId)
    const c = customers?.find((x) => x.id === nextId)
    if (c) {
      setAddress(c.address)
      setContactName(c.name)
      setContactPhone(c.phone)
    }
  }

  const groupedParts = useMemo(() => {
    const groups = new Map<string, Part[]>()
    for (const part of parts ?? []) {
      if (part.status === 'inactive') continue
      const list = groups.get(part.category) ?? []
      list.push(part)
      groups.set(part.category, list)
    }
    return [...groups.entries()]
  }, [parts])

  const updateRow = (key: string, patch: Partial<Row>) => {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const choosePart = (row: Row, value: string) => {
    if (value === '__custom') {
      updateRow(row.key, { kind: 'custom', partId: null, name: '', spec: '', price: '', costCents: 0 })
      return
    }
    const partId = Number(value)
    const part = parts?.find((p) => p.id === partId)
    if (!part) {
      updateRow(row.key, { kind: 'part', partId: null, name: '', spec: '', price: '', costCents: 0 })
      return
    }
    updateRow(row.key, {
      kind: 'part',
      partId: part.id,
      name: part.name,
      spec: part.spec,
      price: moneyInput(part.sale_cents),
      costCents: part.cost_cents,
    })
  }

  const addPartRow = () => setItems((prev) => [...prev, newRow()])
  const addCustomRow = () => {
    const row = newRow()
    row.kind = 'custom'
    setItems((prev) => [...prev, row])
  }
  const removeRow = (key: string) => setItems((prev) => prev.filter((r) => r.key !== key))

  const customerSupplied = partsSource === 'customer'
  const changePartsSource = (next: PartsSource) => {
    setPartsSource(next)
    if (next !== 'customer') {
      setItems((prev) => prev.map((row) => {
        const part = parts?.find((p) => p.id === row.partId)
        if (part && (row.price.trim() === '' || parseMoney(row.price) === 0)) {
          return { ...row, price: moneyInput(part.sale_cents), costCents: part.cost_cents }
        }
        return row
      }))
    }
  }

  const addService = (item: ServiceItem) => {
    setServices((prev) => {
      if (prev.some((s) => s.serviceItemId === item.id)) return prev
      return [...prev, { key: `svc-${Date.now()}-${item.id}`, serviceItemId: item.id, name: item.name, priceCents: item.price_cents, qty: 1 }]
    })
  }
  const removeService = (key: string) => setServices((prev) => prev.filter((s) => s.key !== key))
  const updateServiceQty = (key: string, qty: number) => {
    setServices((prev) => prev.map((s) => (s.key === key ? { ...s, qty: Math.max(1, Math.min(99, qty)) } : s)))
  }
  const selectedServiceIds = new Set(services.map((s) => s.serviceItemId))
  const serviceTotal = services.reduce((sum, s) => sum + s.priceCents * s.qty, 0) + parseMoney(serviceExtra)

  const subtotal = customerSupplied ? 0 : items.reduce((sum, row) => sum + row.qty * parseMoney(row.price), 0)
  const partsCost = customerSupplied ? 0 : items.reduce((sum, row) => sum + row.qty * row.costCents, 0)
  const totals = calcOrderTotal({
    items: items.map((row) => ({
      qty: row.qty,
      unit_price_cents: customerSupplied ? 0 : parseMoney(row.price),
      cost_cents: customerSupplied ? 0 : row.costCents,
    })),
    labor_fee_cents: serviceTotal,
    travel_fee_cents: parseMoney(travel),
    material_fee_cents: parseMoney(material),
    discount_cents: parseMoney(discount),
  })

  const save = async () => {
    if (!customerId) {
      toast('请先选择客户', 'error')
      return
    }
    const badRow = items.find((row) => row.kind === 'custom' && !row.name.trim())
    if (badRow) {
      toast('有自定义项目还没填写名称', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        customer_id: customerId,
        staff_id: staffId || null,
        template_id: templateId || null,
        service_type: serviceType,
        status,
        priority,
        parts_source: partsSource,
        appointment_at: appointment,
        address,
        contact_name: contactName,
        contact_phone: contactPhone,
        description,
        labor_fee_cents: serviceTotal,
        service_extra_cents: parseMoney(serviceExtra),
        travel_fee_cents: parseMoney(travel),
        material_fee_cents: parseMoney(material),
        discount_cents: parseMoney(discount),
        paid_cents: isEdit ? undefined : parseMoney(paid),
        payment_method: paymentMethod,
        warranty_months: Number(warranty) || 0,
        precheck,
        parts_confirmed: partsConfirmed,
        parts_confirm_note: partsConfirmNote,
        services: services.map((service) => ({
          service_item_id: service.serviceItemId || null,
          name: service.name,
          price_cents: service.priceCents,
          qty: service.qty,
          note: '',
        })),
        items: items.map((row) => ({
          part_id: row.kind === 'part' ? row.partId : null,
          name: row.name,
          spec: row.spec,
          qty: row.qty,
          unit_price_cents: customerSupplied ? 0 : parseMoney(row.price),
          cost_cents: customerSupplied ? 0 : row.costCents,
          note: row.note,
        })),
      }
      const result = isEdit ? await api.orders.update(orderId, payload) : await api.orders.create(payload)
      toast(isEdit ? '工单已更新' : '工单创建成功')
      navigate(`/orders/${result.id}`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast('请填写客户称呼', 'error')
      return
    }
    setSavingCustomer(true)
    try {
      const created = await api.customers.create(newCustomer)
      await reloadCustomers()
      setCustomerId(created.id)
      setAddress(created.address)
      setContactName(created.name)
      setContactPhone(created.phone)
      setCustomerModal(false)
      setNewCustomer({ ...emptyCustomer })
      toast('客户已创建并选中')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSavingCustomer(false)
    }
  }

  if (isEdit && loadingOrder && !existing) return <LoadingBlock label="正在读取工单…" />

  return (
    <div className="pb-40 lg:pb-0">
      <PageHeader
        title={isEdit ? `编辑 ${existing?.order_no ?? '工单'}` : '新建工单'}
        description={isEdit ? '修改配置或费用后保存，历史记录会保留在时间线中' : '默认客户自备配件，只收装机服务费；也能切换为我方提供配件'}
        eyebrow={<button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={13} /> 返回</button>}
        actions={
          <>
            <Link to={isEdit ? `/orders/${orderId}` : '/orders'}><Button variant="secondary">取消</Button></Link>
            <Button onClick={save} loading={saving}><Save size={15} /> 保存工单</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="min-w-0 space-y-4 xl:col-span-2 xl:space-y-5">
          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">客户与联系人</h3>
              <Button variant="ghost" size="sm" onClick={() => setCustomerModal(true)}><UserPlus size={14} /> 新建客户</Button>
            </div>
            <FormGrid>
              <Field label="客户" required>
                <CustomerSelect customers={customers ?? []} value={customerId} onChange={chooseCustomer} />
              </Field>
              <Field label="指派员工">
                <Select value={staffId} onChange={(e) => setStaffId(Number(e.target.value))}>
                  <option value={0}>暂不指派</option>
                  {staff?.filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="服务类型">
                <Select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
                  {SERVICE_TYPES.map((type) => <option key={type} value={type}>{SERVICE_TYPE_LABELS[type]}</option>)}
                </Select>
              </Field>
              <Field label="优先级">
                <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button type="button" onClick={() => setPriority('normal')} className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${priority === 'normal' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'}`}>普通</button>
                  <button type="button" onClick={() => setPriority('urgent')} className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${priority === 'urgent' ? 'bg-rose-50 text-rose-600 shadow-sm' : 'text-slate-400'}`}>加急</button>
                </div>
              </Field>
              <Field label="现场联系人">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="默认取客户称呼" />
              </Field>
              <Field label="联系电话">
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="默认取客户电话" inputMode="tel" />
              </Field>
            </FormGrid>
            {selectedCustomer && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{selectedCustomer.district || '未填区域'}</span>
                <span>微信：{selectedCustomer.wechat || '—'}</span>
                <span>历史 {selectedCustomer.order_count ?? 0} 单</span>
                {selectedCustomer.tags && <span className="text-brand-600">#{selectedCustomer.tags.split(',').join(' #')}</span>}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">预约与上门地址</h3>
            <FormGrid>
              <Field label="预约时间" required>
                <Input type="datetime-local" value={appointment} onChange={(e) => setAppointment(e.target.value)} />
              </Field>
              <Field label={`质保月数`}>
                <Input type="number" min={0} max={240} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
              </Field>
              <Field label="上门地址" className="sm:col-span-2">
                {customerAddresses && customerAddresses.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {customerAddresses.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAddress(item.address)
                          if (item.contact_name) setContactName(item.contact_name)
                          if (item.phone) setContactPhone(item.phone)
                        }}
                        className={`rounded-full border px-2.5 py-1 text-[10px] transition ${address === item.address ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                      >
                        {item.label}{item.is_default === 1 ? ' · 默认' : ''}
                      </button>
                    ))}
                  </div>
                )}
                <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="小区、楼栋、单元、门牌号，越详细越好" />
              </Field>
            </FormGrid>
            {address && (
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                <button type="button" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700" onClick={() => { navigator.clipboard.writeText(address); toast('地址已复制') }}>
                  <Copy size={12} /> 复制地址
                </button>
                <a className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700" href={`https://uri.amap.com/search?keyword=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
                  <MapPin size={12} /> 高德地图
                </a>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">服务项目</h3>
                <p className="mt-0.5 text-xs text-slate-400">从价目表勾选，自动合计装机服务费</p>
              </div>
              <Link to="/services" className="text-xs font-medium text-brand-600 hover:text-brand-700">管理价目表</Link>
            </div>

            {catalogServices && catalogServices.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {catalogServices.map((item) => {
                  const selected = selectedServiceIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (selected ? removeService(services.find((s) => s.serviceItemId === item.id)?.key ?? '') : addService(item))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${selected ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      {item.name}
                      <span className="tabular text-[10px] opacity-70">{money(item.price_cents)}</span>
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{selected ? '✓' : '+'}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-[11px] text-slate-400">
                还没有服务项目，可以到 <Link to="/services" className="font-medium text-brand-600">服务项目</Link> 添加价目表；本单也可以直接在下面填「其他服务费」。
              </div>
            )}

            {services.length > 0 && (
              <div className="mt-3 space-y-2">
                {services.map((service) => (
                  <div key={service.key} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{service.name}</span>
                    <div className="flex items-center rounded-lg border border-slate-200">
                      <button type="button" onClick={() => updateServiceQty(service.key, service.qty - 1)} className="px-2 text-slate-400">−</button>
                      <span className="tabular w-6 text-center text-xs">{service.qty}</span>
                      <button type="button" onClick={() => updateServiceQty(service.key, service.qty + 1)} className="px-2 text-slate-400">+</button>
                    </div>
                    <span className="tabular w-16 text-right text-xs text-slate-600">{money(service.priceCents)}</span>
                    <span className="tabular w-20 text-right text-xs font-semibold text-slate-800">{money(service.priceCents * service.qty)}</span>
                    <button type="button" onClick={() => removeService(service.key)} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="移除服务"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
              <Field label="其他服务费（元）" hint="价目表之外的手工加项">
                <Input value={serviceExtra} onChange={(e) => setServiceExtra(e.target.value)} inputMode="decimal" className="text-right tabular" />
              </Field>
              <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                <span className="text-xs text-slate-400">服务费合计</span>
                <span className="tabular text-lg font-semibold">{money(serviceTotal)}</span>
              </div>
            </div>
          </section>

          {(partsSource === 'customer' || partsSource === 'mixed') && (
            <section className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">上门前确认（客户自备件）</h3>
                  <p className="mt-0.5 text-xs text-slate-400">提前核对兼容性，减少白跑和现场扯皮</p>
                </div>
                <span className="text-[11px] text-slate-400">{precheck.filter((c) => c.done).length} / {precheck.length} 项已确认</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {precheck.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPrecheck((prev) => prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)))}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[11px] transition ${item.done ? 'border-emerald-100 bg-emerald-50/50 text-slate-400' : 'border-slate-100 bg-white text-slate-600'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{item.done && '✓'}</span>
                    <span className={item.done ? 'line-through' : ''}>{item.label}</span>
                  </button>
                ))}
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
                <input type="checkbox" checked={partsConfirmed} onChange={(e) => setPartsConfirmed(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 accent-amber-600" />
                <span>已向客户说明：自备配件的兼容性、DOA（到手坏）、外观与数据风险由客户承担；建议客户提前备份数据。</span>
              </label>
              <Field label="确认备注（选填）" className="mt-3">
                <Textarea rows={2} value={partsConfirmNote} onChange={(e) => setPartsConfirmNote(e.target.value)} placeholder="例如：客户确认显卡长度约 336mm，机箱支持；数据已自行备份。" />
              </Field>
            </section>
          )}

          <section className="card p-4 sm:p-5">
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[11px] font-medium text-slate-500">配件来源</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {PARTS_SOURCES.map((source) => {
                  const active = partsSource === source
                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => changePartsSource(source)}
                      className={`rounded-lg border px-2 py-2 text-left transition ${active ? 'border-brand-300 bg-white shadow-sm ring-2 ring-brand-100' : 'border-slate-200 bg-white/60 hover:bg-white'}`}
                    >
                      <span className={`block text-[11px] font-semibold ${active ? 'text-brand-700' : 'text-slate-600'}`}>{PARTS_SOURCE_LABELS[source]}</span>
                      <span className="mt-0.5 block text-[9px] leading-snug text-slate-400">
                        {source === 'customer' ? '只收装机费' : source === 'shop' ? '配件 + 服务费' : '分别计费'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className={`mt-2 text-[11px] leading-relaxed ${customerSupplied ? 'text-emerald-600' : 'text-slate-400'}`}>
                {PARTS_SOURCE_DESCRIPTIONS[partsSource]}
              </p>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{customerSupplied ? '客户自备配件（选填）' : '配置清单'}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {customerSupplied ? '仅记录型号和数量，用于现场核对，不参与收费' : '选择配件自动带出售价与成本，成交价可改'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  className="h-9 w-auto min-w-[150px] py-0 text-xs"
                  value=""
                  onChange={async (e) => {
                    const tpl = templates?.find((t) => t.id === Number(e.target.value))
                    if (!tpl) return
                    if (items.length > 0) {
                      const ok = await confirm({
                        title: '替换当前配置清单？',
                        message: customerSupplied
                          ? '导入的型号会覆盖当前清单，仍不计入收费。'
                          : '导入常用配置会覆盖已添加的配件与价格。',
                        confirmText: '导入并替换',
                      })
                      if (!ok) return
                    }
                    applyTemplate(tpl)
                    toast(`已导入「${tpl.name}」`)
                  }}
                >
                  <option value="">{customerSupplied ? '导入配置记录…' : '导入常用配置…'}</option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{customerSupplied ? ` · ${t.item_count ?? 0} 项` : ` · ${money(t.total_cents)}`}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                <PackagePlus size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">
                  {customerSupplied ? '客户自备配件可以留空，直接收取装机服务费' : '还没有配件，添加配件或导入常用配置'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={addPartRow}><Plus size={14} /> {customerSupplied ? '登记配件' : '添加配件'}</Button>
                  <Button size="sm" variant="ghost" onClick={addCustomRow}>自定义项目</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((row, index) => {
                  const part = parts?.find((p) => p.id === row.partId)
                  return (
                    <div key={row.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-12 sm:items-end">
                        <div className={`col-span-2 ${customerSupplied ? 'sm:col-span-6' : 'sm:col-span-4'}`}>
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">{customerSupplied ? '客户自备配件' : '配件'}</label>
                          {row.kind === 'custom' ? (
                            <Input value={row.name} onChange={(e) => updateRow(row.key, { name: e.target.value })} placeholder="自定义项目名称，如客户自带水冷" className="h-9 py-0 text-xs" />
                          ) : (
                            <Select value={row.partId ?? ''} onChange={(e) => choosePart(row, e.target.value)} className="h-9 py-0 text-xs">
                              <option value="">选择配件…</option>
                              {groupedParts.map(([category, list]) => (
                                <optgroup key={category} label={category}>
                                  {list.map((p) => <option key={p.id} value={p.id}>{p.name}{customerSupplied ? '' : ` · ${money(p.sale_cents)}`}</option>)}
                                </optgroup>
                              ))}
                              <option value="__custom">＋ 自定义项目</option>
                            </Select>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">数量</label>
                          <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white">
                            <button type="button" onClick={() => updateRow(row.key, { qty: Math.max(1, row.qty - 1) })} className="h-full px-2 text-slate-400 hover:text-slate-700">−</button>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={row.qty}
                              onChange={(e) => updateRow(row.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-full min-w-0 border-0 bg-transparent p-0 text-center text-xs outline-none"
                            />
                            <button type="button" onClick={() => updateRow(row.key, { qty: Math.min(99, row.qty + 1) })} className="h-full px-2 text-slate-400 hover:text-slate-700">+</button>
                          </div>
                        </div>
                        {!customerSupplied && (
                          <>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">单价（元）</label>
                              <Input
                                value={row.price}
                                onChange={(e) => updateRow(row.key, { price: e.target.value })}
                                inputMode="decimal"
                                placeholder="0"
                                className="h-9 py-0 text-right text-xs tabular"
                              />
                            </div>
                            <div className="sm:col-span-2 sm:text-right">
                              <label className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">小计</label>
                              <p className="tabular flex h-9 items-center justify-end text-[13px] font-semibold text-slate-800">{money(row.qty * parseMoney(row.price))}</p>
                            </div>
                          </>
                        )}
                        <div className={`flex items-center justify-end gap-1 ${customerSupplied ? 'sm:col-span-4' : 'sm:col-span-2'}`}>
                          {customerSupplied && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">客户自备</span>}
                          <button type="button" onClick={() => removeRow(row.key)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-500" aria-label="删除">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      {row.kind === 'part' && part && (
                        <p className="mt-1 truncate text-[10px] text-slate-400">
                          {customerSupplied
                            ? `${part.category} · 客户自备 · 仅记录型号${part.spec ? ` · ${part.spec}` : ''}`
                            : `${part.category} · 成本 ${money(part.cost_cents)} · 库存 ${part.stock}${part.spec ? ` · ${part.spec}` : ''}`}
                        </p>
                      )}
                      {row.kind === 'custom' && (
                        <Input
                          value={row.spec}
                          onChange={(e) => updateRow(row.key, { spec: e.target.value })}
                          placeholder="规格 / 说明（可选）"
                          className="mt-2 h-8 py-0 text-xs"
                        />
                      )}
                      <span className="sr-only">第 {index + 1} 项</span>
                    </div>
                  )
                })}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={addPartRow}><Plus size={14} /> {customerSupplied ? '登记配件' : '添加配件'}</Button>
                  <Button variant="ghost" size="sm" onClick={addCustomRow}><Wand2 size={14} /> 自定义项目</Button>
                </div>
              </div>
            )}

            {customerSupplied ? (
              <div className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs leading-relaxed text-emerald-700">
                客户自备配件不计费，本单只收取装机服务费；配件型号仅用于现场核对与留档。
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
                <span className="text-xs text-slate-500">配件小计</span>
                <span className="tabular text-sm font-semibold text-slate-900">{money(subtotal)}</span>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">费用与收款</h3>
            <p className="mb-4 text-xs text-slate-400">
              服务费来自上方服务项目 + 其他服务费；这里再填上门费、材料费和优惠
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">服务费合计</p>
                <p className="tabular mt-1 text-sm font-semibold text-slate-900">{money(serviceTotal)}</p>
              </div>
              <Field label="上门费（元）"><Input value={travel} onChange={(e) => setTravel(e.target.value)} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="材料费（元）"><Input value={material} onChange={(e) => setMaterial(e.target.value)} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="优惠（元）"><Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="text-right tabular" /></Field>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gradient-to-br from-slate-900 to-brand-900 p-4 text-white sm:gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">应收合计</p>
                <p className="tabular mt-1 text-xl font-semibold">{money(totals.total)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{customerSupplied ? '配件成本（自备）' : '配件成本'}</p>
                <p className="tabular mt-1 text-xl font-semibold text-slate-200">{money(partsCost)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">预计毛利</p>
                <p className="tabular mt-1 text-xl font-semibold text-emerald-300">{money(totals.profit)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {isEdit ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400">已收金额</p>
                  <p className="tabular mt-1 text-sm font-semibold text-slate-900">{money(existing?.paid_cents ?? 0)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">收款请在详情页「收款记录」中新增</p>
                </div>
              ) : (
                <Field label="预收定金（元）" hint="没有定金填 0；后续可在详情页追加尾款">
                  <Input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" className="text-right tabular" />
                </Field>
              )}
              <Field label="收款方式">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                </Select>
              </Field>
              <Field label="工单状态">
                <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_META[s].label}</option>)}
                </Select>
              </Field>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">需求备注</h3>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：需要装 Win11、迁移旧硬盘数据、客户有特殊走线要求…" />
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">工单摘要</h3>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">工单号</span><span className="font-medium text-slate-700">{existing?.order_no ?? '保存后生成'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">客户</span><span className="font-medium text-slate-700">{selectedCustomer?.name ?? '未选择'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">配件来源</span><span className={`font-medium ${customerSupplied ? 'text-emerald-600' : 'text-slate-700'}`}>{PARTS_SOURCE_LABELS[partsSource]}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">服务项目</span><span className="font-medium text-slate-700">{services.length} 项 · {money(serviceTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">预约</span><span className="font-medium text-slate-700">{appointment ? appointment.replace('T', ' ') : '未设置'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{customerSupplied ? '自备清单' : '配件项'}</span><span className="font-medium text-slate-700">{items.length} 项</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><span className="text-slate-400">应收</span><span className="tabular text-sm font-semibold text-slate-900">{money(totals.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">欠款</span><span className={`tabular font-medium ${totals.total - parseMoney(paid) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{money(Math.max(0, totals.total - parseMoney(paid)))}</span></div>
            </div>
          </section>

          <section className="card bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-500">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">填写提示</h3>
            <ul className="space-y-1.5">
              <li>· 先勾服务项目，服务费会自动合计；项目外可填「其他服务费」。</li>
              <li>· 默认「客户自备」：配件只记录型号，不参与收费。</li>
              <li>· 上门前先勾选兼容性确认，并让客户确认自备件风险。</li>
              <li>· 现场照片、检查清单和尾款在保存后的详情页处理。</li>
            </ul>
          </section>
        </aside>
      </div>

      {/* 移动端保存条 */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-slate-400">应收合计</p>
            <p className="tabular text-base font-semibold text-slate-900">{money(totals.total)}</p>
          </div>
          <Button onClick={save} loading={saving} className="min-w-[112px]"><Save size={15} /> 保存工单</Button>
        </div>
      </div>

      <Modal
        open={customerModal}
        onClose={() => setCustomerModal(false)}
        title="新建客户"
        description="保存后会自动选中该客户并带出地址"
        footer={<><Button variant="secondary" onClick={() => setCustomerModal(false)}>取消</Button><Button onClick={saveCustomer} loading={savingCustomer}>保存客户</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="称呼" required className="sm:col-span-2"><Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="王先生 / 林女士" autoFocus /></Field>
          <Field label="手机号"><Input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="微信"><Input value={newCustomer.wechat} onChange={(e) => setNewCustomer({ ...newCustomer, wechat: e.target.value })} /></Field>
          <Field label="默认地址" className="sm:col-span-2"><Textarea rows={2} value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} /></Field>
          <Field label="区域"><Input value={newCustomer.district} onChange={(e) => setNewCustomer({ ...newCustomer, district: e.target.value })} placeholder="西湖区" /></Field>
          <Field label="来源"><Input value={newCustomer.source} onChange={(e) => setNewCustomer({ ...newCustomer, source: e.target.value })} /></Field>
          <Field label="备注" className="sm:col-span-2"><Textarea rows={2} value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}
