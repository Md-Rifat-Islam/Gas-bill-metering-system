import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Send, Loader2, Clock, Smartphone, AlertCircle } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, StatusBadge } from '@/components/ui'
import {
  UnitDetailsCard, MeterReadingsCard, BillSummaryCard, PaymentHistoryCard,
} from '@/components/billing/BillShared'
import { BILL_LABELS as L } from '@/utils/billLabels'
import { formatCurrency, formatDate, formatMonth } from '@/utils/helpers'
import toast from 'react-hot-toast'

// While a submitted payment is waiting for accountant review, re-check
// this often so the bill flips to Paid/Partial without a manual refresh.
const PENDING_POLL_MS = 30_000

const hasPendingForBill = (list: any[] | undefined, billId: number) =>
  (list ?? []).some((p: any) => p.bill === billId && p.status === 'Pending')

export default function PortalBillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)
  // One-tap bKash checkout straight from this page (no detour through the
  // Make Payment screen). Same endpoint the Make Payment page uses.
  const [bkashLoading, setBkashLoading] = useState(false)
  const [bkashError, setBkashError] = useState<string | null>(null)
  const billId = Number(id)

  // All of this customer's payments — filtered client-side to this bill.
  // Shares its query key with PortalPaymentsPage.
  const { data: paymentsData } = useQuery({
    queryKey: ['portal-payments'],
    queryFn: async () => {
      const res = await portalAPI.payments()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
    enabled: !!id,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      hasPendingForBill(query.state.data as any[] | undefined, billId) ? PENDING_POLL_MS : false,
  })

  const billPayments = (paymentsData ?? []).filter((p: any) => p.bill === billId)
  const pendingPayment = billPayments.find((p: any) => p.status === 'Pending')

  const { data: bill, isLoading } = useQuery({
    queryKey: ['portal-bill', id],
    queryFn: () => portalAPI.bill(billId).then(r => r.data),
    refetchOnWindowFocus: true,
    refetchInterval: pendingPayment ? PENDING_POLL_MS : false,
  })

  const handleDownload = async () => {
    if (!bill) return
    setDownloading(true)
    try {
      await portalAPI.downloadInvoice(bill.id, bill.bill_number)
    } catch {
      toast.error('Could not download invoice')
    } finally {
      setDownloading(false)
    }
  }

  const handleBkashPay = async () => {
    if (!bill) return
    setBkashError(null)
    setBkashLoading(true)
    try {
      const res = await portalAPI.payInitiate(bill.id)
      // Full-page redirect to bKash's hosted checkout; bKash sends the
      // browser back through the backend callback to the result page.
      window.location.href = res.data.bkash_url
    } catch (err: any) {
      setBkashError(
        err.response?.data?.error ||
        'Could not start bKash payment right now. Please try "Pay Manually" below.'
      )
      setBkashLoading(false)
    }
  }

  if (isLoading) return <PageLoader />
  if (!bill) return <div className="text-center py-20 text-surface-400">Bill not found</div>

  const isPaid = bill.status === 'Paid'

  return (
    <div className="space-y-4">
      {/* Header — same title/subtitle as the staff page */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/portal/bills')} className="btn-ghost btn-sm !p-2" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-surface-900">Bill #{bill.bill_number}</h1>
          <p className="text-xs text-surface-400">{formatMonth(bill.billing_month)}</p>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      {/* Pending payment notice — the bill balance intentionally isn't
          updated until an accountant/admin approves it. */}
      {pendingPayment && (
        <div className="flex items-start gap-3 p-3.5 bg-warning-50 border border-warning-200 rounded-xl">
          <Clock className="w-4 h-4 text-warning-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-warning-700">
              {formatCurrency(pendingPayment.paid_amount)} payment pending review
            </div>
            <div className="text-xs text-warning-600 mt-0.5">
              Submitted {formatDate(pendingPayment.payment_date)} via {pendingPayment.payment_method}.
              Your bill will update once it's approved.
            </div>
          </div>
        </div>
      )}

      {/* Amount card */}
      <div className="card text-center !py-6">
        <div className="text-xs text-surface-400 mb-1">
          {isPaid ? L.totalAmount : L.amountDue}
        </div>
        <div className="text-3xl font-bold text-surface-900">
          {formatCurrency(isPaid ? bill.total_amount : bill.due_amount)}
        </div>
        {!isPaid && Number(bill.paid_amount) > 0 && (
          <div className="text-xs text-success-600 mt-1">
            {formatCurrency(bill.paid_amount)} already paid
          </div>
        )}
      </div>

      {/* One-tap bKash payment — shown while something is due and no manual
          payment is waiting for review (same condition as Pay Manually). */}
      {!isPaid && !pendingPayment && Number(bill.due_amount) > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleBkashPay}
            disabled={bkashLoading}
            className="btn-primary w-full justify-center !bg-pink-600 hover:!bg-pink-700 !py-3 text-base"
            aria-label="Pay with bKash"
          >
            {bkashLoading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting to bKash…</>
              : <><Smartphone className="w-5 h-5" /> {L.payWithBkash} · {formatCurrency(bill.due_amount)}</>}
          </button>
          {bkashError && (
            <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {bkashError}
            </div>
          )}
        </div>
      )}

      {/* Same blocks, same order, same wording as the staff page */}
      <UnitDetailsCard bill={bill} />
      <MeterReadingsCard bill={bill} />
      <BillSummaryCard bill={bill} />
      <PaymentHistoryCard payments={billPayments} />

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handleDownload} className="btn-secondary flex-1" disabled={downloading}>
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {L.invoice}
        </button>
        {!isPaid && !pendingPayment && (
          <button
            onClick={() => navigate(`/portal/payment?bill=${bill.id}`)}
            className="btn-primary flex-1"
          >
            <Send className="w-4 h-4" /> {L.makePayment}
          </button>
        )}
      </div>
    </div>
  )
}