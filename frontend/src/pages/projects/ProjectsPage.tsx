import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Trash2, Package, Building2, Search } from 'lucide-react'
import { projectsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination, ConfirmDialog } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import { formatCurrency } from '@/utils/helpers'
import toast from 'react-hot-toast'

interface PackageForm {
  name: string
  unit_type: string
  per_unit_cost: number
  conversion_factor: number | ''
  description: string
}
interface ProjectForm { name: string; address: string; default_package_id: number | ''; service_charge: number }

function PackageModal({ open, onClose, editItem, readOnly }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PackageForm>({
    defaultValues: { name: '', unit_type: 'm3', per_unit_cost: 0, conversion_factor: '', description: '' },
  })
  const unitType = watch('unit_type')

  // Fix: re-populate the form whenever the modal opens / target item changes.
  useEffect(() => {
    if (open) {
      reset(editItem
        ? {
            name: editItem.name,
            unit_type: editItem.unit_type,
            per_unit_cost: editItem.per_unit_cost,
            conversion_factor: editItem.conversion_factor ?? '',
            description: editItem.description ?? '',
          }
        : { name: '', unit_type: 'm3', per_unit_cost: 0, conversion_factor: '', description: '' }
      )
    }
  }, [open, editItem, reset])

  const save = useMutation({
    mutationFn: (data: PackageForm) => {
      const payload = {
        ...data,
        // Conversion factor only makes sense for kg-billed packages — don't
        // send a stale value if the package is m3-billed.
        conversion_factor: data.unit_type === 'kg' && data.conversion_factor ? data.conversion_factor : null,
      }
      return editItem ? projectsAPI.updatePackage(editItem.id, payload) : projectsAPI.createPackage(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] })
      toast.success(editItem ? 'Package updated' : 'Package created')
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Package' : 'New Package'} size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label" htmlFor="pkg-name">Package Name <span className="text-danger-500">*</span></label>
          <input
            id="pkg-name"
            {...register('name', { required: true })}
            disabled={readOnly}
            className="input"
            placeholder="Residential Gas"
            aria-label="Package name"
            title="Package name"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pkg-unit-type">Unit Type</label>
            <select
              id="pkg-unit-type"
              {...register('unit_type')}
              disabled={readOnly}
              className="input"
              aria-label="Unit type"
              title="Unit type"
            >
              <option value="m3">Cubic Meter (m³)</option>
              <option value="kg">Kilogram (Kg)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pkg-price">
              Price / {unitType === 'kg' ? 'kg' : 'm³'} (৳) <span className="text-danger-500">*</span>
            </label>
            <input
              id="pkg-price"
              {...register('per_unit_cost', { required: true, min: 0 })}
              type="number"
              step="0.01"
              disabled={readOnly}
              className="input"
              aria-label="Price per unit"
              title="Price per unit"
            />
          </div>
        </div>

        {unitType === 'kg' && (
          <div className="animate-fadeIn">
            <label className="label" htmlFor="pkg-conversion">
              Conversion Ratio (kg per m³) <span className="text-danger-500">*</span>
            </label>
            <input
              id="pkg-conversion"
              {...register('conversion_factor', { required: unitType === 'kg', min: 0.0001 })}
              type="number"
              step="0.0001"
              disabled={readOnly}
              className="input"
              placeholder="e.g. 0.75"
              aria-label="Conversion ratio"
              title="Conversion ratio"
            />
            <p className="text-xs text-surface-400 mt-1">
              Metered usage (m³) is multiplied by this ratio to get billable KG.
            </p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="pkg-desc">Description</label>
          <textarea
            id="pkg-desc"
            {...register('description')}
            disabled={readOnly}
            className="input"
            rows={2}
            aria-label="Description"
            title="Description"
          />
        </div>
        {!readOnly && (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
            <button type="button" className="btn-secondary w-full sm:w-auto justify-center" onClick={onClose} aria-label="Cancel" title="Cancel">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto justify-center"
              disabled={save.isPending}
              aria-label="Save package"
              title="Save package"
            >
              {save.isPending ? 'Saving…' : 'Save Package'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

function ProjectModal({ open, onClose, editItem, packages, readOnly }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm<ProjectForm>({
    defaultValues: { name: '', address: '', default_package_id: '', service_charge: 0 },
  })

  // Fix: re-populate the form whenever the modal opens / target item changes.
  useEffect(() => {
    if (open) {
      reset(editItem
        ? {
            name: editItem.name,
            address: editItem.address ?? '',
            default_package_id: editItem.default_package?.id ?? '',
            service_charge: editItem.service_charge ?? 0,
          }
        : { name: '', address: '', default_package_id: '', service_charge: 0 }
      )
    }
  }, [open, editItem, reset])

  const save = useMutation({
    mutationFn: (data: ProjectForm) =>
      editItem ? projectsAPI.update(editItem.id, data) : projectsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(editItem ? 'Project updated' : 'Project created')
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Project' : 'New Project'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label" htmlFor="proj-name">Project Name <span className="text-danger-500">*</span></label>
          <input
            id="proj-name"
            {...register('name', { required: true })}
            disabled={readOnly}
            className="input"
            placeholder="Bashundhara Residentials"
            aria-label="Project name"
            title="Project name"
          />
        </div>
        <div>
          <label className="label" htmlFor="proj-address">Address</label>
          <textarea
            id="proj-address"
            {...register('address')}
            disabled={readOnly}
            className="input"
            rows={2}
            placeholder="Dhaka, Bangladesh"
            aria-label="Address"
            title="Address"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="proj-package">Default Package</label>
            <select
              id="proj-package"
              {...register('default_package_id')}
              disabled={readOnly}
              className="input"
              aria-label="Default package"
              title="Default package"
            >
              <option value="">— Select package —</option>
              {packages?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} (৳{p.per_unit_cost}/{p.unit_type}
                  {p.unit_type === 'kg' && p.conversion_factor ? `, ${p.conversion_factor} kg/m³` : ''})
                </option>
              ))}
            </select>
            <p className="text-xs text-surface-400 mt-1">
              New bills for this project auto-fill their rate (and conversion ratio, if kg-based) from this package.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="proj-service-charge">Service Charge (৳)</label>
            <input
              id="proj-service-charge"
              {...register('service_charge', { min: 0 })}
              type="number"
              step="0.01"
              disabled={readOnly}
              className="input"
              aria-label="Service charge"
              title="Service charge"
            />
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
            <button type="button" className="btn-secondary w-full sm:w-auto justify-center" onClick={onClose} aria-label="Cancel" title="Cancel">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto justify-center"
              disabled={save.isPending}
              aria-label="Save project"
              title="Save project"
            >
              {save.isPending ? 'Saving…' : 'Save Project'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

export default function ProjectsPage() {
  const { can } = usePermissions()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [projectModal, setProjectModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const [packageModal, setPackageModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const { confirmState, confirm, handleClose } = useConfirm()

  const { data, isLoading } = useQuery({
    queryKey: ['projects', search, page],
    queryFn: () => projectsAPI.list({ search, page }).then(r => r.data),
  })
  const { data: pkgs } = useQuery({
    queryKey: ['packages'],
    queryFn: () => projectsAPI.packages().then(r => r.data.results || r.data),
  })

  const deleteProject = useMutation({
    mutationFn: (id: number) => projectsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project deactivated')
    },
  })

  const handleDeleteProject = async (p: any) => {
    const ok = await confirm(
      'Delete project',
      `Are you sure you want to delete "${p.name}"? This will deactivate the project. This action cannot be undone.`
    )
    if (ok) deleteProject.mutate(p.id)
  }

  const projects = data?.results || []

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Manage housing projects and pricing packages</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={() => setPackageModal({ open: true })}
            aria-label="Manage packages"
            title="Manage packages"
          >
            <Package className="w-4 h-4" /> Packages
          </button>
          {can.createProject && (
            <button
              className="btn-primary w-full sm:w-auto justify-center"
              onClick={() => setProjectModal({ open: true })}
              aria-label="Create new project"
              title="Create new project"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-6 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          className="input pl-9 w-full"
          placeholder="Search projects…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          aria-label="Search projects"
          title="Search projects"
        />
      </div>

      {pkgs?.length > 0 && (
        <div className="mb-8">
          <div className="text-sm font-semibold text-surface-600 mb-3">Pricing Packages</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {pkgs.map((p: any) => (
              <div key={p.id} className="card-hover cursor-pointer" onClick={() => setPackageModal({ open: true, item: p })}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-surface-800 text-sm">{p.name}</div>
                    <div className="text-2xl font-bold text-brand-600 mt-1">
                      {formatCurrency(p.per_unit_cost)}
                    </div>
                    <div className="text-xs text-surface-400 mt-0.5">
                      per {p.unit_type}
                      {p.unit_type === 'kg' && p.conversion_factor && ` · ${p.conversion_factor} kg/m³`}
                    </div>
                  </div>
                  <button
                    className="btn-ghost btn-sm !p-1"
                    onClick={e => { e.stopPropagation(); setPackageModal({ open: true, item: p }) }}
                    aria-label={`Edit package ${p.name}`}
                    title={`Edit package ${p.name}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? <PageLoader /> : (
        <>
          {/* Horizontal scroll on narrow viewports instead of squashing columns */}
          <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[760px] sm:min-w-0">
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
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setProjectModal({ open: true, item: p })}
                          aria-label={`Edit project ${p.name}`}
                          title={`Edit project ${p.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {can.deleteProject && (
                          <button
                            className="btn-ghost btn-sm text-danger-500 hover:bg-danger-50"
                            onClick={() => handleDeleteProject(p)}
                            aria-label={`Delete project ${p.name}`}
                            title={`Delete project ${p.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
        readOnly={!can.editProject}
      />
      <PackageModal
        open={packageModal.open}
        onClose={() => setPackageModal({ open: false })}
        editItem={packageModal.item}
        readOnly={!can.editPackages}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger
        onClose={() => handleClose(false)}
        onConfirm={() => handleClose(true)}
      />
    </div>
  )
}