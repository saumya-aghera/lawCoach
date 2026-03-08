# ⚖️ LawAIer

Real-time AI legal rights coaching for law enforcement encounters. The app listens live, translates officer speech for non-English speakers, scans warrants and tickets, analyzes video footage, and generates attorney-ready PDF reports — all powered by **Google Gemini 2.0 Flash via Vertex AI**.

---

## Features

| Feature | Description |
|---------|-------------|
| 🎤 Live Coaching | Persistent WebSocket streams 4-second audio windows to Gemini; coaching cards appear in real-time |
| 🌍 Multilingual | 11 languages — officer's English is translated and read aloud; user's speech is translated to English for legal analysis |
| 📷 Document Scanner | Photograph a warrant, ticket, or ID → AI extracts text, violation codes, and DMV points breakdown |
| 🎥 Video Analysis | Upload dashcam or CCTV footage → timestamped event timeline, rights violations, evidence strength rating |
| 📄 PDF Report | Post-encounter legal incident report with full coaching timeline, suitable for sharing with an attorney |
| ⚖️ Lawyer Finder | Curated attorneys per situation and state with one-click email contact |
| 🗄️ Semantic Law Search | ChromaDB vector store + Vertex AI `text-embedding-004` finds the most legally relevant statutes for each query |
| 🕓 Session History | Last 20 sessions stored in `localStorage` with full transcript and coaching timeline |

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Browser (React / Vite)                     │
│                                                                      │
│  useAudioCapture (MediaRecorder, 4s windows)                         │
│        │ base64 audio blob every 4 seconds                           │
│        ▼                                                             │
│  useSessionSocket ─── WS /ws/session ──────────────────────────────► │
│        ◄──────────────────────────── { type:"analysis", ... } ────── │
│                                                                      │
│  Image upload  ──── POST /analyze-document ────────────────────────► │
│  Video upload  ──── POST /analyze-video    ────────────────────────► │
│  Session end   ──── POST /generate-report  ────────────────────────► │
└──────────────────────────────────────────────────────────────────────┘
                                  │
              ┌───────────────────▼──────────────────────┐
              │              FastAPI Backend              │
              │                                          │
              │  laws_data.json ──► ChromaDB             │
              │      (indexed once at startup via        │
              │       Vertex AI text-embedding-004)      │
              │              │                           │
              │              ▼                           │
              │       Top-5 law chunks                   │
              │              │                           │
              │              ▼                           │
              │      Gemini 2.0 Flash (Vertex AI)        │
              │      ┌─────────────────────────┐         │
              │      │ system prompt =          │         │
              │      │   situation + laws       │         │
              │      │   + multilingual rules   │         │
              │      │                          │         │
              │      │ content = audio blob or  │         │
              │      │   image / video bytes    │         │
              │      └────────────┬────────────┘         │
              │                   │                      │
              │         JSON response (single call):     │
              │         urgency · suggestion · law       │
              │         speaker · transcribed            │
              │         translated_for_user              │
              │         english_text                     │
              └──────────────────────────────────────────┘
```

---

## Vector DB — Semantic Law Retrieval

### Why Vector Search?

The keyword scorer used previously matched on exact words (e.g., `"K9"`, `"probable cause"`). A user saying *"they want to look through my stuff"* wouldn't match `"car search"`. Vertex AI embeddings encode **meaning**, so semantically equivalent phrases retrieve the same laws.

### Implementation

**Embedding model:** `text-embedding-004` (Vertex AI) — no local model download required.

**Vector store:** ChromaDB (in-memory). The collection is built once at app startup and lives in RAM for the lifetime of the process. On Cloud Run, this rebuilds on each cold start (~2 seconds for the embedding batch).

```python
class _VertexEmbedFn(EmbeddingFunction):
    def __call__(self, input: Documents):
        resp = get_client().models.embed_content(
            model="text-embedding-004",
            contents=list(input),
        )
        return [e.values for e in resp.embeddings]

