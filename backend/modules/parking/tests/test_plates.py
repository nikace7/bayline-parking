import pytest

from modules.parking.models import display_plate, normalize_plate


@pytest.mark.parametrize(
    ("typed", "display", "normalized"),
    [
        ("  ba 12   pa 3456 ", "ba 12 pa 3456", "BA12PA3456"),
        ("BA12PA3456", "BA12PA3456", "BA12PA3456"),
        ("Ba-1-Pa 99", "Ba-1-Pa 99", "BA-1-PA99"),
        ("बा १२ प ३४५६", "बा १२ प ३४५६", "बा१२प३४५६"),
    ],
)
def test_plate_display_and_matching_forms(typed, display, normalized):
    assert display_plate(typed) == display
    assert normalize_plate(typed) == normalized


def test_composed_and_decomposed_devanagari_match():
    one_code_point = "क़"  # DEVANAGARI LETTER QA
    letter_and_nukta = "क़"  # KA followed by NUKTA

    assert one_code_point != letter_and_nukta
    assert normalize_plate(one_code_point) == normalize_plate(letter_and_nukta)
