"""Tariff versions are immutable in the database (blueprint section 3, append-only enforcement)."""

from django.db import migrations

CREATE = """
CREATE TRIGGER sites_tariffversion_append_only
  BEFORE UPDATE OR DELETE ON sites_tariffversion
  FOR EACH ROW EXECUTE FUNCTION bayline_reject_mutation();
"""

DROP = "DROP TRIGGER sites_tariffversion_append_only ON sites_tariffversion;"


class Migration(migrations.Migration):
    dependencies = [
        ("sites", "0001_initial"),
        ("accounts", "0002_append_only_trigger"),
    ]

    operations = [migrations.RunSQL(CREATE, DROP)]
