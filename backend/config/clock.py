"""The single source of business time (blueprint section 4, "Time and locking").

Domain code calls `clock.now()`, never `timezone.now()` or SQL `now()`, so tests that
use `clock.frozen()` reach every expiry path.
"""

from contextlib import contextmanager
from datetime import datetime

from django.utils import timezone

_frozen: datetime | None = None


def now() -> datetime:
    return _frozen or timezone.now()


@contextmanager
def frozen(at: datetime):
    # ponytail: process-global freeze; move to a contextvar if threaded tests need per-thread time.
    global _frozen
    if timezone.is_naive(at):
        raise ValueError("Frozen time must be timezone-aware.")
    _frozen = at
    try:
        yield
    finally:
        _frozen = None
