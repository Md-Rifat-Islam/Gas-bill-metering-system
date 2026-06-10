from rest_framework import serializers, generics, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Meter, MeterReading
from apps.units.models import Unit


class MeterSerializer(serializers.ModelSerializer):
    unit_no = serializers.CharField(source='unit.unit_no', read_only=True)
    building_name = serializers.CharField(source='unit.building.name', read_only=True)
    unit_id = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), source='unit', write_only=True)

    class Meta:
        model = Meter
        fields = ['id', 'unit_id', 'unit_no', 'building_name', 'meter_no', 'meter_type', 'created_at']


class MeterReadingSerializer(serializers.ModelSerializer):
    usage = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    meter_no = serializers.CharField(source='meter.meter_no', read_only=True)

    class Meta:
        model = MeterReading
        fields = ['id', 'meter', 'meter_no', 'previous_reading', 'current_reading', 'usage',
                  'reading_date', 'notes', 'recorded_by', 'created_at']
        read_only_fields = ['recorded_by']

    def validate(self, data):
        if data.get('current_reading', 0) < data.get('previous_reading', 0):
            raise serializers.ValidationError('Current reading must be >= previous reading')
        return data

    def create(self, validated_data):
        validated_data['recorded_by'] = self.context['request'].user
        return super().create(validated_data)
