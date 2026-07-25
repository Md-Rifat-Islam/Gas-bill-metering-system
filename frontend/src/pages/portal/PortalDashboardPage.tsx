import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Wallet, CheckCircle2, FileText, ChevronRight, AlertCircle, Clock } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, StatusBadge } from '@/components/ui'
import { formatCurrency, formatMonth } from '@/utils/helpers'
import { useCustomerAuthStore } from '@/store/customerAuthStore'

export default function PortalDashboardPage() {
  const navigate = useNavigate()
  const { customer } = useCustomerAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: () => portalAPI.dashboard().then(r => r.data),
  })

  const { data: paymentsData } = useQuery({
    queryKey: ['portal-payments'],
    queryFn: async () => {
      const res = await portalAPI.payments()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  if (isLoading) return <PageLoader />

  const latest = data?.latest_bill
  const hasDue = Number(data?.total_due || 0) > 0

  const latestHasPendingPayment = !!(paymentsData ?? []).find(
    (p: any) => p.bill === latest?.id && p.status === 'Pending'
  )

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-surface-900">
          Hi{customer?.name ? `, ${customer.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="text-sm text-surface-400">Here's your gas billing overview</p>
      </div>

      {/* Due alert — suppressed once a payment covering it is already
          under review, so the customer isn't nudged to pay again. */}
      {hasDue && !latestHasPendingPayment && (
        <div className="bg-danger-50 border border-danger-100 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger-500 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-danger-700">
              You have {formatCurrency(data.total_due)} due
            </div>
            <div className="text-xs text-danger-500">
              {data.unpaid_count} bill{data.unpaid_count !== 1 ? 's' : ''} pending
            </div>
          </div>
        </div>
      )}

      {hasDue && latestHasPendingPayment && (
        <div className="bg-warning-50 border border-warning-100 rounded-2xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-warning-600 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-warning-700">Payment under review</div>
            <div className="text-xs text-warning-600">
              We've received your payment for the latest bill — it'll reflect here once approved.
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="w-9 h-9 rounded-xl bg-danger-50 flex items-center justify-center mb-2">
            <Wallet className="w-4 h-4 text-danger-500" />
          </div>
          <div className="text-xs text-surface-400">Total Due</div>
          <div className="text-lg font-bold text-surface-900 mt-0.5">{formatCurrency(data?.total_due || 0)}</div>
        </div>
        <div className="card">
          <div className="w-9 h-9 rounded-xl bg-success-50 flex items-center justify-center mb-2">
            <CheckCircle2 className="w-4 h-4 text-success-500" />
          </div>
          <div className="text-xs text-surface-400">Total Paid</div>
          <div className="text-lg font-bold text-surface-900 mt-0.5">{formatCurrency(data?.total_paid || 0)}</div>
        </div>
      </div>

      {/* Latest bill */}
      {latest && (
        <div className="card cursor-pointer hover:shadow-card-hover transition-shadow" onClick={() => navigate(`/portal/bills/${latest.id}`)}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-brand-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-800">Latest Bill</div>
                <div className="text-xs text-surface-400">{latest.billing_month_display}</div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={latest.status} />
              {latestHasPendingPayment && (
                <span className="badge-yellow text-[10px] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Payment pending
                </span>
              )}
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-surface-400">Amount Due</div>
              <div className="text-2xl font-bold text-surface-900">{formatCurrency(latest.due_amount)}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-surface-300" />
          </div>
        </div>
      )}

      {/* Usage trend */}
      <div className="card">
        <div className="text-sm font-semibold text-surface-800 mb-4">Usage Trend (m³)</div>
        {data?.usage_trend?.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.usage_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip formatter={(v: any) => `${v} m³`} />
              <Line type="monotone" dataKey="usage" stroke="#0062f5" strokeWidth={2.5}
                dot={{ r: 4, fill: '#0062f5' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-32 flex items-center justify-center text-surface-400 text-sm">
            No usage history yet
          </div>
        )}
      </div>

      {/* Quick actions */}
      <button onClick={() => navigate('/portal/bills')} className="btn-secondary w-full justify-between">
        View all bills <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}