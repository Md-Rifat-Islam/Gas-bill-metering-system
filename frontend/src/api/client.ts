import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) throw new Error('No refresh token')
        const { data } = await axios.post('/api/v1/auth/token/refresh/', { refresh })
        localStorage.setItem('access_token', data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/staff/login'
        return Promise.reject(error)
      }
    }
    if (error.response?.status !== 401) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {})[0] ||
        'An error occurred'
      // Fixed id: if several requests fail at once (common when a page
      // fires multiple queries and they all 401/500 together), this
      // replaces the same toast instead of stacking several full-width
      // toasts on top of each other — the main cause of toasts covering
      // the whole screen on mobile.
      toast.error(Array.isArray(msg) ? msg[0] : String(msg), { id: 'api-error' })
    }
    return Promise.reject(error)
  }
)

export default api

// ── Resource helpers ──────────────────────────────────────────────────────────

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { email, password }),
  logout: (refresh: string) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/'),

  staff: () => api.get('/auth/staff/'),
  createStaff: (data: any) => api.post('/auth/staff/', data),
  updateStaff: (id: number, data: any) => api.patch(`/auth/staff/${id}/`, data),
  deleteStaff: (id: number) => api.delete(`/auth/staff/${id}/`),

  roles: () => api.get('/auth/roles/'),
  rolesDropdown: () => api.get('/auth/roles/dropdown/'),
  rolePermissionMatrix: () => api.get('/auth/roles/permission-matrix/'),

  myPermissions: () => api.get('/auth/me/permissions/'),

  // Granular per-module permission overrides for one staff user
  getUserPermissions: (userId: number) => api.get(`/auth/staff/${userId}/permissions/`),
  setUserPermissions: (userId: number, overrides: Array<{
    module: string; can_view: boolean; can_edit: boolean; can_delete: boolean
  }>) => api.put(`/auth/staff/${userId}/permissions/`, overrides),
}

export const projectsAPI = {
  list: (params?: any) => api.get('/projects/', { params }),
  get: (id: number) => api.get(`/projects/${id}/`),
  create: (data: any) => api.post('/projects/', data),
  update: (id: number, data: any) => api.patch(`/projects/${id}/`, data),
  delete: (id: number) => api.delete(`/projects/${id}/`),
  packages: () => api.get('/projects/packages/'),
  createPackage: (data: any) => api.post('/projects/packages/', data),
  updatePackage: (id: number, data: any) => api.patch(`/projects/packages/${id}/`, data),
}

export const buildingsAPI = {
  list: (params?: any) => api.get('/buildings/', { params }),
  get: (id: number) => api.get(`/buildings/${id}/`),
  create: (data: any) => api.post('/buildings/', data),
  update: (id: number, data: any) => api.patch(`/buildings/${id}/`, data),
  delete: (id: number) => api.delete(`/buildings/${id}/`),
}

export const unitsAPI = {
  list: (params?: any) => api.get('/units/', { params }),
  get: (id: number) => api.get(`/units/${id}/`),
  create: (data: any) => api.post('/units/', data),
  update: (id: number, data: any) => api.patch(`/units/${id}/`, data),
  delete: (id: number) => api.delete(`/units/${id}/`),

  // Bulk import — responseType 'blob' on both, since the template call is
  // always a file, and the import call can come back as either JSON
  // (all rows valid) or a file (an annotated error workbook). validateStatus
  // is relaxed on the import call so a 422 error-file response doesn't
  // trigger the global interceptor's generic error toast above — the
  // Bulk Import modal handles both outcomes itself.
  downloadBulkImportTemplate: (buildingId: string | number) =>
    api.get('/units/bulk-import/template/', {
      params: { building_id: buildingId },
      responseType: 'blob',
    }),
  bulkImport: (buildingId: string | number, file: File) => {
    const form = new FormData()
    form.append('building_id', String(buildingId))
    form.append('file', file)
    return api.post('/units/bulk-import/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      validateStatus: () => true,
    })
  },

  // Admin-side (no OTP) reset of a resident's Resident Portal password —
  // called from the Unit edit modal. Omit newPassword to reset to the
  // mobile number itself.
  resetCustomerPassword: (mobile: string, newPassword?: string) =>
    api.post('/auth/customers/reset-password/', {
      mobile,
      new_password: newPassword,
    }),
}

export const metersAPI = {
  list: (params?: any) => api.get('/meters/', { params }),
  get: (id: number) => api.get(`/meters/${id}/`),
  create: (data: any) => api.post('/meters/', data),
  update: (id: number, data: any) => api.patch(`/meters/${id}/`, data),
  readings: (params?: any) => api.get('/meters/readings/', { params }),
  createReading: (data: FormData | any) => {
    const isForm = data instanceof FormData
    return api.post('/meters/readings/', data, {
      headers: isForm ? { 'Content-Type': 'multipart/form-data' } : {},
    })
  },
  // Edit an existing reading. Accepts FormData (when a new photo is being
  // attached) or a plain object (photo unchanged) — same dual-mode pattern
  // as createReading above.
  updateReading: (id: number, data: FormData | any) => {
    const isForm = data instanceof FormData
    return api.patch(`/meters/readings/${id}/`, data, {
      headers: isForm ? { 'Content-Type': 'multipart/form-data' } : {},
    })
  },
  deleteReading: (id: number) => api.delete(`/meters/readings/${id}/`),

  // Quick Reading Dashboard — pre-joined meter cards for a project/building
  quickDashboard: (params?: { project_id?: string | number; building_id?: string | number; status?: string }) =>
    api.get('/meters/quick-dashboard/', { params }),

  // Barcode / QR scan-to-select
  lookupBarcode: (code: string) =>
    api.get('/meters/lookup-barcode/', { params: { code } }),
}

