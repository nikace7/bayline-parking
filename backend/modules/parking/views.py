from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from modules.accounts.idempotency import IDEMPOTENCY_KEY, idempotent
from modules.accounts.models import Role
from modules.accounts.permissions import current_member, require_roles
from modules.parking import services
from modules.parking.serializers import EntrySerializer, ParkingSessionSerializer


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
