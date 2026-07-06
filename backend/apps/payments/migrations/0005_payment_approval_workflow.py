import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0004_remove_payment_approval_status_and_more'),
        ('authentication', '0005_remove_staffuser_unique_staff_mobile_when_exists_and_more'),
    ]

    operations = [
        # proof_image / proof_invoice were added by migration 0003 and were
        # NOT removed by 0004 (only approval_status/approved_at were removed
        # there) — but models.py in this codebase never declared them. This
        # uses SeparateDatabaseAndState so Django's migration state matches
        # the model below, while the actual DB change uses
        # "ADD COLUMN IF NOT EXISTS" so it's safe whether or not those
        # columns are already physically present.
        #
        # VERIFY on a staging copy of the DB before running in production.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='payment', name='proof_image',
                    field=models.ImageField(blank=True, null=True, upload_to='payment_proofs/%Y/%m/'),
                ),
                migrations.AddField(
                    model_name='payment', name='proof_invoice',
                    field=models.FileField(blank=True, null=True, upload_to='payment_proofs/%Y/%m/'),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_image varchar(100) NULL;
                        ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_invoice varchar(100) NULL;
                    """,
                    reverse_sql="""
                        ALTER TABLE payments DROP COLUMN IF EXISTS proof_image;
                        ALTER TABLE payments DROP COLUMN IF EXISTS proof_invoice;
                    """,
                ),
            ],
        ),

        migrations.AddField(
            model_name='payment', name='source',
            field=models.CharField(
                choices=[('staff', 'Staff'), ('customer', 'Customer Portal')],
                default='staff', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='payment', name='status',
            field=models.CharField(
                choices=[('Pending', 'Pending'), ('Approved', 'Approved'), ('Rejected', 'Rejected')],
                default='Approved', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='payment', name='submitted_by_customer',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='payments_submitted', to='authentication.customeruser',
            ),
        ),
        migrations.AddField(
            model_name='payment', name='reviewed_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='payments_reviewed', to='authentication.staffuser',
            ),
        ),
        migrations.AddField(
            model_name='payment', name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='payment', name='remarks',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='payment', name='received_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='payments_received', to='authentication.staffuser',
            ),
        ),
        migrations.AlterField(
            model_name='payment', name='payment_date',
            field=models.DateField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name='payment',
            options={'ordering': ['-payment_date', '-created_at']},
        ),
    ]