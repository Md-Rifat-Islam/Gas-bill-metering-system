from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df
from django.db.models import Q
from django.utils import timezone

from .models import Meter, MeterReading
from .serializers import MeterSerializer, MeterReadingSerializer, MeterCardSerializer
from core.permissions import IsBillingOfficerOrAbove, IsAnyStaff, MeterPermission
from apps.billing.models import Bill


class MeterListCreateView(generics.ListCreateAPIView):
    queryset           = Meter.objects.all().select_related('unit__building__project', 'unit__allottee')
    serializer_class   = MeterSerializer
    permission_classes = [IsAuthenticated, MeterPermission]
    filter_backends    = [filters.SearchFilter, DjangoFilterBackend]
    search_fields      = ['meter_no', 'barcode', 'unit__unit_no', 'unit__allottee__name']
    filterset_fields   = ['unit__building', 'unit__building__project']


class MeterDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Meter.objects.all()
    serializer_class   = MeterSerializer
    permission_classes = [IsAuthenticated, MeterPermission]


# ── Date-range filter for readings ────────────────────────────────────────────
class MeterReadingFilter(df.FilterSet):
    date_from  = df.DateFilter(field_name='reading_date', lookup_expr='gte')
    date_to    = df.DateFilter(field_name='reading_date', lookup_expr='lte')
    month      = df.NumberFilter(field_name='reading_date', lookup_expr='month')
    year       = df.NumberFilter(field_name='reading_date', lookup_expr='year')
    week       = df.NumberFilter(field_name='reading_date', lookup_expr='week')
    meter      = df.NumberFilter(field_name='meter__id')
    building   = df.NumberFilter(field_name='meter__unit__building__id')
    project    = df.NumberFilter(field_name='meter__unit__building__project__id')

    class Meta:
        model   = MeterReading
        fields  = ['meter', 'building', 'project', 'date_from', 'date_to', 'month', 'year', 'week']


class MeterReadingListCreateView(generics.ListCreateAPIView):
    queryset           = MeterReading.objects.all().select_related(
        'meter__unit__building__project', 'meter__unit__allottee', 'recorded_by'
    )
    serializer_class   = MeterReadingSerializer
    permission_classes = [IsAuthenticated, MeterPermission]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]   # needed for photo upload
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class    = MeterReadingFilter
    ordering_fields    = ['reading_date', 'created_at']
    ordering           = ['-reading_date']


class MeterReadingDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = MeterReading.objects.all().select_related(
        'meter__unit__building__project', 'recorded_by'
    )
    serializer_class   = MeterReadingSerializer
    permission_classes = [IsAuthenticated, MeterPermission]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]


# ── Quick Reading Dashboard ────────────────────────────────────────────────────
# Returns every meter in a building as a pre-joined "card" payload: unit,
# allottee, latest reading, computed reading/billing status. Built with two
# extra bulk queries (latest readings, current-month bills) instead of N+1
# per-meter queries, then joined in Python — safe for the hundreds-of-meters
# scale this feature targets. Not paginated on purpose: the grid needs the
# full building in one shot.
class MeterQuickDashboardView(generics.ListAPIView):
    serializer_class   = MeterCardSerializer
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]
    filter_backends    = [filters.SearchFilter]
    search_fields      = ['meter_no', 'barcode', 'unit__unit_no', 'unit__allottee__name']
    pagination_class   = None

    def get_queryset(self):
        qs = Meter.objects.all().select_related(
            'unit', 'unit__building', 'unit__building__project', 'unit__allottee'
        )
        building_id = self.request.query_params.get('building_id')
        project_id  = self.request.query_params.get('project_id')
        if building_id:
            qs = qs.filter(unit__building_id=building_id)
        if project_id:
            qs = qs.filter(unit__building__project_id=project_id)
        return qs.order_by('unit__building__name', 'unit__floor_no', 'unit__unit_no')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        meters = list(queryset)
        meter_ids = [m.id for m in meters]
        unit_ids  = [m.unit_id for m in meters]

        # Latest reading per meter — one query, reduced in Python.
        readings = (
            MeterReading.objects
            .filter(meter_id__in=meter_ids)
            .order_by('meter_id', '-reading_date', '-created_at')
        )
        latest_by_meter = {}
        for r in readings:
            if r.meter_id not in latest_by_meter:
                latest_by_meter[r.meter_id] = r

        # Current-month bill per unit — one query.
        today = timezone.now().date()
        month_start = today.replace(day=1)
        bills = Bill.objects.filter(unit_id__in=unit_ids, billing_month=month_start)
        bill_by_unit = {b.unit_id: b for b in bills}

        context = self.get_serializer_context()
        context.update({
            'latest_by_meter': latest_by_meter,
            'bill_by_unit': bill_by_unit,
            'month_start': month_start,
        })

        serializer = self.get_serializer(meters, many=True, context=context)
        data = serializer.data

        status_param = request.query_params.get('status')
        if status_param:
            data = [d for d in data if d['reading_status'].lower() == status_param.lower()]

        return Response({'count': len(data), 'results': data})


# ── Barcode / QR lookup ────────────────────────────────────────────────────────
class MeterBarcodeLookupView(APIView):
    """
    Resolves a scanned barcode/QR payload to a meter + full billing context
    in one call. Falls back to matching on meter_no so meters without a
    printed barcode can still be scanned via a QR that just encodes the
    meter number.
    """
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]

    def get(self, request):
        code = (request.query_params.get('code') or '').strip()
        if not code:
            return Response({'detail': 'Barcode/QR code is required.', 'code': 'MISSING_CODE'}, status=400)

        meter = Meter.objects.select_related(
            'unit', 'unit__building', 'unit__building__project', 'unit__allottee'
        ).filter(Q(barcode=code) | Q(meter_no=code)).first()

        if not meter:
            return Response({'detail': 'No meter found for this barcode.', 'code': 'NOT_FOUND'}, status=404)

        if meter.unit.status != 'Active':
            return Response({
                'detail': f'Meter {meter.meter_no} belongs to an inactive unit.',
                'code': 'INACTIVE',
            }, status=400)

        today = timezone.now().date()
        month_start = today.replace(day=1)

        latest_reading = (
            MeterReading.objects.filter(meter=meter)
            .order_by('-reading_date', '-created_at')
            .first()
        )
        already_today     = bool(latest_reading and latest_reading.reading_date == today)
        already_this_month = bool(latest_reading and latest_reading.reading_date >= month_start)
        bill = Bill.objects.filter(unit=meter.unit, billing_month=month_start).first()

        warnings = []
        if already_today:
            warnings.append('A reading was already recorded for this meter today.')
        elif already_this_month:
            warnings.append('This meter already has a reading recorded this billing month.')
        if bill:
            warnings.append('This unit has already been billed for the current month.')

        data = MeterCardSerializer(meter, context={
            'latest_by_meter': {meter.id: latest_reading} if latest_reading else {},
            'bill_by_unit': {meter.unit_id: bill} if bill else {},
            'month_start': month_start,
        }).data
        data['warnings'] = warnings
        return Response(data)