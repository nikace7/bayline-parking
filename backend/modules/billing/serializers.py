from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from config import clock
from modules.billing.models import (
    CheckoutInvoice,
    PaymentEntry,
    PaymentMethod,
    PrinterPath,
    PrintEvent,
    Receipt,
    SessionStage,
    Shift,
    ShiftStatus,
)
from modules.billing.services import stage_of
from modules.parking.models import MemberPass, PassStatus, SessionStatus
from modules.parking.serializers import ParkingSessionSerializer
from modules.sites.models import VehicleClass
from modules.sites.serializers import MAX_PAISA


class ShiftOpenSerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    opening_float_paisa = serializers.IntegerField(min_value=0, max_value=MAX_PAISA)


class ShiftCloseSerializer(serializers.Serializer):
    counted_cash_paisa = serializers.IntegerField(min_value=0, max_value=MAX_PAISA)


class ShiftSerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    operator_name = serializers.CharField(source="operator.name", read_only=True)

    class Meta:
        model = Shift
        fields = [
            "id",
            "location_id",
            "location_name",
            "operator_name",
            "opening_float_paisa",
            "opened_at",
            "closed_at",
            "counted_cash_paisa",
            "expected_cash_paisa",
            "variance_paisa",
        ]
        read_only_fields = fields


class CurrentShiftSerializer(serializers.Serializer):
    shift = ShiftSerializer(allow_null=True)


class ShiftSummarySerializer(serializers.Serializer):
    shift = ShiftSerializer()
    capture_count = serializers.IntegerField()
    cash_captured_paisa = serializers.IntegerField()
    expected_cash_paisa = serializers.IntegerField()


class ShiftFilterSerializer(serializers.Serializer):
    # Query parameters are not camelised by the parser, so the names are written as sent.
    locationId = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=ShiftStatus.choices, required=False)


class QuoteSerializer(serializers.Serializer):
    quote_token = serializers.CharField(source="token")
    cutoff_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    billable_seconds = serializers.IntegerField(source="fee.billable_seconds")
    blocks = serializers.IntegerField(source="fee.blocks")
    base_paisa = serializers.IntegerField(source="fee.base_paisa")
    discount_paisa = serializers.IntegerField(source="fee.discount_paisa")
    tax_paisa = serializers.IntegerField(source="fee.tax_paisa")
    total_paisa = serializers.IntegerField(source="fee.total_paisa")


class CheckoutSerializer(serializers.Serializer):
    quote_token = serializers.CharField(max_length=512)


class CashPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_paisa = serializers.IntegerField(min_value=1, max_value=MAX_PAISA)


class PaymentEntrySerializer(serializers.ModelSerializer):
    invoice_id = serializers.UUIDField(read_only=True)
    shift_id = serializers.UUIDField(read_only=True)
    receipt_id = serializers.UUIDField(source="receipt.id", read_only=True)
    receipt_number = serializers.CharField(source="receipt.number", read_only=True)

    class Meta:
        model = PaymentEntry
        fields = [
            "id",
            "invoice_id",
            "shift_id",
            "kind",
            "method",
            "amount_paisa",
            "created_at",
            "receipt_id",
            "receipt_number",
        ]
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckoutInvoice
        fields = [
            "id",
            "cutoff_at",
            "billable_seconds",
            "blocks",
            "base_paisa",
            "discount_paisa",
            "tax_paisa",
            "total_paisa",
            "status",
            "created_at",
        ]
        read_only_fields = fields


class ReceiptRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ["id", "number"]
        read_only_fields = fields


class ReceiptSerializer(serializers.ModelSerializer):
    """Everything a printed receipt shows, read from immutable rows."""

    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    location_address = serializers.CharField(source="location.address", read_only=True)
    timezone = serializers.CharField(source="location.timezone", read_only=True)
    plate = serializers.CharField(source="invoice.session.vehicle.plate", read_only=True)
    vehicle_class = serializers.ChoiceField(
        source="invoice.session.tariff.vehicle_class", choices=VehicleClass.choices, read_only=True
    )
    bay_label = serializers.CharField(source="invoice.session.space_label", read_only=True)
    entered_at = serializers.DateTimeField(source="invoice.session.entered_at", read_only=True)
    invoice = InvoiceSerializer(read_only=True)
    amount_paisa = serializers.IntegerField(source="payment.amount_paisa", read_only=True)
    method = serializers.ChoiceField(
        source="payment.method", choices=PaymentMethod.choices, read_only=True
    )
    received_by_name = serializers.CharField(source="issued_by.name", read_only=True)
    printed_copies = serializers.IntegerField(read_only=True)

    class Meta:
        model = Receipt
        fields = [
            "id",
            "number",
            "issued_at",
            "organisation_name",
            "location_name",
            "location_address",
            "timezone",
            "plate",
            "vehicle_class",
            "bay_label",
            "entered_at",
            "invoice",
            "amount_paisa",
            "method",
            "received_by_name",
            "printed_copies",
        ]
        read_only_fields = fields


