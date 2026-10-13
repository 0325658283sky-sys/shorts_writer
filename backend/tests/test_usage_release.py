import sqlite3

from app.services.usage_service import (
    increment_monthly_usage,
    release_monthly_usage,
    sync_user_usage_policy,
)


def _conn_with_user(plan="free"):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            plan TEXT,
            monthly_usage INTEGER DEFAULT 0,
            usage_limit INTEGER DEFAULT 0,
            usage_month TEXT
        )
        """
    )
    conn.execute("INSERT INTO users (id, plan, monthly_usage) VALUES (1, ?, 0)", (plan,))
    conn.commit()
    return conn


def _used(conn):
    return sync_user_usage_policy(conn, 1)["monthly_usage"]


def test_a_release_undoes_a_charge():
    # The charge comes before the work so an over-limit user is refused up
    # front; a failure therefore has to give it back (FLOW_REDESIGN §11).
    conn = _conn_with_user()
    increment_monthly_usage(conn, 1)
    charged = _used(conn)
    release_monthly_usage(conn, 1)

    assert charged == 1
    assert _used(conn) == 0


def test_a_double_release_does_not_hand_out_free_conversions():
    conn = _conn_with_user()
    increment_monthly_usage(conn, 1)
    release_monthly_usage(conn, 1)
    release_monthly_usage(conn, 1)
    release_monthly_usage(conn, 1, 5)  # amount, not user_id

    assert _used(conn) == 0


def test_remaining_reflects_the_release_immediately():
    # The endpoint reports credits_remaining from this value, so a stale one
    # would tell the user they still owe for work that failed.
    conn = _conn_with_user()
    increment_monthly_usage(conn, 1)
    after = release_monthly_usage(conn, 1)

    assert after["remaining"] == after["usage_limit"]


def test_releasing_without_a_charge_is_harmless():
    conn = _conn_with_user()
    release_monthly_usage(conn, 1)
    assert _used(conn) == 0
