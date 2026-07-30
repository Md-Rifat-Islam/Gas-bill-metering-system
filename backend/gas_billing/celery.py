import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "gas_billing.settings")

app = Celery("gas_billing")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()
