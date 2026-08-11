import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Customer {
  id: number
  name: string
  mobile: string
  email?: string
  is_active: boolean
}

export interface PortalUnit {
  id: number
  unit_no: string
  floor_no: number
  building_name: string
  project_name: string
}

interface CustomerAuthState {
  customer: Customer | null
  access_token: string | null
  refresh_token: string | null
  isAuthenticated: boolean

  // The currently-selected flat for customers with more than one unit
  // registered under their mobile number. Null means "not chosen yet" —
  // the portal should show the unit picker rather than any bill data.
  // For a customer with exactly one unit, the picker auto-selects it and
  // this is never surfaced to them.
  selectedUnit: PortalUnit | null

  setAuth: (customer: Customer, access: string, refresh: string) => void
  clearAuth: () => void
  setCustomer: (c: Customer) => void
  setSelectedUnit: (unit: PortalUnit | null) => void
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set) => ({
      customer: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,
      selectedUnit: null,
      setAuth: (customer, access_token, refresh_token) => {
        localStorage.setItem('customer_access_token', access_token)
        localStorage.setItem('customer_refresh_token', refresh_token)
        // A fresh login always clears any previously-selected unit — it
        // may have belonged to a different customer on a shared device,
        // and even for the same customer we want the picker (or
        // auto-select) to re-run against the current unit list.
        set({ customer, access_token, refresh_token, isAuthenticated: true, selectedUnit: null })
      },
      clearAuth: () => {
        localStorage.removeItem('customer_access_token')
        localStorage.removeItem('customer_refresh_token')
        set({ customer: null, access_token: null, refresh_token: null, isAuthenticated: false, selectedUnit: null })
      },
      setCustomer: (customer) => set({ customer }),
      setSelectedUnit: (unit) => set({ selectedUnit: unit }),
    }),
    {
      name: 'customer-auth-storage',
      partialize: (s) => ({
        customer: s.customer,
        isAuthenticated: s.isAuthenticated,
        selectedUnit: s.selectedUnit,
      }),
    }
  )
)