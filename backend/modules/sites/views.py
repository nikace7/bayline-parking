from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from config import clock
from config.api import ApiError, CursorPage
from modules.accounts.idempotency import IDEMPOTENCY_KEY, idempotent
from modules.accounts.models import Role
from modules.accounts.permissions import current_member, ensure_roles, require_roles
from modules.parking import services as parking
from modules.sites import services, zones
from modules.sites.models import Bay, Location, ParkingZone
from modules.sites.serializers import (
    BaySerializer,
    BayUpdateSerializer,
    CapacityPoolSerializer,
    LocationSerializer,
    ParkingZoneSerializer,
    PoolUpdateSerializer,
    TariffPublishSerializer,
    TariffVersionSerializer,
    ZoneCreateSerializer,
)

# Every role reads setup. Writes check roles after scoping, so a foreign ID is 404 before 403.
AnyMember = require_roles(*Role.values)
SETUP_ROLES = (Role.OWNER, Role.MANAGER)


def _scoped_location(request, location_id) -> Location:
    organisation = current_member(request).organisation
    queryset = Location.objects.for_org(organisation).select_related("organisation")
    return get_object_or_404(queryset, pk=location_id)


class BayPage(CursorPage):
    ordering = "label"


class LocationListView(ListAPIView):
    serializer_class = LocationSerializer
    permission_classes = [AnyMember]

    def get_queryset(self):
        return Location.objects.for_org(current_member(self.request).organisation)

    @extend_schema(request=LocationSerializer, responses={201: LocationSerializer})
    def post(self, request):
        member = current_member(request)
        ensure_roles(member, Role.OWNER)
        serializer = LocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        location = services.create_location(
            organisation=member.organisation,
            actor=request.user,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(LocationSerializer(location).data, status=201)


class BayListView(ListAPIView):
    serializer_class = BaySerializer
    permission_classes = [AnyMember]
    pagination_class = BayPage

    def get_queryset(self):
        location = _scoped_location(self.request, self.kwargs["location_id"])
        return Bay.objects.for_org(location.organisation).filter(location=location)

    @extend_schema(request=BaySerializer, responses={201: BaySerializer})
    def post(self, request, location_id):
        location = _scoped_location(request, location_id)
        ensure_roles(current_member(request), *SETUP_ROLES)
        serializer = BaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bay = services.create_bay(
            location=location,
            actor=request.user,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(BaySerializer(bay).data, status=201)


class BayDetailView(APIView):
    permission_classes = [AnyMember]

    @extend_schema(request=BayUpdateSerializer, responses=BaySerializer)
    def patch(self, request, location_id, bay_id):
        location = _scoped_location(request, location_id)
        ensure_roles(current_member(request), *SETUP_ROLES)
        serializer = BayUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "expected_revision" not in data:
            raise ApiError(428, "PRECONDITION_REQUIRED", "Send expectedRevision with this change.")
        # Occupancy and reservations live in parking, which owns the guard and the bay lock.
        bay = parking.change_bay(
            location=location,
            actor=request.user,
            bay_id=bay_id,
            expected_revision=data["expected_revision"],
            mode=data.get("mode"),
            state=data.get("state"),
            correlation_id=request.request_id,
        )
        return Response(BaySerializer(bay).data)


class ZoneListView(ListAPIView):
    serializer_class = ParkingZoneSerializer
    permission_classes = [AnyMember]

    def get_queryset(self):
        location = _scoped_location(self.request, self.kwargs["location_id"])
        return (
            ParkingZone.objects.for_org(location.organisation)
            .filter(location=location)
            .prefetch_related(
                Prefetch(
                    "pools",
                    queryset=zones.visible_pools(location.organisation).order_by("vehicle_class"),
                )
            )
        )

    @extend_schema(
        request=ZoneCreateSerializer,
        responses={201: ParkingZoneSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request, location_id):
        location = _scoped_location(request, location_id)
        ensure_roles(current_member(request), *SETUP_ROLES)
        serializer = ZoneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        def perform():
            zone = zones.create_zone(
                location=location,
                actor=request.user,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            saved = self.get_queryset().get(pk=zone.pk)
            return 201, ParkingZoneSerializer(saved).data

        return idempotent(
            request,
            operation="sites.zone_create",
            payload={"location_id": str(location.pk), **serializer.validated_data},
            perform=perform,
        )


class PoolDetailView(APIView):
    permission_classes = [AnyMember]

    @extend_schema(request=PoolUpdateSerializer, responses=CapacityPoolSerializer)
    def patch(self, request, location_id, zone_id, pool_id):
        location = _scoped_location(request, location_id)
        ensure_roles(current_member(request), *SETUP_ROLES)
        serializer = PoolUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if "expected_revision" not in serializer.validated_data:
            raise ApiError(428, "PRECONDITION_REQUIRED", "Send expectedRevision with this change.")
        pool = parking.change_pool(
            location=location,
            zone_id=zone_id,
            pool_id=pool_id,
            actor=request.user,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(CapacityPoolSerializer(pool).data)


class TariffListView(ListAPIView):
    serializer_class = TariffVersionSerializer
    permission_classes = [AnyMember]

    def get_queryset(self):
        location = _scoped_location(self.request, self.kwargs["location_id"])
        return services.tariff_versions(location, clock.now())

    @extend_schema(request=TariffPublishSerializer, responses={201: TariffVersionSerializer})
    def post(self, request, location_id):
        location = _scoped_location(request, location_id)
        ensure_roles(current_member(request), *SETUP_ROLES)
        serializer = TariffPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tariff = services.publish_tariff(
            location=location,
            actor=request.user,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(TariffVersionSerializer(tariff).data, status=201)
