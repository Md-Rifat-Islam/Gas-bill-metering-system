from django.apps import AppConfig

class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.portal'   # keep whatever value is already there

    def ready(self):
        import apps.portal.signals  # noqa: F401