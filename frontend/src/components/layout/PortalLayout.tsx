import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, CreditCard, User, Flame, LogOut } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { useCustomerAuthStore } from '@/store/customerAuthStore'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Home',     path: '/portal/dashboard' },
  { icon: FileText,        label: 'Bills',    path: '/portal/bills' },
  { icon: CreditCard,      label: 'Payments', path: '/portal/payments' },
  { icon: User,            label: 'Profile',  path: '/portal/profile' },
]

export default function PortalLayout() {
  const { customer, clearAuth } = useCustomerAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuth()
    navigate('/portal/login')
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-surface-100 px-4 h-16 flex items-center gap-3 sticky top-0 z-20">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-surface-900 leading-none">GasBill</div>
          <div className="text-[11px] text-surface-400 mt-0.5">My Account</div>
        </div>
        {customer && (
          <div className="text-right">
            <div className="text-sm font-semibold text-surface-800">{customer.name || 'Resident'}</div>
            <div className="text-[11px] text-surface-400 font-mono">{customer.mobile}</div>
          </div>
        )}
        <button onClick={handleLogout} className="btn-ghost btn-sm !p-2 ml-1" title="Logout">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-100 flex z-20">
        <div className="max-w-2xl w-full mx-auto flex">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  isActive ? 'text-brand-600' : 'text-surface-400'
                )
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
