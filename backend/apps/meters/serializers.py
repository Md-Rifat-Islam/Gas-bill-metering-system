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
            'project_name', 'allottee_name', 'meter_no', 'meter_type',
            'barcode', 'created_at',
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


# ── Quick Reading Dashboard card ──────────────────────────────────────────────
# Powers the grid-card view: one meter + unit + allottee + latest reading +
# current-month billing status, pre-joined server-side to avoid N+1 queries.
# The view is responsible for populating `latest_by_meter`, `bill_by_unit`,
# and `month_start` in the serializer context (see views.py).
class MeterCardSerializer(serializers.ModelSerializer):
    unit_id        = serializers.IntegerField(read_only=True)
    unit_no        = serializers.CharField(source='unit.unit_no', read_only=True)
    floor_no       = serializers.IntegerField(source='unit.floor_no', read_only=True)
    building_id    = serializers.IntegerField(source='unit.building_id', read_only=True)
    building_name  = serializers.CharField(source='unit.building.name', read_only=True)
    project_id     = serializers.IntegerField(source='unit.building.project_id', read_only=True)
    project_name   = serializers.CharField(source='unit.building.project.name', read_only=True)
    allottee_name  = serializers.CharField(source='unit.allottee.name', read_only=True, default='')
    allottee_mobile = serializers.SerializerMethodField()
    unit_status    = serializers.CharField(source='unit.status', read_only=True)

    previous_reading      = serializers.SerializerMethodField()
    previous_reading_date = serializers.SerializerMethodField()
    reading_status         = serializers.SerializerMethodField()
    billing_status          = serializers.SerializerMethodField()
    reading_due_status       = serializers.SerializerMethodField()

    class Meta:
        model = Meter
        fields = [
            'id', 'meter_no', 'barcode', 'meter_type',
            'unit_id', 'unit_no', 'floor_no',
            'building_id', 'building_name', 'project_id', 'project_name',
            'allottee_name', 'allottee_mobile', 'unit_status',
            'previous_reading', 'previous_reading_date',
            'reading_status', 'billing_status', 'reading_due_status',
        ]

    def get_allottee_mobile(self, obj):
        return obj.unit.mobile_number or ''

    def _latest_reading(self, obj):
        return self.context.get('latest_by_meter', {}).get(obj.id)

    def get_previous_reading(self, obj):
        r = self._latest_reading(obj)
        return str(r.current_reading) if r else '0.00'

    def get_previous_reading_date(self, obj):
        r = self._latest_reading(obj)
        return r.reading_date if r else None

    def get_reading_status(self, obj):
        if obj.unit.status != 'Active':
            return 'Inactive'

        month_start = self.context.get('month_start')
        r = self._latest_reading(obj)
        read_this_month = bool(r and month_start and r.reading_date >= month_start)

        if read_this_month:
            return 'Completed'

        bill = self.context.get('bill_by_unit', {}).get(obj.unit_id)
        if bill and not read_this_month:
            # A bill exists for this month but there's no matching reading —
            # flag for staff attention rather than silently treating as pending.
            return 'Problem'

        return 'Pending'

    def get_billing_status(self, obj):
        bill = self.context.get('bill_by_unit', {}).get(obj.unit_id)
        return bill.status if bill else 'Not Billed'

    def get_reading_due_status(self, obj):
        return 'Completed' if self.get_reading_status(obj) == 'Completed' else 'Due'