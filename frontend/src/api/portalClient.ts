import axios from 'axios'
import toast from 'react-hot-toast'

const portalApi = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('customer_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

portalApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('customer_refresh_token')
        if (!refresh) throw new Error('no refresh token')
        const { data } = await axios.post('/api/v1/auth/token/refresh/', { refresh })
        localStorage.setItem('customer_access_token', data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return portalApi(original)
      } catch {
        localStorage.removeItem('customer_access_token')
        localStorage.removeItem('customer_refresh_token')
        window.location.href = '/portal/login'
        return Promise.reject(error)
      }
    }
    if (error.response?.status !== 401) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.detail ||
        'Something went wrong'
      toast.error(Array.isArray(msg) ? msg[0] : String(msg))
    }
    return Promise.reject(error)
  }
)

export default portalApi

export const portalAuthAPI = {
  requestOTP: (mobile: string) => axios.post('/api/v1/auth/otp/request/', { mobile }),
  verifyOTP:  (mobile: string, otp_code: string) =>
    axios.post('/api/v1/auth/otp/verify/', { mobile, otp_code }),
}

export const portalAPI = {
  me:           () => portalApi.get('/portal/me/'),
  updateMe:     (data: any) => portalApi.patch('/portal/me/', data),
  dashboard:    () => portalApi.get('/portal/dashboard/'),
  bills:        (params?: any) => portalApi.get('/portal/bills/', { params }),
  bill:         (id: number) => portalApi.get(`/portal/bills/${id}/`),
  payments:     (params?: any) => portalApi.get('/portal/payments/', { params }),
  payInitiate:  (bill_id: number) => portalApi.post('/portal/payments/initiate/', { bill_id }),

  // Download invoice as a blob (auth header required, so can't use a plain <a href>)
  downloadInvoice: async (billId: number, billNumber: string) => {
    const res = await portalApi.get(`/portal/bills/${billId}/invoice/`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${billNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}
