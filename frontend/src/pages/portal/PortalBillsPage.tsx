import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileText, ChevronRight, Filter } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'

const FILTERS = [
  { key: '',        label: 'All' },
  { key: 'Unpaid',  label: 'Unpaid' },
  { key: 'Partial', label: 'Partial' },
  { key: 'Paid',    label: 'Paid' },
]

export default function PortalBillsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['portal-bills', status],
    queryFn: async () => {
      const res = await portalAPI.bills(status ? { status } : undefined)
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  const bills = data ?? []

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
        <EmptyState icon={FileText} title="No bills found" description="Bills will appear here once issued" />
      ) : (
        <div className="space-y-2">
          {bills.map((b: any) => (
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
                  <StatusBadge status={b.status} />
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
