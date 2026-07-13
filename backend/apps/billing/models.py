from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from apps.units.models import Unit
from apps.buildings.models import Building
from apps.projects.models import Project


class Bill(models.Model):
    STATUS_UNPAID = 'Unpaid'
    STATUS_PARTIAL = 'Partial'
    STATUS_PAID = 'Paid'
    STATUS_CHOICES = [
        (STATUS_UNPAID, 'Unpaid'),
        (STATUS_PARTIAL, 'Partial'),
        (STATUS_PAID, 'Paid'),
    ]

    bill_number = models.CharField(max_length=50, unique=True)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name='bills')
    building = models.ForeignKey(Building, on_delete=models.PROTECT, related_name='bills')
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name='bills')
    billing_month = models.DateField()  # First day of billing month

    # Meter readings
    previous_reading = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    current_reading = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_usage_m3 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_usage_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    conversion_factor = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)

    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Adjustments
    extra_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_adjusted = models.BooleanField(default=False)
    adjustment_reason = models.TextField(blank=True)

    # Final totals
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    due_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_UNPAID)

    # Audit
    created_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, related_name='bills_created'
    )
    last_updated_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='bills_updated'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bills'
        unique_together = [('unit', 'billing_month')]
        ordering = ['-billing_month', '-created_at']

    def __str__(self):
        return f"Bill #{self.bill_number} - {self.unit} ({self.billing_month.strftime('%B %Y')})"

    def calculate(self):
        """
        Server-side calculation - never trust client values.

        FIX: previously this always billed on total_usage_m3 even when a
        conversion_factor was set — it computed total_usage_kg but then
        ignored it for base_amount. A kg-priced package (unit_price meant
        per-KG) was silently being charged at the m³ rate instead. Now:
        if conversion_factor is set, usage is converted to KG and billing
        is based on that; otherwise billing stays on m³ as before.
        """
        self.total_usage_m3 = self.current_reading - self.previous_reading

        if self.conversion_factor:
            self.total_usage_kg = round(self.total_usage_m3 * self.conversion_factor, 2)
            billable_usage = self.total_usage_kg
        else:
            self.total_usage_kg = None
            billable_usage = self.total_usage_m3

        self.base_amount = round(billable_usage * self.unit_price, 2)

        self.total_amount = round(
            self.base_amount + self.service_charge + self.extra_charge + self.late_fee - self.discount, 2
        )
        self.due_amount = round(self.total_amount - self.paid_amount, 2)
        self._update_status()

    def _update_status(self):
        if self.paid_amount == 0:
            self.status = self.STATUS_UNPAID
        elif self.due_amount <= 0:
            self.status = self.STATUS_PAID
        else:
            self.status = self.STATUS_PARTIAL

    def apply_payment(self, amount):
        """Atomic payment application"""
        if amount > self.due_amount:
            raise ValidationError(f'Payment amount ({amount}) exceeds due amount ({self.due_amount})')
        self.paid_amount += Decimal(str(amount))
        self.due_amount = self.total_amount - self.paid_amount
        self._update_status()
        self.save(update_fields=['paid_amount', 'due_amount', 'status', 'updated_at'])

    def clean(self):
        if self.current_reading < self.previous_reading:
            raise ValidationError('Current reading must be >= previous reading')
        if self.discount > self.base_amount:
            raise ValidationError('Discount cannot exceed base amount')
        if self.is_adjusted and not self.adjustment_reason:
            raise ValidationError('Adjustment reason is required when adjustments are applied')

    @classmethod
    def generate_bill_number(cls):
        import uuid
        return f"GAS-{uuid.uuid4().hex[:8].upper()}"