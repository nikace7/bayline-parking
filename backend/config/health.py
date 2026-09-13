from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from config.api import ApiError


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()


class LiveView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=HealthSerializer, auth=[])
    def get(self, request):
        return Response({"status": "ok"})


class ReadyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=HealthSerializer, auth=[])
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError as exc:
            raise ApiError(
                503, "DATABASE_UNAVAILABLE", "Database is unreachable.", retryable=True
            ) from exc
        return Response({"status": "ok"})
