from django.db import models


class AuditLog(models.Model):
    ACTION_CREATE = 'CREATE'
    ACTION_UPDATE = 'UPDATE'
    ACTION_DELETE = 'DELETE'

    table_name = models.CharField(max_length=50)
    record_id = models.BigIntegerField()

    changed_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True
    )
    # Added: staff-only changed_by can't represent a customer-initiated
    # action (e.g. a portal payment submission) — assigning a CustomerUser
    # instance to it would fail since the FK is typed to StaffUser. This is
    # a separate nullable FK so both actor types are properly attributed
    # instead of silently logging changed_by=None for customer actions.
    changed_by_customer = models.ForeignKey(
        'authentication.CustomerUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )

    action = models.CharField(max_length=50)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-changed_at']

    def __str__(self):
        return f"{self.action} on {self.table_name}#{self.record_id} by {self.actor_display}"

    @property
    def actor_display(self):
        if self.changed_by:
            return self.changed_by.name
        if self.changed_by_customer:
            label = self.changed_by_customer.name or 'Customer'
            return f"{label} ({self.changed_by_customer.mobile})"
        return 'System'