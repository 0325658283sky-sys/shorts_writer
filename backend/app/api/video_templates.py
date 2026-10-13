"""Video template catalog API — schema v1 templates and caption motions.

Separate from /subtitle-templates, which serves the older ASS subtitle presets
for the blog pipeline. These are the structured 9-axis templates described in
docs/FLOW_REDESIGN.md.

Read-only for now: the catalog is code, not rows. User-saved templates get
their own write endpoints once the storage path exists.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.services.template_catalog import (
    DEFAULT_TEMPLATE_SLUG,
    SYSTEM_TEMPLATES_BY_SLUG,
    get_system_template,
    list_system_templates,
)
from app.services.template_schema import (
    ALLOWED_GENRES,
    TEMPLATE_SCHEMA_VERSION,
    list_caption_motions,
    list_genres,
)

router = APIRouter(prefix="/video-templates", tags=["video-templates"])


@router.get("")
def list_templates(
    genre: str | None = Query(
        None,
        description="이 장르에 맞는 템플릿을 앞으로 올립니다. 아무것도 숨기지 않습니다.",
    ),
) -> dict[str, Any]:
    if genre and genre not in ALLOWED_GENRES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"모르는 장르예요: {genre}. 쓸 수 있는 값: {', '.join(sorted(ALLOWED_GENRES))}",
        )
    return {
        "schemaVersion": TEMPLATE_SCHEMA_VERSION,
        "defaultSlug": DEFAULT_TEMPLATE_SLUG,
        "templates": list_system_templates(genre),
    }


@router.get("/motions")
def get_motions() -> dict[str, Any]:
    """Caption motions and genres, for the template editor's pickers."""
    return {"motions": list_caption_motions(), "genres": list_genres()}


@router.get("/editable")
def read_editable_paths() -> dict:
    """Which template paths this build can actually render.

    The editor asks rather than hardcoding, so a build whose renderer gained
    an axis starts offering it without a frontend release — and, more
    importantly, a build that cannot render an axis stops offering it.
    """
    from app.services.template_bridge import DROPPED_IN_BRIDGE
    from app.services.template_schema import ALLOWED_RATIOS, EDITABLE_PATHS

    return {
        "editable": list(EDITABLE_PATHS),
        "dropped": list(DROPPED_IN_BRIDGE),
        "motions": list_caption_motions(),
        "ratios": list(ALLOWED_RATIOS),
    }


@router.get("/{slug}")
def get_template(slug: str) -> dict[str, Any]:
    if slug not in SYSTEM_TEMPLATES_BY_SLUG:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"그런 템플릿은 없어요: {slug}",
        )
    return get_system_template(slug)
