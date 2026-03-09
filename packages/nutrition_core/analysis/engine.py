"""
Nutrient gap analysis engine.

Compares actual intake against daily targets and returns per-nutrient
status indicators + weighted urgency scores for use by the recommender.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from nutrition_core.constants import (
    LIMIT_NUTRIENTS,
    NUTRIENT_KEYS,
    NUTRIENT_URGENCY_WEIGHTS,
)
from nutrition_core.targets.engine import DailyTargets


class NutrientStatus(str, Enum):
    """Four-level completion status."""
    COMPLETE  = "complete"    # >= 100 %
    CLOSE     = "close"       # 80-99 %
    LOW       = "low"         # 50-79 %
    CRITICAL  = "critical"    # < 50 %


@dataclass
class NutrientGap:
    key: str
    target: float
    consumed: float
    percent_complete: float        # 0 – 200 (capped)
    deficit: float                 # target - consumed  (can be negative = overage)
    status: NutrientStatus
    urgency_score: float           # deficit_fraction × urgency_weight
    is_limit: bool = False         # True for ceiling nutrients (caffeine, sugar)


@dataclass
class GapAnalysis:
    gaps: dict[str, NutrientGap]   # keyed by nutrient key

    @property
    def critical_nutrients(self) -> list[NutrientGap]:
        return self._filter(NutrientStatus.CRITICAL)

    @property
    def low_nutrients(self) -> list[NutrientGap]:
        return self._filter(NutrientStatus.LOW)

    @property
    def close_nutrients(self) -> list[NutrientGap]:
        return self._filter(NutrientStatus.CLOSE)

    @property
    def complete_nutrients(self) -> list[NutrientGap]:
        return self._filter(NutrientStatus.COMPLETE)

    def _filter(self, status: NutrientStatus) -> list[NutrientGap]:
        return [g for g in self.gaps.values() if g.status == status]

    def sorted_by_urgency(self) -> list[NutrientGap]:
        return sorted(self.gaps.values(), key=lambda g: -g.urgency_score)

    def summary_text(self) -> str:
        """Human-readable one-liner, useful for debugging / LLM prompts."""
        critical = [g.key for g in self.critical_nutrients]
        low = [g.key for g in self.low_nutrients]
        complete = [g.key for g in self.complete_nutrients]
        parts = []
        if critical:
            parts.append(f"Critical: {', '.join(critical)}")
        if low:
            parts.append(f"Low: {', '.join(low)}")
        if complete:
            parts.append(f"Met: {', '.join(complete)}")
        return " | ".join(parts) if parts else "No data"


def analyze_gaps(
    consumed: dict[str, float],
    targets: DailyTargets,
) -> GapAnalysis:
    """
    Produce a GapAnalysis comparing consumed nutrients vs targets.

    For "floor" nutrients (protein, iron …): higher consumed = better.
    For "limit" nutrients (caffeine, sugar): lower consumed = better.
    """
    target_dict = targets.as_dict()
    gaps: dict[str, NutrientGap] = {}

    for key in NUTRIENT_KEYS:
        target = target_dict.get(key, 0.0)
        amount = consumed.get(key, 0.0)
        is_limit = key in LIMIT_NUTRIENTS

        if target <= 0:
            # No target set for this nutrient; treat as complete.
            gaps[key] = NutrientGap(
                key=key, target=target, consumed=amount,
                percent_complete=100.0, deficit=0.0,
                status=NutrientStatus.COMPLETE, urgency_score=0.0,
                is_limit=is_limit,
            )
            continue

        pct = min((amount / target) * 100.0, 200.0)  # cap at 200 %

        if is_limit:
            # ── Limit nutrient: target is a ceiling. ──
            # "deficit" here = remaining room (how much more you can consume)
            remaining = max(target - amount, 0.0)
            surplus = max(amount - target, 0.0)

            if pct <= 60:
                status = NutrientStatus.COMPLETE    # well under limit ✅
            elif pct <= 85:
                status = NutrientStatus.CLOSE       # approaching limit ⚠️
            elif pct <= 100:
                status = NutrientStatus.LOW         # near/at limit ⚠️⚠️
            else:
                status = NutrientStatus.CRITICAL    # over limit ❌

            # Urgency for limit nutrients: how bad is the overage
            if surplus > 0:
                urgency = (surplus / target) * NUTRIENT_URGENCY_WEIGHTS.get(key, 5.0)
            else:
                urgency = 0.0

            gaps[key] = NutrientGap(
                key=key, target=target, consumed=amount,
                percent_complete=pct, deficit=-surplus,   # negative = over
                status=status, urgency_score=urgency,
                is_limit=True,
            )
        else:
            # ── Floor nutrient: target is a minimum. ──
            deficit = max(target - amount, 0.0)

            if pct >= 100:
                status = NutrientStatus.COMPLETE
            elif pct >= 80:
                status = NutrientStatus.CLOSE
            elif pct >= 50:
                status = NutrientStatus.LOW
            else:
                status = NutrientStatus.CRITICAL

            deficit_fraction = deficit / target          # 0-1
            urgency = deficit_fraction * NUTRIENT_URGENCY_WEIGHTS.get(key, 5.0)

            gaps[key] = NutrientGap(
                key=key, target=target, consumed=amount,
                percent_complete=pct, deficit=deficit,
                status=status, urgency_score=urgency,
                is_limit=False,
            )

    return GapAnalysis(gaps=gaps)
