from rest_framework import serializers

from . import services
from .models import SMSCampaign, SMSMessage, SMSSettings, SMSTemplate

MAX_BODY = 640  # ~4 unicode / ~4 GSM segments — a sane cap for one SMS


class SMSSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.name', read_only=True, default='')

    class Meta:
        model = SMSSettings
        fields = [
            'auto_bill_created', 'auto_reminders', 'reminder_days',
            'send_hour', 'remind_months_back', 'updated_by_name', 'updated_at',
        ]

    def validate_reminder_days(self, value):
        if not isinstance(value, list) or not all(isinstance(d, int) and not isinstance(d, bool) for d in value):
            raise serializers.ValidationError('Provide a list of day numbers, e.g. [8, 10].')
        days = sorted(set(value))
        if any(d < 1 or d > 28 for d in days):
            raise serializers.ValidationError('Days must be between 1 and 28.')
        if len(days) > 6:
            raise serializers.ValidationError('At most 6 reminder days.')
        return days

    def validate_send_hour(self, value):
        if not 0 <= value <= 23:
            raise serializers.ValidationError('Hour must be between 0 and 23.')
        return value

    def validate_remind_months_back(self, value):
        if value > 12:
            raise serializers.ValidationError('Maximum is 12 months.')
        return value


class SMSTemplateSerializer(serializers.ModelSerializer):
    placeholders = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = SMSTemplate
        fields = [
            'id', 'key', 'name', 'kind', 'kind_display', 'body', 'is_active',
            'is_system', 'placeholders', 'updated_at',
        ]
        read_only_fields = ['key', 'is_system', 'kind']

    def get_placeholders(self, obj):
        return [{'key': k, 'label': v} for k, v in services.placeholders_for(obj.kind).items()]

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message text cannot be empty.')
        if len(value) > MAX_BODY:
            raise serializers.ValidationError(f'Message is too long (max {MAX_BODY} characters).')
        kind = self.instance.kind if self.instance else SMSTemplate.KIND_NOTICE
        bad = services.unknown_placeholders(value, kind)
        if bad:
            raise serializers.ValidationError(
                'Unknown placeholder(s): ' + ', '.join('{%s}' % b for b in bad)
            )
        return value


class SMSMessageSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True, default='')
    unit_no = serializers.CharField(source='unit.unit_no', read_only=True, default='')
    building_name = serializers.CharField(source='unit.building.name', read_only=True, default='')
    campaign_title = serializers.CharField(source='campaign.title', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default='')

    class Meta:
        model = SMSMessage
        fields = [
            'id', 'kind', 'kind_display', 'mobile', 'body', 'segments', 'status', 'error',
            'provider_response', 'attempts', 'bill', 'bill_number', 'unit_no', 'building_name',
            'campaign', 'campaign_title', 'reminder_day', 'created_by_name', 'created_at', 'sent_at',
        ]


class SMSCampaignSerializer(serializers.ModelSerializer):
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, default='')
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default='')
    unit_count = serializers.SerializerMethodField()
    # Annotated by the view's queryset.
    total = serializers.IntegerField(read_only=True, default=0)
    sent = serializers.IntegerField(read_only=True, default=0)
    failed = serializers.IntegerField(read_only=True, default=0)
    skipped = serializers.IntegerField(read_only=True, default=0)
    queued = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = SMSCampaign
        fields = [
            'id', 'title', 'body', 'audience', 'audience_display', 'project_name', 'building_name',
            'unit_count', 'only_unpaid', 'created_by_name', 'created_at',
            'total', 'sent', 'failed', 'skipped', 'queued',
        ]

    def get_unit_count(self, obj):
        return len(obj.unit_ids or [])


class CampaignInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=150, required=False, allow_blank=True)
    template = serializers.PrimaryKeyRelatedField(
        queryset=SMSTemplate.objects.filter(kind=SMSTemplate.KIND_NOTICE),
        required=False, allow_null=True,
    )
    body = serializers.CharField(max_length=MAX_BODY)
    audience = serializers.ChoiceField(choices=SMSCampaign.AUDIENCE_CHOICES)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    building_id = serializers.IntegerField(required=False, allow_null=True)
    unit_ids = serializers.ListField(child=serializers.IntegerField(), required=False, max_length=2000)
    only_unpaid = serializers.BooleanField(required=False, default=False)
    dry_run = serializers.BooleanField(required=False, default=False)

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message text cannot be empty.')
        bad = services.unknown_placeholders(value, SMSTemplate.KIND_NOTICE)
        if bad:
            raise serializers.ValidationError(
                'Not available in notices: ' + ', '.join('{%s}' % b for b in bad)
            )
        return value

    def validate(self, data):
        aud = data['audience']
        if aud == SMSCampaign.AUDIENCE_PROJECT and not data.get('project_id'):
            raise serializers.ValidationError({'project_id': 'Select a project.'})
        if aud == SMSCampaign.AUDIENCE_BUILDING and not data.get('building_id'):
            raise serializers.ValidationError({'building_id': 'Select a building.'})
        if aud == SMSCampaign.AUDIENCE_UNITS and not data.get('unit_ids'):
            raise serializers.ValidationError({'unit_ids': 'Select at least one unit.'})
        if not data.get('dry_run') and not (data.get('title') or '').strip():
            raise serializers.ValidationError({'title': 'Give this notice a title.'})
        return data