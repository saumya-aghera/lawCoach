FROM python:3.11-slim

WORKDIR /app

# Build tools needed by sentence-transformers / chromadb
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# uv — fast package installer (matches way-back-home solutions pattern)
RUN pip install uv

COPY backend_requirements.txt .
RUN uv pip install --no-cache-dir --system -r backend_requirements.txt

# Copy application files
COPY main.py .
COPY build_chromadb.py .
COPY laws_data.json .
COPY points_data.json .

# Pre-build ChromaDB vector store at image build time
# Downloads all-MiniLM-L6-v2 and indexes laws_data.json
RUN python build_chromadb.py

# Cloud Run injects PORT; default 8080
ENV PORT=8080

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
