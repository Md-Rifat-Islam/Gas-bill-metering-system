import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { paymentsAPI } from '@/api/client'
import { Modal } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'
import toast from 'react-hot-toast'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  bill: any
  /** Called after a successful payment, in addition to the default bill/payments cache invalidation. */
  onPaid?: () => void
}

export function PaymentModal({ open, onClose, bill, onPaid }: PaymentModalProps) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: { paid_amount: bill?.due_amount || 0, payment_method: 'Cash', transaction_id: '', notes: '' }
  })
  const enteredAmount = Number(watch('paid_amount')) || 0
  const previousDue = Number(bill?.due_amount || 0)
  const remainingDue = Math.max(0, previousDue - enteredAmount)
  const overpaying = enteredAmount > previousDue

  const pay = useMutation({
    mutationFn: (data: any) => paymentsAPI.create({ ...data, bill_id: bill.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill', bill.id] })
      qc.invalidateQueries({ queryKey: ['payments', bill.id] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      qc.invalidateQueries({ queryKey: ['all-payments'] })
      toast.success('Payment recorded')
      onClose(); reset()
      onPaid?.()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Record Payment" size="sm">
      <form onSubmit={handleSubmit(d => pay.mutate(d))} className="space-y-4">
        <div className="bg-surface-50 rounded-xl p-4 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-surface-500">Bill</span><span className="font-mono font-semibold">{bill?.bill_number}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Total</span><span className="font-semibold">{formatCurrency(bill?.total_amount || 0)}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Previous Paid</span><span className="text-success-600 font-semibold">{formatCurrency(bill?.paid_amount || 0)}</span></div>
          <div className="flex justify-between border-t border-surface-200 pt-1.5">
            <span className="font-semibold">Previous Due</span>
            <span className="text-danger-600 font-bold text-base">{formatCurrency(previousDue)}</span>
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

        {/* Live remaining-due preview — recalculates as the amount is typed */}
        <div className={`rounded-xl p-3 flex justify-between items-center text-sm ${
          overpaying ? 'bg-danger-50' : remainingDue === 0 ? 'bg-success-50' : 'bg-brand-50'
        }`}>
          <span className={overpaying ? 'text-danger-600 font-medium' : 'text-surface-600'}>
            {overpaying ? 'Exceeds due amount' : 'Remaining Due After This Payment'}
          </span>
          <span className={`font-bold ${
            overpaying ? 'text-danger-700' : remainingDue === 0 ? 'text-success-700' : 'text-brand-700'
          }`}>
            {formatCurrency(remainingDue)}
          </span>
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
            disabled={pay.isPending || overpaying}
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
