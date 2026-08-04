from django.db import models
from apps.units.models import Unit


class Meter(models.Model):
    unit       = models.OneToOneField(Unit, on_delete=models.CASCADE, related_name='meter')
    meter_no   = models.CharField(max_length=50, unique=True)
    meter_type = models.CharField(max_length=50, blank=True, default='Standard')
    barcode    = models.CharField(
        max_length=100, unique=True, null=True, blank=True,
        help_text='Barcode/QR payload printed on the physical meter, used for scan-to-select.'
    )
    # THE FIX: the meter's actual dial reading at the moment it was assigned
    # to this unit. Used as the baseline (previous_reading) for this
    # meter's FIRST-EVER MeterReading, instead of assuming the meter
    # started at 0 — a meter that's been in service before being onboarded
    # into DECO (or reassigned from a previous unit) almost never actually
    # starts at 0, and treating it as if it did inflates the first bill by
    # the meter's entire prior accumulated usage.
    #
    # Default 0 preserves the old behavior for meters that genuinely ARE
    # brand new/unused — staff simply leaves this at 0 in that case.
    #
    # NOTE: this only prevents the bug going forward. It does NOT
    # retroactively correct any first bill that was already generated
    # using an assumed-0 baseline before this field existed — those need
    # a manual bill adjustment if any are found.
    initial_reading = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Meter's dial reading at assignment time — baseline for this meter's first bill."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meters'
        indexes = [
            models.Index(fields=['barcode']),
        ]

    def __str__(self):
        return f"Meter {self.meter_no} — {self.unit}"


class MeterReading(models.Model):
    meter            = models.ForeignKey(Meter, on_delete=models.CASCADE, related_name='readings')
    previous_reading = models.DecimalField(max_digits=10, decimal_places=2)
    current_reading  = models.DecimalField(max_digits=10, decimal_places=2)
    reading_date     = models.DateField()
    reading_photo    = models.ImageField(
        upload_to='meter_readings/%Y/%m/', null=True, blank=True,
        help_text='Photo of the meter at time of reading'
    )
    notes      = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meter_readings'
        ordering = ['-reading_date', '-created_at']
        indexes = [
            models.Index(fields=['meter', '-reading_date']),
        ]

    @property
    def usage(self):
        return self.current_reading - self.previous_reading

    def __str__(self):
        return f"{self.meter.meter_no} — {self.reading_date} ({self.usage} m3)"