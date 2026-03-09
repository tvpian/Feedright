# Nutrition Gap Tracker & Next-Food Recommender

A deterministic, full-stack nutrition tracking app.  
Log foods, watch nutrient gaps close in real time, and get ranked recommendations for the best next foods or meals to finish the day strong.

---

## Project structure

```
diet_tracker_optimizer/
├── packages/
│   └── nutrition_core/          # Pure Python engine (no external deps)
│       ├── constants.py          # NUTRIENTS_V1, urgency weights, helpers
│       ├── profiles/             # UserProfile, BMR/TDEE with Mifflin-St Jeor
│       ├── targets/              # compute_targets() → DailyTargets (18 nutrients)
│       ├── food_db/              # FoodItem, SavedMeal, seed_data (35+ USDA foods)
│       ├── ledger/               # DailyLog, LogEntry, aggregate_nutrients()
│       ├── analysis/             # analyze_gaps() → GapAnalysis + NutrientGap
│       └── recommender/          # recommend() → scored singles + combos
├── apps/
│   ├── api/                     # FastAPI + SQLAlchemy + SQLite
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── schemas.py
│   │   ├── converters.py
│   │   └── routers/             # profiles, foods, logs, targets, saved_meals, recommendations
│   └── web/                     # Next.js 15 + React 19 + Tailwind CSS
│       └── src/
│           ├── app/             # Dashboard, Log, Recommendations, Saved Meals, Profile
│           ├── components/      # NutrientBar, NutrientGrid, LogFoodModal, RecommendationCard
│           └── lib/             # types.ts, api.ts, userContext.tsx
├── Makefile
├── pytest.ini
└── README.md
```

---

## Quick start

### 1 — Python environment

```bash
python -m venv .venv
source .venv/bin/activate
make install-api
```

### 2 — Start the API server

```bash
make run-api
# FastAPI + Swagger UI → http://localhost:8000/docs
# Equivalent: PYTHONPATH=packages:apps .venv/bin/uvicorn api.main:app --reload --port 8000
```

The SQLite database file `apps/api/nutritrack.db` is created on first run.  
Seed foods (35+ whole foods from USDA data) are loaded automatically.

### 3 — Start the web app

```bash
make install-web
make run-web
# Next.js → http://localhost:3000
```

`apps/web/.env.local` already points `NEXT_PUBLIC_API_URL` at `http://localhost:8000`.  
The Next.js `next.config.mjs` also rewrites `/api/*` to the FastAPI backend.

### 4 — Run the test suite

```bash
make run-tests
```

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/profiles` | Create user profile |
| `GET` | `/api/profiles` | List all profiles |
| `GET` | `/api/targets/{user_id}` | Compute daily nutrient targets |
| `GET` | `/api/foods?q=chicken` | Search food database |
| `GET` | `/api/logs/{user_id}/{date}` | Get daily log + totals |
| `POST` | `/api/logs/{user_id}/{date}` | Add food entry |
| `DELETE` | `/api/logs/{user_id}/{date}/{entry_id}` | Remove entry |
| `POST` | `/api/logs/{user_id}/{date}/copy-yesterday` | Copy previous day |
| `GET` | `/api/recommendations/{user_id}/{date}/gaps` | Gap analysis |
| `POST` | `/api/recommendations/{user_id}/{date}` | Get scored recommendations |
| `GET` | `/api/saved-meals/{user_id}` | List saved meals |
| `POST` | `/api/saved-meals/{user_id}` | Create saved meal |
| `POST` | `/api/saved-meals/{user_id}/{meal_id}/log/{date}` | Log saved meal |

Full interactive docs at `http://localhost:8000/docs`.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./nutritrack.db` | SQLAlchemy DB URL |

---

## Nutrition engine

The `nutrition_core` package is a dependency-free Python library.  
It can be imported independently of the web stack:

```python
from nutrition_core.profiles.models import UserProfile, Sex, ActivityLevel, GoalMode
from nutrition_core.targets.engine import compute_targets
from nutrition_core.food_db.seed_data import SEED_FOODS
from nutrition_core.food_db.models import FoodItem
from nutrition_core.ledger.models import DailyLog
from nutrition_core.ledger.aggregator import aggregate_nutrients
from nutrition_core.analysis.engine import analyze_gaps
from nutrition_core.recommender.engine import recommend, RecommendationRequest

profile = UserProfile(
    id="u1", name="Alice",
    age=30, sex=Sex.FEMALE,
    weight_kg=65, height_cm=168,
    activity_level=ActivityLevel.MODERATE,
    goal_mode=GoalMode.MAINTAIN,
)
targets = compute_targets(profile)
print(targets.calories)   # ~2100 kcal
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Nutrition engine | Python 3.11, pure stdlib |
| API | FastAPI 0.115, Uvicorn, SQLAlchemy 2.0, Pydantic v2, SQLite |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 3.4, Lucide React |
| Tests | pytest |
