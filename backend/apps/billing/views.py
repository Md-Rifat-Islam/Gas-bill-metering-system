from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .models import Bill
from .serializers import BillSerializer
from apps.audit.utils import log_action
from core.permissions import BillPermission, BillDeletePermission


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