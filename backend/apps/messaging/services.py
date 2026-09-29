"""
SMS core: number normalisation, template rendering, the bdbulksms.com client,
message creation (with de-duplication) and delivery.

Provider: https://bdbulksms.com  (API host api.bdbulksms.net)
  send    : POST https://api.bdbulksms.net/api.php?json      token, to, message
  balance : GET  https://api.bdbulksms.net/g_api.php?token=..&balance&json
The token is read from the BDBULKSMS_TOKEN environment variable only.
"""
import json
import logging
import re
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.utils import timezone

from .models import SMSCampaign, SMSMessage, SMSSettings, SMSTemplate

logger = logging.getLogger(__name__)

SEND_URL = 'https://api.bdbulksms.net/api.php?json'
BALANCE_URL = 'https://api.bdbulksms.net/g_api.php'
REQUEST_TIMEOUT = 15


# ── Errors ───────────────────────────────────────────────────────────────────
class ProviderConfigError(Exception):
    """Token missing/not configured. Not retryable."""


class TransientSMSError(Exception):
    """Network problem / provider 5xx. Safe to retry."""


# ── Placeholders & default templates ─────────────────────────────────────────
BILL_PLACEHOLDERS = {
    'name': 'Customer name',
    'unit': 'Unit number',
    'building': 'Building name',
    'project': 'Project name',
    'bill_no': 'Bill number',
    'month': 'Billing month (e.g. September 2026)',
    'total': 'Bill total (Tk)',
    'paid': 'Amount paid so far (Tk)',
    'due': 'Amount still due (Tk)',
    'usage': 'Usage (m3)',
    'portal_url': 'Customer portal address',
}
NOTICE_PLACEHOLDERS = {
    'name': 'Customer name',
    'unit': 'Unit number',
    'building': 'Building name',
    'project': 'Project name',
    'due': "Customer's total unpaid amount for that unit (Tk)",
    'portal_url': 'Customer portal address',
}


def placeholders_for(kind):
    return NOTICE_PLACEHOLDERS if kind == SMSTemplate.KIND_NOTICE else BILL_PLACEHOLDERS


# "Tk" instead of the taka sign: the sign is not a standard SMS character and
# would force every message into Unicode (70 chars/segment instead of 160).
DEFAULT_TEMPLATES = [
    dict(
        key='bill_created', name='Bill created', kind=SMSTemplate.KIND_BILL_CREATED,
        body='Dear {name}, your gas bill for {month} (Unit {unit}) is Tk {total}. '
             'Bill no: {bill_no}. View/pay at {portal_url}. - DECO',
    ),
    dict(
        key='payment_reminder', name='Payment reminder', kind=SMSTemplate.KIND_REMINDER,
        body='Dear {name}, Tk {due} is still due for your {month} gas bill '
             '(Unit {unit}, {bill_no}). Please pay soon at {portal_url}. - DECO',
    ),
    dict(
        key='notice_general', name='General notice', kind=SMSTemplate.KIND_NOTICE,
        body='Dear {name}, notice for {building}: [write your message here]. - DECO',
    ),
    dict(
        key='notice_maintenance', name='Gas supply maintenance', kind=SMSTemplate.KIND_NOTICE,
        body='Dear {name}, gas supply in {building} may be interrupted for maintenance. '
             'We apologize for the inconvenience. - DECO',
    ),
]


def ensure_default_templates():
    for t in DEFAULT_TEMPLATES:
        SMSTemplate.objects.get_or_create(key=t['key'], defaults={**t, 'is_system': True})


# ── Text helpers ─────────────────────────────────────────────────────────────
_PLACEHOLDER_RE = re.compile(r'\{(\w+)\}')


def find_placeholders(body):
    return set(_PLACEHOLDER_RE.findall(body or ''))


def unknown_placeholders(body, kind):
    return sorted(find_placeholders(body) - set(placeholders_for(kind)))


def render(body, ctx):
    return _PLACEHOLDER_RE.sub(lambda m: str(ctx.get(m.group(1), m.group(0))), body)


