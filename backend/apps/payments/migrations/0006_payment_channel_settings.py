import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0005_payment_approval_workflow'),
        ('authentication', '0005_remove_staffuser_unique_staff_mobile_when_exists_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentChannelSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('bkash_number', models.CharField(blank=True, max_length=20)),
                ('bkash_type', models.CharField(blank=True, default='Personal', max_length=20)),
                ('nagad_number', models.CharField(blank=True, max_length=20)),
                ('bank_name', models.CharField(blank=True, max_length=100)),
                ('bank_account_name', models.CharField(blank=True, max_length=100)),
                ('bank_account_number', models.CharField(blank=True, max_length=50)),
                ('bank_branch', models.CharField(blank=True, max_length=100)),
                ('bank_routing_number', models.CharField(blank=True, max_length=50)),
                ('instructions', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to='authentication.staffuser',
                )),
            ],
            options={'db_table': 'payment_channel_settings'},
        ),
    ]