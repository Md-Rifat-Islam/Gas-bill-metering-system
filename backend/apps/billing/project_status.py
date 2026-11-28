"""
Project Status page backend.

GET  /api/v1/billing/project-status/        per-project usage / paid / unpaid / cylinders
GET  /api/v1/billing/cylinder-types/        list cylinder types
POST /api/v1/billing/cylinder-types/        create a cylinder type
PATCH/DELETE /api/v1/billing/cylinder-types/<id>/
GET  /api/v1/billing/cylinder-supply/?project=<id>&month=YYYY-MM
PUT  /api/v1/billing/cylinder-supply/       replace one project-month's cylinder lines

The summary accepts exactly the filters the Billing page sends (project,
building, billing_month, status, min_amount, max_amount, search) and runs
them through the same BillFilter, so a number here always matches what the
Billing list shows for the same filters.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from apps.projects.models import Project
from core.permissions import BillPermission

from .cylinder_models import CylinderSupply, CylinderType
from .filters import BillFilter
from .models import Bill
from .month_correction import _parse_month

_ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=14, decimal_places=2))


def _sum(field, **kwargs):
    return Coalesce(
        Sum(field, **kwargs), _ZERO,
        output_field=DecimalField(max_digits=14, decimal_places=4),
    )


# ── Project status summary ───────────────────────────────────────────────────

class ProjectStatusView(APIView):
    permission_classes = [IsAuthenticated, BillPermission]

    def get(self, request):
        params = request.query_params

        qs = BillFilter(params, queryset=Bill.objects.all()).qs
        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(bill_number__icontains=search)
                | Q(unit__unit_no__icontains=search)
                | Q(unit__allottee__name__icontains=search)
                | Q(unit__mobile_number__icontains=search)
            )

        rows = {
            r['project_id']: r
            for r in qs.values('project_id')
            .annotate(
                bills=Count('id'),
                units=Count('unit_id', distinct=True),
                usage_m3=_sum('total_usage_m3'),
                usage_kg=_sum('total_usage_kg'),
                kg_bills=Count('id', filter=Q(conversion_factor__isnull=False)),
                billed=_sum('total_amount'),
                paid=_sum('paid_amount'),
                due=_sum('due_amount'),
                paid_bills=Count('id', filter=Q(status=Bill.STATUS_PAID)),
                partial_bills=Count('id', filter=Q(status=Bill.STATUS_PARTIAL)),
                unpaid_bills=Count('id', filter=Q(status=Bill.STATUS_UNPAID)),
            )
            .order_by()
        }

        # Every active project is listed (even with no bills in this filter)
        # so cylinders can still be entered for it.
        projects = Project.objects.filter(is_active=True)
        project_param = params.get('project')
        if project_param and str(project_param).isdigit():
            projects = projects.filter(id=int(project_param))
        projects = list(projects.order_by('name'))

        # Cylinders follow the month filter (all months when it is empty).
        supply_month = _parse_month(params.get('billing_month'))
        supply_qs = CylinderSupply.objects.filter(
            project_id__in=[p.id for p in projects], quantity__gt=0,
        ).select_related('cylinder_type')
        if supply_month:
            supply_qs = supply_qs.filter(month=supply_month)

        cylinders = {p.id: {'count': 0, 'weight_kg': Decimal('0'), 'lines': {}} for p in projects}
        for s in supply_qs:
            c = cylinders[s.project_id]
            weight = s.cylinder_type.weight_kg * s.quantity
            c['count'] += s.quantity
            c['weight_kg'] += weight
            line = c['lines'].setdefault(s.cylinder_type_id, {
                'cylinder_type_id': s.cylinder_type_id,
                'name': s.cylinder_type.name,
                'weight_kg': s.cylinder_type.weight_kg,
                'quantity': 0,
            })
            line['quantity'] += s.quantity

        zero = Decimal('0')
        out, totals = [], {
            'bills': 0, 'units': 0, 'usage_m3': zero, 'usage_kg': zero, 'kg_bills': 0,
            'billed': zero, 'paid': zero, 'due': zero,
            'paid_bills': 0, 'partial_bills': 0, 'unpaid_bills': 0,
            'cylinder_count': 0, 'cylinder_kg': zero,
        }
        for p in projects:
            r = rows.get(p.id, {})
            item = {
                'project_id': p.id,
                'name': p.name,
                'bills': r.get('bills', 0),
                'units': r.get('units', 0),
                'usage_m3': r.get('usage_m3', zero),
                'usage_kg': r.get('usage_kg', zero),
                'kg_bills': r.get('kg_bills', 0),
                'billed': r.get('billed', zero),
                'paid': r.get('paid', zero),
                'due': r.get('due', zero),
                'paid_bills': r.get('paid_bills', 0),
                'partial_bills': r.get('partial_bills', 0),
                'unpaid_bills': r.get('unpaid_bills', 0),
                'cylinders': {
                    'count': cylinders[p.id]['count'],
                    'weight_kg': cylinders[p.id]['weight_kg'],
                    'lines': list(cylinders[p.id]['lines'].values()),
                },
            }
            out.append(item)
            for k in ('bills', 'units', 'usage_m3', 'usage_kg', 'kg_bills', 'billed', 'paid', 'due',
                      'paid_bills', 'partial_bills', 'unpaid_bills'):
                totals[k] += item[k]
            totals['cylinder_count'] += item['cylinders']['count']
            totals['cylinder_kg'] += item['cylinders']['weight_kg']

        # Supplied-vs-billed kg only means something when nothing narrows the
        # bills below "whole project, chosen month".
        comparable = not any(
            params.get(k) for k in ('building', 'status', 'min_amount', 'max_amount', 'search')
        )

        return Response({
            'supply_month': supply_month.isoformat() if supply_month else None,
            'comparable': comparable,
            'totals': totals,
            'projects': out,
        })


# ── Cylinder types ───────────────────────────────────────────────────────────

class CylinderTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CylinderType
        fields = ['id', 'name', 'weight_kg', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}}

    def validate_weight_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError('Weight must be greater than 0.')
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get('name'):
            attrs['name'] = f"{attrs['weight_kg'].normalize():f} kg cylinder"
        return attrs


class CylinderTypeListCreateView(generics.ListCreateAPIView):
    queryset = CylinderType.objects.all().order_by('weight_kg', 'name')
    serializer_class = CylinderTypeSerializer
    permission_classes = [IsAuthenticated, BillPermission]
    pagination_class = None

    @transaction.atomic
    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        log_action(self.request.user, 'cylinder_types', obj.id, 'CREATE', None, serializer.data)


class CylinderTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CylinderType.objects.all()
    serializer_class = CylinderTypeSerializer
    permission_classes = [IsAuthenticated, BillPermission]
    http_method_names = ['get', 'patch', 'delete']

    @transaction.atomic
    def perform_update(self, serializer):
        old = CylinderTypeSerializer(self.get_object()).data
        obj = serializer.save()
        log_action(self.request.user, 'cylinder_types', obj.id, 'UPDATE', old, serializer.data)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.supplies.exists():
            return Response(
                {'detail': 'This cylinder type has supply records. Deactivate it instead of deleting.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        old = CylinderTypeSerializer(obj).data
        log_action(request.user, 'cylinder_types', obj.id, 'DELETE', old, None)
        return super().destroy(request, *args, **kwargs)


# ── Cylinder supply (per project, per month) ─────────────────────────────────

class CylinderSupplyView(APIView):
    permission_classes = [IsAuthenticated, BillPermission]

    @staticmethod
    def _lines(project_id, month):
        return [
            {'cylinder_type_id': s.cylinder_type_id, 'quantity': s.quantity}
            for s in CylinderSupply.objects.filter(project_id=project_id, month=month)
            .select_related('cylinder_type')
            .order_by('cylinder_type__weight_kg')
        ]

    def get(self, request):
        project_id = request.query_params.get('project')
        month = _parse_month(request.query_params.get('month'))
        if not project_id or not str(project_id).isdigit() or not month:
            return Response(
                {'detail': 'project and month (YYYY-MM) are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'project_id': int(project_id),
            'month': month.strftime('%Y-%m'),
            'lines': self._lines(int(project_id), month),
        })

    @transaction.atomic
    def put(self, request):
        project_id = request.data.get('project_id')
        month = _parse_month(request.data.get('month'))
        raw_lines = request.data.get('lines')

        if not project_id or not month or not isinstance(raw_lines, list):
            return Response(
                {'detail': 'project_id, month (YYYY-MM) and lines are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            project = Project.objects.get(id=project_id)
        except (Project.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Pass 1: validate everything before touching the database.
        wanted = {}
        for item in raw_lines:
            try:
                type_id = int(item.get('cylinder_type_id'))
                qty = int(item.get('quantity') or 0)
            except (AttributeError, TypeError, ValueError):
                return Response({'detail': 'Each line needs a cylinder type and a whole-number quantity.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if qty < 0:
                return Response({'detail': 'Quantity cannot be negative.'}, status=status.HTTP_400_BAD_REQUEST)
            if type_id in wanted:
                return Response({'detail': 'The same cylinder type appears twice — combine the quantities.'},
                                status=status.HTTP_400_BAD_REQUEST)
            wanted[type_id] = qty

        types = {t.id: t for t in CylinderType.objects.filter(id__in=wanted)}
        if len(types) != len(wanted):
            return Response({'detail': 'Unknown cylinder type.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = {
            s.cylinder_type_id: s
            for s in CylinderSupply.objects.select_for_update().filter(project=project, month=month)
        }
        for type_id, qty in wanted.items():
            if qty > 0 and type_id not in existing and not types[type_id].is_active:
                return Response(
                    {'detail': f'"{types[type_id].name}" is inactive and cannot be added to new supply.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        old_lines = {str(t): s.quantity for t, s in existing.items()}

        # Pass 2: apply.
        for type_id, qty in wanted.items():
            row = existing.get(type_id)
            if qty == 0:
                if row:
                    row.delete()
            elif row:
                if row.quantity != qty:
                    row.quantity = qty
                    row.save(update_fields=['quantity', 'updated_at'])
            else:
                CylinderSupply.objects.create(
                    project=project, month=month, cylinder_type=types[type_id],
                    quantity=qty, created_by=request.user,
                )
        for type_id, row in existing.items():
            if type_id not in wanted:
                row.delete()

        new_lines = self._lines(project.id, month)
        log_action(
            request.user, 'cylinder_supply', project.id, 'UPDATE',
            {'month': month.strftime('%Y-%m'), 'lines': old_lines},
            {'month': month.strftime('%Y-%m'),
             'lines': {str(l['cylinder_type_id']): l['quantity'] for l in new_lines}},
        )
        return Response({
            'project_id': project.id,
            'month': month.strftime('%Y-%m'),
            'lines': new_lines,
        })