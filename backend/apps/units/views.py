from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from apps.buildings.models import Building
from .models import Unit, Allottee
from .serializers import UnitSerializer, AllotteeSerializer
from core.permissions import UnitPermission
from .bulk_import import (
    generate_unit_import_template,
    parse_and_validate,
    build_annotated_error_workbook,
    create_units_from_rows,
)


class UnitListCreateView(generics.ListCreateAPIView):
    queryset           = Unit.objects.all().select_related('building__project', 'package', 'allottee', 'meter')
    serializer_class   = UnitSerializer
    permission_classes = [IsAuthenticated, UnitPermission]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['building', 'building__project', 'status']
    search_fields      = ['unit_no', 'meter_no', 'mobile_number', 'allottee__name']


class UnitDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Unit.objects.all().select_related('building__project', 'package', 'allottee', 'meter')
    serializer_class   = UnitSerializer
    permission_classes = [IsAuthenticated, UnitPermission]

    def perform_destroy(self, instance):
        instance.status = Unit.STATUS_INACTIVE
        instance.save()


class AllotteeListCreateView(generics.ListCreateAPIView):
    queryset           = Allottee.objects.all().select_related('unit__building__project')
    serializer_class   = AllotteeSerializer
    permission_classes = [IsAuthenticated, UnitPermission]


class AllotteeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Allottee.objects.all()
    serializer_class   = AllotteeSerializer
    permission_classes = [IsAuthenticated, UnitPermission]


# ── Bulk Unit Import ──────────────────────────────────────────────────────────
# Uses the same UnitPermission module as everything else in this app: GET
# (template download) needs can_view, POST (actual import) needs can_edit —
# ModuleOverridePermission already maps those from the request method, so no
# new permission class was needed.

class UnitBulkImportTemplateView(APIView):
    """GET /api/v1/units/bulk-import/template/?building_id=<id> -> .xlsx"""
    permission_classes = [IsAuthenticated, UnitPermission]

    def get(self, request):
        building_id = request.query_params.get('building_id')
        if not building_id:
            return Response({'detail': 'building_id is required.'}, status=400)
        try:
            building = Building.objects.select_related('project').get(pk=building_id)
        except Building.DoesNotExist:
            return Response({'detail': 'Building not found.'}, status=404)

        content = generate_unit_import_template(building)
        response = HttpResponse(
            content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        filename = f'{building.name}_unit_import_template.xlsx'.replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class UnitBulkImportView(APIView):
    """
    POST /api/v1/units/bulk-import/  (multipart: building_id, file)

    - All rows valid  -> creates every Unit (+ Allottee + Meter) atomically,
      returns 201 JSON {"created": N}.
    - Any row invalid -> creates NOTHING, returns 422 with an annotated
      .xlsx (same rows + an Errors column + highlighted cells) instead.
    """
    permission_classes = [IsAuthenticated, UnitPermission]
    parser_classes = [MultiPartParser]

    def post(self, request):
        building_id = request.data.get('building_id')
        upload = request.FILES.get('file')
        if not building_id or not upload:
            return Response({'detail': 'building_id and file are both required.'}, status=400)
        try:
            building = Building.objects.select_related('project').get(pk=building_id)
        except Building.DoesNotExist:
            return Response({'detail': 'Building not found.'}, status=404)

        try:
            errors_by_row, cleaned_rows, raw_rows = parse_and_validate(upload, building)
        except Exception:
            return Response(
                {'detail': 'Could not read this file — please use the downloaded template.'},
                status=400,
            )

        if not raw_rows:
            return Response({'detail': 'No data rows found below the example row.'}, status=400)

        if errors_by_row:
            content = build_annotated_error_workbook(building, raw_rows, errors_by_row)
            response = HttpResponse(
                content,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                status=422,
            )
            response['Content-Disposition'] = 'attachment; filename="unit_import_errors.xlsx"'
            return response

        created = create_units_from_rows(building, cleaned_rows)
        return Response({'created': created}, status=201)