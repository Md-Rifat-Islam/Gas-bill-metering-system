from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth
from apps.billing.models import Bill
from apps.payments.models import Payment


class MonthlyRevenueView(APIView):
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
    def get(self, request):
        project_id = request.query_params.get('project')
        qs = Bill.objects.values('building__id', 'building__name', 'building__project__name')
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
    def get(self, request):
        qs = Bill.objects.filter(status__in=['Unpaid', 'Partial']).select_related(
            'unit__allottee', 'building', 'project'
        ).values(
            'id', 'bill_number', 'billing_month', 'status',
            'unit__unit_no', 'unit__allottee__name', 'unit__mobile_number',
            'building__name', 'project__name',
            'total_amount', 'paid_amount', 'due_amount'
        ).order_by('billing_month')
        return Response(list(qs))


class PaymentMethodSummaryView(APIView):
    def get(self, request):
        data = (
            Payment.objects
            .values('payment_method')
            .annotate(
                total_amount=Sum('paid_amount'),
                count=Count('id'),
            )
            .order_by('-total_amount')
        )
        return Response(list(data))


class DashboardSummaryView(APIView):
    def get(self, request):
        from apps.projects.models import Project
        from apps.buildings.models import Building
        from apps.units.models import Unit

        return Response({
            'projects': Project.objects.filter(is_active=True).count(),
            'buildings': Building.objects.filter(is_active=True).count(),
            'units': Unit.objects.filter(status='Active').count(),
            'total_bills': Bill.objects.count(),
            'total_revenue': Bill.objects.aggregate(Sum('paid_amount'))['paid_amount__sum'] or 0,
            'total_due': Bill.objects.aggregate(Sum('due_amount'))['due_amount__sum'] or 0,
            'unpaid_bills': Bill.objects.filter(status='Unpaid').count(),
            'partial_bills': Bill.objects.filter(status='Partial').count(),
            'paid_bills': Bill.objects.filter(status='Paid').count(),
        })
