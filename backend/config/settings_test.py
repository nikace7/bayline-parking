from django.core.exceptions import ImproperlyConfigured

from config.dburl import parse_database_url
from config.settings import *  # noqa: F403
from config.settings import DATABASES, env

_test_db = parse_database_url(env("TEST_DATABASE_URL"))
_main_db = DATABASES["default"]
if [_test_db[k] for k in ("HOST", "PORT", "NAME")] == [
    _main_db[k] for k in ("HOST", "PORT", "NAME")
]:
    raise ImproperlyConfigured(
        "TEST_DATABASE_URL must name a different database than DATABASE_URL."
    )

# TEST.NAME pins the exact database pytest creates and destroys, instead of a derived test_ name.
DATABASES = {"default": {**_test_db, "TEST": {"NAME": _test_db["NAME"]}}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
# The live-server static handler requires a URL; the test URLconf serves Vite assets itself.
STATIC_URL = "/__test_static__/"
