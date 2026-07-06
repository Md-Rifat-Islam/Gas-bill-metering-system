import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Smartphone, Landmark, Save } from 'lucide-react'
import { paymentChannelsAPI } from '@/api/client'
import { PageLoader, AccessDenied } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import toast from 'react-hot-toast'

export default function PaymentChannelSettingsPage() {
  const { can } = usePermissions()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['payment-channel-settings'],
    queryFn: () => paymentChannelsAPI.get().then(r => r.data),
    enabled: can.viewSystemSettings,
  })

  const { register, handleSubmit, formState: { isDirty } } = useForm({
    values: data,
  })

  const save = useMutation({
    mutationFn: (formData: any) => paymentChannelsAPI.update(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-channel-settings'] })
      toast.success('Payment channel details updated')
    },
  })

  if (!can.viewSystemSettings) return <AccessDenied />
  if (isLoading) return <PageLoader />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Channel Settings</h1>
          <p className="page-subtitle">
            bKash, Nagad, and bank details shown to customers before they submit a payment
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-6 max-w-2xl">
        {/* bKash / Nagad */}
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
          <div className="flex items-center gap-2 font-semibold text-surface-800 mb-4">
            <Smartphone className="w-4 h-4 text-pink-500" /> Mobile Wallets
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">bKash Number</label>
              <input {...register('bkash_number')} className="input" placeholder="01XXXXXXXXX" />
            </div>
            <div>
              <label className="label">bKash Type</label>
              <select {...register('bkash_type')} className="input">
                <option value="Personal">Personal</option>
                <option value="Merchant">Merchant</option>
              </select>
            </div>
            <div>
              <label className="label">Nagad Number</label>
              <input {...register('nagad_number')} className="input" placeholder="01XXXXXXXXX" />
            </div>
          </div>
        </div>

        {/* Bank */}
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
          <div className="flex items-center gap-2 font-semibold text-surface-800 mb-4">
            <Landmark className="w-4 h-4 text-brand-500" /> Bank Transfer
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bank Name</label>
              <input {...register('bank_name')} className="input" placeholder="e.g. Dutch-Bangla Bank" />
            </div>
            <div>
              <label className="label">Account Name</label>
              <input {...register('bank_account_name')} className="input" placeholder="Account holder name" />
            </div>
            <div>
              <label className="label">Account Number</label>
              <input {...register('bank_account_number')} className="input" placeholder="XXXXXXXXXXXX" />
            </div>
            <div>
              <label className="label">Branch</label>
              <input {...register('bank_branch')} className="input" placeholder="Branch name" />
            </div>
            <div>
              <label className="label">Routing Number</label>
              <input {...register('bank_routing_number')} className="input" placeholder="XXXXXXXXX" />
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
          <label className="label">Extra Instructions <span className="text-surface-400 font-normal text-xs">(optional)</span></label>
          <textarea
            {...register('instructions')}
            className="input" rows={3}
            placeholder="e.g. Please include your unit number in the payment reference."
          />
        </div>

        {data?.updated_by_name && (
          <p className="text-xs text-surface-400">
            Last updated by {data.updated_by_name}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={!isDirty || save.isPending}>
          <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}