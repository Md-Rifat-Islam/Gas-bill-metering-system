from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.conf import settings
from django.db.models import Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from apps.billing.models import Bill
from apps.payments.models import Payment, PaymentTransaction, PaymentChannelSettings
from apps.payments.serializers import PaymentChannelSettingsSerializer
from apps.payments.bkash_client import BkashError
from apps.payments.services import initiate_bkash_checkout
from apps.authentication.customer_auth import CustomerJWTAuthentication
from core.permissions import IsCustomer
from .models import Notification
from .serializers import (
    PortalProfileSerializer, PortalBillSerializer, PortalPaymentSerializer,
    PortalPaymentSubmitSerializer, NotificationSerializer, PortalUnitSerializer,
)


class CustomerScopedMixin:
    """Shared auth/permission + queryset scoping for all portal endpoints."""
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes     = [IsAuthenticated, IsCustomer]

    def get_selected_unit_id(self):
        """
        A customer can have more than one flat registered under the same
        mobile number. The frontend sends the currently-selected unit as
        ?unit=<id> on GET requests, or a `unit` field in the body for
        POST/PATCH. Filtering below always combines this with mobile_number
        — so a stray or forged unit id just yields an empty queryset
        instead of leaking another customer's data. No separate ownership
        check needed.
        """
        unit_id = self.request.query_params.get('unit')
        if unit_id:
            return unit_id
        # request.data is only meaningful for POST/PATCH/PUT; safe no-op on GET
        if hasattr(self.request, 'data'):
            return self.request.data.get('unit')
        return None

    def get_bill_queryset(self):
        # A customer's bills = bills for units whose registered mobile matches theirs,
        # narrowed further to one unit once they've picked which flat they mean.
        qs = Bill.objects.filter(unit__mobile_number=self.request.user.mobile)
        unit_id = self.get_selected_unit_id()
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs


# ── Units ─────────────────────────────────────────────────────────────────────

class PortalUnitListView(CustomerScopedMixin, APIView):
    """
    GET /api/v1/portal/units/

    Every unit registered under the logged-in customer's mobile number.
    Powers the unit picker shown right after login when a customer has
    more than one flat, and the unit switcher in the portal header. For a
    customer with exactly one unit, the frontend skips the picker and
    auto-selects it — this endpoint's shape doesn't change either way.
    """
    def get(self, request):
        from apps.units.models import Unit
        units = (
            Unit.objects
            .filter(mobile_number=request.user.mobile)
            .select_related('building', 'building__project')
            .order_by('building__name', 'floor_no', 'unit_no')
        )
        return Response(PortalUnitSerializer(units, many=True).data)


# ── Profile ────────────────────────────────────────────────────────────────────

class PortalMeView(CustomerScopedMixin, APIView):
    def get(self, request):
        return Response(PortalProfileSerializer(request.user).data)

    def patch(self, request):
        # Customer can only edit name + email — mobile is the login identity
        serializer = PortalProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ── Dashboard ─────────────────────────────────────────────────────────────────

class PortalDashboardView(CustomerScopedMixin, APIView):
    def get(self, request):
        bills  = self.get_bill_queryset()
        latest = bills.order_by('-billing_month').first()

        total_due  = bills.aggregate(Sum('due_amount'))['due_amount__sum']  or 0
        total_paid = bills.aggregate(Sum('paid_amount'))['paid_amount__sum'] or 0

        recent = list(bills.order_by('-billing_month')[:6])
        usage_trend = [
            {'month': b.billing_month.strftime('%b %Y'), 'usage': float(b.total_usage_m3)}
            for b in reversed(recent)
        ]

        unread_notifications = Notification.objects.filter(
            customer=request.user, is_read=False
        ).count()

        return Response({
            'total_due':   total_due,
            'total_paid':  total_paid,
            'bill_count':  bills.count(),
            'unpaid_count': bills.filter(status__in=['Unpaid', 'Partial']).count(),
            'latest_bill': PortalBillSerializer(latest).data if latest else None,
            'usage_trend': usage_trend,
            'unread_notifications': unread_notifications,
        })


# ── Bills ─────────────────────────────────────────────────────────────────────

class PortalBillListView(CustomerScopedMixin, generics.ListAPIView):
    serializer_class = PortalBillSerializer

    def get_queryset(self):
        return self.get_bill_queryset().order_by('-billing_month')


class PortalBillDetailView(CustomerScopedMixin, generics.RetrieveAPIView):
    serializer_class = PortalBillSerializer

    def get_queryset(self):
        return self.get_bill_queryset()


# ── Payments ──────────────────────────────────────────────────────────────────

class PortalPaymentListView(CustomerScopedMixin, generics.ListAPIView):
    serializer_class = PortalPaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.filter(bill__unit__mobile_number=self.request.user.mobile)
        unit_id = self.get_selected_unit_id()
        if unit_id:
            qs = qs.filter(bill__unit_id=unit_id)
        return qs.select_related('bill').order_by('-created_at')


class PortalPaymentSubmitView(CustomerScopedMixin, generics.CreateAPIView):
    """
    Customer submits a payment with proof for review. Always created as
    Pending — the bill balance is untouched until an accountant/admin
    approves it via PaymentApproveView (apps.payments.views).
    """
    serializer_class = PortalPaymentSubmitSerializer
    parser_classes    = [MultiPartParser, FormParser, JSONParser]


class PortalPaymentInitiateView(CustomerScopedMixin, APIView):
    """
    Initiate a real bKash Tokenized Checkout payment for a bill. Returns
    the bKash-hosted checkout URL — the frontend redirects the browser to
    it (window.location.href), the customer completes payment there, and
    bKash redirects back to BkashCallbackView (apps.payments.views), which
    verifies the result server-side and auto-approves the payment.

    If bKash itself is unreachable/misconfigured, falls back gracefully:
    returns an error the frontend shows alongside the existing manual
    payment-channels + proof-upload flow, so a bKash outage never blocks
    a customer from paying.
    """
    def post(self, request):
        bill_id = request.data.get('bill_id')
        bill = self.get_bill_queryset().filter(id=bill_id).first()
        if not bill:
            return Response({'error': 'Bill not found'}, status=status.HTTP_404_NOT_FOUND)
        if bill.due_amount <= 0:
            return Response({'error': 'This bill has no due amount.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            txn = initiate_bkash_checkout(
                bill, source=PaymentTransaction.SOURCE_CUSTOMER, initiated_by_customer=request.user,
            )
        except BkashError as exc:
            return Response({
                'error': str(exc),
                'fallback': 'Please use one of the payment channels shown above and submit proof below.',
            }, status=502)

        return Response({
            'bkash_url': txn.raw_response.get('bkashURL'),
            'transaction_id': txn.gateway_transaction_id,
        })


class PortalPaymentChannelView(APIView):
    """Read-only view of bKash/Nagad/Bank details for the customer portal."""
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes     = [IsAuthenticated, IsCustomer]

    def get(self, request):
        settings_obj = PaymentChannelSettings.get_solo()
        return Response(PaymentChannelSettingsSerializer(settings_obj).data)


# ── Notifications ───────────────────────────────────────────────────────────────

class NotificationListView(CustomerScopedMixin, generics.ListAPIView):
    """
    GET /api/v1/portal/notifications/

    All notifications for the logged-in customer — bill-created events and
    day-5/day-10 payment reminders (see signals.py / tasks.py), newest
    first. Not paginated: a customer's notification volume is small enough
    (one per bill created, up to two reminders per bill) that this is safe.

    NOTE: deliberately NOT filtered by get_selected_unit_id() — a
    notification isn't attached to "the currently viewed unit", it's
    attached to the customer as a whole (their Notification.customer FK),
    so a customer with two flats should see notifications for both
    regardless of which unit they currently have selected.
    """
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(customer=self.request.user)


class NotificationMarkReadView(CustomerScopedMixin, APIView):
    """POST /api/v1/portal/notifications/<id>/read/ — marks one as read."""

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, customer=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(CustomerScopedMixin, APIView):
    """POST /api/v1/portal/notifications/read-all/ — marks every unread one as read."""

    def post(self, request):
        updated = Notification.objects.filter(
            customer=request.user, is_read=False
        ).update(is_read=True)
        return Response({'marked_read': updated})


# ── Invoice PDF ───────────────────────────────────────────────────────────────

class PortalInvoicePDFView(CustomerScopedMixin, APIView):
    def get(self, request, pk):
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas

        bill = self.get_bill_queryset().filter(id=pk).first()
        if not bill:
            return Response({'error': 'Bill not found'}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="invoice-{bill.bill_number}.pdf"'

        p = canvas.Canvas(response, pagesize=A4)
        width, height = A4
        y = height - 25 * mm

        def draw_logo(path, x, y, target_height):
            """
            Draws one logo at (x, y) scaled to target_height, preserving
            its real aspect ratio (read via ImageReader rather than
            assumed), and returns the width actually drawn so the next
            logo can be placed after it without overlapping or guessing.
            Fails silently — a missing logo file on a given deployment
            shouldn't break invoice generation, just omit that logo.
            """
            try:
                img = ImageReader(path)
                iw, ih = img.getSize()
                drawn_width = target_height * (iw / ih)
                p.drawImage(
                    img, x, y, width=drawn_width, height=target_height,
                    preserveAspectRatio=True, mask='auto',
                )
                return drawn_width
            except Exception:
                return 0

        logo_height = 12 * mm
        logo_y = height - 20 * mm - logo_height
        deco_logo = settings.BASE_DIR / 'static' / 'branding' / 'deco-logo.png'
        dtel_logo = settings.BASE_DIR / 'static' / 'branding' / 'dtel-logo.png'

        x = 20 * mm
        drawn = draw_logo(str(deco_logo), x, logo_y, logo_height)
        if drawn:
            x += drawn + 6 * mm
        draw_logo(str(dtel_logo), x, logo_y, logo_height)

        y = logo_y - 8 * mm
        p.setFont('Helvetica-Bold', 16)
        p.drawString(20 * mm, y, 'Invoice')
        y -= 6 * mm
        p.setFont('Helvetica', 9)
        p.setFillGray(0.4)
        p.drawString(20 * mm, y, 'Utility Billing System')
        p.setFillGray(0)
        y -= 12 * mm

        p.setFont('Helvetica-Bold', 11)
        p.drawString(20 * mm, y, f"Bill No: {bill.bill_number}")
        p.drawString(120 * mm, y, f"Status: {bill.status}")
        y -= 8 * mm

        p.setFont('Helvetica', 10)
        rows = [
            ('Billing Month', bill.billing_month.strftime('%B %Y')),
            ('Project',  bill.project.name),
            ('Building', bill.building.name),
            ('Unit',     bill.unit.unit_no),
        ]
        for label, val in rows:
            p.drawString(20 * mm, y, f"{label}:")
            p.drawString(60 * mm, y, str(val))
            y -= 6 * mm

        y -= 4 * mm
        p.line(20 * mm, y, 190 * mm, y)
        y -= 8 * mm

        p.setFont('Helvetica-Bold', 10)
        p.drawString(20 * mm, y, 'Meter Readings')
        y -= 7 * mm
        p.setFont('Helvetica', 10)
        for label, val in [
            ('Previous Reading', f"{bill.previous_reading} m³"),
            ('Current Reading',  f"{bill.current_reading} m³"),
            ('Usage',            f"{bill.total_usage_m3} m³"),
            ('Unit Price',       f"৳ {bill.unit_price} / m³"),
        ]:
            p.drawString(20 * mm, y, label)
            p.drawRightString(190 * mm, y, val)
            y -= 6 * mm

        y -= 4 * mm
        p.line(20 * mm, y, 190 * mm, y)
        y -= 8 * mm

        p.setFont('Helvetica-Bold', 10)
        p.drawString(20 * mm, y, 'Charges')
        y -= 7 * mm
        p.setFont('Helvetica', 10)
        charge_rows = [
            ('Base Amount',    bill.base_amount),
            ('Service Charge', bill.service_charge),
        ]
        if bill.extra_charge:
            charge_rows.append(('Extra Charge', bill.extra_charge))
        if bill.late_fee:
            charge_rows.append(('Late Fee', bill.late_fee))
        if bill.discount:
            charge_rows.append(('Discount', -bill.discount))
        for label, val in charge_rows:
            p.drawString(20 * mm, y, label)
            p.drawRightString(190 * mm, y, f"৳ {val}")
            y -= 6 * mm

        y -= 4 * mm
        p.line(20 * mm, y, 190 * mm, y)
        y -= 8 * mm

        p.setFont('Helvetica-Bold', 12)
        for label, val in [
            ('Total Amount', bill.total_amount),
            ('Paid Amount',  bill.paid_amount),
            ('Due Amount',   bill.due_amount),
        ]:
            p.drawString(20 * mm, y, label)
            p.drawRightString(190 * mm, y, f"৳ {val}")
            y -= 7 * mm

        if bill.is_adjusted and bill.adjustment_reason:
            y -= 5 * mm
            p.setFont('Helvetica-Oblique', 9)
            p.drawString(20 * mm, y, f"Adjustment note: {bill.adjustment_reason}")

        p.showPage()
        p.save()
        return response