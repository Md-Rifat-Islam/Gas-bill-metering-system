from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/',       views.DashboardSummaryView.as_view()),
    path('monthly-revenue/', views.MonthlyRevenueView.as_view()),
    path('project-revenue/', views.ProjectRevenueView.as_view()),
    path('building-revenue/',views.BuildingRevenueView.as_view()),
    path('unpaid-bills/',    views.UnpaidBillsView.as_view()),
    path('payment-methods/', views.PaymentMethodSummaryView.as_view()),
    path('billing-queue/',   views.BillingQueueView.as_view()),
]