from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meters', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='meterreading',
            name='reading_photo',
            field=models.ImageField(
                blank=True, null=True,
                upload_to='meter_readings/%Y/%m/',
                help_text='Photo of the meter at time of reading'
            ),
        ),
    ]
