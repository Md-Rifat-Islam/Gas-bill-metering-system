from django.conf import settings
from django.db import models


class Backup(models.Model):
    """
    One row per backup run (manual or scheduled). The row is created as
    'pending' immediately (before the Celery task even starts) so the
    frontend has something to show and poll right away, instead of an
    HTTP request that just hangs until pg_dump finishes.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    TRIGGER_CHOICES = [
        ('manual', 'Manual'),
        ('scheduled', 'Scheduled'),
    ]

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    trigger = models.CharField(max_length=10, choices=TRIGGER_CHOICES, default='manual')

    # Absolute path on disk to the finished .zip (db.sql + media/), set
    # only once status == 'completed'. Local-disk storage for now — the
    # cloud-storage upload step can hook in here later (e.g. push to S3
    # after this is set, then optionally clear file_path).
    file_path = models.CharField(max_length=500, blank=True, null=True)
    file_size_bytes = models.BigIntegerField(null=True, blank=True)

    error_message = models.TextField(blank=True, null=True)

    # Null for scheduled runs — there's no request user to attach.
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='triggered_backups',
    )

    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Backup #{self.id} ({self.status}) — {self.started_at:%Y-%m-%d %H:%M}"