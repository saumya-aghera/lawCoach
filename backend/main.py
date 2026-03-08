"""
LawAIer - FastAPI Backend v2
===================================
New in v2:
  POST /analyze-document  — Vision reads warrants, tickets, IDs
  POST /generate-report   — post-encounter legal PDF report

Uses Google Gemini via Vertex AI (google-genai SDK)

Run locally:
    uvicorn main:app --reload --port 8000
Deploy:
    gcloud builds submit --config ../cloudbuild.yaml .
"""

import os, json, base64, io
from datetime import datetime
from typing import Optional

from google import genai
from google.genai import types

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_RIGHT

app = FastAPI(title="LawAIer API", version="2.0.0")
_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]
_frontend_url = os.environ.get("FRONTEND_URL", "")
if _frontend_url:
    _CORS_ORIGINS.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.run\.app",   # allow any Cloud Run URL
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── CONFIG ────────────────────────────────────────────────────────────────
GEMINI_MODEL = "gemini-2.0-flash"

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
LOCATION   = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

# Vertex AI client — lazy-initialized so ADC credentials are resolved at call time
_genai_client: genai.Client | None = None

def get_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", PROJECT_ID)
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", LOCATION)
        _genai_client = genai.Client(vertexai=True, project=project, location=location)
    return _genai_client

# ── Laws DB (loaded once) ─────────────────────────────────────────────────
_laws_cache: list[dict] = []

def get_laws() -> list[dict]:
    global _laws_cache
    if not _laws_cache:
        with open("laws_data.json") as f:
            _laws_cache = json.load(f)
    return _laws_cache


# ── Pydantic models ───────────────────────────────────────────────────────
class PrepareRequest(BaseModel):
    situation: str
    state: str
    description: str

class AnalyzeRequest(BaseModel):
    spoken_text: str
    situation: str
    state: str
    description: str
    conversation_history: list[dict] = []
    user_lang: str = "en"          # e.g. "hi", "es", "fr" — "en" means English only session

class DocumentAnalysisRequest(BaseModel):
    image_base64: str
    media_type: str        # "image/jpeg" or "image/png"
    state: str
    situation: str
    description: str

class ReportRequest(BaseModel):
    situation: str
    state: str
    description: str
    transcript: list[dict]       # [{text, ts}]
    suggestions: list[dict]      # [{urgency, suggestion, law, trigger, time}]
    doc_findings: list[dict] = []
    duration_seconds: int = 0

class TranslateRequest(BaseModel):
    text: str
    target_lang: str  # e.g. "Spanish", "French"


# ── Law search (keyword-based, no local ML models needed) ─────────────────
def query_laws(query: str, state: str, situation: str, n: int = 5) -> list[dict]:
    """Keyword search over laws_data.json — lightweight, no torch/CUDA."""
    laws = get_laws()
    q = query.lower()
    scored = []
    for law in laws:
        if law["situation"] != situation: continue
        if law["state"] not in (state, "federal"): continue
        score = sum(2 for kw in law.get("keywords", []) if kw.lower() in q)
        score += 1 if law["state"] == state else 0
        scored.append({**law, "relevance_score": round(score / 10, 2)})
    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:n]

def build_system_prompt(laws, situation, state, description, user_lang: str = "en"):
    law_block = "\n\n".join([
        f"[LAW {i+1}] {l['title']}\nRef: {l['law_reference']}\n"
        f"Urgency: {l['urgency'].upper()}\nAdvise: {l['actionable_response']}"
        for i, l in enumerate(laws)
    ])

    lang_rules = ""
    if user_lang and user_lang != "en":
        lang_rules = f"""
MULTILINGUAL SESSION: The detained person speaks {user_lang}. Two speakers will be heard:
- OFFICER: speaks English (commands, asks for ID, states charges, "step out", "do you know why I stopped you", etc.)
- USER (detained person): speaks {user_lang}

Detection rules:
1. If the text is in English → speaker is "officer"
2. If the text is in {user_lang} → speaker is "you"
3. If mixed / unclear → use content to decide (authority/commands = officer, rights/responses = you)

Also provide "english_text": if the user spoke in {user_lang}, translate their words to English here.
If the officer spoke in English, set "english_text" to "".
"""

    return f"""You are a real-time AI legal rights coach.
SITUATION: {situation.replace('_',' ').title()} | STATE: {state}
CONTEXT: {description}

LAWS:
{law_block}
{lang_rules}
Output ONLY valid JSON — no markdown, no extra text:
{{"urgency":"red|yellow|green","suggestion":"1 sentence max","law":"law name","speaker":"officer|you","english_text":""}}
Nothing significant → {{"urgency":"green","suggestion":"","law":"","speaker":"officer","english_text":""}}"""


