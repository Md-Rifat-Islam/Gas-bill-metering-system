from apps.authentication.models import Role, PermissionModule

ROLE_DEFAULT_PERMISSIONS = {
    Role.SUPER_ADMIN: {
        PermissionModule.DASHBOARD:          (True, False, False),
        PermissionModule.PROJECTS:           (True, True, True),
        PermissionModule.PACKAGES:           (True, True, True),
        PermissionModule.BUILDINGS:          (True, True, True),
        PermissionModule.UNITS:              (True, True, True),
        PermissionModule.METERS:             (True, True, True),
        PermissionModule.QUICK_READING:      (True, True, False),
        PermissionModule.BILLING:            (True, True, True),
        PermissionModule.PAYMENTS:           (True, True, True),
        PermissionModule.REPORTS:            (True, True, True),
        # Reproduces the old hard-coded FinancialReportPermission default
        # (Super Admin + Accountant only). Now override-able per user.
        PermissionModule.FINANCIAL_REPORTS:  (True, False, False),
        PermissionModule.STAFF:              (True, True, True),
        PermissionModule.AUDIT:              (True, True, True),
    },
    Role.ADMIN: {
        PermissionModule.DASHBOARD:          (True, False, False),
        PermissionModule.PROJECTS:           (True, True, False),
        # Read-only — reproduces the old hard-coded PackagePermission
        # behavior (Admin could view/assign packages but not edit them).
        PermissionModule.PACKAGES:           (True, False, False),
        PermissionModule.BUILDINGS:          (True, True, False),
        PermissionModule.UNITS:              (True, True, False),
        PermissionModule.METERS:             (True, True, False),
        PermissionModule.QUICK_READING:      (True, True, False),
        PermissionModule.BILLING:            (True, True, False),
        PermissionModule.PAYMENTS:           (True, True, False),
        PermissionModule.REPORTS:            (True, True, False),
        # Admin did NOT have financial-report access before — unchanged by
        # default. A Super Admin can now override this per user if wanted.
        PermissionModule.FINANCIAL_REPORTS:  (False, False, False),
        PermissionModule.STAFF:              (True, True, False),
        PermissionModule.AUDIT:              (False, False, False),
    },
    Role.BILLING_STAFF: {
        PermissionModule.DASHBOARD:          (True, False, False),
        PermissionModule.PROJECTS:           (False, False, False),
        PermissionModule.PACKAGES:           (False, False, False),
        PermissionModule.BUILDINGS:          (False, False, False),
        PermissionModule.UNITS:              (False, False, False),
        PermissionModule.METERS:             (True, True, False),
        PermissionModule.QUICK_READING:      (True, True, False),
        PermissionModule.BILLING:            (False, False, False),
        PermissionModule.PAYMENTS:           (False, False, False),
        PermissionModule.REPORTS:            (False, False, False),
        PermissionModule.FINANCIAL_REPORTS:  (False, False, False),
        PermissionModule.STAFF:              (False, False, False),
        PermissionModule.AUDIT:              (False, False, False),
    },
    Role.ACCOUNTANT: {
        PermissionModule.DASHBOARD:          (True, False, False),
        PermissionModule.PROJECTS:           (False, False, False),
        PermissionModule.PACKAGES:           (False, False, False),
        PermissionModule.BUILDINGS:          (False, False, False),
        PermissionModule.UNITS:              (False, False, False),
        PermissionModule.METERS:             (False, False, False),
        PermissionModule.QUICK_READING:      (False, False, False),
        PermissionModule.BILLING:            (True, True, False),
        PermissionModule.PAYMENTS:           (True, True, False),
        PermissionModule.REPORTS:            (True, True, False),
        # Reproduces the old hard-coded FinancialReportPermission default.
        PermissionModule.FINANCIAL_REPORTS:  (True, False, False),
        PermissionModule.STAFF:              (False, False, False),
        PermissionModule.AUDIT:              (False, False, False),
    },
    Role.VIEWER: {
        PermissionModule.DASHBOARD:          (True, False, False),
        PermissionModule.PROJECTS:           (True, False, False),
        PermissionModule.PACKAGES:           (True, False, False),
        PermissionModule.BUILDINGS:          (True, False, False),
        PermissionModule.UNITS:              (True, False, False),
        PermissionModule.METERS:             (True, False, False),
        PermissionModule.QUICK_READING:      (False, False, False),
        PermissionModule.BILLING:            (True, False, False),
        PermissionModule.PAYMENTS:           (False, False, False),
        PermissionModule.REPORTS:            (True, False, False),
        PermissionModule.FINANCIAL_REPORTS:  (False, False, False),
        PermissionModule.STAFF:              (False, False, False),
        PermissionModule.AUDIT:              (False, False, False),
    },
}


def get_role_permissions(role_name):
    return ROLE_DEFAULT_PERMISSIONS.get(role_name, {})