def log_action(user, table_name, record_id, action, old_data=None, new_data=None):
    """Helper to create audit log entries"""
    try:
        from .models import AuditLog
        AuditLog.objects.create(
            table_name=table_name,
            record_id=record_id,
            changed_by=user if user and user.is_authenticated else None,
            action=action,
            old_data=old_data,
            new_data=new_data,
        )
    except Exception:
        pass  # Never let audit logging break main flow
