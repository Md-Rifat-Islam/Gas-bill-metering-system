import logging

from celery import shared_task
from django.utils import timezone

from . import services
from .models import SMSCampaign, SMSMessage, SMSSettings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_message_task(self, message_id):
    """Deliver one queued SMS. Network/5xx problems retry with backoff."""
    msg = SMSMessage.objects.filter(id=message_id).first()
    if not msg or msg.status != SMSMessage.STATUS_QUEUED:
        return 'nothing to do'
    try:
        services.deliver(msg)
    except services.TransientSMSError as exc:
        msg.attempts += 1
        msg.error = str(exc)[:500]
        if self.request.retries >= self.max_retries:
            msg.status = SMSMessage.STATUS_FAILED
            msg.save(update_fields=['attempts', 'error', 'status'])
            return 'failed after retries'
        msg.save(update_fields=['attempts', 'error'])
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    return msg.status


@shared_task
def send_bill_created_sms(bill_id):
    """Fired (after commit) for every newly created bill."""
    cfg = SMSSettings.get_solo()
    if not cfg.auto_bill_created:
        return 'disabled'
    from apps.billing.models import Bill
    bill = (
        Bill.objects.select_related('unit', 'unit__allottee', 'building', 'project')
        .filter(id=bill_id).first()
    )
    if not bill or bill.total_amount <= 0:
        return 'no bill / zero amount'
    services.ensure_default_templates()
    msg = services.create_bill_message(bill, SMSMessage.KIND_BILL_CREATED, 'bill_created')
    if msg and msg.status == SMSMessage.STATUS_QUEUED:
        send_message_task.delay(msg.id)
        return 'queued'
    return 'skipped'


@shared_task
def run_scheduled_reminders():
    """
    Runs every hour (Celery beat). Sends unpaid-bill reminders when today is
    one of the admin-set reminder days and the local hour has reached the
    admin-set send hour. De-duplicated per bill/day/month, so hourly re-runs
    (or a late worker) never double-send.
    """
    cfg = SMSSettings.get_solo()
    if not cfg.auto_reminders:
        return 'disabled'
    now = timezone.localtime()
    if now.hour < cfg.send_hour or now.day not in (cfg.reminder_days or []):
        return 'not a reminder time'

    services.ensure_default_templates()
    queued = 0
    for bill in services.reminder_bills(cfg, now.date()).iterator():
        msg = services.create_bill_message(
            bill, SMSMessage.KIND_REMINDER, 'payment_reminder',
            reminder_day=now.day, today=now.date(),
        )
        if msg and msg.status == SMSMessage.STATUS_QUEUED:
            send_message_task.delay(msg.id)
            queued += 1
    return f'queued {queued} reminder(s)'


@shared_task
def run_campaign_task(campaign_id):
    """Expand a notice into per-recipient messages and dispatch them."""
    campaign = SMSCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return 'missing'
    ids = services.create_campaign_messages(campaign)
    for mid in ids:
        send_message_task.delay(mid)
    return f'queued {len(ids)} message(s)'