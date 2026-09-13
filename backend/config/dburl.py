from urllib.parse import unquote, urlsplit


def parse_database_url(url: str) -> dict:
    """Turn `postgres://user:pass@host:port/name` into a Django DATABASES entry."""
    parts = urlsplit(url)
    if parts.scheme not in {"postgres", "postgresql"}:
        raise ValueError("Database URL must start with postgres://")
    name = unquote(parts.path.lstrip("/"))
    if not parts.hostname or not name:
        raise ValueError("Database URL needs a host and a database name.")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": name,
        "USER": unquote(parts.username or ""),
        "PASSWORD": unquote(parts.password or ""),
        "HOST": parts.hostname,
        "PORT": str(parts.port or 5432),
    }
