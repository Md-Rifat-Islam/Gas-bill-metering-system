import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ChevronRight, Clock, CheckCircle2, XCircle, X, FileText, ExternalLink } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, EmptyState, Modal } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils/helpers'

const METHOD_COLORS: Record<string, string> = {
  Cash: 'badge-green',
  Bank: 'badge-blue',
  bKash: 'badge-yellow',
  Card: 'badge-blue',
  SSLCommerz: 'badge-blue',
}

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

/* ── Payment detail modal ────────────────────────────────────────────────── */
function PaymentDetailModal({ payment, onClose }: { payment: any; onClose: () => void }) {
  const navigate = useNavigate()
  if (!payment) return null

  const meta = PAYMENT_STATUS_META[payment.status] ?? PAYMENT_STATUS_META.Approved
  const StatusIcon = meta.icon

  return (
    <Modal open={!!payment} onClose={onClose} title="Payment Details" size="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className={`${meta.className} flex items-center gap-1.5 text-xs`}>
            <StatusIcon className="w-3.5 h-3.5" /> {meta.label}
          </span>
          <span className={`${METHOD_COLORS[payment.payment_method] || 'badge-gray'} text-xs`}>
            {payment.payment_method}
          </span>
        </div>

        <div className="text-center py-3 bg-surface-50 rounded-xl">
          <div className="text-xs text-surface-400">Amount</div>
          <div className={`text-2xl font-bold ${meta.amountClass}`}>{formatCurrency(payment.paid_amount)}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-surface-400">Bill</div>
            <div className="font-mono font-medium text-surface-700">{payment.bill_number}</div>
          </div>
          <div>
            <div className="text-xs text-surface-400">Billing Month</div>
            <div className="font-medium text-surface-700">{payment.billing_month_display}</div>
          </div>
          <div>
            <div className="text-xs text-surface-400">Transaction ID</div>
            <div className="font-mono text-xs text-surface-700 break-all">{payment.transaction_id || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-surface-400">Payment Date</div>
            <div className="font-medium text-surface-700">{formatDate(payment.payment_date)}</div>
          </div>
          {payment.created_at && (
            <div>
              <div className="text-xs text-surface-400">Submitted</div>
              <div className="font-medium text-surface-700">{formatDate(payment.created_at)}</div>
            </div>
          )}
          {payment.reviewed_at && (
            <div>
              <div className="text-xs text-surface-400">Reviewed</div>
              <div className="font-medium text-surface-700">{formatDate(payment.reviewed_at)}</div>
            </div>
          )}
        </div>

        {payment.status === 'Rejected' && payment.remarks && (
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-xl text-sm text-danger-700">
            <span className="font-semibold">Reason: </span>{payment.remarks}
          </div>
        )}
        {payment.status === 'Approved' && payment.remarks && (
          <div className="p-3 bg-surface-50 rounded-xl text-sm text-surface-600">
            <span className="font-semibold">Note: </span>{payment.remarks}
          </div>
        )}

        {payment.notes && (
          <div>
            <div className="text-xs text-surface-400 mb-1">Your Notes</div>
            <div className="text-sm text-surface-600">{payment.notes}</div>
          </div>
        )}

        {(payment.proof_image || payment.proof_invoice) && (
          <div>
            <div className="text-xs text-surface-400 mb-2">Proof Submitted</div>
            <div className="flex gap-2">
              {payment.proof_image && (
                <a href={payment.proof_image} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-surface-50 rounded-xl text-xs font-medium text-surface-600 hover:bg-surface-100">
                  <ExternalLink className="w-3.5 h-3.5" /> Screenshot
                </a>
              )}
              {payment.proof_invoice && (
                <a href={payment.proof_invoice} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-surface-50 rounded-xl text-xs font-medium text-surface-600 hover:bg-surface-100">
                  <FileText className="w-3.5 h-3.5" /> Invoice
                </a>
              )}
            </div>
          </div>
        )}

        <button
          className="btn-secondary w-full"
          onClick={() => navigate(`/portal/bills/${payment.bill}`)}
        >
          View Bill <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </Modal>
  )
}

/* ── Payment History list ────────────────────────────────────────────────── */
export default function PortalPaymentsPage() {
  const [selected, setSelected] = useState<any>(null)

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
                onClick={() => setSelected(p)}
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
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <PaymentDetailModal payment={selected} onClose={() => setSelected(null)} />
    </div>
  )
}