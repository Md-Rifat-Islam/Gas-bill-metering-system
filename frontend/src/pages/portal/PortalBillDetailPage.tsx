import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Send, Loader2 } from 'lucide-react'
import { portalAPI, portalPaymentChannelsAPI } from '@/api/portalClient'
import { PageLoader, StatusBadge } from '@/components/ui'
import { PaymentChannelsCard } from '@/components/payments/PaymentChannelsCard'
import { BkashComingSoon } from '@/components/payments/BkashComingSoon'
import { formatCurrency } from '@/utils/helpers'
import toast from 'react-hot-toast'

export default function PortalBillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)

  const { data: bill, isLoading } = useQuery({
    queryKey: ['portal-bill', id],
    queryFn: () => portalAPI.bill(Number(id)).then(r => r.data),
  })

  const { data: channels } = useQuery({
    queryKey: ['portal-payment-channels'],
    queryFn: () => portalPaymentChannelsAPI.get().then(r => r.data),
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

  if (isLoading) return <PageLoader />
  if (!bill) return <div className="text-center py-20 text-surface-400">Bill not found</div>

  const isPaid = bill.status === 'Paid'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/portal/bills')} className="btn-ghost btn-sm !p-2" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-surface-900">{bill.billing_month_display}</h1>
          <p className="text-xs text-surface-400 font-mono">{bill.bill_number}</p>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      {/* Amount card */}
      <div className="card text-center !py-6">
        <div className="text-xs text-surface-400 mb-1">
          {isPaid ? 'Total Amount' : 'Amount Due'}
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

      {/* Payment channels + gateway status — only relevant while something is still due */}
      {!isPaid && (
        <>
          <PaymentChannelsCard data={channels} />
          <BkashComingSoon />
        </>
      )}

      {/* Meter readings */}
      <div className="card">
        <div className="text-sm font-semibold text-surface-800 mb-3">Meter Readings</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-surface-50 rounded-xl p-3">
            <div className="text-[11px] text-surface-400">Previous</div>
            <div className="font-mono font-bold text-surface-700">{bill.previous_reading}</div>
          </div>
          <div className="bg-brand-50 rounded-xl p-3">
            <div className="text-[11px] text-brand-400">Usage</div>
            <div className="font-mono font-bold text-brand-700">{bill.total_usage_m3}</div>
          </div>
          <div className="bg-surface-50 rounded-xl p-3">
            <div className="text-[11px] text-surface-400">Current</div>
            <div className="font-mono font-bold text-surface-700">{bill.current_reading}</div>
          </div>
        </div>
      </div>

      {/* Charges breakdown */}
      <div className="card">
        <div className="text-sm font-semibold text-surface-800 mb-3">Charges</div>
        <div className="space-y-2 text-sm">
          <Row label="Base Amount" value={formatCurrency(bill.base_amount)} />
          <Row label={`Unit Price (৳${bill.unit_price}/m³)`} value="" muted />
          <Row label="Service Charge" value={`+ ${formatCurrency(bill.service_charge)}`} />
          {Number(bill.extra_charge) > 0 && <Row label="Extra Charge" value={`+ ${formatCurrency(bill.extra_charge)}`} />}
          {Number(bill.late_fee) > 0 && <Row label="Late Fee" value={`+ ${formatCurrency(bill.late_fee)}`} warn />}
          {Number(bill.discount) > 0 && <Row label="Discount" value={`− ${formatCurrency(bill.discount)}`} success />}
          <div className="border-t-2 border-surface-900 pt-2 flex justify-between">
            <span className="font-bold text-surface-900">Total</span>
            <span className="font-bold text-lg text-brand-700">{formatCurrency(bill.total_amount)}</span>
          </div>
        </div>
        {bill.is_adjusted && bill.adjustment_reason && (
          <div className="mt-3 p-2.5 bg-warning-50 rounded-lg text-xs text-warning-700">
            <span className="font-semibold">Note: </span>{bill.adjustment_reason}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handleDownload} className="btn-secondary flex-1" disabled={downloading}>
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Invoice
        </button>
        {!isPaid && (
          <button
            onClick={() => navigate(`/portal/payment?bill=${bill.id}`)}
            className="btn-primary flex-1"
          >
            <Send className="w-4 h-4" /> Submit Payment
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, muted, warn, success }: { label: string; value: string; muted?: boolean; warn?: boolean; success?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-surface-400 text-xs' : 'text-surface-500'}>{label}</span>
      <span className={
        muted ? '' :
        warn ? 'text-warning-600 font-medium' :
        success ? 'text-success-600 font-medium' :
        'font-semibold text-surface-800'
      }>{value}</span>
    </div>
  )
}