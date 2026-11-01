"""Staff-managed customer profiles. Contact matches never link accounts or merge records."""

from django.db import transaction
from django.db.models import Q

from modules.accounts.models import Customer, Role, normalize_email
from modules.accounts.permissions import ensure_roles
from modules.accounts.services import record_audit


@transaction.atomic
def create_customer(*, member, actor, name, email="", phone="", correlation_id) -> Customer:
    ensure_roles(member, Role.OWNER, Role.MANAGER)
    customer = Customer.objects.create(
        organisation=member.organisation,
        name=name.strip(),
        email=normalize_email(email),
        phone=phone.strip(),
    )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="customer.created",
        entity=customer,
        summary={"has_email": bool(customer.email), "has_phone": bool(customer.phone)},
        correlation_id=correlation_id,
    )
    return customer


def visible_customers(member, *, search=""):
    ensure_roles(member, Role.OWNER, Role.MANAGER)
    rows = Customer.objects.for_org(member.organisation)
    if search:
        rows = rows.filter(
            Q(name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search)
        )
    return rows
