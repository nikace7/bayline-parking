"""Transaction helpers shared by every module's write services (blueprint section 4)."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from functools import wraps

from django.db import IntegrityError, OperationalError, transaction

from config.api import ApiError

# PostgreSQL deadlock_detected and serialization_failure: rerunning the whole transaction is safe.
RETRYABLE_SQLSTATES = frozenset({"40P01", "40001"})
MAX_ATTEMPTS = 3


def retry_on_conflict[**P, T](func: Callable[P, T]) -> Callable[P, T]:
    """Reruns a whole transaction, at most three attempts, when PostgreSQL aborts it for a deadlock
    or serialization failure. Wrap the outermost transaction only: inside an enclosing atomic block
    the transaction is already aborted and cannot be retried."""

    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        attempt = 1
        while True:
            try:
                return func(*args, **kwargs)
            except OperationalError as exc:
                sqlstate = getattr(exc.__cause__, "sqlstate", None)
                if attempt == MAX_ATTEMPTS or sqlstate not in RETRYABLE_SQLSTATES:
                    raise
                attempt += 1

    return wrapper


def violated_constraint(exc: IntegrityError) -> str | None:
    return getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None)


@contextmanager
def conflict_on(conflicts: dict[str, tuple[str, str]]) -> Iterator[None]:
    """Maps named constraint violations to 409 `(code, message)`; any other integrity failure
    still raises. Runs in a savepoint so the enclosing transaction stays usable."""
    try:
        with transaction.atomic():
            yield
    except IntegrityError as exc:
        conflict = conflicts.get(violated_constraint(exc) or "")
        if conflict is None:
            raise
        raise ApiError(409, *conflict) from exc
