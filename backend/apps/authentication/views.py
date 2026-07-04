from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.db import transaction
from .models import StaffUser, Role, CustomerUser, OTPVerification, UserPermission, PermissionModule
from .serializers import (
    StaffUserSerializer, LoginSerializer, RoleSerializer,
    OTPRequestSerializer, OTPVerifySerializer, CustomerUserSerializer,
    UserPermissionSerializer,
)
from apps.audit.utils import log_action
from core.permissions import (
    UserModulePermission, RBACPermission, IsAnyStaff,
    UserPermissionManagePermission, role as get_role, R, A,
)
from core.rbac import ROLE_DEFAULT_PERMISSIONS

class StaffLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user':    StaffUserSerializer(user).data,
        })


class LogoutView(APIView):
    def post(self, request):
        try:
            token = RefreshToken(request.data['refresh'])
            token.blacklist()
            return Response({'message': 'Logged out successfully'})
        except Exception:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


class OTPRequestView(APIView):
    '''
    Customer Portal — request an OTP for mobile login.

    If no CustomerUser exists yet for this mobile but an active Unit has this
    mobile_number on file (set by staff when allotting the unit), a CustomerUser
    is auto-created so the resident can self-onboard without staff action.
    '''
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.conf import settings as dj_settings
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data['mobile']

        customer = CustomerUser.objects.filter(mobile=mobile).first()
        if not customer:
            from apps.units.models import Unit
            unit = (
                Unit.objects.filter(mobile_number=mobile, status='Active')
                .select_related('allottee')
                .first()
            )
            if not unit:
                return Response(
                    {'error': 'Mobile number not found. Please contact your building office.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            customer = CustomerUser.objects.create(
                mobile=mobile,
                name=getattr(unit.allottee, 'name', '') if hasattr(unit, 'allottee') else '',
            )

        if not customer.is_active:
            return Response({'error': 'This account has been deactivated.'}, status=status.HTTP_403_FORBIDDEN)

        otp_obj = OTPVerification.generate_otp(mobile)
        # TODO: send_sms(mobile, f"Your DECO OTP is {otp_obj.otp_code}")

        payload = {'message': 'OTP sent successfully'}
        if dj_settings.DEBUG:
            payload['debug_otp'] = otp_obj.otp_code  # remove in production
        return Response(payload)


class OTPVerifyView(APIView):
    '''Customer Portal — verify OTP and issue customer-scoped JWT tokens.'''
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile, otp_code = serializer.validated_data['mobile'], serializer.validated_data['otp_code']

        otp_obj = OTPVerification.objects.filter(
            mobile=mobile, otp_code=otp_code, is_used=False
        ).order_by('-created_at').first()

        if not otp_obj or not otp_obj.is_valid():
            return Response({'error': 'Invalid or expired OTP'}, status=status.HTTP_400_BAD_REQUEST)

        otp_obj.is_used = True
        otp_obj.save()

        customer = CustomerUser.objects.get(mobile=mobile)

        refresh = RefreshToken()
        refresh['user_type']   = 'customer'
        refresh['customer_id'] = customer.id
        refresh['mobile']      = customer.mobile
        access = refresh.access_token

        return Response({
            'access':   str(access),
            'refresh':  str(refresh),
            'customer': CustomerUserSerializer(customer).data,
        })


# ── Staff (Super Admin / Admin only — UserModulePermission enforces this) ─────

class StaffUserListCreateView(generics.ListCreateAPIView):
    """
    GET  — Super Admin sees everyone. Admin sees everyone too (read access to
           the list is allowed so the org chart makes sense), but the
           `can_edit`/`can_delete` flags computed per-row tell the frontend
           which rows are actually actionable for this Admin.
    POST — both Super Admin and Admin may create new staff. Admin cannot
           assign the Super Admin role to the new user (enforced below) and
           the new user's `created_by` is automatically set to the creator,
           establishing the hierarchy used for all future permission checks.
    """
    queryset            = StaffUser.objects.all().select_related('role', 'created_by').order_by('name')
    serializer_class    = StaffUserSerializer
    permission_classes  = [permissions.IsAuthenticated, UserModulePermission]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        if self.request.user.role_name == Role.ADMIN:
            role_obj = serializer.validated_data.get('role')
            if role_obj and role_obj.role_name in (Role.SUPER_ADMIN, Role.ADMIN):
                raise PermissionDenied('Admin cannot create Super Admin or Admin accounts.')
        user = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'CREATE', None, StaffUserSerializer(user).data)


class StaffUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset            = StaffUser.objects.all().select_related('role', 'created_by')
    serializer_class    = StaffUserSerializer
    permission_classes  = [permissions.IsAuthenticated, UserModulePermission]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def _check_hierarchy(self, request, target):
        """Shared guard for update/destroy: enforces StaffUser.can_manage()."""
        if request.user.role_name == Role.SUPER_ADMIN:
            return
        if request.user.role_name == Role.ADMIN:
            if not request.user.can_manage(target):
                raise PermissionDenied(
                    "You can only manage staff accounts you created. "
                    "Super Admin and other Admin accounts cannot be modified."
                )
            return
        raise PermissionDenied('Insufficient permissions.')

    def perform_update(self, serializer):
        target = self.get_object()
        self._check_hierarchy(self.request, target)

        # Admin additionally cannot promote a user they manage to Admin/Super Admin
        if self.request.user.role_name == Role.ADMIN:
            new_role = serializer.validated_data.get('role')
            if new_role and new_role.role_name in (Role.SUPER_ADMIN, Role.ADMIN):
                raise PermissionDenied('Admin cannot promote a user to Admin or Super Admin.')

        old_data = StaffUserSerializer(target).data
        user     = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'UPDATE', old_data, StaffUserSerializer(user).data)

    def destroy(self, request, *args, **kwargs):
        target = self.get_object()

        if target.id == request.user.id:
            raise PermissionDenied('You cannot delete your own account.')

        self._check_hierarchy(request, target)

        log_action(request.user, 'staff_users', target.id, 'DELETE', StaffUserSerializer(target).data, None)
        return super().destroy(request, *args, **kwargs)


