"""add water_goal_ml to users

Revision ID: a1b2c3d4e5f6
Revises: 0ca0943a1852
Create Date: 2026-03-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "0ca0943a1852"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("water_goal_ml", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "water_goal_ml")
