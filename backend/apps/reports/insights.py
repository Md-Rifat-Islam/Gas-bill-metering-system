"""
Aggregated data for the richer Dashboard and Reports pages.

GET /api/v1/reports/insights/dashboard/
GET /api/v1/reports/insights/reports/?months=3|6|12|24&project=<id>

Permission model (same split the existing endpoints already use):
  - Operational numbers (meter-reading progress, outstanding dues, aging,
    units with highest dues) are available to anyone who can open the page.
  - Revenue figures (billed / collected / rates / trend / payment methods /
    recent payments) are only included when the user passes
    FinancialReportPermission (role default + per-user override). Without it
    the keys are simply absent, so the frontend never has to handle a 403.

Every number is computed from Bill / Payment / Meter rows in the database;
nothing here is cached or stored.
"""
from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, Max, Min, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Bill
from apps.meters.models import Meter
from apps.payments.models import Payment
from core.permissions import FinancialReportPermission, ReportPermission

_ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=14, decimal_places=2))


def _sum(field, **kwargs):
    """SUM that returns 0 instead of NULL when there are no rows."""
    return Coalesce(
        Sum(field, **kwargs), _ZERO,
        output_field=DecimalField(max_digits=14, decimal_places=3),
    )


# ── month helpers ────────────────────────────────────────────────────────────

def _add_months(d, n):
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


def _months_between(a, b):
    """Whole months from a to b (b later than a → positive)."""
    return (b.year - a.year) * 12 + (b.month - a.month)


def _iso(d):
    return d.isoformat() if d else None


# ── shared builders ──────────────────────────────────────────────────────────

def _rollup(qs):
    """Per-billing-month totals, oldest first."""
    rows = (
        qs.values('billing_month')
        .annotate(
            billed=_sum('total_amount'),
            collected=_sum('paid_amount'),
            due=_sum('due_amount'),
            usage=_sum('total_usage_m3'),
            bills=Count('id'),
        )
        .order_by('billing_month')
    )
    return [
        {
            'month': _iso(r['billing_month']),
            'billed': r['billed'],
            'collected': r['collected'],
            'due': r['due'],
            'usage': r['usage'],
            'bills': r['bills'],
        }
        for r in rows
    ]


def _aging(qs, today):
    """
    Unpaid money bucketed by how many months ago the bill's month was,
    relative to the current calendar month. 0-1 = this and last month.
    """
    buckets = [
        {'key': '0-1', 'label': '0–1 mo', 'due': Decimal('0'), 'bills': 0},
        {'key': '2', 'label': '2 mo', 'due': Decimal('0'), 'bills': 0},
        {'key': '3', 'label': '3 mo', 'due': Decimal('0'), 'bills': 0},
        {'key': '4+', 'label': '4+ mo', 'due': Decimal('0'), 'bills': 0},
    ]
    this_month = today.replace(day=1)
    rows = (
        qs.filter(due_amount__gt=0)
        .values('billing_month')
        .annotate(due=_sum('due_amount'), bills=Count('id'))
        .order_by()
    )
    for r in rows:
        age = max(0, _months_between(r['billing_month'], this_month))
        idx = 0 if age <= 1 else 1 if age == 2 else 2 if age == 3 else 3
        buckets[idx]['due'] += r['due']
        buckets[idx]['bills'] += r['bills']
    return buckets


def _top_due_units(qs, limit):
    rows = (
        qs.filter(due_amount__gt=0)
        .values(
            'unit_id', 'unit__unit_no', 'unit__allottee__name',
            'building__name', 'project__name',
        )
        .annotate(due=_sum('due_amount'), bills=Count('id'), oldest=Min('billing_month'))
        .order_by('-due')[:limit]
    )
    return [
        {
            'unit_id': r['unit_id'],
            'unit_no': r['unit__unit_no'],
            'allottee_name': r['unit__allottee__name'] or '',
            'building_name': r['building__name'],
            'project_name': r['project__name'],
            'due': r['due'],
            'bills': r['bills'],
            'oldest_month': _iso(r['oldest']),
        }
        for r in rows
    ]


def _can_see_financials(request, view):
    return FinancialReportPermission().has_permission(request, view)


# ── Dashboard ────────────────────────────────────────────────────────────────

class DashboardInsightsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        next_start = _add_months(month_start, 1)

        data = {'reading': self._reading_progress(month_start, next_start)}
        data['financial'] = (
            self._financial(today) if _can_see_financials(request, self) else None
        )
        return Response(data)

    @staticmethod
    def _reading_progress(month_start, next_start):
        rows = (
            Meter.objects.filter(unit__status='Active')
            .values('unit__building__project_id', 'unit__building__project__name')
            .annotate(
                total=Count('id', distinct=True),
                read=Count(
                    'id',
                    filter=Q(
                        readings__reading_date__gte=month_start,
                        readings__reading_date__lt=next_start,
                    ),
                    distinct=True,
                ),
            )
            .order_by('unit__building__project__name')
        )
        projects = [
            {
                'project_id': r['unit__building__project_id'],
                'name': r['unit__building__project__name'],
                'total': r['total'],
                'read': r['read'],
            }
            for r in rows
        ]
        return {
            'month': _iso(month_start),
            'total': sum(p['total'] for p in projects),
            'read': sum(p['read'] for p in projects),
            'projects': projects,
        }

    @staticmethod
    def _financial(today):
        bills = Bill.objects.all()
        latest = bills.aggregate(m=Max('billing_month'))['m']
        if latest is None:
            return {'has_bills': False}

        trend = _rollup(bills.filter(billing_month__gte=_add_months(latest, -11)))
        by_month = {t['month']: t for t in trend}
        cycle = by_month.get(_iso(latest))
        previous = by_month.get(_iso(_add_months(latest, -1)))

        totals = bills.aggregate(
            revenue=_sum('paid_amount'),
            due=_sum('due_amount'),
            due_bills=Count('id', filter=Q(due_amount__gt=0)),
        )

        by_status = [
            {'status': r['status'], 'count': r['count'], 'billed': r['billed'], 'due': r['due']}
            for r in bills.values('status')
            .annotate(count=Count('id'), billed=_sum('total_amount'), due=_sum('due_amount'))
            .order_by('status')
        ]

        by_project = [
            {
                'project_id': r['project_id'],
                'name': r['project__name'],
                'cycle_billed': r['cycle_billed'],
                'cycle_collected': r['cycle_collected'],
                'total_due': r['total_due'],
            }
            for r in bills.values('project_id', 'project__name')
            .annotate(
                cycle_billed=_sum('total_amount', filter=Q(billing_month=latest)),
                cycle_collected=_sum('paid_amount', filter=Q(billing_month=latest)),
                total_due=_sum('due_amount'),
            )
            .order_by('-cycle_billed', 'project__name')
        ]

        recent = (
            Payment.objects.filter(status='Approved')
            .select_related('bill__unit', 'bill__building')
            .order_by('-payment_date', '-id')[:6]
        )
        recent_payments = [
            {
                'id': p.id,
                'bill_number': p.bill.bill_number,
                'unit_no': p.bill.unit.unit_no,
                'building_name': p.bill.building.name,
                'amount': p.paid_amount,
                'method': p.payment_method,
                'date': _iso(p.payment_date) if hasattr(p.payment_date, 'isoformat') else str(p.payment_date),
            }
            for p in recent
        ]

        return {
            'has_bills': True,
            'latest_month': _iso(latest),
            'cycle': cycle,
            'previous': previous,
            'totals': totals,
            'trend': trend,
            'by_status': by_status,
            'by_project': by_project,
            'aging': _aging(bills, today),
            'top_due_units': _top_due_units(bills, 8),
            'recent_payments': recent_payments,
        }


# ── Reports page ─────────────────────────────────────────────────────────────

class ReportInsightsView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    ALLOWED_MONTHS = (3, 6, 12, 24)

    def get(self, request):
        today = timezone.localdate()
        can_financial = _can_see_financials(request, self)

        try:
            months = int(request.query_params.get('months', 12))
        except (TypeError, ValueError):
            months = 12
        if months not in self.ALLOWED_MONTHS:
            months = 12

        project = request.query_params.get('project')
        all_bills = Bill.objects.all()
        if project and str(project).isdigit():
            all_bills = all_bills.filter(project_id=int(project))

        latest = all_bills.aggregate(m=Max('billing_month'))['m']
        data = {'can_financial': can_financial, 'months': months, 'has_bills': latest is not None}
        if latest is None:
            return Response(data)

        start = _add_months(latest, -(months - 1))
        period_bills = all_bills.filter(billing_month__gte=start, billing_month__lte=latest)

        data['period'] = {'from': _iso(start), 'to': _iso(latest)}

        # Outstanding is a "right now" figure, so it ignores the period.
        out = all_bills.filter(due_amount__gt=0).aggregate(
            due=_sum('due_amount'),
            bills=Count('id'),
            units=Count('unit_id', distinct=True),
            oldest=Min('billing_month'),
        )
        data['outstanding'] = {
            'due': out['due'],
            'bills': out['bills'],
            'units': out['units'],
            'oldest_month': _iso(out['oldest']),
        }
        data['aging'] = _aging(all_bills, today)
        data['top_due_units'] = _top_due_units(all_bills, 10)

        if not can_financial:
            return Response(data)

        data['trend'] = _rollup(period_bills)
        data['totals'] = period_bills.aggregate(
            billed=_sum('total_amount'),
            collected=_sum('paid_amount'),
            due=_sum('due_amount'),
            usage=_sum('total_usage_m3'),
            bills=Count('id'),
        )

        data['by_project'] = [
            {
                'id': r['project_id'], 'name': r['project__name'],
                'billed': r['billed'], 'collected': r['collected'],
                'due': r['due'], 'bills': r['bills'],
            }
            for r in period_bills.values('project_id', 'project__name')
            .annotate(
                billed=_sum('total_amount'), collected=_sum('paid_amount'),
                due=_sum('due_amount'), bills=Count('id'),
            )
            .order_by('-billed')
        ]

        data['by_building'] = [
            {
                'id': r['building_id'], 'name': r['building__name'],
                'project_name': r['project__name'],
                'billed': r['billed'], 'collected': r['collected'],
                'due': r['due'], 'bills': r['bills'],
            }
            for r in period_bills.values('building_id', 'building__name', 'project__name')
            .annotate(
                billed=_sum('total_amount'), collected=_sum('paid_amount'),
                due=_sum('due_amount'), bills=Count('id'),
            )
            .order_by('-billed')[:40]
        ]

        # Payments that went against the bills in this period (approved only).
        pay_qs = Payment.objects.filter(
            status='Approved',
            bill__billing_month__gte=start, bill__billing_month__lte=latest,
        )
        if project and str(project).isdigit():
            pay_qs = pay_qs.filter(bill__project_id=int(project))
        data['payment_methods'] = [
            {'payment_method': r['payment_method'], 'total_amount': r['total'], 'count': r['count']}
            for r in pay_qs.values('payment_method')
            .annotate(total=_sum('paid_amount'), count=Count('id'))
            .order_by('-total')
        ]

        return Response(data)