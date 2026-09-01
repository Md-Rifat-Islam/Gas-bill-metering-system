import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Lock } from 'lucide-react'
import { metersAPI } from '@/api/client'
import { Modal } from '@/components/ui'
import toast from 'react-hot-toast'

interface UnitForMeter {
  id: number
  floor_no: number
  unit_no: string
  building_name: string
  meter_id: number | null
  meter_no: string | null
  meter_type: string | null
  barcode: string | null
  // Only present if the Units list endpoint exposes it — see the note in
  // the component below if this is coming through as undefined.
  initial_reading?: number | string | null
}

interface MeterAssignModalProps {
  open: boolean
  onClose: () => void
  unit: UnitForMeter | null
}

export function MeterAssignModal({ open, onClose, unit }: MeterAssignModalProps) {
  const qc = useQueryClient()
  const isEdit = Boolean(unit?.meter_id)

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { meter_no: '', meter_type: 'Standard', barcode: '', initial_reading: '0' },
  })

  // Reset whenever the modal (re)opens for a (possibly different) unit —
  // this component stays mounted between opens, same pattern as the other
  // shared modals in this app.
  useEffect(() => {
    if (open && unit) {
      reset({
        meter_no: unit.meter_no || '',
        meter_type: unit.meter_type || 'Standard',
        barcode: unit.barcode || '',
        initial_reading:
          unit.initial_reading !== null && unit.initial_reading !== undefined
            ? String(unit.initial_reading)
            : '0',
      })
    }
  }, [open, unit, reset])

  const save = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? metersAPI.update(unit!.meter_id as number, data)
        : metersAPI.create({ ...data, unit_id: unit!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] })
      qc.invalidateQueries({ queryKey: ['meters'] })
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      toast.success(isEdit ? 'Meter updated' : 'Meter assigned')
      onClose()
      reset()
    },
  })

  if (!unit) return null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Meter' : 'Assign Meter'} size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div className="bg-surface-50 rounded-xl p-3 text-sm flex items-center justify-between">
          <div>
            <div className="text-surface-500 text-xs">Unit</div>
            <div className="font-semibold text-surface-800">
              Floor {unit.floor_no} — {unit.unit_no}
            </div>
            <div className="text-xs text-surface-400">{unit.building_name}</div>
          </div>
          <Lock className="w-3.5 h-3.5 text-surface-300" />
        </div>
        <div>
          <label className="label" htmlFor="meter-no">Meter No. <span className="text-danger-500">*</span></label>
          <input
            id="meter-no"
            {...register('meter_no', { required: true })}
            className="input"
            placeholder="MTR-00001"
            aria-label="Meter number"
          />
        </div>
        <div>
          <label className="label" htmlFor="meter-type">Meter Type</label>
          <input
            id="meter-type"
            {...register('meter_type')}
            className="input"
            placeholder="Standard"
            aria-label="Meter type"
          />
        </div>
        <div>
          <label className="label" htmlFor="meter-initial-reading">
            Initial Reading <span className="text-surface-400 font-normal text-xs">(dial value right now)</span>
          </label>
          <input
            id="meter-initial-reading"
            {...register('initial_reading', { required: true, min: 0 })}
            type="number"
            step="0.001"
            min="0"
            className="input"
            placeholder="0.000"
            aria-label="Initial meter reading"
          />
          <p className="text-xs text-surface-400 mt-1">
            Only leave this at 0 if the meter is brand new/unused. Otherwise enter what the
            dial actually shows right now — this becomes the starting point for this meter's
            first bill, so the resident isn't charged for usage from before it was assigned here.
            Has no effect once a reading has already been recorded for this meter.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="meter-barcode">
            Barcode / QR <span className="text-surface-400 font-normal text-xs">(optional)</span>
          </label>
          <input
            id="meter-barcode"
            {...register('barcode')}
            className="input"
            placeholder="Scan or type barcode payload"
            aria-label="Barcode"
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : isEdit ? 'Update Meter' : 'Assign Meter'}
          </button>
        </div>
      </form>
    </Modal>
  )
}