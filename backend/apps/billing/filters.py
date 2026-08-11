import django_filters
from .models import Bill


class BillFilter(django_filters.FilterSet):
    """
    Extends the plain filterset_fields Bill was using with amount-range
    filtering. Everything that worked before (status, unit, building,
    project, billing_month — all exact match) keeps working exactly as
    it did; this just adds two extra query params on top.

    min_amount -> total_amount strictly greater than the given value
    max_amount -> total_amount strictly less than the given value
    """
    min_amount = django_filters.NumberFilter(field_name='total_amount', lookup_expr='gt', min_value=0)
    max_amount = django_filters.NumberFilter(field_name='total_amount', lookup_expr='lt', min_value=0)

    class Meta:
        model = Bill
        fields = ['status', 'unit', 'building', 'project', 'billing_month']