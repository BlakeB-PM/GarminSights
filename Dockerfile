# ============================================
# GarminSights — single-container Cloud Run image
# Builds the React frontend, then serves it from
# the FastAPI backend as static files.
# ============================================

# ── Stage 1: Build frontend ──────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./

# VITE_API_URL is intentionally left empty so the frontend
# talks to the SAME origin (the backend that serves it).
ENV VITE_API_URL=""
RUN npm run build

# ── Stage 2: Python backend + static assets ──
FROM python:3.12-slim AS runtime

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (layer caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy built frontend into backend/static/ so FastAPI can serve it
COPY --from=frontend-build /app/frontend/dist ./static

# Cloud Run sets PORT; default to 8080
ENV PORT=8080 \
    ENV=production

EXPOSE ${PORT}

# Run with uvicorn — Cloud Run provides its own HTTPS termination
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --log-level info"]
