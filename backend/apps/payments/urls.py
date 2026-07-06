from django.urls import path
from .views import (
    PaymentListCreateView,
    PaymentDetailView,
    PendingPaymentListView,
    PaymentApproveView,
    PaymentRejectView,
    PaymentChannelSettingsView,
)

urlpatterns = [
    path('channel-settings/', PaymentChannelSettingsView.as_view()),
    path('pending/',          PendingPaymentListView.as_view()),
    path('',                  PaymentListCreateView.as_view()),
    path('<int:pk>/',         PaymentDetailView.as_view()),
    path('<int:pk>/approve/', PaymentApproveView.as_view()),
    path('<int:pk>/reject/',  PaymentRejectView.as_view()),
]