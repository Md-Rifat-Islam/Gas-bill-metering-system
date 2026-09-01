from rest_framework.permissions import BasePermission

from core.permissions import role, R


class PaymentEditPermission(BasePermission):
    """
    Editing an already-recorded payment is riskier than creating a new one:
    if the payment was already Approved, editing its amount silently
    recalculates the bill's paid/due totals (see PaymentSerializer.update).
    That's the same risk tier as reversing a payment, which the frontend
    already hard-locks to Super Admin (`can.reversePayment`, `can.editPayments`
    in apps/authentication/views.py's MyPermissionsView) — this mirrors that
    exactly, rather than reusing the broader PaymentWritePermission that
    also allows Admin/Accountant to create/approve/reject.
    """
    def has_permission(self, request, view):
        return role(request) == R