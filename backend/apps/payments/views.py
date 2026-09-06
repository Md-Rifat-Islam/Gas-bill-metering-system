import logging

from django.conf import settings
from django.db import transaction
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from apps.billing.models import Bill
from core.permissions import PaymentPermission, PaymentWritePermission, SystemSettingsPermission
from .bkash_client import BkashError
from .models import Payment, PaymentChannelSettings, PaymentTransaction
from .permissions import PaymentEditPermission
from .serializers import PaymentSerializer, PaymentReviewSerializer, PaymentChannelSettingsSerializer
from .services import initiate_bkash_checkout, complete_bkash_transaction

logger = logging.getLogger('bkash')


class PaymentListCreateView(generics.ListCreateAPIView):
    queryset           = Payment.objects.all().select_related(
        'bill', 'bill__unit', 'bill__building', 'bill__project', 'bill__unit__allottee',
        'received_by', 'reviewed_by', 'submitted_by_customer',
    )
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentWritePermission]
    filter_backends    = [filters.SearchFilter]
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


# ── bKash Tokenized Checkout ───────────────────────────────────────────────────
class BkashInitiateView(APIView):
    """
    Staff-triggered bKash checkout — for when an accountant helps a walk-in
    customer pay their due bill via bKash at the counter. Returns the
    bKash-hosted checkout URL; the frontend redirects to it, the customer
    completes payment on their own phone/bKash app, and bKash redirects
    back to BkashCallbackView below.
    """
    permission_classes = [IsAuthenticated, PaymentWritePermission]

    def post(self, request):
        bill_id = request.data.get('bill_id')
        bill = get_object_or_404(
            Bill.objects.select_related('unit', 'building', 'project'), pk=bill_id
        )
        try:
            txn = initiate_bkash_checkout(
                bill, source=PaymentTransaction.SOURCE_STAFF, initiated_by_staff=request.user,
            )
        except BkashError as exc:
            return Response({'detail': str(exc)}, status=502)

        return Response({
            'bkash_url': txn.raw_response.get('bkashURL'),
            'transaction_id': txn.gateway_transaction_id,
        })


class BkashCallbackView(APIView):
    """
    bKash Tokenized Checkout redirects the customer's browser here after
    they complete/cancel/close the hosted checkout page. This is a browser
    redirect, not a server-to-server webhook (bKash's tokenized flow
    doesn't offer one) — so the query string is treated as only a pointer
    to which transaction to check, and the actual result is always
    re-verified via a server-side Execute Payment call before crediting
    anything (see services.complete_bkash_transaction).
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        payment_id = request.GET.get('paymentID')
        bkash_status = request.GET.get('status')  # 'success' | 'failure' | 'cancel'

        txn = (
            PaymentTransaction.objects
            .filter(bkash_payment_id=payment_id)
            .select_related('bill')
            .first()
        )
        if not txn:
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/portal/payments/bkash-result?status=error"
            )

        is_customer = txn.source == PaymentTransaction.SOURCE_CUSTOMER
        redirect_base = (
            f"{settings.FRONTEND_URL}/portal/payments/bkash-result"
            # Straight to the real staff route, not the legacy `/billing/:id`
            # path — that one redirects via a bare `<Navigate to=.../>` that
            # drops the query string, which would silently swallow
            # ?bkash=success&bill=... before BillDetailPage ever saw it.
            if is_customer else f"{settings.FRONTEND_URL}/staff/billing/{txn.bill_id}"
        )
        sep = '&' if '?' in redirect_base else '?'

        if bkash_status != 'success':
            if txn.status == PaymentTransaction.STATUS_PENDING:
                txn.status = PaymentTransaction.STATUS_FAILED
                txn.save(update_fields=['status'])
            return HttpResponseRedirect(f"{redirect_base}{sep}bkash=cancelled&bill={txn.bill_id}")

        try:
            complete_bkash_transaction(txn)
        except BkashError as exc:
            logger.warning('bKash callback failed for txn %s: %s', txn.id, exc)
            return HttpResponseRedirect(f"{redirect_base}{sep}bkash=failed&bill={txn.bill_id}")

        return HttpResponseRedirect(f"{redirect_base}{sep}bkash=success&bill={txn.bill_id}")