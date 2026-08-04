import secrets
import sqlite3

from fastapi import HTTPException, status

from app.core.security import hash_password, verify_password
from app.db.models import User
from app.services.usage_service import current_usage_month, plan_policy


def _row_to_user(row: sqlite3.Row) -> User:
    policy = plan_policy(row["plan"])
    return User(
        id=row["id"],
        email=row["email"],
        plan=policy["id"],
        monthly_usage=int(row["monthly_usage"]),
        usage_limit=int(row["usage_limit"]),
        usage_month=row["usage_month"],
        created_at=row["created_at"],
    )


def _user_select_sql() -> str:
    return "SELECT id, email, plan, monthly_usage, usage_limit, usage_month, created_at FROM users"


def get_user_by_email(conn: sqlite3.Connection, email: str) -> User | None:
    row = conn.execute(f"{_user_select_sql()} WHERE email = ?", (email.lower(),)).fetchone()
    return _row_to_user(row) if row else None


def get_user_by_id(conn: sqlite3.Connection, user_id: int) -> User | None:
    row = conn.execute(f"{_user_select_sql()} WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def create_user(conn: sqlite3.Connection, email: str, password: str) -> User:
    normalized_email = email.lower()
    try:
        cursor = conn.execute(
            """
            INSERT INTO users (email, password_hash, plan, monthly_usage, usage_limit, usage_month)
            VALUES (?, ?, 'free', 0, 3, ?)
            """,
            (normalized_email, hash_password(password), current_usage_month()),
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.") from exc

    user = get_user_by_id(conn, int(cursor.lastrowid))
    if user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User creation failed.")
    return user


def authenticate_user(conn: sqlite3.Connection, email: str, password: str) -> User:
    row = conn.execute(
        "SELECT id, email, password_hash, plan, monthly_usage, usage_limit, usage_month, created_at FROM users WHERE email = ?",
        (email.lower(),),
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    return _row_to_user(row)


def get_ditodio_user_id(conn: sqlite3.Connection, user_id: int) -> str | None:
    row = conn.execute("SELECT ditodio_user_id FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        return None
    value = row["ditodio_user_id"] if "ditodio_user_id" in row.keys() else None
    return str(value).strip() if value else None


def upsert_user_from_ditodio(
    conn: sqlite3.Connection,
    *,
    ditodio_user_id: str,
    email: str,
    plan: str,
) -> User:
    """Link or create a local user for a Ditodio hub identity."""
    normalized_email = email.lower().strip()
    plan_id = plan_policy(plan)["id"]
    limit = plan_policy(plan)["monthly_video_limit"]

    by_ditodio = conn.execute(
        "SELECT id FROM users WHERE ditodio_user_id = ?",
        (ditodio_user_id,),
    ).fetchone()
    if by_ditodio is not None:
        conn.execute(
            "UPDATE users SET email = ?, plan = ?, usage_limit = ? WHERE id = ?",
            (normalized_email, plan_id, limit, int(by_ditodio["id"])),
        )
        conn.commit()
        user = get_user_by_id(conn, int(by_ditodio["id"]))
        if user is None:
            raise HTTPException(status_code=500, detail="Ditodio user sync failed.")
        return user

    existing = get_user_by_email(conn, normalized_email)
    if existing is not None:
        conn.execute(
            "UPDATE users SET ditodio_user_id = ?, plan = ?, usage_limit = ? WHERE id = ?",
            (ditodio_user_id, plan_id, limit, existing.id),
        )
        conn.commit()
        user = get_user_by_id(conn, existing.id)
        if user is None:
            raise HTTPException(status_code=500, detail="Ditodio user link failed.")
        return user

    password = secrets.token_urlsafe(24)
    cursor = conn.execute(
        """
        INSERT INTO users (email, password_hash, plan, monthly_usage, usage_limit, usage_month, ditodio_user_id)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (
            normalized_email,
            hash_password(password),
            plan_id,
            limit,
            current_usage_month(),
            ditodio_user_id,
        ),
    )
    conn.commit()
    user = get_user_by_id(conn, int(cursor.lastrowid))
    if user is None:
        raise HTTPException(status_code=500, detail="Ditodio user create failed.")
    return user
