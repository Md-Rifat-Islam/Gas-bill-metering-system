from django.db import models
from apps.billing.models import Bill


class Payment(models.Model):
    METHOD_CASH = 'Cash'
    METHOD_BANK = 'Bank'
    METHOD_BKASH = 'bKash'
    METHOD_CARD = 'Card'
    METHOD_SSLCOMMERZ = 'SSLCommerz'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'),
        (METHOD_BANK, 'Bank Transfer'),
        (METHOD_BKASH, 'bKash'),
        (METHOD_CARD, 'Card'),
        (METHOD_SSLCOMMERZ, 'SSLCommerz'),
    ]

    SOURCE_STAFF = 'staff'
    SOURCE_CUSTOMER = 'customer'
    SOURCE_CHOICES = [
        (SOURCE_STAFF, 'Staff'),
        (SOURCE_CUSTOMER, 'Customer Portal'),
    ]

    STATUS_PENDING = 'Pending'
    STATUS_APPROVED = 'Approved'
    STATUS_REJECTED = 'Rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='payments')
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=50, choices=METHOD_CHOICES)
    transaction_id = models.CharField(max_length=100, unique=True, null=True, blank=True)

    # Previously auto_now_add=True — that made it impossible for anyone to
    # actually record *when the payment was made* (as opposed to when the
    # record was created). Now explicit and required; `created_at` below
    # still tracks system record-creation time.
    payment_date = models.DateField()

    # Proof of payment — required for both manual staff entry and customer
    # portal submissions (enforced in the serializers, not here, since the
    # two flows have different validation messages).
    proof_image = models.ImageField(upload_to='payment_proofs/%Y/%m/', null=True, blank=True)
    proof_invoice = models.FileField(upload_to='payment_proofs/%Y/%m/', null=True, blank=True)

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_STAFF)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_APPROVED)

    submitted_by_customer = models.ForeignKey(
        'authentication.CustomerUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments_submitted',
    )
    received_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments_received',
    )
    reviewed_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f"Payment {self.paid_amount} for {self.bill.bill_number} ({self.status})"


class PaymentTransaction(models.Model):
    """For tracking online payment gateway callbacks"""
    STATUS_PENDING = 'Pending'
    STATUS_SUCCESS = 'Success'
    STATUS_FAILED = 'Failed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUCCESS, 'Success'),
        (STATUS_FAILED, 'Failed'),
    ]

    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='transactions')
    gateway_name = models.CharField(max_length=50)
    gateway_transaction_id = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    raw_response = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payment_transactions'


class PaymentChannelSettings(models.Model):
    """
    Singleton config (always pk=1) for the payment channel details shown to
    customers before they submit an offline payment — bKash/Nagad numbers
    and bank account details. Edited by Super Admin only; read by both staff
    and the customer portal.
    """
    bkash_number = models.CharField(max_length=20, blank=True)
    bkash_type   = models.CharField(max_length=20, blank=True, default='Personal',
                                     help_text='e.g. Personal / Merchant')
    nagad_number = models.CharField(max_length=20, blank=True)

    bank_name            = models.CharField(max_length=100, blank=True)
    bank_account_name    = models.CharField(max_length=100, blank=True)
    bank_account_number  = models.CharField(max_length=50, blank=True)
    bank_branch          = models.CharField(max_length=100, blank=True)
    bank_routing_number  = models.CharField(max_length=50, blank=True)

    instructions = models.TextField(blank=True, help_text='Optional extra note shown to customers')

    updated_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_channel_settings'

    def __str__(self):
        return 'Payment Channel Settings'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj