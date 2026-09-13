import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from config.dburl import parse_database_url


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        raise ImproperlyConfigured(f"Set {name} (run `pnpm setup:local` to create .env).")
    return value


DEBUG = env("DJANGO_DEBUG", "false").lower() == "true"
SECRET_KEY = env("DJANGO_SECRET_KEY")
APP_ORIGIN = env("APP_ORIGIN")
LOCATION_TIMEZONE = env("LOCATION_TIMEZONE", "Asia/Kathmandu")

# The SPA, API and gateway share one origin, so cookies and CSRF need no cross-site allowances.
ALLOWED_HOSTS = [urlsplit(APP_ORIGIN).hostname, "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = [APP_ORIGIN]
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = APP_ORIGIN.startswith("https://")
SESSION_COOKIE_SAMESITE = CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 12
APPEND_SLASH = False

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "modules.accounts",
]

MIDDLEWARE = [
    "config.api.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": parse_database_url(env("DATABASE_URL"))}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# Shared by every API process without Redis; used for throttling only, never for money or capacity.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["config.api.EnvelopeRenderer"],
    "DEFAULT_PARSER_CLASSES": ["djangorestframework_camel_case.parser.CamelCaseJSONParser"],
    "DEFAULT_PAGINATION_CLASS": "config.api.CursorPage",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.api.exception_handler",
    "DEFAULT_THROTTLE_RATES": {"auth": "10/minute"},
    # Throttles key on client IP. 0 = socket address only (native dev); Compose sets 1 because
    # Caddy replaces any X-Forwarded-For sent by the client with the real address.
    "NUM_PROXIES": int(env("TRUSTED_PROXY_COUNT", "0")),
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Bayline API",
    "VERSION": "1.0.0",
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {"RoleEnum": "modules.accounts.models.Role"},
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "drf_spectacular.contrib.djangorestframework_camel_case.camelize_serializer_fields",
        "config.api.envelope_schema_hook",
    ],
}
