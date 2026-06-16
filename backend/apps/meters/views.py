from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df
from .models import Meter, MeterReading
from .serializers import MeterSerializer, MeterReadingSerializer
from core.permissions import IsBillingOfficerOrAbove, IsAnyStaff


class MeterListCreateView(generics.ListCreateAPIView):
    queryset           = Meter.objects.all().select_related('unit__building__project', 'unit__allottee')
    serializer_class   = MeterSerializer
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]
    filter_backends    = [filters.SearchFilter, DjangoFilterBackend]
    search_fields      = ['meter_no', 'unit__unit_no', 'unit__allottee__name']
    filterset_fields   = ['unit__building', 'unit__building__project']


class MeterDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Meter.objects.all()
    serializer_class   = MeterSerializer
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]


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
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]
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
    permission_classes = [IsAuthenticated, IsBillingOfficerOrAbove]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]