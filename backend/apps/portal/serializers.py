from rest_framework import serializers
from apps.billing.models import Bill
from apps.payments.models import Payment
from apps.authentication.models import CustomerUser
from apps.units.models import Unit
from .models import Notification

# Re-exported here so portal views can import everything portal-related from
# one place; the actual submit serializer lives in apps.payments since it
# creates a Payment and needs to stay next to PaymentSerializer/validation
# rules for consistency.
from apps.payments.serializers import PortalPaymentSubmitSerializer  # noqa: F401


class PortalProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerUser
        fields = ['id', 'name', 'mobile', 'email']
        read_only_fields = ['id', 'mobile']


class PortalUnitSerializer(serializers.ModelSerializer):
    """
    One flat belonging to the logged-in customer. Used by the post-login
    unit picker (when a mobile number has more than one unit registered
    against it) and the unit switcher in the portal header.
    """
    building_name = serializers.CharField(source='building.name', read_only=True)
    project_name  = serializers.CharField(source='building.project.name', read_only=True)

    class Meta:
        model  = Unit
        fields = ['id', 'unit_no', 'floor_no', 'building_name', 'project_name']


class PortalBillSerializer(serializers.ModelSerializer):
    unit_no       = serializers.CharField(source='unit.unit_no', read_only=True)
    floor_no      = serializers.IntegerField(source='unit.floor_no', read_only=True)
    building_name = serializers.CharField(source='building.name', read_only=True)
    project_name  = serializers.CharField(source='project.name', read_only=True)
    billing_month_display = serializers.SerializerMethodField()

    class Meta:
        model  = Bill
        fields = [
            'id', 'bill_number', 'unit_no', 'floor_no', 'building_name', 'project_name',
            'billing_month', 'billing_month_display',
            'previous_reading', 'current_reading', 'total_usage_m3',
            'unit_price', 'base_amount', 'service_charge',
            'extra_charge', 'discount', 'late_fee', 'is_adjusted', 'adjustment_reason',
            'total_amount', 'paid_amount', 'due_amount', 'status',
            'created_at',
        ]

    def get_billing_month_display(self, obj):
        return obj.billing_month.strftime('%B %Y')


class PortalPaymentSerializer(serializers.ModelSerializer):
    """
    Payment history entry for the customer portal. Extended to support the
    pending-payment banner (Bill Detail / Dashboard) and the payment detail
    modal (Payment History row click).
    """
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)
    billing_month_display = serializers.SerializerMethodField()

    class Meta:
        model  = Payment
        fields = [
            'id', 'bill', 'bill_number', 'billing_month_display',
            'paid_amount', 'payment_method', 'transaction_id', 'payment_date',
            'status', 'remarks', 'notes',
            'proof_image', 'proof_invoice',
            'created_at', 'reviewed_at',
        ]

    def get_billing_month_display(self, obj):
        return obj.bill.billing_month.strftime('%B %Y')


class NotificationSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True, default=None)

    class Meta:
        model  = Notification
        fields = [
            'id', 'notification_type', 'title', 'message',
            'bill', 'bill_number', 'is_read', 'created_at',
        ]
        read_only_fields = fields