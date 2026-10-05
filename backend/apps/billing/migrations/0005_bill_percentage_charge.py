from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_widen_usage_kg_precision'),
    ]

    operations = [
        migrations.AddField(
            model_name='bill',
            name='percentage_rate',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name='bill',
            name='percentage_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]