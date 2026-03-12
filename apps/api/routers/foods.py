"""Foods router — search, create custom foods, get by id, USDA FoodData Central import."""
from __future__ import annotations

import json
import os
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..converters import food_db_to_schema
from ..database import FoodDB, get_db
from ..schemas import FoodCreate, FoodOut
from nutrition_core.constants import empty_nutrients

router = APIRouter()

# ── USDA FoodData Central helpers ─────────────────────────────────────────────
# Free API — DEMO_KEY: ~1 000 req/hr per IP.
# Register a personal key at https://fdc.nal.usda.gov/api-key-signup.html and
# set USDA_API_KEY env var to remove rate-limit concerns.

_FDC_BASE    = "https://api.nal.usda.gov/fdc/v1"
_FDC_API_KEY = os.getenv("USDA_API_KEY", "DEMO_KEY")

# USDA nutrient ID → (our_key, multiply_factor)
# All values in the FDC search response are already per 100 g for
# Foundation / SR Legacy / FNDDS.  Branded foods may be per serving —
# we normalise those in _fdc_to_foodout().
_NID_MAP: dict[int, tuple[str, float]] = {
    1008: ("calories",      1.0),   # kcal
    1003: ("protein",       1.0),   # g
    1004: ("fat",           1.0),   # g
    1005: ("carbs",         1.0),   # g
    1079: ("fiber",         1.0),   # g
    2000: ("sugar",         1.0),   # g  (total sugars)
    1258: ("saturated_fat", 1.0),   # g
    1093: ("sodium",        1.0),   # mg
    1404: ("omega3",        1000.0),# g → mg (ALA)
    1057: ("caffeine",      1.0),   # mg
    1089: ("iron",          1.0),   # mg
    1087: ("calcium",       1.0),   # mg
    1092: ("potassium",     1.0),   # mg
    1090: ("magnesium",     1.0),   # mg
    1095: ("zinc",          1.0),   # mg
    1101: ("selenium",      1.0),   # µg
    1100: ("iodine",        1.0),   # µg
    1107: ("choline",       1.0),   # mg
    1106: ("vitamin_a",     1.0),   # µg RAE
    1162: ("vitamin_c",     1.0),   # mg
    1114: ("vitamin_d",     1.0),   # µg
    1109: ("vitamin_e",     1.0),   # mg
    1185: ("vitamin_k",     1.0),   # µg
    1178: ("vitamin_b12",   1.0),   # µg
    1173: ("vitamin_b1",    1.0),   # mg
    1174: ("vitamin_b2",    1.0),   # mg
    1175: ("vitamin_b3",    1.0),   # mg
    1180: ("vitamin_b5",    1.0),   # mg
    1166: ("vitamin_b6",    1.0),   # mg
    1177: ("folate",        1.0),   # µg
    1190: ("biotin",        1.0),   # µg
}

_FDC_CAT_MAP = [
    (["dairy", "egg", "milk", "cheese", "cream", "butter", "yogurt"], "dairy"),
    (["poultry", "beef", "pork", "lamb", "veal", "fish", "shellfish",
      "seafood", "meat", "game", "sausage", "bacon"],                 "protein"),
    (["vegetable", "legume", "bean", "lentil", "tofu"],               "vegetables"),
    (["fruit", "juice", "berry"],                                     "fruits"),
    (["grain", "baked", "cereal", "bread", "pasta", "rice", "oat",
      "flour", "cracker", "noodle"],                                  "grains"),
    (["beverage", "drink", "coffee", "tea", "soda", "water"],         "beverages"),
]

import re as _re