col = chromadb.Client().create_collection(
    name="lawaier_laws",
    embedding_function=_VertexEmbedFn(),
    metadata={"hnsw:space": "cosine"},
)
```

**What gets embedded:** `"<title>. <content>"` — combining the law's human-readable name with its full statutory text gives richer semantic signal than content alone.

**Query at request time:**

```python
results = col.query(
    query_texts=["they want to look through my stuff"],
    n_results=15,
    where={"$and": [
        {"situation": {"$eq": "search"}},
        {"state":     {"$in": ["NY", "federal"]}},
    ]},
)
# → returns top-5 cosine-nearest laws for that state + situation
```

**Fallback:** If the Vertex AI embedding call fails (e.g., no credentials in CI), `query_laws()` automatically falls back to the keyword scorer so the app stays functional.

### Law Database Schema

Each entry in `laws_data.json` has:

```json
{
  "id":                  "ny_traffic_001",
  "state":               "NY",
  "situation":           "traffic_stop",
  "title":               "New York - Traffic Stop Rights",
  "law_reference":       "New York Vehicle and Traffic Law § 375",
  "content":             "In New York, during a traffic stop you must provide...",
  "actionable_response": "Hand over license, registration, insurance. Then say...",
  "urgency":             "yellow",
  "keywords":            ["pulled over", "license", "registration", ...]
}
```

Coverage: **5 situations × 4 jurisdictions** (NY, CA, TX, FL, Federal) = ~35 law chunks.

---

## Live Coaching — WebSocket Session

### Audio Capture

The frontend uses `MediaRecorder` in a **stop-restart loop** rather than `timeslice()`. This ensures every blob is a self-contained, header-complete file that Gemini can decode independently.

```
t=0s ─── MediaRecorder.start() ──────────────────── t=4s ─── mr.stop()
          ondataavailable → collect chunks                       │
                                                                 ├─ new Blob(chunks) → complete WebM/OGG
                                                                 ├─ FileReader → base64
                                                                 ├─ WebSocket.send({ type:"audio", data, media_type })
                                                                 └─ setTimeout(100ms) → MediaRecorder.start()
```

Chunks smaller than 1 500 bytes (silence / noise) are discarded before sending.

### WebSocket Protocol

The session uses a single persistent `/ws/session` connection for the entire encounter. This avoids HTTP handshake overhead on every chunk and eliminates buffering artifacts that caused translation chunking.

**Client → Server:**

```jsonc
// Once, on session start
{ "type": "init",  "situation": "traffic_stop", "state": "NY",
  "description": "Pulled over on I-95", "user_lang": "hi" }

// Every ~4 seconds during listening
{ "type": "audio", "data": "<base64>", "media_type": "audio/webm" }

// On-demand translation
{ "type": "translate", "text": "Step out of the vehicle", "target_lang": "Hindi" }
```

**Server → Client:**

```jsonc
{ "type": "ready" }   // session context accepted

{ "type": "analysis",
  "transcribed":        "Step out of the vehicle",
  "speaker":            "officer",
  "english_text":       "",
  "translated_for_user":"गाड़ी से बाहर निकलें",
  "urgency":            "yellow",
  "suggestion":         "You must comply with lawful orders to exit the vehicle...",
  "law":                "Pennsylvania v. Mimms (1977)" }

{ "type": "translation", "translated": "गाड़ी से बाहर निकलें" }
{ "type": "error", "message": "..." }
```

### Single-Call AI Processing

One Gemini call per audio chunk handles transcription + speaker detection + translation + legal analysis simultaneously. The system prompt is pre-loaded with the top-5 semantically retrieved laws:

```
System prompt structure:
  ├── Situation context (traffic stop / arrest / search / immigration / interrogation)
  ├── State context (NY, CA, TX, FL, Federal)
  ├── Top-5 law chunks (retrieved by semantic search for this session)
  ├── Multilingual rules (if user_lang ≠ "en")
  │     ├── Speaker detection heuristics (English → officer, native lang → user)
  │     ├── translated_for_user field instructions
  │     └── english_text field instructions
  └── Output schema (strict JSON, no markdown)
```

### Multilingual Flow

```
Audio chunk
    │
    ▼
Gemini detects language + speaker identity
    │
    ├── speaker = "officer" (English)
    │       translated_for_user = "<officer words in user's language>"
    │       Frontend: display translation, speak via speechSynthesis
    │
    └── speaker = "you" (native language)
            english_text = "<user words in English>"
            Frontend: use english_text for legal history + analysis
```

Supported languages: English, Spanish, French, German, Chinese, Arabic, Hindi, Portuguese, Russian, Japanese, Korean.

---

## Transcript

The transcript is built incrementally as analysis results arrive from the WebSocket. Each entry stores:

```js
{
  id:           Date.now() + Math.random(),   // unique key
  ts:           "02:34 PM",                   // wall-clock timestamp
  speaker:      "officer" | "you" | "system", // detected by Gemini
  text:         "Step out of the vehicle",    // displayed text
  originalText: "Step out of the vehicle",    // English original (shown as subtext in multilingual sessions)
}
```

**Speaker colour coding:**
- Officer → red badge (`#b91c1c` / `#fee2e2`)
- You → blue badge (`#1d4ed8` / `#dbeafe`)
- System → slate badge (session start announcement)

