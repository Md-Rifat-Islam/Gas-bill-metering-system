from django.urls import path
from . import views

urlpatterns = [
    path('me/',                     views.PortalMeView.as_view()),
    path('dashboard/',              views.PortalDashboardView.as_view()),
    path('bills/',                  views.PortalBillListView.as_view()),
    path('bills/<int:pk>/',         views.PortalBillDetailView.as_view()),
    path('bills/<int:pk>/invoice/', views.PortalInvoicePDFView.as_view()),
    path('payments/',               views.PortalPaymentListView.as_view()),
    path('payments/submit/',        views.PortalPaymentSubmitView.as_view()),
    path('payments/initiate/',      views.PortalPaymentInitiateView.as_view()),
    path('payment-channels/',       views.PortalPaymentChannelView.as_view()),
    path('units/',                  views.PortalUnitListView.as_view(), name='portal-units'),
    path('notifications/',          views.NotificationListView.as_view(), name='portal-notifications'),
    path('notifications/<int:pk>/read/', views.NotificationMarkReadView.as_view(), name='portal-notification-read'),
    path('notifications/read-all/', views.NotificationMarkAllReadView.as_view(), name='portal-notifications-read-all'),

    # Project manager unit — read-only project-wide bill status
    path('manager/access/',         views.PortalManagerAccessView.as_view(), name='portal-manager-access'),
    path('manager/overview/',       views.PortalManagerOverviewView.as_view(), name='portal-manager-overview'),
    path('manager/bills/',          views.PortalManagerBillListView.as_view(), name='portal-manager-bills'),
]