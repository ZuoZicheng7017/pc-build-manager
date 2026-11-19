import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  Cpu,
  Database,
  HardHat,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { currentDateLabel } from '../lib/format'
import { cn } from './ui'

type NavDef = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

const NAV: NavDef[] = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: '日程', icon: CalendarDays },
  { to: '/orders', label: '工单', icon: ClipboardList },
  { to: '/customers', label: '客户', icon: Users },
  { to: '/staff', label: '员工', icon: HardHat },
  { to: '/parts', label: '配件', icon: Cpu },
  { to: '/services', label: '服务', icon: Wrench },
  { to: '/prices', label: '价格', icon: BadgeDollarSign },
  { to: '/templates', label: '配置', icon: Boxes },
  { to: '/reports', label: '报表', icon: BarChart3 },
  { to: '/trash', label: '回收站', icon: Trash2 },
  { to: '/settings', label: '设置', icon: Settings },
]

const SERVICE_MODE_PATHS = new Set(['/', '/calendar', '/orders', '/customers', '/services', '/reports', '/trash', '/settings'])
const byPath = (path: string) => NAV.find((item) => item.to === path) ?? NAV[0]

function isActive(pathname: string, item: NavDef): boolean {
  if (item.end) return pathname === '/'
  return pathname === item.to || pathname.startsWith(item.to + '/')
}

function pageTitle(pathname: string): string {
  if (pathname === '/') return '工作台'
  if (pathname.startsWith('/orders/new')) return '新建工单'
  if (pathname.startsWith('/orders/') && pathname.endsWith('/edit')) return '编辑工单'
  if (pathname.startsWith('/orders/') && pathname.endsWith('/print')) return '打印验收单'
  if (pathname.startsWith('/orders/')) return '工单详情'
  if (pathname.startsWith('/calendar')) return '日程'
  if (pathname.startsWith('/orders')) return '装机工单'
  if (pathname.startsWith('/customers/')) return '客户详情'
  if (pathname.startsWith('/customers')) return '客户'
  if (pathname.startsWith('/staff')) return '员工'
  if (pathname.startsWith('/parts')) return '配件'
  if (pathname.startsWith('/services')) return '服务项目'
  if (pathname.startsWith('/prices')) return '价格表'
  if (pathname.startsWith('/templates/new')) return '新建配置'
  if (pathname.startsWith('/templates/')) return '编辑配置'
  if (pathname.startsWith('/templates')) return '常用配置'
  if (pathname.startsWith('/reports')) return '经营报表'
  if (pathname.startsWith('/trash')) return '回收站'
  if (pathname.startsWith('/settings')) return '设置'
  return '装机管家'
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/30">
        <Cpu size={18} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-wide text-white">装机管家</span>
          <span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500">PC Build Manager</span>
        </span>
      )}
    </Link>
  )
}

