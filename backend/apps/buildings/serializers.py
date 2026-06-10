from rest_framework import serializers
from .models import Building
from apps.projects.models import Project


class BuildingSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(), source='project', write_only=True
    )
    unit_count = serializers.SerializerMethodField()

    class Meta:
        model = Building
        fields = ['id', 'project_id', 'project_name', 'name', 'code', 'total_floors',
                  'is_active', 'unit_count', 'created_at', 'updated_at']

    def get_unit_count(self, obj):
        return obj.units.count() if hasattr(obj, 'units') else 0
