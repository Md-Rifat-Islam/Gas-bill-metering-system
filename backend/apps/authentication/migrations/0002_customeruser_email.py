from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customeruser',
            name='email',
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]