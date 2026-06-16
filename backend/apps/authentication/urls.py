from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('login/',         views.StaffLoginView.as_view(),     name='staff-login'),
    path('logout/',        views.LogoutView.as_view(),         name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(),         name='token-refresh'),
    path('otp/request/',   views.OTPRequestView.as_view(),     name='otp-request'),
    path('otp/verify/',    views.OTPVerifyView.as_view(),      name='otp-verify'),
    path('me/',            views.MeView.as_view(),             name='me'),
    path('staff/',         views.StaffUserListCreateView.as_view(), name='staff-list'),
    path('staff/<int:pk>/', views.StaffUserDetailView.as_view(),   name='staff-detail'),
    # roles/ for RBAC management (super_admin only)
    path('roles/',         views.RoleListView.as_view(),       name='roles'),
    # roles/dropdown/ for any staff picking a role in a form
    path('roles/dropdown/', views.RoleListPublicView.as_view(), name='roles-dropdown'),
]