from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.http import HttpResponse

from apps.billing.models import Bill
from apps.payments.models import Payment, PaymentTransaction
from apps.authentication.customer_auth import CustomerJWTAuthentication
from core.permissions import IsCustomer
from .serializers import PortalProfileSerializer, PortalBillSerializer, PortalPaymentSerializer


class CustomerScopedMixin:
    """Shared auth/permission + queryset scoping for all portal endpoints."""
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes     = [IsAuthenticated, IsCustomer]

    def get_bill_queryset(self):
        # A customer's bills = bills for units whose registered mobile matches theirs
        return Bill.objects.filter(unit__mobile_number=self.request.user.mobile)


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

        return Response({
            'total_due':   total_due,
            'total_paid':  total_paid,
            'bill_count':  bills.count(),
            'unpaid_count': bills.filter(status__in=['Unpaid', 'Partial']).count(),
            'latest_bill': PortalBillSerializer(latest).data if latest else None,
            'usage_trend': usage_trend,
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
        return (
            Payment.objects
            .filter(bill__unit__mobile_number=self.request.user.mobile)
            .select_related('bill')
            .order_by('-payment_date')
        )


class PortalPaymentInitiateView(CustomerScopedMixin, APIView):
    """
    Initiate an online payment for a bill (bKash / SSLCommerz).

    NOTE: This is a stub that records a Pending PaymentTransaction.
    Wire up the real redirect using settings.BKASH_* / SSLCOMMERZ_* credentials.
    """
    def post(self, request):
        bill_id = request.data.get('bill_id')
        bill = self.get_bill_queryset().filter(id=bill_id).first()
        if not bill:
            return Response({'error': 'Bill not found'}, status=status.HTTP_404_NOT_FOUND)
        if bill.due_amount <= 0:
            return Response({'error': 'This bill has no due amount.'}, status=status.HTTP_400_BAD_REQUEST)

        txn = PaymentTransaction.objects.create(
            bill=bill,
            gateway_name='SSLCommerz',
            gateway_transaction_id=f"TXN-{bill.bill_number}-{int(bill.due_amount * 100)}",
            amount=bill.due_amount,
            status=PaymentTransaction.STATUS_PENDING,
        )
        return Response({
            'message': 'Online payment gateway is being configured. '
                       'Please contact your building office to complete this payment, '
                       'or pay via Cash/Bank/bKash at the office counter.',
            'transaction_id': txn.gateway_transaction_id,
            'amount': str(bill.due_amount),
        })


# ── Invoice PDF ───────────────────────────────────────────────────────────────

class PortalInvoicePDFView(CustomerScopedMixin, APIView):
    def get(self, request, pk):
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas

        bill = self.get_bill_queryset().filter(id=pk).first()
        if not bill:
            return Response({'error': 'Bill not found'}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="invoice-{bill.bill_number}.pdf"'

        p = canvas.Canvas(response, pagesize=A4)
        width, height = A4
        y = height - 25 * mm

        p.setFont('Helvetica-Bold', 18)
        p.drawString(20 * mm, y, 'DECO — Invoice')
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