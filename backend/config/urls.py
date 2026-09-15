from django.urls import include, path, re_path
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from config import health


class UnknownRouteView(APIView):
    """Unmatched /api/ paths get the JSON error envelope instead of Django's HTML 404 page."""

    authentication_classes = []
    permission_classes = [AllowAny]
    schema = None

    def initial(self, request, *args, **kwargs):
        raise NotFound()


urlpatterns = [
    path("api/v1/health/live", health.LiveView.as_view()),
    path("api/v1/health/ready", health.ReadyView.as_view()),
    path("api/v1/", include("modules.accounts.urls")),
    path("api/v1/", include("modules.sites.urls")),
    path("api/v1/", include("modules.parking.urls")),
    path("api/v1/", include("modules.billing.urls")),
    path("api/v1/", include("modules.reports.urls")),
    re_path(r"^api/", UnknownRouteView.as_view()),
]
