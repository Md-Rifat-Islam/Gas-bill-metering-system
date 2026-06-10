from rest_framework.permissions import BasePermission


ROLE_SUPER_ADMIN   = 'super_admin'
ROLE_ADMIN         = 'admin'
ROLE_BILLING_STAFF = 'billing_staff'
ROLE_ACCOUNTANT    = 'accountant'
ROLE_VIEWER        = 'viewer'


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role_name == ROLE_SUPER_ADMIN)


class IsAdminOrAbove(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role_name in (ROLE_SUPER_ADMIN, ROLE_ADMIN))


class IsBillingStaffOrAbove(BasePermission):
    allowed = (ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_BILLING_STAFF)

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role_name in self.allowed)


class IsAccountantOrAbove(BasePermission):
    allowed = (ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_ACCOUNTANT)

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role_name in self.allowed)


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in ('GET', 'HEAD', 'OPTIONS')
