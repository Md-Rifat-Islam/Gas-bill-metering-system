from django.db import models
from apps.units.models import Unit


class Meter(models.Model):
    unit = models.OneToOneField(Unit, on_delete=models.CASCADE, related_name='meter')
    meter_no = models.CharField(max_length=50, unique=True)
    meter_type = models.CharField(max_length=50, blank=True, default='Standard')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meters'

    def __str__(self):
        return f"Meter {self.meter_no} - {self.unit}"


class MeterReading(models.Model):
    meter = models.ForeignKey(Meter, on_delete=models.CASCADE, related_name='readings')
    previous_reading = models.DecimalField(max_digits=10, decimal_places=2)
    current_reading = models.DecimalField(max_digits=10, decimal_places=2)
    reading_date = models.DateField()
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meter_readings'
        ordering = ['-reading_date']

    @property
    def usage(self):
        return self.current_reading - self.previous_reading
