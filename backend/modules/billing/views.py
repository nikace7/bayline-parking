"""Gate endpoints that need invoices or the ledger. Billing depends on parking, never the reverse,
so visit reads that show the payment stage live here too."""

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.accounts.idempotency import IDEMPOTENCY_KEY, idempotent
from modules.accounts.models import Role
from modules.accounts.permissions import current_member, require_roles
from modules.billing import services
from modules.billing.models import CheckoutInvoice
from modules.billing.serializers import (
    CashPaymentSerializer,
    CheckoutSerializer,
    CurrentShiftSerializer,
    PaymentEntrySerializer,
    QuoteSerializer,
    SessionDetailSerializer,
    SessionFilterSerializer,
    SessionSummarySerializer,
    ShiftOpenSerializer,
    ShiftSerializer,
)

AnyRole = require_roles(*Role.values)
GateRole = require_roles(Role.OWNER, Role.OPERATOR)
CheckoutRole = require_roles(Role.OWNER, Role.OPERATOR, Role.CASHIER)
CashRole = require_roles(Role.OWNER, Role.CASHIER)


def _session_detail(member, session_id) -> dict:
    session = services.sessions_with_settlement(member.organisation).filter(pk=session_id).first()
    if session is None:
        raise NotFound()
    session.invoice = (
        CheckoutInvoice.objects.filter(pk=session.invoice_id).first()
        if session.invoice_id
        else None
    )
    return SessionDetailSerializer(session).data


class SessionListView(ListAPIView):
    serializer_class = SessionSummarySerializer
    permission_classes = [AnyRole]

    @extend_schema(parameters=[SessionFilterSerializer])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        filters = SessionFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        queryset = services.sessions_with_settlement(current_member(self.request).organisation)
        if location_id := filters.validated_data.get("locationId"):
            queryset = queryset.filter(location_id=location_id)
        if status := filters.validated_data.get("status"):
            queryset = queryset.filter(status=status)
        return queryset


class SessionDetailView(APIView):
    permission_classes = [AnyRole]

    @extend_schema(responses=SessionDetailSerializer)
    def get(self, request, session_id):
        return Response(_session_detail(current_member(request), session_id))


class QuoteView(APIView):
    permission_classes = [CheckoutRole]

    @extend_schema(request=None, responses=QuoteSerializer)
    def post(self, request, session_id):
        quote = services.quote_checkout(member=current_member(request), session_id=session_id)
        return Response(QuoteSerializer(quote).data)


class CheckoutView(APIView):
    permission_classes = [CheckoutRole]

    @extend_schema(
        request=CheckoutSerializer,
        responses={201: SessionDetailSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request, session_id):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            services.confirm_checkout(
                member=member,
                actor=request.user,
                session_id=session_id,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            return 201, _session_detail(member, session_id)

        payload = {"session_id": session_id, **serializer.validated_data}
        return idempotent(request, operation="billing.checkout", payload=payload, perform=perform)


class ExitView(APIView):
    permission_classes = [GateRole]

    @extend_schema(request=None, responses=SessionDetailSerializer, parameters=[IDEMPOTENCY_KEY])
    def post(self, request, session_id):
        member = current_member(request)

        def perform():
            services.exit_vehicle(
                member=member,
                actor=request.user,
                session_id=session_id,
                correlation_id=request.request_id,
            )
            return 200, _session_detail(member, session_id)

        payload = {"session_id": session_id}
        return idempotent(request, operation="parking.exit", payload=payload, perform=perform)


class CashPaymentView(APIView):
    permission_classes = [CashRole]

    @extend_schema(
        request=CashPaymentSerializer,
        responses={201: PaymentEntrySerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request, invoice_id):
        serializer = CashPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            entry = services.capture_cash(
                member=member,
                actor=request.user,
                invoice_id=invoice_id,
                amount_paisa=serializer.validated_data["amount_paisa"],
                correlation_id=request.request_id,
            )
            return 201, PaymentEntrySerializer(entry).data

        payload = {"invoice_id": invoice_id, **serializer.validated_data}
        return idempotent(request, operation="billing.cash", payload=payload, perform=perform)


class ShiftOpenView(APIView):
    permission_classes = [CashRole]

    @extend_schema(request=ShiftOpenSerializer, responses={201: ShiftSerializer})
    def post(self, request):
        serializer = ShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shift = services.open_shift(
            member=current_member(request),
            actor=request.user,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(ShiftSerializer(shift).data, status=201)


class CurrentShiftView(APIView):
    permission_classes = [AnyRole]

    @extend_schema(responses=CurrentShiftSerializer)
    def get(self, request):
        shift = services.open_shift_for(current_member(request).organisation, request.user)
        return Response(CurrentShiftSerializer({"shift": shift}).data)
