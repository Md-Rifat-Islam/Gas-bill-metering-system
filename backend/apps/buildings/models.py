from django.db import models
from apps.projects.models import Project, Package


class Building(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='buildings')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    total_floors = models.IntegerField(default=1)
    default_package = models.ForeignKey(
        Package, on_delete=models.SET_NULL, null=True, blank=True
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'buildings'

    def __str__(self):
        return f"{self.project.name} - {self.name}"
