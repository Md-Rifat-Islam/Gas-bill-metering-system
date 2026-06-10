from django.urls import path
from . import views

urlpatterns = [
    path('', views.ProjectListCreateView.as_view()),
    path('<int:pk>/', views.ProjectDetailView.as_view()),
    path('packages/', views.PackageListCreateView.as_view()),
    path('packages/<int:pk>/', views.PackageDetailView.as_view()),
]
