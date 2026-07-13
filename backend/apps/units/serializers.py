from rest_framework import serializers
from .models import Unit, Allottee
from apps.buildings.models import Building
from apps.projects.models import Package


class AllotteeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allottee
        fields = ['id', 'name', 'email', 'nid', 'created_at', 'updated_at']


class UnitSerializer(serializers.ModelSerializer):
    allottee        = AllotteeSerializer(read_only=True)
    building_name   = serializers.CharField(source='building.name',          read_only=True)
    project_name    = serializers.CharField(source='building.project.name',  read_only=True)
    package_name    = serializers.CharField(source='package.name',           read_only=True, default=None)

    # meter_no/meter_id/meter_type/barcode are now READ-ONLY, sourced from
    # the linked Meter row (assigned via the Units page's Assign Meter
    # action, which writes to /meters/). Previously meter_no was also a
    # plain writable field directly on Unit, completely disconnected from
    # the Meter model — two independent places could disagree about a
    # unit's meter number, and assigning a Meter to a unit that already
    # had one hit Meter.unit's OneToOneField uniqueness constraint with an
    # unhandled error. Falls back to the legacy Unit.meter_no column (kept
    # in the DB, no longer written to going forward) for units created
    # before this fix that have old data but no Meter row yet.
    meter_id   = serializers.SerializerMethodField()
    meter_no   = serializers.SerializerMethodField()
    meter_type = serializers.SerializerMethodField()
    barcode    = serializers.SerializerMethodField()

    building_id = serializers.PrimaryKeyRelatedField(
        queryset=Building.objects.all(), source='building', write_only=True
    )
    package_id = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(), source='package',
        write_only=True, required=False, allow_null=True
    )

    # Allottee nested write fields
    allottee_name  = serializers.CharField(write_only=True, required=False, allow_blank=True)
    allottee_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    allottee_nid   = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Unit
        fields = [
            'id', 'building_id', 'building_name', 'project_name',
            'floor_no', 'unit_no', 'meter_id', 'meter_no', 'meter_type', 'barcode',
            'mobile_number', 'package_id', 'package_name', 'status',
            'allottee', 'allottee_name', 'allottee_email', 'allottee_nid',
            'created_at', 'updated_at',
        ]

    def get_meter_id(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.id if meter else None

    def get_meter_no(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.meter_no if meter else obj.meter_no

    def get_meter_type(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.meter_type if meter else None

    def get_barcode(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.barcode if meter else None

    def _save_allottee(self, unit, name, email, nid):
        if name:
            Allottee.objects.update_or_create(
                unit=unit,
                defaults={'name': name, 'email': email or '', 'nid': nid or ''},
            )

    def create(self, validated_data):
        allottee_name  = validated_data.pop('allottee_name', '')
        allottee_email = validated_data.pop('allottee_email', '')
        allottee_nid   = validated_data.pop('allottee_nid', '')
        unit = Unit.objects.create(**validated_data)
        self._save_allottee(unit, allottee_name, allottee_email, allottee_nid)
        return unit

    def update(self, instance, validated_data):
        allottee_name  = validated_data.pop('allottee_name', None)
        allottee_email = validated_data.pop('allottee_email', '')
        allottee_nid   = validated_data.pop('allottee_nid', '')
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if allottee_name is not None:
            self._save_allottee(instance, allottee_name, allottee_email, allottee_nid)
        return instance