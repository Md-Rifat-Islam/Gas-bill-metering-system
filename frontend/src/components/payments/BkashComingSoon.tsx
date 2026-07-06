import { Smartphone, Clock } from 'lucide-react'

export function BkashComingSoon({ className = 'card' }: { className?: string }) {
  return (
    <div className={`${className} !border-2 !border-dashed !border-pink-200 !bg-pink-50/50 flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4 text-pink-500" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-surface-800 text-sm truncate">bKash Payment Gateway</div>
          <div className="text-xs text-surface-400 truncate">Pay instantly online via bKash checkout</div>
        </div>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-pink-600 bg-white border border-pink-200 rounded-full px-2.5 py-1.5 shrink-0">
        <Clock className="w-3 h-3" /> Coming Soon
      </span>
    </div>
  )
}