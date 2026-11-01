from datetime import timedelta

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from config import clock
from modules.parking.models import ParkingSession, Reservation, ReservationStatus
from modules.sites.models import Location, VehicleClass
from modules.sites.serializers import coordinate

MIN_RESERVATION = timedelta(minutes=30)
MAX_RESERVATION = timedelta(hours=12)


class EntrySerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    bay_id = serializers.UUIDField(required=False)
    pool_id = serializers.UUIDField(required=False)
    # Normalisation can decompose characters, so the column allows twice this length.
    plate = serializers.CharField(max_length=16)
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)
    reservation_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if ("bay_id" in attrs) == ("pool_id" in attrs):
            raise serializers.ValidationError("Choose exactly one bay or open-lot pool.")
        if attrs.get("reservation_id") is not None and "pool_id" in attrs:
            raise serializers.ValidationError({"reservation_id": ["Reservations require a bay."]})
        return attrs


class ParkingSessionSerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    bay_id = serializers.UUIDField(read_only=True, allow_null=True)
    zone_id = serializers.UUIDField(read_only=True)
    pool_id = serializers.UUIDField(read_only=True, allow_null=True)
    bay_label = serializers.CharField(source="space_label", read_only=True)
    plate = serializers.CharField(source="vehicle.plate", read_only=True)
    vehicle_class = serializers.ChoiceField(
        source="tariff.vehicle_class", choices=VehicleClass.choices, read_only=True
    )
    tariff_id = serializers.UUIDField(read_only=True)
    # The pass covering this visit, so a zero fee at the counter has a visible reason.
    member_pass_reference = serializers.CharField(
        source="member_pass.reference", read_only=True, default=None
    )

    class Meta:
        model = ParkingSession
        fields = [
            "id",
            "location_id",
            "bay_id",
            "zone_id",
            "pool_id",
            "bay_label",
            "plate",
            "vehicle_class",
            "tariff_id",
            "member_pass_reference",
            "covered_seconds",
            "status",
            "entered_at",
            "exited_at",
        ]
        read_only_fields = fields


def validate_interval(starts_at, ends_at, *, start_field: str, end_field: str) -> None:
    """Blueprint section 4: a reservation starts in the future and lasts 30 minutes to 12 hours."""
    if starts_at <= clock.now():
        raise serializers.ValidationError({start_field: ["Choose a start in the future."]})
    if ends_at - starts_at < MIN_RESERVATION:
        raise serializers.ValidationError({end_field: ["A reservation lasts at least 30 minutes."]})
    if ends_at - starts_at > MAX_RESERVATION:
        raise serializers.ValidationError({end_field: ["A reservation lasts at most 12 hours."]})


class HoldSerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)
    plate = serializers.CharField(max_length=16)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()

    def validate(self, attrs):
        validate_interval(
            attrs["starts_at"], attrs["ends_at"], start_field="starts_at", end_field="ends_at"
        )
        return attrs


class AvailabilityQuerySerializer(serializers.Serializer):
    # Query parameters are not camel-case parsed, so the names are camelCase here.
    vehicleClass = serializers.ChoiceField(choices=VehicleClass.choices)
    startsAt = serializers.DateTimeField()
    endsAt = serializers.DateTimeField()

    def validate(self, attrs):
        validate_interval(
            attrs["startsAt"], attrs["endsAt"], start_field="startsAt", end_field="endsAt"
        )
        return attrs


class ReservationFilterSerializer(serializers.Serializer):
    locationId = serializers.UUIDField(required=False)
    date = serializers.DateField(required=False, help_text="A local date at the location.")


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")


class RelocateSerializer(serializers.Serializer):
    bay_id = serializers.UUIDField()
    # Optional here so a missing value can answer 428 Precondition Required instead of 400.
    expected_revision = serializers.IntegerField(min_value=1, required=False)


class PublicLocationSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    latitude = coordinate(90)
    longitude = coordinate(180)
    reservable_bays = serializers.IntegerField(read_only=True)

    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "organisation_name",
            "address",
            "latitude",
            "longitude",
            "timezone",
            "reservable_bays",
        ]
        read_only_fields = fields


class AvailabilitySerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    available_bays = serializers.IntegerField()
    as_of = serializers.DateTimeField()


class ReservationSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    location_id = serializers.UUIDField(read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    location_address = serializers.CharField(source="location.address", read_only=True)
    timezone = serializers.CharField(source="location.timezone", read_only=True)
    bay_id = serializers.UUIDField(read_only=True)
    bay_label = serializers.CharField(source="bay.label", read_only=True)
    vehicle_class = serializers.ChoiceField(
        source="bay.vehicle_class", choices=VehicleClass.choices, read_only=True
    )
    plate = serializers.CharField(source="vehicle.plate", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    arrival_opens_at = serializers.DateTimeField(read_only=True)
    arrival_closes_at = serializers.DateTimeField(read_only=True)
    status = serializers.SerializerMethodField()
    conflict = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "organisation_name",
            "location_id",
            "location_name",
            "location_address",
            "timezone",
            "bay_id",
            "bay_label",
            "vehicle_class",
            "plate",
            "customer_name",
            "starts_at",
            "ends_at",
            "arrival_opens_at",
            "arrival_closes_at",
            "status",
            "hold_expires_at",
            "cancel_reason",
            "conflict",
            "revision",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=ReservationStatus.choices))
    def get_status(self, reservation) -> str:
        """A lapsed hold or missed arrival shows as such before the worker stores it."""
        return reservation.status_at(clock.now())

    @extend_schema_field(serializers.BooleanField())
    def get_conflict(self, reservation) -> bool:
        """True while a vehicle overstays on the bay this reservation is waiting for."""
        return getattr(reservation, "overstay_conflict", False)
