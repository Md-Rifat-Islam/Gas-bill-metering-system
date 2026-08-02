from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views import (
    StaffLoginView, LogoutView, OTPRequestView, OTPVerifyView,
    CustomerPasswordLoginView, CustomerRequestPasswordChangeOTPView,
    CustomerChangePasswordView, AdminResetCustomerPasswordView,
    StaffUserListCreateView, StaffUserDetailView, MeView,
    RoleListView, RoleListPublicView, RolePermissionMatrixView,
    UserPermissionListView, MyPermissionsView,
)

urlpatterns = [
    path('login/',         views.StaffLoginView.as_view(),     name='staff-login'),
    path('logout/',        views.LogoutView.as_view(),         name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(),         name='token-refresh'),

    # Customer Portal — OTP login (fallback method)
    path('otp/request/',   views.OTPRequestView.as_view(),     name='otp-request'),
    path('otp/verify/',    views.OTPVerifyView.as_view(),      name='otp-verify'),

    # Customer Portal — mobile + password login (primary method)
    path('portal/login/',  views.CustomerPasswordLoginView.as_view(), name='portal-login'),

    # Customer Portal — self-service password change, OTP-gated, profile page
    path('portal/password/otp/',    views.CustomerRequestPasswordChangeOTPView.as_view(), name='portal-password-otp'),
    path('portal/password/change/', views.CustomerChangePasswordView.as_view(),            name='portal-password-change'),

    # Staff-side — reset a resident's portal password, no OTP, from Unit edit form
    path('customers/reset-password/', views.AdminResetCustomerPasswordView.as_view(), name='admin-reset-customer-password'),

    path('me/',            views.MeView.as_view(),             name='me'),
    path('staff/',         views.StaffUserListCreateView.as_view(), name='staff-list'),
    path('staff/<int:pk>/', views.StaffUserDetailView.as_view(),   name='staff-detail'),
    path('staff/<int:user_id>/permissions/', views.UserPermissionListView.as_view(), name='staff-permissions'),
    path('roles/',         views.RoleListView.as_view(),       name='roles'),
    path('roles/dropdown/', views.RoleListPublicView.as_view(), name='roles-dropdown'),
    path('roles/permission-matrix/', RolePermissionMatrixView.as_view(), name='roles-permission-matrix'),
    path('me/permissions/', MyPermissionsView.as_view()),
]