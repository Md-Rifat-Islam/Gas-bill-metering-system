from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
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
        return self.create_user(email, password, **extra_fields)


class StaffUser(AbstractBaseUser, PermissionsMixin):
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    mobile = models.CharField(max_length=15, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # Hierarchy: who created this account. Used to enforce that an Admin may
    # only manage (edit/delete/change-permissions-for) users they created,
    # never a Super Admin or another Admin.
    created_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_users',
        help_text='The staff user who created this account. Null for the first Super Admin.',
    )

    # Free-text field backing the "Additional Details" tab of the staff edit form.
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
        """
        Hierarchy rule used everywhere a StaffUser tries to view/edit/delete
        or change permissions for another StaffUser (`target`).

        - Super Admin can manage everyone (including other Super Admins, but
          not themselves for the "delete" case — enforced separately).
        - Admin can manage only users they personally created, and only if
          that user is not an Admin or Super Admin (Admin cannot promote
          a peer or touch a superior).
        - Everyone else: no management rights.
        """
        if self.role_name == Role.SUPER_ADMIN:
            return True
        if self.role_name == Role.ADMIN:
            if target.role_name in (Role.SUPER_ADMIN, Role.ADMIN):
                return False
            return target.created_by_id == self.id
        return False


class PermissionModule(models.TextChoices):
    """Modules that can have granular per-user permission overrides."""
    PROJECTS = 'projects', 'Projects'
    BUILDINGS = 'buildings', 'Buildings'
    UNITS = 'units', 'Units'
    METERS = 'meters', 'Meters'
    BILLING = 'billing', 'Billing'
    PAYMENTS = 'payments', 'Payments'
    REPORTS = 'reports', 'Reports'
    STAFF = 'staff', 'Staff Management'
    AUDIT = 'audit', 'Audit Logs'


class UserPermission(models.Model):
    """
    Per-user, per-module permission override on top of the base role.

    A row here means: "for this module, this user's access is exactly
    {can_view, can_edit, can_delete}" — overriding whatever the role default
    would otherwise grant. Absence of a row means "use role default."

    This is what a Super Admin (for anyone) or an Admin (only for users they
    created) edits on the Role & Permission tab of the staff edit form.
    """
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
    """End-user / customer who logs in via mobile OTP"""
    mobile = models.CharField(max_length=15, unique=True)
    name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customer_users'

    def __str__(self):
        return f"{self.name} ({self.mobile})"

    # DRF permission checks (IsAuthenticated etc.) expect these attributes
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
        # Invalidate previous OTPs for this mobile
        cls.objects.filter(mobile=mobile, is_used=False).update(is_used=True)
        otp = ''.join(random.choices(string.digits, k=6))
        expires_at = timezone.now() + timedelta(minutes=5)
        return cls.objects.create(mobile=mobile, otp_code=otp, expires_at=expires_at)
