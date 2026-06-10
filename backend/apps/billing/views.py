from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .models import Bill
from .serializers import BillSerializer
from apps.audit.utils import log_action


class BillListCreateView(generics.ListCreateAPIView):
    queryset = Bill.objects.all().select_related(
        'unit__allottee', 'building', 'project', 'created_by'
    )
    serializer_class = BillSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'unit', 'building', 'project', 'billing_month']
    search_fields = ['bill_number', 'unit__unit_no', 'unit__allottee__name', 'unit__mobile_number']
    ordering_fields = ['billing_month', 'total_amount', 'created_at']

    @transaction.atomic
    def perform_create(self, serializer):
        bill = serializer.save()
        log_action(self.request.user, 'bills', bill.id, 'CREATE', None, BillSerializer(bill).data)


class BillDetailView(generics.RetrieveUpdateAPIView):
    queryset = Bill.objects.all().select_related('unit__allottee', 'building', 'project')
    serializer_class = BillSerializer

    @transaction.atomic
    def perform_update(self, serializer):
        old_data = BillSerializer(self.get_object()).data
        bill = serializer.save()
        log_action(self.request.user, 'bills', bill.id, 'UPDATE', old_data, BillSerializer(bill).data)


class BillSummaryView(APIView):
    """Dashboard statistics"""
    def get(self, request):
        from django.db.models import Sum, Count
        qs = Bill.objects.all()
        return Response({
            'total_bills': qs.count(),
            'total_revenue': qs.aggregate(Sum('paid_amount'))['paid_amount__sum'] or 0,
            'total_due': qs.aggregate(Sum('due_amount'))['due_amount__sum'] or 0,
            'unpaid_count': qs.filter(status='Unpaid').count(),
            'partial_count': qs.filter(status='Partial').count(),
            'paid_count': qs.filter(status='Paid').count(),
        })
