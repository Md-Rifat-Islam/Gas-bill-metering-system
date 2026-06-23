import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0002_customeruser_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffuser',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                help_text='The staff user who created this account. Null for the first Super Admin.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_users',
                to='authentication.staffuser',
            ),
        ),
        migrations.AddField(
            model_name='staffuser',
            name='notes',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.CreateModel(
            name='UserPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('module', models.CharField(choices=[
                    ('projects', 'Projects'), ('buildings', 'Buildings'), ('units', 'Units'),
                    ('meters', 'Meters'), ('billing', 'Billing'), ('payments', 'Payments'),
                    ('reports', 'Reports'), ('staff', 'Staff Management'), ('audit', 'Audit Logs'),
                ], max_length=30)),
                ('can_view', models.BooleanField(default=True)),
                ('can_edit', models.BooleanField(default=False)),
                ('can_delete', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('granted_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='permissions_granted', to='authentication.staffuser',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permission_overrides', to='authentication.staffuser',
                )),
            ],
            options={
                'db_table': 'user_permissions',
                'unique_together': {('user', 'module')},
            },
        ),
    ]
