FROM python:3.12.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.11 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY . .
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
# ponytail: migrate on start is safe with the single API replica this edition runs; use a release job if replicas grow.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py createcachetable && exec gunicorn config.wsgi --bind 0.0.0.0:8000 --workers 3"]
