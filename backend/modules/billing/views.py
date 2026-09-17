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
from modules.billing import memberships, services
from modules.billing.models import CheckoutInvoice, Receipt, ShiftStatus
from modules.billing.serializers import (
    CashPaymentSerializer,
    CheckoutSerializer,
    CurrentShiftSerializer,
    MemberPassSerializer,
    MembershipFilterSerializer,
    MembershipRenewSerializer,
    MembershipSaleSerializer,
    PaymentEntrySerializer,
    PrintEventSerializer,
    PrintRequestSerializer,
    QuoteSerializer,
    ReceiptSerializer,
    SessionDetailSerializer,
    SessionFilterSerializer,
    SessionSummarySerializer,
    ShiftCloseSerializer,
    ShiftFilterSerializer,
    ShiftOpenSerializer,
    ShiftSerializer,
    ShiftSummarySerializer,
)

AnyRole = require_roles(*Role.values)
GateRole = require_roles(Role.OWNER, Role.OPERATOR)
CheckoutRole = require_roles(Role.OWNER, Role.OPERATOR, Role.CASHIER)
CashRole = require_roles(Role.OWNER, Role.CASHIER)
MembershipRole = require_roles(Role.OWNER, Role.MANAGER)


def _session_detail(member, session_id) -> dict:
    session = services.sessions_with_settlement(member.organisation).filter(pk=session_id).first()
    if session is None:
        raise NotFound()
    session.invoice = (
        CheckoutInvoice.objects.filter(pk=session.invoice_id).first()
        if session.invoice_id
        else None
    )
    session.receipt = (
        Receipt.objects.filter(invoice_id=session.invoice_id).order_by("-sequence").first()
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


class ShiftListView(ListAPIView):
    """Owners, managers and auditors see every shift; cash staff see their own."""

    serializer_class = ShiftSerializer
    permission_classes = [AnyRole]

    @extend_schema(parameters=[ShiftFilterSerializer])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        filters = ShiftFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        shifts = services.shifts_visible_to(current_member(self.request))
        if location_id := filters.validated_data.get("locationId"):
            shifts = shifts.filter(location_id=location_id)
        if status := filters.validated_data.get("status"):
            shifts = shifts.filter(closed_at__isnull=status == ShiftStatus.OPEN)
        return shifts


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


class ShiftSummaryView(APIView):
    permission_classes = [AnyRole]

    @extend_schema(responses=ShiftSummarySerializer)
    def get(self, request, shift_id):
        summary = services.shift_summary(member=current_member(request), shift_id=shift_id)
        return Response(ShiftSummarySerializer(summary).data)


class ShiftCloseView(APIView):
    permission_classes = [CashRole]

    @extend_schema(request=ShiftCloseSerializer, responses=ShiftSummarySerializer)
    def post(self, request, shift_id):
        serializer = ShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        summary = services.close_shift(
            member=current_member(request),
            actor=request.user,
            shift_id=shift_id,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(ShiftSummarySerializer(summary).data)


class ReceiptView(APIView):
    permission_classes = [AnyRole]

    @extend_schema(responses=ReceiptSerializer)
    def get(self, request, receipt_id):
        receipt = services.receipt_detail(member=current_member(request), receipt_id=receipt_id)
        return Response(ReceiptSerializer(receipt).data)


class PrintEventView(APIView):
    permission_classes = [CheckoutRole]

    @extend_schema(request=PrintRequestSerializer, responses={201: PrintEventSerializer})
    def post(self, request, receipt_id):
        serializer = PrintRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = services.record_print(
            member=current_member(request),
            actor=request.user,
            receipt_id=receipt_id,
            correlation_id=request.request_id,
            **serializer.validated_data,
        )
        return Response(PrintEventSerializer(event).data, status=201)


def _pass_detail(member, pass_id) -> dict:
    member_pass = memberships.passes_visible_to(member).filter(pk=pass_id).first()
    if member_pass is None:
        raise NotFound()
    return MemberPassSerializer(member_pass).data


class MembershipListView(ListAPIView):
    """Every staff role reads passes, so the gate can see what a plate is entitled to; owners and
    managers sell them."""

    serializer_class = MemberPassSerializer
    permission_classes = [AnyRole]

    def get_permissions(self):
        return [MembershipRole()] if self.request.method == "POST" else super().get_permissions()

    @extend_schema(parameters=[MembershipFilterSerializer])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        filters = MembershipFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return memberships.passes_visible_to(
            current_member(self.request),
            plate=filters.validated_data.get("plate"),
            location_id=filters.validated_data.get("locationId"),
        )

    @extend_schema(
        request=MembershipSaleSerializer,
        responses={201: MemberPassSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request):
        serializer = MembershipSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            member_pass = memberships.sell_pass(
                member=member,
                actor=request.user,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            return 201, _pass_detail(member, member_pass.pk)

        return idempotent(
            request,
            operation="billing.membership_sale",
            payload=serializer.validated_data,
            perform=perform,
        )


class MembershipRenewView(APIView):
    permission_classes = [MembershipRole]

    @extend_schema(
        request=MembershipRenewSerializer,
        responses={201: MemberPassSerializer},
        parameters=[IDEMPOTENCY_KEY],
    )
    def post(self, request, pass_id):
        serializer = MembershipRenewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = current_member(request)

        def perform():
            renewal = memberships.renew_pass(
                member=member,
                actor=request.user,
                pass_id=pass_id,
                correlation_id=request.request_id,
                **serializer.validated_data,
            )
            return 201, _pass_detail(member, renewal.pk)

        payload = {"pass_id": pass_id, **serializer.validated_data}
        return idempotent(
            request,
            operation="billing.membership_renewal",
            payload=payload,
            perform=perform,
        )
