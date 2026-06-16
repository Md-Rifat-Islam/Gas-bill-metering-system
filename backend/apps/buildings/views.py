from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Building
from .serializers import BuildingSerializer
from core.permissions import BuildingPermission


class BuildingListCreateView(generics.ListCreateAPIView):
    queryset           = Building.objects.all().select_related('project')
    serializer_class   = BuildingSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['project', 'is_active']
    search_fields      = ['name', 'code']


class BuildingDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Building.objects.all().select_related('project')
    serializer_class   = BuildingSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()