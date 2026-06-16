from rest_framework import serializers
from .models import Meter, MeterReading
from apps.units.models import Unit


class MeterSerializer(serializers.ModelSerializer):
    unit_no       = serializers.CharField(source='unit.unit_no',           read_only=True)
    building_name = serializers.CharField(source='unit.building.name',     read_only=True)
    project_name  = serializers.CharField(source='unit.building.project.name', read_only=True)
    allottee_name = serializers.CharField(source='unit.allottee.name',     read_only=True, default='')
    floor_no      = serializers.IntegerField(source='unit.floor_no',       read_only=True)
    unit_id = serializers.PrimaryKeyRelatedField(
        queryset=Unit.objects.all(), source='unit', write_only=True
    )

    class Meta:
        model  = Meter
        fields = [
            'id', 'unit_id', 'unit_no', 'floor_no', 'building_name',
            'project_name', 'allottee_name', 'meter_no', 'meter_type', 'created_at',
        ]


class MeterReadingSerializer(serializers.ModelSerializer):
    usage              = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    meter_no           = serializers.CharField(source='meter.meter_no',           read_only=True)
    unit_no            = serializers.CharField(source='meter.unit.unit_no',        read_only=True)
    building_name      = serializers.CharField(source='meter.unit.building.name',  read_only=True)
    project_name       = serializers.CharField(source='meter.unit.building.project.name', read_only=True)
    allottee_name      = serializers.CharField(source='meter.unit.allottee.name',  read_only=True, default='')
    recorded_by_name   = serializers.CharField(source='recorded_by.name',          read_only=True, default='')
    reading_photo_url  = serializers.SerializerMethodField()

    class Meta:
        model  = MeterReading
        fields = [
            'id', 'meter', 'meter_no', 'unit_no', 'building_name', 'project_name',
            'allottee_name', 'previous_reading', 'current_reading', 'usage',
            'reading_date', 'reading_photo', 'reading_photo_url',
            'notes', 'recorded_by', 'recorded_by_name', 'created_at',
        ]
        read_only_fields = ['recorded_by', 'created_at']

    def get_reading_photo_url(self, obj):
        if obj.reading_photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.reading_photo.url)
            return obj.reading_photo.url
        return None

    def validate(self, data):
        curr = data.get('current_reading', 0)
        prev = data.get('previous_reading', 0)
        if curr < prev:
            raise serializers.ValidationError(
                {'current_reading': 'Current reading must be ≥ previous reading.'}
            )
        return data

    def create(self, validated_data):
        validated_data['recorded_by'] = self.context['request'].user
        return super().create(validated_data)