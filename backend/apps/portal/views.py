from datetime import datetime

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Sum, Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from apps.billing.models import Bill
from apps.payments.models import Payment, PaymentTransaction, PaymentChannelSettings
from apps.payments.serializers import PaymentChannelSettingsSerializer
from apps.payments.bkash_client import BkashError
from apps.payments.services import initiate_bkash_checkout
from apps.authentication.customer_auth import CustomerJWTAuthentication
from apps.projects.models import Project
from apps.units.models import Unit
from core.permissions import IsCustomer
from .models import Notification
from .serializers import (
    PortalProfileSerializer, PortalBillSerializer, PortalPaymentSerializer,
    PortalPaymentSubmitSerializer, NotificationSerializer, PortalUnitSerializer,
    PortalManagerBillSerializer,
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


# ── Project manager unit ──────────────────────────────────────────────────────
# A project can have one "manager unit" (Project.manager_unit, set by an Admin
# from the Units page). The resident of that unit gets a READ-ONLY view of the
# whole project's bill status: who has paid, who hasn't.
#
# Access rule, checked on the server for EVERY request (hiding the menu item
# in the frontend is only cosmetic):
#   the logged-in customer's mobile number must be the mobile_number of an
#   Active unit that is the manager_unit of an active project.
# It is deliberately independent of which flat is currently selected in the
# portal header — the manager overview isn't about one flat. A forged
# ?project= id for a project they don't manage is refused.

class ManagerScopedMixin(CustomerScopedMixin):

    def get_managed_projects(self):
        return list(
            Project.objects
            .filter(
                is_active=True,
                manager_unit__status=Unit.STATUS_ACTIVE,
                manager_unit__mobile_number=self.request.user.mobile,
            )
            .select_related('manager_unit__building')
            .order_by('name')
        )

    def get_managed_project(self):
        projects = self.get_managed_projects()
        if not projects:
            raise PermissionDenied('You are not a project manager.')

        project_id = self.request.query_params.get('project')
        if project_id:
            match = next((p for p in projects if str(p.id) == str(project_id)), None)
            if match is None:
                raise PermissionDenied('You do not manage this project.')
            return match
        if len(projects) == 1:
            return projects[0]
        raise ValidationError('Several projects are managed from this account — specify which one.')

    @staticmethod
    def parse_month(value):
        """'YYYY-MM' -> first day of that month, or None when not given."""
        if not value:
            return None
        try:
            return datetime.strptime(value, '%Y-%m').date().replace(day=1)
        except ValueError:
            raise ValidationError('month must be in YYYY-MM format.')


class PortalManagerAccessView(ManagerScopedMixin, APIView):
    """
    GET /api/v1/portal/manager/access/

    Always 200. Tells the portal whether to show the Project section at all,
    and for which project(s). Not an access grant by itself — the overview
    and bill endpoints below re-check on their own.
    """
    def get(self, request):
        projects = self.get_managed_projects()
        return Response({
            'is_manager': bool(projects),
            'projects': [
                {
                    'id': p.id,
                    'name': p.name,
                    'manager_unit_no': p.manager_unit.unit_no,
                    'manager_unit_building': p.manager_unit.building.name,
                }
                for p in projects
            ],
        })


class PortalManagerOverviewView(ManagerScopedMixin, APIView):
    """
    GET /api/v1/portal/manager/overview/?project=<id>&month=YYYY-MM

    Bill-status summary for one month of the managed project (defaults to
    the latest month that has bills): counts of Paid / Partial / Unpaid,
    billed / collected / due totals, and the same per building. Also lists
    the months that have bills so the page can offer a month picker.
    """
    def get(self, request):
        project = self.get_managed_project()
        bills = Bill.objects.filter(project=project)

        month_dates = list(bills.dates('billing_month', 'month', order='DESC')[:24])
        months = [
            {'value': d.strftime('%Y-%m'), 'label': d.strftime('%B %Y')}
            for d in month_dates
        ]

        requested = self.parse_month(request.query_params.get('month'))
        month_start = requested or (month_dates[0] if month_dates else None)

        active_units = Unit.objects.filter(
            building__project=project, status=Unit.STATUS_ACTIVE
        ).count()

        summary = {
            'bill_count': 0, 'paid_count': 0, 'partial_count': 0, 'unpaid_count': 0,
            'total_billed': 0.0, 'total_paid': 0.0, 'total_due': 0.0,
            'collection_rate': 0.0, 'active_units': active_units, 'billed_units': 0,
        }
        by_building = []

        if month_start:
            qs = bills.filter(
                billing_month__year=month_start.year,
                billing_month__month=month_start.month,
            )
            agg = qs.aggregate(
                bill_count=Count('id'),
                paid_count=Count('id', filter=Q(status='Paid')),
                partial_count=Count('id', filter=Q(status='Partial')),
                unpaid_count=Count('id', filter=Q(status='Unpaid')),
                total_billed=Sum('total_amount'),
                total_paid=Sum('paid_amount'),
                total_due=Sum('due_amount'),
            )
            billed = float(agg['total_billed'] or 0)
            paid = float(agg['total_paid'] or 0)
            summary.update({
                'bill_count': agg['bill_count'],
                'paid_count': agg['paid_count'],
                'partial_count': agg['partial_count'],
                'unpaid_count': agg['unpaid_count'],
                'total_billed': billed,
                'total_paid': paid,
                'total_due': float(agg['total_due'] or 0),
                'collection_rate': round(paid / billed * 100, 1) if billed > 0 else 0.0,
                'billed_units': qs.values('unit_id').distinct().count(),
            })

            rows = (
                qs.values('building_id', 'building__name')
                .annotate(
                    bill_count=Count('id'),
                    paid_count=Count('id', filter=Q(status='Paid')),
                    partial_count=Count('id', filter=Q(status='Partial')),
                    unpaid_count=Count('id', filter=Q(status='Unpaid')),
                    total_billed=Sum('total_amount'),
                    total_paid=Sum('paid_amount'),
                    total_due=Sum('due_amount'),
                )
                .order_by('building__name')
            )
            by_building = [
                {
                    'building_id': r['building_id'],
                    'building_name': r['building__name'],
                    'bill_count': r['bill_count'],
                    'paid_count': r['paid_count'],
                    'partial_count': r['partial_count'],
                    'unpaid_count': r['unpaid_count'],
                    'total_billed': float(r['total_billed'] or 0),
                    'total_paid': float(r['total_paid'] or 0),
                    'total_due': float(r['total_due'] or 0),
                }
                for r in rows
            ]

        return Response({
            'project': {
                'id': project.id,
                'name': project.name,
                'manager_unit_no': project.manager_unit.unit_no,
                'manager_unit_building': project.manager_unit.building.name,
            },
            'month': month_start.strftime('%Y-%m') if month_start else None,
            'months': months,
            'summary': summary,
            'by_building': by_building,
        })


class PortalManagerBillListView(ManagerScopedMixin, generics.ListAPIView):
    """
    GET /api/v1/portal/manager/bills/
        ?project=<id>&month=YYYY-MM&status=Paid|Partial|Unpaid&building=<id>&search=<text>

    Paginated, read-only list of the managed project's bills — see
    PortalManagerBillSerializer for the (deliberately limited) fields.
    """
    serializer_class = PortalManagerBillSerializer

    def get_queryset(self):
        project = self.get_managed_project()
        params = self.request.query_params

        qs = (
            Bill.objects.filter(project=project)
            .select_related('unit', 'building')
            .order_by('-billing_month', 'building__name', 'unit__floor_no', 'unit__unit_no')
        )

        month_start = self.parse_month(params.get('month'))
        if month_start:
            qs = qs.filter(billing_month__year=month_start.year, billing_month__month=month_start.month)

        bill_status = params.get('status')
        if bill_status:
            if bill_status not in ('Paid', 'Partial', 'Unpaid'):
                raise ValidationError('status must be Paid, Partial or Unpaid.')
            qs = qs.filter(status=bill_status)

        building = params.get('building')
        if building:
            qs = qs.filter(building_id=building)

        search = params.get('search')
        if search:
            qs = qs.filter(Q(unit__unit_no__icontains=search) | Q(bill_number__icontains=search))

        return qs


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
    """
    GET /api/v1/portal/bills/<pk>/invoice/ (whatever your urls.py maps)

    The PDF layout itself lives in apps/portal/invoice.py so the design can
    be changed without touching this view.
    """
    def get(self, request, pk):
        from .invoice import generate_invoice_pdf

        bill = (
            self.get_bill_queryset()
            .select_related('project', 'building', 'unit', 'unit__allottee')
            .filter(id=pk)
            .first()
        )
        if not bill:
            return Response({'error': 'Bill not found'}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="invoice-{bill.bill_number}.pdf"'
        generate_invoice_pdf(bill, response)
        return response