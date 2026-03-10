"""Profiles router."""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import UserDB, get_db
from ..schemas import ProfileCreate, ProfileOut, ProfileUpdate, SupplementIn

router = APIRouter()


@router.post("", response_model=ProfileOut, status_code=201)
def create_profile(body: ProfileCreate, db: Session = Depends(get_db)):
    row = UserDB(
        name=body.name,
        age=body.age,
        sex=body.sex,
        weight_kg=body.weight_kg,
        height_cm=body.height_cm,
        activity_level=body.activity_level,
        goal_mode=body.goal_mode,
        dietary_preferences=json.dumps(body.dietary_preferences),
        avoid_foods=json.dumps(body.avoid_foods),
        supplement_ids=json.dumps(body.supplement_ids),
        health_goals=json.dumps(body.health_goals),
        health_conditions=json.dumps(body.health_conditions),
        supplements_json=json.dumps([s.model_dump() for s in body.supplements]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("", response_model=list[ProfileOut])
def list_profiles(db: Session = Depends(get_db)):
    return [_to_out(r) for r in db.query(UserDB).filter(UserDB.is_active == True).all()]


@router.get("/{user_id}", response_model=ProfileOut)
def get_profile(user_id: str, db: Session = Depends(get_db)):
    row = _get_or_404(user_id, db)
    return _to_out(row)


@router.patch("/{user_id}", response_model=ProfileOut)
def update_profile(user_id: str, body: ProfileUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(user_id, db)
    updates = body.model_dump(exclude_none=True)
    _JSON_FIELDS = {"dietary_preferences", "avoid_foods"}
    for field, value in updates.items():
        if field == "supplements":
            setattr(row, "supplements_json", json.dumps([s if isinstance(s, dict) else s.model_dump() for s in value]))
        elif field == "health_goals":
            setattr(row, "health_goals", json.dumps(value))
        elif field == "health_conditions":
            setattr(row, "health_conditions", json.dumps(value))
        elif field in _JSON_FIELDS:
            setattr(row, field, json.dumps(value))
        else:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{user_id}", status_code=204)
def delete_profile(user_id: str, db: Session = Depends(get_db)):
    row = _get_or_404(user_id, db)
    row.is_active = False
    db.commit()


# ── PIN endpoints ───────────────────────────────────────────────────────────────────────────────

class PinBody(BaseModel):
    pin: str

def _hash_pin(pin: str) -> str:
    """SHA-256 hash of the 4-8 digit PIN (no bcrypt dep needed)."""
    return hashlib.sha256(pin.strip().encode()).hexdigest()


@router.post("/{user_id}/set-pin", status_code=204)
def set_pin(user_id: str, body: PinBody, db: Session = Depends(get_db)):
    """Set or update the PIN for a profile. Send empty string to remove."""
    row = _get_or_404(user_id, db)
    row.pin_hash = _hash_pin(body.pin) if body.pin.strip() else None
    db.commit()


@router.post("/{user_id}/verify-pin")
def verify_pin(user_id: str, body: PinBody, db: Session = Depends(get_db)):
    """Returns {ok: true} if PIN matches, 401 otherwise."""
    row = _get_or_404(user_id, db)
    if not row.pin_hash:
        return {"ok": True, "message": "No PIN set"}
    if _hash_pin(body.pin) == row.pin_hash:
        return {"ok": True}
    raise HTTPException(401, "Incorrect PIN")


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(user_id: str, db: Session) -> UserDB:
    row = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not row:
        raise HTTPException(404, f"Profile {user_id} not found")
    return row


def _to_out(row: UserDB) -> ProfileOut:
    supps_raw = json.loads(row.supplements_json or "[]")
    return ProfileOut(
        id=row.id,
        name=row.name,
        age=int(row.age),
        sex=row.sex,
        weight_kg=row.weight_kg,
        height_cm=row.height_cm,
        activity_level=row.activity_level,
        goal_mode=row.goal_mode,
        dietary_preferences=json.loads(row.dietary_preferences),
        avoid_foods=json.loads(row.avoid_foods),
        supplement_ids=json.loads(row.supplement_ids),
        health_goals=json.loads(row.health_goals or "[]"),
        health_conditions=json.loads(row.health_conditions or "[]"),
        supplements=[SupplementIn(**s) for s in supps_raw],
        has_pin=bool(row.pin_hash),
    )
