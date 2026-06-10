from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from .models import StaffUser, Role, CustomerUser, OTPVerification
from .serializers import (
    StaffUserSerializer, LoginSerializer, RoleSerializer,
    OTPRequestSerializer, OTPVerifySerializer, CustomerUserSerializer
)
from apps.audit.utils import log_action


class StaffLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': StaffUserSerializer(user).data,
        })


class LogoutView(APIView):
    def post(self, request):
        try:
            refresh_token = request.data['refresh']
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully'})
        except Exception:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data['mobile']

        # Check if mobile exists in system
        if not CustomerUser.objects.filter(mobile=mobile, is_active=True).exists():
            return Response({'error': 'Mobile number not registered'}, status=status.HTTP_404_NOT_FOUND)

        otp_obj = OTPVerification.generate_otp(mobile)
        # In production: send SMS
        # send_sms(mobile, f"Your OTP is {otp_obj.otp_code}. Valid for 5 minutes.")

        return Response({'message': 'OTP sent successfully', 'otp': otp_obj.otp_code})  # Remove otp in production


class OTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mobile = serializer.validated_data['mobile']
        otp_code = serializer.validated_data['otp_code']

        otp_obj = OTPVerification.objects.filter(
            mobile=mobile, otp_code=otp_code, is_used=False
        ).order_by('-created_at').first()

        if not otp_obj or not otp_obj.is_valid():
            return Response({'error': 'Invalid or expired OTP'}, status=status.HTTP_400_BAD_REQUEST)

        otp_obj.is_used = True
        otp_obj.save()

        customer = CustomerUser.objects.get(mobile=mobile)
        # Generate a simple token for customer (or use JWT with custom backend)
        return Response({
            'message': 'OTP verified successfully',
            'customer': CustomerUserSerializer(customer).data,
        })


class StaffUserListCreateView(generics.ListCreateAPIView):
    queryset = StaffUser.objects.all().select_related('role')
    serializer_class = StaffUserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'CREATE', None, StaffUserSerializer(user).data)


class StaffUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = StaffUser.objects.all().select_related('role')
    serializer_class = StaffUserSerializer

    def perform_update(self, serializer):
        old_data = StaffUserSerializer(self.get_object()).data
        user = serializer.save()
        log_action(self.request.user, 'staff_users', user.id, 'UPDATE', old_data, StaffUserSerializer(user).data)


class MeView(APIView):
    def get(self, request):
        return Response(StaffUserSerializer(request.user).data)


class RoleListView(generics.ListAPIView):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
