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