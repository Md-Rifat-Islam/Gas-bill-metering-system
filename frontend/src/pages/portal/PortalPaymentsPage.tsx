// not used now.... 
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils/helpers'

const METHOD_COLORS: Record<string, string> = {
  Cash: 'badge-green',
  Bank: 'badge-blue',
  bKash: 'badge-yellow',
  Card: 'badge-blue',
  SSLCommerz: 'badge-blue',
}

// Payment review status — distinct from the bill's own status (Unpaid/
// Partial/Paid). A Pending payment hasn't touched the bill balance yet,
// so it needs its own visible marker or it looks identical to an
// already-approved payment.
const PAYMENT_STATUS_META: Record<string, { label: string; className: string; icon: any; amountClass: string }> = {
  Pending: {
    label: 'Pending Review',
    className: 'badge-yellow',
    icon: Clock,
    amountClass: 'text-warning-600',
  },
  Approved: {
    label: 'Approved',
    className: 'badge-green',
    icon: CheckCircle2,
    amountClass: 'text-success-600',
  },
  Rejected: {
    label: 'Rejected',
    className: 'badge-red',
    icon: XCircle,
    amountClass: 'text-danger-600',
  },
}

export default function PortalPaymentsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['portal-payments'],
    queryFn: async () => {
      const res = await portalAPI.payments()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })
  const payments = data ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Payment History</h1>
        <p className="text-sm text-surface-400">All payments made on your account</p>
      </div>
      {isLoading ? <PageLoader /> : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Your payment history will appear here" />
      ) : (
        <div className="space-y-2">
          {payments.map((p: any) => {
            const meta = PAYMENT_STATUS_META[p.status] ?? PAYMENT_STATUS_META.Approved
            const StatusIcon = meta.icon
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/portal/bills/${p.bill}`)}
                className="card-hover cursor-pointer flex items-center justify-between !p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-50 flex items-center justify-center shrink-0">
                    <StatusIcon className={`w-4 h-4 ${meta.amountClass}`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-surface-800">{p.billing_month_display}</div>
                    <div className="text-xs text-surface-400 font-mono">{p.bill_number}</div>
                    <div className="text-xs text-surface-400 mt-0.5">{formatDate(p.payment_date)}</div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <div className={`text-sm font-bold ${meta.amountClass}`}>{formatCurrency(p.paid_amount)}</div>
                    <div className="flex items-center gap-1 justify-end mt-0.5 flex-wrap">
                      <span className={`${meta.className} text-[10px]`}>{meta.label}</span>
                      <span className={`${METHOD_COLORS[p.payment_method] || 'badge-gray'} text-[10px]`}>
                        {p.payment_method}
                      </span>
                    </div>
                    {p.status === 'Rejected' && p.remarks && (
                      <div className="text-[11px] text-danger-500 mt-1 max-w-[180px] text-right">
                        {p.remarks}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}