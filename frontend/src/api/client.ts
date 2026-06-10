import axios from 'axios'
import toast from 'react-hot-toast'

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
        localStorage.clear()
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
  roles: () => api.get('/auth/roles/'),
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
}

export const unitsAPI = {
  list: (params?: any) => api.get('/units/', { params }),
  get: (id: number) => api.get(`/units/${id}/`),
  create: (data: any) => api.post('/units/', data),
  update: (id: number, data: any) => api.patch(`/units/${id}/`, data),
}

export const metersAPI = {
  list: (params?: any) => api.get('/meters/', { params }),
  create: (data: any) => api.post('/meters/', data),
  readings: (params?: any) => api.get('/meters/readings/', { params }),
  createReading: (data: any) => api.post('/meters/readings/', data),
}

export const billingAPI = {
  list: (params?: any) => api.get('/billing/', { params }),
  get: (id: number) => api.get(`/billing/${id}/`),
  create: (data: any) => api.post('/billing/', data),
  update: (id: number, data: any) => api.patch(`/billing/${id}/`, data),
  summary: () => api.get('/billing/summary/'),
}

export const paymentsAPI = {
  list: (params?: any) => api.get('/payments/', { params }),
  create: (data: any) => api.post('/payments/', data),
}

export const reportsAPI = {
  dashboard: () => api.get('/reports/dashboard/'),
  monthlyRevenue: () => api.get('/reports/monthly-revenue/'),
  projectRevenue: () => api.get('/reports/project-revenue/'),
  unpaidBills: () => api.get('/reports/unpaid-bills/'),
  paymentMethods: () => api.get('/reports/payment-methods/'),
}

export const auditAPI = {
  list: (params?: any) => api.get('/audit/', { params }),
}
