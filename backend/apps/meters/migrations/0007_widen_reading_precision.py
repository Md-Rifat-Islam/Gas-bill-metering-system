from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meters', '0006_meter_initial_reading'),
    ]

    operations = [
        migrations.AlterField(
            model_name='meter',
            name='initial_reading',
            field=models.DecimalField(
                decimal_places=3, default=0, max_digits=10,
                help_text="Meter's dial reading at assignment time — baseline for this meter's first bill.",
            ),
        ),
        migrations.AlterField(
            model_name='meterreading',
            name='previous_reading',
            field=models.DecimalField(decimal_places=3, max_digits=10),
        ),
        migrations.AlterField(
            model_name='meterreading',
            name='current_reading',
            field=models.DecimalField(decimal_places=3, max_digits=10),
        ),
    ]