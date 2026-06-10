import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building, Home, FileText, CreditCard,
  BarChart3, LogOut, User, Menu, X, Flame, Users, Layers, Gauge
} from 'lucide-react'
import { cn } from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import { authAPI } from '@/api/client'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard' },
  { icon: Layers,          label: 'Projects',   path: '/projects' },
  { icon: Building,        label: 'Buildings',  path: '/buildings' },
  { icon: Home,            label: 'Units',      path: '/units' },
  { icon: Gauge,           label: 'Meters',     path: '/meters' },
  { icon: FileText,        label: 'Billing',    path: '/billing' },
  { icon: CreditCard,      label: 'Payments',   path: '/payments' },
  { icon: BarChart3,       label: 'Reports',    path: '/reports' },
]

const SETTINGS_ITEMS = [
  { icon: Users, label: 'Staff Users', path: '/settings/staff' },
]

export default function AppLayout() {
  const [open, setOpen] = useState(true)
  const { user, clearAuth, refresh_token } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { if (refresh_token) await authAPI.logout(refresh_token) } catch {}
    clearAuth()
    navigate('/login')
    toast.success('Logged out')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={cn(
        'flex flex-col bg-white border-r border-surface-100 transition-all duration-200 shrink-0',
        open ? 'w-64' : 'w-[72px]'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-100 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-white" />
          </div>
          {open && (
            <div className="animate-fadeIn overflow-hidden">
              <div className="text-base font-bold text-surface-900 leading-none">GasBill</div>
              <div className="text-[11px] text-surface-400 mt-0.5">Utility Billing System</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => (
            <NavLink
              key={path}
              to={path}
              title={!open ? label : undefined}
              className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {open && <span className="animate-fadeIn truncate">{label}</span>}
            </NavLink>
          ))}

          <div className="pt-4">
            {open && (
              <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-surface-400">
                Settings
              </div>
            )}
            {SETTINGS_ITEMS.map(({ icon: Icon, label, path }) => (
              <NavLink
                key={path}
                to={path}
                title={!open ? label : undefined}
                className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {open && <span className="animate-fadeIn truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-surface-100 p-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-brand-600" />
            </div>
            {open && (
              <div className="flex-1 min-w-0 animate-fadeIn">
                <div className="text-sm font-semibold text-surface-800 truncate">{user?.name}</div>
                <div className="text-xs text-surface-400 truncate">{user?.role?.role_name || 'Staff'}</div>
              </div>
            )}
            {open && (
              <button onClick={handleLogout} className="btn-ghost btn-sm !p-1.5 ml-auto shrink-0" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-surface-100 flex items-center gap-4 px-6 shrink-0">
          <button onClick={() => setOpen(!open)} className="btn-ghost btn-sm !p-2">
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          <div className="text-sm text-surface-400">
            {new Date().toLocaleDateString('en-BD', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto animate-fadeIn">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
