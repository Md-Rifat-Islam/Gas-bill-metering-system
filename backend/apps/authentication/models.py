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


class CustomerUser(models.Model):
    """End-user / customer who logs in via mobile OTP"""
    mobile = models.CharField(max_length=15, unique=True)
    name = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customer_users'

    def __str__(self):
        return f"{self.name} ({self.mobile})"


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
