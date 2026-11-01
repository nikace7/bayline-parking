"""Keep every historical bay in an assigned-space zone without changing its identity."""

from django.db import migrations


def backfill(apps, schema_editor):
    alias = schema_editor.connection.alias
    Location = apps.get_model("sites", "Location")
    Zone = apps.get_model("sites", "ParkingZone")
    Bay = apps.get_model("sites", "Bay")
    for location in Location.objects.using(alias).iterator(chunk_size=500):
        zone, _ = Zone.objects.using(alias).get_or_create(
            location_id=location.pk, mode="ASSIGNED_BAY",
            defaults={"organisation_id": location.organisation_id, "name": "Assigned bays"},
        )
        Bay.objects.using(alias).filter(location_id=location.pk, zone__isnull=True).update(zone_id=zone.pk)


class Migration(migrations.Migration):
    dependencies = [("sites", "0006_parkingzone_capacitypool_bay_zone_and_more")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
