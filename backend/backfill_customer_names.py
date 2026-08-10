from apps.authentication.models import CustomerUser
from apps.units.models import Unit

n = 0
for u in Unit.objects.select_related('allottee').exclude(mobile_number=''):
    name = getattr(u.allottee, 'name', '') if hasattr(u, 'allottee') else ''
    if not name:
        continue
    # Only fills CustomerUser rows that are CURRENTLY blank — never
    # overwrites a name the resident may have already set themselves via
    # the Profile page.
    updated = CustomerUser.objects.filter(mobile=u.mobile_number, name='').update(name=name)
    n += updated

print(f'Backfilled {n} customer name(s)')