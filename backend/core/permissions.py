from rest_framework.permissions import BasePermission, SAFE_METHODS

R  = 'super_admin'
A  = 'admin'
BO = 'billing_staff'   # Billing Officer
AC = 'accountant'
V  = 'viewer'          # Read-only staff role
CU = 'customer'        # Customer / end-user (CustomerUser, not StaffUser)


def role(request):
    """Return role_name string or None."""
    u = request.user
    if not u or not u.is_authenticated:
        return None
    return getattr(u, 'role_name', None)


def _role_default(role_name, module):
    """(can_view, can_edit, can_delete) for a role on a module, from rbac.py."""
    from core.rbac import ROLE_DEFAULT_PERMISSIONS
    defaults = ROLE_DEFAULT_PERMISSIONS.get(role_name, {})
    return defaults.get(module, (False, False, False))


def _module_override(request, module):
    """
    Returns (can_view, can_edit, can_delete) from a UserPermission override
    row for request.user on `module`, or None if no override exists —
    caller falls back to the role default in that case.

    The override itself is only ever created/changed via
    PUT /auth/staff/<user_id>/permissions/, gated by
    UserPermissionManagePermission + StaffUser.can_manage(): a Super Admin
    can grant/revoke it for any user; an Admin only for users they
    personally created (never for another Admin or a Super Admin). This
    function just reads whatever was stored — the hierarchy is enforced
    upstream, at write time.
    """
    from apps.authentication.models import UserPermission
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'id', None):
        return None
    override = UserPermission.objects.filter(user_id=user.id, module=module).first()
    if override is None:
        return None
    return (override.can_view, override.can_edit, override.can_delete)


class ModuleOverridePermission(BasePermission):
    """
    Base class: role-default access on a module, individually overridable
    per-user via the Staff edit form's Role & Permission tab.

    Subclasses set `module` (a PermissionModule value / matching string).
    Resolution order, every request:
      1. Look up a UserPermission override for this exact user + module.
      2. If one exists, it REPLACES the role default entirely — view, edit,
         and delete all come from the override row, not a role lookup.
      3. If none exists, fall back to the role default from rbac.py.

    Method -> capability mapping:
      GET/HEAD/OPTIONS -> can_view
      POST/PUT/PATCH   -> can_edit
      DELETE           -> can_delete
    """
    module = None  # set by subclasses

    def _resolve(self, request):
        can_view, can_edit, can_delete = _role_default(role(request), self.module)
        override = _module_override(request, self.module)
        if override is not None:
            can_view, can_edit, can_delete = override
        return can_view, can_edit, can_delete

    def has_permission(self, request, view):
        can_view, can_edit, can_delete = self._resolve(request)
        if request.method in SAFE_METHODS:
            return can_view
        if request.method == 'DELETE':
            return can_delete
        return can_edit


# ── Generic role-only helpers (not module/override based) ────────────────────

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


# ── Module-level RBAC, override-aware ─────────────────────────────────────────

class DashboardPermission(ModuleOverridePermission):
    """
    Gates the main Dashboard view/summary endpoint. Every staff role sees
    the dashboard by default (see rbac.py) — this exists so a specific
    user's dashboard access can still be revoked individually if needed,
    same override mechanism as every other module.

    NOTE: nothing currently applies this to a view. Attach it to whatever
    endpoint backs the dashboard landing page (e.g. reports/views.py's
    dashboard summary endpoint) for it to have any effect.
    """
    module = 'dashboard'


class ProjectPermission(ModuleOverridePermission):
    module = 'projects'


class BuildingPermission(ModuleOverridePermission):
    """Gates the Buildings app. Units have their own module — see UnitPermission."""
    module = 'buildings'


class UnitPermission(ModuleOverridePermission):
    """
    Gates the Units app (apps/units/views.py). Distinct module from
    Buildings so a Super Admin can grant/restrict Units access
    independently of Buildings access for a specific user.
    """
    module = 'units'


class PackagePermission(ModuleOverridePermission):
    """
    Gates the Packages app (pricing packages under Projects).

    MIGRATION NOTE: this used to be a hard-coded, non-override-able
    BasePermission ("Packages has no dedicated PermissionModule entry ...
    stays role-only"). It has now been promoted to a full module with the
    same override mechanism as everything else, backed by a real
    PermissionModule.PACKAGES entry.

    The role defaults in rbac.py were set to reproduce the exact previous
    behavior (Super Admin: full CRUD; Admin/Billing Officer/Accountant/
    Viewer: read-only), so nothing changes for anyone until a Super Admin
    (or an Admin, for users they created) explicitly sets a per-user
    override on this module.
    """
    module = 'packages'


