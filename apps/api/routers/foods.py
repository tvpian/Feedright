"""Foods router — search, create custom foods, get by id, Open Food Facts import."""
from __future__ import annotations

import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..converters import food_db_to_schema
from ..database import FoodDB, get_db
from ..schemas import FoodCreate, FoodOut
from nutrition_core.constants import empty_nutrients

router = APIRouter()

# ── Open Food Facts helpers ───────────────────────────────────────────────────

_OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"
_OFF_PRODUCT = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
_OFF_FIELDS  = "code,product_name,product_name_en,nutriments,categories_tags,serving_size,image_small_url"

def _off_nutrients(nm: dict) -> dict:
    """Map Open Food Facts nutriments dict → our nutrients_per_100g dict."""
    def g(key: str, factor: float = 1.0) -> float:
        return round((nm.get(key) or 0) * factor, 3)
    return {
        "calories":      g("energy-kcal_100g"),
        "protein":       g("proteins_100g"),
        "carbs":         g("carbohydrates_100g"),
        "fat":           g("fat_100g"),
        "fiber":         g("fiber_100g"),
        "sugar":         g("sugars_100g"),
        "saturated_fat": g("saturated-fat_100g"),
        "sodium":        g("sodium_100g", 1000),   # g → mg
        "omega3":        g("omega-3-fat_100g"),
        "caffeine":      g("caffeine_100g", 1000),  # g → mg
        "iron":          g("iron_100g", 1000),
        "calcium":       g("calcium_100g", 1000),
        "potassium":     g("potassium_100g", 1000),
        "magnesium":     g("magnesium_100g", 1000),
        "zinc":          g("zinc_100g", 1000),
        "vitamin_c":     g("vitamin-c_100g", 1000),
        "vitamin_a":     g("vitamin-a_100g", 1000000),  # g → µg (RAE)
        "vitamin_d":     g("vitamin-d_100g", 1000000),
        "vitamin_e":     g("vitamin-e_100g", 1000),
        "vitamin_b12":   g("vitamin-b12_100g", 1000000),
        "folate":        g("folate_100g", 1000000),
    }

def _off_to_foodout(p: dict) -> FoodOut:
    name = (p.get("product_name_en") or p.get("product_name") or "Unknown").strip()[:120]
    code = str(p.get("code", ""))
    nm   = p.get("nutriments") or {}
    cats = p.get("categories_tags") or []
    cat  = "other"
    if any("dairy" in c or "milk" in c or "cheese" in c for c in cats): cat = "dairy"
    elif any("meat" in c or "poultry" in c or "fish" in c or "seafood" in c for c in cats): cat = "protein"
    elif any("vegetable" in c or "legume" in c for c in cats): cat = "vegetables"
    elif any("fruit" in c for c in cats): cat = "fruits"
    elif any("grain" in c or "cereal" in c or "bread" in c for c in cats): cat = "grains"
    elif any("beverage" in c or "drink" in c for c in cats): cat = "beverages"
    nutr = _off_nutrients(nm)
    return FoodOut(
        id=f"off_{code}",   # temporary id — replaced on import
        name=name,
        aliases=[],
        category=cat,
        default_serving_g=100.0,
        default_unit="g",
        tags=[f"off:{code}"] if code else ["off:unknown"],
        nutrients_per_100g=nutr,
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


# ── Open Food Facts endpoints ─────────────────────────────────────────────────

@router.get("/external/search", response_model=list[FoodOut])
async def search_external_foods(
    q: str = Query(..., min_length=2, description="Search term"),
    limit: int = Query(20, ge=1, le=40),
):
    """Search Open Food Facts (no key required). Returns pre-mapped FoodOut objects."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_OFF_SEARCH, params={
            "search_terms": q, "action": "process", "json": "1",
            "page_size": limit, "fields": _OFF_FIELDS, "sort_by": "unique_scans_n",
        })
    if resp.status_code != 200:
        raise HTTPException(502, "Open Food Facts search failed")
    products = resp.json().get("products") or []
    results = []
    for p in products:
        name = p.get("product_name_en") or p.get("product_name") or ""
        if not name.strip():
            continue
        try:
            results.append(_off_to_foodout(p))
        except Exception:
            continue
    return results[:limit]


@router.get("/external/barcode/{barcode}", response_model=FoodOut)
async def lookup_barcode(barcode: str, db: Session = Depends(get_db)):
    """Look up a food by barcode via Open Food Facts. Auto-imports into DB if new."""
    # Check cache first
    tag = f"off:{barcode}"
    existing = db.query(FoodDB).filter(FoodDB.tags.contains(tag)).first()
    if existing:
        return food_db_to_schema(existing)

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_OFF_PRODUCT.format(barcode=barcode))
    if resp.status_code != 200:
        raise HTTPException(404, f"Barcode {barcode} not found")
    data = resp.json()
    if data.get("status") != 1 or not data.get("product"):
        raise HTTPException(404, f"Barcode {barcode} not found in Open Food Facts")

    food_out = _off_to_foodout({**data["product"], "code": barcode})
    # Auto-import into DB so it can be logged
    return _import_off_food(food_out, db)


@router.post("/external/import", response_model=FoodOut, status_code=201)
def import_external_food(body: FoodOut, db: Session = Depends(get_db)):
    """Save an Open Food Facts product to the local DB (idempotent by off: tag)."""
    return _import_off_food(body, db)


def _import_off_food(food: FoodOut, db: Session) -> FoodOut:
    """Upsert a food from OFF into the local DB, deduplicating by off:<code> tag."""
    off_tags = [t for t in food.tags if t.startswith("off:")]
    if off_tags:
        existing = db.query(FoodDB).filter(FoodDB.tags.contains(off_tags[0])).first()
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
