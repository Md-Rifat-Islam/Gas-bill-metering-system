from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
    """
    IMPORTANT: if apps/authentication/apps.py already exists with different
    content (e.g. a different `name`, or other ready() logic), merge this
    ready() method into it rather than overwriting the file — don't lose
    whatever was already there.
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.authentication"

    def ready(self):
        from django.apps import apps as django_apps
        from django.db.models.signals import post_save
        from .signals import provision_customer_for_unit, sync_customer_name_from_allottee

        Unit = django_apps.get_model('units', 'Unit')
        Allottee = django_apps.get_model('units', 'Allottee')

        post_save.connect(
            provision_customer_for_unit,
            sender=Unit,
            dispatch_uid='provision_customer_for_unit',
        )
        # THE FIX (blank-name bug): Allottee saves AFTER Unit in
        # UnitSerializer.create(), so the Unit-level signal above can't see
        # the allottee's name yet on a brand-new unit. This second
        # connection catches it right after the Allottee itself is saved —
        # see sync_customer_name_from_allottee's docstring in signals.py.
        post_save.connect(
            sync_customer_name_from_allottee,
            sender=Allottee,
            dispatch_uid='sync_customer_name_from_allottee',
        )