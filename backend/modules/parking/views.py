from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.api import ApiError, CursorPage
from modules.accounts.idempotency import IDEMPOTENCY_KEY, idempotent
from modules.accounts.models import Role
from modules.accounts.permissions import current_member, require_roles
from modules.parking import reservations, services
from modules.parking.serializers import (
    AvailabilityQuerySerializer,
    AvailabilitySerializer,
    CancelSerializer,
    EntrySerializer,
    HoldSerializer,
    ParkingSessionSerializer,
    PublicLocationSerializer,
    RelocateSerializer,
    ReservationFilterSerializer,
    ReservationSerializer,
)

AnyRole = require_roles(*Role.values)


class EntryView(APIView):
    permission_classes = [require_roles(Role.OWNER, Role.OPERATOR)]

    @extend_schema(
        request=EntrySerializer,
        responses={201: ParkingSessionSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request):
        serializer = EntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            session = services.admit_vehicle(
                member=member,
                actor=request.user,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            return 201, ParkingSessionSerializer(session).data

        return idempotent(
            request, operation="parking.entry", payload=serializer.validated_data, perform=perform
        )


class NamePage(CursorPage):
    ordering = ("name", "id")


class StartsFirstPage(CursorPage):
    ordering = ("starts_at", "id")


class LatestStartFirstPage(CursorPage):
    ordering = ("-starts_at", "id")


class PublicLocationListView(ListAPIView):
    """Discovery across organisations for anyone, signed in or not."""

    serializer_class = PublicLocationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public"
    pagination_class = NamePage

    def get_queryset(self):
        return reservations.public_locations()


class AvailabilityView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public"

    @extend_schema(parameters=[AvailabilityQuerySerializer], responses=AvailabilitySerializer)
    def get(self, request, location_id):
        query = AvailabilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        result = reservations.availability(
            location_id=location_id,
            vehicle_class=data["vehicleClass"],
            starts_at=data["startsAt"],
            ends_at=data["endsAt"],
        )
        return Response(AvailabilitySerializer(result).data)


def _own_reservation(request, reservation_id):
    reservation = reservations.customer_reservations(request.user).filter(pk=reservation_id).first()
    if reservation is None:
        raise NotFound()
    return reservation


class CustomerReservationListView(ListAPIView):
    """The signed-in account's own reservations across organisations; holding one claims a bay."""

    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = LatestStartFirstPage

    def get_queryset(self):
        return reservations.customer_reservations(self.request.user)

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    throttle_scope = "reservations"

    @extend_schema(
        request=HoldSerializer,
        responses={201: ReservationSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request):
        serializer = HoldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        location = reservations.public_location(data["location_id"])

        def perform():
            reservation = reservations.hold_reservation(
                user=request.user, correlation_id=request.request_id, **data
            )
            return 201, ReservationSerializer(reservation).data

        return idempotent(
            request,
            operation="reservation.hold",
            payload=data,
            perform=perform,
            organisation=location.organisation,
        )


class CustomerReservationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ReservationSerializer)
    def get(self, request, reservation_id):
        return Response(ReservationSerializer(_own_reservation(request, reservation_id)).data)


class ConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=ReservationSerializer, parameters=[IDEMPOTENCY_KEY])
    def post(self, request, reservation_id):
        reservation = _own_reservation(request, reservation_id)

        def perform():
            confirmed = reservations.confirm_reservation(
                user=request.user,
                reservation_id=reservation_id,
                correlation_id=request.request_id,
            )
            return 200, ReservationSerializer(confirmed).data

        return idempotent(
            request,
            operation="reservation.confirm",
            payload={"reservation_id": reservation_id},
            perform=perform,
            organisation=reservation.organisation,
        )


class CancelView(APIView):
    """The customer's own reservation, or any in the staff member's organisation with a reason."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=CancelSerializer, responses=ReservationSerializer)
    def post(self, request, reservation_id):
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = reservations.cancel_reservation(
            user=request.user,
            member=current_member(request),
            reservation_id=reservation_id,
            reason=serializer.validated_data["reason"],
            correlation_id=request.request_id,
        )
        return Response(ReservationSerializer(reservation).data)


class RelocateView(APIView):
    permission_classes = [AnyRole]

    @extend_schema(request=RelocateSerializer, responses=ReservationSerializer)
    def post(self, request, reservation_id):
        serializer = RelocateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "expected_revision" not in data:
            raise ApiError(428, "PRECONDITION_REQUIRED", "Send expectedRevision with this change.")
        reservation = reservations.relocate_reservation(
            member=current_member(request),
            actor=request.user,
            reservation_id=reservation_id,
            bay_id=data["bay_id"],
            expected_revision=data["expected_revision"],
            correlation_id=request.request_id,
        )
        return Response(ReservationSerializer(reservation).data)


class StaffReservationListView(ListAPIView):
    """Every reservation in the organisation, soonest first, flagged when a vehicle overstays."""

    serializer_class = ReservationSerializer
    permission_classes = [AnyRole]
    pagination_class = StartsFirstPage

    @extend_schema(parameters=[ReservationFilterSerializer])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        filters = ReservationFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return reservations.staff_reservations(
            current_member(self.request),
            location_id=filters.validated_data.get("locationId"),
            day=filters.validated_data.get("date"),
        )
