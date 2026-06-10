// ── Auth ─────────────────────────────────────────────────────────────────────
export interface Role {
  id: number
  role_name: 'super_admin' | 'admin' | 'billing_staff' | 'accountant' | 'viewer'
}

export interface StaffUser {
  id: number
  name: string
  email: string
  mobile?: string
  role?: Role
  is_active: boolean
  created_at: string
}

export interface CustomerUser {
  id: number
  name: string
  mobile: string
  is_active: boolean
  created_at: string
}

// ── Projects & Packages ───────────────────────────────────────────────────────
export interface Package {
  id: number
  name: string
  unit_type: 'm3' | 'kg'
  per_unit_cost: string
  description: string
  is_active: boolean
}

export interface Project {
  id: number
  name: string
  address: string
  default_package?: Package
  service_charge: string
  is_active: boolean
  building_count?: number
  created_at: string
}

// ── Buildings ─────────────────────────────────────────────────────────────────
export interface Building {
  id: number
  project_id: number
  project_name: string
  name: string
  code: string
  total_floors: number
  is_active: boolean
  unit_count?: number
}

// ── Units ─────────────────────────────────────────────────────────────────────
export interface Allottee {
  id: number
  name: string
  email: string
  nid: string
}

export interface Unit {
  id: number
  building_id: number
  building_name: string
  project_name: string
  floor_no: number
  unit_no: string
  meter_no?: string
  mobile_number?: string
  package_id?: number
  package_name?: string
  status: 'Active' | 'Inactive'
  allottee?: Allottee
  created_at: string
}

// ── Meters ────────────────────────────────────────────────────────────────────
export interface Meter {
  id: number
  unit_id: number
  unit_no: string
  building_name: string
  meter_no: string
  meter_type: string
  created_at: string
}

export interface MeterReading {
  id: number
  meter: number
  meter_no: string
  previous_reading: string
  current_reading: string
  usage: string
  reading_date: string
  notes: string
  recorded_by: number
  created_at: string
}

// ── Billing ───────────────────────────────────────────────────────────────────
export type BillStatus = 'Unpaid' | 'Partial' | 'Paid'

export interface Bill {
  id: number
  bill_number: string
  unit_no: string
  building_name: string
  project_name: string
  billing_month: string
  billing_month_display: string
  allottee_name: string
  allottee_mobile: string

  previous_reading: string
  current_reading: string
  total_usage_m3: string
  total_usage_kg?: string
  conversion_factor?: string

  unit_price: string
  base_amount: string
  service_charge: string
  extra_charge: string
  discount: string
  late_fee: string
  is_adjusted: boolean
  adjustment_reason: string

  total_amount: string
  paid_amount: string
  due_amount: string
  status: BillStatus

  created_by_name: string
  created_at: string
  updated_at: string
}

// ── Payments ──────────────────────────────────────────────────────────────────
export type PaymentMethod = 'Cash' | 'Bank' | 'bKash' | 'Card' | 'SSLCommerz'

export interface Payment {
  id: number
  bill: number
  bill_number: string
  paid_amount: string
  payment_method: PaymentMethod
  transaction_id?: string
  payment_date: string
  received_by_name: string
  notes: string
  created_at: string
}

// ── Reports ───────────────────────────────────────────────────────────────────
export interface DashboardStats {
  projects: number
  buildings: number
  units: number
  total_bills: number
  total_revenue: string
  total_due: string
  unpaid_bills: number
  partial_bills: number
  paid_bills: number
}

export interface MonthlyRevenue {
  month: string
  total_billed: string
  total_collected: string
  total_due: string
  bill_count: number
}

export interface ProjectRevenue {
  'project__id': number
  'project__name': string
  total_billed: string
  total_collected: string
  total_due: string
  bill_count: number
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: number
  table_name: string
  record_id: number
  changed_by_name: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
