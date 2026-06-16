import { useAuthStore } from '@/store/authStore'

type Role = 'super_admin' | 'admin' | 'billing_staff' | 'accountant' | 'viewer' | null

export function usePermissions() {
  const { user } = useAuthStore()
  const role = (user?.role?.role_name ?? null) as Role

  const SA = role === 'super_admin'
  const AD = role === 'admin'
  const BO = role === 'billing_staff'
  const AC = role === 'accountant'

  const can = {
    // ── Users / Staff ─────────────────────────────────────────────────────
    viewUsers:    SA || AD,
    manageUsers:  SA || AD,       // Admin: create/edit/activate only (no role assign)
    deleteStaff:  SA,             // Only Super Admin
    manageRBAC:   SA,             // Only Super Admin

    // ── Projects ──────────────────────────────────────────────────────────
    viewProjects:  SA || AD || BO || AC,
    createProject: SA,            // Only SA can create
    editProject:   SA || AD,
    deleteProject: SA,

    // ── Buildings / Units ─────────────────────────────────────────────────
    viewBuildings:   SA || AD || BO || AC,
    editBuildings:   SA || AD,
    deleteBuildings: SA,

    // ── Packages ──────────────────────────────────────────────────────────
    viewPackages:  SA || AD || BO || AC,
    editPackages:  SA,            // Only SA; Admin assigns only
    assignPackages:SA || AD,

    // ── Meters ────────────────────────────────────────────────────────────
    viewMeters:    SA || AD || BO || AC,
    editMeters:    SA || AD || BO,
    recordReading: SA || AD || BO,

    // ── Bills ─────────────────────────────────────────────────────────────
    viewBills:     SA || AD || BO || AC,
    createBill:    SA || AD || BO,
    editBill:      SA || AD || BO,
    deleteBill:    SA,            // Only Super Admin
    adjustBill:    SA || AD || BO,

    // ── Payments ──────────────────────────────────────────────────────────
    viewPayments:    SA || AD || BO || AC,
    recordPayment:   SA || AC,    // SA + Accountant only
    verifyPayment:   SA || AC,
    reversePayment:  SA,          // Only SA

    // ── Reports ───────────────────────────────────────────────────────────
    viewReports:          SA || AD || BO || AC,
    viewFinancialReports: SA || AC,
    viewProjectReports:   SA || AD || AC,
    viewBillingQueue:     SA || AD || BO,

    // ── Audit ─────────────────────────────────────────────────────────────
    viewAuditLogs: SA,            // Only Super Admin

    // ── History / full data edits ─────────────────────────────────────────
    editPayments:   SA,           // SA can edit/reverse any payment
    viewAllHistory: SA,

    // ── System ────────────────────────────────────────────────────────────
    viewSystemSettings: SA,
  }

  // Dashboard modules visible per role
  const dashboardModules = (): string[] => {
    if (SA) return ['overview', 'financial', 'audit', 'system', 'users']
    if (AD) return ['overview', 'projects', 'billing', 'payments', 'staff']
    if (BO) return ['billing_queue', 'pending_bills', 'meter_summary']
    if (AC) return ['revenue', 'collection', 'dues', 'payments']
    return []
  }

  return { role, can, dashboardModules }
}