from rest_framework import serializers

from modules.parking.models import ParkingSession
from modules.sites.models import VehicleClass


class EntrySerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    bay_id = serializers.UUIDField()
    # Normalisation can decompose characters, so the column allows twice this length.
    plate = serializers.CharField(max_length=16)
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)


class ParkingSessionSerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    bay_id = serializers.UUIDField(read_only=True)
    bay_label = serializers.CharField(source="bay.label", read_only=True)
    plate = serializers.CharField(source="vehicle.plate", read_only=True)
    vehicle_class = serializers.ChoiceField(
        source="bay.vehicle_class", choices=VehicleClass.choices, read_only=True
    )
    tariff_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ParkingSession
        fields = [
            "id",
            "location_id",
            "bay_id",
            "bay_label",
            "plate",
            "vehicle_class",
            "tariff_id",
            "status",
            "entered_at",
            "exited_at",
        ]
        read_only_fields = fields
