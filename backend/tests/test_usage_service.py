import pytest
from fastapi import HTTPException

from app.services.usage_service import (
    assert_can_analyze_video,
    increment_monthly_usage,
    plan_policy,
    sync_user_usage_policy,
)


def test_plan_policy_defaults_to_free():
    assert plan_policy(None)["id"] == "free"
    assert plan_policy("unknown")["monthly_video_limit"] == 3
    assert plan_policy("pro")["monthly_video_limit"] == 80


def test_sync_user_usage_policy_remaining(conn):
    usage = sync_user_usage_policy(conn, 1)
    assert usage["monthly_usage"] == 1
    assert usage["usage_limit"] == 3
    assert usage["remaining"] == 2


def test_increment_monthly_usage(conn):
    usage = increment_monthly_usage(conn, 1)
    assert usage["monthly_usage"] == 2
    assert usage["remaining"] == 1


def test_assert_can_analyze_blocks_when_limit_reached(conn):
    conn.execute("UPDATE users SET monthly_usage = 3, usage_limit = 3 WHERE id = 1")
    conn.commit()
    with pytest.raises(HTTPException) as exc:
        assert_can_analyze_video(conn, 1, duration_seconds=60)
    assert exc.value.status_code == 403


def test_assert_can_analyze_blocks_long_video(conn):
    with pytest.raises(HTTPException) as exc:
        assert_can_analyze_video(conn, 1, duration_seconds=11 * 60)
    assert exc.value.status_code == 403
