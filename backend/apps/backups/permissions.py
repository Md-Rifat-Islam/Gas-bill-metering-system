from rest_framework.permissions import BasePermission

from core.permissions import role, R


class BackupPermission(BasePermission):
    """
    A full backup contains everything — every bill, every payment proof,
    every meter photo, the entire user table. That's at least as sensitive
    as Audit Logs, so this stays hard-locked to Super Admin only, the same
    tier as AuditLogPermission — and deliberately does NOT go through the
    per-user override system (no PermissionModule entry, no row in
    apps/authentication/views.py's _MODULE_FLAG_MAP). An Admin should never
    be able to be granted backup access via a per-user override any more
    than they can be granted Audit Log access that way.
    """
    def has_permission(self, request, view):
        return role(request) == R