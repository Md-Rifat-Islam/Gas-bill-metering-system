from rest_framework import serializers
from .models import Payment, PaymentChannelSettings
from apps.billing.models import Bill


class PaymentSerializer(serializers.ModelSerializer):
    """
    Used for staff-facing list/detail/manual-entry-create, and now also
    Super-Admin-only edits (see PaymentEditPermission / PaymentDetailView).
    Manual entry (create) requires a transaction id and is auto-approved
    immediately (the accountant creating it IS the approval). Proof is
    optional on both create and edit.
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

    # Read-only plain PK — this is what the frontend reads as `p.bill` (e.g.
    # PendingPaymentsPage's "View Bill" navigate(`/billing/${p.bill}`)).
    # Without this, GET responses had no `bill` field at all — only the
    # write-only `bill_id` below — so `p.bill` was always undefined.
    bill = serializers.PrimaryKeyRelatedField(read_only=True)

    # Write-only — used when CREATING/UPDATING a payment (request body sends
    # bill_id). Unrelated to reads; left exactly as before.
    bill_id = serializers.PrimaryKeyRelatedField(
        queryset=Bill.objects.all(), source='bill', write_only=True, required=False,
    )

    class Meta:
        model  = Payment
        fields = [
            'id', 'bill', 'bill_id', 'bill_number', 'unit_no', 'building_name', 'allottee_name',
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
        bill   = data.get('bill', getattr(self.instance, 'bill', None))
        amount = data.get('paid_amount', getattr(self.instance, 'paid_amount', None))

        if amount is not None and amount <= 0:
            raise serializers.ValidationError({'paid_amount': 'Payment amount must be positive.'})

        if bill and amount is not None:
            effective_due = bill.due_amount
            # THE FIX (editing support): when editing an already-Approved
            # payment, bill.due_amount already has THIS payment's existing
            # amount subtracted out. Comparing the NEW amount against that
            # as-is would make even a same-amount edit look like it exceeds
            # the due amount. Add the old amount back before comparing.
            if self.instance is not None and self.instance.status == Payment.STATUS_APPROVED:
                effective_due = effective_due + self.instance.paid_amount
            if amount > effective_due:
                raise serializers.ValidationError(
                    {'paid_amount': f'Amount {amount} exceeds due amount {effective_due}.'}
                )

        # Manual entry (create only): transaction id is still required.
        # THE FIX: proof used to be mandatory here too — now optional, per
        # design change. The model fields themselves already allow
        # null/blank; this was the only place actually enforcing it.
        if self.instance is None:
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

    def update(self, instance, validated_data):
        """
        Super-Admin-only correction of an existing payment's details (see
        PaymentEditPermission). If the payment is/was Approved, the bill's
        paid_amount is adjusted by the DIFFERENCE between the old and new
        amount rather than re-running apply_payment (which is written for
        adding a brand-new payment, not correcting an existing one) — this
        keeps a same-amount edit (e.g. just fixing a typo'd transaction id)
        a true no-op on the bill's totals.
        """
        from django.db import transaction as db_transaction
        from apps.audit.utils import log_action

        user = self.context['request'].user
        old_data = PaymentSerializer(instance, context=self.context).data
        old_amount = instance.paid_amount
        was_approved = instance.status == Payment.STATUS_APPROVED
        bill = validated_data.get('bill', instance.bill)

        with db_transaction.atomic():
            for attr, val in validated_data.items():
                setattr(instance, attr, val)
            instance.save()

            if was_approved:
                bill.paid_amount = bill.paid_amount - old_amount + instance.paid_amount
                bill.due_amount = bill.total_amount - bill.paid_amount
                bill._update_status()
                bill.save(update_fields=['paid_amount', 'due_amount', 'status', 'updated_at'])

            log_action(
                user, 'payments', instance.id, 'UPDATE',
                old_data, PaymentSerializer(instance, context=self.context).data,
            )
        return instance


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