# ── Unified AI caller (Gemini / Vertex AI) ────────────────────────────────
async def call_ai(system: str, messages: list[dict], max_tokens: int = 1000,
                  image_base64: str = None, media_type: str = None) -> str:
    """
    Calls Gemini via Vertex AI using google-genai SDK.
    Matches the pattern used across all way-back-home solutions.
    """
    # Build the user text from the last message
    last_msg = messages[-1] if messages else {}
    user_text = last_msg.get("content", "") if isinstance(last_msg.get("content"), str) else ""

    config = types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=max_tokens,
    )

    if image_base64 and media_type:
        # Vision call — image/video bytes + text prompt
        image_part = types.Part.from_bytes(
            data=base64.b64decode(image_base64),
            mime_type=media_type,
        )
        text_part = types.Part.from_text(text=user_text or "Analyze this document.")
        contents = [types.Content(role="user", parts=[image_part, text_part])]
    else:
        # Text-only call — include conversation history
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("content", "")
            if isinstance(text, str):
                contents.append(
                    types.Content(role=role, parts=[types.Part.from_text(text=text)])
                )

    response = await get_client().aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )
    return response.text or ""


def _parse_json(raw: str, fallback: dict) -> dict:
    try:
        return json.loads(raw.replace("```json","").replace("```","").strip())
    except Exception:
        return fallback


# ── Points system ─────────────────────────────────────────────────────────
_points_db: dict = {}

def get_points_db() -> dict:
    global _points_db
    if not _points_db:
        with open("points_data.json") as f:
            _points_db = json.load(f)
    return _points_db

def calculate_points(state: str, violation_codes: list) -> dict:
    """
    Given a state and list of violation codes extracted from a ticket,
    looks up each code, sums total points, determines consequences.
    """
    db            = get_points_db()
    state_db      = db.get(state, db.get("federal", {}))
    meta          = state_db.get("meta", {})
    violations_db = state_db.get("violations", {})
    thresholds    = state_db.get("thresholds", [])

    breakdown    = []
    total_points = 0

    for code in violation_codes:
        code_clean = code.strip().lower().replace(" ", "")
        matched = None
        for k, v in violations_db.items():
            if k.lower().replace(" ", "") == code_clean:
                matched = (k, v)
                break

        if matched:
            k, v = matched
            pts = v.get("points", 0)
            total_points += pts
            breakdown.append({
                "code":        k,
                "name":        v["name"],
                "points":      pts,
                "fine_range":  v.get("fine_range", ""),
                "category":    v.get("category", "other"),
                "note":        v.get("note", ""),
                "found_in_db": True,
            })
        else:
            breakdown.append({
                "code":        code,
                "name":        f"Violation {code} — verify with DMV",
                "points":      0,
                "fine_range":  "unknown",
                "category":    "unknown",
                "note":        "Code not found in points database",
                "found_in_db": False,
            })

    triggered   = [t for t in thresholds if total_points >= t["points"]]
    worst       = triggered[-1] if triggered else None
    next_thresh = next((t for t in thresholds if t["points"] > total_points), None)
    susp        = meta.get("license_suspension_threshold")

    if worst:
        risk = worst["urgency"]
    elif total_points >= meta.get("surcharge_threshold", 999):
        risk = "yellow"
    elif total_points > 0:
        risk = "yellow"
    else:
        risk = "green"

    return {
        "state":                state,
        "state_name":           meta.get("name", state),
        "total_points":         total_points,
        "breakdown":            breakdown,
        "triggered_thresholds": triggered,
        "worst_consequence":    worst["consequence"] if worst else None,
        "next_threshold":       next_thresh,
        "points_to_suspension": max(0, susp - total_points) if susp else None,
        "suspension_threshold": susp,
        "risk":                 risk,
        "surcharge_info":       meta.get("surcharge_amount", ""),
        "points_duration":      meta.get("points_duration_years"),
        "state_notes":          meta.get("notes", ""),
        "contest_recommended":  total_points >= 4,
        "contest_reason": (
            f"These {total_points} points could trigger surcharges or suspension. "
            f"A traffic attorney may be able to negotiate a 0-point plea, "
            f"saving your license and preventing insurance premium increases."
        ) if total_points >= 4 else "",
    }


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/prepare")
def prepare(req: PrepareRequest):
    laws = query_laws(req.description, req.state, req.situation)
    return {"laws": laws}


