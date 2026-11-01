from django.db import migrations


def copy_linked_emails(apps, schema_editor):
    Customer = apps.get_model("accounts", "Customer")
    batch = []
    rows = (
        Customer.objects.using(schema_editor.connection.alias)
        .filter(user__isnull=False, email="")
        .select_related("user")
    )
    for customer in rows.iterator(chunk_size=500):
        customer.email = customer.user.email
        batch.append(customer)
        if len(batch) == 500:
            Customer.objects.using(schema_editor.connection.alias).bulk_update(batch, ["email"])
            batch.clear()
    if batch:
        Customer.objects.using(schema_editor.connection.alias).bulk_update(batch, ["email"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_independent_customer_profiles")]
    operations = [migrations.RunPython(copy_linked_emails, migrations.RunPython.noop)]
