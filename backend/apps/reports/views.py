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


# ── Excel Export: Building Summary + linked Unit (customer copy) sheets ──────

class ExportBuildingExcelView(APIView):
    """
    GET /api/v1/reports/export/building/<building_id>/?month=YYYY-MM-DD

    Generates a single .xlsx with:
      - one "<Building> Summary" sheet (master data — editable)
      - one "Unit ..." sheet per unit/bill (every cell formula-linked back
        to the Summary sheet, so editing the Summary instantly updates
        every Unit sheet when opened in Excel/LibreOffice)

    Restricted to Admin / Super Admin, matching the "When Admin exports
    both sheets together" requirement. (Super Admin always included since
    they have every Admin permission plus more.)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, building_id):
        from django.http import HttpResponse
        from apps.buildings.models import Building
        from apps.reports.exports.building_export import generate_building_workbook
        from core.permissions import role, R, A
        import io

        if role(request) not in (R, A):
            return Response(
                {'detail': 'Only Admin or Super Admin can export building data.'},
                status=403,
            )

        try:
            building = Building.objects.select_related('project', 'project__default_package', 'default_package').get(
                id=building_id
            )
        except Building.DoesNotExist:
            return Response({'detail': 'Building not found.'}, status=404)

        bills_qs = (
            Bill.objects.filter(building=building)
            .select_related('unit', 'unit__allottee', 'unit__package')
            .order_by('unit__floor_no', 'unit__unit_no')
        )

        month_param = request.query_params.get('month')
        if month_param:
            bills_qs = bills_qs.filter(billing_month=month_param)
        else:
            # Default: latest billing_month present for this building
            latest = bills_qs.order_by('-billing_month').values_list('billing_month', flat=True).first()
            if latest:
                bills_qs = bills_qs.filter(billing_month=latest)

        bills = list(bills_qs)

        wb = generate_building_workbook(building, bills)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f"{building.name.replace(' ', '_')}_gas_bill_export.xlsx"
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
