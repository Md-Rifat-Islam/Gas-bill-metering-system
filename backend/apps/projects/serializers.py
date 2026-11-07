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
        # manager_unit must NOT be settable through the Projects API: with
        # fields='__all__' it would otherwise become a plain writable field,
        # letting anyone with Project edit rights assign a portal manager
        # while skipping the Admin/Super-Admin-only rule and the "unit must
        # belong to this project and be Active" checks. It is only ever
        # changed via the Unit serializer (set_project_manager).
        read_only_fields = ['manager_unit']

    def get_building_count(self, obj):
        return obj.buildings.count()