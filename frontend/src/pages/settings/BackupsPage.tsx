import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Download, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { backupsAPI } from '@/api/client'
import { PageLoader, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  pending:   { label: 'Queued',    className: 'badge-gray',   icon: Clock },
  running:   { label: 'Running',   className: 'badge-yellow', icon: Loader2 },
  completed: { label: 'Completed', className: 'badge-green',  icon: CheckCircle2 },
  failed:    { label: 'Failed',    className: 'badge-red',    icon: XCircle },
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function BackupsPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupsAPI.list().then(r => r.data),
    // Poll while anything is pending/running so the row flips to
    // completed/failed on its own — a backup can take a while (pg_dump +
    // zipping the whole media folder), so the person shouldn't have to
    // manually refresh to see it finish.
    refetchInterval: (query) => {
      // THE FIX: query.state.data here is the RAW response body, which
      // this endpoint returns paginated — { results: [...], count, ... } —
      // not a plain array. `as any[]` was a TypeScript-only cast that
      // didn't change what's actually there at runtime, so `.some(...)`
      // was being called on a non-array object and throwing a TypeError
      // during query setup. That throw isn't inside queryFn (which React
      // Query wraps safely) — it's inside this config callback, so it
      // crashed the whole render tree with no error boundary to catch it.
      const raw = query.state.data as any
      const list: any[] = raw?.results ?? raw ?? []
      const hasActive = Array.isArray(list) && list.some((b) => b.status === 'pending' || b.status === 'running')
      return hasActive ? 4000 : false
    },
  })

  const backups = data?.results ?? data ?? []
  const hasActiveBackup = backups.some((b: any) => b.status === 'pending' || b.status === 'running')

  const trigger = useMutation({
    mutationFn: () => backupsAPI.run(),
    onSuccess: () => {
      toast.success('Backup started — this can take a few minutes')
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  const handleDownload = async (id: number) => {
    try {
      await backupsAPI.download(id)
    } catch {
      toast.error('Could not download this backup')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Backups</h1>
          <p className="page-subtitle">
            Full database dump + meter/payment photos. Runs automatically every night, or on demand below.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || hasActiveBackup}
          title={hasActiveBackup ? 'A backup is already in progress' : undefined}
        >
          {trigger.isPending || hasActiveBackup ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
          ) : (
            <><Database className="w-4 h-4" /> Run Backup Now</>
          )}
        </button>
      </div>

      {isLoading ? <PageLoader /> : backups.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No backups yet"
          description="Run one manually, or wait for tonight's scheduled backup"
        />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Size</th>
                <th>Triggered By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b: any) => {
                const meta = STATUS_META[b.status] ?? STATUS_META.pending
                const StatusIcon = meta.icon
                return (
                  <tr key={b.id}>
                    <td className="text-surface-600 text-sm">{formatDateTime(b.started_at)}</td>
                    <td className="text-xs text-surface-400 capitalize">{b.trigger}</td>
                    <td>
                      <span className={`${meta.className} inline-flex items-center gap-1`}>
                        <StatusIcon className={`w-3 h-3 ${b.status === 'running' ? 'animate-spin' : ''}`} />
                        {meta.label}
                      </span>
                      {b.status === 'failed' && b.error_message && (
                        <div className="text-[11px] text-danger-500 mt-1 max-w-xs truncate" title={b.error_message}>
                          {b.error_message}
                        </div>
                      )}
                    </td>
                    <td className="font-mono text-sm text-surface-600">
                      {b.file_size_mb != null ? `${b.file_size_mb} MB` : '—'}
                    </td>
                    <td className="text-surface-600 text-sm">{b.triggered_by_name || '—'}</td>
                    <td>
                      {b.status === 'completed' && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => handleDownload(b.id)}
                          title="Download backup"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}