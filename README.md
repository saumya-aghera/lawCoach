# ⚖️ AI Law Coach — v2
### RAG + Vision + PDF Reports 

Real-time legal rights coaching. Listens to conversations, scans legal
documents with AI vision, and generates post-encounter legal PDF reports.

---

## What's New in v2

| Feature | Description |
|---------|-------------|
| 📷 Document Scanner | Point camera at warrant/ticket/notice → AI reads it instantly |
| 📄 PDF Legal Report | Post-encounter professional report for your attorney |
| Unified AI caller | One call_ai() — swap Claude ↔ Gemini in one place |

---

## Project Structure

```
law-coach/
├── backend/
│   ├── main.py                ← FastAPI (all endpoints incl. Vision + PDF)
│   ├── build_chromadb.py      ← ONE-TIME: build vector DB
│   ├── query_test.py          ← verify RAG works
│   ├── gemini_live_coach.py   ← Gemini Live stub (hackathon day)
│   ├── laws_data.json         ← 25 law chunks
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/App.jsx            ← Full UI (intake+ready+listening+done+camera+report)
│   ├── src/main.jsx
│   ├── public/index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---


## Architecture

```
laws_data.json → ChromaDB (vector DB, pre-built)
                      ↓
Browser mic → App.jsx → POST /analyze → ChromaDB query
                                      → call_ai() with law context
                                      → {urgency, suggestion, law}
                                      → card renders live

Camera/File → App.jsx → POST /analyze-document → call_ai() VISION
                                               → document analysis card

Session end → App.jsx → POST /generate-report → AI assessment
                                              → ReportLab PDF
                                              → download to browser
```

---

## API

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | /health | status |
| POST | /prepare | law chunks for situation |
| POST | /analyze | {urgency, suggestion, law} |
| POST | /analyze-document | document analysis JSON |
| POST | /generate-report | PDF bytes |
| GET | /laws | browse law DB |

---

Disclaimer: General information only, not legal advice. Consult a licensed attorney.
