from apps.authentication.models import Role, PermissionModule

ROLE_DEFAULT_PERMISSIONS = {
    Role.SUPER_ADMIN: {
        PermissionModule.PROJECTS:  (True, True, True),
        PermissionModule.BUILDINGS: (True, True, True),
        PermissionModule.UNITS:     (True, True, True),
        PermissionModule.METERS:    (True, True, True),
        PermissionModule.BILLING:   (True, True, True),
        PermissionModule.PAYMENTS:  (True, True, True),
        PermissionModule.REPORTS:   (True, True, True),
        PermissionModule.STAFF:     (True, True, True),
        PermissionModule.AUDIT:     (True, True, True),
    },

    Role.ADMIN: {
        PermissionModule.PROJECTS:  (True, True, False),
        PermissionModule.BUILDINGS: (True, True, False),
        PermissionModule.UNITS:     (True, True, False),
        PermissionModule.METERS:    (True, True, False),
        PermissionModule.BILLING:   (True, True, False),
        PermissionModule.PAYMENTS:  (True, True,False),
        PermissionModule.REPORTS:   (True, True,False),
        PermissionModule.STAFF:     (True, True,False),
        PermissionModule.AUDIT:     (False,False,False),
    },

    Role.BILLING_STAFF: {
        PermissionModule.PROJECTS:  (True,False,False),
        PermissionModule.BUILDINGS: (True,False,False),
        PermissionModule.UNITS:     (True,False,False),
        PermissionModule.METERS:    (True,True,False),
        PermissionModule.BILLING:   (True,True,False),
        PermissionModule.PAYMENTS:  (True,False,False),
        PermissionModule.REPORTS:   (True,False,False),
        PermissionModule.STAFF:     (False,False,False),
        PermissionModule.AUDIT:     (False,False,False),
    },

    Role.ACCOUNTANT: {
        PermissionModule.PROJECTS:  (True,False,False),
        PermissionModule.BUILDINGS: (True,False,False),
        PermissionModule.UNITS:     (True,False,False),
        PermissionModule.METERS:    (True,False,False),
        PermissionModule.BILLING:   (True,False,False),
        PermissionModule.PAYMENTS:  (True,True,False),
        PermissionModule.REPORTS:   (True,True,False),
        PermissionModule.STAFF:     (False,False,False),
        PermissionModule.AUDIT:     (False,False,False),
    },

    Role.VIEWER: {
        PermissionModule.PROJECTS:  (True,False,False),
        PermissionModule.BUILDINGS: (True,False,False),
        PermissionModule.UNITS:     (True,False,False),
        PermissionModule.METERS:    (True,False,False),
        PermissionModule.BILLING:   (True,False,False),
        PermissionModule.PAYMENTS:  (True,False,False),
        PermissionModule.REPORTS:   (True,False,False),
        PermissionModule.STAFF:     (False,False,False),
        PermissionModule.AUDIT:     (False,False,False),
    },
}

def get_role_permissions(role_name):
    return ROLE_DEFAULT_PERMISSIONS.get(role_name, {})