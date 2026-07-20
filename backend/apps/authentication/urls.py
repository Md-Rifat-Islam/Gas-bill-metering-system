from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views import (
    StaffLoginView, LogoutView, OTPRequestView, OTPVerifyView,
    StaffUserListCreateView, StaffUserDetailView, MeView,
    RoleListView, RoleListPublicView, RolePermissionMatrixView,
    UserPermissionListView, MyPermissionsView,
)

urlpatterns = [
    path('login/',         views.StaffLoginView.as_view(),     name='staff-login'),
    path('logout/',        views.LogoutView.as_view(),         name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(),         name='token-refresh'),
    path('otp/request/',   views.OTPRequestView.as_view(),     name='otp-request'),
    path('otp/verify/',    views.OTPVerifyView.as_view(),      name='otp-verify'),
    path('me/',            views.MeView.as_view(),             name='me'),
    path('staff/',         views.StaffUserListCreateView.as_view(), name='staff-list'),
    path('staff/<int:pk>/', views.StaffUserDetailView.as_view(),   name='staff-detail'),
    path('staff/<int:user_id>/permissions/', views.UserPermissionListView.as_view(), name='staff-permissions'),
    # roles/ for RBAC management (super_admin only)
    path('roles/',         views.RoleListView.as_view(),       name='roles'),
    # roles/dropdown/ for any staff picking a role in a form
    path('roles/dropdown/', views.RoleListPublicView.as_view(), name='roles-dropdown'),
    # roles/permission-matrix/ — live role×module matrix for the Roles & RBAC page
    path('roles/permission-matrix/', RolePermissionMatrixView.as_view(), name='roles-permission-matrix'),
    path('me/permissions/', MyPermissionsView.as_view()),
]
