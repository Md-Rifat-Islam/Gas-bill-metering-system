import os
import subprocess
import tempfile
import zipfile

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import Backup

BACKUPS_DIR = settings.BASE_DIR / 'backups'


@shared_task
def run_backup(backup_id):
    """
    Produces one downloadable .zip containing:
      - db.sql   (raw `pg_dump` output — plain SQL, not the custom/
                  compressed format, so it can be restored anywhere with
                  a plain `psql -d dbname -f db.sql`, no matching pg_dump/
                  pg_restore server version required)
      - media/   (everything under MEDIA_ROOT — meter reading photos,
                  payment proofs — copied as-is)

    Runs as a Celery task, not inline in the request/view, because
    pg_dump on a production-sized database plus zipping the media folder
    can easily take far longer than an HTTP request should ever block
    for. The calling view creates the Backup row as 'pending' BEFORE
    queuing this task, so the frontend has an id to poll immediately.
    """
    backup = Backup.objects.get(id=backup_id)
    backup.status = 'running'
    backup.save(update_fields=['status'])

    BACKUPS_DIR.mkdir(exist_ok=True)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    zip_path = BACKUPS_DIR / f'backup_{timestamp}.zip'

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sql_path = os.path.join(tmp_dir, 'db.sql')

            db = settings.DATABASES['default']
            env = os.environ.copy()
            if db.get('PASSWORD'):
                env['PGPASSWORD'] = db['PASSWORD']

            result = subprocess.run(
                [
                    'pg_dump',
                    '-h', db.get('HOST', 'localhost'),
                    '-p', str(db.get('PORT', 5432)),
                    '-U', db.get('USER', 'postgres'),
                    '-d', db['NAME'],
                    '-f', sql_path,
                    '--no-owner',
                    '--no-privileges',
                ],
                env=env,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f'pg_dump failed: {result.stderr.strip()}')

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.write(sql_path, arcname='db.sql')

                media_root = str(settings.MEDIA_ROOT)
                if os.path.isdir(media_root):
                    for root, _dirs, files in os.walk(media_root):
                        for fname in files:
                            full_path = os.path.join(root, fname)
                            arcname = os.path.join(
                                'media', os.path.relpath(full_path, media_root)
                            )
                            zf.write(full_path, arcname=arcname)

        backup.file_path = str(zip_path)
        backup.file_size_bytes = zip_path.stat().st_size
        backup.status = 'completed'
        backup.completed_at = timezone.now()
        backup.save(update_fields=['file_path', 'file_size_bytes', 'status', 'completed_at'])

    except Exception as e:
        backup.status = 'failed'
        backup.error_message = str(e)
        backup.completed_at = timezone.now()
        backup.save(update_fields=['status', 'error_message', 'completed_at'])
        # Don't leave a half-written zip around if pg_dump succeeded but
        # the zip step crashed partway through.
        if zip_path.exists():
            zip_path.unlink()
        raise


@shared_task
def run_scheduled_backup():
    """
    Entry point registered in CELERY_BEAT_SCHEDULE. Creates the Backup row
    itself (there's no request/user for a scheduled run to attach), then
    hands off to run_backup — the exact same logic a manual trigger uses,
    so there's only one backup implementation to maintain.
    """
    backup = Backup.objects.create(trigger='scheduled')
    run_backup(backup.id)