def _clean_household_unit(text: str) -> str:
    """Turn USDA householdServingFullText into a friendly unit label.

    Examples:
      '1 CHICKEN BREAST' → 'chicken breast'
      '5.5 ONZ'          → 'serving'
      '1 SLICE'          → 'slice'
      '2 TBSP'           → 'tbsp'
    """
    t = text.strip()
    # Strip leading number (e.g. '1 ', '5.5 ')
    t = _re.sub(r'^[\d.,/]+\s*', '', t).strip()
    if not t:
        return "serving"
    # Common USDA abbreviations that aren't useful as labels
    ignore = {"ONZ", "OZA", "OZ", "GRM", "GM", "G", "ML", "MLT"}
    if t.upper() in ignore:
        return "serving"
    # Common useful abbreviations → lowercase
    return t.lower()[:30]

def _fdc_category(raw: str) -> str:
    s = (raw or "").lower()
    for keywords, cat in _FDC_CAT_MAP:
        if any(k in s for k in keywords):
            return cat
    return "other"

def _fdc_to_foodout(item: dict, fdc_id: int) -> FoodOut:
    """Map a USDA FDC food item → FoodOut (values normalised to per 100 g)."""
    name = (item.get("description") or "Unknown").strip()[:120]
    if name.isupper():
        name = name.title()   # "CHEDDAR CHEESE" → "Cheddar Cheese"

    serving_size = float(item.get("servingSize") or 100.0)
    serving_unit = (item.get("servingSizeUnit") or "g").upper()
    # Only normalise branded foods where servingSize is in grams and ≠ 100
    normalize = (serving_unit == "G" and abs(serving_size - 100.0) > 0.5)

    nuts = empty_nutrients()
    for n in item.get("foodNutrients", []):
        nid = n.get("nutrientId") or (n.get("nutrient") or {}).get("id")
        val = float(n.get("value") or n.get("amount") or 0)
        if nid in _NID_MAP:
            key, factor = _NID_MAP[nid]
            if normalize and serving_size > 0:
                val = val * 100.0 / serving_size
            nuts[key] = round(val * factor, 3)

    cat_raw = item.get("foodCategory") or item.get("brandedFoodCategory") or ""
    fdc_tag = f"fdc:{fdc_id}"

    # Extract serving size from USDA data
    raw_serving = float(item.get("servingSize") or 0)
    raw_unit = (item.get("servingSizeUnit") or "g").upper()
    household = (item.get("householdServingFullText") or "").strip()

    # Determine default serving and unit label
    if raw_serving > 0 and raw_unit == "G" and household:
        # Clean up household text: "1 CHICKEN BREAST" → "serving"
        unit_label = _clean_household_unit(household)
        srv_g = raw_serving
    elif raw_serving > 0 and raw_unit == "G":
        srv_g = raw_serving
        unit_label = "serving"
    else:
        srv_g = 100.0
        unit_label = "g"

    return FoodOut(
        id=fdc_tag,
        name=name,
        aliases=[],
        category=_fdc_category(cat_raw),
        default_serving_g=srv_g,
        default_unit=unit_label,
        tags=[fdc_tag],
        nutrients_per_100g=nuts,
        is_custom=False,
    )


