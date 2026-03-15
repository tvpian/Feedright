#!/usr/bin/env python3
"""
Bulk-import USDA FoodData Central foods into FeedRight.

Downloads SR Legacy (~7,800 whole foods) and/or Foundation (~400 highly
characterised foods) from the USDA FDC API and inserts directly into the
local database.

Usage
-----
  # Import SR Legacy (default — ~7,800 common foods):
  python scripts/bulk_import_usda.py

  # Import Foundation Foods too:
  python scripts/bulk_import_usda.py --data-type "SR Legacy" --data-type Foundation

  # Dry run (shows counts without writing):
  python scripts/bulk_import_usda.py --dry-run

  # Inside Docker:
  docker compose exec api python /app/scripts/bulk_import_usda.py

  # Custom DB URL and API key:
  python scripts/bulk_import_usda.py --api-key YOUR_KEY \\
      --db-url postgresql://user:pass@host:5432/dbname
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps"))
sys.path.insert(0, str(ROOT / "packages"))

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from nutrition_core.constants import NUTRIENT_KEYS

# ── USDA Nutrient-ID → internal key mapping ──────────────────────────────────
# Values from the API are per 100 g for Foundation / SR Legacy.
# Multiple IDs can map to the same key (e.g. omega-3 forms accumulate).
NID_MAP: dict[int, tuple[str, float]] = {
    1008: ("calories",      1.0),
    1003: ("protein",       1.0),
    1004: ("fat",           1.0),
    1005: ("carbs",         1.0),
    1079: ("fiber",         1.0),
    2000: ("sugar",         1.0),
    1258: ("saturated_fat", 1.0),
    1093: ("sodium",        1.0),
    1057: ("caffeine",      1.0),
    1089: ("iron",          1.0),
    1087: ("calcium",       1.0),
    1092: ("potassium",     1.0),
    1090: ("magnesium",     1.0),
    1095: ("zinc",          1.0),
    1101: ("selenium",      1.0),
    1100: ("iodine",        1.0),
    1107: ("choline",       1.0),
    1106: ("vitamin_a",     1.0),    # µg RAE
    1162: ("vitamin_c",     1.0),
    1114: ("vitamin_d",     1.0),    # µg (D2+D3)
    1109: ("vitamin_e",     1.0),
    1185: ("vitamin_k",     1.0),
    1178: ("vitamin_b12",   1.0),
    1173: ("vitamin_b1",    1.0),
    1174: ("vitamin_b2",    1.0),
    1175: ("vitamin_b3",    1.0),
    1180: ("vitamin_b5",    1.0),
    1166: ("vitamin_b6",    1.0),
    1177: ("folate",        1.0),
    1190: ("biotin",        1.0),
    # Trace minerals
    1091: ("phosphorus",    1.0),
    1098: ("copper",        1.0),
    1103: ("manganese",     1.0),
    1096: ("chromium",      1.0),
    # Omega-3 forms (ALA + EPA + DHA) → cumulative into "omega3"
    1404: ("omega3",        1.0),    # 18:3 n-3  (ALA), grams
    1278: ("omega3",        1.0),    # 20:5 n-3  (EPA), grams
    1272: ("omega3",        1.0),    # 22:6 n-3  (DHA), grams
}

# All the USDA nutrient IDs we care about (for the `nutrients` filter)
_NUTRIENT_IDS = sorted(set(NID_MAP.keys()))

# ── Category mapping ──────────────────────────────────────────────────────────
_FDC_CAT_MAP = [
    (["dairy", "milk", "cheese", "cream", "butter", "yogurt"],        "dairy"),
    (["egg"],                                                          "dairy"),
    (["poultry", "beef", "pork", "lamb", "veal", "fish", "shellfish",
      "seafood", "meat", "game", "sausage", "bacon", "finfish"],       "protein"),
    (["vegetable", "legume", "bean", "lentil", "tofu", "pea"],        "vegetables"),
    (["fruit", "berry"],                                               "fruits"),
    (["grain", "baked", "cereal", "bread", "pasta", "rice", "oat",
      "flour", "cracker", "noodle", "wheat"],                          "grains"),
    (["nut", "seed"],                                                  "nuts_seeds"),
    (["beverage", "drink", "coffee", "tea", "soda", "water", "juice"], "beverages"),
    (["spice", "herb", "seasoning"],                                   "other"),
    (["oil", "fat", "shortening", "margarine"],                        "other"),
    (["snack", "candy", "chocolate", "chip", "cookie"],                "other"),
    (["soup", "sauce", "gravy", "condiment"],                          "other"),
    (["baby", "infant"],                                               "other"),
    (["restaurant", "fast food"],                                      "other"),
    (["meal", "entree"],                                               "other"),
    (["sweet", "sugar", "syrup", "honey", "jam"],                      "other"),
]


def _fdc_category(raw: str) -> str:
    s = (raw or "").lower()
    for keywords, cat in _FDC_CAT_MAP:
        if any(k in s for k in keywords):
            return cat
    return "other"


def _infer_tags(cat_raw: str, category: str) -> list[str]:
    """Infer semantic tags from USDA category for dietary constraint filters."""
    s = (cat_raw or "").lower()
    tags: list[str] = []
    if any(k in s for k in ("beef", "pork", "lamb", "veal", "game",
                             "sausage", "bacon", "meat")):
        tags += ["meat", "needs-cooking"]
    if any(k in s for k in ("poultry", "chicken", "turkey", "duck")):
        tags += ["meat", "poultry", "needs-cooking"]
    if any(k in s for k in ("fish", "shellfish", "seafood", "finfish")):
        tags += ["fish", "needs-cooking"]
    if any(k in s for k in ("dairy", "milk", "cheese", "cream",
                             "yogurt", "butter")):
        tags += ["dairy", "no-cook"]
    if "egg" in s:
        tags += ["egg"]
    if category == "grains" and any(k in s for k in ("bread", "cracker",
                                                       "cereal")):
        tags += ["no-cook"]
    if category in ("fruits", "vegetables"):
        tags += ["vegan"]
    if any(k in s for k in ("nut", "seed")):
        tags += ["vegan", "no-cook"]
    return list(set(tags))


def _clean_name(raw: str) -> str:
    """Clean USDA food descriptions into friendly display names."""
    name = raw.strip()[:200]
    if name.isupper():
        name = name.title()
    return name.rstrip(", ")


def _empty_nutrients() -> dict[str, float]:
    """Return a zeroed nutrient dict matching our schema."""
    return {k: 0.0 for k in NUTRIENT_KEYS}


# ── Nutrient extraction ──────────────────────────────────────────────────────

def _extract_nutrients(food_nutrients: list[dict]) -> dict[str, float]:
    nuts = _empty_nutrients()
    for n in food_nutrients:
        # Detail endpoint: nutrient.id + amount
        nid = (n.get("nutrient") or {}).get("id")
        # Search endpoint: nutrientId + value
        if nid is None:
            nid = n.get("nutrientId")
        val = float(n.get("amount") or n.get("value") or 0)
        if nid and nid in NID_MAP:
            key, factor = NID_MAP[nid]
            adj = round(val * factor, 3)
            if key == "omega3":
                nuts[key] = round(nuts.get(key, 0) + adj, 3)
            else:
                nuts[key] = adj
    return nuts


# ── USDA FDC API helpers ─────────────────────────────────────────────────────
FDC_BASE = "https://api.nal.usda.gov/fdc/v1"


def _list_fdc_foods(client: httpx.Client, api_key: str, data_type: str,
                     page_size: int = 200) -> list[dict]:
    """Page through the FDC food list, returning basic info."""
    all_foods: list[dict] = []
    page = 1
    while True:
        print(f"\r  Listing page {page} ({len(all_foods):,} foods so far) …",
              end="", flush=True)
        for attempt in range(3):
            try:
                resp = client.get(
                    f"{FDC_BASE}/foods/list",
                    params={
                        "api_key": api_key,
                        "dataType": data_type,
                        "pageSize": page_size,
                        "pageNumber": page,
                    },
                )
                if resp.status_code == 429:
                    wait = 60 * (attempt + 1)
                    print(f"\n  Rate-limited — waiting {wait}s …", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                break
            except httpx.HTTPError as exc:
                print(f"\n  ⚠ HTTP error: {exc} — retrying …", flush=True)
                time.sleep(5 * (attempt + 1))
        else:
            print(f"\n  ✗ Failed after 3 attempts on page {page}", flush=True)
            break

        items = resp.json()
        if not items:
            break
        all_foods.extend(items)
        if len(items) < page_size:
            break
        page += 1
        time.sleep(0.3)

    print(f"\r  Listed {len(all_foods):,} {data_type} foods" + " " * 20)
    return all_foods


def _fetch_details(client: httpx.Client, api_key: str,
                   fdc_ids: list[int]) -> list[dict]:
    """Fetch full nutrient details for a batch of fdcIds (max 20)."""
    body = {"fdcIds": fdc_ids}
    for attempt in range(3):
        try:
            resp = client.post(
                f"{FDC_BASE}/foods",
                params={"api_key": api_key},
                json=body,
            )
            if resp.status_code == 429:
                wait = 60 * (attempt + 1)
                print(f"\n  Rate-limited — waiting {wait}s …", flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            print(f"\n  ⚠ HTTP error: {exc} — retrying …", flush=True)
            time.sleep(5 * (attempt + 1))
    return []


# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bulk-import USDA FoodData Central foods into FeedRight",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--data-type", action="append", default=None,
        help='USDA data type(s). Repeat for multiple. Default: "SR Legacy"',
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("USDA_API_KEY", "DEMO_KEY"),
        help="USDA FDC API key (env USDA_API_KEY or DEMO_KEY)",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", "sqlite:///./nutritrack.db"),
        help="Database URL (env DATABASE_URL or SQLite)",
    )
    parser.add_argument(
        "--min-nutrients", type=int, default=8,
        help="Min non-zero nutrient values to keep a food (default 8)",
    )
    parser.add_argument(
        "--batch-size", type=int, default=20,
        help="FDC detail batch size, max 20 (default 20)",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max foods to import per data type (0 = all)",
    )
    parser.add_argument(
        "--delay", type=float, default=0.4,
        help="Seconds between API calls (default 0.4)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report counts without writing to DB",
    )
    args = parser.parse_args()

    data_types = args.data_type or ["SR Legacy"]
    batch_size = min(args.batch_size, 20)

    print("═══ FeedRight — Bulk USDA Import ═══")
    print(f"  Data types   : {', '.join(data_types)}")
    print(f"  API key      : {args.api_key[:8]}…")
    print(f"  Database     : {args.db_url[:60]}…")
    print(f"  Min nutrients: {args.min_nutrients}")
    print(f"  Batch size   : {batch_size}")
    print(f"  Delay        : {args.delay}s")
    print(f"  Dry run      : {args.dry_run}")
    print()

    # ── DB setup ──────────────────────────────────────────────────────────────
    from api.database import FoodDB, Base

    engine = create_engine(
        args.db_url,
        connect_args=(
            {"check_same_thread": False}
            if args.db_url.startswith("sqlite")
            else {}
        ),
    )
    SessFactory = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)
    db = SessFactory()

    # Collect existing fdc: tags so we skip duplicates
    existing_tags: set[str] = set()
    for row in db.query(FoodDB.tags).all():
        try:
            tags = json.loads(row.tags) if row.tags else []
        except Exception:
            tags = []
        for t in tags:
            if t.startswith("fdc:"):
                existing_tags.add(t)

    existing_count = db.query(FoodDB).count()
    print(f"  Foods already in DB : {existing_count:,}")
    print(f"  FDC-tagged foods    : {len(existing_tags):,}")
    print()

    # ── Stats ─────────────────────────────────────────────────────────────────
    stats = {
        "listed": 0,
        "imported": 0,
        "dup_skipped": 0,
        "low_nutrient": 0,
        "errors": 0,
    }

    with httpx.Client(timeout=30) as client:
        for dt in data_types:
            print(f"── {dt} {'─' * (50 - len(dt))}")

            # Phase 1 — list all food IDs
            foods_list = _list_fdc_foods(client, args.api_key, dt)
            fdc_ids = [f["fdcId"] for f in foods_list]
            stats["listed"] += len(fdc_ids)

            if args.limit:
                fdc_ids = fdc_ids[: args.limit]
                print(f"  (limited to first {args.limit})")

            # Phase 2 — fetch nutrient details in batches
            dt_imported = 0
            total_batches = (len(fdc_ids) + batch_size - 1) // batch_size

            for batch_idx in range(0, len(fdc_ids), batch_size):
                batch = fdc_ids[batch_idx : batch_idx + batch_size]
                batch_num = batch_idx // batch_size + 1
                pct = int((batch_idx + len(batch)) / len(fdc_ids) * 100)
                print(
                    f"\r  Batch {batch_num}/{total_batches} "
                    f"({pct}%) — {dt_imported:,} imported",
                    end="", flush=True,
                )

                try:
                    details = _fetch_details(
                        client, args.api_key, batch
                    )
                except Exception as exc:
                    print(f"\n  ✗ Batch error: {exc}")
                    stats["errors"] += len(batch)
                    time.sleep(2)
                    continue

                for item in details:
                    fdc_id = item.get("fdcId")
                    if not fdc_id:
                        continue
                    fdc_tag = f"fdc:{fdc_id}"

                    # Skip duplicates
                    if fdc_tag in existing_tags:
                        stats["dup_skipped"] += 1
                        continue

                    # Extract
                    name = _clean_name(
                        item.get("description") or "Unknown"
                    )
                    cat_raw = ""
                    fc = item.get("foodCategory")
                    if isinstance(fc, dict):
                        cat_raw = fc.get("description", "")
                    elif isinstance(fc, str):
                        cat_raw = fc

                    category = _fdc_category(cat_raw)
                    tags = [fdc_tag] + _infer_tags(cat_raw, category)
                    nutrients = _extract_nutrients(
                        item.get("foodNutrients", [])
                    )

                    # Quality gate
                    non_zero = sum(
                        1 for v in nutrients.values() if v and v > 0
                    )
                    if non_zero < args.min_nutrients:
                        stats["low_nutrient"] += 1
                        continue

                    if not args.dry_run:
                        row = FoodDB(
                            id=str(uuid.uuid4()),
                            name=name,
                            aliases=json.dumps([]),
                            category=category,
                            default_serving_g=100.0,
                            default_unit="g",
                            tags=json.dumps(tags),
                            nutrients_json=json.dumps(nutrients),
                            is_custom=False,
                        )
                        db.add(row)

                    existing_tags.add(fdc_tag)
                    dt_imported += 1
                    stats["imported"] += 1

                # Commit per batch
                if not args.dry_run:
                    db.commit()

                time.sleep(args.delay)

            print(
                f"\r  {dt}: {dt_imported:,} foods imported"
                + " " * 30
            )
            print()

    db.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    final_count = existing_count + stats["imported"]
    print("═══ Summary ═══")
    print(f"  Listed (total)   : {stats['listed']:,}")
    print(f"  Imported         : {stats['imported']:,}")
    print(f"  Dup skipped      : {stats['dup_skipped']:,}")
    print(f"  Low-nutrient     : {stats['low_nutrient']:,}")
    print(f"  Errors           : {stats['errors']:,}")
    print(f"  DB total (before): {existing_count:,}")
    print(f"  DB total (after) : {final_count:,}")
    if args.dry_run:
        print("  ⚠  DRY RUN — nothing written to DB")
    print()


if __name__ == "__main__":
    main()
