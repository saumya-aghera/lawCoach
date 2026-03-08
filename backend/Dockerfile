FROM python:3.11-slim

WORKDIR /app

RUN pip install uv

COPY backend_requirements.txt .
RUN uv pip install --no-cache-dir --system -r backend_requirements.txt

COPY main.py .
COPY laws_data.json .
COPY points_data.json .

ENV PORT=8080

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
