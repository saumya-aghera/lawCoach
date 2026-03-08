#!/bin/bash
# =============================================================================
# LawAIer - Local Development Startup
# =============================================================================
# Starts backend (FastAPI) + frontend (Vite) for local development.
# Mirrors way-back-home pattern.
#
# Usage:
#   chmod +x scripts/start_local.sh && ./scripts/start_local.sh
#
# Prerequisites:
#   - Python 3.11+ and Node 20+ installed
#   - gcloud auth application-default login   (for Vertex AI / Gemini)
#   - gcloud config set project YOUR_PROJECT_ID
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; BLUE="\033[0;34m"; YELLOW="\033[1;33m"; NC="\033[0m"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  LawAIer - Local Dev${NC}"
echo -e "${BLUE}================================================${NC}"

# ── GCP auth check ───────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo -e "${YELLOW}⚠️  No GCP project set.${NC}"
    echo "   Run: gcloud config set project YOUR_PROJECT_ID"
    echo "   Then: gcloud auth application-default login"
    exit 1
fi
echo -e "${GREEN}✓ GCP project: $PROJECT_ID${NC}"

export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
export GOOGLE_GENAI_USE_VERTEXAI=true

# ── Python deps ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[1/4] Installing Python dependencies...${NC}"
cd "$BACKEND"

if ! command -v uv &>/dev/null; then
    echo "Installing uv..."
    pip install uv --quiet
fi

uv pip install --system -r backend_requirements.txt --quiet
echo -e "${GREEN}✓ Python deps ready${NC}"

# ── Build ChromaDB ────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/4] Checking ChromaDB vector store...${NC}"
if [ ! -d "$BACKEND/lawaier_db" ]; then
    echo "Building ChromaDB (first run — downloads embedding model)..."
    python build_chromadb.py
    echo -e "${GREEN}✓ ChromaDB built${NC}"
else
    echo -e "${GREEN}✓ ChromaDB already exists${NC}"
fi

# ── Frontend deps ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[3/4] Installing frontend dependencies...${NC}"
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
echo -e "${GREEN}✓ Frontend deps ready${NC}"

# ── Launch both servers ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[4/4] Starting servers...${NC}"
echo ""
echo -e "${GREEN}  Backend  → http://localhost:8000${NC}"
echo -e "${GREEN}  Frontend → http://localhost:3000${NC}"
echo -e "${GREEN}  API docs → http://localhost:8000/docs${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Start backend in background
cd "$BACKEND"
GOOGLE_CLOUD_PROJECT="$PROJECT_ID" \
GOOGLE_CLOUD_LOCATION="$GOOGLE_CLOUD_LOCATION" \
GOOGLE_GENAI_USE_VERTEXAI=true \
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# Start frontend in foreground
cd "$FRONTEND"
npm run dev

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
