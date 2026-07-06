from rest_framework import serializers
from .models import Payment, PaymentChannelSettings
from apps.billing.models import Bill


class PaymentSerializer(serializers.ModelSerializer):
    """
    Used for staff-facing list/detail/manual-entry-create.
    Manual entry (create) always requires proof and a transaction id, and is
    auto-approved immediately (the accountant creating it IS the approval).
    """
    bill_number      = serializers.CharField(source='bill.bill_number', read_only=True)
    unit_no          = serializers.CharField(source='bill.unit.unit_no', read_only=True)
    building_name    = serializers.CharField(source='bill.building.name', read_only=True)
    allottee_name    = serializers.CharField(source='bill.unit.allottee.name', read_only=True, default='')
    received_by_name = serializers.CharField(source='received_by.name', read_only=True, default='')
    reviewed_by_name = serializers.CharField(source='reviewed_by.name', read_only=True, default='')
    submitted_by_customer_name = serializers.CharField(
        source='submitted_by_customer.name', read_only=True, default=''
    )
    proof_image_url   = serializers.SerializerMethodField()
    proof_invoice_url = serializers.SerializerMethodField()

    bill_id = serializers.PrimaryKeyRelatedField(
        queryset=Bill.objects.all(), source='bill', write_only=True
    )

    class Meta:
        model  = Payment
        fields = [
            'id', 'bill_id', 'bill_number', 'unit_no', 'building_name', 'allottee_name',
            'paid_amount', 'payment_method', 'transaction_id', 'payment_date',
            'proof_image', 'proof_image_url', 'proof_invoice', 'proof_invoice_url',
            'status', 'source', 'received_by_name', 'reviewed_by_name',
            'submitted_by_customer_name', 'remarks', 'notes', 'created_at',
        ]
        read_only_fields = ['status', 'source', 'created_at']
        extra_kwargs = {
            'proof_image':   {'write_only': True, 'required': False},
            'proof_invoice': {'write_only': True, 'required': False},
        }

    def get_proof_image_url(self, obj):
        return self._abs_url(obj.proof_image)

    def get_proof_invoice_url(self, obj):
        return self._abs_url(obj.proof_invoice)

    def _abs_url(self, file_field):
        if not file_field:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(file_field.url) if request else file_field.url

    def validate(self, data):
        bill   = data.get('bill')
        amount = data.get('paid_amount')

        if amount is not None and amount <= 0:
            raise serializers.ValidationError({'paid_amount': 'Payment amount must be positive.'})
        if bill and amount and amount > bill.due_amount:
            raise serializers.ValidationError(
                {'paid_amount': f'Amount {amount} exceeds due amount {bill.due_amount}.'}
            )
        # Manual entry: proof and transaction id are mandatory per spec.
        if self.instance is None:
            if not data.get('proof_image') and not data.get('proof_invoice'):
                raise serializers.ValidationError(
                    {'proof_image': 'Payment proof (image or invoice/PDF) is required.'}
                )
            if not data.get('transaction_id'):
                raise serializers.ValidationError(
                    {'transaction_id': 'Transaction ID is required.'}
                )
        return data

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from django.utils import timezone
        from apps.audit.utils import log_action

        user = self.context['request'].user
        validated_data['received_by']  = user
        validated_data['source']       = Payment.SOURCE_STAFF
        validated_data['status']       = Payment.STATUS_APPROVED
        validated_data['reviewed_by']  = user
        validated_data['reviewed_at']  = timezone.now()

        with db_transaction.atomic():
            payment = Payment.objects.create(**validated_data)
            payment.bill.apply_payment(payment.paid_amount)
            log_action(user, 'payments', payment.id, 'CREATE', None, {
                'bill_id': payment.bill.id,
                'amount': str(payment.paid_amount),
                'method': payment.payment_method,
                'status': payment.status,
            })
        return payment


class PortalPaymentSubmitSerializer(serializers.ModelSerializer):
    """
    Customer portal submission — always created as Pending, never touches
    the bill balance. The accountant's approve/reject action is what applies
    it (see PaymentApproveView).
    """
    bill_id = serializers.PrimaryKeyRelatedField(
        queryset=Bill.objects.all(), source='bill', write_only=True
    )

    class Meta:
        model  = Payment
        fields = [
            'id', 'bill_id', 'paid_amount', 'payment_method', 'transaction_id',
            'payment_date', 'proof_image', 'proof_invoice', 'notes', 'status', 'created_at',
        ]
        read_only_fields = ['status', 'created_at']

    def validate(self, data):
        bill     = data['bill']
        amount   = data['paid_amount']
        customer = self.context['request'].user

        if bill.unit.mobile_number != customer.mobile:
            raise serializers.ValidationError('You can only submit payments for your own bills.')
        if amount <= 0:
            raise serializers.ValidationError({'paid_amount': 'Payment amount must be positive.'})
        if amount > bill.due_amount:
            raise serializers.ValidationError(
                {'paid_amount': f'Amount exceeds the due amount of {bill.due_amount}.'}
            )
        if not data.get('transaction_id'):
            raise serializers.ValidationError({'transaction_id': 'Transaction ID is required.'})
        if not data.get('proof_image') and not data.get('proof_invoice'):
            raise serializers.ValidationError(
                {'proof_image': 'Please attach a payment screenshot or invoice/receipt as proof.'}
            )
        return data

    def create(self, validated_data):
        from apps.audit.utils import log_action

        customer = self.context['request'].user
        validated_data['source'] = Payment.SOURCE_CUSTOMER
        validated_data['status'] = Payment.STATUS_PENDING
        validated_data['submitted_by_customer'] = customer

        payment = Payment.objects.create(**validated_data)
        # Deliberately no bill.apply_payment() here — deferred until an
        # accountant/admin approves it (see PaymentApproveView).
        #
        # NOTE: log_action's `changed_by` appears to expect a StaffUser
        # instance (unconfirmed — apps/audit/models.py not available at the
        # time this was written). Passing the CustomerUser directly could
        # silently fail there, so we pass None and record the customer's
        # identity in the JSON payload instead. Revisit once audit's model
        # is confirmed to support a customer actor.
        log_action(None, 'payments', payment.id, 'CREATE', None, {
            'bill_id': payment.bill.id,
            'amount': str(payment.paid_amount),
            'source': 'customer',
            'customer_id': customer.id,
            'customer_mobile': customer.mobile,
        })
        return payment


class PaymentReviewSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True)


class PaymentChannelSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.name', read_only=True, default='')

    class Meta:
        model = PaymentChannelSettings
        fields = [
            'bkash_number', 'bkash_type', 'nagad_number',
            'bank_name', 'bank_account_name', 'bank_account_number',
            'bank_branch', 'bank_routing_number', 'instructions',
            'updated_by_name', 'updated_at',
        ]