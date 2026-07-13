from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='package',
            name='conversion_factor',
            field=models.DecimalField(
                blank=True, null=True, max_digits=6, decimal_places=4,
                help_text='KG per m³ — used to convert metered usage into billable KG when unit_type is kg.',
            ),
        ),
    ]