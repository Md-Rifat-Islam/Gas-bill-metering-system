import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Send, History, FileText, Settings as SettingsIcon, Wallet,
  CheckCircle2, XCircle, RotateCcw, Plus, Trash2, Save, Loader2, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsAPI, buildingsAPI, unitsAPI } from '@/api/client'
import {
  messagingAPI, type AudiencePreview, type CampaignPayload, type SMSCampaign,
  type SMSMessage, type SMSSettings, type SMSTemplate,
} from '@/api/messagingClient'
import { PageLoader, AccessDenied, EmptyState, Pagination, ConfirmDialog } from '@/components/ui'
import { SearchInput } from '@/components/forms'
import { cn, formatDate } from '@/utils/helpers'

type Tab = 'send' | 'history' | 'templates' | 'settings'

// ── helpers ──────────────────────────────────────────────────────────────────
/** Mirrors the server's counter: non-ASCII (e.g. Bangla) => Unicode, 70/67 chars per segment. */
function smsInfo(text: string) {
  const chars = text.length
  const unicode = /[^\x00-\x7F]/.test(text)
  const [single, multi] = unicode ? [70, 67] : [160, 153]
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi)
  return { chars, segments, unicode }
}

const SAMPLE: Record<string, string> = {
  name: 'Rahim Uddin', unit: 'A-3B', building: 'Building 4', project: 'Deco Heights',
  bill_no: 'GAS-1A2B3C4D', month: 'September 2026', total: '1,250.00', paid: '0.00',
  due: '1,250.00', usage: '18.500', portal_url: 'billing.deco.com.bd',
}
const renderSample = (body: string) => body.replace(/\{(\w+)\}/g, (m, k) => SAMPLE[k] ?? m)

const NOTICE_PLACEHOLDERS = [
  { key: 'name', label: 'Customer name' },
  { key: 'unit', label: 'Unit number' },
  { key: 'building', label: 'Building name' },
  { key: 'project', label: 'Project name' },
  { key: 'due', label: 'Unpaid amount (Tk)' },
  { key: 'portal_url', label: 'Portal address' },
]

const STATUS_BADGE: Record<string, string> = {
  Sent: 'badge-green', Failed: 'badge-red', Queued: 'badge-yellow', Skipped: 'badge-gray',
}

function Counter({ text }: { text: string }) {
  const i = smsInfo(text)
  return (
    <p className="text-xs text-surface-400 mt-1">
      {i.chars} characters · {i.segments} SMS segment{i.segments === 1 ? '' : 's'} ·{' '}
      {i.unicode ? 'Unicode (Bangla/symbols: 70 chars per segment)' : 'Standard (160 chars per segment)'}
    </p>
  )
}

function PlaceholderChips({ items, onPick }: { items: { key: string; label: string }[]; onPick: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map(p => (
        <button key={p.key} type="button" title={p.label} onClick={() => onPick(p.key)}
          className="px-2 py-1 rounded-lg text-xs font-mono bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-700">
          {`{${p.key}}`}
        </button>
      ))}
    </div>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function MessagingPage() {
  const { data: access, isLoading } = useQuery({
    queryKey: ['messaging-access'],
    queryFn: () => messagingAPI.access().then(r => r.data),
  })
  const [tab, setTab] = useState<Tab | null>(null)

  if (isLoading) return <PageLoader />
  if (!access?.can_view) return <AccessDenied />

  const canEdit = access.can_edit
  const active: Tab = tab ?? (canEdit ? 'send' : 'history')
  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: 'send', label: 'Send Notice', icon: Send, show: canEdit },
    { id: 'history', label: 'History', icon: History, show: true },
    { id: 'templates', label: 'Templates', icon: FileText, show: canEdit },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, show: canEdit },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Messaging</h1>
          <p className="page-subtitle">SMS to customers — automatic bill &amp; reminder messages, and notices to any unit, building or project</p>
        </div>
      </div>

      <Overview />

      <div className="flex gap-2 overflow-x-auto border-b border-surface-100 mb-6">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap',
              active === t.id ? 'border-brand-500 text-brand-700' : 'border-transparent text-surface-500 hover:text-surface-700'
            )}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {active === 'send' && canEdit && <SendTab />}
      {active === 'history' && <HistoryTab canEdit={canEdit} />}
      {active === 'templates' && canEdit && <TemplatesTab />}
      {active === 'settings' && canEdit && <SettingsTab />}
    </div>
  )
}

