import pytest
from django.db import OperationalError

from config.transactions import retry_on_conflict


class DatabaseCause(Exception):
    def __init__(self, sqlstate):
        super().__init__(sqlstate)
        self.sqlstate = sqlstate


def failing(times, sqlstate):
    calls = []

    @retry_on_conflict
    def run():
        calls.append(sqlstate)
        if len(calls) <= times:
            raise OperationalError("aborted") from DatabaseCause(sqlstate)
        return "committed"

    return run, calls


def test_deadlock_is_retried_until_the_transaction_commits():
    run, calls = failing(2, "40P01")

    assert run() == "committed"
    assert len(calls) == 3


def test_serialization_failure_gives_up_after_three_attempts():
    run, calls = failing(3, "40001")

    with pytest.raises(OperationalError):
        run()
    assert len(calls) == 3


def test_other_database_errors_are_not_retried():
    run, calls = failing(1, "08006")

    with pytest.raises(OperationalError):
        run()
    assert len(calls) == 1
