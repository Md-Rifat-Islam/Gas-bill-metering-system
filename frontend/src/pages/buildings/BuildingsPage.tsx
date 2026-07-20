import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Trash2, Building, Search, FileSpreadsheet, Loader2 } from 'lucide-react'
import { buildingsAPI, projectsAPI, reportsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination, ConfirmDialog } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import toast from 'react-hot-toast'

interface BuildingForm {
  project_id: number | ''
  name: string
  code: string
  total_floors: number
}

function BuildingModal({ open, onClose, editItem, projects, readOnly }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm<BuildingForm>({
    defaultValues: { project_id: '', name: '', code: '', total_floors: 1 },
  })

  // Fix: re-populate the form whenever the modal opens / target item changes.
  useEffect(() => {
    if (open) {
      reset(editItem
        ? {
            project_id: editItem.project_id ?? editItem.project?.id ?? '',
            name: editItem.name,
            code: editItem.code ?? '',
            total_floors: editItem.total_floors ?? 1,
          }
        : { project_id: '', name: '', code: '', total_floors: 1 }
      )
    }
  }, [open, editItem, reset])

  const save = useMutation({
    mutationFn: (data: BuildingForm) =>
      editItem ? buildingsAPI.update(editItem.id, data) : buildingsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings'] })
      toast.success(editItem ? 'Building updated' : 'Building created')
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Building' : 'New Building'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label" htmlFor="bld-project">Project <span className="text-danger-500">*</span></label>
          <select
            id="bld-project"
            {...register('project_id', { required: true })}
            disabled={readOnly}
            className="input"
            aria-label="Project"
            title="Project"
          >
            <option value="">— Select project —</option>
            {projects?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="bld-name">Building Name <span className="text-danger-500">*</span></label>
            <input
              id="bld-name"
              {...register('name', { required: true })}
              disabled={readOnly}
              className="input"
              placeholder="Block A"
              aria-label="Building name"
              title="Building name"
            />
          </div>
          <div>
            <label className="label" htmlFor="bld-code">Code</label>
            <input
              id="bld-code"
              {...register('code')}
              disabled={readOnly}
              className="input"
              placeholder="BLK-A"
              aria-label="Building code"
              title="Building code"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bld-floors">Total Floors</label>
          <input
            id="bld-floors"
            {...register('total_floors', { min: 1 })}
            type="number"
            disabled={readOnly}
            className="input"
            aria-label="Total floors"
            title="Total floors"
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
              aria-label="Save building"
              title="Save building"
            >
              {save.isPending ? 'Saving…' : 'Save Building'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

export default function BuildingsPage() {
  const { can } = usePermissions()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const [exportingId, setExportingId] = useState<number | null>(null)
  const { confirmState, confirm, handleClose } = useConfirm()

  const { data, isLoading } = useQuery({
    queryKey: ['buildings', search, projectFilter, page],
    queryFn: () => buildingsAPI.list({ search, project: projectFilter || undefined, page }).then(r => r.data),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 100 }).then(r => r.data.results || r.data),
  })

  const deleteBuilding = useMutation({
    mutationFn: (id: number) => buildingsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings'] })
      toast.success('Building deactivated')
    },
  })

  const handleDelete = async (b: any) => {
    const ok = await confirm(
      'Delete building',
      `Are you sure you want to delete "${b.name}"? This will deactivate the building and is intended to be permanent. This action cannot be undone.`
    )
    if (ok) deleteBuilding.mutate(b.id)
  }

  const handleExport = async (b: any) => {
    setExportingId(b.id)
    try {
      await reportsAPI.exportBuildingExcel(b.id, b.name)
      toast.success('Excel export downloaded')
    } catch {
      // error toast handled globally by interceptor
    } finally {
      setExportingId(null)
    }
  }

  const buildings = data?.results || []

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="page-title">Buildings</h1>
          <p className="page-subtitle">Manage buildings within your projects</p>
        </div>
        {can.editBuildings && (
          <button
            className="btn-primary w-full sm:w-auto justify-center"
            onClick={() => setModal({ open: true })}
            aria-label="Create new building"
            title="Create new building"
          >
            <Plus className="w-4 h-4" /> New Building
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Search buildings…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            aria-label="Search buildings"
            title="Search buildings"
          />
        </div>
        <select
          className="input w-full sm:max-w-[200px]"
          value={projectFilter}
          onChange={e => { setProjectFilter(e.target.value); setPage(1) }}
          aria-label="Filter by project"
          title="Filter by project"
        >
          <option value="">All Projects</option>
          {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          {/* Horizontal scroll on narrow viewports instead of squashing columns */}
          <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[760px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Code</th>
                  <th>Project</th>
                  <th>Floors</th>
                  <th>Units</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {buildings.length === 0 ? (
                  <tr><td colSpan={7}>
                    <EmptyState icon={Building} title="No buildings found" description="Add a building to your project" />
                  </td></tr>
                ) : buildings.map((b: any) => (
                  <tr key={b.id}>
                    <td className="font-semibold text-surface-900">{b.name}</td>
                    <td><span className="font-mono text-xs bg-surface-100 px-2 py-0.5 rounded">{b.code || '—'}</span></td>
                    <td className="text-surface-600">{b.project_name}</td>
                    <td className="text-center">{b.total_floors}</td>
                    <td className="text-center font-semibold">{b.unit_count || 0}</td>
                    <td><span className={b.is_active ? 'badge-green' : 'badge-gray'}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {can.viewFinancialReports && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => handleExport(b)}
                            disabled={exportingId === b.id}
                            aria-label={`Export ${b.name} to Excel`}
                            title={`Export ${b.name} to Excel (Building + Unit sheets)`}
                          >
                            {exportingId === b.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <FileSpreadsheet className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setModal({ open: true, item: b })}
                          aria-label={`Edit building ${b.name}`}
                          title={`Edit building ${b.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {can.deleteBuildings && (
                          <button
                            className="btn-ghost btn-sm text-danger-500 hover:bg-danger-50"
                            onClick={() => handleDelete(b)}
                            aria-label={`Delete building ${b.name}`}
                            title={`Delete building ${b.name}`}
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

      <BuildingModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        editItem={modal.item}
        projects={projects}
        readOnly={!can.editBuildings}
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