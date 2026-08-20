import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Eye, X, ShieldAlert } from 'lucide-react'
import { auditAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { PageLoader, EmptyState, Pagination, AccessDenied, Modal } from '@/components/ui'
import { formatDate } from '@/utils/helpers'

// ── Small presentational badges ────────────────────────────────────────────
const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-success-50 text-success-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-danger-50 text-danger-700',
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ACTION_STYLES[action] ?? 'bg-surface-100 text-surface-500'}`}>
      {action}
    </span>
  )
}

const ACTOR_STYLES: Record<string, string> = {
  staff:    'bg-purple-100 text-purple-700',
  customer: 'bg-amber-100 text-amber-700',
  system:   'bg-gray-100 text-gray-500',
}

function ActorBadge({ actorType }: { actorType: string }) {
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${ACTOR_STYLES[actorType] ?? 'bg-gray-100 text-gray-500'}`}>
      {actorType}
    </span>
  )
}

// ── Filter bar ──────────────────────────────────────────────────────────────
interface Filters {
  table: string
  action: string
  date_from: string
  date_to: string
}

const EMPTY_FILTERS: Filters = { table: '', action: '', date_from: '', date_to: '' }

function FilterBar({ value, onChange }: { value: Filters; onChange: (v: Filters) => void }) {
  const hasActiveFilters = Object.values(value).some(Boolean)
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-6 p-3 sm:p-4 bg-white rounded-2xl border border-surface-100 shadow-card">
      <div className="flex-1 min-w-[160px]">
        <label className="label" htmlFor="audit-table">Table</label>
        <input
          id="audit-table"
          className="input !py-1.5 !text-sm"
          placeholder="e.g. bills, staff_users…"
          value={value.table}
          onChange={e => onChange({ ...value, table: e.target.value })}
        />
      </div>
      <div className="min-w-[140px]">
        <label className="label" htmlFor="audit-action">Action</label>
        <select
          id="audit-action"
          className="input !py-1.5 !text-sm"
          value={value.action}
          onChange={e => onChange({ ...value, action: e.target.value })}
        >
          <option value="">All actions</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <label className="label" htmlFor="audit-from">From</label>
          <input
            id="audit-from"
            type="date"
            className="input !py-1.5 !text-sm"
            value={value.date_from}
            onChange={e => onChange({ ...value, date_from: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="audit-to">To</label>
          <input
            id="audit-to"
            type="date"
            className="input !py-1.5 !text-sm"
            value={value.date_to}
            onChange={e => onChange({ ...value, date_to: e.target.value })}
          />
        </div>
      </div>
      {hasActiveFilters && (
        <button
          type="button"
          className="btn-ghost btn-sm !text-xs"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <X className="w-3.5 h-3.5" /> Clear filters
        </button>
      )}
    </div>
  )
}

// ── Detail modal — before/after JSON snapshot ───────────────────────────────
function LogDetailModal({ log, onClose }: { log: any | null; onClose: () => void }) {
  if (!log) return null
  return (
    <Modal open={!!log} onClose={onClose} title={`${log.action} — ${log.table_name} #${log.record_id}`} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-surface-500">
          <ActionBadge action={log.action} />
          <ActorBadge actorType={log.actor_type} />
          <span className="font-medium text-surface-700">{log.changed_by_name}</span>
          <span className="text-surface-300">·</span>
          <span>{formatDate(log.changed_at)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {log.old_data !== null && log.old_data !== undefined && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-1.5">
                Before
              </div>
              <pre className="bg-surface-50 border border-surface-100 rounded-xl p-3 text-xs overflow-x-auto max-h-80 overflow-y-auto">
                {JSON.stringify(log.old_data, null, 2)}
              </pre>
            </div>
          )}
          {log.new_data !== null && log.new_data !== undefined && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-1.5">
                After
              </div>
              <pre className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-xs overflow-x-auto max-h-80 overflow-y-auto">
                {JSON.stringify(log.new_data, null, 2)}
              </pre>
            </div>
          )}
          {(log.old_data === null || log.old_data === undefined) &&
           (log.new_data === null || log.new_data === undefined) && (
            <div className="md:col-span-2 text-sm text-surface-400 text-center py-6">
              No snapshot data recorded for this entry.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
// Super Admin only, both on the backend (AuditLogPermission is hard-locked,
// not override-able — see core/permissions.py) and here on the frontend
// (can.viewAuditLogs mirrors that same hard-lock, computed live by
// MyPermissionsView rather than duplicated as a role-string check).
export default function AuditLogsPage() {
  const { can } = usePermissions()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<any | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: () => auditAPI.list({
      page,
      table: filters.table || undefined,
      action: filters.action || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    }).then(r => r.data),
    enabled: can.viewAuditLogs,
  })

  if (!can.viewAuditLogs) return <AccessDenied />

  const logs = data?.results ?? []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Full change history across the system (Super Admin only)</p>
        </div>
      </div>

      <FilterBar value={filters} onChange={f => { setFilters(f); setPage(1) }} />

      {isError && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>Could not load audit logs. Confirm <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">GET /audit/</code> is reachable.</span>
        </div>
      )}

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[820px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Record ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6}>
                    <EmptyState
                      icon={History}
                      title="No audit entries found"
                      description="No entries match the selected filters"
                    />
                  </td></tr>
                ) : logs.map((log: any) => (
                  <tr key={log.id}>
                    <td className="text-surface-600 text-sm whitespace-nowrap">{formatDate(log.changed_at)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-surface-800 text-sm">{log.changed_by_name}</span>
                        <ActorBadge actorType={log.actor_type} />
                      </div>
                    </td>
                    <td><ActionBadge action={log.action} /></td>
                    <td className="font-mono text-xs text-surface-500">{log.table_name}</td>
                    <td className="font-mono text-xs text-surface-400">#{log.record_id}</td>
                    <td>
                      <button
                        className="btn-ghost btn-sm"
                        title="View details"
                        aria-label={`View details for ${log.action} on ${log.table_name} #${log.record_id}`}
                        onClick={() => setSelected(log)}
                      >
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

      <LogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}