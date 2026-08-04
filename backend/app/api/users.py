import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.database import get_connection
from app.db.models import User
from app.db.schemas import PlanResponse, UsageResponse, UserResponse
from app.services.ditodio_client import platform_me_via_service
from app.services.usage_service import list_plan_policies, sync_user_usage_policy
from app.services.user_service import get_ditodio_user_id, get_user_by_id

router = APIRouter(tags=["users"])
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    conn: sqlite3.Connection = Depends(get_connection),
) -> User:
    payload = decode_access_token(credentials.credentials)
    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject.")
    sync_user_usage_policy(conn, int(subject))
    user = get_user_by_id(conn, int(subject))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user


def _to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        plan=user.plan,
        monthly_usage=user.monthly_usage,
        usage_limit=user.usage_limit,
        usage_month=user.usage_month,
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(current_user)


@router.get("/usage", response_model=UsageResponse)
def read_usage(
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> UsageResponse:
    local = sync_user_usage_policy(conn, current_user.id)
    payload = {
        **local,
        "shorts_used": None,
        "shorts_limit": None,
        "shorts_remaining": None,
        "posts_used": None,
        "posts_limit": None,
        "ditodio_linked": False,
    }
    ditodio_id = get_ditodio_user_id(conn, current_user.id)
    if ditodio_id and settings.ditodio_entitlements_enabled and settings.platform_service_token:
        try:
            me = platform_me_via_service(ditodio_id)
            meters = (me.get("entitlements") or {}).get("meters") or {}
            shorts = meters.get("shorts") or {}
            posts = meters.get("posts") or {}
            plan = (me.get("user") or {}).get("plan") or local["plan"]
            limits = me.get("limits") or {}
            shorts_limit = int(shorts.get("limit") or limits.get("shortsPerMonth") or local["usage_limit"])
            shorts_used = int(shorts.get("used") or 0)
            payload.update(
                {
                    "plan": plan,
                    "plan_name": str(plan).capitalize(),
                    "shorts_used": shorts_used,
                    "shorts_limit": shorts_limit,
                    "shorts_remaining": max(shorts_limit - shorts_used, 0),
                    "posts_used": int(posts.get("used") or 0),
                    "posts_limit": int(posts.get("limit") or limits.get("postsPerMonth") or 0),
                    "ditodio_linked": True,
                    # Surface shorts quota as the primary membership meter in UI.
                    "monthly_usage": shorts_used,
                    "usage_limit": shorts_limit,
                    "remaining": max(shorts_limit - shorts_used, 0),
                }
            )
        except Exception:
            payload["ditodio_linked"] = False
    return UsageResponse(**payload)


@router.get("/plans", response_model=list[PlanResponse])
def read_plans() -> list[PlanResponse]:
    return [PlanResponse(**policy) for policy in list_plan_policies()]
