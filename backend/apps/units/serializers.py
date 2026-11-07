from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from .models import Unit, Allottee
from apps.buildings.models import Building
from apps.projects.models import Package
from apps.audit.utils import log_action

# Only these roles may assign / remove a project's portal manager unit.
# Enforced here (not just hidden in the UI) because Billing/other roles can
# still be given Units edit rights through per-user permission overrides.
MANAGER_ASSIGN_ROLES = ('super_admin', 'admin')


class AllotteeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allottee
        fields = ['id', 'name', 'email', 'nid', 'created_at', 'updated_at']


class UnitSerializer(serializers.ModelSerializer):
    allottee        = AllotteeSerializer(read_only=True)
    building_name   = serializers.CharField(source='building.name',          read_only=True)
    project_name    = serializers.CharField(source='building.project.name',  read_only=True)
    package_name    = serializers.CharField(source='package.name',           read_only=True, default=None)

    # meter_no/meter_id/meter_type/barcode are now READ-ONLY, sourced from
    # the linked Meter row (assigned via the Units page's Assign Meter
    # action, which writes to /meters/). Previously meter_no was also a
    # plain writable field directly on Unit, completely disconnected from
    # the Meter model — two independent places could disagree about a
    # unit's meter number, and assigning a Meter to a unit that already
    # had one hit Meter.unit's OneToOneField uniqueness constraint with an
    # unhandled error. Falls back to the legacy Unit.meter_no column (kept
    # in the DB, no longer written to going forward) for units created
    # before this fix that have old data but no Meter row yet.
    meter_id   = serializers.SerializerMethodField()
    meter_no   = serializers.SerializerMethodField()
    meter_type = serializers.SerializerMethodField()
    barcode    = serializers.SerializerMethodField()

    # THE FIX (meter-reading baseline bug): exposes the linked Meter's
    # initial_reading so the frontend's MeterAssignModal can actually
    # pre-fill it on Edit. Without this, the Edit form always showed 0 in
    # that field regardless of what was saved, since the Units list/detail
    # endpoint never returned the value at all. Same read-only,
    # sourced-from-Meter pattern as meter_no/meter_type/barcode above.
    initial_reading = serializers.SerializerMethodField()

    # Fix: these were previously `write_only=True`, which meant GET
    # requests (the ones the Units list and Edit-modal pre-fill rely on)
    # never returned building_id/package_id at all — only the human-
    # readable building_name/project_name/package_name strings. The
    # frontend Edit form was looking for editItem.building_id to derive
    # both the Building AND Project selects, and editItem.package_id for
    # the Package select, so both silently rendered blank on every edit no
    # matter how the frontend timed its effects. PrimaryKeyRelatedField
    # already knows how to serialize the related object's PK on read, so
    # dropping write_only is enough — no separate read field needed, and
    # writes (POST/PUT still accepting a plain id) are unaffected.
    building_id = serializers.PrimaryKeyRelatedField(
        queryset=Building.objects.all(), source='building'
    )
    package_id = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(), source='package',
        required=False, allow_null=True
    )

    # NOTE: mobile_number lives on Unit (not Allottee) at the DB level —
    # the frontend now visually groups it under "Allottee Information",
    # but no model/migration change was needed for that move. What *did*
    # change: this field is explicitly declared here (instead of being
    # left to ModelSerializer's default mapping) so we can force it
    # required=True at the API layer, since Unit.mobile_number is still
    # null=True/blank=True at the model level for backward compatibility
    # with rows created before this became a business rule. Editing an
    # existing unit that has no mobile number will now require adding one.
    mobile_number = serializers.CharField(required=True, allow_blank=False, max_length=15)

    # Allottee nested write fields
    allottee_name  = serializers.CharField(write_only=True, required=False, allow_blank=True)
    allottee_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    allottee_nid   = serializers.CharField(write_only=True, required=False, allow_blank=True)

    # ── Project manager unit ────────────────────────────────────────────────
    # Read side: is THIS unit its project's manager unit, and which unit
    # currently is (so the edit form can warn "this will replace X").
    # Both read building.project(.manager_unit) — the Unit views
    # select_related that chain, so list pages don't pay a query per row.
    is_project_manager = serializers.SerializerMethodField()
    project_manager_unit_label = serializers.SerializerMethodField()
    # Write side: true = make this unit its project's manager (replacing any
    # other), false = remove it if it is. Admin / Super Admin only. Omitting
    # it, or sending the unit's current state, changes nothing.
    set_project_manager = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Unit
        fields = [
            'id', 'building_id', 'building_name', 'project_name',
            'floor_no', 'unit_no', 'meter_id', 'meter_no', 'meter_type', 'barcode',
            'initial_reading',
            'mobile_number', 'package_id', 'package_name', 'status',
            'allottee', 'allottee_name', 'allottee_email', 'allottee_nid',
            'is_project_manager', 'project_manager_unit_label', 'set_project_manager',
            'created_at', 'updated_at',
        ]

    def get_meter_id(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.id if meter else None

    def get_meter_no(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.meter_no if meter else obj.meter_no

    def get_meter_type(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.meter_type if meter else None

    def get_barcode(self, obj):
        meter = getattr(obj, 'meter', None)
        return meter.barcode if meter else None

    def get_initial_reading(self, obj):
        meter = getattr(obj, 'meter', None)
        return str(meter.initial_reading) if meter else None

    def get_is_project_manager(self, obj):
        return obj.building.project.manager_unit_id == obj.id

    def get_project_manager_unit_label(self, obj):
        manager = obj.building.project.manager_unit
        if not manager:
            return None
        return f'{manager.building.name} · Floor {manager.floor_no} — {manager.unit_no}'

    def _save_allottee(self, unit, name, email, nid):
        if name:
            Allottee.objects.update_or_create(
                unit=unit,
                defaults={'name': name, 'email': email or '', 'nid': nid or ''},
            )

    def _apply_manager_flag(self, unit, wanted):
        """
        Make `unit` its project's manager (wanted=True) or remove it
        (wanted=False). No-op when it already matches. Called from
        create()/update() inside their transaction, AFTER the unit itself is
        saved, so the Active-status check sees the new status and any
        failure here rolls the whole save back.
        """
        project = unit.building.project
        currently = project.manager_unit_id == unit.id
        if wanted == currently:
            return

        request = self.context.get('request')
        role_name = getattr(getattr(request, 'user', None), 'role_name', None)
        if role_name not in MANAGER_ASSIGN_ROLES:
            raise PermissionDenied('Only Admin or Super Admin can assign a project manager unit.')

        previous = project.manager_unit.unit_no if project.manager_unit_id else None
        if wanted:
            if unit.status != Unit.STATUS_ACTIVE:
                raise serializers.ValidationError(
                    {'set_project_manager': 'Only an Active unit can be the project manager unit.'}
                )
            if not unit.mobile_number:
                raise serializers.ValidationError(
                    {'set_project_manager': 'The manager unit needs a mobile number — that is how the resident logs in.'}
                )
            project.manager_unit = unit
        else:
            project.manager_unit = None
        project.save(update_fields=['manager_unit', 'updated_at'])

        log_action(
            request.user, 'projects', project.id, 'UPDATE',
            {'manager_unit': previous},
            {'manager_unit': unit.unit_no if wanted else None},
        )

    @transaction.atomic
    def create(self, validated_data):
        allottee_name  = validated_data.pop('allottee_name', '')
        allottee_email = validated_data.pop('allottee_email', '')
        allottee_nid   = validated_data.pop('allottee_nid', '')
        set_manager    = validated_data.pop('set_project_manager', None)
        unit = Unit.objects.create(**validated_data)
        self._save_allottee(unit, allottee_name, allottee_email, allottee_nid)
        if set_manager is not None:
            self._apply_manager_flag(unit, set_manager)
        return unit

    @transaction.atomic
    def update(self, instance, validated_data):
        allottee_name  = validated_data.pop('allottee_name', None)
        allottee_email = validated_data.pop('allottee_email', '')
        allottee_nid   = validated_data.pop('allottee_nid', '')
        set_manager    = validated_data.pop('set_project_manager', None)

        old_project = instance.building.project
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if allottee_name is not None:
            self._save_allottee(instance, allottee_name, allottee_email, allottee_nid)

        # A manager unit moved into a different project's building can't keep
        # managing the project it just left — clear that link.
        if (
            old_project.manager_unit_id == instance.id
            and instance.building.project_id != old_project.id
        ):
            old_project.manager_unit = None
            old_project.save(update_fields=['manager_unit', 'updated_at'])

        if set_manager is not None:
            self._apply_manager_flag(instance, set_manager)
        return instance