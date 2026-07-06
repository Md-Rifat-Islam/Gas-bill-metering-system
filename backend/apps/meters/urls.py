from django.urls import path
from . import views

urlpatterns = [
    path('quick-dashboard/',   views.MeterQuickDashboardView.as_view()),
    path('lookup-barcode/',    views.MeterBarcodeLookupView.as_view()),
    path('',                   views.MeterListCreateView.as_view()),
    path('<int:pk>/',          views.MeterDetailView.as_view()),
    path('readings/',          views.MeterReadingListCreateView.as_view()),
    path('readings/<int:pk>/', views.MeterReadingDetailView.as_view()),
]