"""Regression checks: label-like vs Super-Shorts-style FOMO/curiosity hooks."""

from app.services.blog_service import (
    _heuristic_style_hook_titles,
    _pick_best_style_title_candidate,
    is_abstract_label_title,
    score_hook_title_candidate,
)
from app.services.visual_style_catalog import TITLE_STYLE_HINTS, title_style_hint


# Fixed fixture inspired by https://blog.naver.com/mtberg/224335674978
HANNAM_BLOG_TITLE = "한남동에서만 볼 수 있는 풍경"
HANNAM_BLOG_BODY = (
    "한남동 골목과 언덕 풍경이 재개발과 변화로 몇 년 뒤에는 예전처럼 보기 어려울 수 있다. "
    "지금 남아 있는 골목 풍경을 기록해 두고 싶다는 감성이 담긴 글."
)


def test_abstract_label_detects_hannam_future():
    assert is_abstract_label_title("한남동의 미래")
    assert is_abstract_label_title("여행의 매력")
    assert is_abstract_label_title("맛집 알아보자")


def test_hook_titles_are_not_abstract_labels():
    assert not is_abstract_label_title("몇 년 뒤에는 못 볼 한남동 풍경")
    assert not is_abstract_label_title("알고 보니 달라진 한남동")
    assert not is_abstract_label_title("이 골목, 곧 사라질지도")


def test_score_prefers_fomo_over_label():
    label = score_hook_title_candidate("한남동의 미래", place_hints=["한남동"])
    hook = score_hook_title_candidate("몇 년 뒤에는 못 볼 한남동 풍경", place_hints=["한남동"])
    assert hook > label
    assert hook - label >= 40


def test_pick_best_rejects_label_when_hook_exists():
    best = _pick_best_style_title_candidate(
        [
            {"style_title": "한남동의 미래", "style_subtitle": None},
            {"style_title": "몇 년 뒤에는 못 볼 한남동 풍경", "style_subtitle": None},
            {"style_title": "한남동 여행 추천", "style_subtitle": None},
        ],
        slug="impact_full",
        place_hints=["한남동"],
        blog_title=HANNAM_BLOG_TITLE,
        blog_body=HANNAM_BLOG_BODY,
    )
    assert best["style_title"] == "몇 년 뒤에는 못 볼 한남동 풍경"
    assert not is_abstract_label_title(best["style_title"] or "")


def test_heuristic_hannam_body_builds_fomo_hook():
    result = _heuristic_style_hook_titles(
        HANNAM_BLOG_TITLE,
        "impact_full",
        blog_body=HANNAM_BLOG_BODY,
    )
    title = result["style_title"] or ""
    assert "한남동" in title
    assert not is_abstract_label_title(title)
    assert score_hook_title_candidate(title, place_hints=["한남동"]) > score_hook_title_candidate(
        "한남동의 미래",
        place_hints=["한남동"],
    )


def test_title_style_hints_encourage_hooks_not_labels():
    for slug, hint in TITLE_STYLE_HINTS.items():
        lowered = hint.lower()
        assert "hook" in lowered or "curiosity" in lowered or "fomo" in lowered
        assert "8–16" not in hint
        assert "no clickbait" not in lowered
    assert "curiosity" in title_style_hint("impact_full").lower() or "fomo" in title_style_hint(
        "impact_full"
    ).lower()


def test_golden_url_set_label_vs_hook_patterns():
    """Pattern regression for the fixed URL set (no live scrape)."""
    cases = [
        (
            "https://blog.naver.com/mtberg/224335674978",
            "한남동의 미래",
            "몇 년 뒤에는 못 볼 한남동 풍경",
        ),
        (
            "generic-place-change",
            "성수의 매력",
            "곧 사라질지도 모르는 성수 골목",
        ),
        (
            "generic-fomo",
            "맛집 총정리",
            "가기 전에 알아야 할 줄 서는 이유",
        ),
    ]
    for _url, bad, good in cases:
        assert is_abstract_label_title(bad) or score_hook_title_candidate(good) > score_hook_title_candidate(bad)
        assert score_hook_title_candidate(good) > score_hook_title_candidate(bad)
