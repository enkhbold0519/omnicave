# CellarOS API image (FastAPI + Uvicorn). Built by deploy/docker-compose.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# tzdata: the daily briefing push uses local time (TZ is set in deploy/.env)
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY personas.json .

RUN useradd --system --uid 10001 cellar
USER cellar
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)"

# ONE worker on purpose: the sensor simulator and daily briefing run as a background thread
# inside the process; several workers would run them several times.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
