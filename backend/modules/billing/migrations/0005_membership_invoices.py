"""Invoices gain a purpose: a parking visit or the sale of a member pass (blueprint section 4).

The location moves onto the invoice because a membership sale has no session to read it from;
existing invoices take it from the visit they price.
"""

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import OuterRef, Subquery


def copy_location_from_session(apps, schema_editor):
    invoices = apps.get_model("billing", "CheckoutInvoice")
    sessions = apps.get_model("parking", "ParkingSession")
    invoices.objects.filter(location__isnull=True).update(
        location_id=Subquery(
            sessions.objects.filter(pk=OuterRef("session_id")).values("location_id")[:1]
        )
    )


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0004_receipt_guards"),
        ("parking", "0003_member_passes"),
        ("sites", "0005_bay_revision"),
    ]

    operations = [
        migrations.AddField(
            model_name="checkoutinvoice",
            name="location",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="sites.location",
            ),
        ),
        migrations.RunPython(copy_location_from_session, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="checkoutinvoice",
            name="location",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="sites.location",
            ),
        ),
        migrations.AddField(
            model_name="checkoutinvoice",
            name="purpose",
            field=models.CharField(
                choices=[("PARKING", "Parking"), ("MEMBERSHIP", "Membership")],
                default="PARKING",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="checkoutinvoice",
            name="member_pass",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="invoices",
                to="parking.memberpass",
            ),
        ),
        migrations.AlterField(
            model_name="checkoutinvoice",
            name="session",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="parking.parkingsession",
            ),
        ),
        migrations.AlterField(
            model_name="checkoutinvoice",
            name="tariff",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="sites.tariffversion",
            ),
        ),
        migrations.AddConstraint(
            model_name="checkoutinvoice",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "CONFIRMED")),
                fields=("member_pass",),
                name="invoice_one_confirmed_per_pass",
            ),
        ),
        migrations.AddConstraint(
            model_name="checkoutinvoice",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(
                        ("member_pass__isnull", True),
                        ("purpose", "PARKING"),
                        ("session__isnull", False),
                        ("tariff__isnull", False),
                    ),
                    models.Q(
                        ("member_pass__isnull", False),
                        ("purpose", "MEMBERSHIP"),
                        ("session__isnull", True),
                        ("tariff__isnull", True),
                    ),
                    _connector="OR",
                ),
                name="invoice_purpose_references_match",
            ),
        ),
    ]
