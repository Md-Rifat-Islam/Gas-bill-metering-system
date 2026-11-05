from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Project, Package
from .serializers import ProjectSerializer, PackageSerializer
from core.permissions import ProjectPermission, PackagePermission


class ProjectListCreateView(generics.ListCreateAPIView):
    queryset = Project.objects.all().select_related('default_package')
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, ProjectPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'address']


class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Project.objects.all().select_related('default_package')
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, ProjectPermission]

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save()


class PackageListCreateView(generics.ListCreateAPIView):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, PackagePermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class PackageDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, PackagePermission]

    def destroy(self, request, *args, **kwargs):
        """
        Delete a package — only when nothing uses it.

        Project.default_package, Building.default_package and Unit.package are
        all on_delete=SET_NULL, so the database would happily delete a package
        that's still in use and silently blank the price on every project,
        building and unit pointing at it. Bulk bill creation would then bill
        those units at a unit price of 0. So a package in use is refused with
        a message saying where it's used; reassign those first.

        Existing bills are unaffected either way: each Bill stores its own
        unit_price / conversion_factor and has no link to a package.
        """
        from apps.buildings.models import Building
        from apps.units.models import Unit

        package = self.get_object()

        # Counts include inactive projects/buildings/units — they still
        # reference the package, even if they're hidden from the default views.
        used_by = []
        project_count = Project.objects.filter(default_package=package).count()
        building_count = Building.objects.filter(default_package=package).count()
        unit_count = Unit.objects.filter(package=package).count()
        if project_count:
            used_by.append(f'{project_count} project(s)')
        if building_count:
            used_by.append(f'{building_count} building(s)')
        if unit_count:
            used_by.append(f'{unit_count} unit(s)')

        if used_by:
            return Response(
                {'detail': (
                    f'Package "{package.name}" is still used by {", ".join(used_by)} '
                    f'(including inactive ones). Assign them to a different package first.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(request, *args, **kwargs)