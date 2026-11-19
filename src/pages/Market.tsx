import { useState } from 'react'
import { ExternalLink, PackageSearch, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import type { MarketItem } from '../../shared/types'
import { MARKET_CATEGORIES, MARKET_PLATFORM_LABELS } from '../../shared/types'
import { api } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { useFeedback } from '../lib/feedback'
import { money } from '../lib/format'
import { errorMessage } from '../lib/api'
import { Badge, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea } from '../components/ui'

const emptyForm = {
  category: 'CPU', name: '', brand: '', model: '', specs: '', platform: 'manual' as MarketItem['platform'],
  url: '', price: '', shop_name: '', note: '',
}

export default function Market() {
  useDocTitle('配件行情')
  const { toast } = useFeedback()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [platform, setPlatform] = useState('')
  const { data: items, loading, error, reload } = useApi<MarketItem[]>(
    () => api.market.list({ q: q || undefined, category: category || undefined, platform: platform || undefined }),
    [q, category, platform],
  )
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MarketItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [importCategory, setImportCategory] = useState('CPU')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Array<{ external_id: string; title: string; price_cents: number; image_url: string; shop_name: string; url: string; sales_tip: string }>>([])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (item: MarketItem) => {
    setEditing(item)
    setForm({
      category: item.category, name: item.name, brand: item.brand, model: item.model, specs: item.specs,
      platform: item.platform, url: item.url, price: (item.price_cents / 100).toFixed(2), shop_name: item.shop_name, note: item.note,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { toast('请填写配件名称', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        category: form.category, name: form.name.trim(), brand: form.brand.trim(), model: form.model.trim(),
        specs: form.specs.trim(), platform: form.platform, url: form.url.trim(),
        price_cents: Math.round((Number(form.price) || 0) * 100), shop_name: form.shop_name.trim(), note: form.note.trim(),
      }
      if (editing) await api.market.update(editing.id, payload)
      else await api.market.create(payload)
      toast(editing ? '行情已更新' : '已加入配件行情')
      setOpen(false)
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: MarketItem) => {
    try {
      await api.market.remove(item.id)
      toast('已删除')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const searchPdd = async () => {
    if (!keyword.trim()) return
    setSearching(true)
    try {
      const { items: found } = await api.market.searchPdd(keyword.trim())
      setResults(found)
      if (found.length === 0) toast('没有搜索到商品')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSearching(false)
    }
  }

  const importItem = async (item: (typeof results)[number]) => {
    try {
      await api.market.create({
        category: importCategory, name: item.title, platform: 'pdd', url: item.url,
        price_cents: item.price_cents, shop_name: item.shop_name, note: item.sales_tip,
      })
      toast('已保存到配件行情')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="page-enter">
      <PageHeader
        title="配件行情"
        description="常用配件的参数、参考价和拼多多/京东/淘宝链接"
        actions={<>
          <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> 多多进宝导入</Button>
          <Button onClick={openCreate}><Plus size={15} /> 新增配件</Button>
        </>}
      />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_150px]">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索型号、品牌、参数" className="pl-9" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">全部品类</option>
          {MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">全部平台</option>
          <option value="pdd">拼多多</option>
          <option value="jd">京东</option>
          <option value="taobao">淘宝</option>
          <option value="manual">手动</option>
        </Select>
      </div>

      {loading && !items ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !items?.length ? (
        <EmptyState icon={<PackageSearch size={22} />} title="还没有配件行情" description="可以手动添加，或配置多多进宝后直接搜索导入。" action={<Button onClick={openCreate}><Plus size={15} /> 新增配件</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{item.category}</Badge>
                    <Badge tone="slate">{MARKET_PLATFORM_LABELS[item.platform]}</Badge>
                  </div>
                  <h2 className="mt-2 text-sm font-semibold leading-snug text-slate-900">{item.name}</h2>
                  <p className="mt-1 text-[11px] text-slate-400">{[item.brand, item.model].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular text-brand-600">{money(item.price_cents)}</p>
              </div>
              {item.specs && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">{item.specs}</p>}
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                <span className="truncate">{item.shop_name || item.note || '—'}</span>
                <span className="shrink-0">{item.updated_at.slice(0, 10)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2">
                {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline"><ExternalLink size={12} /> 打开商品</a>}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(item)} className="text-slate-400 hover:text-rose-500"><Trash2 size={13} /></Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? '编辑配件行情' : '新增配件行情'} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} loading={saving}>保存</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="品类"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="平台"><Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as MarketItem['platform'] })}><option value="manual">手动</option><option value="pdd">拼多多</option><option value="jd">京东</option><option value="taobao">淘宝</option></Select></Field>
          <div className="sm:col-span-2"><Field label="名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：AMD R7 9800X3D 散片" /></Field></div>
          <Field label="品牌"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="型号"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="参考价（元）"><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="店铺"><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="参数 / 规格" hint="例如：8核16线程 / LGA1851 / DDR5 / 显卡长度 320mm"><Textarea rows={3} value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="商品链接"><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></Field></div>
          <div className="sm:col-span-2"><Field label="备注"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field></div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="从多多进宝导入" description="需要先在设置中配置 client_id、client_secret 和推广位 PID" footer={<Button variant="secondary" onClick={() => setImportOpen(false)}>关闭</Button>}>
        <div className="flex gap-2">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="例如：9800X3D、4060、B650M" onKeyDown={(e) => { if (e.key === 'Enter') searchPdd() }} />
          <Button onClick={searchPdd} loading={searching}><Search size={14} /> 搜索</Button>
        </div>
        <div className="mt-3"><Field label="导入到品类"><Select value={importCategory} onChange={(e) => setImportCategory(e.target.value)}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
        <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
          {results.map((item) => (
            <div key={item.external_id} className="flex gap-3 rounded-xl border border-slate-100 p-2.5">
              {item.image_url && <img src={item.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" referrerPolicy="no-referrer" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[11px] font-medium text-slate-800">{item.title}</p>
                <p className="mt-1 text-sm font-bold text-brand-600">{money(item.price_cents)}</p>
                <p className="text-[10px] text-slate-400">{item.shop_name}{item.sales_tip ? ` · ${item.sales_tip}` : ''}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => importItem(item)}>保存</Button>
            </div>
          ))}
          {results.length === 0 && <p className="py-8 text-center text-xs text-slate-400">输入关键词搜索拼多多商品</p>}
        </div>
      </Modal>
    </div>
  )
}
