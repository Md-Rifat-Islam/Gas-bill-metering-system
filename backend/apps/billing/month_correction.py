"""
Bulk billing-month correction.

POST /api/v1/billing/move-month/
body: {
    "project_id":  3,
    "building_id": 12,            # optional — omit/null for every building in the project
    "from_month":  "2026-11",     # the WRONG month the bills were created under
    "to_month":    "2026-10",     # the CORRECT month
    "dry_run":     true,          # default true — only previews, changes nothing
    "expected_count": 152         # sent with dry_run=false; must equal the preview's
                                  # movable_count or the request is refused (409)
}

Super Admin only.

What "moving" a bill means here
-------------------------------
1. Bill.billing_month  from_month -> to_month.
   Nothing else on the bill is touched: amounts, readings, bill number, status,
   paid_amount, payments and bKash transactions all stay exactly as they are
   (Payment / PaymentTransaction point at the bill by id, not by month).
   calculate() is deliberately NOT called, so no amount can change.

2. The MeterReading the bill was built from (same meter, reading_date inside
   from_month, identical previous/current values) has its reading_date moved
   to the LAST DAY of to_month.
   This part matters: Bulk Create finds a unit's reading by reading_date
   inside the billing month. If the reading stayed dated in November, the
   next "Bulk Create -> November" would find it and bill the October usage a
   second time. Moving it keeps the reading chain intact (the next real
   reading still starts from this reading's current_reading) and makes the
   meter show as "Pending" for the month that has NOT been read yet.
   The original date is kept in the reading's notes and in the audit log.

Skipped (never overwritten):
   - the unit already has a bill in to_month

Writes use queryset.update() instead of .save() on purpose: the messaging
and portal apps hook Bill post_save signals to send "new bill" SMS /
notifications, and a month correction must never re-send those.

Everything runs in one DB transaction with the bill rows locked; if any step
fails nothing is changed. Every moved bill (and reading) gets an audit-log
entry holding the old and new values.
"""
import calendar
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from apps.meters.models import MeterReading
from core.permissions import IsSuperAdmin

from .models import Bill
from .serializers import BillSerializer


def _parse_month(value):
    """'YYYY-MM' or 'YYYY-MM-DD' -> date on the 1st of that month, or None."""
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    if len(value) == 7:
        value += '-01'
    try:
        return datetime.strptime(value, '%Y-%m-%d').date().replace(day=1)
    except ValueError:
        return None


def _next_month(month_start):
    return (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)


def _last_day(month_start):
    return month_start.replace(day=calendar.monthrange(month_start.year, month_start.month)[1])


def _month_label(month_start):
    return month_start.strftime('%Y-%m')


def _build_plan(project_id, building_id, from_month, to_month, lock=False):
    """
    Returns (movable, skipped).
      movable: list of dicts {bill, reading, warnings}
      skipped: list of dicts {bill, reason}
    With lock=True the bill rows are locked (FOR UPDATE) — call it inside
    transaction.atomic(). of=('self',) locks only the bills table, because
    the reverse one-to-one join to Meter is a LEFT JOIN and Postgres refuses
    FOR UPDATE on the nullable side.
    """
    bills = (
        Bill.objects
        .filter(project_id=project_id, billing_month=from_month)
        .select_related('unit__meter', 'building')
        .order_by('building__name', 'unit__unit_no')
    )
    if building_id:
        bills = bills.filter(building_id=building_id)
    if lock:
        bills = bills.select_for_update(of=('self',))
    bills = list(bills)

    # Units that already have a bill in the target month → conflict.
    already_in_target = set(
        Bill.objects
        .filter(billing_month=to_month, unit_id__in=[b.unit_id for b in bills])
        .values_list('unit_id', flat=True)
    )

    from_next = _next_month(from_month)
    to_next = _next_month(to_month)

    movable, skipped = [], []
    for bill in bills:
        if bill.unit_id in already_in_target:
            skipped.append({
                'bill': bill,
                'reason': f'Unit already has a bill for {_month_label(to_month)} — not overwritten',
            })
            continue

        warnings = []
        reading = None
        meter = getattr(bill.unit, 'meter', None)
        if meter is None:
            warnings.append('Unit has no meter — only the bill will move')
        else:
            reading = (
                MeterReading.objects
                .filter(
                    meter=meter,
                    reading_date__gte=from_month, reading_date__lt=from_next,
                    previous_reading=bill.previous_reading,
                    current_reading=bill.current_reading,
                )
                .order_by('-reading_date', '-created_at')
                .first()
            )
            if reading is None:
                warnings.append(
                    'No matching meter reading found in the old month — only the bill will move'
                )
            elif MeterReading.objects.filter(
                meter=meter, reading_date__gte=to_month, reading_date__lt=to_next,
            ).exists():
                warnings.append(
                    f'Meter already has a reading dated in {_month_label(to_month)} — please review'
                )

        movable.append({'bill': bill, 'reading': reading, 'warnings': warnings})

    return movable, skipped


