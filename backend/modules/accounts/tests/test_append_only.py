import pytest
from django.db import IntegrityError, transaction

from modules.accounts.models import AuditEvent

pytestmark = pytest.mark.django_db


def test_audit_events_cannot_be_updated_or_deleted(owner):
    event = AuditEvent.objects.get(action="organisation.registered")

    with pytest.raises(IntegrityError), transaction.atomic():
        AuditEvent.objects.filter(pk=event.pk).update(action="tampered")
    with pytest.raises(IntegrityError), transaction.atomic():
        AuditEvent.objects.filter(pk=event.pk).delete()

    assert AuditEvent.objects.get(pk=event.pk).action == "organisation.registered"
