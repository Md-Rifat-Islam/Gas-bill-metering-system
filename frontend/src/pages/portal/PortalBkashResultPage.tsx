import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react'

/**
 * Landing page bKash's checkout redirects the customer's browser to,
 * after apps.payments.views.BkashCallbackView has already verified and
 * applied (or rejected) the payment server-side. This page only reads the
 * result from the query string — ?bkash=success|failed|cancelled&bill=<id>
 * — it never talks to bKash itself.
 */
export default function PortalBkashResultPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = params.get('bkash') || params.get('status')
  const billId = params.get('bill')

  const isSuccess   = status === 'success'
  const isCancelled = status === 'cancelled'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-6">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
        isSuccess ? 'bg-success-100' : 'bg-warning-100'
      }`}>
        {isSuccess
          ? <CheckCircle className="w-8 h-8 text-success-600" />
          : isCancelled
          ? <Clock className="w-8 h-8 text-warning-600" />
          : <XCircle className="w-8 h-8 text-danger-600" />}
      </div>
      <div>
        <h2 className="text-xl font-bold text-surface-900 mb-2">
          {isSuccess ? 'Payment Successful!' : isCancelled ? 'Payment Cancelled' : 'Payment Failed'}
        </h2>
        <p className="text-surface-500 text-sm max-w-xs">
          {isSuccess
            ? 'Your bKash payment has been confirmed and applied to your bill automatically.'
            : isCancelled
            ? 'You cancelled the bKash checkout before completing payment. No amount was charged.'
            : 'Your bKash payment could not be completed. No amount was charged. Please try again or use another payment channel.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button className="btn-secondary" onClick={() => navigate('/portal/bills')}
          aria-label="Back to bills" title="Back to bills">
          My Bills
        </button>
        {isSuccess ? (
          <button className="btn-primary" onClick={() => navigate('/portal/payments')}
            aria-label="View payment history" title="View payment history">
            Payment History
          </button>
        ) : billId ? (
          <button className="btn-primary" onClick={() => navigate(`/portal/payments?bill=${billId}`)}
            aria-label="Try again" title="Try again">
            Try Again <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}