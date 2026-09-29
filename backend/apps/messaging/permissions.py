from core.permissions import ModuleOverridePermission


class MessagingPermission(ModuleOverridePermission):
    """
    SMS / Messaging module.
      GET             -> can_view  (history, templates, settings, overview)
      POST/PUT/PATCH  -> can_edit  (send notices, edit templates/settings, test, retry)
      DELETE          -> can_delete (remove custom notice templates)
    Role defaults live in core/rbac.py under the 'messaging' module.
    """
    module = 'messaging'