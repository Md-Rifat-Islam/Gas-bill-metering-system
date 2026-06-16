import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, Eye, Filter } from 'lucide-react'
import { billingAPI, buildingsAPI, projectsAPI, unitsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination, StatusBadge } from '@/components/ui'
import { formatCurrency, formatMonth } from '@/utils/helpers'
import { usePermissions } from '@/hooks/usePermissions'
import toast from 'react-hot-toast'

function CreateBillModal({ open, onClose }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors } } = useForm({
    defaultValues: {
      project_id: '', building_id: '', unit_id: '',
      billing_month: new Date().toISOString().slice(0, 7),
      previous_reading: 0, current_reading: 0,
      unit_price: 0, service_charge: 0,
      extra_charge: 0, discount: 0, late_fee: 0,
      is_adjusted: false, adjustment_reason: '',
    }
  })

  const projectId = watch('project_id')
  const buildingId = watch('building_id')
  const prevReading = watch('previous_reading') || 0
  const currReading = watch('current_reading') || 0
  const unitPrice = watch('unit_price') || 0
  const serviceCharge = watch('service_charge') || 0
  const extraCharge = watch('extra_charge') || 0
  const discount = watch('discount') || 0
  const lateFee = watch('late_fee') || 0
  const isAdjusted = watch('is_adjusted')

  const usage = Math.max(0, Number(currReading) - Number(prevReading))
  const baseAmount = usage * Number(unitPrice)
  const total = baseAmount + Number(serviceCharge) + Number(extraCharge) + Number(lateFee) - Number(discount)

  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 100 }).then(r => r.data.results || r.data),
  })
  const { data: buildings } = useQuery({
    queryKey: ['buildings-by-project', projectId],
    queryFn: () => buildingsAPI.list({ project: projectId, page_size: 100 }).then(r => r.data.results || r.data),
    enabled: !!projectId,
  })
  const { data: units } = useQuery({
    queryKey: ['units-by-building', buildingId],
    queryFn: () => unitsAPI.list({ building: buildingId, status: 'Active', page_size: 200 }).then(r => r.data.results || r.data),
    enabled: !!buildingId,
  })

  // Auto-fill package price when unit selected
  const selectedUnit = units?.find((u: any) => String(u.id) === String(watch('unit_id')))

  const save = useMutation({
    mutationFn: (data: any) => billingAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill created successfully')
      onClose(); reset()
    },
  })

  const onSubmit = (data: any) => {
    const payload = {
      unit_id: data.unit_id,
      building_id: data.building_id,
      project_id: data.project_id,
      billing_month: data.billing_month.length === 7 ? data.billing_month + '-01' : data.billing_month,
      previous_reading: data.previous_reading,
      current_reading: data.current_reading,
      unit_price: data.unit_price,
      service_charge: data.service_charge,
      extra_charge: data.extra_charge,
      discount: data.discount,
      late_fee: data.late_fee,
      is_adjusted: data.is_adjusted,
      adjustment_reason: data.adjustment_reason,
    }
    save.mutate(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title="Create New Bill" size="xl">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-3 gap-8">
          {/* Left column */}
          <div className="col-span-2 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Project *</label>
                <select {...register('project_id', { required: true })} className="input"
                  onChange={e => { setValue('project_id', e.target.value); setValue('building_id', ''); setValue('unit_id', '') }}>
                  <option value="">— Select —</option>
                  {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Building *</label>
                <select {...register('building_id', { required: true })} className="input"
                  onChange={e => { setValue('building_id', e.target.value); setValue('unit_id', '') }}
                  disabled={!projectId}>
                  <option value="">— Select —</option>
                  {buildings?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Unit *</label>
                <select {...register('unit_id', { required: true })} className="input" disabled={!buildingId}>
                  <option value="">— Select —</option>
                  {units?.map((u: any) => (
                    <option key={u.id} value={u.id}>F{u.floor_no}-{u.unit_no} {u.allottee?.name ? `(${u.allottee.name})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedUnit && (
              <div className="bg-brand-50 rounded-xl p-3 text-sm flex gap-4">
                <span className="text-surface-500">Allottee:</span>
                <span className="font-semibold">{selectedUnit.allottee?.name || '—'}</span>
                <span className="text-surface-500">Mobile:</span>
                <span className="font-semibold">{selectedUnit.mobile_number || '—'}</span>
                <span className="text-surface-500">Meter:</span>
                <span className="font-mono font-semibold">{selectedUnit.meter_no || '—'}</span>
              </div>
            )}

            <div>
              <label className="label">Billing Month</label>
              <input {...register('billing_month', { required: true })} type="month" className="input max-w-[200px]" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Previous Reading (m³)</label>
                <input {...register('previous_reading', { required: true, min: 0 })}
                  type="number" step="0.01" className="input" />
              </div>
              <div>
                <label className="label">Current Reading (m³)</label>
                <input {...register('current_reading', { required: true, min: 0 })}
                  type="number" step="0.01" className="input" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Unit Price (৳/m³) *</label>
                <input {...register('unit_price', { required: true, min: 0 })}
                  type="number" step="0.01" className="input" />
              </div>
              <div>
                <label className="label">Service Charge (৳)</label>
                <input {...register('service_charge', { min: 0 })}
                  type="number" step="0.01" className="input" />
              </div>
            </div>

            {/* Adjustment section */}
            <div className="border border-surface-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input {...register('is_adjusted')} type="checkbox" id="is_adjusted" className="rounded" />
                <label htmlFor="is_adjusted" className="text-sm font-medium text-surface-700 cursor-pointer">
                  Apply Adjustments
                </label>
              </div>
              {isAdjusted && (
                <div className="grid grid-cols-3 gap-4 animate-fadeIn">
                  <div>
                    <label className="label">Extra Charge (৳)</label>
                    <input {...register('extra_charge', { min: 0 })} type="number" step="0.01" className="input" />
                  </div>
                  <div>
                    <label className="label">Discount (৳)</label>
                    <input {...register('discount', { min: 0 })} type="number" step="0.01" className="input" />
                  </div>
                  <div>
                    <label className="label">Late Fee (৳)</label>
                    <input {...register('late_fee', { min: 0 })} type="number" step="0.01" className="input" />
                  </div>
                  <div className="col-span-3">
                    <label className="label">Adjustment Reason *</label>
                    <input {...register('adjustment_reason')} className="input" placeholder="Reason for adjustment" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right — Bill summary */}
          <div>
            <div className="bg-surface-50 rounded-2xl p-5 sticky top-0">
              <div className="text-sm font-bold text-surface-700 mb-4 uppercase tracking-wider">Bill Summary</div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-500">Usage</span>
                  <span className="font-semibold">{usage.toFixed(2)} m³</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Unit Price</span>
                  <span>{formatCurrency(unitPrice)}</span>
                </div>
                <div className="flex justify-between border-t border-surface-200 pt-2">
                  <span className="text-surface-600 font-medium">Base Amount</span>
                  <span className="font-bold">{formatCurrency(baseAmount)}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Service Charge</span>
                  <span>+ {formatCurrency(serviceCharge)}</span>
                </div>
                {Number(extraCharge) > 0 && (
                  <div className="flex justify-between text-surface-500">
                    <span>Extra Charge</span>
                    <span>+ {formatCurrency(extraCharge)}</span>
                  </div>
                )}
                {Number(lateFee) > 0 && (
                  <div className="flex justify-between text-warning-600">
                    <span>Late Fee</span>
                    <span>+ {formatCurrency(lateFee)}</span>
                  </div>
                )}
                {Number(discount) > 0 && (
                  <div className="flex justify-between text-success-600">
                    <span>Discount</span>
                    <span>− {formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-surface-900 pt-3 mt-1">
                  <span className="font-bold text-surface-900 text-base">Total</span>
                  <span className="font-bold text-brand-600 text-xl">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Creating Bill…' : 'Create Bill'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BillingPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [createModal, setCreateModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['bills', search, statusFilter, page],
    queryFn: () => billingAPI.list({
      search,
      status: statusFilter || undefined,
      page,
    }).then(r => r.data),
  })

  const bills = data?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Create and manage gas bills for all units</p>
        </div>
        {can.createBill && <button className="btn-primary" onClick={() => setCreateModal(true)}>
          <Plus className="w-4 h-4" /> Create Bill</button>}
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input className="input pl-9" placeholder="Search bill no., unit, allottee…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input max-w-[140px]" value={statusFilter}
          aria-label="Filter bills by status"
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill No.</th>
                  <th>Month</th>
                  <th>Unit / Allottee</th>
                  <th>Building / Project</th>
                  <th>Usage (m³)</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 ? (
                  <tr><td colSpan={10}>
                    <EmptyState icon={FileText} title="No bills found" description="Create a bill to get started" />
                  </td></tr>
                ) : bills.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-brand-700">{b.bill_number}</span>
                    </td>
                    <td className="text-surface-600 text-sm">{b.billing_month_display}</td>
                    <td>
                      <div className="font-medium text-surface-800">{b.unit_no}</div>
                      <div className="text-xs text-surface-400">{b.allottee_name || '—'}</div>
                    </td>
                    <td>
                      <div className="text-sm text-surface-600">{b.building_name}</div>
                      <div className="text-xs text-surface-400">{b.project_name}</div>
                    </td>
                    <td className="font-mono text-sm text-center">{b.total_usage_m3}</td>
                    <td className="font-mono font-semibold">{formatCurrency(b.total_amount)}</td>
                    <td className="font-mono text-success-600">{formatCurrency(b.paid_amount)}</td>
                    <td className="font-mono text-danger-600 font-semibold">{formatCurrency(b.due_amount)}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => navigate(`/billing/${b.id}`)} title="View Details">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
      )}

      <CreateBillModal open={createModal} onClose={() => setCreateModal(false)} />
    </div>
  )
}
