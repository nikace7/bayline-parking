import pytest

from config import clock
from modules.accounts.models import IdempotencyRecord

pytestmark = pytest.mark.django_db


def test_one_key_can_be_used_once_in_each_organisation(owner, other_owner):
    # A member of two organisations may send the same key to both (D32).
    now = clock.now()
    for organisation in (owner.organisation, other_owner.organisation):
        IdempotencyRecord.objects.create(
            organisation=organisation,
            actor=owner.user,
            operation="parking.entry",
            key="shared-key-1",
            payload_hash="0" * 64,
            created_at=now,
            expires_at=now,
        )

    assert IdempotencyRecord.objects.count() == 2
