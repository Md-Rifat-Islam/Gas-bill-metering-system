from rest_framework import serializers

from .models import Backup


class BackupSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(
        source='triggered_by.name', read_only=True, default=None
    )
    file_size_mb = serializers.SerializerMethodField()

    class Meta:
        model = Backup
        fields = [
            'id', 'status', 'trigger',
            'file_size_bytes', 'file_size_mb',
            'error_message', 'triggered_by_name',
            'started_at', 'completed_at',
        ]

    def get_file_size_mb(self, obj):
        if not obj.file_size_bytes:
            return None
        return round(obj.file_size_bytes / (1024 * 1024), 2)