"""Korean Shorts BGM mood catalog — keywords for stock search + system slug priority."""

from __future__ import annotations

from typing import Any

from app.services.visual_style_catalog import normalize_visual_style

# Bundled royalty-free tracks (files: storage/audio/system/<slug>.mp3).
# 6 moods × 3+ slugs — unique filenames so pick_default_bgm can rotate.
BGM_MOODS: dict[str, dict[str, Any]] = {
    "hook_upbeat": {
        "id": "hook_upbeat",
        "label": "훅·임팩트",
        "description": "오프닝, 챌린지식 첫 3초",
        "keywords": ["upbeat", "energetic", "promo", "short punchy"],
        "slugs": ["promo_pulse_1", "promo_pulse_2", "bright_lift_1", "bright_lift_2"],
    },
    "bright_vlog": {
        "id": "bright_vlog",
        "label": "밝은 브이로그",
        "description": "리뷰, 일상, 카페",
        "keywords": ["warm", "feel good", "light pop", "vlog"],
        "slugs": ["light_warm_1", "light_warm_2", "bright_lift_3"],
    },
    "info_soft": {
        "id": "info_soft",
        "label": "정보·설명",
        "description": "설치/사용법, 레터박스 정보형",
        "keywords": ["soft corporate", "calm tech", "clean pad"],
        "slugs": ["soft_pad_1", "soft_pad_2", "calm_drone_1"],
    },
    "calm_mood": {
        "id": "calm_mood",
        "label": "감성·차분",
        "description": "야경, 후기, 롱폼 설명",
        "keywords": ["lofi", "chill", "ambient", "soft drone"],
        "slugs": ["calm_drone_2", "calm_drone_3", "soft_pad_3"],
    },
    "promo_pulse": {
        "id": "promo_pulse",
        "label": "프로모·세일",
        "description": "할인, CTA, 바이럴 톤",
        "keywords": ["marketing", "pulse", "electronic promo"],
        "slugs": ["promo_pulse_3", "promo_pulse_4", "bright_lift_4"],
    },
    "neutral_bed": {
        "id": "neutral_bed",
        "label": "중립 배경",
        "description": "애매할 때 기본",
        "keywords": ["background", "underscore", "gentle"],
        "slugs": ["soft_pad_4", "light_warm_3", "soft_pad_5"],
    },
}

_MOOD_BY_TONE = {
    "hook": "hook_upbeat",
    "summary": "info_soft",
    "detailed": "calm_mood",
}

_MOOD_BY_STYLE = {
    "impact_full": "hook_upbeat",
    "viral_cyan": "promo_pulse",
    "info_black": "info_soft",
    "info_navy": "info_soft",
    "card_white": "bright_vlog",
}

_LENGTH_SLUG_BIAS = {
    "short": ["promo_pulse_1", "bright_lift_1", "soft_pad_1", "light_warm_1"],
    "long": ["calm_drone_1", "light_warm_1", "soft_pad_1", "promo_pulse_1"],
}


def bundled_bgm_slugs() -> list[str]:
    """Unique bundled BGM slugs in mood-catalog order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for mood in BGM_MOODS.values():
        for slug in mood["slugs"]:
            if slug not in seen:
                seen.add(slug)
                ordered.append(slug)
    return ordered


def list_bgm_moods() -> list[dict[str, Any]]:
    return [dict(BGM_MOODS[key]) for key in BGM_MOODS]


def get_bgm_mood(mood_id: str | None) -> dict[str, Any] | None:
    if not mood_id:
        return None
    mood = BGM_MOODS.get(mood_id.strip())
    return dict(mood) if mood else None


def resolve_mood(
    script_tone: str | None = None,
    visual_style: str | None = None,
) -> str:
    """Prefer visual style pack mood, then narration tone, else neutral."""
    if visual_style:
        style = normalize_visual_style(visual_style)
        mapped = _MOOD_BY_STYLE.get(style)
        if mapped:
            return mapped
    if script_tone:
        tone = script_tone.strip().lower()
        mapped = _MOOD_BY_TONE.get(tone)
        if mapped:
            return mapped
    return "neutral_bed"


def candidate_slugs_for_mood(
    mood_id: str,
    *,
    target_length: str | None = None,
) -> list[str]:
    mood = get_bgm_mood(mood_id) or BGM_MOODS["neutral_bed"]
    candidates: list[str] = list(mood["slugs"])
    length_key = target_length if target_length in _LENGTH_SLUG_BIAS else "short"
    for slug in _LENGTH_SLUG_BIAS[length_key]:
        if slug not in candidates:
            candidates.append(slug)
    for slug in bundled_bgm_slugs():
        if slug not in candidates:
            candidates.append(slug)
    return candidates


def resolve_candidate_slugs(
    *,
    script_tone: str | None = None,
    visual_style: str | None = None,
    target_length: str | None = None,
    mood_id: str | None = None,
) -> tuple[str, list[str]]:
    resolved = mood_id if mood_id in BGM_MOODS else resolve_mood(script_tone, visual_style)
    return resolved, candidate_slugs_for_mood(resolved, target_length=target_length)
