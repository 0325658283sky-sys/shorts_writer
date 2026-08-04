import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import create_access_token
from app.db.database import get_connection
from app.db.schemas import (
    DitodioHandoffRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.ditodio_client import verify_handoff_token
from app.services.user_service import authenticate_user, create_user, upsert_user_from_ditodio

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, conn: sqlite3.Connection = Depends(get_connection)) -> UserResponse:
    user = create_user(conn, payload.email, payload.password)
    return UserResponse(
        id=user.id,
        email=user.email,
        plan=user.plan,
        monthly_usage=user.monthly_usage,
        usage_limit=user.usage_limit,
        usage_month=user.usage_month,
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, conn: sqlite3.Connection = Depends(get_connection)) -> TokenResponse:
    user = authenticate_user(conn, payload.email, payload.password)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/ditodio-handoff", response_model=TokenResponse)
def ditodio_handoff(
    payload: DitodioHandoffRequest,
    conn: sqlite3.Connection = Depends(get_connection),
) -> TokenResponse:
    """Exchange Ditodio hub handoff token for a New Cut access token (same email identity)."""
    claims = verify_handoff_token(payload.handoff)
    if claims is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Ditodio handoff.")
    user = upsert_user_from_ditodio(
        conn,
        ditodio_user_id=claims["sub"],
        email=claims["email"],
        plan=claims.get("plan") or "free",
    )
    return TokenResponse(access_token=create_access_token(str(user.id)))
