from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.api import ApiError
from modules.accounts import customers, services
from modules.accounts.idempotency import IDEMPOTENCY_KEY, idempotent
from modules.accounts.models import OrgMember, Role, normalize_email
from modules.accounts.permissions import SESSION_ORG_KEY, current_member, require_roles
from modules.accounts.serializers import (
    CustomerCreateSerializer,
    CustomerFilterSerializer,
    CustomerRegisterSerializer,
    CustomerSerializer,
    LoginSerializer,
    MemberSerializer,
    MemberUpdateSerializer,
    RegisterSerializer,
    SessionSerializer,
    SwitchOrganisationSerializer,
)

StaffReader = require_roles(Role.OWNER, Role.MANAGER, Role.AUDITOR)


class CustomerListView(ListAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [require_roles(Role.OWNER, Role.MANAGER)]

    def get_queryset(self):
        filters = CustomerFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return customers.visible_customers(current_member(self.request), **filters.validated_data)

    @extend_schema(
        parameters=[OpenApiParameter("search", str, description="Name, email or phone.")]
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        request=CustomerCreateSerializer,
        responses={201: CustomerSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request):
        serializer = CustomerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            profile = customers.create_customer(
                member=member,
                actor=request.user,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            return 201, CustomerSerializer(profile).data

        return idempotent(
            request,
            operation="accounts.customer_create",
            payload=serializer.validated_data,
            perform=perform,
        )


def _active_memberships(user):
    return (
        OrgMember.objects.select_related("organisation")
        .filter(user=user, enabled=True, organisation__enabled=True)
        .order_by("created_at")
    )


def _session_payload(request):
    user = request.user if request.user.is_authenticated else None
    member = current_member(request)
    return SessionSerializer(
        {
            "user": user,
            "memberships": list(_active_memberships(user)) if user else [],
            "active_organisation_id": member.organisation_id if member else None,
        }
    ).data


def _start_session(request, user, organisation_id=None):
    login(request, user)
    if organisation_id is None:
        first = _active_memberships(user).first()
        organisation_id = first.organisation_id if first else None
    if organisation_id:
        request.session[SESSION_ORG_KEY] = str(organisation_id)


class CsrfProtectedMixin:
    """DRF only checks CSRF for signed-in sessions; login and registration must check it too."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        SessionAuthentication().enforce_csrf(request)


class RegisterView(CsrfProtectedMixin, APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=RegisterSerializer, responses={201: SessionSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = services.register_owner(
            **serializer.validated_data, correlation_id=request.request_id
        )
        _start_session(request, member.user, member.organisation_id)
        return Response(_session_payload(request), status=201)


class CustomerRegisterView(CsrfProtectedMixin, APIView):
    """A global account for booking parking, with no staff access."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=CustomerRegisterSerializer, responses={201: SessionSerializer})
    def post(self, request):
        serializer = CustomerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.register_customer(**serializer.validated_data)
        _start_session(request, user)
        return Response(_session_payload(request), status=201)


class LoginView(CsrfProtectedMixin, APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=LoginSerializer, responses=SessionSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            email=normalize_email(serializer.validated_data["email"]),
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
        _start_session(request, user)
        return Response(_session_payload(request))


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=204)


class SessionView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=SessionSerializer)
    def get(self, request):
        get_token(request)  # Sets the csrftoken cookie the SPA echoes back as X-CSRFToken.
        return Response(_session_payload(request))

    @extend_schema(request=SwitchOrganisationSerializer, responses=SessionSerializer)
    def patch(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        serializer = SwitchOrganisationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organisation_id = serializer.validated_data["active_organisation_id"]
        if not _active_memberships(request.user).filter(organisation_id=organisation_id).exists():
            raise NotFound()
        request.session[SESSION_ORG_KEY] = str(organisation_id)
        return Response(_session_payload(request))


class MemberListView(ListAPIView):
    serializer_class = MemberSerializer
    permission_classes = [StaffReader]

    def get_queryset(self):
        organisation = current_member(self.request).organisation
        return OrgMember.objects.for_org(organisation).select_related("user")


class MemberDetailView(APIView):
    permission_classes = [StaffReader]

    def _get_member(self, request, member_id):
        # Scope first: another organisation's ID is 404 even for roles that could not act on it.
        organisation = current_member(request).organisation
        queryset = OrgMember.objects.for_org(organisation).select_related("user")
        return get_object_or_404(queryset, pk=member_id)

    @extend_schema(responses=MemberSerializer)
    def get(self, request, member_id):
        return Response(MemberSerializer(self._get_member(request, member_id)).data)

    @extend_schema(request=MemberUpdateSerializer, responses=MemberSerializer)
    def patch(self, request, member_id):
        member = self._get_member(request, member_id)
        actor = current_member(request)
        if Role.OWNER not in actor.roles:
            raise PermissionDenied("Only an owner can change staff access.")
        serializer = MemberUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "expected_revision" not in data:
            raise ApiError(428, "PRECONDITION_REQUIRED", "Send expectedRevision with this change.")
        updated = services.update_member(
            organisation=actor.organisation,
            actor=actor.user,
            member_id=member.pk,
            expected_revision=data["expected_revision"],
            roles=data.get("roles"),
            enabled=data.get("enabled"),
            correlation_id=request.request_id,
        )
        return Response(MemberSerializer(updated).data)
