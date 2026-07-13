def log_action(user, table_name, record_id, action, old_data=None, new_data=None):
    """
    Helper to create audit log entries.

    `user` may be a StaffUser, a CustomerUser, or None. Dispatches to the
    correct FK column on AuditLog (changed_by vs changed_by_customer) —
    previously any customer action had to pass None here since the single
    changed_by FK only accepted StaffUser, silently losing attribution.
    """
    try:
        from .models import AuditLog
        from apps.authentication.models import StaffUser, CustomerUser

        changed_by = None
        changed_by_customer = None

        if user and getattr(user, 'is_authenticated', False):
            if isinstance(user, StaffUser):
                changed_by = user
            elif isinstance(user, CustomerUser):
                changed_by_customer = user

        AuditLog.objects.create(
            table_name=table_name,
            record_id=record_id,
            changed_by=changed_by,
            changed_by_customer=changed_by_customer,
            action=action,
            old_data=old_data,
            new_data=new_data,
        )
    except Exception:
        pass  # Never let audit logging break main flow