@app.post("/translate")
async def translate_text(req: TranslateRequest):
    """Translate text to target language using Gemini."""
    system = (
        f"You are a precise, literal translator. "
        f"Translate the following text to {req.target_lang}. "
        f"Output ONLY the translated text — no explanations, no quotes."
    )
    msgs = [{"role": "user", "content": req.text}]
    result = await call_ai(system, msgs, max_tokens=400)
    return {"translated": result.strip()}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    # Use english_text for law search if user spoke in another language
    search_text = req.spoken_text
    laws   = query_laws(search_text, req.state, req.situation)
    system = build_system_prompt(laws, req.situation, req.state, req.description, req.user_lang)
    msgs   = req.conversation_history + [{"role":"user","content": f'Spoken: "{req.spoken_text}". JSON only.'}]
    raw    = await call_ai(system, msgs, max_tokens=300)
    result = _parse_json(raw, {"urgency":"green","suggestion":"","law":"","speaker":"officer","english_text":""})
    return {
        "urgency":      result.get("urgency", "green"),
        "suggestion":   result.get("suggestion", ""),
        "law":          result.get("law", ""),
        "speaker":      result.get("speaker", "officer"),
        "english_text": result.get("english_text", ""),
        "laws_used":    [l["title"] for l in laws[:2]],
    }


# ── Vision Document Analysis + Points Calculator ─────────────────────────
@app.post("/analyze-document")
async def analyze_document(req: DocumentAnalysisRequest):
    """
    User points camera at a warrant, ticket, summons, notice, or ID.
    - AI reads and extracts all violation codes
    - Points calculator looks up each code in state DMV database
    - Returns: document analysis + per-violation breakdown + total points + consequences
    """
    laws    = query_laws(req.description, req.state, req.situation)
    law_ctx = "\n".join([f"- {l['title']}: {l['actionable_response']}" for l in laws])

    system = f"""You are an expert legal document analyst specializing in traffic violations and warrants.
User situation: {req.situation.replace('_',' ')} in {req.state}.
Context: {req.description}

Relevant laws:
{law_ctx}

Analyze the document carefully. Extract ALL visible text including violation codes.
For traffic tickets specifically: extract EVERY violation/charge code listed.

Respond ONLY with this JSON (no markdown):
{{
  "document_type": "judicial_warrant|administrative_warrant|summons|traffic_ticket|notice|id_document|other",
  "summary": "1-2 sentence plain English summary of what this document is",
  "key_fields": {{
    "issued_by": "agency name",
    "issued_to": "person name if visible",
    "date": "date on document",
    "case_number": "ticket/case number",
    "charges_or_reason": "description of violation(s)",
    "amount_due": "fine amount if shown",
    "court_date": "appearance date if any",
    "vehicle": "plate/vehicle info if shown"
  }},
  "violation_codes": ["1180d", "1225c"],
  "urgency": "red|yellow|green",
  "findings": ["Key legal finding 1", "Key legal finding 2"],
  "actions": ["Specific action to take now", "Another action"],
  "laws": ["Applicable law"],
  "is_judicial_warrant": false,
  "requires_compliance": true,
  "recommended_next_step": "Single most important action"
}}

CRITICAL: violation_codes must be an array of the exact alphanumeric codes
from the ticket (e.g. ["1180d", "1225c"] for NY, ["22350", "23123"] for CA).
If no codes visible, return empty array [].
"""

    msgs = [{"role":"user","content":"Analyze this document and extract all violation codes."}]
    raw  = await call_ai(system, msgs, max_tokens=1200, image_base64=req.image_base64, media_type=req.media_type)

    result = _parse_json(raw, {
        "document_type": "unknown",
        "summary": "Could not parse document. Try a clearer image.",
        "key_fields": {},
        "violation_codes": [],
        "urgency": "yellow",
        "findings": ["Document could not be fully analyzed"],
        "actions":  ["Take a clearer photo and try again"],
        "laws": [],
        "is_judicial_warrant": False,
        "requires_compliance": False,
        "recommended_next_step": "Consult an attorney"
    })

    # ── Points calculation ────────────────────────────────────────────────
    # Only run for traffic tickets — not warrants, notices, etc.
    violation_codes = result.get("violation_codes", [])
    is_ticket = result.get("document_type") in ("traffic_ticket", "summons", "other")

    if violation_codes and is_ticket:
        points_result = calculate_points(req.state, violation_codes)
        result["points_analysis"] = points_result

        # Upgrade urgency if points are serious
        if points_result["risk"] == "red" and result.get("urgency") != "red":
            result["urgency"] = "red"
        elif points_result["risk"] == "yellow" and result.get("urgency") == "green":
            result["urgency"] = "yellow"

        # Add points summary to findings
        total = points_result["total_points"]
        susp  = points_result["suspension_threshold"]
        if total > 0:
            result["findings"].insert(0,
                f"POINTS: This ticket carries {total} DMV point(s) in {req.state}")
        if points_result["worst_consequence"]:
            result["findings"].insert(1,
                f"WARNING: {points_result['worst_consequence']}")
        if points_result["contest_recommended"]:
            result["actions"].append(points_result["contest_reason"])
    else:
        result["points_analysis"] = None

    return result


