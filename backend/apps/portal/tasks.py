from celery import shared_task
from django.utils import timezone

from apps.billing.models import Bill
from apps.authentication.models import CustomerUser
from .models import Notification


def _create_reminder(bill, notification_type, label):
    customer = CustomerUser.objects.filter(mobile=bill.unit.mobile_number).first()
    if not customer:
        return

    Notification.objects.get_or_create(
        bill=bill,
        notification_type=notification_type,
        defaults={
            'customer': customer,
            'title': f'Payment Reminder ({label})',
            'message': (
                f"Your bill {bill.bill_number} for {bill.billing_month.strftime('%B %Y')} "
                f"still has ৳{bill.due_amount} due."
            ),
        },
    )
    # TODO: SMS/email dispatch goes here once a gateway is wired up — same
    # missing piece as OTPRequestView's own `TODO: send_sms(...)`. Once
    # that's in place, call it here with customer.mobile / customer.email.


@shared_task
def send_daily_bill_reminders():
    """
    Intended to run once a day via Celery beat (see CELERY_BEAT_SCHEDULE
    in settings.py). Only actually does anything on the 5th or 10th of
    the month — checked here rather than in the schedule itself, so the
    schedule stays a simple daily cron and all the "which day" logic
    lives in one place.

    Idempotent: Notification.unique_together on (bill, notification_type)
    means re-running this on the same day for the same bill is a no-op,
    not a duplicate.
    """
    today = timezone.now().date()
    if today.day not in (5, 10):
        return 'not a reminder day — no-op'

    month_start = today.replace(day=1)
    due_bills = (
        Bill.objects
        .filter(billing_month=month_start, status__in=['Unpaid', 'Partial'])
        .select_related('unit')
    )

    notification_type = Notification.TYPE_REMINDER_5 if today.day == 5 else Notification.TYPE_REMINDER_10
    label = '5th' if today.day == 5 else '10th'

    count = 0
    for bill in due_bills:
        _create_reminder(bill, notification_type, label)
        count += 1

    return f'processed {count} bill(s) for the {label} reminder'