# FeedRight — Feature Report

## Current Features (all working & deployed)

| Area | Features |
|---|---|
| **Daily Tracking** | Log food (search, USDA import, barcode scan, custom), 35 nutrients tracked, water intake with presets, weight logging with trend chart |
| **Smart Targets** | Auto-computed daily targets from profile (TDEE, 17 health goals, 15 health conditions, supplement offsets) |
| **Insights** | Nutrient trend charts (7/14/30d), weekly averages with low-nutrient alerts, top foods, logging streaks |
| **Recommendations** | Gap analysis → ranked food suggestions (singles + combos), filter by no-cook/veg/vegan/calorie cap |
| **AI Coach** | Streaming LLM advice via Ollama/llama3, context-aware (knows your profile + today's gaps) |
| **Multi-Profile** | Multiple users, PIN lock, profile wizard with goals/conditions/supplements/diet prefs |
| **Saved Meals** | Save a day's food as a reusable meal, one-tap re-log |
| **UX** | Date navigation on all pages, repeat yesterday, inline editing, mobile-optimized, glassmorphism UI |
| **Deployment** | Docker stack (Postgres + API + Web), Cloudflare tunnel, systemd auto-start |

---

## High-Impact Improvements (effort vs. value)

### Quick Wins

| # | Feature | Why |
|---|---|---|
| 1 | **Configurable water goal** — currently hardcoded 2500ml; tie it to profile weight/activity | Easy backend change, immediate relevance |
| 2 | **Edit saved meals** — can only create & delete, not update components | Reduces friction for regulars |
| 3 | **Copy from any past day** — currently only copies yesterday | Useful for repeat weekly patterns |
| 4 | **Data export (CSV/JSON)** — logs, weight, analytics | Users want their data; trivial API endpoint |

### Medium Effort

| # | Feature | Why |
|---|---|---|
| 5 | **PWA / offline mode** — service worker + cache for offline logging | Manifest exists but no SW; big mobile UX win |
| 6 | **Weekly meal planner** — forward-looking "plan Mon–Sun" using the recommendation engine | Natural next step from "Next Food" |
| 7 | **Fuzzy food search** — trigram similarity or Levenshtein for typo tolerance | Reduces "food not found" frustration |
| 8 | **Reminders / notifications** — "You haven't logged lunch yet" push notifs | Key for habit formation |

### Bigger Bets

| # | Feature | Why |
|---|---|---|
| 9 | **Photo-based food logging** — snap a photo, AI identifies food + portion | Huge UX leap, needs vision model |
| 10 | **Cloud LLM fallback** — if Ollama is down, fall back to an API (Groq/OpenRouter free tier) | Removes single point of failure for AI Coach |

---

## What's Solid & Doesn't Need Touching

- Nutrition engine (targets, gap analysis, recommender) — thorough and well-tested
- 86 curated seed foods with full 35-nutrient profiles
- Profile system with health goals/conditions/supplements
- Docker deployment pipeline
