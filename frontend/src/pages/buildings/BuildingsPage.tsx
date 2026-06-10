import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Building, Search } from 'lucide-react'
import { buildingsAPI, projectsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination } from '@/components/ui'
import toast from 'react-hot-toast'

interface BuildingForm {
  project_id: number
  name: string
  code: string
  total_floors: number
}

function BuildingModal({ open, onClose, editItem, projects }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm<BuildingForm>({
    defaultValues: editItem
      ? { ...editItem, project_id: editItem.project_id || editItem.project?.id }
      : { total_floors: 1 }
  })
  const save = useMutation({
    mutationFn: (data: BuildingForm) =>
      editItem ? buildingsAPI.update(editItem.id, data) : buildingsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings'] })
      toast.success(editItem ? 'Building updated' : 'Building created')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Building' : 'New Building'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Project *</label>
          <select {...register('project_id', { required: true })} className="input">
            <option value="">— Select project —</option>
            {projects?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Building Name *</label>
            <input {...register('name', { required: true })} className="input" placeholder="Block A" />
          </div>
          <div>
            <label className="label">Code</label>
            <input {...register('code')} className="input" placeholder="BLK-A" />
          </div>
        </div>
        <div>
          <label className="label">Total Floors</label>
          <input {...register('total_floors', { min: 1 })} type="number" className="input" defaultValue={1} />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Building'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BuildingsPage() {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })

  const { data, isLoading } = useQuery({
    queryKey: ['buildings', search, projectFilter, page],
    queryFn: () => buildingsAPI.list({ search, project: projectFilter || undefined, page }).then(r => r.data),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 100 }).then(r => r.data.results || r.data),
  })

  const buildings = data?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Buildings</h1>
          <p className="page-subtitle">Manage buildings within your projects</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4" /> New Building
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input className="input pl-9" placeholder="Search buildings…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input max-w-[200px]" value={projectFilter}
          onChange={e => { setProjectFilter(e.target.value); setPage(1) }}>
          <option value="">All Projects</option>
          {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
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
                      <button className="btn-ghost btn-sm" onClick={() => setModal({ open: true, item: b })}>
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

      <BuildingModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        editItem={modal.item}
        projects={projects}
      />
    </div>
  )
}
