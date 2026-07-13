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
    defaultValues: { meter_no: '', meter_type: 'Standard', barcode: '' },
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

        <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Update Meter' : 'Assign Meter'}
          </button>
        </div>
      </form>
    </Modal>
  )
}