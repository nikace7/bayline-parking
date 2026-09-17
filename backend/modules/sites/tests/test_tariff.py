import json
import re
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from modules.sites.tariff import calculate_fee

VECTORS_PATH = Path(__file__).resolve().parents[4] / "fixtures" / "tariff-vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def terms(name: str) -> SimpleNamespace:
    return SimpleNamespace(**{snake(key): value for key, value in VECTORS["tariffs"][name].items()})


@pytest.mark.parametrize("case", VECTORS["cases"], ids=lambda case: case["name"])
def test_shared_tariff_vector(case):
    fee = calculate_fee(
        terms(case["tariff"]),
        entry=datetime.fromisoformat(case["entry"]),
        cutoff=datetime.fromisoformat(case["cutoff"]),
        discount_paisa=case["discountPaisa"],
        covered_seconds=case.get("coveredSeconds"),
    )

    assert asdict(fee) == {snake(key): value for key, value in case["expected"].items()}


def test_negative_discount_is_rejected():
    entry = datetime.fromisoformat("2026-09-14T09:00:00Z")

    with pytest.raises(ValueError):
        calculate_fee(terms("car"), entry=entry, cutoff=entry, discount_paisa=-1)
