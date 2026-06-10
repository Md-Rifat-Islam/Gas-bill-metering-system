from django.urls import path
from . import views

urlpatterns = [
    path('', views.BillListCreateView.as_view()),
    path('<int:pk>/', views.BillDetailView.as_view()),
    path('summary/', views.BillSummaryView.as_view()),
]