class MeterPermission(ModuleOverridePermission):
    """Gates general meter CRUD/list/detail. Quick Reading Dashboard and
    barcode lookup use QuickReadingPermission instead — see below."""
    module = 'meters'


class QuickReadingPermission(ModuleOverridePermission):
    """
    Gates the Quick Reading Dashboard and barcode/QR lookup endpoints —
    intentionally separate from MeterPermission so access to the fast
    bulk-reading workflow can be granted/restricted per user independently
    of general Meters access.
    """
    module = 'quick_reading'


class BillPermission(ModuleOverridePermission):
    """Gates general bill list/create/detail/update. Deletion uses
    BillDeletePermission (same module, delete-only check) and inline
    spreadsheet editing uses BillSpreadsheetEditPermission (unchanged,
    intentionally narrower and NOT override-able — see its own docstring)."""
    module = 'billing'


class BillDeletePermission(ModuleOverridePermission):
    """
    Bill deletion: role default is Super Admin only (see rbac.py), but can
    be granted to a specific user via the Billing module's Delete override,
    same mechanism as everywhere else.
    """
    message = 'You do not have permission to delete bills.'
    module = 'billing'

    def has_permission(self, request, view):
        _, _, can_delete = self._resolve(request)
        return can_delete


class BillSpreadsheetEditPermission(BasePermission):
    """
    Inline spreadsheet editing on the Billing page: Super Admin / Admin
    only, deliberately narrower than BillPermission (which also allows
    Billing Officer) — a distinct feature flag, NOT the general Billing
    module override. Left exactly as before.
    """
    message = 'Only Super Admin or Admin can edit bills inline from the spreadsheet view.'
    def has_permission(self, request, view):
        return role(request) in (R, A)


class PaymentPermission(ModuleOverridePermission):
    """Gates single-payment retrieval (GET only in practice)."""
    module = 'payments'


class PaymentWritePermission(ModuleOverridePermission):
    """
    Gates the Payments list/create endpoint plus approve/reject actions
    (all POST). Approve/reject and "record a new payment" are not
    distinguished at the permission-class level — both are can_edit on the
    'payments' module. Granting a user Payments -> Edit lets them do both;
    there's currently no finer split than that.
    """
    module = 'payments'


class ReportPermission(ModuleOverridePermission):
    """
    General reports access (dashboards, building/unit breakdowns, unpaid
    bills list, exports). Financial revenue/collection figures are gated
    separately and NOT override-able — see FinancialReportPermission.
    """
    module = 'reports'


class FinancialReportPermission(ModuleOverridePermission):
    """
    Revenue / financial reports (monthly-revenue, payment-methods, and any
    other endpoint exposing money totals).

    MIGRATION NOTE: this used to be hard-locked, role-only, explicitly NOT
    override-able ("financial totals are treated as a stricter, separate
    concern from general Reports access, by design"). A Super Admin can now
    grant financial-report access to any individual user via that user's
    Role & Permission tab (Admin can do the same, but only for users they
    personally created) — same override mechanism as every other module,
    backed by a dedicated PermissionModule.FINANCIAL_REPORTS entry so it
    stays distinct from the general 'reports' module.

    Role defaults in rbac.py reproduce the exact previous behavior (Super
    Admin + Accountant: view; everyone else: no access), so nothing changes
    for anyone until a Super Admin explicitly sets a per-user override here.
    """
    message = 'Financial reports require Accountant or Super Admin access.'
    module = 'financial_reports'


# ── Hard-locked (no per-user override, ever) ──────────────────────────────────

class UserModulePermission(BasePermission):
    """
    Staff Management. Hard-locked: Super Admin (full) / Admin (only users
    they created) — NOT override-able by design, regardless of any
    UserPermission row that might exist for the 'staff' module. A user's
    own Role determines Staff access, full stop.
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
                return True
            return request.user.can_manage(obj)
        return False


class RBACPermission(BasePermission):
    """Only Super Admin can manage roles & permissions. Hard-locked."""
    message = 'Only Super Admin can manage roles and permissions.'
    def has_permission(self, request, view):
        return role(request) == R


class AuditLogPermission(BasePermission):
    """
    Audit Logs. Hard-locked: Super Admin only — NOT override-able by
    design, regardless of any UserPermission row for the 'audit' module.
    """
    message = 'Audit log access restricted.'
    def has_permission(self, request, view):
        return role(request) == R


class SystemSettingsPermission(BasePermission):
    """Only Super Admin. Hard-locked, not part of the module override system."""
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
            return True

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