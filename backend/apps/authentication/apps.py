from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.authentication"

    def ready(self):
        from django.apps import apps as django_apps
        from django.db.models.signals import post_save
        from .signals import provision_customer_for_unit

        Unit = django_apps.get_model('units', 'Unit')
        post_save.connect(
            provision_customer_for_unit,
            sender=Unit,
            dispatch_uid='provision_customer_for_unit',
        )