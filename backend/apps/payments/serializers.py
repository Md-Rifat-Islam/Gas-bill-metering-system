from rest_framework import serializers, generics
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from .models import Payment
from apps.billing.models import Bill
from apps.audit.utils import log_action
from core.permissions import PaymentPermission, PaymentWritePermission


class PaymentSerializer(serializers.ModelSerializer):
    bill_number      = serializers.CharField(source='bill.bill_number', read_only=True)
    received_by_name = serializers.CharField(source='received_by.name', read_only=True, default='')
    bill_id          = serializers.PrimaryKeyRelatedField(
        queryset=Bill.objects.all(), source='bill', write_only=True
    )

    class Meta:
        model  = Payment
        fields = [
            'id', 'bill_id', 'bill_number', 'paid_amount', 'payment_method',
            'transaction_id', 'payment_date', 'received_by_name', 'notes', 'created_at',
        ]
        read_only_fields = ['payment_date', 'created_at']

    def validate(self, data):
        bill   = data.get('bill')
        amount = data.get('paid_amount')
        if amount <= 0:
            raise serializers.ValidationError('Payment amount must be positive.')
        if bill and amount > bill.due_amount:
            raise serializers.ValidationError(
                f'Amount {amount} exceeds due amount {bill.due_amount}.'
            )
        return data

    @transaction.atomic
    def create(self, validated_data):
        validated_data['received_by'] = self.context['request'].user
        payment = Payment.objects.create(**validated_data)
        payment.bill.apply_payment(payment.paid_amount)
        log_action(
            self.context['request'].user, 'payments', payment.id, 'CREATE', None,
            {'bill_id': payment.bill.id, 'amount': str(payment.paid_amount), 'method': payment.payment_method},
        )
        return payment


class PaymentListCreateView(generics.ListCreateAPIView):
    queryset           = Payment.objects.all().select_related('bill', 'received_by')
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def get_queryset(self):
        qs     = super().get_queryset()
        bill   = self.request.query_params.get('bill')
        if bill:
            qs = qs.filter(bill_id=bill)
        return qs


class PaymentDetailView(generics.RetrieveAPIView):
    queryset           = Payment.objects.all()
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentPermission]