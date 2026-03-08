"""
AI Law Coach - ChromaDB Builder
================================
Run this ONCE before the hackathon to build the vector database.

Setup:
    pip install chromadb sentence-transformers

Usage:
    python build_chromadb.py

This will create a ./law_coach_db folder with the ChromaDB persistent store.
"""

import json
import os
import chromadb
from chromadb.utils import embedding_functions

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
LAWS_FILE = "laws_data.json"
DB_PATH = "./law_coach_db"
COLLECTION_NAME = "laws"

# Using a local sentence-transformer model — no API key needed
# Switch to Google's text-embedding-004 at hackathon if you have the API key
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Fast, accurate, runs locally

def build_db():
    print("=" * 50)
    print("  AI Law Coach - ChromaDB Builder")
    print("=" * 50)

    # ── Load laws data ──────────────────────────
    print(f"\n[1/4] Loading laws from {LAWS_FILE}...")
    with open(LAWS_FILE, "r") as f:
        laws = json.load(f)
    print(f"      Loaded {len(laws)} law chunks")

    # ── Setup ChromaDB ──────────────────────────
    print(f"\n[2/4] Initializing ChromaDB at {DB_PATH}...")
    client = chromadb.PersistentClient(path=DB_PATH)

    # Use local sentence transformer for embeddings
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )

    # Delete existing collection if rebuilding
    try:
        client.delete_collection(COLLECTION_NAME)
        print("      Deleted existing collection (rebuilding fresh)")
    except:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"}  # cosine similarity for better semantic search
    )
    print(f"      Collection '{COLLECTION_NAME}' created")

    # ── Prepare data for insertion ──────────────
    print(f"\n[3/4] Preparing and embedding {len(laws)} chunks...")

    ids = []
    documents = []
    metadatas = []

    for law in laws:
        ids.append(law["id"])

        # The document text that gets embedded — rich context for semantic search
        # We combine content + actionable response + keywords for better retrieval
        doc_text = f"""
Title: {law['title']}
Law Reference: {law['law_reference']}
Content: {law['content']}
What to do: {law['actionable_response']}
Keywords: {', '.join(law['keywords'])}
        """.strip()

        documents.append(doc_text)

        # Metadata for filtering — this is the key to fast, accurate retrieval
        metadatas.append({
            "state": law["state"],
            "situation": law["situation"],
            "title": law["title"],
            "law_reference": law["law_reference"],
            "actionable_response": law["actionable_response"],
            "urgency": law["urgency"],
            "keywords": ", ".join(law["keywords"])
        })

    # ── Insert into ChromaDB ────────────────────
    print("\n[4/4] Inserting into ChromaDB (embedding generation may take ~30s)...")
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

    # ── Verify ──────────────────────────────────
    count = collection.count()
    print(f"\n✅ Done! {count} law chunks embedded and stored.")
    print(f"   Database location: {os.path.abspath(DB_PATH)}")
    print(f"\n   States covered: federal, NY, CA, TX, FL")
    print(f"   Situations covered: traffic_stop, arrest, search, interrogation, immigration")
    print(f"\n   Run query_test.py to verify the database works correctly.")


if __name__ == "__main__":
    build_db()
