from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import StaffUser, Role, CustomerUser, OTPVerification
from .serializers import (
    StaffUserSerializer, LoginSerializer, RoleSerializer,
    OTPRequestSerializer, OTPVerifySerializer, CustomerUserSerializer,
)
from apps.audit.utils import log_action
from core.permissions import UserModulePermission, RBACPermission, IsAnyStaff


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
        # TODO: send_sms(mobile, f"Your GasBill OTP is {otp_obj.otp_code}")

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

        # Issue customer-scoped JWT (custom claims so CustomerJWTAuthentication
        # can distinguish this from a StaffUser token)
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


class StaffUserListCreateView(generics.ListCreateAPIView):
    queryset          = StaffUser.objects.all().select_related('role').order_by('name')
    serializer_class  = StaffUserSerializer
    permission_classes = [permissions.IsAuthenticated, UserModulePermission]

    def perform_create(self, serializer):
        # Admin cannot assign Super Admin role
        if self.request.user.role_name == 'admin':
            role_obj = serializer.validated_data.get('role')
            if role_obj and role_obj.role_name == 'super_admin':
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Admin cannot assign Super Admin role.')
        user = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'CREATE', None, StaffUserSerializer(user).data)


class StaffUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset          = StaffUser.objects.all().select_related('role')
    serializer_class  = StaffUserSerializer
    permission_classes = [permissions.IsAuthenticated, UserModulePermission]

    def perform_update(self, serializer):
        old_data = StaffUserSerializer(self.get_object()).data
        user     = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'UPDATE', old_data, StaffUserSerializer(user).data)

    def destroy(self, request, *args, **kwargs):
        from core.permissions import IsSuperAdmin
        if request.user.role_name != 'super_admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin can delete staff.')
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
        # Admin cannot see/assign super_admin role
        qs = Role.objects.all().order_by('id')
        if request.user.role_name == 'admin':
            qs = qs.exclude(role_name='super_admin')
        return Response(RoleSerializer(qs, many=True).data)