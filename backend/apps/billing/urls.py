from django.urls import path
from . import views

urlpatterns = [
    path('',                    views.BillListCreateView.as_view()),
    path('bulk-create/',        views.BulkCreateBillsView.as_view()),
    path('<int:pk>/',           views.BillDetailView.as_view()),
    path('<int:pk>/quick-edit/', views.BillQuickEditView.as_view()),
    path('summary/',            views.BillSummaryView.as_view()),
    path('latest-reading/<int:unit_id>/',
         views.LatestUnitReadingView.as_view(), name='latest-unit-reading'),
]