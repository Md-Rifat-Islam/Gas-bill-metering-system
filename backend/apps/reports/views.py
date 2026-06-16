from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth
from apps.billing.models import Bill
from apps.payments.models import Payment
from core.permissions import (
    ReportPermission, FinancialReportPermission,
    role, R, A, BO, AC, dashboard_scope,
)


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.projects.models import Project
        from apps.buildings.models import Building
        from apps.units.models import Unit

        r     = role(request)
        scope = dashboard_scope(request)
        data  = {'role': r, 'modules': scope}

        # All roles get counts
        data['projects']    = Project.objects.filter(is_active=True).count()
        data['buildings']   = Building.objects.filter(is_active=True).count()
        data['units']       = Unit.objects.filter(status='Active').count()
        data['total_bills'] = Bill.objects.count()
        data['unpaid_bills']  = Bill.objects.filter(status='Unpaid').count()
        data['partial_bills'] = Bill.objects.filter(status='Partial').count()
        data['paid_bills']    = Bill.objects.filter(status='Paid').count()

        # Financial totals: Super Admin, Admin, Accountant only
        if r in (R, A, AC):
            data['total_revenue'] = Bill.objects.aggregate(Sum('paid_amount'))['paid_amount__sum'] or 0
            data['total_due']     = Bill.objects.aggregate(Sum('due_amount'))['due_amount__sum'] or 0

        return Response(data)


class MonthlyRevenueView(APIView):
    permission_classes = [IsAuthenticated, FinancialReportPermission]

    def get(self, request):
        data = (
            Bill.objects
            .annotate(month=TruncMonth('billing_month'))
            .values('month')
            .annotate(
                total_billed=Sum('total_amount'),
                total_collected=Sum('paid_amount'),
                total_due=Sum('due_amount'),
                bill_count=Count('id'),
            )
            .order_by('-month')[:12]
        )
        return Response(list(data))


class ProjectRevenueView(APIView):
    permission_classes = [IsAuthenticated, FinancialReportPermission]

    def get(self, request):
        data = (
            Bill.objects
            .values('project__id', 'project__name')
            .annotate(
                total_billed=Sum('total_amount'),
                total_collected=Sum('paid_amount'),
                total_due=Sum('due_amount'),
                bill_count=Count('id'),
            )
            .order_by('-total_billed')
        )
        return Response(list(data))


class BuildingRevenueView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request):
        qs = Bill.objects.values('building__id', 'building__name', 'building__project__name')
        project_id = request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        data = qs.annotate(
            total_billed=Sum('total_amount'),
            total_collected=Sum('paid_amount'),
            total_due=Sum('due_amount'),
            bill_count=Count('id'),
        ).order_by('-total_billed')
        return Response(list(data))


class UnpaidBillsView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request):
        qs = Bill.objects.filter(status__in=['Unpaid', 'Partial']).values(
            'id', 'bill_number', 'billing_month', 'status',
            'unit__unit_no', 'unit__allottee__name', 'unit__mobile_number',
            'building__name', 'project__name',
            'total_amount', 'paid_amount', 'due_amount',
        ).order_by('billing_month')
        return Response(list(qs))


class PaymentMethodSummaryView(APIView):
    permission_classes = [IsAuthenticated, FinancialReportPermission]

    def get(self, request):
        data = (
            Payment.objects
            .values('payment_method')
            .annotate(total_amount=Sum('paid_amount'), count=Count('id'))
            .order_by('-total_amount')
        )
        return Response(list(data))


# ── Billing Officer specific views ────────────────────────────────────────────

class BillingQueueView(APIView):
    """Billing work queue: pending bills for current month."""
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request):
        from django.utils import timezone
        import calendar
        today = timezone.now().date()
        first = today.replace(day=1)
        data = (
            Bill.objects.filter(billing_month=first, status__in=['Unpaid', 'Partial'])
            .values(
                'id', 'bill_number', 'unit__unit_no', 'unit__allottee__name',
                'unit__mobile_number', 'building__name', 'total_amount', 'due_amount', 'status',
            )
            .order_by('building__name', 'unit__unit_no')
        )
        return Response(list(data))