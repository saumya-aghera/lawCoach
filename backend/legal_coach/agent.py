"""
legal_coach/agent.py — ADK Agent definition
============================================
The root_agent is imported by main.py and handed to the ADK Runner.

Tools are executed server-side by the ADK framework.  The model receives
audio from the client via LiveRequestQueue, calls search_laws when it needs
legal context, and responds with structured JSON text that main.py parses
and forwards to the browser as { type:"analysis", ... }.
"""

import sys, os
# Allow importing laws_db from the parent backend directory
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from google.adk.agents import Agent
from laws_db import query_laws


# ── Tool definitions ──────────────────────────────────────────────────────

def search_laws(query: str, situation: str, state_code: str) -> dict:
    """
    Search the semantic law database for statutes relevant to what was just spoken.

    Call this tool whenever you transcribe a non-trivial utterance so you can
    ground your coaching suggestion in actual law.

    Args:
        query:      The verbatim transcribed text to search against.
        situation:  The encounter type — one of: traffic_stop, arrest, search,
                    immigration, interrogation.
        state_code: Two-letter state abbreviation or "Federal".

    Returns:
        A dict with a "laws" list, each entry containing title, law_reference,
        urgency (red/yellow/green), and actionable_response.
    """
    laws = query_laws(query=query, state=state_code, situation=situation, n=5)
    return {
        "laws": [
            {
                "title":     l["title"],
                "reference": l["law_reference"],
                "urgency":   l["urgency"],
                "advice":    l["actionable_response"],
            }
            for l in laws
        ]
    }


# ── System instruction ────────────────────────────────────────────────────

_INSTRUCTION = """You are a real-time AI legal rights coach embedded in a mobile app used
during live law enforcement encounters (traffic stops, arrests, searches,
immigration checks, interrogations).

═══════════════════════════════════════════════════════
SESSION SETUP
═══════════════════════════════════════════════════════
The very first message you receive will be a JSON object:
  { "situation": "...", "state_code": "...", "user_lang": "..." }

Store these values — you will use them for the entire session.
  situation  — encounter type (traffic_stop | arrest | search | immigration | interrogation)
  state_code — jurisdiction  (NY | CA | TX | FL | Federal)
  user_lang  — the detained person's language BCP-47 prefix (e.g. "en", "hi", "es", "ar")
               "en" means English-only session.

═══════════════════════════════════════════════════════
FOR EVERY AUDIO INPUT
═══════════════════════════════════════════════════════
STEP 1 — Transcribe what was said verbatim.

STEP 2 — Detect the speaker:
  "officer" → commanding tone, authority, requests for ID/documents, stating charges,
               giving orders ("step out", "license and registration", "do you know why
               I stopped you?", "I'm placing you under arrest")
  "you"     → detained person — quieter, hesitant, asking about rights, responding
  ""        → silence or background noise only

STEP 3 — Multilingual (only when user_lang ≠ "en"):
  If speaker is "officer" (English):
    Translate their words to user_lang → put in "translated_for_user"
  If speaker is "you" (native language):
    Translate their words to English  → put in "english_text"

STEP 4 — Call search_laws(query=<transcribed text>, situation=<stored>, state_code=<stored>)
  Use the returned laws to ground your coaching suggestion in actual statutes.
  Only skip this call if the audio was silent/noise (speaker == "").

STEP 5 — Compose your response.
  Urgency rules:
    red    → immediate rights violation, illegal conduct, must act NOW
    yellow → caution, rights are at stake, user should know their options
    green  → routine exchange, no immediate concern

═══════════════════════════════════════════════════════
OUTPUT FORMAT — STRICT
═══════════════════════════════════════════════════════
Respond with ONLY this JSON (no markdown fences, no extra text):

{"transcribed":"exact words spoken","speaker":"officer|you|","english_text":"","translated_for_user":"","urgency":"red|yellow|green","suggestion":"one actionable sentence max","law":"case name or statute"}

If audio is silent / noise only:
{"transcribed":"","speaker":"","english_text":"","translated_for_user":"","urgency":"green","suggestion":"","law":""}
"""


# ── Agent ─────────────────────────────────────────────────────────────────

root_agent = Agent(
    # gemini-2.0-flash-live-001 supports the Gemini Live API (audio input).
    # We force TEXT response modality in the RunConfig inside main.py so the
    # model returns structured JSON text rather than audio output.
    model="gemini-2.0-flash-live-001",
    name="legal_coach",
    instruction=_INSTRUCTION,
    tools=[search_laws],
)
