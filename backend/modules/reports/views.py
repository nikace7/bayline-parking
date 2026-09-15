from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.accounts.models import Role
from modules.accounts.permissions import current_member, require_roles
from modules.reports import exports, services
from modules.reports.serializers import (
    CollectionsReportSerializer,
    ReportFilterSerializer,
    ReportFormat,
    VehicleLogReportSerializer,
)

ReportRole = require_roles(Role.OWNER, Role.MANAGER, Role.AUDITOR)
EXPORT_RESPONSES = {
    (200, exports.PDF_TYPE): OpenApiTypes.BINARY,
    (200, exports.XLSX_TYPE): OpenApiTypes.BINARY,
}


class JsonNegotiation(DefaultContentNegotiation):
    """`?format=pdf|xlsx` selects an export the view builds itself. Negotiation stays on the JSON
    renderer, so a refused export still answers with the error envelope."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


class ReportView(APIView):
    permission_classes = [ReportRole]
    content_negotiation_class = JsonNegotiation
    slug: str
    serializer_class: type
    build = None

    def get(self, request):
        filters = ReportFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        member = current_member(request)
        scope = services.scope_for(
            member,
            location_id=params.get("locationId"),
            from_date=params["fromDate"],
            to_date=params["toDate"],
        )
        report = type(self).build(member, scope)
        if params["format"] == ReportFormat.JSON:
            return Response(self.serializer_class(report).data)

        content, content_type = exports.render(self.slug, report, params["format"])
        response = HttpResponse(content, content_type=content_type)
        filename = f"{self.slug}-{scope.from_date}-to-{scope.to_date}.{params['format']}"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Cache-Control"] = "private, no-store"
        return response


class CollectionsReportView(ReportView):
    slug = "collections"
    serializer_class = CollectionsReportSerializer
    build = services.collections

    @extend_schema(
        parameters=[ReportFilterSerializer],
        responses={200: CollectionsReportSerializer, **EXPORT_RESPONSES},
    )
    def get(self, request):
        return super().get(request)


class VehicleLogReportView(ReportView):
    slug = "vehicle-log"
    serializer_class = VehicleLogReportSerializer
    build = services.vehicle_log

    @extend_schema(
        parameters=[ReportFilterSerializer],
        responses={200: VehicleLogReportSerializer, **EXPORT_RESPONSES},
    )
    def get(self, request):
        return super().get(request)
