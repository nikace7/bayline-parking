"""Blueprint section 6 wire contract: request IDs, {"data"} envelopes, error bodies, cursor pages.

This module is named in REST_FRAMEWORK settings, so it must not import `rest_framework.views`
at module level: APIView's class body reads those settings and would import this half-loaded module.
"""

import logging
import re
import uuid
from urllib.parse import parse_qs, urlsplit

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from djangorestframework_camel_case.render import CamelCaseJSONRenderer
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

logger = logging.getLogger("bayline.api")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get("X-Request-ID", "")
        request.request_id = supplied if _REQUEST_ID.match(supplied) else uuid.uuid4().hex
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        return response


class ApiError(APIException):
    """A domain failure with a stable machine-readable code."""

    def __init__(self, status_code: int, code: str, message: str, *, retryable: bool = False):
        super().__init__(detail=message, code=code)
        self.status_code = status_code
        self.error_code = code
        self.retryable = retryable


def exception_handler(exc, context):
    from rest_framework.views import exception_handler as drf_exception_handler

    # DRF answers these Django exceptions but hands the originals on, which lack default_code.
    if isinstance(exc, Http404):
        exc = NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = PermissionDenied()

    response = drf_exception_handler(exc, context)
    request_id = getattr(context["request"], "request_id", None)
    if response is None:
        logger.exception("Unhandled API error", extra={"request_id": request_id})
        response = Response(status=500)
        code, message, field_errors, retryable = "INTERNAL_ERROR", "Something went wrong.", {}, True
    elif isinstance(exc, ValidationError):
        data = response.data
        field_errors = data if isinstance(data, dict) else {"non_field_errors": data}
        code, message, retryable = "VALIDATION_FAILED", "Some fields need attention.", False
    else:
        code = getattr(exc, "error_code", None) or str(exc.default_code).upper()
        message = str(response.data.get("detail", "Request failed."))
        field_errors = {}
        retryable = getattr(exc, "retryable", response.status_code in (429, 503))

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "field_errors": field_errors,
            "retryable": retryable,
        },
        "request_id": request_id,
    }
    return response


class EnvelopeRenderer(CamelCaseJSONRenderer):
    """Wraps successful payloads as {"data": ...}; errors and cursor pages arrive already shaped."""

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        if (
            response is not None
            and response.status_code < 400
            and data is not None
            and not getattr(response, "enveloped", False)
        ):
            data = {"data": data}
        return super().render(data, accepted_media_type, renderer_context)


def _cursor(link: str | None) -> str | None:
    return parse_qs(urlsplit(link).query).get("cursor", [None])[0] if link else None


class CursorPage(CursorPagination):
    page_size = 25
    max_page_size = 100
    page_size_query_param = "limit"
    ordering = "-created_at"

    def get_paginated_response(self, data):
        response = Response(
            {
                "data": data,
                "page": {
                    "next": _cursor(self.get_next_link()),
                    "previous": _cursor(self.get_previous_link()),
                },
            }
        )
        response.enveloped = True
        return response

    def get_paginated_response_schema(self, schema):
        cursor = {"type": "string", "nullable": True}
        return {
            "type": "object",
            "required": ["data", "page"],
            "properties": {
                "data": schema,
                "page": {
                    "type": "object",
                    "required": ["next", "previous"],
                    "properties": {"next": cursor, "previous": cursor},
                },
            },
        }


def envelope_schema_hook(result, generator, request, public):
    """Mirror EnvelopeRenderer in OpenAPI so generated TypeScript types match real responses."""
    components = result.get("components", {}).get("schemas", {})

    def already_enveloped(schema: dict) -> bool:
        # Paginated lists arrive as a $ref to a component that already has data/page properties.
        if "$ref" in schema:
            schema = components.get(schema["$ref"].rsplit("/", 1)[-1], {})
        return "data" in schema.get("properties", {})

    for path_item in result.get("paths", {}).values():
        for operation in path_item.values():
            for status_code, response in operation.get("responses", {}).items():
                content = response.get("content", {}).get("application/json")
                if not content or not str(status_code).startswith("2"):
                    continue
                schema = content.get("schema", {})
                if not already_enveloped(schema):
                    content["schema"] = {
                        "type": "object",
                        "required": ["data"],
                        "properties": {"data": schema},
                    }
    return result
