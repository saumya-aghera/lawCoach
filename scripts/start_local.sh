#!/bin/bash
# =============================================================================
# LawAIer - Local Dev (single port, Cloud Shell friendly)
# =============================================================================
# Builds the React frontend, then serves everything from FastAPI on port 8080.
# One URL, one web preview — hackathon ready.
#
# Usage:
#   chmod +x scripts/start_local.sh && ./scripts/start_local.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

GREEN="\033[0;32m"; BLUE="\033[0;34m"; YELLOW="\033[1;33m"; NC="\033[0m"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  LawAIer - Local Dev${NC}"
echo -e "${BLUE}================================================${NC}"

# ── GCP auth check ────────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo -e "${YELLOW}⚠️  No GCP project set.${NC}"
    echo "   Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi
echo -e "${GREEN}✓ GCP project: $PROJECT_ID${NC}"

# ── Step 1: Python venv + deps ────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[1/4] Setting up Python environment...${NC}"
cd "$BACKEND"

if ! command -v uv &>/dev/null; then pip install uv --quiet; fi

if [ ! -d ".venv" ]; then uv venv .venv; fi
source .venv/bin/activate

uv pip install -r backend_requirements.txt --quiet
echo -e "${GREEN}✓ Python deps ready${NC}"

# ── Step 2: Build React frontend ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/3] Building React frontend...${NC}"
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then npm install --silent; fi
# API calls go to same origin — no VITE_API_URL needed (relative paths work)
npm run build --silent
echo -e "${GREEN}✓ Frontend built${NC}"

# ── Step 3: Start server ──────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[3/3] Starting LawAIer...${NC}"
echo ""
echo -e "${GREEN}  URL → http://localhost:8080${NC}"
echo -e "${GREEN}  API docs → http://localhost:8080/docs${NC}"
echo ""
echo -e "${YELLOW}  Cloud Shell: click Web Preview → Preview on port 8080${NC}"
echo ""
echo "Press Ctrl+C to stop."
echo ""

cd "$BACKEND"
source .venv/bin/activate

GOOGLE_CLOUD_PROJECT="$PROJECT_ID" \
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}" \
GOOGLE_GENAI_USE_VERTEXAI=true \
uvicorn main:app --host 0.0.0.0 --port 8080
