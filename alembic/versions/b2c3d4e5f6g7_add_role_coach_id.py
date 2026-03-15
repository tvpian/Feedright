"""add role/coach_id to users and exclude_from_recs to foods

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6g7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Coach-client role system
    op.add_column("users", sa.Column("role", sa.String(), server_default="solo"))
    op.add_column("users", sa.Column("coach_id", sa.String(), nullable=True))
    # Food quality gate
    op.add_column("foods", sa.Column("exclude_from_recs", sa.Boolean(), server_default="false"))


def downgrade() -> None:
    op.drop_column("users", "role")
    op.drop_column("users", "coach_id")
    op.drop_column("foods", "exclude_from_recs")
