from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0003_alter_package_unit_type'),
        ('units', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='manager_unit',
            field=models.ForeignKey(
                blank=True,
                help_text="Unit whose resident can view this project's bill status in the portal.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='managed_projects',
                to='units.unit',
            ),
        ),
    ]