**Speaker correction:** Users can click any transcript entry to flip the speaker label (officer ↔ you) if Gemini mis-detected it. The correction propagates to the coaching history used for subsequent analysis.

**Conversation history:** A parallel `history` array tracks entries in `{role, content}` format for Gemini multi-turn context. Officer speech uses original English; user speech uses the `english_text` translation so all legal reasoning happens in English regardless of the session language.

**Session persistence:** On `stopListening()`, the full transcript (and suggestions) are saved to `localStorage` under key `lawaier_sessions` (max 20 sessions, FIFO eviction). Sessions are browsable via the History panel in the header.

---

## Document Scanner

Users can photograph or upload any law enforcement document during a live session or from the results screen.

### Processing Pipeline

```
File selected by user
    │
    ├── FileReader.readAsDataURL()  →  base64 string
    │
    └── POST /analyze-document
            │
            ├── Semantic law search (top-5 relevant laws for situation)
            │
            └── Gemini Vision (gemini-2.0-flash)
                    │  system: legal document analyst
                    │  content: [image bytes, "Analyze this document..."]
                    │
                    ▼
            Structured JSON response:
            ┌─────────────────────────────────────────┐
            │ document_type    traffic_ticket          │
            │ summary          "2024 NY speeding..."   │
            │ key_fields       issued_by, date,        │
            │                  case_number, amount_due │
            │ violation_codes  ["1180d", "1225c"]      │
            │ urgency          red / yellow / green    │
            │ findings         ["4 DMV points"]        │
            │ actions          ["Contest within 30d"]  │
            │ is_judicial_warrant  false               │
            │ requires_compliance  true                │
            └─────────────────────────────────────────┘
```

### DMV Points Calculator

For traffic tickets, violation codes extracted by Gemini are looked up in `points_data.json`:

```python
calculate_points(state="NY", violation_codes=["1180d", "1225c"])
# →
{
  "total_points":   6,
  "breakdown": [
    { "code":"1180d", "name":"Speeding 21-30mph over limit",
      "points":4, "fine_range":"$90–$300", "category":"speeding" },
    { "code":"1225c", "name":"Cell phone use while driving",
      "points":5, "fine_range":"$50–$200", "category":"distracted_driving" }
  ],
  "worst_consequence":   "License suspension — 11+ points in 18 months",
  "points_to_suspension": 5,
  "contest_recommended": true,
  "contest_reason":       "These 6 points could trigger surcharges..."
}
```

If points ≥ 4, the urgency level is upgraded and an attorney-contest recommendation is added to the findings list.

Document types recognized: `judicial_warrant`, `administrative_warrant`, `summons`, `traffic_ticket`, `notice`, `id_document`, `other`.

---

## Video Analysis

Users can upload dashcam, body-cam, or phone footage for post-encounter legal review.

### Processing Pipeline

```
Video file selected
    │
    ├── FileReader.readAsDataURL()  →  base64 string
    │
    └── POST /analyze-video
            │
            ├── Semantic law search (situation-relevant statutes)
            │
            └── Gemini Vision (native video understanding)
                    │  supports: MP4, MOV, WebM, AVI
                    │  content: [video bytes, analysis prompt]
                    │
                    ▼
            Structured JSON response:
            ┌──────────────────────────────────────────────────────┐
            │ footage_type      "Dashcam Footage"                  │
            │ summary           "Officer approached vehicle at..." │
            │ duration          "3 minutes 42 seconds"             │
            │ urgency           red / yellow / green               │
            │                                                      │
            │ timeline  [                                          │
            │   { timestamp:"0:00", significant:true,             │
            │     event:"Officer approaches, asks for license" },  │
            │   { timestamp:"0:45", significant:true,             │
            │     event:"Search requested without probable cause"} │
            │ ]                                                    │
            │                                                      │
            │ violations_detected                                  │
            │   ["Search conducted without warrant or consent"]    │
            │                                                      │
            │ officer_conduct   "Did not state probable cause..."  │
            │ evidence_strength "Strong — clear audio and video"   │
            │                                                      │
            │ key_observations                                     │
            │   ["Badge #4721 visible at 0:12",                   │
            │    "No warrant presented before search"]             │
            │                                                      │
            │ recommended_actions                                  │
            │   ["Preserve original file — do not edit",          │
            │    "Consult a civil rights attorney"]                │
            └──────────────────────────────────────────────────────┘
```

