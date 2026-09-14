import unicodedata
import uuid

from django.db import models
from django.db.models import F, Q

from config import clock
from modules.accounts.models import Organisation, OrgScopedQuerySet, User
from modules.sites.models import Bay, Location, TariffVersion, VehicleClass


def display_plate(typed: str) -> str:
    """The plate as staff typed it, composed (NFC) with runs of whitespace collapsed."""
    return " ".join(unicodedata.normalize("NFC", typed).split())


def normalize_plate(typed: str) -> str:
    """Matching key: whitespace removed and letters uppercased, so "ba 12 pa" matches "BA12PA".
    Devanagari has no case and punctuation is kept."""
    return display_plate(typed).replace(" ", "").upper()


class Vehicle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    plate = models.CharField(max_length=32)
    normalized_plate = models.CharField(max_length=32)
    vehicle_class = models.CharField(max_length=16, choices=VehicleClass.choices)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "normalized_plate"], name="vehicle_plate_unique"
            ),
            models.CheckConstraint(
                condition=~Q(normalized_plate=""), name="vehicle_plate_not_empty"
            ),
        ]


class SessionStatus(models.TextChoices):
    PARKED = "PARKED"
    EXITED = "EXITED"


class ParkingSession(models.Model):
    """Occupancy is a query over PARKED rows, never a counter. Payment progress is derived from
    the billing ledger and never stored here."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    bay = models.ForeignKey(Bay, on_delete=models.PROTECT, related_name="+")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="sessions")
    # Pinned at server entry time; publishing a later version never reprices this visit.
    tariff = models.ForeignKey(TariffVersion, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(
        max_length=16, choices=SessionStatus.choices, default=SessionStatus.PARKED
    )
    entered_at = models.DateTimeField()
    exited_at = models.DateTimeField(null=True)
    entered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    exited_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["bay"],
                condition=Q(status=SessionStatus.PARKED),
                name="session_one_parked_per_bay",
            ),
            models.UniqueConstraint(
                fields=["vehicle"],
                condition=Q(status=SessionStatus.PARKED),
                name="session_one_parked_per_vehicle",
            ),
            # Target of the composite (id, organisation_id) foreign key from invoices.
            models.UniqueConstraint(
                fields=["id", "organisation"], name="session_id_organisation_unique"
            ),
            models.CheckConstraint(
                condition=Q(
                    status=SessionStatus.PARKED, exited_at__isnull=True, exited_by__isnull=True
                )
                | Q(
                    status=SessionStatus.EXITED,
                    exited_at__gte=F("entered_at"),
                    exited_by__isnull=False,
                ),
                name="session_exit_matches_status",
            ),
        ]
        indexes = [models.Index(fields=["location", "status"])]
