#!/bin/bash
# =============================================================================
# LawAIer - GCP Deploy
# =============================================================================
# Wraps gcloud builds submit — mirrors way-back-home/solutions/level_2/deploy_cloud_run.sh
#
# Usage:
#   chmod +x scripts/deploy.sh && ./scripts/deploy.sh
#
# Prerequisites:
#   ./scripts/setup.sh   (run once to provision GCP infrastructure)
#   source set_env.sh    (loads PROJECT_ID, REGION, etc.)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT/set_env.sh"

# ── Load env ─────────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "❌ set_env.sh not found. Run setup.sh first:"
    echo "   ./scripts/setup.sh"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo "❌ PROJECT_ID not set in set_env.sh"
    exit 1
fi

REGION="${REGION:-us-central1}"
REPO_NAME="${REPO_NAME:-lawaier}"

echo "=================================================="
echo "  LawAIer - Cloud Build Deploy"
echo "=================================================="
echo "  Project: $PROJECT_ID"
echo "  Region:  $REGION"
echo "  Repo:    $REPO_NAME"
echo "=================================================="
echo ""

cd "$ROOT"

gcloud builds submit \
    --config cloudbuild.yaml \
    --project "$PROJECT_ID" \
    --substitutions _REGION="$REGION",_AR_REPO="$REPO_NAME" \
    .

echo ""
echo "=================================================="
echo "  Deploy submitted!"
echo "  Track progress:"
echo "  https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
echo "=================================================="
