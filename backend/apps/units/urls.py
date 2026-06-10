from django.urls import path
from . import views

urlpatterns = [
    path('', views.UnitListCreateView.as_view()),
    path('<int:pk>/', views.UnitDetailView.as_view()),
    path('allottees/', views.AllotteeListCreateView.as_view()),
    path('allottees/<int:pk>/', views.AllotteeDetailView.as_view()),
]
