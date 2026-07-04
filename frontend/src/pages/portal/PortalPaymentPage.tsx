import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CreditCard, Upload, AlertCircle, CheckCircle,
  ArrowLeft, FileText, Clock, Loader2
} from 'lucide-react'
import { portalAPI, paymentsAPI } from '@/api/portalClient'
import { formatCurrency, formatDate } from '@/utils/helpers'

interface PortalPaymentPageProps {}

export default function PortalPaymentPage(_: PortalPaymentPageProps) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const billId   = params.get('bill')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: bill, isLoading } = useQuery({
    queryKey: ['portal-bill', billId],
    queryFn: () => billId ? portalAPI.bill(Number(billId)).then(r => r.data) : null,
    enabled: !!billId,
  })

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = e.currentTarget
    const fd   = new FormData(form)
    if (billId) fd.set('bill_id', billId)

    // Validate proof
    const proofImage   = fd.get('proof_image')   as File
    const proofInvoice = fd.get('proof_invoice')  as File
    if (!proofImage?.size && !proofInvoice?.size) {
      setError('Please upload a payment screenshot or invoice as proof.')
      setSubmitting(false)
      return
    }
    if (!fd.get('transaction_id')) {
      setError('Transaction ID is required.')
      setSubmitting(false)
      return
    }

    try {
      await paymentsAPI.customerSubmit(fd)
      setSubmitted(true)
    } catch (err: any) {
      const data = err.response?.data
      const msg  = data?.detail || data?.transaction_id?.[0] || data?.paid_amount?.[0]
        || 'Submission failed. Please try again.'
      setError(String(msg))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-6">
        <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-success-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-surface-900 mb-2">Payment Submitted!</h2>
          <p className="text-surface-500 text-sm max-w-xs">
            Your payment has been submitted for review. The accountant will verify and approve it shortly.
            You'll see the status update in your payment history.
          </p>
        </div>
        <div className="flex items-center gap-2 text-warning-700 bg-warning-50 rounded-xl px-4 py-3 text-sm">
          <Clock className="w-4 h-4 shrink-0" />
          Status: <strong>Pending Review</strong>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate('/portal/bills')}
            aria-label="Back to bills" title="Back to bills">
            <ArrowLeft className="w-4 h-4" /> My Bills
          </button>
          <button className="btn-primary" onClick={() => navigate('/portal/payments')}
            aria-label="View payment history" title="View payment history">
            Payment History
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn-sm" onClick={() => navigate(-1)}
          aria-label="Go back" title="Go back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-surface-900">Make Payment</h1>
          <p className="text-sm text-surface-400">Submit your payment with proof for verification</p>
        </div>
      </div>

      {/* Bill summary */}
      {isLoading && <div className="card animate-pulse h-24" />}
      {bill && (
        <div className="card">
          <div className="font-semibold text-surface-800 mb-2">{bill.billing_month_display}</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-surface-400">Total</div>
              <div className="font-mono font-bold">{formatCurrency(bill.total_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-surface-400">Paid</div>
              <div className="font-mono text-success-600">{formatCurrency(bill.paid_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-surface-400">Due</div>
              <div className="font-mono font-bold text-danger-600">{formatCurrency(bill.due_amount)}</div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pp-amount">Amount (৳) *</label>
            <input id="pp-amount" name="paid_amount" type="number" step="0.01" min="0.01"
              defaultValue={bill?.due_amount || ''}
              className="input" required
              aria-label="Payment amount" title="Payment amount" />
          </div>
          <div>
            <label className="label" htmlFor="pp-method">Payment Method *</label>
            <select id="pp-method" name="payment_method" className="input" required
              aria-label="Payment method" title="Payment method">
              <option value="bKash">bKash</option>
              <option value="Bank">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pp-txn">Transaction ID *</label>
            <input id="pp-txn" name="transaction_id" className="input" required
              placeholder="e.g. bKash TXN ID"
              aria-label="Transaction ID" title="Transaction ID" />
          </div>
          <div>
            <label className="label" htmlFor="pp-date">Payment Date *</label>
            <input id="pp-date" name="payment_date" type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="input" required
              aria-label="Payment date" title="Payment date" />
          </div>
        </div>

        {/* Proof upload — required for customer submissions */}
        <div className="border-2 border-dashed border-brand-200 bg-brand-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-brand-700 font-semibold text-sm">
            <Upload className="w-4 h-4" />
            Payment Proof (required)
          </div>
          <p className="text-xs text-surface-400 mb-3">
            Upload a screenshot of your payment and/or invoice. At least one is required.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pp-screenshot">
                Screenshot <span className="text-danger-500">*</span>
              </label>
              <input id="pp-screenshot" name="proof_image" type="file"
                accept="image/jpeg,image/png,image/webp"
                className="input text-sm py-1.5"
                aria-label="Payment screenshot" title="Upload payment screenshot" />
            </div>
            <div>
              <label className="label" htmlFor="pp-invoice">Invoice / Receipt</label>
              <input id="pp-invoice" name="proof_invoice" type="file"
                accept="image/*,application/pdf"
                className="input text-sm py-1.5"
                aria-label="Invoice or receipt" title="Upload invoice or receipt" />
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="pp-notes">Notes</label>
          <textarea id="pp-notes" name="notes" className="input" rows={2}
            placeholder="Any additional information…"
            aria-label="Notes" title="Notes" />
        </div>

        <div className="flex items-center gap-2 text-xs text-surface-400 bg-surface-50 rounded-xl p-3">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          After submission, an accountant will review your payment proof and approve it.
          Your bill will be updated only after approval.
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}
          aria-label="Submit payment" title="Submit payment">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Payment'}
        </button>
      </form>
    </div>
  )
}
