from django.urls import path
from . import views

urlpatterns = [
    path('', views.BuildingListCreateView.as_view()),
    path('<int:pk>/', views.BuildingDetailView.as_view()),
]
