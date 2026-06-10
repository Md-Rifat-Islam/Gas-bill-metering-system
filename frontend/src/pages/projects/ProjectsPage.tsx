import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Package, Building2, Search } from 'lucide-react'
import { projectsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination, StatCard } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'
import toast from 'react-hot-toast'

interface PackageForm { name: string; unit_type: string; per_unit_cost: number; description: string }
interface ProjectForm { name: string; address: string; default_package_id: number | null; service_charge: number }

function PackageModal({ open, onClose, editItem }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PackageForm>({
    defaultValues: editItem || { unit_type: 'm3', per_unit_cost: 0 }
  })
  const save = useMutation({
    mutationFn: (data: PackageForm) =>
      editItem ? projectsAPI.updatePackage(editItem.id, data) : projectsAPI.createPackage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] })
      toast.success(editItem ? 'Package updated' : 'Package created')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Package' : 'New Package'} size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Package Name *</label>
          <input {...register('name', { required: true })} className="input" placeholder="Residential Gas" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Unit Type</label>
            <select {...register('unit_type')} className="input">
              <option value="m3">Cubic Meter (m³)</option>
              <option value="kg">Kilogram (Kg)</option>
            </select>
          </div>
          <div>
            <label className="label">Price / Unit (৳) *</label>
            <input {...register('per_unit_cost', { required: true, min: 0 })} type="number" step="0.01" className="input" />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} className="input" rows={2} />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Package'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ProjectModal({ open, onClose, editItem, packages }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm<ProjectForm>({
    defaultValues: editItem
      ? { ...editItem, default_package_id: editItem.default_package?.id || null }
      : { service_charge: 0 }
  })
  const save = useMutation({
    mutationFn: (data: ProjectForm) =>
      editItem ? projectsAPI.update(editItem.id, data) : projectsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(editItem ? 'Project updated' : 'Project created')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Project' : 'New Project'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Project Name *</label>
          <input {...register('name', { required: true })} className="input" placeholder="Bashundhara Residentials" />
        </div>
        <div>
          <label className="label">Address</label>
          <textarea {...register('address')} className="input" rows={2} placeholder="Dhaka, Bangladesh" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default Package</label>
            <select {...register('default_package_id')} className="input">
              <option value="">— Select package —</option>
              {packages?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} (৳{p.per_unit_cost}/{p.unit_type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Service Charge (৳)</label>
            <input {...register('service_charge', { min: 0 })} type="number" step="0.01" className="input" defaultValue={0} />
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [projectModal, setProjectModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const [packageModal, setPackageModal] = useState<{ open: boolean; item?: any }>({ open: false })

  const { data, isLoading } = useQuery({
    queryKey: ['projects', search, page],
    queryFn: () => projectsAPI.list({ search, page }).then(r => r.data),
  })
  const { data: pkgs } = useQuery({
    queryKey: ['packages'],
    queryFn: () => projectsAPI.packages().then(r => r.data.results || r.data),
  })

  const projects = data?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Manage housing projects and pricing packages</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setPackageModal({ open: true })}>
            <Package className="w-4 h-4" /> Packages
          </button>
          <button className="btn-primary" onClick={() => setProjectModal({ open: true })}>
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          className="input pl-9"
          placeholder="Search projects…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Packages section */}
      {pkgs?.length > 0 && (
        <div className="mb-8">
          <div className="text-sm font-semibold text-surface-600 mb-3">Pricing Packages</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {pkgs.map((p: any) => (
              <div key={p.id} className="card-hover cursor-pointer" onClick={() => setPackageModal({ open: true, item: p })}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-surface-800 text-sm">{p.name}</div>
                    <div className="text-2xl font-bold text-brand-600 mt-1">
                      {formatCurrency(p.per_unit_cost)}
                    </div>
                    <div className="text-xs text-surface-400 mt-0.5">per {p.unit_type}</div>
                  </div>
                  <button className="btn-ghost btn-sm !p-1" onClick={e => { e.stopPropagation(); setPackageModal({ open: true, item: p }) }}>
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects table */}
      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Address</th>
                  <th>Package</th>
                  <th>Service Charge</th>
                  <th>Buildings</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={7}>
                    <EmptyState icon={Building2} title="No projects found" description="Create your first project to get started" />
                  </td></tr>
                ) : projects.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-semibold text-surface-900">{p.name}</td>
                    <td className="text-surface-500 max-w-xs truncate">{p.address || '—'}</td>
                    <td>
                      {p.default_package
                        ? <span className="badge-blue">{p.default_package.name}</span>
                        : <span className="text-surface-400 text-xs">—</span>}
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(p.service_charge)}</td>
                    <td className="text-center font-semibold">{p.building_count || 0}</td>
                    <td>
                      <span className={p.is_active ? 'badge-green' : 'badge-gray'}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => setProjectModal({ open: true, item: p })}>
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

      <ProjectModal
        open={projectModal.open}
        onClose={() => setProjectModal({ open: false })}
        editItem={projectModal.item}
        packages={pkgs}
      />
      <PackageModal
        open={packageModal.open}
        onClose={() => setPackageModal({ open: false })}
        editItem={packageModal.item}
      />
    </div>
  )
}
