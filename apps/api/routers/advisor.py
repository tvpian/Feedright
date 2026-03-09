"""AI Coach router — streams LLM-generated nutritional advice via Ollama."""
from __future__ import annotations

import json
import os
from datetime import date as date_type, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import LogEntryDB, UserDB, get_db
from .logs import _compute_totals
from .targets import _row_to_profile
from nutrition_core.analysis.engine import analyze_gaps
from nutrition_core.targets.engine import compute_targets

router = APIRouter()

OLLAMA_BASE  = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL",     "llama3")

# ── Label maps (avoids importing from the TS layer) ──────────────────────────

_GOAL_LABELS = {
    "fat_loss": "Fat Loss", "muscle_gain": "Muscle Gain", "maintenance": "Maintenance",
    "longevity": "Longevity", "skin_health": "Youthful Skin", "hair_health": "Hair Health",
    "high_energy": "High Energy", "immunity": "Immunity", "gut_health": "Gut Health",
    "bone_health": "Bone Health", "heart_health": "Heart Health", "brain_health": "Brain Health",
    "recovery": "Recovery", "better_sleep": "Better Sleep", "mood_balance": "Mood Balance",
    "stress_management": "Stress Management", "focus": "Focus",
}

_CONDITION_LABELS = {
    "diabetes_type2": "Type 2 Diabetes", "diabetes_type1": "Type 1 Diabetes",
    "prediabetes": "Pre-diabetes", "pcos": "PCOS", "hypothyroid": "Hypothyroid",
    "hyperthyroid": "Hyperthyroid", "high_bp": "High Blood Pressure",
    "high_cholesterol": "High Cholesterol", "iron_deficiency": "Iron Deficiency",
    "vitamin_d_deficiency": "Vitamin D Deficiency", "b12_deficiency": "B12 Deficiency",
    "anemia": "Anemia", "osteoporosis": "Osteoporosis", "fatty_liver": "Fatty Liver",
    "kidney_stones": "Kidney Stones",
}

