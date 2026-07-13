from datetime import datetime, timedelta
from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .models import Bill
from .serializers import BillSerializer
from apps.audit.utils import log_action
from apps.units.models import Unit
from apps.meters.models import MeterReading
from core.permissions import BillPermission, BillDeletePermission, BillSpreadsheetEditPermission


class BillListCreateView(generics.ListCreateAPIView):
    queryset = Bill.objects.all().select_related(
        'unit__allottee', 'building', 'project', 'created_by'
    )
    serializer_class   = BillSerializer
    permission_classes = [IsAuthenticated, BillPermission]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'unit', 'building', 'project', 'billing_month']
    search_fields      = ['bill_number', 'unit__unit_no', 'unit__allottee__name', 'unit__mobile_number']
    ordering_fields    = ['billing_month', 'total_amount', 'created_at']

    @transaction.atomic
    def perform_create(self, serializer):
        bill = serializer.save()
        log_action(self.request.user, 'bills', bill.id, 'CREATE', None, BillSerializer(bill).data)


class BillDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Bill.objects.all().select_related('unit__allottee', 'building', 'project')
    serializer_class   = BillSerializer
    permission_classes = [IsAuthenticated, BillPermission]

    @transaction.atomic
    def perform_update(self, serializer):
        # Billing Officer must provide adjustment_reason if making adjustments
        user = self.request.user
        if user.role_name == 'billing_staff':
            data = serializer.validated_data
            has_adjustments = any([
                data.get('extra_charge', 0),
                data.get('discount', 0),
                data.get('late_fee', 0),
            ])
            if has_adjustments and not data.get('adjustment_reason'):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'adjustment_reason': 'Billing Officer must provide adjustment reason.'})
        old_data = BillSerializer(self.get_object()).data
        bill     = serializer.save()
        log_action(self.request.user, 'bills', bill.id, 'UPDATE', old_data, BillSerializer(bill).data)

    def destroy(self, request, *args, **kwargs):
        if request.user.role_name != 'super_admin':
            raise PermissionDenied('Only Super Admin can delete bills.')
        bill = self.get_object()
        log_action(request.user, 'bills', bill.id, 'DELETE', BillSerializer(bill).data, None)
        return super().destroy(request, *args, **kwargs)


class BillQuickEditView(generics.UpdateAPIView):
    """
    Dedicated inline-spreadsheet save endpoint — deliberately separate from
    BillDetailView so the general PATCH behavior used elsewhere (e.g. any
    future adjustment flow allowing Billing Officer) is untouched, while
    this one is locked to Super Admin/Admin per spec, and enforced
    server-side (not just hidden in the UI).
    """
    queryset           = Bill.objects.all().select_related('unit__allottee', 'building', 'project')
    serializer_class   = BillSerializer
    permission_classes = [IsAuthenticated, BillSpreadsheetEditPermission]
    http_method_names  = ['patch']

    @transaction.atomic
    def perform_update(self, serializer):
        old_data = BillSerializer(self.get_object()).data
        bill     = serializer.save()
        log_action(
            self.request.user, 'bills', bill.id, 'UPDATE', old_data,
            {**BillSerializer(bill).data, 'edited_via': 'spreadsheet'},
        )


class BillSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum, Count
        from core.permissions import role, R, A, BO, AC
        r = role(request)
        qs = Bill.objects.all()
        # Billing Officer sees only billing stats, not financial totals
        base = {
            'total_bills':    qs.count(),
            'unpaid_count':   qs.filter(status='Unpaid').count(),
            'partial_count':  qs.filter(status='Partial').count(),
            'paid_count':     qs.filter(status='Paid').count(),
        }
        if r in (R, A, AC):
            base['total_revenue'] = qs.aggregate(Sum('paid_amount'))['paid_amount__sum'] or 0
            base['total_due']     = qs.aggregate(Sum('due_amount'))['due_amount__sum'] or 0
        return Response(base)


