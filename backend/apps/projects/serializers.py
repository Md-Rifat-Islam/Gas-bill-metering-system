from rest_framework import serializers
from .models import Project, Package


class PackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Package
        fields = '__all__'


class ProjectSerializer(serializers.ModelSerializer):
    default_package = PackageSerializer(read_only=True)
    default_package_id = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(), source='default_package', write_only=True, required=False, allow_null=True
    )
    building_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = '__all__'

    def get_building_count(self, obj):
        return obj.buildings.count()
