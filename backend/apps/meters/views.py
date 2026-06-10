from rest_framework import generics, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Meter, MeterReading
from .serializers import MeterSerializer, MeterReadingSerializer


class MeterListCreateView(generics.ListCreateAPIView):
    queryset = Meter.objects.all().select_related('unit__building')
    serializer_class = MeterSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['meter_no', 'unit__unit_no']


class MeterDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Meter.objects.all()
    serializer_class = MeterSerializer


class MeterReadingListCreateView(generics.ListCreateAPIView):
    queryset = MeterReading.objects.all().select_related('meter__unit')
    serializer_class = MeterReadingSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['meter']
    ordering_fields = ['reading_date']


class MeterReadingDetailView(generics.RetrieveAPIView):
    queryset = MeterReading.objects.all()
    serializer_class = MeterReadingSerializer
