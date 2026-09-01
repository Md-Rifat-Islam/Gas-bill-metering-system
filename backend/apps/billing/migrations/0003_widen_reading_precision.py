from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_alter_bill_last_updated_by'),
    ]

    operations = [
        migrations.AlterField(
            model_name='bill',
            name='previous_reading',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
        migrations.AlterField(
            model_name='bill',
            name='current_reading',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
        migrations.AlterField(
            model_name='bill',
            name='total_usage_m3',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
    ]