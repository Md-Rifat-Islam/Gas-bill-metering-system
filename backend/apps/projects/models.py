from django.db import models


class Package(models.Model):
    UNIT_M3 = 'm3'
    UNIT_KG = 'kg'
    UNIT_CHOICES = [(UNIT_M3, 'Cubic Meter (m³)'), (UNIT_KG, 'Kilogram (Kg)')]

    name = models.CharField(max_length=100)
    unit_type = models.CharField(max_length=20, choices=UNIT_CHOICES, default=UNIT_M3)
    per_unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'packages'

    def __str__(self):
        return f"{self.name} ({self.per_unit_cost}/unit)"


class Project(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField(blank=True)
    default_package = models.ForeignKey(
        Package, on_delete=models.SET_NULL, null=True, blank=True, related_name='projects'
    )
    service_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'

    def __str__(self):
        return self.name
