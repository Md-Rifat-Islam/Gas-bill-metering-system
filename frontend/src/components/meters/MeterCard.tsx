import { Gauge, Phone, MapPin, Calendar } from 'lucide-react'
import { cn } from '@/utils/helpers'
import type { MeterCardData } from '@/types'

const STATUS_STYLES: Record<string, string> = {
  Completed: 'border-success-200 bg-success-50',
  Pending:   'border-amber-200 bg-amber-50',
  Problem:   'border-danger-200 bg-danger-50',
  Inactive:  'border-surface-200 bg-surface-100 opacity-70',
}

const STATUS_DOT: Record<string, string> = {
  Completed: 'bg-success-500',
  Pending:   'bg-amber-500',
  Problem:   'bg-danger-500',
  Inactive:  'bg-surface-400',
}

interface MeterCardProps {
  data: MeterCardData
  focused?: boolean
  onOpen: (data: MeterCardData) => void
}

export function MeterCard({ data, focused, onOpen }: MeterCardProps) {
  const disabled = data.reading_status === 'Inactive'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ? 'true' : 'false'}
      onClick={() => !disabled && onOpen(data)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen(data)
        }
      }}
      className={cn(
        'relative rounded-2xl border-2 p-4 flex flex-col gap-2 transition-all cursor-pointer',
        'hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-400',
        disabled && 'cursor-not-allowed',
        STATUS_STYLES[data.reading_status] || 'border-surface-200 bg-white',
        focused && 'ring-2 ring-brand-500'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_DOT[data.reading_status])} />
          <span className="font-mono font-bold text-sm text-surface-900">{data.meter_no}</span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">
          {data.reading_status}
        </span>
      </div>

      <div className="text-sm font-semibold text-surface-800 truncate">
        {data.allottee_name || 'Unassigned'}
      </div>

      <div className="flex items-center gap-1 text-xs text-surface-500">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">Floor {data.floor_no} · Unit {data.unit_no} · {data.building_name}</span>
      </div>

      {data.allottee_mobile && (
        <div className="flex items-center gap-1 text-xs text-surface-400">
          <Phone className="w-3 h-3 shrink-0" /> {data.allottee_mobile}
        </div>
      )}

      <div className="flex items-center justify-between mt-1 pt-2 border-t border-black/5">
        <div>
          <div className="text-[10px] text-surface-400 uppercase tracking-wide">Previous</div>
          <div className="font-mono font-bold text-surface-800">{data.previous_reading}</div>
        </div>
        {data.previous_reading_date && (
          <div className="flex items-center gap-1 text-[10px] text-surface-400">
            <Calendar className="w-3 h-3" />
            {data.previous_reading_date}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] mt-1">
        <span className="px-2 py-0.5 rounded-full bg-black/5 text-surface-500 font-medium">
          {data.billing_status}
        </span>
        {!disabled && (
          <span className="flex items-center gap-1 text-brand-600 font-semibold">
            <Gauge className="w-3 h-3" /> Record
          </span>
        )}
      </div>
    </div>
  )
}