# ── NEW: Generate PDF Report ───────────────────────────────────────────────
@app.post("/generate-report")
async def generate_report(req: ReportRequest):
    """
    1. AI writes a structured legal assessment of the session
    2. ReportLab renders it as a professional PDF
    3. Returns PDF bytes for download
    """
    transcript_text  = "\n".join([f'[{t["ts"]}] "{t["text"]}"' for t in req.transcript])
    suggestions_text = "\n".join([
        f'[{s["urgency"].upper()}] {s["suggestion"]} (Law: {s["law"]}) — triggered by: "{s.get("trigger","")}"'
        for s in req.suggestions
    ])
    doc_text = "\n".join([
        f'Document: {d.get("document_type","?")} — {d.get("summary","")}'
        for d in req.doc_findings
    ]) or "No documents scanned."

    system = """You are a legal report writer. Write a post-encounter legal incident report.
Be factual, precise, and professional.
Respond ONLY with this JSON (no markdown):
{
  "incident_summary": "2-3 sentences",
  "rights_assessment": "Were rights respected?",
  "critical_moments": ["moment 1", "moment 2"],
  "laws_invoked": ["law 1", "law 2"],
  "potential_violations": ["violation 1 if any"],
  "recommended_actions": ["action 1", "action 2", "action 3"],
  "attorney_notes": "Key points an attorney should know",
  "risk_level": "low|medium|high",
  "follow_up_required": true
}"""

    msgs = [{"role":"user","content": f"""Situation: {req.situation.replace('_',' ').title()} | State: {req.state}
Description: {req.description}
Duration: {req.duration_seconds//60}m {req.duration_seconds%60}s
Date: {datetime.now().strftime('%B %d, %Y %I:%M %p')}

TRANSCRIPT:
{transcript_text or 'None recorded.'}

AI SUGGESTIONS:
{suggestions_text or 'None triggered.'}

DOCUMENTS:
{doc_text}

Write the report JSON."""}]

    raw        = await call_ai(system, msgs, max_tokens=1500)
    assessment = _parse_json(raw, {
        "incident_summary":    f"Encounter on {datetime.now().strftime('%B %d, %Y')}.",
        "rights_assessment":   "Unable to assess — consult an attorney.",
        "critical_moments":    [],
        "laws_invoked":        [s["law"] for s in req.suggestions if s.get("law")],
        "potential_violations":[],
        "recommended_actions": ["Consult a licensed attorney","Document all details while memory is fresh"],
        "attorney_notes":      "Session data available. Review transcript.",
        "risk_level":          "medium",
        "follow_up_required":  True
    })

    pdf_bytes = _build_pdf(req, assessment)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition":
            f'attachment; filename="lawaier-{datetime.now().strftime("%Y%m%d-%H%M")}.pdf"'}
    )


