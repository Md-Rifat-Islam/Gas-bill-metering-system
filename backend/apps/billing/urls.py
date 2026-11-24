from django.urls import path
from . import views
from .month_correction import MoveBillingMonthView
from .project_status import (
    ProjectStatusView,
    CylinderTypeListCreateView,
    CylinderTypeDetailView,
    CylinderSupplyView,
)

urlpatterns = [
    path('',                    views.BillListCreateView.as_view()),
    path('bulk-create/',        views.BulkCreateBillsView.as_view()),
    path('move-month/',         MoveBillingMonthView.as_view()),
    path('project-status/',     ProjectStatusView.as_view()),
    path('cylinder-types/',     CylinderTypeListCreateView.as_view()),
    path('cylinder-types/<int:pk>/', CylinderTypeDetailView.as_view()),
    path('cylinder-supply/',    CylinderSupplyView.as_view()),
    path('<int:pk>/',           views.BillDetailView.as_view()),
    path('<int:pk>/quick-edit/', views.BillQuickEditView.as_view()),
    path('summary/',            views.BillSummaryView.as_view()),
    path('latest-reading/<int:unit_id>/',
         views.LatestUnitReadingView.as_view(), name='latest-unit-reading'),
]