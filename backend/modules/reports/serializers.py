from django.db import models
from rest_framework import serializers

from modules.billing.models import EntryKind, PaymentMethod
from modules.parking.models import SessionStatus
from modules.sites.models import VehicleClass

MAX_REPORT_DAYS = 31


class ReportFormat(models.TextChoices):
    JSON = "json"
    PDF = "pdf"
    XLSX = "xlsx"


class ReportFilterSerializer(serializers.Serializer):
    # Query parameters are not camelised by the parser, so the names are written as sent.
    locationId = serializers.UUIDField(required=False)
    fromDate = serializers.DateField()
    toDate = serializers.DateField()
    format = serializers.ChoiceField(choices=ReportFormat.choices, default=ReportFormat.JSON)

    def validate(self, attrs):
        days = (attrs["toDate"] - attrs["fromDate"]).days + 1
        if days < 1:
            raise serializers.ValidationError(
                {"toDate": ["Choose a date on or after the start date."]}
            )
        if days > MAX_REPORT_DAYS:
            raise serializers.ValidationError(
                {"toDate": [f"A report covers at most {MAX_REPORT_DAYS} days."]}
            )
        return attrs


class ReportScopeSerializer(serializers.Serializer):
    organisation_name = serializers.CharField()
    location_name = serializers.CharField(allow_null=True)
    timezone = serializers.CharField()
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    as_of = serializers.DateTimeField()


class CollectionRowSerializer(serializers.Serializer):
    posted_at = serializers.DateTimeField()
    receipt_number = serializers.CharField(allow_null=True)
    location_name = serializers.CharField()
    plate = serializers.CharField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    kind = serializers.ChoiceField(choices=EntryKind.choices)
    amount_paisa = serializers.IntegerField()
    received_by_name = serializers.CharField()


class MethodTotalSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    count = serializers.IntegerField()
    amount_paisa = serializers.IntegerField()


class CollectionsReportSerializer(serializers.Serializer):
    scope = ReportScopeSerializer()
    rows = CollectionRowSerializer(many=True)
    by_method = MethodTotalSerializer(many=True)
    captured_paisa = serializers.IntegerField()
    refunded_paisa = serializers.IntegerField()
    net_paisa = serializers.IntegerField()


class VehicleLogRowSerializer(serializers.Serializer):
    entered_at = serializers.DateTimeField()
    exited_at = serializers.DateTimeField(allow_null=True)
    status = serializers.ChoiceField(choices=SessionStatus.choices)
    plate = serializers.CharField()
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)
    bay_label = serializers.CharField()
    location_name = serializers.CharField()
    entered_by_name = serializers.CharField()
    exited_by_name = serializers.CharField(allow_null=True)


class VehicleLogReportSerializer(serializers.Serializer):
    scope = ReportScopeSerializer()
    rows = VehicleLogRowSerializer(many=True)
    entries = serializers.IntegerField()
    exits = serializers.IntegerField()
    still_parked = serializers.IntegerField()
