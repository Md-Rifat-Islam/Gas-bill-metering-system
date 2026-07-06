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
]