"""Blueprint section 3: append-only history is enforced by the database, not by convention.

Later apps attach their own triggers to `bayline_reject_mutation()`.
"""

from django.db import migrations

CREATE = """
CREATE FUNCTION bayline_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on append-only table % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER accounts_auditevent_append_only
  BEFORE UPDATE OR DELETE ON accounts_auditevent
  FOR EACH ROW EXECUTE FUNCTION bayline_reject_mutation();
"""

DROP = """
DROP TRIGGER accounts_auditevent_append_only ON accounts_auditevent;
DROP FUNCTION bayline_reject_mutation();
"""


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunSQL(CREATE, DROP)]
