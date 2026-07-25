from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.billing.models import Bill
from apps.authentication.models import CustomerUser
from .models import Notification


@receiver(post_save, sender=Bill)
def notify_customer_on_bill_created(sender, instance, created, **kwargs):
    """
    Fires for ANY new Bill row — single create (BillListCreateView),
    bulk create (BulkCreateBillsView), or any other path that ends in
    Bill.objects.create(...)/serializer.save() — since this is a model
    signal, not tied to one specific view.

    Customer-only, per spec: looks up the CustomerUser whose mobile
    matches the bill's unit (same lookup CustomerScopedMixin uses
    elsewhere). If no portal account exists yet for that unit, no
    notification is created — nothing to show it to.
    """
    if not created:
        return

    customer = CustomerUser.objects.filter(mobile=instance.unit.mobile_number).first()
    if not customer:
        return

    Notification.objects.get_or_create(
        bill=instance,
        notification_type=Notification.TYPE_BILL_CREATED,
        defaults={
            'customer': customer,
            'title': 'New Bill Issued',
            'message': (
                f"Your bill for {instance.billing_month.strftime('%B %Y')} "
                f"({instance.bill_number}) is ready — ৳{instance.total_amount} due."
            ),
        },
    )