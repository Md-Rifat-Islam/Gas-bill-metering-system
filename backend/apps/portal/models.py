from django.db import models  # noqa: F401

# The customer portal app has no dedicated database models of its own.
# It exposes read/write views over CustomerUser (apps.authentication),
# Bill (apps.billing), and Payment (apps.payments) — scoped to the
# logged-in customer's own records. See serializers.py and views.py.
