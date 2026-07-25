import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileText, ChevronRight, Clock } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'

// 'Pending' is NOT a Bill status (Bill.status is only Unpaid/Partial/Paid)
// — it means "this bill has a payment awaiting review." Sending
// ?status=Pending to /portal/bills/ would always return an empty list,
// since the backend has no bill with that status value. Handled instead
// by cross-referencing bills against Pending payments client-side.
const FILTERS = [
  { key: '',        label: 'All' },
  { key: 'Unpaid',  label: 'Unpaid' },
  { key: 'Partial', label: 'Partial' },
  { key: 'Paid',    label: 'Paid' },
  { key: 'Pending', label: 'Payment Pending' },
]

export default function PortalBillsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')

  // Real Bill.status filters (Unpaid/Partial/Paid) go straight to the
  // backend as before; 'Pending' is fetched unfiltered and narrowed below.
  const isPendingFilter = status === 'Pending'
  const bill_status = isPendingFilter ? '' : status

  const { data, isLoading } = useQuery({
    queryKey: ['portal-bills', bill_status],
    queryFn: async () => {
      const res = await portalAPI.bills(bill_status ? { status: bill_status } : undefined)
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  const { data: paymentsData } = useQuery({
    queryKey: ['portal-payments'],
    queryFn: async () => {
      const res = await portalAPI.payments()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  const pendingBillIds = new Set(
    (paymentsData ?? [])
      .filter((p: any) => p.status === 'Pending')
      .map((p: any) => p.bill)
  )

  const allBills = data ?? []
  const bills = isPendingFilter
    ? allBills.filter((b: any) => pendingBillIds.has(b.id))
    : allBills

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-surface-900">My Bills</h1>
        <p className="text-sm text-surface-400">All gas bills for your unit</p>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              status === f.key
                ? 'bg-brand-500 text-white'
                : 'bg-white text-surface-500 border border-surface-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : bills.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={isPendingFilter ? 'No payments under review' : 'No bills found'}
          description={isPendingFilter ? "You'll see bills here while a submitted payment is being reviewed" : 'Bills will appear here once issued'}
        />
      ) : (
        <div className="space-y-2">
          {bills.map((b: any) => {
            const hasPendingPayment = pendingBillIds.has(b.id)
            return (
              <div
                key={b.id}
                onClick={() => navigate(`/portal/bills/${b.id}`)}
                className="card-hover cursor-pointer flex items-center justify-between !p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-brand-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-surface-800">{b.billing_month_display}</div>
                    <div className="text-xs text-surface-400 font-mono">{b.bill_number}</div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <div className="text-sm font-bold text-surface-900">{formatCurrency(b.total_amount)}</div>
                    <div className="flex items-center gap-1 justify-end mt-0.5 flex-wrap">
                      <StatusBadge status={b.status} />
                      {hasPendingPayment && (
                        <span className="badge-yellow text-[10px] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Payment pending
                        </span>
                      )}
                    </div>
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