"""
laws_db.py — shared law retrieval utilities
============================================
ChromaDB in-memory vector store (Vertex AI text-embedding-004) + keyword fallback.
Imported by both main.py (HTTP endpoints) and legal_coach/agent.py (ADK tools).
"""

import json, logging, os
import chromadb
from chromadb import EmbeddingFunction, Documents
from google import genai

log = logging.getLogger("lawaier.laws_db")

# ── Gemini client (lazy, shared) ──────────────────────────────────────────
_client: genai.Client | None = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
    return _client


# ── Laws JSON (loaded once) ────────────────────────────────────────────────
_laws_cache: list[dict] = []

def get_laws() -> list[dict]:
    global _laws_cache
    if not _laws_cache:
        laws_file = os.path.join(os.path.dirname(__file__), "laws_data.json")
        with open(laws_file) as f:
            _laws_cache = json.load(f)
    return _laws_cache


# ── ChromaDB ──────────────────────────────────────────────────────────────
class _VertexEmbedFn(EmbeddingFunction):
    """Calls Vertex AI text-embedding-004 synchronously for ChromaDB."""
    def __call__(self, input: Documents):  # type: ignore[override]
        resp = get_client().models.embed_content(
            model="text-embedding-004",
            contents=list(input),
        )
        return [e.values for e in resp.embeddings]


_collection = None

def build_vector_store():
    """Build (or return cached) in-memory ChromaDB collection from laws_data.json."""
    global _collection
    if _collection is not None:
        return _collection

    laws = get_laws()
    col = chromadb.Client().get_or_create_collection(
        name="lawaier_laws",
        embedding_function=_VertexEmbedFn(),
        metadata={"hnsw:space": "cosine"},
    )
    col.add(
        ids=[l["id"] for l in laws],
        documents=[f"{l['title']}. {l['content']}" for l in laws],
        metadatas=[{
            "state":               l["state"],
            "situation":           l["situation"],
            "urgency":             l["urgency"],
            "title":               l["title"],
            "law_reference":       l["law_reference"],
            "actionable_response": l["actionable_response"],
        } for l in laws],
    )
    _collection = col
    log.info("ChromaDB: %d law chunks indexed.", len(laws))
    return col


def query_laws(query: str, state: str, situation: str, n: int = 5) -> list[dict]:
    """
    Semantic search via ChromaDB + Vertex AI text-embedding-004.
    Falls back to keyword scoring if embeddings are unavailable.
    """
    try:
        col = build_vector_store()
        text = query.strip() or f"{situation.replace('_', ' ')} legal rights"
        results = col.query(
            query_texts=[text],
            n_results=min(n * 3, col.count()),
            where={"$and": [
                {"situation": {"$eq": situation}},
                {"state":     {"$in": [state, "federal"]}},
            ]},
        )
        by_id = {l["id"]: l for l in get_laws()}
        return [by_id[lid] for lid in results["ids"][0] if lid in by_id][:n]
    except Exception as exc:
        log.warning("Vector search failed (%s) — keyword fallback.", exc)
        return _keyword_fallback(query, state, situation, n)


def _keyword_fallback(query: str, state: str, situation: str, n: int) -> list[dict]:
    q = query.lower()
    scored = []
    for law in get_laws():
        if law["situation"] != situation:
            continue
        if law["state"] not in (state, "federal"):
            continue
        score = sum(2 for kw in law.get("keywords", []) if kw.lower() in q)
        score += 1 if law["state"] == state else 0
        scored.append({**law, "relevance_score": round(score / 10, 2)})
    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:n]
