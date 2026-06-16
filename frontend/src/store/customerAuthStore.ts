import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Customer {
  id: number
  name: string
  mobile: string
  email?: string
  is_active: boolean
}

interface CustomerAuthState {
  customer: Customer | null
  access_token: string | null
  refresh_token: string | null
  isAuthenticated: boolean
  setAuth: (customer: Customer, access: string, refresh: string) => void
  clearAuth: () => void
  setCustomer: (c: Customer) => void
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set) => ({
      customer: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,

      setAuth: (customer, access_token, refresh_token) => {
        localStorage.setItem('customer_access_token', access_token)
        localStorage.setItem('customer_refresh_token', refresh_token)
        set({ customer, access_token, refresh_token, isAuthenticated: true })
      },

      clearAuth: () => {
        localStorage.removeItem('customer_access_token')
        localStorage.removeItem('customer_refresh_token')
        set({ customer: null, access_token: null, refresh_token: null, isAuthenticated: false })
      },

      setCustomer: (customer) => set({ customer }),
    }),
    {
      name: 'customer-auth-storage',
      partialize: (s) => ({ customer: s.customer, isAuthenticated: s.isAuthenticated }),
    }
  )
)
