import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('audit', '0001_initial'),
        ('authentication', '0005_remove_staffuser_unique_staff_mobile_when_exists_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='auditlog',
            name='changed_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                to='authentication.staffuser',
            ),
        ),
        migrations.AddField(
            model_name='auditlog',
            name='changed_by_customer',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='audit_logs', to='authentication.customeruser',
            ),
        ),
    ]