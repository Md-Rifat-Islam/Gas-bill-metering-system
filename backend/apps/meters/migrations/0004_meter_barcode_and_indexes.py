from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meters', '0003_alter_meterreading_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='meter',
            name='barcode',
            field=models.CharField(
                max_length=100, unique=True, null=True, blank=True,
                help_text='Barcode/QR payload printed on the physical meter, used for scan-to-select.'
            ),
        ),
        migrations.AddIndex(
            model_name='meter',
            index=models.Index(fields=['barcode'], name='meters_barcode_idx'),
        ),
        migrations.AddIndex(
            model_name='meterreading',
            index=models.Index(fields=['meter', '-reading_date'], name='meterreading_meter_date_idx'),
        ),
    ]