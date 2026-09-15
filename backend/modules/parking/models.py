import unicodedata
import uuid
from datetime import datetime, timedelta

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.db import models
from django.db.models import F, Func, Q

from config import clock
from modules.accounts.models import Customer, Organisation, OrgScopedQuerySet, User
from modules.sites.models import Bay, Location, TariffVersion, VehicleClass

# Check-in opens this long before a reservation starts and closes this long after (section 4).
ARRIVAL_OPENS = timedelta(minutes=10)
ARRIVAL_CLOSES = timedelta(minutes=15)


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


class TsTzRange(Func):
    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class ReservationStatus(models.TextChoices):
    HOLD = "HOLD"
    CONFIRMED = "CONFIRMED"
    CHECKED_IN = "CHECKED_IN"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


# Stored states that claim a bay. The exclusion constraint reads stored states, never the clock,
# so elapsed holds and missed arrivals are released under the bay lock before any new claim.
BLOCKING_STATUSES = [
    ReservationStatus.HOLD,
    ReservationStatus.CONFIRMED,
    ReservationStatus.CHECKED_IN,
]


class ReservationQuerySet(OrgScopedQuerySet):
    def claiming(self, now: datetime):
        """Reservations that still claim their bay at `now`: checked in, confirmed with the
        arrival window not yet closed, or held and not yet lapsed. Right even before a sweep."""
        return self.filter(
            Q(status=ReservationStatus.CHECKED_IN)
            | Q(status=ReservationStatus.CONFIRMED, starts_at__gte=now - ARRIVAL_CLOSES)
            | Q(status=ReservationStatus.HOLD, hold_expires_at__gt=now)
        )

    def release_elapsed(self, now: datetime) -> tuple[int, int]:
        """Stores EXPIRED for lapsed holds and NO_SHOW for missed arrivals. Callers hold the bay
        lock, or claim the rows with SKIP LOCKED."""
        bump = {"revision": F("revision") + 1}
        expired = self.filter(status=ReservationStatus.HOLD, hold_expires_at__lte=now).update(
            status=ReservationStatus.EXPIRED, **bump
        )
        no_shows = self.filter(
            status=ReservationStatus.CONFIRMED, starts_at__lt=now - ARRIVAL_CLOSES
        ).update(status=ReservationStatus.NO_SHOW, **bump)
        return expired, no_shows


class Reservation(models.Model):
    """A claim on one RESERVABLE bay for [starts_at, ends_at). Every change locks the bay first."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    bay = models.ForeignKey(Bay, on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="reservations")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="+")
    # Shown to the customer and read out at the gate; access still needs the signed-in account.
    reference = models.CharField(max_length=12)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(
        max_length=16, choices=ReservationStatus.choices, default=ReservationStatus.HOLD
    )
    hold_expires_at = models.DateTimeField(null=True)
    cancel_reason = models.CharField(max_length=240, blank=True)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = ReservationQuerySet.as_manager()

    class Meta:
        constraints = [
            ExclusionConstraint(
                name="reservation_no_overlap",
                expressions=[
                    ("bay", RangeOperators.EQUAL),
                    (TsTzRange("starts_at", "ends_at", RangeBoundary()), RangeOperators.OVERLAPS),
                ],
                condition=Q(status__in=BLOCKING_STATUSES),
            ),
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="reservation_interval_valid"
            ),
            models.CheckConstraint(
                condition=~Q(status=ReservationStatus.HOLD) | Q(hold_expires_at__isnull=False),
                name="reservation_hold_expires",
            ),
            models.CheckConstraint(
                condition=Q(status__in=ReservationStatus.values),
                name="reservation_status_valid",
            ),
            models.UniqueConstraint(
                fields=["organisation", "reference"], name="reservation_reference_unique"
            ),
        ]
        indexes = [models.Index(fields=["location", "starts_at"])]

    @property
    def arrival_opens_at(self) -> datetime:
        return self.starts_at - ARRIVAL_OPENS

    @property
    def arrival_closes_at(self) -> datetime:
        return self.starts_at + ARRIVAL_CLOSES

    def status_at(self, now: datetime) -> str:
        """The stored status, or the one the worker will store once it catches up."""
        if self.status == ReservationStatus.HOLD and self.hold_expires_at <= now:
            return ReservationStatus.EXPIRED
        if self.status == ReservationStatus.CONFIRMED and self.arrival_closes_at < now:
            return ReservationStatus.NO_SHOW
        return self.status


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
    # The reservation this visit checked in, if any; one visit per reservation.
    reservation = models.OneToOneField(
        Reservation, null=True, on_delete=models.PROTECT, related_name="session"
    )
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
