import { Smartphone, Landmark } from 'lucide-react'
import type { PaymentChannelSettings } from '@/types'

interface PaymentChannelsCardProps {
  data?: PaymentChannelSettings | null
  className?: string
}

export function PaymentChannelsCard({ data, className = 'card' }: PaymentChannelsCardProps) {
  if (!data) return null

  const hasBkash = Boolean(data.bkash_number)
  const hasNagad = Boolean(data.nagad_number)
  const hasBank  = Boolean(data.bank_account_number)

  if (!hasBkash && !hasNagad && !hasBank) return null

  return (
    <div className={className}>
      <div className="text-sm font-semibold text-surface-800 mb-3">Payment Channels</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {hasBkash && (
          <div className="rounded-xl border border-pink-100 bg-pink-50 p-3">
            <div className="flex items-center gap-2 text-pink-700 font-semibold text-xs mb-1">
              <Smartphone className="w-3.5 h-3.5" /> bKash
            </div>
            <div className="font-mono font-bold text-surface-800">{data.bkash_number}</div>
            {data.bkash_type && <div className="text-[11px] text-surface-400">{data.bkash_type}</div>}
          </div>
        )}
        {hasNagad && (
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
            <div className="flex items-center gap-2 text-orange-700 font-semibold text-xs mb-1">
              <Smartphone className="w-3.5 h-3.5" /> Nagad
            </div>
            <div className="font-mono font-bold text-surface-800">{data.nagad_number}</div>
          </div>
        )}
        {hasBank && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
            <div className="flex items-center gap-2 text-brand-700 font-semibold text-xs mb-1">
              <Landmark className="w-3.5 h-3.5" /> Bank Transfer
            </div>
            {data.bank_name && <div className="text-xs font-medium text-surface-700">{data.bank_name}</div>}
            <div className="font-mono font-bold text-surface-800">{data.bank_account_number}</div>
            {data.bank_account_name && <div className="text-[11px] text-surface-400">{data.bank_account_name}</div>}
            {data.bank_branch && <div className="text-[11px] text-surface-400">Branch: {data.bank_branch}</div>}
            {data.bank_routing_number && (
              <div className="text-[11px] text-surface-400">Routing: {data.bank_routing_number}</div>
            )}
          </div>
        )}
      </div>
      {data.instructions && (
        <p className="text-xs text-surface-400 mt-3">{data.instructions}</p>
      )}
    </div>
  )
}