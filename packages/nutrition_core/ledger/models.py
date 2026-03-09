"""Daily intake ledger models."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


class MealSlot(str):
    """Named meal slots. Free-form string; common values provided as constants."""
    BREAKFAST = "Breakfast"
    LUNCH     = "Lunch"
    DINNER    = "Dinner"
    SNACK     = "Snack"
    OTHER     = "Other"


@dataclass
class LogEntry:
    """One logged food item in the daily ledger."""
    user_id: str
    log_date: date
    food_id: str                           # references FoodItem.id
    amount_g: float                        # grams consumed
    unit: str = "g"
    meal_slot: str = MealSlot.OTHER
    saved_meal_id: Optional[str] = None    # set if entry was logged from a SavedMeal
    notes: str = ""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class DailyLog:
    """All log entries for one user on one date."""
    user_id: str
    log_date: date
    entries: list[LogEntry] = field(default_factory=list)

    def add(self, entry: LogEntry) -> None:
        self.entries.append(entry)

    def remove(self, entry_id: str) -> bool:
        before = len(self.entries)
        self.entries = [e for e in self.entries if e.id != entry_id]
        return len(self.entries) < before

    def replace(self, entry_id: str, updated: LogEntry) -> bool:
        for i, e in enumerate(self.entries):
            if e.id == entry_id:
                self.entries[i] = updated
                return True
        return False
