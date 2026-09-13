from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from modules.accounts.models import OrgMember, Role, User


def role_list(**kwargs) -> serializers.ListField:
    return serializers.ListField(
        child=serializers.ChoiceField(choices=Role.choices),
        allow_empty=False,
        max_length=len(Role),
        **kwargs,
    )


class RegisterSerializer(serializers.Serializer):
    organisation_name = serializers.CharField(max_length=120)
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], User(email=attrs["email"], name=attrs["name"]))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, write_only=True)


class SessionUserSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.CharField()


class MembershipSummarySerializer(serializers.Serializer):
    organisation_id = serializers.UUIDField(source="organisation.id")
    organisation_name = serializers.CharField(source="organisation.name")
    roles = role_list()


class SessionSerializer(serializers.Serializer):
    user = SessionUserSerializer(allow_null=True)
    memberships = MembershipSummarySerializer(many=True)
    active_organisation_id = serializers.UUIDField(allow_null=True)


class SwitchOrganisationSerializer(serializers.Serializer):
    active_organisation_id = serializers.UUIDField()


class MemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    roles = role_list(read_only=True)

    class Meta:
        model = OrgMember
        fields = ["id", "email", "name", "roles", "enabled", "revision", "created_at"]
        read_only_fields = fields


class MemberUpdateSerializer(serializers.Serializer):
    # Optional here so a missing value can answer 428 Precondition Required instead of 400.
    expected_revision = serializers.IntegerField(min_value=1, required=False)
    roles = role_list(required=False)
    enabled = serializers.BooleanField(required=False)
