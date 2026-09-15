"""Database guards for shift close and receipts (blueprint section 3).

A closed shift, a receipt and a print event are never edited or deleted; corrections are new rows.
Receipts reference their invoice through the (id, organisation_id) pair, like the rest of the money
path (P28).
"""

from django.db import migrations

CREATE = """
CREATE TRIGGER billing_shift_closed_append_only
  BEFORE UPDATE OR DELETE ON billing_shift
  FOR EACH ROW WHEN (OLD.closed_at IS NOT NULL)
  EXECUTE FUNCTION bayline_reject_mutation();

CREATE TRIGGER billing_receipt_append_only
  BEFORE UPDATE OR DELETE ON billing_receipt
  FOR EACH ROW EXECUTE FUNCTION bayline_reject_mutation();

CREATE TRIGGER billing_printevent_append_only
  BEFORE UPDATE OR DELETE ON billing_printevent
  FOR EACH ROW EXECUTE FUNCTION bayline_reject_mutation();

ALTER TABLE billing_receipt
  ADD CONSTRAINT receipt_invoice_same_organisation
  FOREIGN KEY (invoice_id, organisation_id)
  REFERENCES billing_checkoutinvoice (id, organisation_id);
"""

DROP = """
ALTER TABLE billing_receipt DROP CONSTRAINT receipt_invoice_same_organisation;
DROP TRIGGER billing_printevent_append_only ON billing_printevent;
DROP TRIGGER billing_receipt_append_only ON billing_receipt;
DROP TRIGGER billing_shift_closed_append_only ON billing_shift;
"""


class Migration(migrations.Migration):
    dependencies = [("billing", "0003_shift_close_and_receipts")]

    operations = [migrations.RunSQL(CREATE, DROP)]
