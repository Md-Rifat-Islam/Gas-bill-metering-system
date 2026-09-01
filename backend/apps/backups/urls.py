from django.urls import path

from .views import BackupDownloadView, BackupListView, TriggerBackupView

urlpatterns = [
    path('', BackupListView.as_view(), name='backup-list'),
    path('run/', TriggerBackupView.as_view(), name='backup-run'),
    path('<int:pk>/download/', BackupDownloadView.as_view(), name='backup-download'),
]