def _build_pdf(req: ReportRequest, assessment: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch)

    # Colors
    BLACK    = colors.HexColor("#0a0a0a")
    DGRAY    = colors.HexColor("#1a1a2e")
    MGRAY    = colors.HexColor("#6b7280")
    LBKG     = colors.HexColor("#f8f9fa")
    ACCENT   = colors.HexColor("#2563eb")
    ACCBKG   = colors.HexColor("#eff6ff")
    RED      = colors.HexColor("#dc2626")
    YELLOW   = colors.HexColor("#d97706")
    GREEN    = colors.HexColor("#16a34a")
    RISK_C   = {"low": GREEN, "medium": YELLOW, "high": RED}
    URG_C    = {"red": RED, "yellow": YELLOW, "green": GREEN}

    def S(name, **kw): return ParagraphStyle(name, **kw)

    BODY      = S("b",  fontSize=9,  fontName="Helvetica",       textColor=BLACK,  spaceAfter=4,  leading=13)
    BOLD      = S("bb", fontSize=9,  fontName="Helvetica-Bold",  textColor=BLACK,  spaceAfter=4)
    SMALL     = S("sm", fontSize=8,  fontName="Helvetica",       textColor=MGRAY,  spaceAfter=2)
    SECTION   = S("sc", fontSize=11, fontName="Helvetica-Bold",  textColor=ACCENT, spaceBefore=12, spaceAfter=5)
    BULLET    = S("bu", fontSize=9,  fontName="Helvetica",       textColor=BLACK,  spaceAfter=3, leftIndent=10, leading=13)
    DISCLAIM  = S("di", fontSize=7.5,fontName="Helvetica-Oblique",textColor=MGRAY, leading=11)
    HEADER    = S("hd", fontSize=22, fontName="Helvetica-Bold",  textColor=BLACK,  spaceAfter=2)
    SUBHDR    = S("sh", fontSize=10, fontName="Helvetica",       textColor=MGRAY,  spaceAfter=4)

    story = []
    risk   = assessment.get("risk_level","medium")
    rc     = RISK_C.get(risk, YELLOW)
    now    = datetime.now()

    # Header
    ht = Table([[
        Paragraph("⚖ LAWAIER AI", HEADER),
        Paragraph(f'<font color="#{rc.hexval()[2:]}">● {risk.upper()} RISK</font>',
                  S("r", fontSize=13, fontName="Helvetica-Bold", textColor=rc, alignment=TA_RIGHT))
    ]], colWidths=[4.5*inch, 2.5*inch])
    ht.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
    story += [ht, Paragraph("POST-ENCOUNTER LEGAL INCIDENT REPORT", SUBHDR),
              HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=10)]

    # Meta
    meta = Table([
        [Paragraph("Date",BOLD), Paragraph(now.strftime("%B %d, %Y"),BODY),
         Paragraph("Time",BOLD), Paragraph(now.strftime("%I:%M %p"),BODY)],
        [Paragraph("Situation",BOLD), Paragraph(req.situation.replace("_"," ").title(),BODY),
         Paragraph("State",BOLD),     Paragraph(req.state,BODY)],
        [Paragraph("Duration",BOLD),  Paragraph(f"{req.duration_seconds//60}m {req.duration_seconds%60}s",BODY),
         Paragraph("Follow-up",BOLD), Paragraph("YES" if assessment.get("follow_up_required") else "NO",BODY)],
    ], colWidths=[1.2*inch,2.3*inch,1.5*inch,2*inch])
    meta.setStyle(TableStyle([
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[LBKG,colors.white]),
        ("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#e5e7eb")),
        ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),
    ]))
    story += [meta, Spacer(1,8)]

    # Sections helper
    def section(title, items, style=BULLET, prefix="•"):
        if not items: return
        story.append(Paragraph(title, SECTION))
        for item in items:
            story.append(Paragraph(f"{prefix} {item}", style))

    story.append(Paragraph("USER'S DESCRIPTION", SECTION))
    story.append(Paragraph(req.description or "No description provided.", BODY))
    story.append(Paragraph("INCIDENT SUMMARY", SECTION))
    story.append(Paragraph(assessment.get("incident_summary",""), BODY))
    story.append(Paragraph("RIGHTS ASSESSMENT", SECTION))
    story.append(Paragraph(assessment.get("rights_assessment",""), BODY))

    # Suggestions timeline
    if req.suggestions:
        story.append(Paragraph("AI COACHING TIMELINE", SECTION))
        rows = [["Time","Level","Guidance","Legal Basis"]]
        for s in req.suggestions:
            uc = URG_C.get(s.get("urgency","green"), GREEN)
            rows.append([
                Paragraph(s.get("time",""), SMALL),
                Paragraph(f'<font color="#{uc.hexval()[2:]}">{s.get("urgency","").upper()}</font>',
                          S("ul",fontSize=8,fontName="Helvetica-Bold",textColor=uc)),
                Paragraph(s.get("suggestion",""), BODY),
                Paragraph(s.get("law",""), SMALL),
            ])
        t = Table(rows, colWidths=[0.6*inch,0.65*inch,3.8*inch,1.9*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),DGRAY),("TEXTCOLOR",(0,0),(-1,0),colors.white),
            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),8),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,LBKG]),
            ("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#e5e7eb")),
            ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
            ("LEFTPADDING",(0,0),(-1,-1),6),("VALIGN",(0,0),(-1,-1),"TOP"),
        ]))
        story += [t, Spacer(1,6)]

    # Document findings
    if req.doc_findings:
        story.append(Paragraph("DOCUMENTS SCANNED", SECTION))
        for d in req.doc_findings:
            uc = URG_C.get(d.get("urgency","yellow"), YELLOW)
            box = Table([[
                Paragraph(f'<b>{d.get("document_type","Document").upper()}</b>', BOLD),
                Paragraph(f'<font color="#{uc.hexval()[2:]}">{d.get("urgency","").upper()}</font>',
                          S("du",fontSize=9,fontName="Helvetica-Bold",textColor=uc,alignment=TA_RIGHT))
            ]], colWidths=[5*inch,2*inch])
            box.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LBKG),
                ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),8)]))
            story.append(box)
            story.append(Paragraph(d.get("summary",""), BODY))
            for f in d.get("findings",[]):
                story.append(Paragraph(f"• {f}", BULLET))
            story.append(Spacer(1,6))

    section("CRITICAL MOMENTS",       assessment.get("critical_moments",[]))
    section("LAWS & RIGHTS REFERENCED", assessment.get("laws_invoked",[]))

    violations = assessment.get("potential_violations",[])
    if violations:
        story.append(Paragraph("POTENTIAL RIGHTS VIOLATIONS", SECTION))
        for v in violations:
            story.append(Paragraph(f"⚠ {v}", S("v",fontSize=9,fontName="Helvetica-Bold",
                textColor=RED,spaceAfter=3,leftIndent=8)))

    section("RECOMMENDED NEXT STEPS", assessment.get("recommended_actions",[]),
            style=BULLET, prefix="→")

    atty = assessment.get("attorney_notes","")
    if atty:
        story.append(Paragraph("NOTES FOR ATTORNEY", SECTION))
        atb = Table([[Paragraph(atty, BODY)]], colWidths=[7*inch])
        atb.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),ACCBKG),
            ("LINEBEFORE",(0,0),(0,-1),3,ACCENT),
            ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),("LEFTPADDING",(0,0),(-1,-1),12)]))
        story.append(atb)

    if req.transcript:
        story.append(Paragraph("FULL TRANSCRIPT", SECTION))
        for t in req.transcript:
            story.append(Paragraph(
                f'<font color="#9ca3af">[{t.get("ts","")}]</font>  "{t.get("text","")}"', SMALL))

    story += [Spacer(1,14), HRFlowable(width="100%",thickness=0.5,color=MGRAY,spaceAfter=5),
              Paragraph(f"LEGAL DISCLAIMER: This report is generated by LawAIer for informational purposes only. "
                        f"It does not constitute legal advice. Always consult a licensed attorney. "
                        f"Generated: {now.strftime('%B %d, %Y at %I:%M %p')} | LawAIer v2.0", DISCLAIM)]

    doc.build(story)
    return buf.getvalue()



