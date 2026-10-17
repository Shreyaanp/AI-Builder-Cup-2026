FROM node:24-bookworm-slim AS frontend
WORKDIR /frontend
ARG ASSET_BASE_URL=/
ENV ASSET_BASE_URL=$ASSET_BASE_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY index.html tsconfig*.json vite.config.ts ./
# Face-scan engine + model are gitignored (large binaries); fetch them into the image.
RUN node scripts/prepare-face-assets.mjs && npm run build

FROM ghcr.io/astral-sh/uv:0.13.0 AS uv
FROM python:3.13-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-editable
COPY backend/app ./app
# The region profiles are shared with the app (src/region/regions.json, read by app/region.py).
COPY src/region/regions.json ./app/regions.json
COPY backend/server.py ./server.py
COPY --from=frontend /frontend/dist /app/frontend
RUN useradd --create-home --uid 10001 ogoogle && mkdir -p data && chown ogoogle:ogoogle data
USER 10001:10001
ENV APP_ENV=production AUTH_MODE=firebase SESSION_BACKEND=firestore COACH_MODE=offline FRONTEND_DIST=/app/frontend
EXPOSE 8080
CMD ["/opt/venv/bin/python", "server.py"]
