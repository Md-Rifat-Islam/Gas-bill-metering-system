from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action

from .models import Backup
from .permissions import BackupPermission
from .serializers import BackupSerializer
from .tasks import run_backup


class BackupListView(generics.ListAPIView):
    """
    GET /api/v1/settings/backups/

    Most recent first — the frontend polls this while a backup is
    'pending'/'running', and shows it as download history otherwise.
    """
    queryset = Backup.objects.all().select_related('triggered_by')
    serializer_class = BackupSerializer
    permission_classes = [IsAuthenticated, BackupPermission]


class TriggerBackupView(APIView):
    """
    POST /api/v1/settings/backups/run/

    Creates the Backup row as 'pending' immediately, then queues the
    actual work on Celery — this view returns right away rather than
    blocking on pg_dump.
    """
    permission_classes = [IsAuthenticated, BackupPermission]

    def post(self, request):
        backup = Backup.objects.create(trigger='manual', triggered_by=request.user)
        run_backup.delay(backup.id)
        log_action(request.user, 'backups', backup.id, 'CREATE', None, {'trigger': 'manual'})
        return Response(BackupSerializer(backup).data, status=status.HTTP_202_ACCEPTED)


class BackupDownloadView(APIView):
    """GET /api/v1/settings/backups/{id}/download/"""
    permission_classes = [IsAuthenticated, BackupPermission]

    def get(self, request, pk):
        backup = get_object_or_404(Backup, pk=pk)
        if backup.status != 'completed' or not backup.file_path:
            return Response(
                {'detail': 'This backup is not ready to download yet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return FileResponse(
            open(backup.file_path, 'rb'),
            as_attachment=True,
            filename=backup.file_path.split('/')[-1],
        )