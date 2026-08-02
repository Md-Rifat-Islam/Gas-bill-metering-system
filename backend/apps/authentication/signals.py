from .models import CustomerUser


def provision_customer_for_unit(sender, instance, created, **kwargs):
    """
    Auto-provisions a CustomerUser portal account whenever a Unit is saved
    with a mobile_number set — per the "auto-create at Unit save time"
    design decision. Connected to Unit's post_save signal in apps.py's
    ready() (using apps.get_model to avoid a circular import between the
    authentication and units apps).

    Behavior, deliberately:
      - get_or_create by mobile, so multiple units accidentally sharing one
        mobile number don't hit the unique constraint and blow up the save.
      - The initial password (= the mobile number itself) is set ONLY the
        first time the account is created. Every later Unit save (editing
        floor/allottee/status/etc. with the same mobile) leaves the
        existing account and its CURRENT password untouched — otherwise a
        resident's changed password (or a staff reset) would silently get
        clobbered back to the mobile number on the next unrelated edit.
      - If a Unit's mobile_number is changed to a different number, this
        creates a fresh account for the new number. The old number's
        CustomerUser is left exactly as it was — not deleted, not merged —
        since safely merging two accounts' billing history needs a human
        decision this signal has no business making silently.
    """
    mobile = getattr(instance, 'mobile_number', None)
    if not mobile:
        return

    customer, was_created = CustomerUser.objects.get_or_create(
        mobile=mobile,
        defaults={
            'name': getattr(instance.allottee, 'name', '') if hasattr(instance, 'allottee') else '',
        },
    )
    if was_created:
        customer.set_password(mobile)
        customer.save()