import logging
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from . import services
from .models import SMSCampaign, SMSMessage, SMSSettings, SMSTemplate
from .permissions import MessagingPermission
from .serializers import (
    CampaignInputSerializer, SMSCampaignSerializer, SMSMessageSerializer,
    SMSSettingsSerializer, SMSTemplateSerializer,
)
from .tasks import run_campaign_task, send_message_task

logger = logging.getLogger(__name__)
PERMS = [IsAuthenticated, MessagingPermission]


def _enqueue(task, *args):
    """Queue after the request's transaction commits (ATOMIC_REQUESTS is on)."""
    transaction.on_commit(lambda: task.delay(*args))


class MessagingAccessView(APIView):
    """What the current user may do in Messaging — drives the sidebar/tabs."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        can_view, can_edit, can_delete = MessagingPermission()._resolve(request)
        return Response({'can_view': can_view, 'can_edit': can_edit, 'can_delete': can_delete})


class OverviewView(APIView):
    permission_classes = PERMS

    def get(self, request):
        def counts(since):
            rows = SMSMessage.objects.filter(created_at__gte=since).values('status').annotate(n=Count('id'))
            out = {s: 0 for s, _ in SMSMessage.STATUS_CHOICES}
            out.update({r['status']: r['n'] for r in rows})
            return out

        now = timezone.localtime()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = day_start.replace(day=1)

        balance, balance_error = cache.get('sms_balance'), ''
        if balance is None:
            try:
                balance = services.SMSClient().balance()
                cache.set('sms_balance', balance, 60)
            except (services.ProviderConfigError, services.TransientSMSError) as exc:
                balance, balance_error = None, str(exc)
        return Response({
            'balance': balance, 'balance_error': balance_error,
            'today': counts(day_start), 'month': counts(month_start),
        })


class SettingsView(APIView):
    permission_classes = PERMS

    def get(self, request):
        return Response(SMSSettingsSerializer(SMSSettings.get_solo()).data)

    def put(self, request):
        obj = SMSSettings.get_solo()
        old = SMSSettingsSerializer(obj).data
        ser = SMSSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save(updated_by=request.user)
        log_action(request.user, 'sms_settings', obj.id, 'UPDATE', old, ser.data)
        return Response(ser.data)


class ReminderPreviewView(APIView):
    """How many reminders the current settings would send today (nothing is sent)."""
    permission_classes = PERMS

    def get(self, request):
        cfg = SMSSettings.get_solo()
        today = timezone.localdate()
        bills = list(services.reminder_bills(cfg, today))
        valid = sum(1 for b in bills if services.normalize_mobile(b.unit.mobile_number))
        upcoming = [d for d in (cfg.reminder_days or []) if d >= today.day]
        return Response({
            'eligible_bills': len(bills),
            'with_valid_mobile': valid,
            'without_valid_mobile': len(bills) - valid,
            'next_reminder_day': upcoming[0] if upcoming else (cfg.reminder_days or [None])[0],
            'is_reminder_day_today': today.day in (cfg.reminder_days or []),
        })


class TemplateListCreateView(generics.ListCreateAPIView):
    permission_classes = PERMS
    serializer_class = SMSTemplateSerializer
    pagination_class = None

    def get_queryset(self):
        services.ensure_default_templates()
        return SMSTemplate.objects.all()

    def perform_create(self, serializer):
        import re
        name = serializer.validated_data.get('name', '') or 'notice'
        base = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:40] or 'notice'
        key, i = f'notice-{base}', 2
        while SMSTemplate.objects.filter(key=key).exists():
            key, i = f'notice-{base}-{i}', i + 1
        tpl = serializer.save(key=key, kind=SMSTemplate.KIND_NOTICE, updated_by=self.request.user)
        log_action(self.request.user, 'sms_templates', tpl.id, 'CREATE', None, SMSTemplateSerializer(tpl).data)


class TemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = PERMS
    serializer_class = SMSTemplateSerializer
    queryset = SMSTemplate.objects.all()
    http_method_names = ['get', 'patch', 'delete']

    def perform_update(self, serializer):
        old = SMSTemplateSerializer(serializer.instance).data
        tpl = serializer.save(updated_by=self.request.user)
        log_action(self.request.user, 'sms_templates', tpl.id, 'UPDATE', old, SMSTemplateSerializer(tpl).data)

    def destroy(self, request, *args, **kwargs):
        tpl = self.get_object()
        if tpl.is_system:
            return Response({'detail': 'Built-in templates cannot be deleted (you can switch them off).'}, status=400)
        log_action(request.user, 'sms_templates', tpl.id, 'DELETE', SMSTemplateSerializer(tpl).data, None)
        tpl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageListView(generics.ListAPIView):
    permission_classes = PERMS
    serializer_class = SMSMessageSerializer

    def get_queryset(self):
        qs = SMSMessage.objects.select_related('bill', 'unit', 'unit__building', 'campaign', 'created_by')
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('kind'):
            qs = qs.filter(kind=p['kind'])
        if p.get('campaign'):
            qs = qs.filter(campaign_id=p['campaign'])
        if p.get('date_from'):
            qs = qs.filter(created_at__date__gte=p['date_from'])
        if p.get('date_to'):
            qs = qs.filter(created_at__date__lte=p['date_to'])
        if p.get('search'):
            s = p['search'].strip()
            qs = qs.filter(
                Q(mobile__icontains=s) | Q(body__icontains=s)
                | Q(bill__bill_number__icontains=s) | Q(unit__unit_no__icontains=s)
            )
        return qs


class MessageRetryView(APIView):
    permission_classes = PERMS

    def post(self, request, pk):
        msg = SMSMessage.objects.filter(pk=pk).first()
        if not msg:
            return Response({'detail': 'Not found.'}, status=404)
        if msg.status != SMSMessage.STATUS_FAILED:
            return Response({'detail': 'Only failed messages can be retried.'}, status=400)
        if not services.normalize_mobile(msg.mobile):
            return Response({'detail': 'This message has no valid mobile number.'}, status=400)
        msg.status, msg.error = SMSMessage.STATUS_QUEUED, ''
        msg.save(update_fields=['status', 'error'])
        _enqueue(send_message_task, msg.id)
        return Response(SMSMessageSerializer(msg).data)


class TestSendView(APIView):
    """Send one real SMS right now, to check the gateway is working."""
    permission_classes = PERMS

    def post(self, request):
        mobile = services.normalize_mobile(request.data.get('mobile'))
        if not mobile:
            return Response({'mobile': 'Enter a valid mobile number (01XXXXXXXXX).'}, status=400)
        body = (request.data.get('message') or '').strip() or 'DECO Utility Billing: SMS test message.'
        fields = services._new_message(kind=SMSMessage.KIND_TEST, mobile=mobile, body=body, created_by=request.user)
        msg = SMSMessage.objects.create(**fields)
        try:
            services.deliver(msg)
        except services.TransientSMSError as exc:
            msg.status, msg.error = SMSMessage.STATUS_FAILED, str(exc)[:500]
            msg.attempts += 1
            msg.save(update_fields=['status', 'error', 'attempts'])
        log_action(request.user, 'sms_messages', msg.id, 'CREATE', None, {'kind': 'test', 'mobile': mobile})
        return Response(SMSMessageSerializer(msg).data)


class CampaignView(APIView):
    """
    GET  -> recent notices with delivery progress
    POST -> preview (dry_run=true) or send a notice to all / a project / a
            building / specific units, optionally only units with dues.
    """
    permission_classes = PERMS

    def get(self, request):
        qs = SMSCampaign.objects.select_related('project', 'building', 'created_by').annotate(
            total=Count('messages'),
            sent=Count('messages', filter=Q(messages__status=SMSMessage.STATUS_SENT)),
            failed=Count('messages', filter=Q(messages__status=SMSMessage.STATUS_FAILED)),
            skipped=Count('messages', filter=Q(messages__status=SMSMessage.STATUS_SKIPPED)),
            queued=Count('messages', filter=Q(messages__status=SMSMessage.STATUS_QUEUED)),
        )[:30]
        return Response(SMSCampaignSerializer(qs, many=True).data)

    def post(self, request):
        ser = CampaignInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        rows = services.build_audience(
            audience=d['audience'], project_id=d.get('project_id'), building_id=d.get('building_id'),
            unit_ids=d.get('unit_ids'), only_unpaid=d.get('only_unpaid', False),
        )
        summary = services.audience_summary(rows, d['body'])

        if d.get('dry_run'):
            return Response({'dry_run': True, **summary})
        if summary['recipients'] == 0:
            return Response({'detail': 'No recipients with a valid mobile number match this audience.'}, status=400)

        campaign = SMSCampaign.objects.create(
            title=d['title'].strip(), template=d.get('template'), body=d['body'],
            audience=d['audience'], project_id=d.get('project_id'), building_id=d.get('building_id'),
            unit_ids=d.get('unit_ids') or [], only_unpaid=d.get('only_unpaid', False),
            created_by=request.user,
        )
        log_action(request.user, 'sms_campaigns', campaign.id, 'CREATE', None, {
            'title': campaign.title, 'audience': campaign.audience,
            'recipients': summary['recipients'], 'segments': summary['total_segments'],
        })
        _enqueue(run_campaign_task, campaign.id)
        return Response({'id': campaign.id, 'queued': summary['recipients'], **summary}, status=201)