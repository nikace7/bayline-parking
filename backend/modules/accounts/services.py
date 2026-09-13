from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import NotFound

from config.api import ApiError
from modules.accounts.models import AuditEvent, Organisation, OrgMember, Role, User


def record_audit(*, organisation, actor, action, entity, summary, correlation_id) -> AuditEvent:
    return AuditEvent.objects.create(
        organisation=organisation,
        actor=actor,
        action=action,
        entity_type=entity._meta.label,
        entity_id=entity.pk,
        summary=summary,
        correlation_id=correlation_id,
    )


@transaction.atomic
def register_owner(*, organisation_name, name, email, password, correlation_id) -> OrgMember:
    """Owner onboarding: user, organisation and owner membership commit together or not at all."""
    try:
        with transaction.atomic():
            user = User.objects.create_user(email=email, password=password, name=name)
    except IntegrityError as exc:
        raise ApiError(
            409, "EMAIL_IN_USE", "An account with this email already exists. Sign in instead."
        ) from exc
    organisation = Organisation.objects.create(
        name=organisation_name, timezone=settings.LOCATION_TIMEZONE
    )
    member = OrgMember.objects.create(organisation=organisation, user=user, roles=[Role.OWNER])
    record_audit(
        organisation=organisation,
        actor=user,
        action="organisation.registered",
        entity=organisation,
        summary={"name": organisation.name},
        correlation_id=correlation_id,
    )
    return member


def _is_enabled_owner(member: OrgMember) -> bool:
    return member.enabled and Role.OWNER in member.roles


@transaction.atomic
def update_member(
    *, organisation, actor, member_id, expected_revision, roles, enabled, correlation_id
) -> OrgMember:
    # The organisation row lock serialises owner changes, so two owners cannot demote each other.
    Organisation.objects.select_for_update().get(pk=organisation.pk)
    member = (
        OrgMember.objects.for_org(organisation)
        .select_related("user")
        .select_for_update(of=("self",))
        .filter(pk=member_id)
        .first()
    )
    if member is None:
        raise NotFound()
    if member.revision != expected_revision:
        raise ApiError(
            409, "REVISION_CONFLICT", "This member changed since you loaded it. Reload and retry."
        )

    was_owner = _is_enabled_owner(member)
    changes = {}
    if roles is not None and sorted(set(roles)) != sorted(member.roles):
        member.roles = changes["roles"] = sorted(set(roles))
    if enabled is not None and enabled != member.enabled:
        member.enabled = changes["enabled"] = enabled
    if not changes:
        return member

    if was_owner and not _is_enabled_owner(member):
        other_owner_exists = (
            OrgMember.objects.for_org(organisation)
            .filter(enabled=True, roles__contains=[Role.OWNER])
            .exclude(pk=member.pk)
            .exists()
        )
        if not other_owner_exists:
            raise ApiError(409, "LAST_OWNER", "An organisation needs at least one enabled owner.")

    member.revision += 1
    member.save(update_fields=[*changes, "revision"])
    record_audit(
        organisation=organisation,
        actor=actor,
        action="member.updated",
        entity=member,
        summary=changes,
        correlation_id=correlation_id,
    )
    return member
