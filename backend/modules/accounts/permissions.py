from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from modules.accounts.models import OrgMember

SESSION_ORG_KEY = "active_organisation_id"
ROLE_DENIED = "Your role does not allow this action."


def current_member(request) -> OrgMember | None:
    """The signed-in user's enabled membership in the session's active organisation, if any."""
    if not request.user.is_authenticated:
        return None
    if not hasattr(request, "bayline_member"):
        organisation_id = request.session.get(SESSION_ORG_KEY)
        request.bayline_member = (
            OrgMember.objects.select_related("organisation")
            .filter(
                user=request.user,
                organisation_id=organisation_id,
                enabled=True,
                organisation__enabled=True,
            )
            .first()
            if organisation_id
            else None
        )
    return request.bayline_member


def require_roles(*roles: str) -> type[BasePermission]:
    class HasRole(BasePermission):
        message = ROLE_DENIED

        def has_permission(self, request, view):
            member = current_member(request)
            return member is not None and not set(roles).isdisjoint(member.roles)

    return HasRole


def ensure_roles(member: OrgMember, *roles: str) -> None:
    """For a write checked after the object is scoped, so a foreign ID answers 404 before 403."""
    if set(roles).isdisjoint(member.roles):
        raise PermissionDenied(ROLE_DENIED)
