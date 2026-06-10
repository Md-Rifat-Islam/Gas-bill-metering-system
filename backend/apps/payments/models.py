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

    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='payments')
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=50, choices=METHOD_CHOICES)
    transaction_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    payment_date = models.DateTimeField(auto_now_add=True)
    received_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, related_name='payments_received'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-payment_date']

    def __str__(self):
        return f"Payment {self.paid_amount} for {self.bill.bill_number}"


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
