"""A membership invoice can only sell a pass of its own organisation (blueprint section 3).

Django cannot declare composite foreign keys, so this references the (id, organisation_id) pair
directly, like the other money-path guards.
"""

from django.db import migrations

CREATE = """
ALTER TABLE billing_checkoutinvoice
  ADD CONSTRAINT invoice_pass_same_organisation
  FOREIGN KEY (member_pass_id, organisation_id)
  REFERENCES parking_memberpass (id, organisation_id);
"""

DROP = """
ALTER TABLE billing_checkoutinvoice DROP CONSTRAINT invoice_pass_same_organisation;
"""


class Migration(migrations.Migration):
    dependencies = [("billing", "0005_membership_invoices")]

    operations = [migrations.RunSQL(CREATE, DROP)]
