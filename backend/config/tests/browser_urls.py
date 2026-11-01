"""Production API plus compiled SPA, loaded only by the explicit live-browser check."""

from pathlib import Path

from django.http import JsonResponse
from django.urls import path, re_path
from django.views.static import serve

from config.urls import urlpatterns as api_urls

DIST = Path(__file__).resolve().parents[3] / "apps" / "web" / "dist"


def ready(request):
    return JsonResponse({"isolatedBrowserTest": True})


def spa(request, asset=""):
    # Django's static server checks path containment. Other paths are SPA deep links.
    filename = (
        asset if asset.startswith("assets/") or asset == "manifest.webmanifest" else "index.html"
    )
    return serve(request, filename, document_root=DIST)


urlpatterns = [
    *api_urls,
    path("__browser_test__/ready", ready),
    re_path(r"^(?P<asset>.*)$", spa),
]
