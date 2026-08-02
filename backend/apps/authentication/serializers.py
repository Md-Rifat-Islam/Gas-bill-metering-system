from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from .models import StaffUser, Role, CustomerUser, OTPVerification, UserPermission, PermissionModule
from django.contrib.auth import authenticate


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'role_name']


class UserPermissionSerializer(serializers.ModelSerializer):
    module_label = serializers.CharField(source='get_module_display', read_only=True)

    class Meta:
        model = UserPermission
        fields = ['id', 'module', 'module_label', 'can_view', 'can_edit', 'can_delete', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class StaffUserSerializer(serializers.ModelSerializer):
    role = RoleSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), source='role', write_only=True, required=False
    )
    password = serializers.CharField(write_only=True, required=False)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default=None)
    permission_overrides = UserPermissionSerializer(many=True, read_only=True)
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = StaffUser
        fields = [
            'id', 'name', 'email', 'mobile', 'role', 'role_id', 'is_active',
            'password', 'created_at', 'created_by', 'created_by_name',
            'permission_overrides', 'notes', 'can_manage',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'created_by_name', 'permission_overrides', 'can_manage']

    def get_can_manage(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
            return False
        return request.user.can_manage(obj)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        request = self.context.get('request')
        user = StaffUser(**validated_data)
        if password:
            user.set_password(password)
        if request and getattr(request, 'user', None) and request.user.is_authenticated:
            user.created_by = request.user
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, data):
        user = authenticate(email=data['email'], password=data['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials')
        if not user.is_active:
            raise serializers.ValidationError('Account is deactivated')
        data['user'] = user
        return data


class OTPRequestSerializer(serializers.Serializer):
    mobile = serializers.CharField(max_length=15)


class OTPVerifySerializer(serializers.Serializer):
    mobile = serializers.CharField(max_length=15)
    otp_code = serializers.CharField(max_length=6)


class CustomerUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerUser
        fields = ['id', 'name', 'mobile', 'email', 'is_active', 'created_at']
        read_only_fields = ['id', 'mobile', 'is_active', 'created_at']
        # NOTE: 'password' is deliberately not in `fields` — it is never
        # readable or writable through this serializer, by design. All
        # password paths (login, self-service change, admin reset) go
        # through the dedicated serializers below instead.


class CustomerPasswordLoginSerializer(serializers.Serializer):
    """
    Resident Portal — mobile + password login.

    Deliberately returns the SAME generic error for "no account with this
    mobile" and "wrong password" — distinguishing the two would let someone
    probe which mobile numbers have a portal account registered.
    """
    mobile = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        generic_error = 'Invalid mobile number or password.'
        try:
            customer = CustomerUser.objects.get(mobile=data['mobile'])
        except CustomerUser.DoesNotExist:
            raise serializers.ValidationError(generic_error)

        if not customer.is_active:
            raise serializers.ValidationError('This account has been deactivated.')

        if not customer.check_password(data['password']):
            raise serializers.ValidationError(generic_error)

        data['customer'] = customer
        return data


class CustomerChangePasswordSerializer(serializers.Serializer):
    """
    Resident Portal, profile page — authenticated customer sets a new
    password after proving control of their registered mobile via OTP.
    The OTP is always checked against `self.context['customer'].mobile`
    (the logged-in customer's OWN number), never a mobile from the request
    body, so this can't be used to reset someone else's password.
    """
    otp_code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(min_length=6, write_only=True)

    def validate(self, data):
        customer = self.context['customer']
        otp_obj = OTPVerification.objects.filter(
            mobile=customer.mobile, otp_code=data['otp_code'], is_used=False
        ).order_by('-created_at').first()

        if not otp_obj or not otp_obj.is_valid():
            raise serializers.ValidationError({'otp_code': 'Invalid or expired OTP.'})

        data['otp_obj'] = otp_obj
        return data


class AdminResetCustomerPasswordSerializer(serializers.Serializer):
    """
    Staff-side (no OTP) reset — used from the Unit edit form. `new_password`
    is optional; if omitted, the password resets to the mobile number
    itself (mirrors the original auto-provisioned default, a quick
    "reset to default" action for support calls).
    """
    mobile = serializers.CharField(max_length=15)
    new_password = serializers.CharField(min_length=6, required=False, allow_blank=True)

    def validate_mobile(self, value):
        if not CustomerUser.objects.filter(mobile=value).exists():
            raise serializers.ValidationError(
                'No portal account exists yet for this mobile number.'
            )
        return value