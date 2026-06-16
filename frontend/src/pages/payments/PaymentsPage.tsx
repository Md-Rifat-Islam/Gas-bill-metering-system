import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Search, ExternalLink } from 'lucide-react'
import { paymentsAPI } from '@/api/client'
import { PageLoader, EmptyState, Pagination } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils/helpers'

const METHOD_COLORS: Record<string, string> = {
  Cash: 'badge-green',
  Bank: 'badge-blue',
  bKash: 'badge-yellow',
  Card: 'badge-blue',
  SSLCommerz: 'badge-blue',
}

export default function PaymentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['all-payments', page],
    queryFn: () => paymentsAPI.list({ page }).then(r => r.data),
  })

  const payments = data?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">All payment transactions across the system</p>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <select className="input max-w-[160px]" value={methodFilter}
          onChange={e => { setMethodFilter(e.target.value); setPage(1) }}
          title="Filter by payment method"
        >
          <option value="">All Methods</option>
          <option>Cash</option>
          <option>Bank</option>
          <option>bKash</option>
          <option>Card</option>
          <option>SSLCommerz</option>
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill No.</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Transaction ID</th>
                  <th>Received By</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={CreditCard} title="No payments found" />
                  </td></tr>
                ) : payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-surface-600 text-sm">{formatDate(p.payment_date)}</td>
                    <td>
                      <span className="font-mono text-xs font-semibold text-brand-700">{p.bill_number}</span>
                    </td>
                    <td className="font-mono font-bold text-success-600">{formatCurrency(p.paid_amount)}</td>
                    <td><span className={METHOD_COLORS[p.payment_method] || 'badge-gray'}>{p.payment_method}</span></td>
                    <td className="font-mono text-xs text-surface-400">{p.transaction_id || '—'}</td>
                    <td className="text-surface-600 text-sm">{p.received_by_name || '—'}</td>
                    <td className="text-surface-400 text-sm max-w-xs truncate">{p.notes || '—'}</td>
                    <td>
                      <button className="btn-ghost btn-sm"
                        onClick={() => navigate(`/billing/${p.bill}`)}
                        title="View Bill"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
      )}
    </div>
  )
}
