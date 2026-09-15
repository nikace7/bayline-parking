from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

from config import clock
from modules.sites.models import (
    Bay,
    BayMode,
    BayState,
    Location,
    TariffStatus,
    TariffVersion,
    VehicleClass,
)
from modules.sites.tariff import DAY_SECONDS

# NPR 1,00,000: far below the column limit, so a mistyped rate fails validation instead of a 500.
MAX_PAISA = 10_000_000


def coordinate(limit: int) -> serializers.DecimalField:
    return serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=Decimal(-limit),
        max_value=Decimal(limit),
        rounding=ROUND_HALF_UP,
        coerce_to_string=False,
    )


class LocationSerializer(serializers.ModelSerializer):
    latitude = coordinate(90)
    longitude = coordinate(180)
    receipt_prefix = serializers.RegexField(
        r"^[A-Z0-9]{2,8}$", error_messages={"invalid": "Use 2 to 8 capital letters or digits."}
    )

    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "address",
            "latitude",
            "longitude",
            "receipt_prefix",
            "timezone",
            "enabled",
            "created_at",
        ]
        read_only_fields = ["id", "timezone", "enabled", "created_at"]


class BaySerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    label = serializers.RegexField(
        r"^[A-Z0-9-]{1,16}$",
        error_messages={"invalid": "Use up to 16 capital letters, digits or hyphens."},
    )

    class Meta:
        model = Bay
        fields = [
            "id",
            "location_id",
            "label",
            "vehicle_class",
            "mode",
            "state",
            "revision",
            "created_at",
        ]
        read_only_fields = ["id", "state", "revision", "created_at"]


class BayUpdateSerializer(serializers.Serializer):
    # Optional here so a missing value can answer 428 Precondition Required instead of 400.
    expected_revision = serializers.IntegerField(min_value=1, required=False)
    mode = serializers.ChoiceField(choices=BayMode.choices, required=False)
    state = serializers.ChoiceField(choices=BayState.choices, required=False)


class TariffVersionSerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    status = serializers.ChoiceField(choices=TariffStatus.choices, read_only=True)

    class Meta:
        model = TariffVersion
        fields = [
            "id",
            "location_id",
            "vehicle_class",
            "effective_from",
            "grace_seconds",
            "block_seconds",
            "block_paisa",
            "daily_cap_paisa",
            "tax_bps",
            "status",
            "created_at",
        ]
        read_only_fields = fields


class TariffPublishSerializer(serializers.Serializer):
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)
    effective_from = serializers.DateTimeField(required=False)
    grace_seconds = serializers.IntegerField(min_value=0, max_value=DAY_SECONDS)
    block_seconds = serializers.IntegerField(min_value=60, max_value=DAY_SECONDS)
    block_paisa = serializers.IntegerField(min_value=0, max_value=MAX_PAISA)
    daily_cap_paisa = serializers.IntegerField(
        min_value=1, max_value=MAX_PAISA, allow_null=True, default=None
    )
    tax_bps = serializers.IntegerField(min_value=0, max_value=10_000, default=0)

    def validate_block_seconds(self, value):
        if DAY_SECONDS % value:
            raise serializers.ValidationError(
                "Choose a block that divides 24 hours exactly, such as 15, 30 or 60 minutes."
            )
        return value

    def validate_effective_from(self, value):
        if value < clock.now():
            raise serializers.ValidationError(
                "Choose a start from now on; a published version cannot change past visits."
            )
        return value
