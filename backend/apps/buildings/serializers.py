from rest_framework import serializers
from .models import Building
from apps.projects.models import Project


class BuildingSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    # NOTE: previously write_only=True, which meant every GET response omitted
    # the project's id entirely — there was no way for the frontend to know
    # which project a building belonged to. PrimaryKeyRelatedField without
    # write_only still accepts a plain project id on POST/PATCH and now also
    # serializes it back out on read, so this fixes both directions.
    project_id = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(), source='project'
    )
    unit_count = serializers.SerializerMethodField()

    class Meta:
        model = Building
        fields = [
            'id', 'project_id', 'project_name', 'name', 'code', 'total_floors',
            'is_active', 'unit_count', 'created_at', 'updated_at',
        ]

    def get_unit_count(self, obj):
        return obj.units.count() if hasattr(obj, 'units') else 0