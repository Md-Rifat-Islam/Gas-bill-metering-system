import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Check, X, ExternalLink, FileText, Image as ImageIcon, ArrowLeft,
} from 'lucide-react'
import { paymentsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, AccessDenied } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { formatCurrency, formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

// ── Reject reason modal ───────────────────────────────────────────────────────
function RejectModal({ open, onClose, onConfirm, submitting }: {
  open: boolean
  onClose: () => void
  onConfirm: (remarks: string) => void
  submitting: boolean
}) {
  const [remarks, setRemarks] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Reject Payment" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Reason for rejection *</label>
          <textarea
            className="input" rows={3}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Transaction ID doesn't match, proof unclear…"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!remarks.trim() || submitting}
            onClick={() => onConfirm(remarks.trim())}
          >
            {submitting ? 'Rejecting…' : 'Reject Payment'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PendingPaymentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [rejectTarget, setRejectTarget] = useState<any | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payments-pending'],
    queryFn: () => paymentsAPI.pending().then(r => r.data),
    enabled: can.approvePayments,
  })
  const pending = data?.results ?? []

  const approve = useMutation({
    mutationFn: (id: number) => paymentsAPI.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments-pending'] })
      qc.invalidateQueries({ queryKey: ['payments-pending-count'] })
      qc.invalidateQueries({ queryKey: ['all-payments'] })
      toast.success('Payment approved — bill balance updated')
    },
  })

  const reject = useMutation({
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) => paymentsAPI.reject(id, remarks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments-pending'] })
      qc.invalidateQueries({ queryKey: ['payments-pending-count'] })
      qc.invalidateQueries({ queryKey: ['all-payments'] })
      toast.success('Payment rejected')
      setRejectTarget(null)
    },
  })

  // Guard placed after all hooks (Rules of Hooks) — previously this page had
  // no permission check at all, so any authenticated staff member (even
  // Viewer) could reach /payments/pending directly by URL even though the
  // sidebar hides the link for them.
  if (!can.approvePayments) return <AccessDenied />

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn-ghost btn-sm !p-2" onClick={() => navigate('/payments')} title="Back to Payments">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="page-title">Pending Payment Approvals</h1>
            <p className="page-subtitle">Customer-submitted payments awaiting review</p>
          </div>
        </div>
      </div>

      {isLoading ? <PageLoader /> : pending.length === 0 ? (
        <EmptyState icon={Clock} title="No pending payments" description="All customer submissions have been reviewed" />
      ) : (
        <div className="space-y-4">
          {pending.map((p: any) => (
            <div key={p.id} className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-brand-700">{p.bill_number}</span>
                    <span className="badge-yellow">Pending</span>
                  </div>
                  <div className="text-sm text-surface-600">
                    {p.allottee_name || 'Unknown customer'} · {p.unit_no} · {p.building_name}
                  </div>
                  <div className="text-xs text-surface-400">
                    Submitted {formatDate(p.created_at)} · Method: {p.payment_method}
                    {p.transaction_id && <> · Txn: <span className="font-mono">{p.transaction_id}</span></>}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-surface-400">Amount</div>
                  <div className="text-xl font-bold font-mono text-surface-900">
                    {formatCurrency(p.paid_amount)}
                  </div>
                </div>
              </div>

              {/* Proof */}
              <div className="flex flex-wrap gap-3 mt-4">
                {p.proof_image_url && (
                  <a href={p.proof_image_url} target="_blank" rel="noreferrer"
                     className="flex items-center gap-2 text-xs text-brand-600 bg-brand-50 rounded-lg px-3 py-2 hover:bg-brand-100 transition-colors">
                    <ImageIcon className="w-3.5 h-3.5" /> View Screenshot
                  </a>
                )}
                {p.proof_invoice_url && (
                  <a href={p.proof_invoice_url} target="_blank" rel="noreferrer"
                     className="flex items-center gap-2 text-xs text-brand-600 bg-brand-50 rounded-lg px-3 py-2 hover:bg-brand-100 transition-colors">
                    <FileText className="w-3.5 h-3.5" /> View Invoice / Receipt
                  </a>
                )}
                <button
                  className="flex items-center gap-2 text-xs text-surface-500 bg-surface-50 rounded-lg px-3 py-2 hover:bg-surface-100 transition-colors"
                  onClick={() => navigate(`/billing/${p.bill}`)}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View Bill
                </button>
              </div>

              {p.notes && (
                <div className="mt-3 text-sm text-surface-500 bg-surface-50 rounded-xl p-3">
                  <span className="font-medium text-surface-600">Customer note: </span>{p.notes}
                </div>
              )}

              <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-surface-100">
                <button
                  className="btn-secondary"
                  onClick={() => setRejectTarget(p)}
                  disabled={approve.isPending}
                >
                  <X className="w-4 h-4" /> Reject
                </button>
                <button
                  className="btn-primary"
                  onClick={() => approve.mutate(p.id)}
                  disabled={approve.isPending}
                >
                  <Check className="w-4 h-4" /> {approve.isPending ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RejectModal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        submitting={reject.isPending}
        onConfirm={(remarks) => rejectTarget && reject.mutate({ id: rejectTarget.id, remarks })}
      />
    </div>
  )
}