from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated
from .models import AuditLog
from core.permissions import AuditLogPermission


class AuditLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.name', read_only=True, default='System')

    class Meta:
        model  = AuditLog
        fields = ['id', 'table_name', 'record_id', 'changed_by_name',
                  'action', 'old_data', 'new_data', 'changed_at']


class AuditLogListView(generics.ListAPIView):
    queryset           = AuditLog.objects.all().select_related('changed_by')
    serializer_class   = AuditLogSerializer
    permission_classes = [IsAuthenticated, AuditLogPermission]

    def get_queryset(self):
        qs        = super().get_queryset()
        table     = self.request.query_params.get('table')
        record_id = self.request.query_params.get('record_id')
        if table:
            qs = qs.filter(table_name=table)
        if record_id:
            qs = qs.filter(record_id=record_id)
        return qs