Gemini processes the entire video natively — no frame extraction or pre-processing needed. The `timeline` array is particularly useful for attorneys identifying the moment a rights violation occurred.

---

## PDF Report Generation

The report is generated server-side at session end via `POST /generate-report`. It combines AI legal assessment with ReportLab rendering.

### Two-Phase Generation

**Phase 1 — AI Legal Assessment** (Gemini text call):

```
Input:
  situation, state, description
  full transcript  → "[02:34] Officer: Step out..."
  coaching timeline → "[RED] Invoke 5th Amendment (Miranda v. Arizona)"
  documents scanned → "traffic_ticket — 4 points, $300 fine"
  session duration

Output JSON:
  incident_summary        — 2-3 sentence factual summary
  rights_assessment       — were rights respected?
  critical_moments        — key events that may be legally significant
  laws_invoked            — statutes triggered during encounter
  potential_violations    — officer conduct issues
  recommended_actions     — next steps for the user
  attorney_notes          — privileged context for legal counsel
  risk_level              — low / medium / high
  follow_up_required      — boolean
```

**Phase 2 — PDF Rendering** (ReportLab):

```
Report sections (in order):
  ┌─────────────────────────────────────────┐
  │  ⚖ LAWAIER AI          ● HIGH RISK      │  ← header + risk badge
  │  POST-ENCOUNTER LEGAL INCIDENT REPORT   │
  ├─────────────────────────────────────────┤
  │  Date | Time | Situation | State        │  ← metadata grid
  │  Duration | Follow-up Required          │
  ├─────────────────────────────────────────┤
  │  User's Description                     │
  │  Incident Summary                       │
  │  Rights Assessment                      │
  ├─────────────────────────────────────────┤
  │  AI Coaching Timeline  (table)          │  ← time | urgency | guidance | law
  ├─────────────────────────────────────────┤
  │  Documents Scanned     (per-doc boxes)  │
  ├─────────────────────────────────────────┤
  │  Critical Moments                       │
  │  Laws & Rights Referenced               │
  │  Potential Rights Violations  ⚠         │
  │  Recommended Next Steps  →              │
  ├─────────────────────────────────────────┤
  │  Notes for Attorney    (accent box)     │
  ├─────────────────────────────────────────┤
  │  Full Transcript       (timestamped)    │
  ├─────────────────────────────────────────┤
  │  Legal Disclaimer                       │
  └─────────────────────────────────────────┘
```

The PDF is returned as a `application/pdf` response and downloaded directly in the browser. Filename: `lawaier-YYYYMMDD-HHMM.pdf`.

---

## Project Structure

```
lawCoach/
├── backend/
│   ├── main.py                  ← FastAPI — all endpoints + WebSocket + ChromaDB
│   ├── laws_data.json           ← ~35 law chunks (5 situations × 4 jurisdictions)
│   ├── points_data.json         ← DMV violation points by state
│   ├── backend_requirements.txt ← fastapi, google-genai, chromadb, reportlab
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← Full React UI (~850 lines, 4 screens)
│   │   └── useSessionSocket.js  ← WebSocket hook (connect / sendAudio / disconnect)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── scripts/
│   ├── setup.sh                 ← One-time GCP infrastructure setup
│   ├── deploy.sh                ← Deploy to Cloud Run via Cloud Build
│   └── start_local.sh           ← Local development
├── cloudbuild.yaml              ← CI/CD (backend → frontend, injects VITE_API_URL)
└── set_env.sh                   ← Generated by setup.sh (gitignored)
```

### Key Backend Functions

| Function | Line | Description |
|----------|------|-------------|
| `lifespan()` | ~46 | FastAPI lifespan — pre-builds ChromaDB collection at startup |
| `_build_vector_store()` | ~151 | Embeds all law chunks via Vertex AI, stores in ChromaDB (in-memory, cached) |
| `query_laws()` | ~185 | Semantic search → top-5 laws; falls back to keyword scorer on error |
| `_query_laws_keyword()` | ~211 | TF-style keyword fallback scorer |
| `call_ai()` | ~240 | Unified Gemini caller — text, vision (image/video), audio |
| `build_system_prompt()` | ~204 | Constructs system prompt with injected law context + multilingual rules |
| `_do_transcribe_analyze()` | ~392 | Core audio→analysis logic (shared by WebSocket and HTTP endpoint) |
| `ws_session()` | ~434 | WebSocket endpoint — handles init / audio / translate message types |
| `calculate_points()` | ~299 | DMV points calculator from violation code list |
| `_build_pdf()` | ~648 | ReportLab PDF builder (7 sections, colour-coded urgency) |

