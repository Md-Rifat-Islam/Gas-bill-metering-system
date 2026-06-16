import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ChevronRight } from 'lucide-react'
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
          {payments.map((p: any) => (
            <div
              key={p.id}
              onClick={() => navigate(`/portal/bills/${p.bill}`)}
              className="card-hover cursor-pointer flex items-center justify-between !p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-success-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-surface-800">{p.billing_month_display}</div>
                  <div className="text-xs text-surface-400 font-mono">{p.bill_number}</div>
                  <div className="text-xs text-surface-400 mt-0.5">{formatDate(p.payment_date)}</div>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <div>
                  <div className="text-sm font-bold text-success-600">{formatCurrency(p.paid_amount)}</div>
                  <span className={`${METHOD_COLORS[p.payment_method] || 'badge-gray'} text-[10px]`}>
                    {p.payment_method}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
