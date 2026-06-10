from django.db import models
from apps.buildings.models import Building
from apps.projects.models import Package


class Unit(models.Model):
    STATUS_ACTIVE = 'Active'
    STATUS_INACTIVE = 'Inactive'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_INACTIVE, 'Inactive')]

    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='units')
    floor_no = models.IntegerField()
    unit_no = models.CharField(max_length=10)
    meter_no = models.CharField(max_length=50, unique=True, null=True, blank=True)
    mobile_number = models.CharField(max_length=15, null=True, blank=True)
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'units'
        unique_together = [('building', 'floor_no', 'unit_no')]

    def __str__(self):
        return f"{self.building.name} - Floor {self.floor_no} - Unit {self.unit_no}"


class Allottee(models.Model):
    unit = models.OneToOneField(Unit, on_delete=models.CASCADE, related_name='allottee')
    name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    nid = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'allottees'

    def __str__(self):
        return f"{self.name} ({self.unit})"