export const billingAPI = {
  list: (params?: any) => api.get('/billing/', { params }),
  get: (id: number) => api.get(`/billing/${id}/`),
  create: (data: any) => api.post('/billing/', data),
  update: (id: number, data: any) => api.patch(`/billing/${id}/`, data),
  delete: (id: number) => api.delete(`/billing/${id}/`),
  summary: () => api.get('/billing/summary/'),
  // Dedicated spreadsheet-save endpoint — Super Admin/Admin only (enforced backend-side too).
  quickEdit: (id: number, data: any) => api.patch(`/billing/${id}/quick-edit/`, data),
  // Creates a bill for every active unit in a building with a recorded
  // meter reading for the month, auto-filling rate from the package.
  bulkCreate: (data: { building_id: string | number; billing_month: string }) =>
    api.post('/billing/bulk-create/', data),
  // Fetches the latest reading for a unit, if any, to pre-fill the "Previous Reading" field when creating a new bill.
  latestReading: (unitId: string | number) =>
    api.get(`/billing/latest-reading/${unitId}/`),
}

export const paymentsAPI = {
  list: (params?: any) => api.get('/payments/', { params }),
  get: (id: number) => api.get(`/payments/${id}/`),
  // Manual entry — proof is optional, transaction id is still required
  // (enforced server-side in PaymentSerializer.validate). Always sends
  // multipart/form-data since a proof file may or may not be attached.
  create: (data: FormData) =>
    api.post('/payments/', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Super Admin only (enforced server-side by PaymentEditPermission) —
  // corrects an existing payment's recorded details.
  update: (id: number, data: FormData) =>
    api.patch(`/payments/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Super Admin only — reverses the payment's effect on the bill (if it
  // was Approved) and removes the record.
  remove: (id: number) => api.delete(`/payments/${id}/`),

  pending: (params?: any) => api.get('/payments/pending/', { params }),
  approve: (id: number, remarks?: string) => api.post(`/payments/${id}/approve/`, { remarks }),
  reject:  (id: number, remarks: string) => api.post(`/payments/${id}/reject/`, { remarks }),

  // bkash payment initiation — returns a URL to redirect the user to for completing the payment.
  // Staff-triggered bKash Tokenized Checkout — for a staff member helping
  // a walk-in customer pay via bKash at the counter. Returns a bkash_url
  // to redirect to; bKash redirects back to /billing/{bill_id}?bkash=...
  // once the customer completes checkout on their own phone.
  bkashInitiate: (bill_id: number) => api.post('/payments/bkash/initiate/', { bill_id }),

}

export const paymentChannelsAPI = {
  get: () => api.get('/payments/channel-settings/'),
  update: (data: any) => api.put('/payments/channel-settings/', data),
}

export const reportsAPI = {
  dashboard: () => api.get('/reports/dashboard/'),
  monthlyRevenue: () => api.get('/reports/monthly-revenue/'),
  projectRevenue: () => api.get('/reports/project-revenue/'),
  unpaidBills: () => api.get('/reports/unpaid-bills/'),
  paymentMethods: () => api.get('/reports/payment-methods/'),

  // Triggers a file download (binary response) rather than returning JSON.
  exportBuildingExcel: async (buildingId: number, buildingName: string, month?: string) => {
    const res = await api.get(`/reports/export/building/${buildingId}/`, {
      params: month ? { month } : undefined,
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${buildingName.replace(/\s+/g, '_')}_gas_bill_export.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  // Exports exactly whatever filters are passed — pass the same params the
  // list page is currently querying with (status, search, date range, etc.)
  exportBillsExcel: async (params?: Record<string, any>) => {
    const res = await api.get('/reports/export/bills/', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'billing_export.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  exportPaymentsExcel: async (params?: Record<string, any>) => {
    const res = await api.get('/reports/export/payments/', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'payments_export.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}

export const auditAPI = {
  list: (params?: any) => api.get('/audit/', { params }),
}

export const backupsAPI = {
  list: () => api.get('/settings/backups/'),
  run: () => api.post('/settings/backups/run/'),
  // Triggers a file download (binary response) rather than returning JSON.
  download: async (id: number) => {
    const res = await api.get(`/settings/backups/${id}/download/`, { responseType: 'blob' })
    const disposition = res.headers['content-disposition'] as string | undefined
    const filenameMatch = disposition?.match(/filename="?([^"]+)"?/)
    const filename = filenameMatch?.[1] || `backup_${id}.zip`
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}