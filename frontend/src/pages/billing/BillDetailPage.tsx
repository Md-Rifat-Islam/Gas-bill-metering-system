import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, CreditCard, Printer, History, Trash2 } from 'lucide-react'
import { billingAPI, paymentsAPI, auditAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import { Modal, PageLoader, StatusBadge, ConfirmDialog } from '@/components/ui'
import { formatCurrency, formatDate, formatMonth } from '@/utils/helpers'
import toast from 'react-hot-toast'

function PaymentModal({ open, onClose, bill }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { paid_amount: bill?.due_amount || 0, payment_method: 'Cash', transaction_id: '', notes: '' }
  })
  const pay = useMutation({
    mutationFn: (data: any) => paymentsAPI.create({ ...data, bill_id: bill.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill', bill.id] })
      qc.invalidateQueries({ queryKey: ['payments', bill.id] })
      toast.success('Payment recorded')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title="Record Payment" size="sm">
      <form onSubmit={handleSubmit(d => pay.mutate(d))} className="space-y-4">
        <div className="bg-surface-50 rounded-xl p-4 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-surface-500">Bill</span><span className="font-mono font-semibold">{bill?.bill_number}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Total</span><span className="font-semibold">{formatCurrency(bill?.total_amount || 0)}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Paid</span><span className="text-success-600 font-semibold">{formatCurrency(bill?.paid_amount || 0)}</span></div>
          <div className="flex justify-between border-t border-surface-200 pt-1.5">
            <span className="font-semibold">Due</span>
            <span className="text-danger-600 font-bold text-base">{formatCurrency(bill?.due_amount || 0)}</span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pay-amount">Amount (৳) <span className="text-danger-500">*</span></label>
          <input
            id="pay-amount"
            {...register('paid_amount', { required: true, min: 0.01 })}
            type="number"
            step="0.01"
            className="input"
            aria-label="Payment amount"
            title="Payment amount"
          />
        </div>
        <div>
          <label className="label" htmlFor="pay-method">Payment Method <span className="text-danger-500">*</span></label>
          <select
            id="pay-method"
            {...register('payment_method', { required: true })}
            className="input"
            aria-label="Payment method"
            title="Payment method"
          >
            <option value="Cash">Cash</option>
            <option value="Bank">Bank Transfer</option>
            <option value="bKash">bKash</option>
            <option value="Card">Card</option>
            <option value="SSLCommerz">SSLCommerz</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-txn">Transaction ID</label>
          <input
            id="pay-txn"
            {...register('transaction_id')}
            className="input"
            placeholder="Optional"
            aria-label="Transaction ID"
            title="Transaction ID"
          />
        </div>
        <div>
          <label className="label" htmlFor="pay-notes">Notes</label>
          <textarea
            id="pay-notes"
            {...register('notes')}
            className="input"
            rows={2}
            aria-label="Notes"
            title="Notes"
          />
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Cancel" title="Cancel">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={pay.isPending}
            aria-label="Record payment"
            title="Record payment"
          >
            {pay.isPending ? 'Processing…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [payModal, setPayModal] = useState(false)
  const { can } = usePermissions()
  const { confirmState, confirm, handleClose } = useConfirm()

  const { data: bill, isLoading } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => billingAPI.get(Number(id)).then(r => r.data),
  })
  const { data: payments = [] } = useQuery({
    queryKey: ['payments', id],
    queryFn: () => paymentsAPI.list({ bill: id }).then(r => r.data.results || r.data),
    enabled: !!id,
  })

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

  if (isLoading) return <PageLoader />
  if (!bill) return <div className="text-center py-20 text-surface-400">Bill not found</div>

  const isPaid = bill.status === 'Paid'

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/billing')}
          aria-label="Back to billing list"
          title="Back to billing list"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="page-title">Bill #{bill.bill_number}</h1>
          <p className="page-subtitle">{formatMonth(bill.billing_month)}</p>
        </div>
        <StatusBadge status={bill.status} />
        {!isPaid && can.recordPayment && (
          <button
            className="btn-primary"
            onClick={() => setPayModal(true)}
            aria-label="Record payment"
            title="Record payment"
          >
            <CreditCard className="w-4 h-4" /> Record Payment
          </button>
        )}
        {can.deleteBill && (
          <button
            className="btn-secondary text-danger-600 border-danger-200 hover:bg-danger-50"
            onClick={handleDelete}
            disabled={deleteBill.isPending}
            aria-label="Delete bill"
            title="Delete bill"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Bill details */}
        <div className="col-span-2 space-y-6">
          {/* Unit info */}
          <div className="card">
            <div className="text-sm font-bold text-surface-500 uppercase tracking-wider mb-4">Unit Details</div>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <InfoRow label="Project"  value={bill.project_name} />
              <InfoRow label="Building" value={bill.building_name} />
              <InfoRow label="Unit"     value={bill.unit_no} />
              <InfoRow label="Allottee" value={bill.allottee_name || '—'} />
              <InfoRow label="Mobile"   value={bill.allottee_mobile || '—'} mono />
            </div>
          </div>

          {/* Meter readings */}
          <div className="card">
            <div className="text-sm font-bold text-surface-500 uppercase tracking-wider mb-4">Meter Readings</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-surface-50 rounded-xl p-4">
                <div className="text-xs text-surface-400 mb-1">Previous</div>
                <div className="text-2xl font-bold font-mono text-surface-700">{bill.previous_reading}</div>
                <div className="text-xs text-surface-400">m³</div>
              </div>
              <div className="bg-brand-50 rounded-xl p-4">
                <div className="text-xs text-brand-400 mb-1">Usage</div>
                <div className="text-2xl font-bold font-mono text-brand-700">{bill.total_usage_m3}</div>
                <div className="text-xs text-brand-400">m³</div>
              </div>
              <div className="bg-surface-50 rounded-xl p-4">
                <div className="text-xs text-surface-400 mb-1">Current</div>
                <div className="text-2xl font-bold font-mono text-surface-700">{bill.current_reading}</div>
                <div className="text-xs text-surface-400">m³</div>
              </div>
            </div>
          </div>

          {/* Payment history */}
          <div className="card">
            <div className="text-sm font-bold text-surface-500 uppercase tracking-wider mb-4">
              Payment History ({payments.length})
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-surface-400">No payments recorded yet</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 px-3 bg-surface-50 rounded-xl text-sm">
                    <div>
                      <span className="font-semibold text-surface-800">{formatCurrency(p.paid_amount)}</span>
                      <span className="ml-2 badge-blue">{p.payment_method}</span>
                      {p.transaction_id && (
                        <span className="ml-2 text-xs font-mono text-surface-400">#{p.transaction_id}</span>
                      )}
                    </div>
                    <div className="text-surface-400 text-xs">{formatDate(p.payment_date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Amount summary */}
        <div>
          <div className="card sticky top-4">
            <div className="text-sm font-bold text-surface-500 uppercase tracking-wider mb-4">Bill Summary</div>
            <div className="space-y-2.5 text-sm">
              <SummaryRow label="Base Amount"   value={formatCurrency(bill.base_amount)} />
              <SummaryRow label="Unit Price"    value={`${formatCurrency(bill.unit_price)}/m³`} muted />
              <SummaryRow label="Service Charge" value={`+ ${formatCurrency(bill.service_charge)}`} />
              {Number(bill.extra_charge) > 0 && (
                <SummaryRow label="Extra Charge" value={`+ ${formatCurrency(bill.extra_charge)}`} />
              )}
              {Number(bill.late_fee) > 0 && (
                <SummaryRow label="Late Fee" value={`+ ${formatCurrency(bill.late_fee)}`} warn />
              )}
              {Number(bill.discount) > 0 && (
                <SummaryRow label="Discount" value={`− ${formatCurrency(bill.discount)}`} success />
              )}
              <div className="border-t-2 border-surface-900 pt-3 flex justify-between">
                <span className="font-bold text-surface-900">Total</span>
                <span className="font-bold text-xl text-brand-700">{formatCurrency(bill.total_amount)}</span>
              </div>
              <div className="pt-1 space-y-2">
                <SummaryRow label="Paid" value={formatCurrency(bill.paid_amount)} success />
                <div className="bg-danger-50 rounded-xl p-3 flex justify-between">
                  <span className="font-semibold text-danger-700">Due</span>
                  <span className="font-bold text-danger-700">{formatCurrency(bill.due_amount)}</span>
                </div>
              </div>
            </div>

            {bill.is_adjusted && bill.adjustment_reason && (
              <div className="mt-4 p-3 bg-warning-50 rounded-xl text-xs text-warning-700">
                <span className="font-semibold">Adjustment: </span>{bill.adjustment_reason}
              </div>
            )}
          </div>
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div className="text-surface-500">{label}</div>
      <div className={`font-semibold text-surface-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </>
  )
}

function SummaryRow({ label, value, muted, warn, success }: any) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-500">{label}</span>
      <span className={muted ? 'text-surface-400' : warn ? 'text-warning-600' : success ? 'text-success-600' : 'font-semibold text-surface-800'}>
        {value}
      </span>
    </div>
  )
}
