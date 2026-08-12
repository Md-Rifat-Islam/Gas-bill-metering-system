"""
One-off local backfill: sets password = mobile number for any CustomerUser
row that still has a blank password. Mirrors the same backfill that
should already have run against production (see the NOTE in
CustomerUser's docstring in apps/authentication/models.py).

Run with:
    python manage.py shell < backfill_customer_passwords.py

or paste the loop below directly into `python manage.py shell`.
"""
from apps.authentication.models import CustomerUser

blank = CustomerUser.objects.filter(password='')
count = blank.count()
print(f"Found {count} customer(s) with a blank password.")

for customer in blank:
    customer.set_password(customer.mobile)
    customer.save(update_fields=['password'])
    print(f"  backfilled: {customer.mobile}")

print("Done. These customers can now log in with their mobile number as their password.")