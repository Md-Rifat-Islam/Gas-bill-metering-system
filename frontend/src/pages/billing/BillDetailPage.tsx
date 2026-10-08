import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, Trash2, Smartphone, Loader2 } from 'lucide-react'
import { billingAPI, paymentsAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import { PageLoader, StatusBadge, ConfirmDialog } from '@/components/ui'
import { PaymentModal } from '@/components/payments/PaymentModal'
import {
  UnitDetailsCard, MeterReadingsCard, BillSummaryCard, PaymentHistoryCard,
} from '@/components/billing/BillShared'
import { formatMonth } from '@/utils/helpers'
import toast from 'react-hot-toast'

export default function BillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [payModal, setPayModal] = useState(false)
  const { can } = usePermissions()
  const { confirmState, confirm, handleClose } = useConfirm()

  const [searchParams, setSearchParams] = useSearchParams()
  const [bkashLoading, setBkashLoading] = useState(false)

  const { data: bill, isLoading } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => billingAPI.get(Number(id)).then(r => r.data),
    // A customer may submit/pay from the portal while staff has this page
    // open — re-check periodically and when the tab regains focus so the
    // paid/due figures never go stale.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const { data: payments = [] } = useQuery({
    queryKey: ['payments', id],
    queryFn: () => paymentsAPI.list({ bill: id }).then(r => r.data.results || r.data),
    enabled: !!id,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  // Handles the redirect bKash sends the browser back to after a
  // staff-initiated checkout (see paymentsAPI.bkashInitiate). The Payment
  // row is already created server-side by the callback by the time this
  // fires — this just refreshes the page's data and clears the query
  // params so a page refresh doesn't re-trigger the toast.
  useEffect(() => {
    const bkashStatus = searchParams.get('bkash')
    if (!bkashStatus) return

    if (bkashStatus === 'success') {
      qc.invalidateQueries({ queryKey: ['bill', id] })
      qc.invalidateQueries({ queryKey: ['payments', id] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      toast.success('bKash payment confirmed and applied')
    } else if (bkashStatus === 'cancelled') {
      toast('bKash checkout was cancelled — no amount was charged.', { icon: '⚠️' })
    } else {
      toast.error('bKash payment could not be completed. No amount was charged.')
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('bkash')
        next.delete('bill')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, id])

  const deleteBill = useMutation({
    mutationFn: () => billingAPI.delete(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill deleted')
      navigate('/billing')
    },
  })

  const handleDelete = async () => {
    const ok = await confirm(
      'Delete bill',
      `Are you sure you want to delete bill #${bill?.bill_number}? This action cannot be undone.`
    )
    if (ok) deleteBill.mutate()
  }

  const handleStaffBkash = async () => {
    setBkashLoading(true)
    try {
      const res = await paymentsAPI.bkashInitiate(Number(id))
      // Full-page redirect to bKash's hosted checkout — the customer
      // completes payment on their own phone/bKash app from here, and
      // bKash sends the browser back to this exact page with ?bkash=...
      window.location.href = res.data.bkash_url
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not start bKash checkout')
      setBkashLoading(false)
    }
  }

  if (isLoading) return <PageLoader />
  if (!bill) return <div className="text-center py-20 text-surface-400">Bill not found</div>

  const isPaid = bill.status === 'Paid'

  return (
    <div className="max-w-4xl">
      {/* Header — wraps to multiple rows on narrow screens. */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8">
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/billing')}
          aria-label="Back to billing list"
          title="Back to billing list"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-[160px]">
          <h1 className="page-title">Bill #{bill.bill_number}</h1>
          <p className="page-subtitle">{formatMonth(bill.billing_month)}</p>
        </div>
        <StatusBadge status={bill.status} />
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {!isPaid && can.recordPayment && (
            <button
              className="btn-secondary flex-1 sm:flex-none justify-center !bg-pink-600 !text-white !border-pink-600 hover:!bg-pink-700"
              onClick={handleStaffBkash}
              disabled={bkashLoading}
              aria-label="Pay with bKash"
              title="Start a bKash checkout for this bill"
            >
              {bkashLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                : <><Smartphone className="w-4 h-4" /> Pay with bKash</>}
            </button>
          )}
          {!isPaid && can.recordPayment && (
            <button
              className="btn-primary flex-1 sm:flex-none justify-center"
              onClick={() => setPayModal(true)}
              aria-label="Record payment"
              title="Record payment"
            >
              <CreditCard className="w-4 h-4" /> Record Payment
            </button>
          )}
          {can.deleteBill && (
            <button
              className="btn-secondary flex-1 sm:flex-none justify-center text-danger-600 border-danger-200 hover:bg-danger-50"
              onClick={handleDelete}
              disabled={deleteBill.isPending}
              aria-label="Delete bill"
              title="Delete bill"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <UnitDetailsCard bill={bill} showMobile />
          <MeterReadingsCard bill={bill} />
          <PaymentHistoryCard payments={payments} />
        </div>

        <div>
          <BillSummaryCard bill={bill} sticky />
        </div>
      </div>

      <PaymentModal open={payModal} onClose={() => setPayModal(false)} bill={bill} />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger
        onClose={() => handleClose(false)}
        onConfirm={() => handleClose(true)}
      />
    </div>
  )
}