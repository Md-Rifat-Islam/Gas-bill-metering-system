from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from core.permissions import PaymentPermission, PaymentWritePermission, SystemSettingsPermission
from .models import Payment, PaymentChannelSettings
from .serializers import PaymentSerializer, PaymentReviewSerializer, PaymentChannelSettingsSerializer


class PaymentListCreateView(generics.ListCreateAPIView):
    queryset           = Payment.objects.all().select_related(
        'bill', 'bill__unit', 'bill__building', 'bill__unit__allottee',
        'received_by', 'reviewed_by', 'submitted_by_customer',
    )
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def get_queryset(self):
        qs     = super().get_queryset()
        bill   = self.request.query_params.get('bill')
        status_param = self.request.query_params.get('status')
        if bill:
            qs = qs.filter(bill_id=bill)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class PaymentDetailView(generics.RetrieveAPIView):
    queryset           = Payment.objects.all()
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentPermission]


# ── Accountant Approval Queue ──────────────────────────────────────────────────
class PendingPaymentListView(generics.ListAPIView):
    """Customer-submitted payments awaiting accountant/admin review."""
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def get_queryset(self):
        return (
            Payment.objects
            .filter(status=Payment.STATUS_PENDING)
            .select_related(
                'bill', 'bill__unit', 'bill__building', 'bill__unit__allottee',
                'submitted_by_customer',
            )
            .order_by('-created_at')
        )


class PaymentApproveView(APIView):
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def post(self, request, pk):
        payment = get_object_or_404(Payment.objects.select_related('bill'), pk=pk)
        if payment.status != Payment.STATUS_PENDING:
            return Response({'detail': 'Only pending payments can be approved.'}, status=400)

        serializer = PaymentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                old_status = payment.status
                payment.status      = Payment.STATUS_APPROVED
                payment.reviewed_by = request.user
                payment.reviewed_at = timezone.now()
                payment.remarks     = serializer.validated_data.get('remarks', '')
                payment.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'remarks'])

                payment.bill.apply_payment(payment.paid_amount)

                log_action(
                    request.user, 'payments', payment.id, 'UPDATE',
                    {'status': old_status},
                    {'status': payment.status, 'action': 'approved', 'remarks': payment.remarks},
                )
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(PaymentSerializer(payment, context={'request': request}).data)


class PaymentRejectView(APIView):
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def post(self, request, pk):
        payment = get_object_or_404(Payment, pk=pk)
        if payment.status != Payment.STATUS_PENDING:
            return Response({'detail': 'Only pending payments can be rejected.'}, status=400)

        serializer = PaymentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        remarks = serializer.validated_data.get('remarks', '').strip()
        if not remarks:
            return Response({'remarks': 'A rejection reason is required.'}, status=400)

        old_status = payment.status
        payment.status      = Payment.STATUS_REJECTED
        payment.reviewed_by = request.user
        payment.reviewed_at = timezone.now()
        payment.remarks     = remarks
        payment.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'remarks'])

        log_action(
            request.user, 'payments', payment.id, 'UPDATE',
            {'status': old_status},
            {'status': payment.status, 'action': 'rejected', 'remarks': remarks},
        )

        return Response(PaymentSerializer(payment, context={'request': request}).data)


# ── Payment Channel Settings (bKash / Nagad / Bank details) ───────────────────
class PaymentChannelSettingsView(APIView):
    """
    GET: any authenticated staff member can view (needed by any role that
    might reference it, e.g. accountants reconciling manual payments).
    PUT: Super Admin only — matches SystemSettingsPermission used elsewhere.
    """
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'PUT':
            return [IsAuthenticated(), SystemSettingsPermission()]
        return [IsAuthenticated()]

    def get(self, request):
        settings_obj = PaymentChannelSettings.get_solo()
        return Response(PaymentChannelSettingsSerializer(settings_obj).data)

    def put(self, request):
        settings_obj = PaymentChannelSettings.get_solo()
        serializer = PaymentChannelSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        log_action(
            request.user, 'payment_channel_settings', settings_obj.id, 'UPDATE', None, serializer.data
        )
        return Response(serializer.data)