from django.db import models


class AuditLog(models.Model):
    ACTION_CREATE = 'CREATE'
    ACTION_UPDATE = 'UPDATE'
    ACTION_DELETE = 'DELETE'

    table_name = models.CharField(max_length=50)
    record_id = models.BigIntegerField()
    changed_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True
    )
    action = models.CharField(max_length=50)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-changed_at']

    def __str__(self):
        return f"{self.action} on {self.table_name}#{self.record_id} by {self.changed_by}"
