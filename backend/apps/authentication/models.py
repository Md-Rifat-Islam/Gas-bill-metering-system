from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.auth.hashers import make_password, check_password as check_password_hash
from django.db import models
import random
import string
from datetime import datetime, timedelta
from django.utils import timezone


class Role(models.Model):
    SUPER_ADMIN = 'super_admin'
    ADMIN = 'admin'
    BILLING_STAFF = 'billing_staff'
    ACCOUNTANT = 'accountant'
    VIEWER = 'viewer'

    ROLE_CHOICES = [
        (SUPER_ADMIN, 'Super Admin'),
        (ADMIN, 'Admin'),
        (BILLING_STAFF, 'Billing Staff'),
        (ACCOUNTANT, 'Accountant'),
        (VIEWER, 'Viewer'),
    ]

    role_name = models.CharField(max_length=50, unique=True, choices=ROLE_CHOICES)

    class Meta:
        db_table = 'roles'

    def __str__(self):
        return self.get_role_name_display()


class StaffUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if 'role' not in extra_fields:
            extra_fields['role'] = Role.objects.get_or_create(role_name=Role.SUPER_ADMIN)[0]
        return self.create_user(email, password, **extra_fields)


class StaffUser(AbstractBaseUser, PermissionsMixin):
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    mobile = models.CharField(max_length=15, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_users',
        help_text='The staff user who created this account. Null for the first Super Admin.',
    )

    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    objects = StaffUserManager()

    class Meta:
        db_table = 'staff_users'

    def __str__(self):
        return f"{self.name} ({self.email})"

    @property
    def role_name(self):
        return self.role.role_name if self.role else None

    def can_manage(self, target: 'StaffUser') -> bool:
        if self.role_name == Role.SUPER_ADMIN:
            return True
        if self.role_name == Role.ADMIN:
            if target.role_name in (Role.SUPER_ADMIN, Role.ADMIN):
                return False
            return target.created_by_id == self.id
        return False


class PermissionModule(models.TextChoices):
    DASHBOARD = 'dashboard', 'Dashboard'
    PROJECTS = 'projects', 'Projects'
    PACKAGES = 'packages', 'Packages'
    BUILDINGS = 'buildings', 'Buildings'
    UNITS = 'units', 'Units'
    METERS = 'meters', 'Meters'
    QUICK_READING = 'quick_reading', 'Quick Reading'
    BILLING = 'billing', 'Billing'
    PAYMENTS = 'payments', 'Payments'
    REPORTS = 'reports', 'Reports'
    FINANCIAL_REPORTS = 'financial_reports', 'Financial Reports'
    STAFF = 'staff', 'Staff Management'
    AUDIT = 'audit', 'Audit Logs'


class UserPermission(models.Model):
    user = models.ForeignKey(
        StaffUser, on_delete=models.CASCADE, related_name='permission_overrides'
    )
    module = models.CharField(max_length=30, choices=PermissionModule.choices)
    can_view = models.BooleanField(default=True)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)

    granted_by = models.ForeignKey(
        StaffUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='permissions_granted',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_permissions'
        unique_together = [('user', 'module')]

    def __str__(self):
        return f"{self.user.email} / {self.module}"


class CustomerUser(models.Model):
    """
    End-user / customer who logs in via the Resident Portal.

    Auth methods, both live simultaneously:
      - Mobile + password (primary). Password is auto-provisioned to equal
        the mobile number itself the first time a Unit is saved with this
        mobile_number (see apps/authentication/signals.py). The resident
        can change it from their Profile page via OTP verification
        (CustomerChangePasswordView); staff can reset it directly with no
        OTP from the Unit edit form (AdminResetCustomerPasswordView).
      - Mobile + OTP (fallback / alternate login — unchanged, still the
        original flow via OTPRequestView / OTPVerifyView).

    `password` stores a Django-hashed value (via set_password), same
    hashing machinery as StaffUser, even though this model doesn't inherit
    AbstractBaseUser — kept as a plain field + helper methods since
    CustomerUser predates this and DRF's IsAuthenticated only needs
    is_authenticated/is_anonymous, not the full auth-user contract.

    NOTE: rows created before this field existed will have password=''.
    Run a one-off backfill (see migration notes) to set password=mobile
    for any existing account with a blank password, or those residents
    won't be able to use password login until they go through the OTP
    change-password flow once.
    """
    mobile = models.CharField(max_length=15, unique=True)
    name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    password = models.CharField(max_length=128, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customer_users'

    def __str__(self):
        return f"{self.name} ({self.mobile})"

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        if not self.password:
            return False
        return check_password_hash(raw_password, self.password)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False


class OTPVerification(models.Model):
    mobile = models.CharField(max_length=15)
    otp_code = models.CharField(max_length=6)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'otp_verifications'

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at

    @classmethod
    def generate_otp(cls, mobile):
        cls.objects.filter(mobile=mobile, is_used=False).update(is_used=True)
        otp = ''.join(random.choices(string.digits, k=6))
        expires_at = timezone.now() + timedelta(minutes=5)
        return cls.objects.create(mobile=mobile, otp_code=otp, expires_at=expires_at)