def _bill_row(bill):
    return {
        'bill_id': bill.id,
        'bill_number': bill.bill_number,
        'unit_no': bill.unit.unit_no,
        'building_name': bill.building.name,
        'total_amount': str(bill.total_amount),
        'paid_amount': str(bill.paid_amount),
        'status': bill.status,
    }


class MoveBillingMonthView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        project_id = request.data.get('project_id')
        building_id = request.data.get('building_id') or None
        from_month = _parse_month(request.data.get('from_month'))
        to_month = _parse_month(request.data.get('to_month'))
        # Safe by default: only an explicit false actually changes data.
        dry_run = request.data.get('dry_run') is not False

        if not project_id:
            return Response({'detail': 'project_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not from_month or not to_month:
            return Response(
                {'detail': 'from_month and to_month are required (YYYY-MM).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if from_month == to_month:
            return Response(
                {'detail': 'The old and the new month are the same.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dry_run:
            movable, skipped = _build_plan(project_id, building_id, from_month, to_month)
            return Response(self._payload(movable, skipped, from_month, to_month, dry_run=True))

        with transaction.atomic():
            movable, skipped = _build_plan(project_id, building_id, from_month, to_month, lock=True)

            expected = request.data.get('expected_count')
            if expected is not None and str(expected) != str(len(movable)):
                return Response(
                    {'detail': (
                        f'The data changed since the preview (preview said {expected} bills, '
                        f'now {len(movable)}). Nothing was moved — please preview again.'
                    )},
                    status=status.HTTP_409_CONFLICT,
                )

            now = timezone.now()
            new_reading_date = _last_day(to_month)

            for item in movable:
                bill, reading = item['bill'], item['reading']
                old_bill_data = BillSerializer(bill).data

                Bill.objects.filter(pk=bill.pk).update(
                    billing_month=to_month,
                    last_updated_by=request.user,
                    updated_at=now,
                )
                bill.billing_month = to_month
                bill.last_updated_by = request.user

                extra = {
                    'edited_via': 'month_correction',
                    'billing_month_before': str(from_month),
                    'billing_month_after': str(to_month),
                }

                if reading is not None:
                    old_date = reading.reading_date
                    note = (
                        f'[Month correction: reading date moved {old_date} -> {new_reading_date}; '
                        f'bill moved {_month_label(from_month)} -> {_month_label(to_month)}]'
                    )
                    new_notes = f'{reading.notes}\n{note}' if reading.notes else note
                    MeterReading.objects.filter(pk=reading.pk).update(
                        reading_date=new_reading_date, notes=new_notes,
                    )
                    log_action(
                        request.user, 'meter_readings', reading.id, 'UPDATE',
                        {'reading_date': str(old_date)},
                        {
                            'reading_date': str(new_reading_date),
                            'edited_via': 'month_correction',
                            'bill_id': bill.id,
                        },
                    )
                    extra['moved_reading_id'] = reading.id
                    extra['reading_date_before'] = str(old_date)
                    extra['reading_date_after'] = str(new_reading_date)

                log_action(
                    request.user, 'bills', bill.id, 'UPDATE',
                    old_bill_data, {**BillSerializer(bill).data, **extra},
                )

            payload = self._payload(movable, skipped, from_month, to_month, dry_run=False)
            payload['moved_count'] = len(movable)
            return Response(payload)

    @staticmethod
    def _payload(movable, skipped, from_month, to_month, dry_run):
        return {
            'dry_run': dry_run,
            'from_month': _month_label(from_month),
            'to_month': _month_label(to_month),
            'movable_count': len(movable),
            'movable': [
                {
                    **_bill_row(m['bill']),
                    'reading_found': m['reading'] is not None,
                    'warnings': m['warnings'],
                }
                for m in movable
            ],
            'skipped_count': len(skipped),
            'skipped': [{**_bill_row(s['bill']), 'reason': s['reason']} for s in skipped],
        }