@router.get("", response_model=list[FoodOut])
def search_foods(
    q: str = Query("", description="Name/alias search term"),
    category: str = Query("", description="Filter by category"),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(FoodDB)
    if q:
        # SQLite LIKE search (case-insensitive via LOWER)
        query = query.filter(
            FoodDB.name.ilike(f"%{q}%")
            # alias search covered by a separate pass below
        )
    if category:
        query = query.filter(FoodDB.category == category)
    results = query.limit(limit).all()

    # Also check aliases if q provided
    if q and len(results) < limit:
        alias_matches = (
            db.query(FoodDB)
            .filter(FoodDB.aliases.ilike(f"%{q}%"))
            .limit(limit - len(results))
            .all()
        )
        seen = {r.id for r in results}
        results += [r for r in alias_matches if r.id not in seen]

    return [food_db_to_schema(r) for r in results[:limit]]


@router.get("/{food_id}", response_model=FoodOut)
def get_food(food_id: str, db: Session = Depends(get_db)):
    row = db.query(FoodDB).filter(FoodDB.id == food_id).first()
    if not row:
        raise HTTPException(404, f"Food {food_id} not found")
    return food_db_to_schema(row)


@router.post("", response_model=FoodOut, status_code=201)
def create_custom_food(body: FoodCreate, db: Session = Depends(get_db)):
    base = empty_nutrients()
    base.update(body.nutrients_per_100g)
    row = FoodDB(
        name=body.name,
        aliases=json.dumps(body.aliases),
        category=body.category,
        default_serving_g=body.default_serving_g,
        default_unit=body.default_unit,
        tags=json.dumps(body.tags),
        nutrients_json=json.dumps(base),
        is_custom=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return food_db_to_schema(row)


# ── USDA FoodData Central endpoints ──────────────────────────────────────────

@router.get("/external/search", response_model=list[FoodOut])
async def search_external_foods(
    q: str = Query(..., min_length=2, description="Search term"),
    limit: int = Query(20, ge=1, le=40),
):
    """Search USDA FoodData Central. Free — no registration required."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{_FDC_BASE}/foods/search",
                params={
                    "query": q,
                    "api_key": _FDC_API_KEY,
                    "pageSize": limit,
                    "dataType": "Foundation,SR Legacy,Survey (FNDDS),Branded",
                },
            )
    except Exception:
        raise HTTPException(503, "USDA FoodData Central is not reachable")
    if resp.status_code != 200:
        raise HTTPException(502, f"USDA FDC error: {resp.status_code}")
    foods = resp.json().get("foods") or []
    results = []
    for item in foods:
        fdc_id = item.get("fdcId")
        if not fdc_id:
            continue
        try:
            results.append(_fdc_to_foodout(item, fdc_id))
        except Exception:
            continue
    return results[:limit]


@router.get("/external/barcode/{barcode}", response_model=FoodOut)
async def lookup_barcode(barcode: str, db: Session = Depends(get_db)):
    """Look up a food by GTIN/UPC barcode via USDA FDC. Auto-imports into DB."""
    # Check local DB cache first
    existing = db.query(FoodDB).filter(FoodDB.tags.contains(barcode)).first()
    if existing:
        return food_db_to_schema(existing)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{_FDC_BASE}/foods/search",
                params={
                    "query": barcode,
                    "api_key": _FDC_API_KEY,
                    "pageSize": 1,
                    "dataType": "Branded",
                },
            )
    except Exception:
        raise HTTPException(503, "USDA FoodData Central is not reachable")

    foods = (resp.json().get("foods") or []) if resp.status_code == 200 else []
    if not foods:
        raise HTTPException(404, f"Barcode {barcode} not found in USDA FoodData Central")

    item = foods[0]
    fdc_id = item["fdcId"]
    food_out = _fdc_to_foodout(item, fdc_id)
    # Add barcode tag so subsequent lookups hit the cache
    food_out.tags = list({*food_out.tags, f"barcode:{barcode}"})
    return _import_fdc_food(food_out, db)


@router.post("/external/import", response_model=FoodOut, status_code=201)
def import_external_food(body: FoodOut, db: Session = Depends(get_db)):
    """Save a USDA FDC food to the local DB (idempotent by fdc: tag)."""
    return _import_fdc_food(body, db)


def _import_fdc_food(food: FoodOut, db: Session) -> FoodOut:
    """Upsert a food from USDA FDC into the local DB, deduplicating by fdc: tag."""
    fdc_tags = [t for t in food.tags if t.startswith("fdc:")]
    if fdc_tags:
        existing = db.query(FoodDB).filter(FoodDB.tags.contains(fdc_tags[0])).first()
        if existing:
            return food_db_to_schema(existing)

    base = empty_nutrients()
    base.update(food.nutrients_per_100g)
    row = FoodDB(
        id=str(uuid.uuid4()),
        name=food.name,
        aliases=json.dumps(food.aliases),
        category=food.category,
        default_serving_g=food.default_serving_g,
        default_unit=food.default_unit,
        tags=json.dumps(food.tags),
        nutrients_json=json.dumps(base),
        is_custom=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return food_db_to_schema(row)
