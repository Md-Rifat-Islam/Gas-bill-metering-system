import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0007_alter_paymentchannelsettings_bkash_type_and_more'),
        ('authentication', '0008_customeruser_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='BkashToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('id_token', models.TextField(blank=True)),
                ('refresh_token', models.TextField(blank=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'bkash_token'},
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='bkash_payment_id',
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='source',
            field=models.CharField(
                choices=[('staff', 'Staff'), ('customer', 'Customer Portal')],
                default='customer', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='initiated_by_customer',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='bkash_transactions', to='authentication.customeruser',
            ),
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='initiated_by_staff',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='bkash_transactions', to='authentication.staffuser',
            ),
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='payment',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='bkash_transaction', to='payments.payment',
            ),
        ),
        migrations.AlterModelOptions(
            name='paymenttransaction',
            options={'ordering': ['-created_at']},
        ),
    ]