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
      - Name is best-effort here: at CREATE time this only sees
        instance.allottee if it happens to already exist (usually only
        true when editing a unit that already has one; NOT true on a
        brand-new unit's first save — see sync_customer_name_from_allottee
        below for why, and for the fix). On UPDATE, if the allottee now
        has a name and the CustomerUser doesn't match it, it's synced —
        never blanks out an existing name, only fills/corrects it.
    """
    mobile = getattr(instance, 'mobile_number', None)
    if not mobile:
        return

    allottee_name = getattr(instance.allottee, 'name', '') if hasattr(instance, 'allottee') else ''

    customer, was_created = CustomerUser.objects.get_or_create(
        mobile=mobile,
        defaults={'name': allottee_name},
    )
    if was_created:
        customer.set_password(mobile)
        customer.save()
    elif allottee_name and customer.name != allottee_name:
        customer.name = allottee_name
        customer.save(update_fields=['name'])


def sync_customer_name_from_allottee(sender, instance, created, **kwargs):
    """
    THE FIX: UnitSerializer.create() saves the Allottee in a SEPARATE step
    AFTER Unit.objects.create() returns:

        unit = Unit.objects.create(**validated_data)   # fires Unit's
                                                         # post_save HERE —
                                                         # Allottee doesn't
                                                         # exist yet
        self._save_allottee(unit, allottee_name, ...)  # Allottee created
                                                         # AFTER

    That means provision_customer_for_unit (above) runs before the
    Allottee row exists, so instance.allottee is unavailable at that
    moment — every unit created through the normal Units page flow ended
    up with a CustomerUser whose name was permanently blank, even though
    an allottee name was typed into the very same form submission.

    This second signal, on Allottee's own post_save, catches it: once the
    Allottee is actually saved, it looks up the matching CustomerUser via
    unit.mobile_number and fills in the name. Runs on every Allottee save
    (not just creation) so a later name correction stays in sync too.
    Never blanks out an existing CustomerUser name — only sets it when the
    Allottee actually has a non-empty name to offer, so a resident who
    already personalized their own portal name (via the Profile page)
    doesn't get silently overwritten by unrelated allottee-record edits.
    """
    unit = getattr(instance, 'unit', None)
    mobile = getattr(unit, 'mobile_number', None) if unit else None
    if not mobile or not instance.name:
        return

    CustomerUser.objects.filter(mobile=mobile).exclude(name=instance.name).update(name=instance.name)