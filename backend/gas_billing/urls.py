from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.authentication.urls')),
    path('api/v1/projects/', include('apps.projects.urls')),
    path('api/v1/buildings/', include('apps.buildings.urls')),
    path('api/v1/units/', include('apps.units.urls')),
    path('api/v1/meters/', include('apps.meters.urls')),
    path('api/v1/billing/', include('apps.billing.urls')),
    path('api/v1/payments/', include('apps.payments.urls')),
    path('api/v1/reports/', include('apps.reports.urls')),
    path('api/v1/audit/', include('apps.audit.urls')),
    path('api/v1/portal/', include('apps.portal.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
