from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated
from .models import AuditLog
from core.permissions import AuditLogPermission


class AuditLogSerializer(serializers.ModelSerializer):
    # THE FIX: previously sourced from 'changed_by.name' with a blanket
    # 'System' default. Any customer-initiated action (e.g. a portal
    # payment submission, or the OTP-based password reset) has
    # changed_by=None — that attribution lives on the separate
    # changed_by_customer FK instead — so those rows were silently
    # mislabeled as 'System' rather than showing which customer did it.
    # The model's own `actor_display` property already resolves all three
    # cases (staff / customer / system) correctly, so use that instead.
    changed_by_name = serializers.CharField(source='actor_display', read_only=True)
    # Lets the frontend badge staff vs. customer vs. system actions
    # differently without re-deriving it from changed_by_name text.
    actor_type = serializers.SerializerMethodField()

    class Meta:
        model  = AuditLog
        fields = ['id', 'table_name', 'record_id', 'changed_by_name', 'actor_type',
                  'action', 'old_data', 'new_data', 'changed_at']

    def get_actor_type(self, obj):
        if obj.changed_by_id:
            return 'staff'
        if obj.changed_by_customer_id:
            return 'customer'
        return 'system'


class AuditLogListView(generics.ListAPIView):
    queryset           = AuditLog.objects.all().select_related('changed_by', 'changed_by_customer')
    serializer_class   = AuditLogSerializer
    permission_classes = [IsAuthenticated, AuditLogPermission]

    def get_queryset(self):
        qs        = super().get_queryset()
        table     = self.request.query_params.get('table')
        record_id = self.request.query_params.get('record_id')
        # THE FIX: table/record_id filtering already existed; action and
        # date-range filtering did not, which matters here specifically
        # because this list has no natural upper bound the way most other
        # lists in the app do (bills/payments/units are all scoped to a
        # building or month by nature — audit rows just keep accumulating).
        action    = self.request.query_params.get('action')
        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')

        if table:
            qs = qs.filter(table_name=table)
        if record_id:
            qs = qs.filter(record_id=record_id)
        if action:
            qs = qs.filter(action=action.upper())
        if date_from:
            qs = qs.filter(changed_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(changed_at__date__lte=date_to)
        return qs