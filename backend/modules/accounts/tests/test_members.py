import pytest

from modules.accounts.models import AuditEvent, Role

pytestmark = pytest.mark.django_db

MEMBERS = "/api/v1/members"


def test_list_is_scoped_to_active_organisation(api, signed_in, owner, other_owner, make_member):
    make_member(owner.organisation, "cashier@northgate.test", [Role.OPERATOR, Role.CASHIER])
    signed_in(owner)

    body = api.get(MEMBERS).json()

    assert sorted(m["email"] for m in body["data"]) == [
        "cashier@northgate.test",
        "owner@northgate.test",
    ]
    assert body["page"] == {"next": None, "previous": None}


def test_other_organisation_member_is_not_found(api, signed_in, owner, other_owner):
    headers = signed_in(owner)
    url = f"{MEMBERS}/{other_owner.pk}"

    assert api.get(url).status_code == 404
    response = api.patch(url, {"enabled": False, "expectedRevision": 1}, **headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_non_owner_cannot_change_access(api, signed_in, owner, make_member):
    auditor = make_member(owner.organisation, "auditor@northgate.test", [Role.AUDITOR])
    headers = signed_in(auditor)

    response = api.patch(
        f"{MEMBERS}/{owner.pk}", {"enabled": False, "expectedRevision": 1}, **headers
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


def test_update_requires_current_revision(api, signed_in, owner, make_member):
    cashier = make_member(owner.organisation, "cashier@northgate.test", [Role.CASHIER])
    headers = signed_in(owner)
    url = f"{MEMBERS}/{cashier.pk}"

    assert api.patch(url, {"enabled": False}, **headers).status_code == 428
    stale = api.patch(url, {"enabled": False, "expectedRevision": 7}, **headers)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "REVISION_CONFLICT"


def test_last_enabled_owner_is_protected(api, signed_in, owner, make_member):
    headers = signed_in(owner)
    demote = {"roles": [Role.MANAGER], "expectedRevision": 1}

    blocked = api.patch(f"{MEMBERS}/{owner.pk}", demote, **headers)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "LAST_OWNER"

    make_member(owner.organisation, "second@northgate.test", [Role.OWNER])
    allowed = api.patch(f"{MEMBERS}/{owner.pk}", demote, **headers)
    assert allowed.status_code == 200
    assert allowed.json()["data"]["revision"] == 2
    assert AuditEvent.objects.filter(action="member.updated", entity_id=owner.pk).exists()


def test_unauthenticated_request_is_rejected(api):
    response = api.get(MEMBERS)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"