class MeView(APIView):
    def get(self, request):
        return Response(StaffUserSerializer(request.user).data)


class RoleListView(APIView):
    permission_classes = [permissions.IsAuthenticated, RBACPermission]

    def get(self, request):
        roles = Role.objects.all().order_by('id')
        return Response(RoleSerializer(roles, many=True).data)


class RoleListPublicView(APIView):
    """Roles list for dropdowns — any authenticated staff, but no RBAC management."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Role.objects.all().order_by('id')
        if request.user.role_name == Role.ADMIN:
            # Admin cannot see/assign Super Admin or Admin roles when creating
            # or editing a user — they can only grant the operational roles.
            qs = qs.exclude(role_name__in=[Role.SUPER_ADMIN, Role.ADMIN])
        return Response(RoleSerializer(qs, many=True).data)


# ── Granular per-module permission overrides ──────────────────────────────────

class UserPermissionListView(APIView):
    """
    GET  /auth/staff/<user_id>/permissions/   — list this user's overrides
    PUT  /auth/staff/<user_id>/permissions/   — replace the full set in one call
         body: [{"module": "billing", "can_view": true, "can_edit": false, "can_delete": false}, ...]

    Enforced by UserPermissionManagePermission:
      - Super Admin can edit anyone's permissions.
      - Admin can edit permissions only for users they created, and never
        for a Super Admin or another Admin (those targets 403 before
        reaching this view, since can_manage() returns False for them).
    """
    permission_classes = [permissions.IsAuthenticated, UserPermissionManagePermission]

    def get_target(self, user_id):
        try:
            return StaffUser.objects.select_related('role').get(id=user_id)
        except StaffUser.DoesNotExist:
            raise ValidationError({'detail': 'User not found.'})

    # def get(self, request, user_id):
    #     target = self.get_target(user_id)
    #     overrides = UserPermission.objects.filter(user=target)
    #     return Response(UserPermissionSerializer(overrides, many=True).data)
    
    def get(self, request, user_id):
        target = self.get_target(user_id)

        # Default permissions for the user's role
        role_defaults = ROLE_DEFAULT_PERMISSIONS.get(target.role_name, {})

        # Existing overrides keyed by module name
        overrides = {
            p.module: p
            for p in UserPermission.objects.filter(user=target)
        }

        result = []

        for module in PermissionModule:
            # Get the default permissions for this module
            default_view, default_edit, default_delete = role_defaults.get(
                module,
                (False, False, False)
            )

            override = overrides.get(module.value)

            if override:
                result.append({
                    "module": module.value,
                    "module_label": module.label,
                    "can_view": override.can_view,
                    "can_edit": override.can_edit,
                    "can_delete": override.can_delete,
                    "is_override": True,
                })
            else:
                result.append({
                    "module": module.value,
                    "module_label": module.label,
                    "can_view": default_view,
                    "can_edit": default_edit,
                    "can_delete": default_delete,
                    "is_override": False,
                })

        return Response(result)

    @transaction.atomic
    def put(self, request, user_id):
        target = self.get_target(user_id)

        # Belt-and-suspenders: re-verify hierarchy even though the permission
        # class already checked it, in case of a future refactor.
        if not request.user.can_manage(target):
            raise PermissionDenied("You do not have permission to manage this user's permissions.")

        valid_modules = {m.value for m in PermissionModule}
        incoming = request.data if isinstance(request.data, list) else []

        old_state = list(UserPermissionSerializer(
            UserPermission.objects.filter(user=target), many=True
        ).data)

        UserPermission.objects.filter(user=target).delete()
        # created = []
        # for row in incoming:
        #     module = row.get('module')
        #     if module not in valid_modules:
        #         continue
        #     created.append(UserPermission.objects.create(
        #         user=target,
        #         module=module,
        #         can_view=bool(row.get('can_view', True)),
        #         can_edit=bool(row.get('can_edit', False)),
        #         can_delete=bool(row.get('can_delete', False)),
        #         granted_by=request.user,
        #     ))
        
        created = []

        defaults = ROLE_DEFAULT_PERMISSIONS.get(target.role_name, {})

        for row in incoming:
            module = row.get("module")

            if module not in valid_modules:
                continue

            default_view, default_edit, default_delete = defaults.get(
                module,
                (False, False, False)
            )

            can_view = bool(row.get("can_view"))
            can_edit = bool(row.get("can_edit"))
            can_delete = bool(row.get("can_delete"))

            # Skip storing if identical to role defaults
            if (
                can_view == default_view and
                can_edit == default_edit and
                can_delete == default_delete
            ):
                continue

            created.append(
                UserPermission.objects.create(
                    user=target,
                    module=module,
                    can_view=can_view,
                    can_edit=can_edit,
                    can_delete=can_delete,
                    granted_by=request.user,
                )
            )
        #----------------------
        new_state = UserPermissionSerializer(created, many=True).data
        log_action(
            request.user, 'user_permissions', target.id, 'UPDATE',
            {'overrides': old_state}, {'overrides': new_state},
        )
        return Response(new_state)