# ── NEW: Video Analysis ────────────────────────────────────────────────────
class VideoAnalysisRequest(BaseModel):
    video_base64: str
    media_type:   str        # "video/mp4", "video/quicktime", etc.
    state:        str
    situation:    str
    description:  str

@app.post("/analyze-video")
async def analyze_video(req: VideoAnalysisRequest):
    """
    User uploads dashcam or CCTV footage.
    AI watches the full video and returns:
      - Timeline of events with timestamps
      - Rights violations detected
      - Officer conduct assessment
      - Evidence strength rating
      - Key observations
      - Recommended actions

    PRE-HACKATHON: Claude vision (supports video via base64)
    Gemini natively handles video — full native video understanding with timestamps
    """
    laws    = query_laws(req.description, req.state, req.situation)
    law_ctx = "\n".join([f"- {l['title']}: {l['actionable_response']}" for l in laws])

    footage_hints = {
        "traffic_stop":  "dashcam footage of a traffic stop",
        "arrest":        "video footage of an arrest",
        "search":        "video footage of a search of property or person",
        "immigration":   "video footage of an immigration enforcement encounter",
        "interrogation": "video footage of a police interrogation or questioning",
    }
    footage_type = footage_hints.get(req.situation, "footage of a law enforcement encounter")

    system = f"""You are an expert legal video analyst reviewing {footage_type}.
User situation: {req.situation.replace('_', ' ')} in {req.state}.
Context: {req.description}

Relevant laws:
{law_ctx}

Watch the entire video carefully. Analyze for:
1. Sequence of events with approximate timestamps
2. Any potential rights violations
3. Officer conduct and procedure compliance
4. Evidence value for legal proceedings
5. Key visual details (badge numbers, witness presence, use of force)

Respond ONLY with this JSON (no markdown):
{{
  "footage_type": "Dashcam Footage|CCTV Footage|Phone Recording|Other",
  "summary": "2-3 sentence overview of what the video shows",
  "duration": "approximate duration if determinable",
  "urgency": "red|yellow|green",
  "timeline": [
    {{"timestamp": "0:00", "event": "description of what happens", "significant": true}},
    {{"timestamp": "0:15", "event": "description", "significant": false}}
  ],
  "violations_detected": [
    "Specific potential rights violation observed"
  ],
  "officer_conduct": "Assessment of whether officer followed proper procedure",
  "evidence_strength": "Strong|Moderate|Weak — brief reason",
  "key_observations": [
    "Badge number visible: XXX",
    "Two officers present",
    "Subject was compliant throughout"
  ],
  "recommended_actions": [
    "Preserve this footage — do not delete",
    "Specific legal action to take"
  ],
  "recommended_next_step": "Single most important action to take with this footage"
}}"""

    msgs = [{"role":"user","content":"Please analyze this video footage of the encounter."}]

    # Gemini natively handles video/mp4 — pass base64 bytes with correct mime_type
    raw = await call_ai(system, msgs, max_tokens=1500,
                        image_base64=req.video_base64, media_type=req.media_type)

    return _parse_json(raw, {
        "footage_type": "Video Footage",
        "summary": "Video could not be fully analyzed. Ensure the file is a clear, supported format (MP4, MOV).",
        "duration": "Unknown",
        "urgency": "yellow",
        "timeline": [],
        "violations_detected": [],
        "officer_conduct": "Could not assess — try a clearer or shorter video clip.",
        "evidence_strength": "Unknown",
        "key_observations": ["Video analysis incomplete — try again with a shorter clip"],
        "recommended_actions": ["Preserve the original footage", "Consult an attorney"],
        "recommended_next_step": "Consult a licensed attorney and provide them the original footage"
    })

@app.get("/laws")
def list_laws(state: Optional[str] = None, situation: Optional[str] = None):
    with open("laws_data.json") as f: laws = json.load(f)
    if state:     laws = [l for l in laws if l["state"] in (state,"federal")]
    if situation: laws = [l for l in laws if l["situation"] == situation]
    return {"count": len(laws), "laws": laws}


# ── Serve React frontend (local dev + single-port deployment) ─────────────────
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.isdir(_FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
