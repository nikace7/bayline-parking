import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from config import clock


def normalize_email(email: str) -> str:
    return email.strip().lower()


class OrgScopedQuerySet(models.QuerySet):
    """Every organisation-owned query starts here, before filtering, pagination or aggregation."""

    def for_org(self, organisation):
        return self.filter(organisation=organisation)


class Organisation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    timezone = models.CharField(max_length=64, default="Asia/Kathmandu")
    currency = models.CharField(max_length=3, default="NPR", editable=False)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(currency="NPR"), name="organisation_currency_npr"),
        ]


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email: str, password: str, **fields):
        user = self.model(email=normalize_email(email), **fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    """Global identity for staff and customers; organisation access lives on OrgMember."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(email=Lower("email")), name="user_email_lowercase"),
        ]


class Role(models.TextChoices):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    OPERATOR = "OPERATOR"
    CASHIER = "CASHIER"
    AUDITOR = "AUDITOR"


class OrgMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="members")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="org_memberships")
    roles = ArrayField(models.CharField(max_length=16, choices=Role.choices))
    enabled = models.BooleanField(default=True)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation", "user"], name="orgmember_one_per_user"),
            models.CheckConstraint(
                condition=Q(roles__len__gt=0) & Q(roles__contained_by=Role.values),
                name="orgmember_roles_valid",
            ),
        ]


class AuditEvent(models.Model):
    """Append-only (database trigger); a safe change summary, never contact details or secrets."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    actor = models.ForeignKey(User, null=True, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    summary = models.JSONField(default=dict)
    correlation_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        indexes = [models.Index(fields=["organisation", "-created_at"])]


class IdempotencyRecord(models.Model):
    """Replay metadata for an Idempotency-Key write, inserted in the same transaction as the write.
    Kept seven days for replays; financial uniqueness comes from ledger constraints, not here."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    operation = models.CharField(max_length=64)
    key = models.CharField(max_length=128)
    payload_hash = models.CharField(max_length=64)
    response_status = models.PositiveSmallIntegerField(null=True)
    response_body = models.JSONField(null=True, encoder=DjangoJSONEncoder)
    created_at = models.DateTimeField()
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "actor", "operation", "key"],
                name="idempotency_key_unique",
            ),
        ]
        indexes = [models.Index(fields=["expires_at"])]
