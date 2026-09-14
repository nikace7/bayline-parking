from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from modules.billing.models import CheckoutInvoice, PaymentEntry, PaymentMethod, SessionStage, Shift
from modules.billing.services import stage_of
from modules.parking.models import SessionStatus
from modules.parking.serializers import ParkingSessionSerializer
from modules.sites.serializers import MAX_PAISA


class ShiftOpenSerializer(serializers.Serializer):
    location_id = serializers.UUIDField()
    opening_float_paisa = serializers.IntegerField(min_value=0, max_value=MAX_PAISA)


class ShiftSerializer(serializers.ModelSerializer):
    location_id = serializers.UUIDField(read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = Shift
        fields = [
            "id",
            "location_id",
            "location_name",
            "opening_float_paisa",
            "opened_at",
            "closed_at",
        ]
        read_only_fields = fields


class CurrentShiftSerializer(serializers.Serializer):
    shift = ShiftSerializer(allow_null=True)


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

    class Meta:
        model = PaymentEntry
        fields = ["id", "invoice_id", "shift_id", "kind", "method", "amount_paisa", "created_at"]
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

    class Meta(SessionSummarySerializer.Meta):
        fields = [*SessionSummarySerializer.Meta.fields, "invoice"]
        read_only_fields = fields


class SessionFilterSerializer(serializers.Serializer):
    # Query parameters are not camelised by the parser, so the names are written as sent.
    locationId = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=SessionStatus.choices, required=False)