// ── overview cards ───────────────────────────────────────────────────────────
function Overview() {
  const { data } = useQuery({
    queryKey: ['messaging-overview'],
    queryFn: () => messagingAPI.overview().then(r => r.data),
    refetchInterval: 60_000,
  })
  const card = 'bg-white rounded-2xl border border-surface-100 shadow-card p-4'
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className={card}>
        <div className="flex items-center gap-2 text-xs text-surface-400"><Wallet className="w-3.5 h-3.5" /> SMS balance</div>
        <div className="text-sm font-semibold text-surface-800 mt-1 break-words">
          {data?.balance ?? (data?.balance_error ? <span className="text-danger-600 text-xs">{data.balance_error}</span> : '—')}
        </div>
        {data?.expiry && <div className="text-xs text-surface-400 mt-0.5">Expires {data.expiry}</div>}
      </div>
      <div className={card}>
        <div className="text-xs text-surface-400">Sent today</div>
        <div className="text-2xl font-bold text-success-600 mt-1">{data?.today?.Sent ?? 0}</div>
      </div>
      <div className={card}>
        <div className="text-xs text-surface-400">Sent this month</div>
        <div className="text-2xl font-bold text-surface-900 mt-1">{data?.month?.Sent ?? 0}</div>
      </div>
      <div className={card}>
        <div className="text-xs text-surface-400">Failed this month</div>
        <div className={cn('text-2xl font-bold mt-1', (data?.month?.Failed ?? 0) > 0 ? 'text-danger-600' : 'text-surface-900')}>
          {data?.month?.Failed ?? 0}
        </div>
      </div>
    </div>
  )
}

