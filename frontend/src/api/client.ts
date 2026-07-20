import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: '/api/v1',
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
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }
    if (error.response?.status !== 401) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {})[0] ||
        'An error occurred'
      toast.error(Array.isArray(msg) ? msg[0] : String(msg))
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
  // Manual entry always requires proof, so this always sends multipart/form-data.
  create: (data: FormData) =>
    api.post('/payments/', data, { headers: { 'Content-Type': 'multipart/form-data' } }),

  pending: (params?: any) => api.get('/payments/pending/', { params }),
  approve: (id: number, remarks?: string) => api.post(`/payments/${id}/approve/`, { remarks }),
  reject:  (id: number, remarks: string) => api.post(`/payments/${id}/reject/`, { remarks }),
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