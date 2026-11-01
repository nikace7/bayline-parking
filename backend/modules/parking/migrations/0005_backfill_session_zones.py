from django.db import migrations
from django.db.models import OuterRef, Subquery


def backfill(apps, schema_editor):
    alias = schema_editor.connection.alias
    Session = apps.get_model("parking", "ParkingSession")
    Bay = apps.get_model("sites", "Bay")
    Session.objects.using(alias).filter(zone__isnull=True).update(
        zone_id=Subquery(Bay.objects.using(alias).filter(pk=OuterRef("bay_id")).values("zone_id")[:1])
    )


class Migration(migrations.Migration):
    dependencies = [("parking", "0004_parkingsession_pool_parkingsession_zone_and_more"),
                    ("sites", "0007_backfill_assigned_zones")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