def sms_info(text):
    """(characters, segments, encoding). Bangla/any non-ASCII => Unicode (70/67 per segment)."""
    n = len(text)
    unicode_ = any(ord(c) > 127 for c in text)
    single, multi = (70, 67) if unicode_ else (160, 153)
    if n == 0:
        segments = 0
    elif n <= single:
        segments = 1
    else:
        segments = -(-n // multi)
    return n, segments, ('Unicode' if unicode_ else 'GSM')


def normalize_mobile(raw):
    """Return a Bangladeshi mobile as 01XXXXXXXXX, or None if it isn't valid."""
    if not raw:
        return None
    digits = re.sub(r'\D', '', str(raw))
    if digits.startswith('880'):
        digits = '0' + digits[3:]
    elif len(digits) == 10 and digits.startswith('1'):
        digits = '0' + digits
    return digits if re.fullmatch(r'01[3-9]\d{8}', digits) else None


def money(value):
    return f'{Decimal(value or 0):,.2f}'


def portal_host():
    url = getattr(settings, 'FRONTEND_URL', '') or ''
    return url.replace('https://', '').replace('http://', '').rstrip('/')


def _customer_name(unit):
    try:
        return unit.allottee.name or 'Customer'
    except Exception:
        return 'Customer'


def bill_context(bill):
    unit = bill.unit
    return {
        'name': _customer_name(unit),
        'unit': unit.unit_no,
        'building': bill.building.name,
        'project': bill.project.name,
        'bill_no': bill.bill_number,
        'month': bill.billing_month.strftime('%B %Y'),
        'total': money(bill.total_amount),
        'paid': money(bill.paid_amount),
        'due': money(bill.due_amount),
        'usage': f'{bill.total_usage_m3:.3f}',
        'portal_url': portal_host(),
    }


def unit_context(unit, due=0):
    return {
        'name': _customer_name(unit),
        'unit': unit.unit_no,
        'building': unit.building.name,
        'project': unit.building.project.name,
        'due': money(due),
        'portal_url': portal_host(),
    }


# ── Provider client ──────────────────────────────────────────────────────────
def get_token():
    return getattr(settings, 'BDBULKSMS_TOKEN', '') or ''


def parse_send_response(status_code, text):
    """
    Returns (ok, detail). Deliberately tolerant about the response shape
    (JSON list/dict with a status field, or a plain 'Ok: ...' / 'Error: ...'
    string). Anything unrecognised is treated as NOT sent, with the raw
    response kept in the log so it can be checked before retrying.
    """
    raw = (text or '').strip()
    if status_code >= 500:
        raise TransientSMSError(f'Provider error HTTP {status_code}')
    if status_code >= 400:
        return False, f'HTTP {status_code}: {raw[:200]}'

    try:
        data = json.loads(raw)
    except ValueError:
        data = None

    if data is not None:
        items = data if isinstance(data, list) else [data]
        ok_seen, err = False, ''
        for item in items:
            if not isinstance(item, dict):
                continue
            status = str(item.get('status', '')).strip().upper()
            detail = item.get('statusmessage') or item.get('message') or item.get('status') or ''
            if status in ('SENT', 'OK', 'SUCCESS'):
                ok_seen = True
            elif status in ('ERROR', 'FAILED', 'FAIL'):
                err = str(detail)
        if ok_seen and not err:
            return True, ''
        if err:
            return False, err[:300]
        return False, f'Unrecognised provider response (check before retrying): {raw[:200]}'

    low = raw.lower()
    if low.startswith('ok') or low.startswith('sent'):
        return True, ''
    if 'error' in low or 'fail' in low or 'invalid' in low:
        return False, raw[:300]
    return False, f'Unrecognised provider response (check before retrying): {raw[:200]}'


class SMSClient:
    def send(self, mobile, message):
        """Returns (ok, detail, raw_response)."""
        token = get_token()
        if not token:
            raise ProviderConfigError('BDBULKSMS_TOKEN is not configured on the server.')
        try:
            resp = requests.post(
                SEND_URL,
                data={'token': token, 'to': mobile, 'message': message},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise TransientSMSError(f'Network error: {exc}') from exc
        ok, detail = parse_send_response(resp.status_code, resp.text)
        return ok, detail, resp.text

    def balance(self):
        """Raw balance text from the provider, or raises."""
        token = get_token()
        if not token:
            raise ProviderConfigError('BDBULKSMS_TOKEN is not configured on the server.')
        try:
            resp = requests.get(BALANCE_URL, params={'token': token, 'balance': '', 'json': ''},
                                timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            raise TransientSMSError(f'Network error: {exc}') from exc
        return resp.text.strip()[:300]


def deliver(msg):
    """
    Send one queued SMSMessage and record the outcome. Raises
    TransientSMSError for retryable problems (the Celery task handles retry).
    """
    try:
        ok, detail, raw = SMSClient().send(msg.mobile, msg.body)
    except ProviderConfigError as exc:
        msg.status = SMSMessage.STATUS_FAILED
        msg.error = str(exc)
        msg.attempts += 1
        msg.save(update_fields=['status', 'error', 'attempts'])
        return msg

    msg.attempts += 1
    msg.provider_response = (raw or '')[:1000]
    if ok:
        msg.status = SMSMessage.STATUS_SENT
        msg.sent_at = timezone.now()
        msg.error = ''
    else:
        msg.status = SMSMessage.STATUS_FAILED
        msg.error = detail[:500]
    msg.save(update_fields=['status', 'error', 'attempts', 'provider_response', 'sent_at'])
    return msg


# ── Message creation ─────────────────────────────────────────────────────────
def _new_message(**kwargs):
    """Build a message; auto-marks it Skipped when there's no valid number."""
    mobile = kwargs.get('mobile')
    body = kwargs['body']
    kwargs['segments'] = max(1, sms_info(body)[1])
    if not mobile:
        kwargs['mobile'] = ''
        kwargs['status'] = SMSMessage.STATUS_SKIPPED
        kwargs['error'] = 'Missing or invalid mobile number'
    return kwargs


def create_bill_message(bill, kind, template_key, reminder_day=0, today=None):
    """
    Create (once) the automatic SMS for a bill. Returns the new message, or
    None if it already existed / template is off / nothing to send.
    """
    tpl = SMSTemplate.objects.filter(key=template_key, is_active=True).first()
    if not tpl:
        return None
    today = today or timezone.localdate()
    period = bill.billing_month if kind == SMSMessage.KIND_BILL_CREATED else today.replace(day=1)

    fields = _new_message(
        kind=kind,
        mobile=normalize_mobile(bill.unit.mobile_number),
        body=render(tpl.body, bill_context(bill)),
        unit=bill.unit,
    )
    msg, created = SMSMessage.objects.get_or_create(
        bill=bill, kind=kind, reminder_day=reminder_day, period=period, defaults=fields,
    )
    return msg if created else None


def reminder_bills(cfg, today):
    """Unpaid/partial bills eligible for a reminder under the current settings."""
    month_start = today.replace(day=1)
    earliest = month_start
    for _ in range(cfg.remind_months_back):
        earliest = (earliest - timedelta(days=1)).replace(day=1)

    from apps.billing.models import Bill
    return (
        Bill.objects
        .filter(status__in=['Unpaid', 'Partial'], due_amount__gt=0,
                billing_month__gte=earliest, billing_month__lte=month_start)
        .select_related('unit', 'unit__allottee', 'building', 'project')
    )


# ── Notices (campaigns) ──────────────────────────────────────────────────────
def build_audience(*, audience, project_id=None, building_id=None, unit_ids=None, only_unpaid=False):
    """
    Resolve a notice audience to a list of dicts:
      {unit, mobile (valid or None), due}
    Only Active units are ever included.
    """
    from apps.billing.models import Bill
    from apps.units.models import Unit
    from django.db.models import Sum

    units = Unit.objects.filter(status='Active').select_related(
        'building', 'building__project', 'allottee'
    )
    if audience == SMSCampaign.AUDIENCE_PROJECT:
        units = units.filter(building__project_id=project_id)
    elif audience == SMSCampaign.AUDIENCE_BUILDING:
        units = units.filter(building_id=building_id)
    elif audience == SMSCampaign.AUDIENCE_UNITS:
        units = units.filter(id__in=unit_ids or [])

    due_rows = (
        Bill.objects.filter(status__in=['Unpaid', 'Partial'], due_amount__gt=0)
        .values('unit_id').annotate(total_due=Sum('due_amount'))
    )
    due_by_unit = {r['unit_id']: r['total_due'] for r in due_rows}
    if only_unpaid:
        units = units.filter(id__in=list(due_by_unit.keys()))

    return [
        {
            'unit': u,
            'mobile': normalize_mobile(u.mobile_number),
            'due': due_by_unit.get(u.id, Decimal('0')),
        }
        for u in units.order_by('building__name', 'floor_no', 'unit_no')
    ]


def audience_summary(rows, body):
    """Counts + a few rendered samples, for the pre-send preview."""
    seen, recipients, no_mobile, duplicates, segments, samples = set(), 0, 0, 0, 0, []
    for r in rows:
        if not r['mobile']:
            no_mobile += 1
            continue
        text = render(body, unit_context(r['unit'], r['due']))
        key = (r['mobile'], text)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        recipients += 1
        segments += max(1, sms_info(text)[1])
        if len(samples) < 3:
            samples.append({'unit': r['unit'].unit_no, 'mobile': r['mobile'], 'text': text})
    return {
        'units': len(rows),
        'recipients': recipients,
        'skipped_no_mobile': no_mobile,
        'skipped_duplicates': duplicates,
        'total_segments': segments,
        'samples': samples,
    }


def create_campaign_messages(campaign):
    """Create the per-recipient SMSMessage rows. Returns ids of Queued ones."""
    rows = build_audience(
        audience=campaign.audience, project_id=campaign.project_id,
        building_id=campaign.building_id, unit_ids=campaign.unit_ids,
        only_unpaid=campaign.only_unpaid,
    )
    seen, queued = set(), []
    for r in rows:
        text = render(campaign.body, unit_context(r['unit'], r['due']))
        if r['mobile']:
            key = (r['mobile'], text)
            if key in seen:
                continue
            seen.add(key)
        fields = _new_message(
            kind=SMSMessage.KIND_NOTICE, mobile=r['mobile'], body=text,
            unit=r['unit'], campaign=campaign, created_by=campaign.created_by,
        )
        msg = SMSMessage.objects.create(**fields)
        if msg.status == SMSMessage.STATUS_QUEUED:
            queued.append(msg.id)
    return queued