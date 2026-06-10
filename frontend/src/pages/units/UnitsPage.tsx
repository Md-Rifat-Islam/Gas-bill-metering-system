import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Home, Search } from 'lucide-react'
import { unitsAPI, buildingsAPI, projectsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination } from '@/components/ui'
import toast from 'react-hot-toast'

function UnitModal({ open, onClose, editItem, buildings, packages }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm({
    defaultValues: editItem
      ? {
          ...editItem,
          building_id: editItem.building_id,
          package_id: editItem.package_id || '',
          allottee_name: editItem.allottee?.name || '',
          allottee_email: editItem.allottee?.email || '',
          allottee_nid: editItem.allottee?.nid || '',
        }
      : { status: 'Active' }
  })
  const save = useMutation({
    mutationFn: (data: any) =>
      editItem ? unitsAPI.update(editItem.id, data) : unitsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] })
      toast.success(editItem ? 'Unit updated' : 'Unit created')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Unit' : 'New Unit'} size="lg">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Building *</label>
            <select {...register('building_id', { required: true })} className="input">
              <option value="">— Select building —</option>
              {buildings?.map((b: any) => (
                <option key={b.id} value={b.id}>{b.project_name} › {b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Floor No. *</label>
            <input {...register('floor_no', { required: true, min: 0 })} type="number" className="input" />
          </div>
          <div>
            <label className="label">Unit No. *</label>
            <input {...register('unit_no', { required: true })} className="input" placeholder="A1" />
          </div>
          <div>
            <label className="label">Meter No.</label>
            <input {...register('meter_no')} className="input" placeholder="MTR-00001" />
          </div>
          <div>
            <label className="label">Mobile Number</label>
            <input {...register('mobile_number')} className="input" placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="label">Package</label>
            <select {...register('package_id')} className="input">
              <option value="">— Inherit from building/project —</option>
              {packages?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} (৳{p.per_unit_cost}/{p.unit_type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select {...register('status')} className="input">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Allottee */}
        <div className="border-t border-surface-100 pt-4">
          <div className="text-sm font-semibold text-surface-700 mb-3">Allottee Information</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Name</label>
              <input {...register('allottee_name')} className="input" placeholder="Full name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input {...register('allottee_email')} type="email" className="input" placeholder="email@example.com" />
            </div>
            <div>
              <label className="label">NID</label>
              <input {...register('allottee_nid')} className="input" placeholder="National ID" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Unit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function UnitsPage() {
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })

  const { data, isLoading } = useQuery({
    queryKey: ['units', search, buildingFilter, statusFilter, page],
    queryFn: () => unitsAPI.list({
      search,
      building: buildingFilter || undefined,
      status: statusFilter || undefined,
      page
    }).then(r => r.data),
  })
  const { data: buildings } = useQuery({
    queryKey: ['buildings-all'],
    queryFn: () => buildingsAPI.list({ page_size: 200 }).then(r => r.data.results || r.data),
  })
  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: () => projectsAPI.packages().then(r => r.data.results || r.data),
  })

  const units = data?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Units</h1>
          <p className="page-subtitle">Manage residential / commercial units and allottees</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4" /> New Unit
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input className="input pl-9" placeholder="Search units, allottees…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input max-w-[200px]" value={buildingFilter}
          onChange={e => { setBuildingFilter(e.target.value); setPage(1) }}>
          <option value="">All Buildings</option>
          {buildings?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input max-w-[140px]" value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Building / Project</th>
                  <th>Meter No.</th>
                  <th>Allottee</th>
                  <th>Mobile</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={Home} title="No units found" />
                  </td></tr>
                ) : units.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-semibold text-surface-900">
                        Floor {u.floor_no} — {u.unit_no}
                      </div>
                    </td>
                    <td>
                      <div className="text-surface-700 text-sm">{u.building_name}</div>
                      <div className="text-surface-400 text-xs">{u.project_name}</div>
                    </td>
                    <td><span className="font-mono text-xs">{u.meter_no || '—'}</span></td>
                    <td className="text-surface-700">{u.allottee?.name || '—'}</td>
                    <td className="font-mono text-sm">{u.mobile_number || '—'}</td>
                    <td>
                      {u.package_name
                        ? <span className="badge-blue text-xs">{u.package_name}</span>
                        : <span className="text-surface-400 text-xs">Inherited</span>}
                    </td>
                    <td><span className={u.status === 'Active' ? 'badge-green' : 'badge-gray'}>{u.status}</span></td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => setModal({ open: true, item: u })}>
                        <Pencil className="w-3.5 h-3.5" />
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

      <UnitModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        editItem={modal.item}
        buildings={buildings}
        packages={packages}
      />
    </div>
  )
}