// ── Send notice ──────────────────────────────────────────────────────────────
function SendTab() {
  const qc = useQueryClient()
  const [audience, setAudience] = useState<CampaignPayload['audience']>('building')
  const [projectId, setProjectId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [unitIds, setUnitIds] = useState<number[]>([])
  const [unitSearch, setUnitSearch] = useState('')
  const [onlyUnpaid, setOnlyUnpaid] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [confirm, setConfirm] = useState(false)

  const list = (r: any) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])
  const { data: projects = [] } = useQuery({ queryKey: ['projects-all'], queryFn: () => projectsAPI.list({ page_size: 500 }).then(list) })
  const { data: buildings = [] } = useQuery({ queryKey: ['buildings-all'], queryFn: () => buildingsAPI.list({ page_size: 500 }).then(list) })
  const { data: templates = [] } = useQuery({ queryKey: ['sms-templates'], queryFn: () => messagingAPI.templates().then(r => r.data) })
  const { data: campaigns = [] } = useQuery({
    queryKey: ['sms-campaigns'], queryFn: () => messagingAPI.campaigns().then(r => r.data), refetchInterval: 10_000,
  })
  const { data: allUnits = [] } = useQuery({
    queryKey: ['units-all-for-sms'],
    queryFn: () => unitsAPI.list({ page_size: 500 }).then(list),
    enabled: audience === 'units',
  })

  const noticeTemplates = templates.filter((t: SMSTemplate) => t.kind === 'notice' && t.is_active)
  const shownBuildings = buildings.filter((b: any) => !projectId || String(b.project_id) === projectId)
  const shownUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase()
    return allUnits
      .filter((u: any) => !buildingId || String(u.building_id) === buildingId)
      .filter((u: any) => !q || `${u.unit_no} ${u.allottee?.name ?? ''} ${u.mobile_number ?? ''}`.toLowerCase().includes(q))
  }, [allUnits, buildingId, unitSearch])

  const payload = (): CampaignPayload => ({
    title: title.trim(),
    template: templateId ? Number(templateId) : null,
    body,
    audience,
    project_id: audience === 'project' ? Number(projectId) || null : null,
    building_id: audience === 'building' ? Number(buildingId) || null : null,
    unit_ids: audience === 'units' ? unitIds : [],
    only_unpaid: onlyUnpaid,
  })

  // Any change to the audience/message invalidates a previous preview.
  useEffect(() => { setPreview(null) }, [audience, projectId, buildingId, unitIds, onlyUnpaid, body])

  const pickTemplate = (id: string) => {
    setTemplateId(id)
    const t = noticeTemplates.find((x: SMSTemplate) => String(x.id) === id)
    if (t) { setBody(t.body); if (!title.trim()) setTitle(t.name) }
  }

  const doPreview = useMutation({
    mutationFn: () => messagingAPI.previewCampaign(payload()).then(r => r.data),
    onSuccess: setPreview,
  })
  const doSend = useMutation({
    mutationFn: () => messagingAPI.sendCampaign(payload()),
    onSuccess: (r: any) => {
      toast.success(`Notice queued for ${r.data.queued} recipient(s)`)
      qc.invalidateQueries({ queryKey: ['sms-campaigns'] })
      qc.invalidateQueries({ queryKey: ['messaging-overview'] })
      setConfirm(false); setPreview(null); setTitle(''); setBody(''); setTemplateId(''); setUnitIds([])
    },
    onError: () => setConfirm(false),
  })

  const audienceReady =
    audience === 'all' ||
    (audience === 'project' && !!projectId) ||
    (audience === 'building' && !!buildingId) ||
    (audience === 'units' && unitIds.length > 0)
  const canPreview = audienceReady && body.trim().length > 0

  const audiences: { id: CampaignPayload['audience']; label: string }[] = [
    { id: 'building', label: 'A building' },
    { id: 'project', label: 'A project' },
    { id: 'units', label: 'Specific units' },
    { id: 'all', label: 'Everyone' },
  ]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-5">
        {/* Audience */}
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5">
          <div className="flex items-center gap-2 font-semibold text-surface-800 mb-3"><Users className="w-4 h-4 text-brand-500" /> Who should get this?</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {audiences.map(a => (
              <button key={a.id} type="button" onClick={() => setAudience(a.id)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border',
                  audience === a.id ? 'bg-surface-900 text-white border-surface-900' : 'bg-white text-surface-500 border-surface-200')}>
                {a.label}
              </button>
            ))}
          </div>

          {(audience === 'project' || audience === 'building' || audience === 'units') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label" htmlFor="sms-project">Project</label>
                <select id="sms-project" className="input" value={projectId}
                  onChange={e => { setProjectId(e.target.value); setBuildingId(''); setUnitIds([]) }}>
                  <option value="">{audience === 'project' ? '— Select project —' : 'All projects'}</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {(audience === 'building' || audience === 'units') && (
                <div>
                  <label className="label" htmlFor="sms-building">Building</label>
                  <select id="sms-building" className="input" value={buildingId}
                    onChange={e => { setBuildingId(e.target.value); setUnitIds([]) }}>
                    <option value="">{audience === 'building' ? '— Select building —' : 'All buildings'}</option>
                    {shownBuildings.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {audience === 'units' && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex-1"><SearchInput value={unitSearch} onChange={setUnitSearch} placeholder="Search unit, customer, mobile…" /></div>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setUnitIds(Array.from(new Set([...unitIds, ...shownUnits.map((u: any) => u.id)])))}>Select shown</button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setUnitIds([])}>Clear</button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto border border-surface-100 rounded-xl divide-y divide-surface-100">
                {shownUnits.length === 0 ? (
                  <div className="p-4 text-sm text-surface-400">No units to show.</div>
                ) : shownUnits.map((u: any) => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-50">
                    <input type="checkbox" checked={unitIds.includes(u.id)}
                      onChange={e => setUnitIds(e.target.checked ? [...unitIds, u.id] : unitIds.filter(x => x !== u.id))} />
                    <span className="font-medium text-surface-800">{u.unit_no}</span>
                    <span className="text-surface-500 truncate">{u.allottee?.name ?? '—'}</span>
                    <span className="ml-auto text-xs text-surface-400">{u.building_name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-surface-400 mt-1">{unitIds.length} unit(s) selected</p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-surface-600 mt-4 cursor-pointer">
            <input type="checkbox" checked={onlyUnpaid} onChange={e => setOnlyUnpaid(e.target.checked)} />
            Only units that currently have an unpaid / partially paid bill
          </label>
        </div>

        {/* Message */}
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sms-title">Notice title <span className="text-surface-400 font-normal text-xs">(for your records)</span></label>
              <input id="sms-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Gas maintenance — Building 4" />
            </div>
            <div>
              <label className="label" htmlFor="sms-template">Start from a template</label>
              <select id="sms-template" className="input" value={templateId} onChange={e => pickTemplate(e.target.value)}>
                <option value="">Custom message</option>
                {noticeTemplates.map((t: SMSTemplate) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="sms-body">Message</label>
            <textarea id="sms-body" className="input" rows={5} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Dear {name}, …" />
            <Counter text={body} />
            <PlaceholderChips items={NOTICE_PLACEHOLDERS} onPick={k => setBody(b => `${b}{${k}}`)} />
          </div>
          {body.trim() && (
            <div className="rounded-xl bg-surface-50 border border-surface-100 p-3 text-sm text-surface-700">
              <div className="text-xs text-surface-400 mb-1">Example (sample customer)</div>
              {renderSample(body)}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" disabled={!canPreview || doPreview.isPending} onClick={() => doPreview.mutate()}>
              {doPreview.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Check recipients
            </button>
            <button className="btn-primary" disabled={!preview || preview.recipients === 0 || !title.trim() || doSend.isPending}
              onClick={() => setConfirm(true)}>
              <Send className="w-4 h-4" /> Send notice
            </button>
          </div>
          {!title.trim() && preview && <p className="text-xs text-warning-600">Add a title to enable sending.</p>}

          {preview && (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm space-y-1">
              <div className="font-semibold text-brand-800">{preview.recipients} recipient(s) will get this SMS ({preview.total_segments} segment(s) in total)</div>
              <div className="text-surface-600">
                {preview.units} unit(s) matched
                {preview.skipped_no_mobile > 0 && ` · ${preview.skipped_no_mobile} skipped (no valid mobile)`}
                {preview.skipped_duplicates > 0 && ` · ${preview.skipped_duplicates} duplicate(s) merged`}
              </div>
              {preview.samples.map(s => (
                <div key={s.unit + s.mobile} className="text-xs text-surface-500 border-t border-brand-100 pt-1 mt-1">
                  <span className="font-mono">{s.mobile}</span> (Unit {s.unit}): {s.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent notices */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 h-fit">
        <div className="font-semibold text-surface-800 mb-3">Recent notices</div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-surface-400">No notices sent yet.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: SMSCampaign) => (
              <div key={c.id} className="border border-surface-100 rounded-xl p-3">
                <div className="font-medium text-sm text-surface-800">{c.title}</div>
                <div className="text-xs text-surface-400">
                  {c.audience_display}{c.building_name && ` · ${c.building_name}`}{c.project_name && ` · ${c.project_name}`} · {formatDate(c.created_at)}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs mt-1">
                  <span className="text-success-600">{c.sent} sent</span>
                  {c.queued > 0 && <span className="text-warning-600">{c.queued} sending…</span>}
                  {c.failed > 0 && <span className="text-danger-600">{c.failed} failed</span>}
                  {c.skipped > 0 && <span className="text-surface-400">{c.skipped} skipped</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => doSend.mutate()}
        title="Send this notice?"
        message={`This will send an SMS to ${preview?.recipients ?? 0} customer(s) (${preview?.total_segments ?? 0} segment(s)). It uses your SMS balance and cannot be recalled.`}
      />
    </div>
  )
}

// ── History ──────────────────────────────────────────────────────────────────
function HistoryTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sms-messages', page, status, kind, search],
    queryFn: () => messagingAPI.messages({
      page, status: status || undefined, kind: kind || undefined, search: search || undefined,
    }).then(r => r.data),
    refetchInterval: 15_000,
  })
  const retry = useMutation({
    mutationFn: (id: number) => messagingAPI.retry(id),
    onSuccess: () => { toast.success('Queued for retry'); qc.invalidateQueries({ queryKey: ['sms-messages'] }) },
  })
  const rows: SMSMessage[] = data?.results ?? []
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1) }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input max-w-[160px]" value={status} onChange={e => reset(setStatus)(e.target.value)} title="Filter by status">
          <option value="">All statuses</option>
          <option>Sent</option><option>Failed</option><option>Queued</option><option>Skipped</option>
        </select>
        <select className="input max-w-[200px]" value={kind} onChange={e => reset(setKind)(e.target.value)} title="Filter by type">
          <option value="">All types</option>
          <option value="bill_created">Bill created</option>
          <option value="reminder">Payment reminder</option>
          <option value="notice">Notice</option>
          <option value="test">Test</option>
        </select>
        <div className="w-full sm:w-72"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Mobile, unit, bill no., text…" /></div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>When</th><th>Type</th><th>To</th><th>Unit</th><th>Message</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={MessageSquare} title="No messages yet" /></td></tr>
                ) : rows.map(m => (
                  <Fragment key={m.id}>
                    <tr className="cursor-pointer" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <td className="text-xs text-surface-500 whitespace-nowrap">{new Date(m.created_at).toLocaleString('en-GB')}</td>
                      <td className="text-xs">
                        {m.kind_display}
                        {m.kind === 'reminder' && m.reminder_day ? ` (day ${m.reminder_day})` : ''}
                        {m.campaign_title && <div className="text-surface-400">{m.campaign_title}</div>}
                      </td>
                      <td className="font-mono text-xs">{m.mobile || '—'}</td>
                      <td className="text-xs">{m.unit_no || '—'}{m.bill_number && <div className="text-surface-400 font-mono">{m.bill_number}</div>}</td>
                      <td className="text-xs text-surface-600 max-w-xs truncate">{m.body}</td>
                      <td><span className={STATUS_BADGE[m.status] ?? 'badge-gray'}>{m.status}</span></td>
                      <td>
                        {canEdit && m.status === 'Failed' && m.mobile && (
                          <button className="btn-ghost btn-sm" title="Retry" onClick={e => { e.stopPropagation(); retry.mutate(m.id) }}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === m.id && (
                      <tr>
                        <td colSpan={7} className="bg-surface-50 text-xs text-surface-600 space-y-1">
                          <div><span className="text-surface-400">Full message:</span> {m.body}</div>
                          <div className="text-surface-400">{m.segments} segment(s) · {m.attempts} attempt(s){m.sent_at && ` · sent ${new Date(m.sent_at).toLocaleString('en-GB')}`}{m.created_by_name && ` · by ${m.created_by_name}`}</div>
                          {m.error && <div className="text-danger-600">Error: {m.error}</div>}
                          {m.provider_response && <div className="font-mono break-all text-surface-500">Provider: {m.provider_response}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ── Templates ────────────────────────────────────────────────────────────────
function TemplateCard({ t, onSaved }: { t: SMSTemplate; onSaved: () => void }) {
  const [body, setBody] = useState(t.body)
  const [name, setName] = useState(t.name)
  const [active, setActive] = useState(t.is_active)
  const [del, setDel] = useState(false)
  const dirty = body !== t.body || name !== t.name || active !== t.is_active

  const save = useMutation({
    mutationFn: () => messagingAPI.updateTemplate(t.id, { name, body, is_active: active }),
    onSuccess: () => { toast.success('Template saved'); onSaved() },
  })
  const remove = useMutation({
    mutationFn: () => messagingAPI.deleteTemplate(t.id),
    onSuccess: () => { toast.success('Template deleted'); setDel(false); onSaved() },
  })
  const when = t.kind === 'bill_created' ? 'Sent automatically when a bill is created'
    : t.kind === 'reminder' ? 'Sent automatically on the reminder days, if the bill is still unpaid'
    : 'Available in “Send Notice”'

  return (
    <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {t.is_system ? <div className="font-semibold text-surface-800">{t.name}</div>
            : <input className="input !py-1 font-semibold" value={name} onChange={e => setName(e.target.value)} aria-label="Template name" />}
          <div className="text-xs text-surface-400 mt-0.5">{t.kind_display} · {when}</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-surface-600 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
        </label>
      </div>
      <textarea className="input" rows={4} value={body} onChange={e => setBody(e.target.value)} aria-label={`${t.name} text`} />
      <Counter text={body} />
      <PlaceholderChips items={t.placeholders} onPick={k => setBody(b => `${b}{${k}}`)} />
      <div className="rounded-xl bg-surface-50 border border-surface-100 p-3 text-sm text-surface-700">
        <div className="text-xs text-surface-400 mb-1">Example</div>{renderSample(body)}
      </div>
      <div className="flex gap-3 justify-end">
        {!t.is_system && (
          <button className="btn-ghost text-danger-600" onClick={() => setDel(true)}><Trash2 className="w-4 h-4" /> Delete</button>
        )}
        <button className="btn-primary" disabled={!dirty || !body.trim() || save.isPending} onClick={() => save.mutate()}>
          <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()}
        title="Delete this template?" message="Notices already sent are not affected." danger />
    </div>
  )
}

function TemplatesTab() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['sms-templates'], queryFn: () => messagingAPI.templates().then(r => r.data),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['sms-templates'] })
  const create = useMutation({
    mutationFn: () => messagingAPI.createTemplate({ name: name.trim(), body }),
    onSuccess: () => { toast.success('Template created'); setAdding(false); setName(''); setBody(''); refresh() },
  })

  if (isLoading) return <PageLoader />
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="text-sm text-surface-500 bg-surface-50 border border-surface-100 rounded-xl p-3">
        Tip: the “৳” sign and Bangla text make an SMS <strong>Unicode</strong>, which fits only 70 characters per segment
        instead of 160 — so a message costs more. The built-in templates use “Tk” to stay standard. Bangla is fully supported
        if you prefer it; just keep an eye on the counter under each box.
      </div>

      {templates.map((t: SMSTemplate) => <TemplateCard key={`${t.id}-${t.body}-${t.is_active}-${t.name}`} t={t} onSaved={refresh} />)}

      {adding ? (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-5 space-y-3">
          <div className="font-semibold text-surface-800">New notice template</div>
          <input className="input" placeholder="Template name, e.g. Holiday closure" value={name} onChange={e => setName(e.target.value)} />
          <textarea className="input" rows={4} placeholder="Dear {name}, …" value={body} onChange={e => setBody(e.target.value)} />
          <Counter text={body} />
          <PlaceholderChips items={NOTICE_PLACEHOLDERS} onPick={k => setBody(b => `${b}{${k}}`)} />
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || !body.trim() || create.isPending} onClick={() => create.mutate()}>
              <Save className="w-4 h-4" /> Create
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> New notice template</button>
      )}
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['sms-settings'], queryFn: () => messagingAPI.getSettings().then(r => r.data) })
  const { data: rp } = useQuery({ queryKey: ['sms-reminder-preview'], queryFn: () => messagingAPI.reminderPreview().then(r => r.data) })
  const [form, setForm] = useState<SMSSettings | null>(null)
  const [daysText, setDaysText] = useState('')
  const [testMobile, setTestMobile] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testResult, setTestResult] = useState<SMSMessage | null>(null)

  useEffect(() => {
    if (data) { setForm(data); setDaysText(data.reminder_days.join(', ')) }
  }, [data])

  const parsedDays = daysText.split(/[,\s]+/).filter(Boolean).map(Number)
  const daysValid = parsedDays.length > 0 && parsedDays.every(d => Number.isInteger(d) && d >= 1 && d <= 28)

  const save = useMutation({
    mutationFn: () => messagingAPI.updateSettings({
      auto_bill_created: form!.auto_bill_created, auto_reminders: form!.auto_reminders,
      reminder_days: parsedDays, send_hour: form!.send_hour, remind_months_back: form!.remind_months_back,
    }),
    onSuccess: () => {
      toast.success('Settings saved')
      qc.invalidateQueries({ queryKey: ['sms-settings'] }); qc.invalidateQueries({ queryKey: ['sms-reminder-preview'] })
    },
  })
  const test = useMutation({
    mutationFn: () => messagingAPI.test({ mobile: testMobile, message: testMsg || undefined }).then(r => r.data),
    onSuccess: (m: SMSMessage) => { setTestResult(m); qc.invalidateQueries({ queryKey: ['sms-messages'] }) },
  })

  if (!form) return <PageLoader />
  const box = 'bg-white rounded-2xl border border-surface-100 shadow-card p-5'
  const hours = Array.from({ length: 24 }, (_, h) => h)

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(box, 'space-y-4')}>
        <div className="font-semibold text-surface-800">Automatic messages</div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={form.auto_bill_created}
            onChange={e => setForm({ ...form, auto_bill_created: e.target.checked })} />
          <span>
            <span className="text-sm font-medium text-surface-800">Send an SMS when a bill is created</span>
            <span className="block text-xs text-surface-400">Applies to single and bulk bill creation. Zero-amount bills are skipped.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={form.auto_reminders}
            onChange={e => setForm({ ...form, auto_reminders: e.target.checked })} />
          <span>
            <span className="text-sm font-medium text-surface-800">Send payment reminders for unpaid bills</span>
            <span className="block text-xs text-surface-400">Bills that are already fully paid never get a reminder.</span>
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="sms-days">Reminder days of the month</label>
            <input id="sms-days" className={cn('input', !daysValid && 'border-danger-300')} value={daysText}
              onChange={e => setDaysText(e.target.value)} placeholder="8, 10" />
            <p className="text-xs text-surface-400 mt-1">Days 1–28, separated by commas. Up to 6.</p>
          </div>
          <div>
            <label className="label" htmlFor="sms-hour">Send at or after</label>
            <select id="sms-hour" className="input" value={form.send_hour}
              onChange={e => setForm({ ...form, send_hour: Number(e.target.value) })}>
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00 (Dhaka time)</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="sms-back">Which unpaid bills get reminded</label>
            <select id="sms-back" className="input" value={form.remind_months_back}
              onChange={e => setForm({ ...form, remind_months_back: Number(e.target.value) })}>
              <option value={0}>Only this month's bills</option>
              <option value={1}>This month and last month</option>
              <option value={2}>Last 3 months</option>
              <option value={5}>Last 6 months</option>
              <option value={11}>Last 12 months</option>
            </select>
            <p className="text-xs text-surface-400 mt-1">
              Older unpaid bills are left alone, so switching this on never blasts your whole history.
            </p>
          </div>
        </div>

        {rp && (
          <div className="rounded-xl bg-surface-50 border border-surface-100 p-3 text-xs text-surface-600">
            With these settings, {rp.is_reminder_day_today ? 'a reminder would go out today to' : 'the next reminder day would reach'}{' '}
            <strong>{rp.with_valid_mobile}</strong> customer(s) with a valid mobile
            {rp.without_valid_mobile > 0 && <> ({rp.without_valid_mobile} have no valid mobile and will be skipped)</>}.
            {rp.next_reminder_day && <> Next reminder day: <strong>{rp.next_reminder_day}</strong>.</>} Saved changes refresh this estimate.
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-surface-400">{form.updated_by_name && `Last changed by ${form.updated_by_name}`}</span>
          <button className="btn-primary" disabled={!daysValid || save.isPending} onClick={() => save.mutate()}>
            <Save className="w-4 h-4" /> {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      <div className={cn(box, 'space-y-3')}>
        <div className="font-semibold text-surface-800">Send a test SMS</div>
        <p className="text-xs text-surface-400">Sends one real message now (uses 1 SMS). Use it after setup, and once with Bangla text to confirm it displays correctly.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="input" placeholder="01XXXXXXXXX" value={testMobile} onChange={e => setTestMobile(e.target.value)} aria-label="Test mobile number" />
          <input className="input sm:col-span-2" placeholder="Optional message" value={testMsg} onChange={e => setTestMsg(e.target.value)} aria-label="Test message" />
        </div>
        <button className="btn-secondary" disabled={!testMobile.trim() || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test
        </button>
        {testResult && (
          <div className={cn('rounded-xl p-3 text-sm flex items-start gap-2',
            testResult.status === 'Sent' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700')}>
            {testResult.status === 'Sent' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="font-medium">{testResult.status === 'Sent' ? 'Accepted by the gateway' : 'Not sent'}</div>
              {testResult.error && <div className="text-xs">{testResult.error}</div>}
              {testResult.provider_response && <div className="text-xs font-mono break-all opacity-80">Provider: {testResult.provider_response}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}