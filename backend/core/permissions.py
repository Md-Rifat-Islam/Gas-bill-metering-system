from rest_framework.permissions import BasePermission, SAFE_METHODS

R  = 'super_admin'
A  = 'admin'
BO = 'billing_staff'   # Billing Officer
AC = 'accountant'
V  = 'viewer'          # Read-only staff role — previously had no constant
                       # here at all, meaning no permission class in this
                       # file ever granted Viewer any access, anywhere,
                       # despite core/rbac.py's ROLE_DEFAULT_PERMISSIONS
                       # clearly intending Viewer to have read-only access
                       # to most modules.
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
        return role(request) in (R, A, BO, AC, V)


# ── Module-level RBAC ─────────────────────────────────────────────────────────

class UserModulePermission(BasePermission):
    """
    Super Admin : full CRUD on every user, including other Super Admins/Admins
    Admin       : create new users; edit/delete/manage-permissions only for
                  users they personally created; cannot touch Super Admin
                  or other Admin accounts at all (not even read in the
                  edit form — list view still shows them, per requirement
                  that visibility of *existence* is fine but editing is not)
    Others      : no access — list/detail views 403 immediately
    """
    message = 'Insufficient permissions for User management.'

    def has_permission(self, request, view):
        r = role(request)
        return r in (R, A)

    def has_object_permission(self, request, view, obj):
        r = role(request)
        if r == R:
            return True
        if r == A:
            if request.method in SAFE_METHODS:
                return True   # Admin can view any staff row in the list
            return request.user.can_manage(obj)
        return False


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
        return request.method in SAFE_METHODS and r in (BO, AC, V)


class BuildingPermission(BasePermission):
    """
    Super Admin / Admin : full CRUD
    Billing Officer     : read-only
    Accountant          : read-only
    Viewer              : read-only
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A):
            return True
        return request.method in SAFE_METHODS and r in (BO, AC, V)


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
        return request.method in SAFE_METHODS and r in (BO, AC, V)


class BillPermission(BasePermission):
    """
    Super Admin    : full (create/edit/delete/adjust)
    Admin          : create/generate/view/adjust (with restrictions)
    Billing Officer: create/edit meter readings/adjust (must add reason)
    Accountant     : read-only (+ financial correction approval if allowed)
    Viewer         : read-only
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A, BO):
            return True
        return request.method in SAFE_METHODS and r in (AC, V)


class MeterPermission(BasePermission):
    """
    Super Admin / Admin / Billing Officer : full CRUD
    Accountant / Viewer                    : read-only

    Added because apps/meters/views.py previously used
    IsBillingOfficerOrAbove for its basic list/detail views, which blocks
    Accountant and Viewer from reading meter data at all — contradicting
    rbac.py's METERS default of (True, False, False) for both roles. The
    Quick Reading Dashboard / barcode lookup views (the actual operational
    reading workflow) intentionally stay on IsBillingOfficerOrAbove since
    those are BO-only tools, not general viewing.
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A, BO):
            return True
        return request.method in SAFE_METHODS and r in (AC, V)


class BillDeletePermission(BasePermission):
    """Only Super Admin can delete bills."""
    message = 'Only Super Admin can delete bills.'
    def has_permission(self, request, view):
        return role(request) == R


class BillSpreadsheetEditPermission(BasePermission):
    """
    Inline spreadsheet editing on the Billing page: Super Admin / Admin only
    — deliberately narrower than BillPermission (which also allows Billing
    Officer), per spec. Enforced here rather than only hiding the UI, since
    frontend-only restriction isn't sufficient.
    """
    message = 'Only Super Admin or Admin can edit bills inline from the spreadsheet view.'
    def has_permission(self, request, view):
        return role(request) in (R, A)


class PaymentPermission(BasePermission):
    """
    Super Admin : full + reverse
    Admin       : view + approve offline
    Accountant  : view + verify + mark offline as validated
    Billing Officer / Viewer: view only

    FIX: previously returned True unconditionally for any role in the list
    regardless of HTTP method — contradicting this class's own docstring
    that Billing Officer should be view-only. Only safe today because it's
    applied to a GET-only RetrieveAPIView; fixed properly so it can't
    silently become writable if ever attached to a different view.
    """
    def has_permission(self, request, view):
        r = role(request)
        if r in (R, A, AC):
            return True
        return request.method in SAFE_METHODS and r in (BO, V)


class PaymentWritePermission(BasePermission):
    """Create/update payments: Super Admin, Admin, Accountant only."""
    message = 'Only Super Admin, Admin or Accountant can record payments.'
    def has_permission(self, request, view):
        r = role(request)
        if request.method in SAFE_METHODS:
            return r in (R, A, AC, BO, V)
        return r in (R, A, AC)


class ReportPermission(BasePermission):
    """
    Super Admin / Accountant : all report types
    Admin                    : project + building level
    Billing Officer          : billing work queue / meter summary only
    Viewer                   : read-only
    """
    def has_permission(self, request, view):
        return role(request) in (R, A, AC, BO, V)


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


class UserPermissionManagePermission(BasePermission):
    """
    Controls who may view/edit the granular per-module permission overrides
    for a given target StaffUser (passed as view.kwargs['user_id']).

    Super Admin : any user
    Admin       : only users they created, and never Super Admin/Admin targets
    Others      : never
    """
    message = "You do not have permission to manage this user's permissions."

    def has_permission(self, request, view):
        from apps.authentication.models import StaffUser
        r = role(request)
        if r not in (R, A):
            return False

        target_id = view.kwargs.get('user_id')
        if target_id is None:
            return True  # list/create without a specific target — checked elsewhere

        try:
            target = StaffUser.objects.select_related('role').get(id=target_id)
        except StaffUser.DoesNotExist:
            return False

        return request.user.can_manage(target) if r == A else True


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