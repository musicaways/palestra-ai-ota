# InkBridge hub — one small image, no build step.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    INKBRIDGE_DATA_DIR=/data

WORKDIR /app

COPY pyproject.toml README.md ./
COPY inkbridge ./inkbridge
RUN pip install --no-cache-dir .

RUN useradd --uid 1000 --create-home inkbridge && mkdir -p /data && chown inkbridge /data
USER inkbridge
VOLUME ["/data"]
EXPOSE 8577

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8577/health', timeout=4).status==200 else 1)"

CMD ["inkbridge"]
