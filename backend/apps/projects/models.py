from django.db import models


class Package(models.Model):
    UNIT_M3 = 'm3'
    UNIT_KG = 'kg'
    UNIT_CHOICES = [(UNIT_M3, 'Cubic Meter (m3)'), (UNIT_KG, 'Kilogram (Kg)')]

    name = models.CharField(max_length=100)
    unit_type = models.CharField(max_length=20, choices=UNIT_CHOICES, default=UNIT_M3)
    per_unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    # Only meaningful when unit_type=kg. Bills are billed in KG = metered m³ ×
    # this factor. Left null for m3 packages (no conversion needed).
    conversion_factor = models.DecimalField(
        max_digits=6, decimal_places=4, null=True, blank=True,
        help_text='KG per m³ — used to convert metered usage into billable KG when unit_type is kg.'
    )

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

    # The one unit whose resident may view this project's bill status in the
    # Resident Portal (read-only: paid / partial / unpaid for every unit in
    # the project). Set from the Units page by Admin / Super Admin only (see
    # UnitSerializer). Portal access follows this unit's mobile_number, so a
    # new allottee on that unit inherits the access automatically.
    # String reference ('units.Unit') because the units app imports Building,
    # which imports this module — a direct import would be circular.
    manager_unit = models.ForeignKey(
        'units.Unit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='managed_projects',
        help_text='Unit whose resident can view this project\'s bill status in the portal.',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'

    def __str__(self):
        return self.name