import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Trash2, Home, Search, Gauge, PlusCircle, Upload, Download } from 'lucide-react'
import { unitsAPI, buildingsAPI, projectsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination, ConfirmDialog } from '@/components/ui'
import { MeterAssignModal } from '@/components/meters/MeterAssignModal'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import toast from 'react-hot-toast'

function UnitModal({ open, onClose, editItem, buildings, projects, packages, readOnly }: any) {
  const qc = useQueryClient()
  // Project is a UI-only selector used to narrow the Building dropdown —
  // it is never submitted to the backend, only building_id is.
  const [projectId, setProjectId] = useState('')

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: {
      building_id: '', floor_no: '', unit_no: '', mobile_number: '',
      package_id: '', status: 'Active', allottee_name: '', allottee_email: '', allottee_nid: '',
    },
  })

  // Fix: re-populate the form whenever the modal opens / target item changes.
  // Previously `defaultValues` was only evaluated on first mount, so editing
  // a second/third unit after the first kept showing the first unit's (or
  // blank) values since this UnitModal instance is reused for every row.
  useEffect(() => {
    if (open) {
      if (editItem) {
        const buildingIdVal = editItem.building_id ?? editItem.building?.id ?? ''
        // Derive the project to pre-select from the matching building —
        // the Building list (from buildingsAPI) already carries project_id.
        const matchedBuilding = buildings?.find((b: any) => String(b.id) === String(buildingIdVal))
        setProjectId(matchedBuilding?.project_id ? String(matchedBuilding.project_id) : '')
        reset({
          building_id: buildingIdVal,
          floor_no: editItem.floor_no ?? '',
          unit_no: editItem.unit_no ?? '',
          mobile_number: editItem.mobile_number ?? '',
          package_id: editItem.package_id ?? '',
          status: editItem.status ?? 'Active',
          allottee_name: editItem.allottee?.name ?? '',
          allottee_email: editItem.allottee?.email ?? '',
          allottee_nid: editItem.allottee?.nid ?? '',
        })
      } else {
        setProjectId('')
        reset({
          building_id: '', floor_no: '', unit_no: '', mobile_number: '',
          package_id: '', status: 'Active', allottee_name: '', allottee_email: '', allottee_nid: '',
        })
      }
    }
  }, [open, editItem, reset, buildings])

  // Fix: the Building <select> is uncontrolled (via `register`), and its
  // <option> list (`filteredBuildings`) depends on the `projectId` state set
  // above. `reset()` in the effect above writes straight to the select's DOM
  // value in the SAME tick that `setProjectId` is queued — at that instant
  // the matching <option> doesn't exist yet, so the browser silently drops
  // the selection and the Building field renders blank on Edit, even though
  // every other field (plain text inputs) populates correctly. This second
  // effect re-applies building_id specifically once `projectId` has actually
  // changed and `filteredBuildings` has re-rendered to include that option.
  useEffect(() => {
    if (!open || !editItem) return
    const buildingIdVal = editItem.building_id ?? editItem.building?.id ?? ''
    if (buildingIdVal) {
      setValue('building_id', buildingIdVal)
    }
  }, [open, editItem, projectId, buildings, setValue])

  const filteredBuildings = useMemo(
    () => (buildings ?? []).filter((b: any) => !projectId || String(b.project_id) === String(projectId)),
    [buildings, projectId]
  )

  const handleProjectChange = (value: string) => {
    setProjectId(value)
    // Changing the project invalidates whatever building was picked before.
    setValue('building_id', '')
  }

  const save = useMutation({
    mutationFn: (data: any) =>
      editItem ? unitsAPI.update(editItem.id, data) : unitsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] })
      toast.success(editItem ? 'Unit updated' : 'Unit created')
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Unit' : 'New Unit'} size="lg">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="unit-project">Project <span className="text-danger-500">*</span></label>
            <select
              id="unit-project"
              value={projectId}
              onChange={e => handleProjectChange(e.target.value)}
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
          <div>
            <label className="label" htmlFor="unit-building">Building <span className="text-danger-500">*</span></label>
            <select
              id="unit-building"
              {...register('building_id', { required: true })}
              disabled={readOnly || !projectId}
              className="input"
              aria-label="Building"
              title="Building"
            >
              <option value="">{projectId ? '— Select building —' : '— Select project first —'}</option>
              {filteredBuildings.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="unit-floor">Floor No. <span className="text-danger-500">*</span></label>
            <input
              id="unit-floor"
              {...register('floor_no', { required: true, min: 0 })}
              type="number"
              disabled={readOnly}
              className="input"
              aria-label="Floor number"
              title="Floor number"
            />
          </div>
          <div>
            <label className="label" htmlFor="unit-no">Unit No. <span className="text-danger-500">*</span></label>
            <input
              id="unit-no"
              {...register('unit_no', { required: true })}
              disabled={readOnly}
              className="input"
              placeholder="A1"
              aria-label="Unit number"
              title="Unit number"
            />
          </div>
          <div>
            <label className="label" htmlFor="unit-package">Package</label>
            <select
              id="unit-package"
              {...register('package_id')}
              disabled={readOnly}
              className="input"
              aria-label="Package"
              title="Package"
            >
              <option value="">— Inherit from building/project —</option>
              {packages?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} (৳{p.per_unit_cost}/{p.unit_type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="unit-status">Status</label>
            <select
              id="unit-status"
              {...register('status')}
              disabled={readOnly}
              className="input"
              aria-label="Status"
              title="Status"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {editItem && (
          <p className="text-xs text-surface-400 -mt-2">
            Meter assignment moved to its own action — use the meter icon on this unit's row after saving.
          </p>
        )}

        <div className="border-t border-surface-100 pt-4">
          <div className="text-sm font-semibold text-surface-700 mb-3">Allottee Information</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="allottee-name">Name</label>
              <input
                id="allottee-name"
                {...register('allottee_name')}
                disabled={readOnly}
                className="input"
                placeholder="Full name"
                aria-label="Allottee name"
                title="Allottee name"
              />
            </div>
            {/* Mobile number now lives here (previously a standalone Unit-level
                field above) and is mandatory — every allottee record needs a
                contact number, e.g. for payment/reading notifications. */}
            <div>
              <label className="label" htmlFor="allottee-mobile">Mobile Number <span className="text-danger-500">*</span></label>
              <input
                id="allottee-mobile"
                {...register('mobile_number', { required: true, pattern: /^01[3-9]\d{8}$/ })}
                disabled={readOnly}
                className="input"
                placeholder="01XXXXXXXXX"
                aria-label="Allottee mobile number"
                title="Allottee mobile number"
              />
            </div>
            <div>
              <label className="label" htmlFor="allottee-email">Email</label>
              <input
                id="allottee-email"
                {...register('allottee_email')}
                type="email"
                disabled={readOnly}
                className="input"
                placeholder="email@example.com"
                aria-label="Allottee email"
                title="Allottee email"
              />
            </div>
            <div>
              <label className="label" htmlFor="allottee-nid">NID</label>
              <input
                id="allottee-nid"
                {...register('allottee_nid')}
                disabled={readOnly}
                className="input"
                placeholder="National ID"
                aria-label="Allottee national ID"
                title="Allottee national ID"
              />
            </div>
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
              aria-label="Save unit"
              title="Save unit"
            >
              {save.isPending ? 'Saving…' : 'Save Unit'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

function BulkImportModal({ open, onClose, buildings, projects }: any) {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  const filteredBuildings = useMemo(
    () => (buildings ?? []).filter((b: any) => !projectId || String(b.project_id) === String(projectId)),
    [buildings, projectId]
  )

  useEffect(() => {
    if (open) {
      setProjectId('')
      setBuildingId('')
      setFile(null)
    }
  }, [open])

  const handleDownloadTemplate = async () => {
    try {
      const res = await (unitsAPI as any).downloadBulkImportTemplate(buildingId)
      downloadBlob(new Blob([res.data]), 'unit_import_template.xlsx')
    } catch {
      toast.error('Could not download the template')
    }
  }

  const handleUpload = async () => {
    if (!buildingId || !file) return
    setImporting(true)
    try {
      const res = await (unitsAPI as any).bulkImport(buildingId, file)
      const contentType = String(res.headers?.['content-type'] || '')

      if (res.status === 201) {
        const text = await (res.data as Blob).text()
        const parsed = JSON.parse(text)
        toast.success(`${parsed.created} unit(s) created`)
        qc.invalidateQueries({ queryKey: ['units'] })
        onClose()
      } else if (res.status === 422 && contentType.includes('spreadsheet')) {
        downloadBlob(res.data as Blob, 'unit_import_errors.xlsx')
        toast.error('Some rows had errors — check the downloaded file for details')
      } else {
        let message = 'Import failed'
        try {
          const text = await (res.data as Blob).text()
          message = JSON.parse(text).detail || message
        } catch {
          // Response wasn't JSON either — fall back to the generic message above.
        }
        toast.error(message)
      }
    } catch {
      toast.error('Import failed — please try again')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk Import Units" size="md">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="bulk-project">Project <span className="text-danger-500">*</span></label>
            <select
              id="bulk-project"
              className="input"
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setBuildingId('') }}
              aria-label="Project"
            >
              <option value="">— Select project —</option>
              {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bulk-building">Building <span className="text-danger-500">*</span></label>
            <select
              id="bulk-building"
              className="input"
              value={buildingId}
              onChange={e => setBuildingId(e.target.value)}
              disabled={!projectId}
              aria-label="Building"
            >
              <option value="">{projectId ? '— Select building —' : '— Select project first —'}</option>
              {filteredBuildings.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t border-surface-100 pt-4 space-y-3">
          <button
            type="button"
            className="btn-secondary w-full justify-center"
            onClick={handleDownloadTemplate}
            disabled={!buildingId}
            aria-label="Download template"
            title="Download template"
          >
            <Download className="w-4 h-4" /> Download Template
          </button>
          <p className="text-xs text-surface-400">
            Fill in the rows below the greyed-out example row (row 3), then upload the same file here.
            Meter No. and Mobile Number are required for every row.
          </p>
          <input
            type="file"
            accept=".xlsx"
            className="input"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            disabled={!buildingId}
            aria-label="Upload filled template"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary w-full sm:w-auto justify-center" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto justify-center"
            onClick={handleUpload}
            disabled={!buildingId || !file || importing}
          >
            {importing ? 'Importing…' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function UnitsPage() {
  const { can } = usePermissions()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const [meterModal, setMeterModal] = useState<{ open: boolean; unit?: any }>({ open: false })
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const { confirmState, confirm, handleClose } = useConfirm()

  const { data, isLoading } = useQuery({
    queryKey: ['units', search, buildingFilter, statusFilter, page],
    queryFn: () => unitsAPI.list({
      search,
      building: buildingFilter || undefined,
      status: statusFilter || undefined,
      page,
    }).then(r => r.data),
  })
  const { data: buildings } = useQuery({
    queryKey: ['buildings-all'],
    queryFn: () => buildingsAPI.list({ page_size: 200 }).then(r => r.data.results || r.data),
  })
  // Full project list, used to drive the Project selector in the New/Edit
  // Unit modal and the Bulk Import modal (Project -> Building cascade).
  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 500 }).then(r => r.data.results || r.data),
  })
  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: () => projectsAPI.packages().then(r => r.data.results || r.data),
  })

  const deleteUnit = useMutation({
    mutationFn: (id: number) => unitsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] })
      toast.success('Unit deactivated')
    },
  })

  const handleDelete = async (u: any) => {
    const ok = await confirm(
      'Delete unit',
      `Are you sure you want to delete Floor ${u.floor_no} — ${u.unit_no}? This will deactivate the unit. This action cannot be undone.`
    )
    if (ok) deleteUnit.mutate(u.id)
  }

  const units = data?.results || []

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="page-title">Units</h1>
          <p className="page-subtitle">Manage residential / commercial units, allottees, and meters</p>
        </div>
        {can.editBuildings && (
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              className="btn-secondary flex-1 sm:flex-none justify-center"
              onClick={() => setBulkModalOpen(true)}
              aria-label="Bulk import units"
              title="Bulk import units"
            >
              <Upload className="w-4 h-4" /> Bulk Import
            </button>
            <button
              className="btn-primary flex-1 sm:flex-none justify-center"
              onClick={() => setModal({ open: true })}
              aria-label="Create new unit"
              title="Create new unit"
            >
              <Plus className="w-4 h-4" /> New Unit
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:flex-wrap">
        <div className="relative flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Search units, allottees…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            aria-label="Search units and allottees"
            title="Search units and allottees"
          />
        </div>
        <div className="flex gap-3">
          <select
            className="input flex-1 sm:flex-none sm:max-w-[200px]"
            value={buildingFilter}
            onChange={e => { setBuildingFilter(e.target.value); setPage(1) }}
            aria-label="Filter by building"
            title="Filter by building"
          >
            <option value="">All Buildings</option>
            {buildings?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            className="input flex-1 sm:flex-none sm:max-w-[140px]"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            aria-label="Filter by status"
            title="Filter by status"
          >
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          {/* Horizontal scroll on narrow viewports instead of squashing columns */}
          <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[900px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Building / Project</th>
                  <th>Meter</th>
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
                    <td>
                      <div className="flex items-center gap-2">
                        {u.meter_no ? (
                          <span className="font-mono text-xs">{u.meter_no}</span>
                        ) : (
                          <span className="text-surface-400 text-xs">Not assigned</span>
                        )}
                        {can.editMeters && (
                          <button
                            className="btn-ghost btn-sm !p-1"
                            onClick={() => setMeterModal({ open: true, unit: u })}
                            title={u.meter_id ? 'Edit meter' : 'Assign meter'}
                            aria-label={u.meter_id ? `Edit meter for unit ${u.unit_no}` : `Assign meter to unit ${u.unit_no}`}
                          >
                            {u.meter_id ? <Gauge className="w-3.5 h-3.5 text-brand-500" /> : <PlusCircle className="w-3.5 h-3.5 text-surface-400" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-surface-700">{u.allottee?.name || '—'}</td>
                    <td className="font-mono text-sm">{u.mobile_number || '—'}</td>
                    <td>
                      {u.package_name
                        ? <span className="badge-blue text-xs">{u.package_name}</span>
                        : <span className="text-surface-400 text-xs">Inherited</span>}
                    </td>
                    <td><span className={u.status === 'Active' ? 'badge-green' : 'badge-gray'}>{u.status}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setModal({ open: true, item: u })}
                          aria-label={`Edit unit ${u.unit_no}`}
                          title={`Edit unit ${u.unit_no}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {can.deleteBuildings && (
                          <button
                            className="btn-ghost btn-sm text-danger-500 hover:bg-danger-50"
                            onClick={() => handleDelete(u)}
                            aria-label={`Delete unit ${u.unit_no}`}
                            title={`Delete unit ${u.unit_no}`}
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

      <UnitModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        editItem={modal.item}
        buildings={buildings}
        projects={projects}
        packages={packages}
        readOnly={!can.editBuildings}
      />

      <BulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        buildings={buildings}
        projects={projects}
      />

      <MeterAssignModal
        open={meterModal.open}
        onClose={() => setMeterModal({ open: false })}
        unit={meterModal.unit}
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