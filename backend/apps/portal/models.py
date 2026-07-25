from django.db import models


class Notification(models.Model):
    """
    In-app notification for a customer, shown on the portal dashboard.

    Three sources create these:
      1. A signal on Bill creation (apps/portal/signals.py) — fires for
         ANY new bill (single create, bulk create, quick-edit-triggered
         create — anywhere a Bill row is actually saved for the first
         time), customer-only per spec.
      2. A daily Celery task (apps/portal/tasks.py) that, on the 5th and
         10th of each month, reminds customers with a still-unpaid bill
         for that month.

    unique_together prevents duplicates if the signal or task ever fires
    more than once for the same bill + notification type (e.g. task
    re-run, admin re-saving a bill).
    """
    TYPE_BILL_CREATED = 'bill_created'
    TYPE_REMINDER_5 = 'reminder_5'
    TYPE_REMINDER_10 = 'reminder_10'
    TYPE_CHOICES = [
        (TYPE_BILL_CREATED, 'New Bill'),
        (TYPE_REMINDER_5, 'Payment Reminder (5th)'),
        (TYPE_REMINDER_10, 'Payment Reminder (10th)'),
    ]

    customer = models.ForeignKey(
        'authentication.CustomerUser', on_delete=models.CASCADE, related_name='notifications'
    )
    bill = models.ForeignKey(
        'billing.Bill', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications'
    )
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=150)
    message = models.CharField(max_length=300)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'portal_notifications'
        ordering = ['-created_at']
        unique_together = [('bill', 'notification_type')]

    def __str__(self):
        return f"{self.customer.mobile} — {self.title}"