function SidebarNav({ shopName, nav, onNavigate }: { shopName: string; nav: NavDef[]; onNavigate?: () => void }) {
  const business = nav.filter((item) => ['/', '/calendar', '/orders', '/customers'].includes(item.to))
  const system = nav.filter((item) => ['/settings', '/trash'].includes(item.to))
  const library = nav.filter((item) => !business.includes(item) && !system.includes(item))
  return (
    <aside className="relative flex h-full w-60 shrink-0 flex-col overflow-hidden bg-ink-950 text-slate-300">
      <div className="pointer-events-none absolute -left-16 top-0 h-64 w-64 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="relative flex h-16 items-center px-5">
        <Brand />
      </div>

      <div className="px-4 pb-3">
        <Link
          to="/orders/new"
          onClick={onNavigate}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-[13px] font-medium text-white shadow-lg shadow-brand-950/40 transition hover:bg-brand-500"
        >
          <Plus size={15} /> 新建工单
        </Link>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">业务</p>
        {business.map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
        {library.length > 0 && (
          <>
            <p className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">资料库</p>
            {library.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </>
        )}
        {system.length > 0 && (
          <>
            <p className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">系统</p>
            {system.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>

      <div className="relative border-t border-white/[0.06] p-4">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-inset ring-white/[0.05]">
          <Database size={14} className="text-brand-300" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-slate-300">{shopName || '我的装机工作室'}</p>
            <p className="text-[10px] text-slate-500">SQLite · 本地存储</p>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] text-slate-600">v1.2 · 数据掌握在自己手里</p>
      </div>
    </aside>
  )
}

function NavItem({ item, onNavigate }: { item: NavDef; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive: active }) =>
        cn(
          'group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition',
          active ? 'bg-white/[0.09] text-white ring-1 ring-inset ring-white/[0.06]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
        )
      }
    >
      {({ isActive: active }) => (
        <>
          <Icon size={17} className={active ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300'} strokeWidth={1.9} />
          {item.label}
          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
        </>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { data: settings, reload: reloadSettings } = useApi(() => api.settings.get(), [])
  const title = pageTitle(location.pathname)
  const shopName = settings?.shop_name ?? ''
  const serviceMode = settings?.ui_mode === 'service'
  const nav = serviceMode ? NAV.filter((item) => SERVICE_MODE_PATHS.has(item.to)) : NAV
  const mobileMain = [byPath('/'), byPath('/orders'), byPath('/calendar'), byPath('/customers')]
  const mobileMore = nav.filter((item) => !mobileMain.some((main) => main.to === item.to))

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onSettingsUpdated = () => reloadSettings()
    window.addEventListener('settings-updated', onSettingsUpdated)
    return () => window.removeEventListener('settings-updated', onSettingsUpdated)
  }, [reloadSettings])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <div className="min-h-dvh">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <SidebarNav shopName={shopName} nav={nav} />
      </div>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f5f6fa]/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Link to="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                  <Cpu size={16} />
                </Link>
              </div>
              <div className="min-w-0">
                <p className="hidden text-[11px] font-medium text-slate-400 lg:block">{currentDateLabel()}</p>
                <h2 className="truncate text-sm font-semibold text-slate-800 lg:mt-0.5">{title}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/orders/new"
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 sm:inline-flex"
              >
                <Plus size={15} /> 新建工单
              </Link>
              <Link to="/orders/new" className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white sm:hidden" aria-label="新建工单">
                <Plus size={17} />
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
                aria-label="打开菜单"
              >
                <Menu size={18} />
              </button>
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 lg:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {(shopName || '装').slice(0, 1)}
                </span>
                <span className="max-w-[110px] truncate text-xs font-medium text-slate-600">{shopName || '我的工作室'}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7">
          <Outlet />
        </main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {mobileMain.map((item) => {
            const Icon = item.icon
            const active = isActive(location.pathname, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition', active ? 'text-brand-600' : 'text-slate-400')}
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition',
              mobileMore.some((i) => isActive(location.pathname, i)) ? 'text-brand-600' : 'text-slate-400',
            )}
          >
            <MoreHorizontal size={19} />
            更多
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <div className="animate-slide-in absolute right-0 top-0 flex h-full w-[82%] max-w-xs flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                  <Cpu size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">装机管家</p>
                  <p className="text-[10px] text-slate-400">PC Build Manager</p>
                </div>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">全部功能</p>
              <div className="grid grid-cols-2 gap-2">
                {nav.map((item) => {
                  const Icon = item.icon
                  const active = isActive(location.pathname, item)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-[13px] font-medium transition',
                        active ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600',
                      )}
                    >
                      <Icon size={17} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <CalendarDays size={14} className="text-brand-500" /> {currentDateLabel()}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  数据保存在本机 SQLite 数据库，可在「设置」中一键备份或导出全部数据。
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link
                to="/orders/new"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-medium text-white"
              >
                <Plus size={16} /> 新建工单
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