class BulkCreateBillsView(APIView):
    """
    POST /api/v1/billing/bulk-create/
    body: { "building_id": 5, "billing_month": "2026-07" }  (or "2026-07-01")

    For every Active unit in the building that:
      - has a meter, AND
      - has a MeterReading recorded within that billing month, AND
      - does not already have a Bill for that month,
    creates a Bill automatically using:
      - previous_reading / current_reading from that MeterReading
        (never re-typed — the reading already recorded is the source of truth)
      - unit_price / conversion_factor from the unit's own package if set,
        else the building's default package, else the project's default
        package (same resolution order as the single-bill auto-fill)
      - service_charge from the project

    Does NOT apply any extra_charge / discount / late_fee / adjustment —
    those still go through the normal per-bill edit flow afterward if needed.

    Returns a summary so the operator knows exactly what happened, rather
    than a silent partial success:
      {
        created_count, created: [...],
        skipped_already_billed: [...],
        skipped_no_reading: [...],
      }
    """
    permission_classes = [IsAuthenticated, BillPermission]

    @transaction.atomic
    def post(self, request):
        from apps.buildings.models import Building
        from apps.units.models import Unit
        from apps.meters.models import MeterReading

        building_id = request.data.get('building_id')
        billing_month = request.data.get('billing_month')
        if not building_id or not billing_month:
            return Response(
                {'detail': 'building_id and billing_month are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(billing_month) == 7:  # 'YYYY-MM' from <input type="month">
            billing_month = billing_month + '-01'
        try:
            month_start = datetime.strptime(billing_month, '%Y-%m-%d').date().replace(day=1)
        except ValueError:
            return Response({'detail': 'Invalid billing_month format.'}, status=status.HTTP_400_BAD_REQUEST)
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)

        building = get_object_or_404(
            Building.objects.select_related('project', 'default_package'), id=building_id
        )
        project = building.project
        default_package = building.default_package or (project.default_package if project else None)

        units = (
            Unit.objects.filter(building=building, status='Active')
            .select_related('meter', 'allottee', 'package')
        )

        created, skipped_billed, skipped_no_reading = [], [], []

        for unit in units:
            if Bill.objects.filter(unit=unit, billing_month=month_start).exists():
                skipped_billed.append({'unit_no': unit.unit_no, 'reason': 'Already billed for this month'})
                continue

            meter = getattr(unit, 'meter', None)
            if not meter:
                skipped_no_reading.append({'unit_no': unit.unit_no, 'reason': 'No meter assigned to this unit'})
                continue

            reading = (
                MeterReading.objects
                .filter(meter=meter, reading_date__gte=month_start, reading_date__lt=next_month)
                .order_by('-reading_date', '-created_at')
                .first()
            )
            if not reading:
                skipped_no_reading.append({
                    'unit_no': unit.unit_no,
                    'reason': 'No meter reading recorded for this month yet',
                })
                continue

            package = unit.package or default_package
            unit_price = package.per_unit_cost if package else 0
            conversion_factor = (
                package.conversion_factor if (package and package.unit_type == 'kg' and package.conversion_factor)
                else None
            )
            service_charge = project.service_charge if project else 0

            bill = Bill(
                bill_number=Bill.generate_bill_number(),
                unit=unit, building=building, project=project,
                billing_month=month_start,
                previous_reading=reading.previous_reading,
                current_reading=reading.current_reading,
                unit_price=unit_price,
                service_charge=service_charge,
                conversion_factor=conversion_factor,
                created_by=request.user,
            )
            bill.calculate()
            bill.full_clean()
            bill.save()

            log_action(request.user, 'bills', bill.id, 'CREATE', None, {
                **BillSerializer(bill).data, 'created_via': 'bulk',
            })
            created.append({
                'unit_no': unit.unit_no,
                'bill_number': bill.bill_number,
                'total_amount': str(bill.total_amount),
            })

        return Response({
            'created_count': len(created),
            'created': created,
            'skipped_already_billed': skipped_billed,
            'skipped_no_reading': skipped_no_reading,
        })
        
class LatestUnitReadingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, unit_id):
        unit = get_object_or_404(
            Unit.objects.select_related('meter'),
            pk=unit_id
        )

        meter = getattr(unit, 'meter', None)

        if not meter:
            return Response({
                'previous_reading': 0,
                'current_reading': 0,
                'meter_no': None,
            })

        reading = (
            MeterReading.objects
            .filter(meter=meter)
            .order_by('-reading_date', '-created_at')
            .first()
        )

        if not reading:
            return Response({
                'previous_reading': 0,
                'current_reading': 0,
                'meter_no': meter.meter_no,
            })

        return Response({
            'previous_reading': reading.previous_reading,
            'current_reading': reading.current_reading,
            'meter_no': meter.meter_no,
        })