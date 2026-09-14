"""Database guards on the money path (blueprint section 3).

Django cannot declare composite foreign keys, so these reference (id, organisation_id) pairs
directly: a row can never point at a session, invoice or shift of another organisation, even when
application checks are bypassed (P28). Ledger entries reuse the append-only trigger.
"""

from django.db import migrations

CREATE = """
ALTER TABLE billing_checkoutinvoice
  ADD CONSTRAINT invoice_session_same_organisation
  FOREIGN KEY (session_id, organisation_id)
  REFERENCES parking_parkingsession (id, organisation_id);

ALTER TABLE billing_paymententry
  ADD CONSTRAINT entry_invoice_same_organisation
  FOREIGN KEY (invoice_id, organisation_id)
  REFERENCES billing_checkoutinvoice (id, organisation_id);

ALTER TABLE billing_paymententry
  ADD CONSTRAINT entry_shift_same_organisation
  FOREIGN KEY (shift_id, organisation_id)
  REFERENCES billing_shift (id, organisation_id);

CREATE TRIGGER billing_paymententry_append_only
  BEFORE UPDATE OR DELETE ON billing_paymententry
  FOR EACH ROW EXECUTE FUNCTION bayline_reject_mutation();
"""

DROP = """
DROP TRIGGER billing_paymententry_append_only ON billing_paymententry;
ALTER TABLE billing_paymententry DROP CONSTRAINT entry_shift_same_organisation;
ALTER TABLE billing_paymententry DROP CONSTRAINT entry_invoice_same_organisation;
ALTER TABLE billing_checkoutinvoice DROP CONSTRAINT invoice_session_same_organisation;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
        ("parking", "0001_initial"),
        ("accounts", "0002_append_only_trigger"),
    ]

    operations = [migrations.RunSQL(CREATE, DROP)]
