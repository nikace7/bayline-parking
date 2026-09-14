import uuid

from django.db import models
from django.db.models import F, Q, Value
from django.db.models.functions import Mod, NullIf
from django.db.models.lookups import Exact

from config import clock
from modules.accounts.models import Organisation, OrgScopedQuerySet, User


class VehicleClass(models.TextChoices):
    CAR = "CAR"
    MOTORBIKE = "MOTORBIKE"


class BayMode(models.TextChoices):
    WALK_IN = "WALK_IN"
    RESERVABLE = "RESERVABLE"


class BayState(models.TextChoices):
    ACTIVE = "ACTIVE"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class TariffStatus(models.TextChoices):
    """Derived from effective times at read; never stored."""

    SCHEDULED = "SCHEDULED"
    CURRENT = "CURRENT"
    SUPERSEDED = "SUPERSEDED"


class Location(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    name = models.CharField(max_length=120)
    address = models.CharField(max_length=240)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    receipt_prefix = models.CharField(max_length=8)
    timezone = models.CharField(max_length=64)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "receipt_prefix"], name="location_receipt_prefix_unique"
            ),
            models.CheckConstraint(
                condition=Q(receipt_prefix__regex=r"^[A-Z0-9]{2,8}$"),
                name="location_receipt_prefix_format",
            ),
            models.CheckConstraint(
                condition=Q(latitude__range=(-90, 90), longitude__range=(-180, 180)),
                name="location_coordinates_valid",
            ),
        ]


class Bay(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="bays")
    label = models.CharField(max_length=16)
    vehicle_class = models.CharField(max_length=16, choices=VehicleClass.choices)
    mode = models.CharField(max_length=16, choices=BayMode.choices)
    state = models.CharField(max_length=16, choices=BayState.choices, default=BayState.ACTIVE)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["location", "label"], name="bay_label_unique"),
            models.CheckConstraint(
                condition=Q(vehicle_class__in=VehicleClass.values)
                & Q(mode__in=BayMode.values)
                & Q(state__in=BayState.values),
                name="bay_choices_valid",
            ),
        ]


class TariffVersion(models.Model):
    """Immutable (database trigger). A change publishes a new version; visits pin the one in force
    at entry, so publishing never reprices an existing visit."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="tariff_versions")
    vehicle_class = models.CharField(max_length=16, choices=VehicleClass.choices)
    effective_from = models.DateTimeField()
    grace_seconds = models.PositiveIntegerField()
    block_seconds = models.PositiveIntegerField()
    block_paisa = models.PositiveIntegerField()
    daily_cap_paisa = models.PositiveIntegerField(null=True)
    tax_bps = models.PositiveSmallIntegerField()
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            # Also the index behind "latest version effective at time T" lookups.
            models.UniqueConstraint(
                fields=["location", "vehicle_class", "effective_from"],
                name="tariff_one_version_per_instant",
            ),
            models.CheckConstraint(
                condition=Q(vehicle_class__in=VehicleClass.values),
                name="tariff_vehicle_class_valid",
            ),
            # NULLIF keeps a zero block from raising division-by-zero; `> 0` still rejects it.
            models.CheckConstraint(
                condition=Q(block_seconds__gt=0)
                & Exact(Mod(Value(86_400), NullIf(F("block_seconds"), 0)), 0),
                name="tariff_block_divides_day",
            ),
            models.CheckConstraint(
                condition=Q(daily_cap_paisa__isnull=True) | Q(daily_cap_paisa__gt=0),
                name="tariff_cap_positive",
            ),
            models.CheckConstraint(
                condition=Q(tax_bps__lte=10_000), name="tariff_tax_bps_at_most_100_percent"
            ),
        ]
