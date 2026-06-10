from django.urls import path
from .serializers import PaymentListCreateView, PaymentDetailView

urlpatterns = [
    path('',        PaymentListCreateView.as_view()),
    path('<int:pk>/', PaymentDetailView.as_view()),
]