### Key Frontend Components

| Component / Hook | Description |
|-----------------|-------------|
| `useAudioCapture()` | `MediaRecorder` stop-restart loop, 4s windows, base64 encoding |
| `useSessionSocket()` | WebSocket lifecycle — connect, sendAudio, onAnalysis callback, disconnect |
| `handleAnalysisResult()` | Processes incoming analysis JSON → transcript, history, suggestions, TTS |
| `handleImageUpload()` | FileReader → base64 → POST `/analyze-document` → scan result |
| `handleVideoUpload()` | FileReader → base64 → POST `/analyze-video` → video result |
| `downloadReport()` | POST `/generate-report` → blob → browser download |

---

## API Reference

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws/session` | Persistent session for live audio analysis + real-time translation |

### HTTP

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/health` | — | `{status, version}` |
| GET | `/docs` | — | Swagger UI |
| GET | `/laws` | `?state=NY&situation=traffic_stop` | filtered law list |
| POST | `/prepare` | `{situation, state, description}` | `{laws:[...]}` |
| POST | `/transcribe-analyze` | `{audio_base64, media_type, situation, state, description, user_lang}` | analysis JSON |
| POST | `/analyze` | `{spoken_text, situation, state, description, conversation_history, user_lang}` | coaching card |
| POST | `/analyze-document` | `{image_base64, media_type, state, situation, description}` | document analysis + points |
| POST | `/analyze-video` | `{video_base64, media_type, state, situation, description}` | timeline + violations |
| POST | `/generate-report` | `{situation, state, description, transcript, suggestions, doc_findings, duration_seconds}` | PDF blob |
| POST | `/translate` | `{text, target_lang}` | `{translated}` |

---

## Running Locally

### Prerequisites
- Python 3.11+, Node 20+
- Google Cloud SDK: [install](https://cloud.google.com/sdk/docs/install)
- GCP project with **Vertex AI API** enabled

### Steps

```bash
# 1. Authenticate
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# 2. Start backend + frontend
cd lawCoach
chmod +x scripts/start_local.sh
./scripts/start_local.sh
```

The script installs Python deps via `uv`, installs npm packages, starts the backend on **:8000** and the Vite dev server on **:3000**.

On first startup the backend logs:
```
INFO  ChromaDB vector store built — 35 law chunks indexed.
INFO  Application startup complete.
```

**Backend only:**
```bash
cd backend
GOOGLE_CLOUD_PROJECT=your-project uvicorn main:app --reload --port 8000
```

**Frontend only** (pointing at a running backend):
```bash
cd frontend
VITE_API_URL=http://localhost:8000 npm run dev
```

---

## Deploying to Cloud Run

### Step 1 — One-time GCP setup

```bash
cd lawCoach
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Creates service account `lawaier-sa`, enables APIs (`aiplatform`, `run`, `cloudbuild`, `artifactregistry`, `iam`), creates Artifact Registry repo `lawaier`, writes `set_env.sh`.

### Step 2 — Deploy

```bash
source set_env.sh
./scripts/deploy.sh
```

Cloud Build pipeline:
1. Builds backend Docker image → deploys to Cloud Run
2. Captures backend URL → injects as `VITE_API_URL` build arg
3. Builds frontend Docker image (served via Nginx) → deploys to Cloud Run
4. Prints both service URLs

### Step 3 — Get URLs

```bash
gcloud run services describe lawaier-frontend --region us-central1 --format 'value(status.url)'
gcloud run services describe lawaier-backend  --region us-central1 --format 'value(status.url)'
```

> **WebSocket on Cloud Run:** Supported natively — no extra configuration. The `/ws/session` endpoint works identically to local dev. The `VITE_API_URL` env var (`http://...`) is automatically converted to `ws://` / `wss://` by `useSessionSocket.js`.

> **ChromaDB on Cloud Run:** The collection is rebuilt in-memory on each cold start. With ~35 law chunks the batch embedding call takes ~2 seconds. Warm instances skip the rebuild entirely.

---

## Environment Variables

| Variable | Where set | Description |
|----------|-----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Cloud Run / local env | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | Cloud Run / local env | Region (default `us-central1`) |
| `VITE_API_URL` | Frontend build arg | Backend base URL — auto-converted to `ws://`/`wss://` for WebSocket |

---

*Disclaimer: General information only — not legal advice. Always consult a licensed attorney.*
