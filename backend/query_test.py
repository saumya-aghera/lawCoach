"""
AI Law Coach - RAG Query Tester
================================
Run this AFTER build_chromadb.py to verify the pipeline works.

Usage:
    python query_test.py

Tests real queries to make sure retrieval is accurate.
"""

import chromadb
from chromadb.utils import embedding_functions

DB_PATH = "./law_coach_db"
COLLECTION_NAME = "laws"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

def query_laws(
    query: str,
    state: str = None,
    situation: str = None,
    n_results: int = 3
):
    """
    Core RAG query function used by the app.

    Args:
        query:     What the user said / what's happening in the conversation
        state:     e.g. "NY", "CA", "TX", "FL", "federal"
        situation: e.g. "traffic_stop", "arrest", "search", "immigration", "interrogation"
        n_results: How many law chunks to return

    Returns:
        List of relevant law chunks with metadata
    """
    client = chromadb.PersistentClient(path=DB_PATH)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )
    collection = client.get_collection(COLLECTION_NAME, embedding_function=ef)

    # Build metadata filter
    # This is the key optimization — filter BEFORE semantic search
    where_filter = {}

    if state and situation:
        # Filter by both state + situation (most precise)
        # Also include federal laws always
        where_filter = {
            "$or": [
                {"$and": [{"state": {"$eq": state}}, {"situation": {"$eq": situation}}]},
                {"$and": [{"state": {"$eq": "federal"}}, {"situation": {"$eq": situation}}]},
                {"state": {"$eq": "federal"}}  # Always include universal federal rights
            ]
        }
    elif state:
        where_filter = {
            "$or": [
                {"state": {"$eq": state}},
                {"state": {"$eq": "federal"}}
            ]
        }
    elif situation:
        where_filter = {"situation": {"$eq": situation}}

    # Run semantic search with metadata pre-filter
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where=where_filter if where_filter else None,
        include=["documents", "metadatas", "distances"]
    )

    # Format results
    output = []
    for i in range(len(results["ids"][0])):
        output.append({
            "id": results["ids"][0][i],
            "title": results["metadatas"][0][i]["title"],
            "law_reference": results["metadatas"][0][i]["law_reference"],
            "actionable_response": results["metadatas"][0][i]["actionable_response"],
            "urgency": results["metadatas"][0][i]["urgency"],
            "state": results["metadatas"][0][i]["state"],
            "situation": results["metadatas"][0][i]["situation"],
            "relevance_score": round(1 - results["distances"][0][i], 3),  # cosine similarity
            "full_content": results["documents"][0][i]
        })

    return output


def format_for_gemini_prompt(results: list) -> str:
    """
    Formats retrieved law chunks into a clean context block
    to inject into Gemini's system prompt.
    """
    if not results:
        return "No specific laws found for this situation."

    prompt_block = "RELEVANT LAWS AND RIGHTS FOR THIS SITUATION:\n"
    prompt_block += "=" * 50 + "\n\n"

    for i, r in enumerate(results, 1):
        prompt_block += f"[LAW {i}] {r['title']}\n"
        prompt_block += f"Reference: {r['law_reference']}\n"
        prompt_block += f"Urgency: {r['urgency'].upper()}\n"
        prompt_block += f"What to advise: {r['actionable_response']}\n"
        prompt_block += f"Relevance: {r['relevance_score']}\n"
        prompt_block += "-" * 30 + "\n\n"

    return prompt_block


def run_tests():
    print("=" * 60)
    print("  AI Law Coach - RAG Pipeline Test")
    print("=" * 60)

    test_cases = [
        {
            "name": "NY Traffic Stop - Officer asks to search car",
            "query": "can I search your vehicle sir",
            "state": "NY",
            "situation": "traffic_stop"
        },
        {
            "name": "CA Arrest - Officer says you're under arrest",
            "query": "you are under arrest put your hands behind your back",
            "state": "CA",
            "situation": "arrest"
        },
        {
            "name": "TX Immigration - Asked about status",
            "query": "are you a US citizen where were you born",
            "state": "TX",
            "situation": "immigration"
        },
        {
            "name": "FL Search - Officer wants to frisk",
            "query": "I need to pat you down can I check your bag",
            "state": "FL",
            "situation": "search"
        },
        {
            "name": "Federal - Am I free to go",
            "query": "just wait here for a minute I need to ask you some questions",
            "state": "federal",
            "situation": "traffic_stop"
        }
    ]

    for test in test_cases:
        print(f"\n{'='*60}")
        print(f"TEST: {test['name']}")
        print(f"Query: \"{test['query']}\"")
        print(f"State: {test['state']} | Situation: {test['situation']}")
        print("-" * 60)

        results = query_laws(
            query=test["query"],
            state=test["state"],
            situation=test["situation"],
            n_results=2
        )

        for r in results:
            urgency_emoji = {"red": "🔴", "yellow": "🟡", "green": "🟢"}.get(r["urgency"], "⚪")
            print(f"\n{urgency_emoji} [{r['urgency'].upper()}] {r['title']}")
            print(f"   Reference: {r['law_reference']}")
            print(f"   → {r['actionable_response']}")
            print(f"   Relevance: {r['relevance_score']}")

    print(f"\n{'='*60}")
    print("✅ All tests complete!")
    print("\nGemini System Prompt Preview (for first test case):")
    print("-" * 60)
    first_results = query_laws("can I search your vehicle", "NY", "traffic_stop", n_results=3)
    print(format_for_gemini_prompt(first_results))


if __name__ == "__main__":
    run_tests()