_NUTRIENT_LABELS = {
    "calories": "Calories (kcal)", "protein": "Protein (g)", "fat": "Fat (g)",
    "carbs": "Carbs (g)", "fiber": "Fiber (g)", "sugar": "Sugar (g)",
    "omega3": "Omega-3 (g)", "caffeine": "Caffeine (mg)", "magnesium": "Magnesium (mg)",
    "potassium": "Potassium (mg)", "zinc": "Zinc (mg)", "iron": "Iron (mg)",
    "calcium": "Calcium (mg)", "selenium": "Selenium (µg)", "iodine": "Iodine (µg)",
    "choline": "Choline (mg)", "vitamin_d": "Vitamin D (µg)", "vitamin_b12": "Vitamin B12 (µg)",
    "biotin": "Biotin (µg)", "folate": "Folate (µg)", "vitamin_c": "Vitamin C (mg)",
    "vitamin_a": "Vitamin A (µg)", "vitamin_e": "Vitamin E (mg)", "vitamin_k": "Vitamin K (µg)",
    "vitamin_b1": "Thiamine B1 (mg)", "vitamin_b2": "Riboflavin B2 (mg)",
    "vitamin_b3": "Niacin B3 (mg)", "vitamin_b5": "Pant. Acid B5 (mg)",
    "vitamin_b6": "Vitamin B6 (mg)", "copper": "Copper (mg)", "manganese": "Manganese (mg)",
    "chromium": "Chromium (µg)", "phosphorus": "Phosphorus (mg)",
    "sodium": "Sodium (mg)", "saturated_fat": "Saturated Fat (g)",
}


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_system_prompt(row: UserDB, gap_analysis, targets, totals: dict) -> str:
    goals      = json.loads(row.health_goals      or "[]")
    conditions = json.loads(row.health_conditions or "[]")
    supps      = json.loads(row.supplements_json  or "[]")

    goals_str      = ", ".join(_GOAL_LABELS.get(g, g)      for g in goals)      or "None specified"
    conditions_str = ", ".join(_CONDITION_LABELS.get(c, c) for c in conditions) or "None"
    supps_str      = ", ".join(s.get("name", "")            for s in supps)      or "None"

    # Include all non-trivial gaps (critical, low, close) — up to 15
    urgent = [g for g in gap_analysis.sorted_by_urgency()
              if g.status in ("critical", "low", "close")][:15]

    gap_lines = []
    for g in urgent:
        label = _NUTRIENT_LABELS.get(g.key, g.key)
        kind  = "LIMIT — keep under target" if g.is_limit else "need more"
        gap_lines.append(
            f"  • {label}: {g.consumed:.1f} consumed / {g.target:.1f} target "
            f"({g.percent_complete:.0f}%) [{g.status.upper()}] — {kind}"
        )

    met = [g for g in gap_analysis.sorted_by_urgency() if g.status == "complete"]
    met_str = ", ".join(_NUTRIENT_LABELS.get(g.key, g.key) for g in met[:6]) or "none yet"

    gap_block = "\n".join(gap_lines) if gap_lines else "  • All tracked nutrients are on track today — great work!"

    today_str = datetime.now().strftime("%A %B %d")

    return f"""You are an expert clinical nutritionist AI inside NutriTrack, a precision nutrition app. Your role is to give this specific user personalised, actionable coaching based on their goals, health conditions, and today's nutritional data.

## User Profile — {row.name}
- Age: {int(row.age)} | Sex: {row.sex} | Weight: {row.weight_kg}kg | Height: {row.height_cm}cm
- Activity level: {row.activity_level.replace("_", " ")}
- Health goals: {goals_str}
- Health conditions: {conditions_str}
- Current supplements: {supps_str}

## Today's Nutrient Status ({today_str})
### Gaps requiring attention:
{gap_block}

### Already met today: {met_str}

## Response format
Structure your response EXACTLY like this (use ** for section headers):

**What you're missing most:**
- [Nutrient]: [Why it specifically matters for their goals/conditions] — [X]% of target consumed
(2-3 bullets, prioritise by urgency AND relevance to their goals)

**Eat this today:**
- [Food + portion]: covers [nutrient(s)] — [brief note on why it's practical]
(2-3 foods; choose common, accessible options; prefer foods that cover multiple gaps at once)

**Consider supplementing:**
- [Supplement + dose] — only if diet alone realistically can't cover this gap
(1-2 max; say "No supplements needed today" if diet can cover it)

**Coach's insight:**
[1-2 sentences: a specific pattern, risk, or win you see in their data today — tie it to their exact goals/conditions]

Rules:
- Be specific — name exact nutrients, foods, and doses
- Personalise every point to their stated goals and conditions
- Be concise — no padding, no preamble, no "great question!"
- If a condition changes the recommendation (e.g. kidney stones limits phosphorus), say so"""


# ── Streaming endpoint ────────────────────────────────────────────────────────

@router.post("/{user_id}/coach")
async def coach_stream(
    user_id: str,
    date: str = Query(default=None, description="ISO date, defaults to today"),
    question: str = Query(default=None, description="Optional custom question"),
    db: Session = Depends(get_db),
):
    """Stream personalised nutritional coaching from Ollama llama3."""
    row = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not row:
        raise HTTPException(404, f"User {user_id} not found")

    profile = _row_to_profile(row)
    targets = compute_targets(profile)

    log_date = date or date_type.today().isoformat()
    entries = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == log_date)
        .all()
    )
    totals = _compute_totals(entries, db)
    gap_analysis = analyze_gaps(totals, targets)

    system_prompt = _build_system_prompt(row, gap_analysis, targets, totals)
    user_msg = (
        question or
        "Based on my goals and today's intake, what should I prioritise eating "
        "and do I need any supplements?"
    )

    async def stream_tokens():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE}/api/chat",
                    json={
                        "model": OLLAMA_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user",   "content": user_msg},
                        ],
                        "stream": True,
                        "options": {"temperature": 0.35, "top_p": 0.9, "num_predict": 600},
                    },
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            if token:
                                yield token
                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield "\n\n[Error: Cannot connect to Ollama. Make sure it is running on port 11434.]"
        except httpx.TimeoutException:
            yield "\n\n[Error: Ollama timed out. The model may be loading — try again in a moment.]"

    return StreamingResponse(
        stream_tokens(),
        media_type="text/plain; charset=utf-8",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control":     "no-cache, no-store",
            "Connection":        "keep-alive",
        },
    )
