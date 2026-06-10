from rest_framework import generics, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Project, Package
from .serializers import ProjectSerializer, PackageSerializer


class ProjectListCreateView(generics.ListCreateAPIView):
    queryset = Project.objects.all().select_related('default_package')
    serializer_class = ProjectSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'address']


class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Project.objects.all().select_related('default_package')
    serializer_class = ProjectSerializer

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save()


class PackageListCreateView(generics.ListCreateAPIView):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class PackageDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer
