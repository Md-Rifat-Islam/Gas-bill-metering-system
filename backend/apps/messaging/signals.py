import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.billing.models import Bill

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Bill)
def queue_bill_created_sms(sender, instance, created, **kwargs):
    """
    Every new Bill (single create, bulk create, anywhere) queues an SMS —
    but only after the surrounding DB transaction commits, so the worker
    can always see the bill. Never allowed to break bill creation.
    """
    if not created:
        return
    bill_id = instance.id

    def _dispatch():
        try:
            from .tasks import send_bill_created_sms
            send_bill_created_sms.delay(bill_id)
        except Exception:
            logger.exception('Could not queue bill-created SMS for bill %s', bill_id)

    transaction.on_commit(_dispatch)