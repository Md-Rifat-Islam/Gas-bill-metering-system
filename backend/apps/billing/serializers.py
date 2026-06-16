from rest_framework import serializers
from .models import Bill
from apps.units.models import Unit
from apps.buildings.models import Building
from apps.projects.models import Project
import datetime


class BillSerializer(serializers.ModelSerializer):
    unit_no         = serializers.CharField(source='unit.unit_no',           read_only=True)
    building_name   = serializers.CharField(source='building.name',          read_only=True)
    project_name    = serializers.CharField(source='project.name',           read_only=True)
    allottee_name   = serializers.CharField(source='unit.allottee.name',     read_only=True, default='')
    allottee_mobile = serializers.CharField(source='unit.mobile_number',     read_only=True, default='')
    billing_month_display = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.name',       read_only=True, default='')

    unit_id      = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(),     source='unit',     write_only=True)
    building_id  = serializers.PrimaryKeyRelatedField(queryset=Building.objects.all(), source='building', write_only=True)
    project_id   = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(),  source='project',  write_only=True)

    class Meta:
        model  = Bill
        fields = [
            'id', 'bill_number',
            'unit_id', 'unit_no',
            'building_id', 'building_name',
            'project_id', 'project_name',
            'billing_month', 'billing_month_display',
            'allottee_name', 'allottee_mobile',
            'previous_reading', 'current_reading', 'total_usage_m3', 'total_usage_kg', 'conversion_factor',
            'unit_price', 'base_amount', 'service_charge',
            'extra_charge', 'discount', 'late_fee', 'is_adjusted', 'adjustment_reason',
            'total_amount', 'paid_amount', 'due_amount', 'status',
            'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'bill_number', 'base_amount', 'total_amount', 'due_amount', 'status',
            'total_usage_m3', 'total_usage_kg', 'paid_amount', 'created_at', 'updated_at',
        ]

    def get_billing_month_display(self, obj):
        return obj.billing_month.strftime('%B %Y')

    def validate_billing_month(self, value):
        """
        Accept both 'YYYY-MM-DD' (DateField default) and 'YYYY-MM' (from <input type=month>).
        Always normalise to first day of that month.
        """
        if isinstance(value, str) and len(value) == 7:
            # 'YYYY-MM' → parse and set day=1
            try:
                dt = datetime.datetime.strptime(value, '%Y-%m')
                return dt.date().replace(day=1)
            except ValueError:
                raise serializers.ValidationError('Invalid billing month format. Use YYYY-MM.')
        if isinstance(value, datetime.date):
            return value.replace(day=1)
        return value

    def validate(self, data):
        prev = data.get('previous_reading', 0)
        curr = data.get('current_reading', 0)
        if curr < prev:
            raise serializers.ValidationError({'current_reading': 'Current reading must be ≥ previous reading.'})
        return data

    def create(self, validated_data):
        validated_data['bill_number'] = Bill.generate_bill_number()
        validated_data['created_by']  = self.context['request'].user
        bill = Bill(**validated_data)
        bill.calculate()
        bill.full_clean()
        bill.save()
        return bill

    def update(self, instance, validated_data):
        validated_data['last_updated_by'] = self.context['request'].user
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.calculate()
        instance.full_clean()
        instance.save()
        return instance