import api from './client'

export interface MessagingAccess { can_view: boolean; can_edit: boolean; can_delete: boolean }

export interface SMSSettings {
  auto_bill_created: boolean
  auto_reminders: boolean
  reminder_days: number[]
  send_hour: number
  remind_months_back: number
  updated_by_name?: string
  updated_at?: string
}

export interface SMSTemplate {
  id: number
  key: string
  name: string
  kind: 'bill_created' | 'reminder' | 'notice'
  kind_display: string
  body: string
  is_active: boolean
  is_system: boolean
  placeholders: { key: string; label: string }[]
}

export interface SMSMessage {
  id: number
  kind: string
  kind_display: string
  mobile: string
  body: string
  segments: number
  status: 'Queued' | 'Sent' | 'Failed' | 'Skipped'
  error: string
  provider_response: string
  attempts: number
  bill_number: string
  unit_no: string
  building_name: string
  campaign_title: string
  reminder_day: number
  created_by_name: string
  created_at: string
  sent_at: string | null
}

export interface SMSCampaign {
  id: number
  title: string
  body: string
  audience_display: string
  project_name: string
  building_name: string
  unit_count: number
  only_unpaid: boolean
  created_by_name: string
  created_at: string
  total: number; sent: number; failed: number; skipped: number; queued: number
}

export interface CampaignPayload {
  title?: string
  template?: number | null
  body: string
  audience: 'all' | 'project' | 'building' | 'units'
  project_id?: number | null
  building_id?: number | null
  unit_ids?: number[]
  only_unpaid?: boolean
  dry_run?: boolean
}

export interface AudiencePreview {
  units: number
  recipients: number
  skipped_no_mobile: number
  skipped_duplicates: number
  total_segments: number
  samples: { unit: string; mobile: string; text: string }[]
}

export const messagingAPI = {
  access: () => api.get<MessagingAccess>('/messaging/access/'),
  overview: () => api.get('/messaging/overview/'),

  getSettings: () => api.get<SMSSettings>('/messaging/settings/'),
  updateSettings: (data: Partial<SMSSettings>) => api.put<SMSSettings>('/messaging/settings/', data),
  reminderPreview: () => api.get('/messaging/reminders/preview/'),

  templates: () => api.get<SMSTemplate[]>('/messaging/templates/'),
  createTemplate: (data: { name: string; body: string }) => api.post('/messaging/templates/', data),
  updateTemplate: (id: number, data: Partial<Pick<SMSTemplate, 'name' | 'body' | 'is_active'>>) =>
    api.patch(`/messaging/templates/${id}/`, data),
  deleteTemplate: (id: number) => api.delete(`/messaging/templates/${id}/`),

  messages: (params?: Record<string, any>) => api.get('/messaging/messages/', { params }),
  retry: (id: number) => api.post(`/messaging/messages/${id}/retry/`),
  test: (data: { mobile: string; message?: string }) => api.post('/messaging/test/', data),

  campaigns: () => api.get<SMSCampaign[]>('/messaging/campaigns/'),
  previewCampaign: (data: CampaignPayload) =>
    api.post<AudiencePreview & { dry_run: boolean }>('/messaging/campaigns/', { ...data, dry_run: true }),
  sendCampaign: (data: CampaignPayload) => api.post('/messaging/campaigns/', { ...data, dry_run: false }),
}