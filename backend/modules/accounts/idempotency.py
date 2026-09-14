"""Idempotency-Key writes (blueprint section 6).

The record is inserted in the same transaction as the business change. A concurrent duplicate
waits on the unique key and then replays the stored response; a crash leaves neither behind.
"""

import hashlib
import json
import re
from collections.abc import Callable
from datetime import timedelta

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from rest_framework.response import Response

from config import clock
from config.api import ApiError
from config.transactions import retry_on_conflict, violated_constraint
from modules.accounts.models import IdempotencyRecord
from modules.accounts.permissions import current_member

KEY_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,128}")
REPLAY_RETENTION = timedelta(days=7)

IDEMPOTENCY_KEY = OpenApiParameter(
    "Idempotency-Key",
    OpenApiTypes.STR,
    OpenApiParameter.HEADER,
    required=True,
    description="One per intended change. Retrying with the same key replays the first result.",
)


def idempotent(
    request, *, operation: str, payload: dict, perform: Callable[[], tuple[int, dict]]
) -> Response:
    key = request.headers.get("Idempotency-Key", "")
    if not key:
        raise ApiError(
            428, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header with this change."
        )
    if not KEY_PATTERN.fullmatch(key):
        raise ApiError(
            400,
            "IDEMPOTENCY_KEY_INVALID",
            "Idempotency-Key must be 8 to 128 letters, digits, hyphens or underscores.",
        )
    member = current_member(request)
    canonical = json.dumps(
        {"organisation": member.organisation_id, **payload}, sort_keys=True, cls=DjangoJSONEncoder
    )
    payload_hash = hashlib.sha256(canonical.encode()).hexdigest()
    return _run_once(member, request.user, operation, key, payload_hash, perform)


@retry_on_conflict
def _run_once(member, actor, operation, key, payload_hash, perform) -> Response:
    with transaction.atomic():
        now = clock.now()
        try:
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(
                    organisation=member.organisation,
                    actor=actor,
                    operation=operation,
                    key=key,
                    payload_hash=payload_hash,
                    created_at=now,
                    expires_at=now + REPLAY_RETENTION,
                )
        except IntegrityError as exc:
            if violated_constraint(exc) != "idempotency_key_unique":
                raise
            stored = IdempotencyRecord.objects.get(
                organisation=member.organisation, actor=actor, operation=operation, key=key
            )
            if stored.payload_hash != payload_hash:
                raise ApiError(
                    409,
                    "IDEMPOTENCY_KEY_REUSED",
                    "This Idempotency-Key was already used for a different change.",
                ) from exc
            return Response(
                stored.response_body,
                status=stored.response_status,
                headers={"Idempotent-Replayed": "true"},
            )
        status, body = perform()
        record.response_status = status
        record.response_body = body
        record.save(update_fields=["response_status", "response_body"])
    return Response(body, status=status)
