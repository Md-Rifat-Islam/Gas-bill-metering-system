from django.db import models


def default_reminder_days():
    return [8, 10]


class SMSSettings(models.Model):
    """Singleton (pk=1). Controls the automatic SMS behaviour."""
    auto_bill_created = models.BooleanField(default=True)
    auto_reminders = models.BooleanField(default=True)
    # Days of the month (1-28) on which unpaid-bill reminders go out.
    reminder_days = models.JSONField(default=default_reminder_days)
    # Reminders are sent on/after this hour (Asia/Dhaka) on a reminder day.
    send_hour = models.PositiveSmallIntegerField(default=10)
    # 0 = only the current month's bills; 1 = current + previous month; ...
    remind_months_back = models.PositiveSmallIntegerField(default=1)

    updated_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sms_settings'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SMSTemplate(models.Model):
    KIND_BILL_CREATED = 'bill_created'
    KIND_REMINDER = 'reminder'
    KIND_NOTICE = 'notice'
    KIND_CHOICES = [
        (KIND_BILL_CREATED, 'Bill created'),
        (KIND_REMINDER, 'Payment reminder'),
        (KIND_NOTICE, 'Notice'),
    ]

    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    body = models.TextField()
    is_active = models.BooleanField(default=True)
    # System templates (bill_created / payment_reminder / ...) cannot be deleted.
    is_system = models.BooleanField(default=False)
    updated_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sms_templates'
        ordering = ['kind', 'name']

    def __str__(self):
        return self.name


class SMSCampaign(models.Model):
    """A manually sent notice to a group of units (all / project / building / specific units)."""
    AUDIENCE_ALL = 'all'
    AUDIENCE_PROJECT = 'project'
    AUDIENCE_BUILDING = 'building'
    AUDIENCE_UNITS = 'units'
    AUDIENCE_CHOICES = [
        (AUDIENCE_ALL, 'All active units'),
        (AUDIENCE_PROJECT, 'A project'),
        (AUDIENCE_BUILDING, 'A building'),
        (AUDIENCE_UNITS, 'Specific units'),
    ]

    title = models.CharField(max_length=150)
    template = models.ForeignKey(SMSTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    body = models.TextField()
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    project = models.ForeignKey('projects.Project', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    building = models.ForeignKey('buildings.Building', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    unit_ids = models.JSONField(default=list, blank=True)
    only_unpaid = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sms_campaigns'
        ordering = ['-created_at']


class SMSMessage(models.Model):
    """One SMS to one number — also the delivery log."""
    KIND_BILL_CREATED = 'bill_created'
    KIND_REMINDER = 'reminder'
    KIND_NOTICE = 'notice'
    KIND_TEST = 'test'
    KIND_CHOICES = [
        (KIND_BILL_CREATED, 'Bill created'),
        (KIND_REMINDER, 'Payment reminder'),
        (KIND_NOTICE, 'Notice'),
        (KIND_TEST, 'Test'),
    ]

    STATUS_QUEUED = 'Queued'
    STATUS_SENT = 'Sent'
    STATUS_FAILED = 'Failed'
    STATUS_SKIPPED = 'Skipped'
    STATUS_CHOICES = [
        (STATUS_QUEUED, 'Queued'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    mobile = models.CharField(max_length=20, blank=True)
    body = models.TextField()
    segments = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    error = models.CharField(max_length=500, blank=True)
    provider_response = models.CharField(max_length=1000, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    bill = models.ForeignKey('billing.Bill', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_messages')
    unit = models.ForeignKey('units.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_messages')
    campaign = models.ForeignKey(SMSCampaign, on_delete=models.CASCADE, null=True, blank=True, related_name='messages')

    # Dedupe key for automatic messages: the same bill never gets the same
    # kind of SMS twice for the same reminder day in the same month.
    reminder_day = models.PositiveSmallIntegerField(default=0)
    period = models.DateField(null=True, blank=True)

    created_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sms_messages'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['bill', 'kind', 'reminder_day', 'period'],
                condition=models.Q(bill__isnull=False),
                name='uniq_sms_bill_kind_day_period',
            ),
        ]

    def __str__(self):
        return f'{self.kind} -> {self.mobile} ({self.status})'