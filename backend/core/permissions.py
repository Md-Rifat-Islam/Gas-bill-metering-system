from rest_framework.permissions import BasePermission, SAFE_METHODS

R  = 'super_admin'
A  = 'admin'
BO = 'billing_staff'   # Billing Officer
AC = 'accountant'
CU = 'customer'        # Customer / end-user (CustomerUser, not StaffUser)


def role(request):
    """Return role_name string or None."""
    u = request.user
    if not u or not u.is_authenticated:
        return None
    return getattr(u, 'role_name', None)


# ── Generic helpers ───────────────────────────────────────────────────────────

class IsSuperAdmin(BasePermission):
    message = 'Super Admin access required.'
    def has_permission(self, request, view):
        return role(request) == R


class IsAdminOrAbove(BasePermission):
    message = 'Admin access required.'
    def has_permission(self, request, view):
        return role(request) in (R, A)


class IsBillingOfficerOrAbove(BasePermission):
    message = 'Billing Officer access required.'
    def has_permission(self, request, view):
        return role(request) in (R, A, BO)


class IsAccountantOrAbove(BasePermission):
    message = 'Accountant access required.'
    def has_permission(self, request, view):
        return role(request) in (R, A, AC)


class IsAnyStaff(BasePermission):
    """Any authenticated StaffUser (not customer)."""
    message = 'Staff access required.'
    def has_permission(self, request, view):
        return role(request) in (R, A, BO, AC)


# ── Module-level RBAC ─────────────────────────────────────────────────────────

class UserModulePermission(BasePermission):
    """
    Super Admin : full CRUD
    Admin       : create / edit / activate / deactivate  (no role assignment)
    Others      : read-only
    """
    message = 'Insufficient permissions for User management.'

    def has_permission(self, request, view):
        r = role(request)
        if r == R:
            return True
        if r == A:
            return True          # write allowed; role-assign blocked in serializer
        return request.method in SAFE_METHODS and r in (BO, AC)


class RBACPermission(BasePermission):
    """Only Super Admin can manage roles & permissions."""
    message = 'Only Super Admin can manage roles and permissions.'
    def has_permission(self, request, view):
        return role(request) == R


class ProjectPermission(BasePermission):
    """
    Super Admin / Admin : full CRUD
    Others              : read-only
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A):
            return True
        return request.method in SAFE_METHODS and r in (BO, AC)


class BuildingPermission(BasePermission):
    """
    Super Admin / Admin : full CRUD
    Billing Officer     : read-only
    Accountant          : read-only
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A):
            return True
        return request.method in SAFE_METHODS and r in (BO, AC)


class PackagePermission(BasePermission):
    """
    Super Admin : full CRUD + price history
    Admin       : assign only (no price editing)
    Others      : read-only
    """
    def has_permission(self, request, view):
        r = role(request)
        if r == R:
            return True
        if r == A:
            # Admin can read + assign but not create/delete packages
            return request.method in SAFE_METHODS
        return request.method in SAFE_METHODS and r in (BO, AC)


class BillPermission(BasePermission):
    """
    Super Admin    : full (create/edit/delete/adjust)
    Admin          : create/generate/view/adjust (with restrictions)
    Billing Officer: create/edit meter readings/adjust (must add reason)
    Accountant     : read-only (+ financial correction approval if allowed)
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A, BO):
            return True
        return request.method in SAFE_METHODS and r == AC


class BillDeletePermission(BasePermission):
    """Only Super Admin can delete bills."""
    message = 'Only Super Admin can delete bills.'
    def has_permission(self, request, view):
        return role(request) == R


class PaymentPermission(BasePermission):
    """
    Super Admin : full + reverse
    Admin       : view + approve offline
    Accountant  : view + verify + mark offline as validated
    Billing Officer: view only
    """
    def has_permission(self, request, view):
        r = role(request)
        return r in (R, A, AC, BO)


class PaymentWritePermission(BasePermission):
    """Create/update payments: Super Admin, Admin, Accountant only."""
    message = 'Only Super Admin, Admin or Accountant can record payments.'
    def has_permission(self, request, view):
        r = role(request)
        if request.method in SAFE_METHODS:
            return r in (R, A, AC, BO)
        return r in (R, A, AC)


class ReportPermission(BasePermission):
    """
    Super Admin / Accountant : all report types
    Admin                    : project + building level
    Billing Officer          : billing work queue / meter summary only
    """
    def has_permission(self, request, view):
        return role(request) in (R, A, AC, BO)


class FinancialReportPermission(BasePermission):
    """Revenue / financial reports: Super Admin + Accountant only."""
    message = 'Financial reports require Accountant or Super Admin access.'
    def has_permission(self, request, view):
        return role(request) in (R, AC)


class AuditLogPermission(BasePermission):
    """
    Super Admin : full access
    Admin       : restricted (no full view)
    Others      : no access
    """
    message = 'Audit log access restricted.'
    def has_permission(self, request, view):
        r = role(request)
        return r == R   # Only Super Admin gets full audit; extend for Admin if needed


class SystemSettingsPermission(BasePermission):
    """Only Super Admin."""
    message = 'System settings require Super Admin.'
    def has_permission(self, request, view):
        return role(request) == R


# ── Dashboard scoping helper (used in views) ──────────────────────────────────

DASHBOARD_MODULES = {
    R:  ['overview', 'projects', 'financial', 'audit', 'users', 'system'],
    A:  ['overview', 'projects', 'billing',   'payments'],
    BO: ['billing_queue', 'pending_bills', 'meter_summary'],
    AC: ['revenue', 'collection', 'dues', 'payments'],
}

def dashboard_scope(request):
    r = role(request)
    return DASHBOARD_MODULES.get(r, [])


# ── Customer Portal ────────────────────────────────────────────────────────────

class IsCustomer(BasePermission):
    """For portal endpoints — request.user is a CustomerUser instance."""
    message = 'Customer login required.'

    def has_permission(self, request, view):
        from apps.authentication.models import CustomerUser
        return isinstance(request.user, CustomerUser) and getattr(request.user, 'is_active', False)
