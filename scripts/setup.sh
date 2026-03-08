#!/bin/bash
# =============================================================================
# LawAIer - GCP Environment Setup
# =============================================================================
# Mirrors the pattern from way-back-home/level_1/setup/setup_env.sh
#
# Run ONCE before deploying:
#   chmod +x scripts/setup.sh && ./scripts/setup.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Detect Project ID ─────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ "$PROJECT_ID" = "(unset)" ] || [ -z "$PROJECT_ID" ]; then
    echo "❌ No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

REGION="us-central1"
REPO_NAME="lawaier"
SA_NAME="lawaier-sa"
SERVICE_ACCOUNT="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "================================================================"
echo "  LawAIer - GCP Setup"
echo "================================================================"
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  Repo:     $REPO_NAME"
echo "================================================================"
echo ""

# ── Step 1: Enable APIs ───────────────────────────────────────────────────────
echo "[1/5] Enabling required Google Cloud APIs..."

gcloud services enable compute.googleapis.com              --project=$PROJECT_ID
echo "      ✓ Compute Engine"
gcloud services enable cloudresourcemanager.googleapis.com --project=$PROJECT_ID
echo "      ✓ Cloud Resource Manager"
gcloud services enable aiplatform.googleapis.com           --project=$PROJECT_ID
echo "      ✓ Vertex AI (Gemini)"
gcloud services enable run.googleapis.com                  --project=$PROJECT_ID
echo "      ✓ Cloud Run"
gcloud services enable cloudbuild.googleapis.com           --project=$PROJECT_ID
echo "      ✓ Cloud Build"
gcloud services enable artifactregistry.googleapis.com     --project=$PROJECT_ID
echo "      ✓ Artifact Registry"
gcloud services enable iam.googleapis.com                  --project=$PROJECT_ID
echo "      ✓ IAM"

# ── Step 2: Service Account ───────────────────────────────────────────────────
echo ""
echo "[2/5] Setting up service account..."

if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" \
       --project=$PROJECT_ID >/dev/null 2>&1; then
    echo "      ✓ Service account '$SA_NAME' already exists"
else
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="LawAIer Service Account" \
        --project=$PROJECT_ID
    echo "      ✓ Service account '$SA_NAME' created"
    echo "      ⏳ Waiting 10s for identity propagation..."
    sleep 10
fi

# Vertex AI User — allows calling Gemini via Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/aiplatform.user" \
    --condition=None --quiet >/dev/null 2>&1
echo "      ✓ roles/aiplatform.user (Gemini/Vertex AI access)"

# Cloud Run Invoker — service-to-service calls
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/run.invoker" \
    --condition=None --quiet >/dev/null 2>&1
echo "      ✓ roles/run.invoker"

# Storage Object Viewer — if using GCS for media
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.objectViewer" \
    --condition=None --quiet >/dev/null 2>&1
echo "      ✓ roles/storage.objectViewer"

# ── Step 3: Cloud Build IAM ───────────────────────────────────────────────────
echo ""
echo "[3/5] Configuring Cloud Build IAM..."

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" \
    --format='value(projectNumber)' 2>/dev/null || true)

if [ -z "$PROJECT_NUMBER" ]; then
    echo "      ⚠️  Retrying project number lookup..."
    sleep 5
    PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
fi

COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "      Compute SA: $COMPUTE_SA"

# Allow Cloud Build's Compute SA to deploy as lawaier-sa
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/iam.serviceAccountUser" \
    --project="$PROJECT_ID" --quiet >/dev/null 2>&1
echo "      ✓ Cloud Build can deploy as $SA_NAME"

# Cloud Run Admin so Cloud Build can deploy services
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/run.admin" \
    --condition=None --quiet >/dev/null 2>&1
echo "      ✓ roles/run.admin granted to Compute SA"

# ── Step 4: Artifact Registry ─────────────────────────────────────────────────
echo ""
echo "[4/5] Creating Artifact Registry repository..."

if gcloud artifacts repositories describe "$REPO_NAME" \
       --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
    echo "      ✓ Repository '$REPO_NAME' already exists"
else
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location=$REGION \
        --description="LawAIer container images" \
        --project=$PROJECT_ID
    echo "      ✓ Repository '$REPO_NAME' created"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "      ✓ Docker auth configured"

# ── Step 5: Write set_env.sh ──────────────────────────────────────────────────
echo ""
echo "[5/5] Writing environment file..."

ENV_FILE="$PROJECT_ROOT/set_env.sh"

cat > "$ENV_FILE" <<EOF
#!/bin/bash
# =============================================================================
# LawAIer - Environment Variables
# =============================================================================
# Generated by setup.sh on $(date)
# Source before deploying:
#   source set_env.sh
# =============================================================================

export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export PROJECT_ID="$PROJECT_ID"
export REGION="$REGION"
export GOOGLE_CLOUD_LOCATION="$REGION"

# Vertex AI mode — required for Gemini via Google Cloud
export GOOGLE_GENAI_USE_VERTEXAI=true

# Artifact Registry & service account
export REPO_NAME="$REPO_NAME"
export SERVICE_ACCOUNT="$SERVICE_ACCOUNT"

# Populated after first deploy:
# export BACKEND_URL="https://lawaier-backend-xxx-uc.a.run.app"
# export FRONTEND_URL="https://lawaier-frontend-xxx-uc.a.run.app"

echo "✓ LawAIer env loaded — project: \$PROJECT_ID | region: \$REGION"
EOF

chmod +x "$ENV_FILE"
echo "      ✓ Written to $ENV_FILE"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "  ✅ Setup Complete!"
echo "================================================================"
echo ""
echo "  APIs enabled:"
echo "    compute, cloudresourcemanager, aiplatform (Gemini),"
echo "    run, cloudbuild, artifactregistry, iam"
echo ""
echo "  Service Account: $SERVICE_ACCOUNT"
echo "    roles: aiplatform.user, run.invoker, storage.objectViewer"
echo ""
echo "  Next steps:"
echo "    source set_env.sh"
echo "    gcloud builds submit --config cloudbuild.yaml ."
echo "================================================================"
