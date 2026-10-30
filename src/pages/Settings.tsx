import { useEffect, useState } from 'react'
import { Database, Download, FileJson, HardDrive, Info, LayoutDashboard, RefreshCw, Save, ShieldCheck, Store, UserPlus, Users } from 'lucide-react'
import type { Account, Settings } from '../../shared/types'
import { api, errorMessage, type SystemInfo } from '../lib/api'
import { useApi, useDocTitle } from '../lib/hooks'
import { formatBytes, moneyInput, parseMoney } from '../lib/format'
import { useFeedback } from '../lib/feedback'
import { Button, ErrorBlock, Field, Input, LoadingBlock, PageHeader } from '../components/ui'

export default function SettingsPage() {
  useDocTitle('设置')
  const { toast } = useFeedback()
  const { data: settings, loading, error, reload } = useApi<Settings>(() => api.settings.get(), [])
  const { data: info, loading: infoLoading, reload: reloadInfo } = useApi<SystemInfo>(() => api.settings.systemInfo(), [])
  const { data: auth } = useApi(() => api.auth.status(), [])
  const { data: accounts, reload: reloadAccounts } = useApi<Account[]>(
    () => (auth?.account?.is_admin ? api.accounts.list() : Promise.resolve([])),
    [auth?.account?.is_admin],
  )
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [form, setForm] = useState({
    shop_name: '', shop_phone: '', shop_address: '', travel: '', labor: '', warranty: '',
    auto_backup_enabled: true, auto_backup_retention: '7', ui_mode: 'full' as 'full' | 'service',
  })
  const [saving, setSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  const addAccount = async () => {
    if (!newUsername.trim() || newPassword.length < 6) {
      toast('用户名至少 2 位，密码至少 6 位', 'error')
      return
    }
    setAccountSaving(true)
    try {
      await api.accounts.create(newUsername.trim(), newPassword)
      toast('账户已创建，可用新账户登录')
      setNewUsername('')
      setNewPassword('')
      reloadAccounts()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setAccountSaving(false)
    }
  }

  const toggleAccount = async (account: Account) => {
    try {
      await api.accounts.setStatus(account.id, account.status === 'active' ? 'inactive' : 'active')
      toast(account.status === 'active' ? '账户已停用' : '账户已启用')
      reloadAccounts()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  useEffect(() => {
    if (!settings) return
    setForm({
      shop_name: settings.shop_name,
      shop_phone: settings.shop_phone,
      shop_address: settings.shop_address,
      travel: moneyInput(settings.default_travel_fee_cents),
      labor: moneyInput(settings.default_labor_fee_cents),
      warranty: String(settings.default_warranty_months),
      auto_backup_enabled: settings.auto_backup_enabled,
      auto_backup_retention: String(settings.auto_backup_retention),
      ui_mode: settings.ui_mode,
    })
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      await api.settings.update({
        shop_name: form.shop_name,
        shop_phone: form.shop_phone,
        shop_address: form.shop_address,
        default_travel_fee_cents: parseMoney(form.travel),
        default_labor_fee_cents: parseMoney(form.labor),
        default_warranty_months: Number(form.warranty) || 0,
        auto_backup_enabled: form.auto_backup_enabled,
        auto_backup_retention: Number(form.auto_backup_retention) || 7,
        ui_mode: form.ui_mode,
      })
      toast('设置已保存')
      window.dispatchEvent(new Event('settings-updated'))
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const runBackup = async () => {
    setBackingUp(true)
    try {
      const result = await api.settings.runBackup()
      toast(`备份完成：${result.name}（${formatBytes(result.size)}）`)
      reloadInfo()
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBackingUp(false)
    }
  }

  if (loading && !settings) return <LoadingBlock label="正在读取设置…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  return (
    <div>
      <PageHeader
        title="设置"
        description="店铺信息、默认费用与数据备份；所有数据都保存在本机"
        actions={<Button onClick={save} loading={saving}><Save size={15} /> 保存设置</Button>}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
        <div className="space-y-4 xl:col-span-2">
          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Store size={16} /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">店铺信息</h2>
                <p className="text-[11px] text-slate-400">会显示在打印的验收单抬头</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="店铺 / 工作室名称" className="sm:col-span-2"><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></Field>
              <Field label="联系电话"><Input value={form.shop_phone} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} /></Field>
              <Field label="所在城市 / 地址"><Input value={form.shop_address} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} /></Field>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><WalletIcon /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">默认费用</h2>
                <p className="text-[11px] text-slate-400">有服务项目时以价目表为准；这里作为没有匹配项目时的兜底</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="默认服务费（兜底）"><Input value={form.labor} onChange={(e) => setForm({ ...form, labor: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="默认上门费（元）"><Input value={form.travel} onChange={(e) => setForm({ ...form, travel: e.target.value })} inputMode="decimal" className="text-right tabular" /></Field>
              <Field label="默认质保（月）"><Input type="number" min={0} max={240} value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} /></Field>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><LayoutDashboard size={16} /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">使用模式</h2>
                <p className="text-[11px] text-slate-400">只做上门服务时，隐藏配件、价格、配置和员工模块</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setForm({ ...form, ui_mode: 'full' })} className={`rounded-xl border p-3 text-left transition ${form.ui_mode === 'full' ? 'border-brand-300 bg-brand-50/50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className="flex items-center justify-between text-[13px] font-semibold text-slate-800">完整模式<span className={`h-3.5 w-3.5 rounded-full border ${form.ui_mode === 'full' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`} /></span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">保留配件库、价格表、常用配置、员工等全部功能。</span>
              </button>
              <button type="button" onClick={() => setForm({ ...form, ui_mode: 'service' })} className={`rounded-xl border p-3 text-left transition ${form.ui_mode === 'service' ? 'border-brand-300 bg-brand-50/50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className="flex items-center justify-between text-[13px] font-semibold text-slate-800">纯上门服务<span className={`h-3.5 w-3.5 rounded-full border ${form.ui_mode === 'service' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`} /></span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">只保留工作台、工单、客户、服务项目和设置，界面更清爽。</span>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-400">保存后立即生效；隐藏的页面仍可通过直接链接访问，不会删除数据。</p>
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><HardDrive size={16} /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">完整备份</h2>
                <p className="text-[11px] text-slate-400">数据库 + 现场照片/视频打包成 zip，支持每日自动备份</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href="/api/backup" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/30">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><Database size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-800">下载完整备份</span>
                  <span className="block text-[10px] text-slate-400">.zip 含数据库与媒体</span>
                </span>
                <Download size={15} className="text-slate-400" />
              </a>
              <button type="button" onClick={runBackup} disabled={backingUp} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30 disabled:opacity-60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><RefreshCw size={16} className={backingUp ? 'animate-spin' : ''} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-800">{backingUp ? '正在备份…' : '立即备份到本机'}</span>
                  <span className="block text-[10px] text-slate-400">保存到 backups/auto</span>
                </span>
              </button>
              <a href="/api/export" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/30">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileJson size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-800">导出 JSON</span>
                  <span className="block text-[10px] text-slate-400">适合分析/迁移</span>
                </span>
                <Download size={15} className="text-slate-400" />
              </a>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 px-3.5 py-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-[11px] text-slate-600">
                <input type="checkbox" checked={form.auto_backup_enabled} onChange={(e) => setForm({ ...form, auto_backup_enabled: e.target.checked })} className="mt-0.5 h-3.5 w-3.5 rounded accent-brand-600" />
                <span>每天自动备份一次<div className="mt-0.5 text-[10px] text-slate-400">启动后检查，满 24 小时执行；保留最近 {form.auto_backup_retention} 份</div></span>
              </label>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="shrink-0">保留份数</span>
                <Input type="number" min={1} max={60} value={form.auto_backup_retention} onChange={(e) => setForm({ ...form, auto_backup_retention: e.target.value })} className="h-8 w-20 py-0 text-xs" />
                <span className="ml-auto text-right text-[10px] text-slate-400">上次备份：{settings?.last_auto_backup_at ? settings.last_auto_backup_at.replace('T', ' ').slice(0, 16) : '尚未备份'}</span>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
              <p><span className="font-medium text-slate-600">恢复方式：</span>停止服务，执行 <code className="rounded bg-white px-1 py-0.5 text-slate-600">pnpm restore 备份.zip --yes</code>，再启动即可；系统会先自动备份当前数据。</p>
              {info && <p className="mt-1 break-all text-slate-400">数据目录：{info.data_dir} · 备份目录：{info.backup_dir}</p>}
            </div>
          </section>

          {auth?.account?.is_admin && (
            <section className="card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Users size={16} /></span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">账户管理</h2>
                  <p className="text-[11px] text-slate-400">每个账户独立客户、工单、照片和备份，互不可见</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {accounts?.map((account) => (
                  <div key={account.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{account.username.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1 text-xs font-medium text-slate-700">{account.username}</span>
                    {account.is_admin === 1 && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] text-brand-600">主账户</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[9px] ${account.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{account.status === 'active' ? '启用' : '停用'}</span>
                    <button type="button" onClick={async () => {
                      const password = window.prompt(`重置「${account.username}」的密码（至少 6 位）`)
                      if (!password) return
                      try {
                        await api.accounts.resetPassword(account.id, password)
                        toast('密码已重置，该账户需要重新登录')
                      } catch (err) {
                        toast(errorMessage(err), 'error')
                      }
                    }} className="text-[10px] text-slate-400 hover:text-brand-600">改密</button>
                    {account.id !== auth.account?.id && (
                      <button type="button" onClick={() => toggleAccount(account)} className="text-[10px] text-slate-400 hover:text-rose-500">{account.status === 'active' ? '停用' : '启用'}</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="新账户用户名"><Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="例如：小李" /></Field>
                <Field label="初始密码"><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" /></Field>
                <div className="flex items-end"><Button onClick={addAccount} loading={accountSaving} className="w-full sm:w-auto"><UserPlus size={14} /> 创建账户</Button></div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">新账户从空库开始，只能看到自己的数据；旧账户数据不会共享。</p>
            </section>
          )}

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><ShieldCheck size={16} /></span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">隐私与安全</h2>
                <p className="text-[11px] text-slate-400">客户地址与现场照片只存在本机</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              系统默认仅监听 <code className="rounded bg-slate-100 px-1 py-0.5">127.0.0.1</code>，局域网内其他设备无法访问。
              如果需要在手机上使用，可将启动参数 <code className="rounded bg-slate-100 px-1 py-0.5">HOST</code> 设为
              <code className="rounded bg-slate-100 px-1 py-0.5">0.0.0.0</code>，并使用账户登录。
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
              <p className="text-[11px] text-slate-500">
                当前登录：{auth?.account?.username || '未登录'}。每个账户的数据完全独立。
              </p>
              <button type="button" onClick={async () => { await api.auth.logout(); window.location.reload() }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100">退出登录</button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">数据概览</h2>
              <button type="button" onClick={() => { reloadInfo(); reload() }} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600" aria-label="刷新"><RefreshCw size={14} className={infoLoading ? 'animate-spin' : ''} /></button>
            </div>
            {infoLoading && !info ? <LoadingBlock label="读取中…" className="py-6" /> : info ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ['客户', info.counts.customers], ['工单', info.counts.orders], ['配件', info.counts.parts], ['模板', info.counts.templates],
                    ['服务', info.counts.services], ['员工', info.counts.staff], ['媒体', info.counts.media],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="tabular mt-0.5 text-lg font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
                  <p className="flex justify-between"><span>数据库大小</span><span className="tabular text-slate-600">{formatBytes(info.db_size)}</span></p>
                  <p className="flex justify-between"><span>媒体文件</span><span className="tabular text-slate-600">{formatBytes(info.uploads_size)}</span></p>
                  <p className="flex justify-between"><span>Node.js</span><span className="tabular text-slate-600">{info.node}</span></p>
                  <p className="flex justify-between"><span>版本</span><span className="tabular text-slate-600">v{info.version}</span></p>
                </div>
              </>
            ) : <p className="mt-3 text-xs text-slate-400">暂无数据</p>}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2"><Info size={15} className="text-slate-400" /><h2 className="text-sm font-semibold text-slate-900">关于装机管家</h2></div>
            <p className="text-xs leading-relaxed text-slate-500">面向个人上门装机的轻量业务系统。客户、配件、价格、配置、工单、现场记录和收款，一个系统全部管好。</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['React 19', 'TypeScript', 'Vite', 'Tailwind CSS 4', 'Node.js 22', 'SQLite'].map((tech) => (
                <span key={tech} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{tech}</span>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">所有代码与数据均在本地，无需登录第三方服务。每个账户使用独立数据库、照片目录与备份。</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h.01" />
    </svg>
  )
}
