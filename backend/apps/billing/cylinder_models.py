from django.db import models
from apps.projects.models import Project


class CylinderType(models.Model):
    """
    A cylinder size that can be supplied to a project, e.g. "12 kg cylinder".
    Created from the Project Status page; the weight is what the supplied
    quantity is multiplied by to get total kg given.
    """
    name = models.CharField(max_length=100)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cylinder_types_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cylinder_types'
        unique_together = [('name', 'weight_kg')]
        ordering = ['weight_kg', 'name']

    def __str__(self):
        return f'{self.name} ({self.weight_kg} kg)'


class CylinderSupply(models.Model):
    """How many cylinders of one type were given to a project in a month."""
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name='cylinder_supplies')
    month = models.DateField()  # first day of the month, same convention as Bill.billing_month
    cylinder_type = models.ForeignKey(CylinderType, on_delete=models.PROTECT, related_name='supplies')
    quantity = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        'authentication.StaffUser', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cylinder_supplies_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cylinder_supplies'
        unique_together = [('project', 'month', 'cylinder_type')]
        ordering = ['-month', 'cylinder_type__weight_kg']

    def __str__(self):
        return f'{self.project} {self.month:%Y-%m}: {self.quantity} x {self.cylinder_type}'