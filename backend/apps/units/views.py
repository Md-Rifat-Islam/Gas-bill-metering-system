from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Unit, Allottee
from .serializers import UnitSerializer, AllotteeSerializer
from core.permissions import BuildingPermission   # same rules as buildings


class UnitListCreateView(generics.ListCreateAPIView):
    queryset           = Unit.objects.all().select_related('building__project', 'package', 'allottee', 'meter')
    serializer_class   = UnitSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['building', 'building__project', 'status']
    search_fields      = ['unit_no', 'meter_no', 'mobile_number', 'allottee__name']


class UnitDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Unit.objects.all().select_related('building__project', 'package', 'allottee', 'meter')
    serializer_class   = UnitSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]

    def perform_destroy(self, instance):
        instance.status = Unit.STATUS_INACTIVE
        instance.save()


class AllotteeListCreateView(generics.ListCreateAPIView):
    queryset           = Allottee.objects.all().select_related('unit__building__project')
    serializer_class   = AllotteeSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]


class AllotteeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Allottee.objects.all()
    serializer_class   = AllotteeSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]