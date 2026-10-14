FROM ghcr.io/astral-sh/uv:0.13.0 AS uv
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-editable --extra face
COPY backend/scripts/fetch_face_models.py ./scripts/fetch_face_models.py
# Models are absent from git; verify publisher checksums and retain license notices.
RUN /opt/venv/bin/python scripts/fetch_face_models.py
COPY backend/face_worker.py ./face_worker.py
RUN useradd --create-home --uid 10001 ogoogle && \
    mkdir -p data/face-vectors && chown ogoogle:ogoogle data/face-vectors
USER 10001:10001
EXPOSE 8080
CMD ["/bin/sh", "-c", "exec /opt/venv/bin/uvicorn face_worker:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
