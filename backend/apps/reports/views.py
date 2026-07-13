from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
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


# ── Excel Export: Billing (generic, filter-aware) ─────────────────────────────

class ExportBillsExcelView(APIView):
    """
    GET /api/v1/reports/export/bills/
        ?status=&project=&building=&unit=&search=
        &month=YYYY-MM | &year=YYYY | &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD

    Mirrors the filter fields BillListCreateView already supports (status,
    project, building, unit, search) plus explicit date-range dimensions
    (Monthly / Yearly / Custom Date per spec) so this always exports exactly
    what's currently filtered, regardless of which screen triggered it.
    """
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request):
        from django.http import HttpResponse
        from apps.reports.exports.excel_exports import export_bills_excel

        qs = Bill.objects.all().select_related(
            'unit__allottee', 'building', 'project'
        )

        status = request.query_params.get('status')
        project = request.query_params.get('project')
        building = request.query_params.get('building')
        unit = request.query_params.get('unit')
        search = request.query_params.get('search')

        if status:
            qs = qs.filter(status=status)
        if project:
            qs = qs.filter(project_id=project)
        if building:
            qs = qs.filter(building_id=building)
        if unit:
            qs = qs.filter(unit_id=unit)
        if search:
            qs = qs.filter(
                Q(bill_number__icontains=search) |
                Q(unit__unit_no__icontains=search) |
                Q(unit__allottee__name__icontains=search) |
                Q(unit__mobile_number__icontains=search)
            )

        # Monthly / Yearly / Custom Date — mutually exclusive, checked in
        # this priority order since a specific month is the most precise.
        month = request.query_params.get('month')          # YYYY-MM
        year = request.query_params.get('year')             # YYYY
        date_from = request.query_params.get('date_from')   # YYYY-MM-DD
        date_to = request.query_params.get('date_to')

        title = 'Billing Export'
        if month and len(month) == 7:
            qs = qs.filter(billing_month__year=int(month[:4]), billing_month__month=int(month[5:7]))
            title = f'Billing Export — {month}'
        elif year:
            qs = qs.filter(billing_month__year=int(year))
            title = f'Billing Export — {year}'
        elif date_from or date_to:
            if date_from:
                qs = qs.filter(billing_month__gte=date_from)
            if date_to:
                qs = qs.filter(billing_month__lte=date_to)
            title = 'Billing Export — Custom Range'

        qs = qs.order_by('-billing_month', 'building__name', 'unit__unit_no')

        xlsx_bytes = export_bills_excel(qs, title=title)

        response = HttpResponse(
            xlsx_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="billing_export.xlsx"'
        return response


# ── Excel Export: Payments (generic, filter-aware) ────────────────────────────

class ExportPaymentsExcelView(APIView):
    """
    GET /api/v1/reports/export/payments/
        ?status=&source=&payment_method=&bill=&date_from=&date_to=

    status: Pending / Approved / Rejected
    source: staff / customer — covers spec's "Customer" vs "Accountant"
            dimension (accountant-recorded payments are source=staff with
            received_by set; customer-submitted are source=customer)
    """
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request):
        from django.http import HttpResponse
        from apps.reports.exports.excel_exports import export_payments_excel

        qs = Payment.objects.all().select_related(
            'bill__unit__allottee', 'bill__building', 'bill__project',
            'received_by', 'reviewed_by', 'submitted_by_customer',
        )

        status = request.query_params.get('status')
        source = request.query_params.get('source')
        method = request.query_params.get('payment_method')
        bill = request.query_params.get('bill')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if status:
            qs = qs.filter(status=status)
        if source:
            qs = qs.filter(source=source)
        if method:
            qs = qs.filter(payment_method=method)
        if bill:
            qs = qs.filter(bill_id=bill)
        if date_from:
            qs = qs.filter(payment_date__gte=date_from)
        if date_to:
            qs = qs.filter(payment_date__lte=date_to)

        qs = qs.order_by('-payment_date')

        title = 'Payment Export'
        if status:
            title = f'Payment Export — {status}'

        xlsx_bytes = export_payments_excel(qs, title=title)

        response = HttpResponse(
            xlsx_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="payments_export.xlsx"'
        return response