class PrintRequestSerializer(serializers.Serializer):
    printer_path = serializers.ChoiceField(choices=PrinterPath.choices)


class PrintEventSerializer(serializers.ModelSerializer):
    receipt_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PrintEvent
        fields = ["id", "receipt_id", "copy_number", "printer_path", "created_at"]
        read_only_fields = fields


class SessionSummarySerializer(ParkingSessionSerializer):
    """A visit with its gate stage, derived from the confirmed invoice and the ledger."""

    stage = serializers.SerializerMethodField()
    total_paisa = serializers.IntegerField(
        source="invoice_total_paisa", allow_null=True, read_only=True
    )
    paid_paisa = serializers.IntegerField(read_only=True)
    due_paisa = serializers.SerializerMethodField()

    class Meta(ParkingSessionSerializer.Meta):
        fields = [
            *ParkingSessionSerializer.Meta.fields,
            "stage",
            "total_paisa",
            "paid_paisa",
            "due_paisa",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ChoiceField(choices=SessionStage.choices))
    def get_stage(self, session):
        return stage_of(session)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_due_paisa(self, session):
        if session.invoice_total_paisa is None or session.status == SessionStatus.EXITED:
            return None
        return session.invoice_total_paisa - session.paid_paisa


class SessionDetailSerializer(SessionSummarySerializer):
    invoice = InvoiceSerializer(allow_null=True, read_only=True)
    receipt = ReceiptRefSerializer(allow_null=True, read_only=True)

    class Meta(SessionSummarySerializer.Meta):
        fields = [*SessionSummarySerializer.Meta.fields, "invoice", "receipt"]
        read_only_fields = fields


class SessionFilterSerializer(serializers.Serializer):
    # Query parameters are not camelised by the parser, so the names are written as sent.
    locationId = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=SessionStatus.choices, required=False)


class PassVehicleSerializer(serializers.Serializer):
    plate = serializers.CharField(max_length=32)
    vehicle_class = serializers.ChoiceField(choices=VehicleClass.choices)


class MembershipSaleSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    customer_id = serializers.UUIDField(required=False)
    # Where the sale is made: its receipt series and the cash shift that must be open.
    location_id = serializers.UUIDField()
    permitted_location_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list, max_length=20
    )
    vehicles = serializers.ListField(child=PassVehicleSerializer(), min_length=1, max_length=10)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    price_paisa = serializers.IntegerField(min_value=1, max_value=MAX_PAISA)
    max_vehicles = serializers.IntegerField(min_value=1, max_value=10, default=1)

    def validate(self, attrs):
        if ("email" in attrs) == ("customer_id" in attrs):
            raise serializers.ValidationError(
                {"customer_id": ["Choose a profile or an online account email, not both."]}
            )
        if attrs["ends_at"] <= attrs["starts_at"]:
            raise serializers.ValidationError({"ends_at": ["A pass ends after it starts."]})
        return attrs


class MembershipRenewSerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    # The renewal starts at the later of this and the old expiry; now by default.
    starts_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    ends_at = serializers.DateTimeField()
    price_paisa = serializers.IntegerField(min_value=1, max_value=MAX_PAISA)


class MembershipFilterSerializer(serializers.Serializer):
    # Query parameters are not camelised by the parser, so the names are written as sent.
    plate = serializers.CharField(required=False, max_length=32)
    locationId = serializers.UUIDField(required=False)


class MemberPassSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_id = serializers.UUIDField(read_only=True)
    plates = serializers.SerializerMethodField()
    location_names = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    renews_reference = serializers.CharField(
        source="renews.reference", read_only=True, default=None
    )
    invoice_id = serializers.UUIDField(read_only=True, allow_null=True)
    total_paisa = serializers.IntegerField(
        source="invoice_total_paisa", read_only=True, allow_null=True
    )
    paid_paisa = serializers.IntegerField(read_only=True)
    due_paisa = serializers.SerializerMethodField()

    class Meta:
        model = MemberPass
        fields = [
            "id",
            "reference",
            "customer_name",
            "customer_email",
            "customer_phone",
            "customer_id",
            "plates",
            "location_names",
            "starts_at",
            "ends_at",
            "covered_seconds",
            "max_vehicles",
            "price_paisa",
            "status",
            "activated_at",
            "renews_reference",
            "invoice_id",
            "total_paisa",
            "paid_paisa",
            "due_paisa",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_plates(self, member_pass):
        return [row.vehicle.plate for row in member_pass.permitted_vehicles.all()]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_location_names(self, member_pass):
        return [row.location.name for row in member_pass.permitted_locations.all()]

    @extend_schema_field(serializers.ChoiceField(choices=PassStatus.choices))
    def get_status(self, member_pass):
        """EXPIRED is derived here rather than stored, so no worker has to keep up."""
        return member_pass.status_at(clock.now())

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_due_paisa(self, member_pass):
        if member_pass.invoice_total_paisa is None:
            return None
        return member_pass.invoice_total_paisa - member_pass.paid_paisa
