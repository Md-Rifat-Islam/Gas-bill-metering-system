from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from core.permissions import PaymentPermission, PaymentWritePermission, SystemSettingsPermission
from .models import Payment, PaymentChannelSettings
from .permissions import PaymentEditPermission
from .serializers import PaymentSerializer, PaymentReviewSerializer, PaymentChannelSettingsSerializer


class PaymentListCreateView(generics.ListCreateAPIView):
    queryset           = Payment.objects.all().select_related(
        'bill', 'bill__unit', 'bill__building', 'bill__project', 'bill__unit__allottee',
        'received_by', 'reviewed_by', 'submitted_by_customer',
    )
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentWritePermission]
    filter_backends    = [filters.SearchFilter]
    # THE FIX: no search_fields existed here at all, so the global
    # SearchFilter backend (already active project-wide via
    # DEFAULT_FILTER_BACKENDS) had nothing to search against — a `?search=`
    # param was silently ignored. Same pattern as BillListCreateView's
    # search_fields.
    search_fields = [
        'bill__bill_number', 'bill__unit__unit_no',
        'bill__unit__allottee__name', 'transaction_id',
    ]

    def get_queryset(self):
        qs           = super().get_queryset()
        bill         = self.request.query_params.get('bill')
        status_param = self.request.query_params.get('status')
        project      = self.request.query_params.get('project')
        if bill:
            qs = qs.filter(bill_id=bill)
        if status_param:
            qs = qs.filter(status=status_param)
        if project:
            qs = qs.filter(bill__project_id=project)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx


class PaymentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    — any role with PaymentPermission (existing, unchanged).
    PATCH  — Super Admin only (PaymentEditPermission), for correcting a
             payment's recorded details after the fact. PUT is intentionally
             disabled: this is meant for targeted corrections (fix a typo'd
             transaction id, adjust an amount), not full re-submission.
    DELETE — Super Admin only (PaymentEditPermission). If the payment was
             Approved, its amount is first reversed off the bill's
             paid/due totals — otherwise deleting an applied payment would
             leave the bill looking like it collected money it no longer
             has a payment record for.
    """
    queryset            = Payment.objects.all().select_related(
        'bill', 'bill__unit', 'bill__building', 'bill__unit__allottee',
    )
    serializer_class    = PaymentSerializer
    permission_classes  = [IsAuthenticated]
    http_method_names   = ['get', 'patch', 'delete']

    def get_permissions(self):
        if self.request.method in ('PATCH', 'DELETE'):
            return [IsAuthenticated(), PaymentEditPermission()]
        return [IsAuthenticated(), PaymentPermission()]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()
        old_data = PaymentSerializer(payment, context={'request': request}).data

        with transaction.atomic():
            if payment.status == Payment.STATUS_APPROVED:
                bill = payment.bill
                bill.paid_amount = bill.paid_amount - payment.paid_amount
                bill.due_amount  = bill.total_amount - bill.paid_amount
                bill._update_status()
                bill.save(update_fields=['paid_amount', 'due_amount', 'status', 'updated_at'])

            log_action(request.user, 'payments', payment.id, 'DELETE', old_data, None)
            payment.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


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