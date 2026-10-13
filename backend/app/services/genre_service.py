"""Work out what kind of video this is, and say why.

docs/FLOW_REDESIGN.md §4: the user is not asked to pick a genre. It is
inferred from what we already have — the title, the channel and the
transcript we were going to read anyway — and then **told to them**, with the
reasoning, on the result screen. A guess the user cannot see or correct is
worse than a question.

Two layers:

- ``heuristic_genre`` — deterministic, no network. Pattern evidence from the
  title, channel and speech. Always available, and used as the fallback.
- ``infer_genre`` — asks the model, falling back to the heuristic when there
  is no key, the call fails, or the answer is not one of the known genres.

The genre vocabulary is `template_schema.ALLOWED_GENRES`, so the inferred
genre can be handed straight to the template picker.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.services.template_schema import (
    ALLOWED_GENRES,
    DEFAULT_GENRE,
    GENRE_LABELS_KO,
)

logger = logging.getLogger(__name__)

# What each genre counts as a good moment. This goes into the highlight
# prompt, and the same wording is what the UI shows the user, so the promise
# and the behaviour cannot drift apart.
GENRE_CRITERIA_KO: dict[str, str] = {
    "any": "내용을 보고 가장 눈에 띄는 지점을 고릅니다.",
    "lecture": "핵심 주장과 숫자가 나오는 지점, 질문을 던지고 답하는 구간을 찾습니다.",
    "entertainment": "웃음과 리액션이 터지는 순간, 말이 겹치고 빨라지는 구간을 찾습니다.",
    "info": "결론을 먼저 말하는 지점과 수치·비교가 나오는 구간을 찾습니다.",
    "review": "장단점을 말하는 지점과 가격·결론 구간을 찾습니다.",
    "vlog": "장면이 바뀌는 지점과 분위기가 올라오는 구간을 찾습니다.",
}

GENRE_CRITERIA_EN: dict[str, str] = {
    "any": "Pick the moments that stand out on their own terms.",
    "lecture": "Favour the core claim, the numbers, and question-then-answer stretches.",
    "entertainment": "Favour laughter, reactions, and stretches where speech overlaps or speeds up.",
    "info": "Favour conclusion-first moments and stretches with figures or comparisons.",
    "review": "Favour pros-and-cons moments and the price or verdict.",
    "vlog": "Favour scene changes and stretches where the mood lifts.",
}

# Evidence patterns. Deliberately small: these decide a fallback, not a
# diagnosis, and a long list of weak keywords makes the guess worse, not
# better. Weighted because a channel name is weaker evidence than speech.
_TITLE_PATTERNS: dict[str, tuple[str, ...]] = {
    "lecture": ("강연", "강의", "세바시", "ted", "인터뷰", "특강", "대담", "연설", "클래스"),
    "entertainment": ("예능", "개그", "코미디", "몰카", "리액션", "웃참", "챌린지", "먹방", "게임"),
    "info": ("뉴스", "브리핑", "해설", "정리", "총정리", "이슈", "분석", "팩트", "알아보", "이유"),
    "review": ("리뷰", "후기", "비교", "추천", "언박싱", "내돈내산", "가성비", "써봤", "top "),
    "vlog": ("브이로그", "vlog", "일상", "여행", "하루", "루틴", "데일리"),
}

_SPEECH_PATTERNS: dict[str, tuple[str, ...]] = {
    "lecture": ("여러분", "말씀드리", "그래서 제가", "연구", "통계", "라고 생각합니다"),
    "entertainment": ("ㅋㅋ", "아니 진짜", "대박", "미쳤", "レ", "야!", "어떡해"),
    "info": ("퍼센트", "%", "조원", "억원", "발표했습니다", "조사", "집계"),
    "review": ("가격", "원이고", "장점", "단점", "추천드", "써보니", "구매"),
    "vlog": ("오늘은", "같이 가", "먹으러", "도착했", "날씨가"),
}

_TITLE_WEIGHT = 3
_CHANNEL_WEIGHT = 2
_SPEECH_WEIGHT = 1

# Below this, the evidence is too thin to claim a genre.
_MIN_SCORE = 3


@dataclass
class GenreGuess:
    genre: str
    """One of template_schema.ALLOWED_GENRES."""
    label: str
    """Korean label for the UI."""
    criteria: str
    """What this genre treats as a good moment — shown to the user."""
    evidence: str
    """One short clause saying what in the source led here."""
    source: str
    """"model", "heuristic" or "default" — how the guess was reached."""
    scores: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "genre": self.genre,
            "label": self.label,
            "criteria": self.criteria,
            "evidence": self.evidence,
            "source": self.source,
        }


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _count_hits(haystack: str, needles: tuple[str, ...]) -> list[str]:
    return [needle for needle in needles if needle and needle in haystack]


def heuristic_genre(
    title: str | None = None,
    channel: str | None = None,
    transcript_text: str | None = None,
) -> GenreGuess:
    """Guess from patterns alone. Deterministic, no network."""
    title_l = _normalize(title)
    channel_l = _normalize(channel)
    # Only the opening matters: the first couple of minutes set the register,
    # and scanning a whole hour of speech makes every genre score alike.
    speech_l = _normalize(transcript_text)[:4000]

    scores: dict[str, int] = {}
    hits: dict[str, list[str]] = {}
    for genre in _TITLE_PATTERNS:
        title_hits = _count_hits(title_l, _TITLE_PATTERNS[genre])
        channel_hits = _count_hits(channel_l, _TITLE_PATTERNS[genre])
        speech_hits = _count_hits(speech_l, _SPEECH_PATTERNS.get(genre, ()))
        score = (
            len(title_hits) * _TITLE_WEIGHT
            + len(channel_hits) * _CHANNEL_WEIGHT
            + len(speech_hits) * _SPEECH_WEIGHT
        )
        if score:
            scores[genre] = score
            hits[genre] = title_hits + channel_hits + speech_hits

    if not scores:
        return GenreGuess(
            genre=DEFAULT_GENRE,
            label=GENRE_LABELS_KO[DEFAULT_GENRE],
            criteria=GENRE_CRITERIA_KO[DEFAULT_GENRE],
            evidence="장르를 가를 단서가 뚜렷하지 않아 내용만 보고 골랐어요.",
            source="default",
            scores={},
        )

    best = max(sorted(scores), key=lambda key: scores[key])
    if scores[best] < _MIN_SCORE:
        return GenreGuess(
            genre=DEFAULT_GENRE,
            label=GENRE_LABELS_KO[DEFAULT_GENRE],
            criteria=GENRE_CRITERIA_KO[DEFAULT_GENRE],
            evidence="장르를 가를 단서가 약해서 내용만 보고 골랐어요.",
            source="default",
            scores=scores,
        )

    # A term can match the title and the channel both; showing it twice reads
    # like a bug to the user, so de-duplicate while keeping the order found.
    unique_hits = list(dict.fromkeys(hits[best]))
    found = ", ".join(f'"{h}"' for h in unique_hits[:3])
    return GenreGuess(
        genre=best,
        label=GENRE_LABELS_KO[best],
        criteria=GENRE_CRITERIA_KO[best],
        evidence=f"제목과 말투에서 {found} 같은 표현이 보였어요.",
        source="heuristic",
        scores=scores,
    )


_INFER_SYSTEM = (
    "You label a video's genre from its title, channel and the opening of its "
    "transcript. Answer with JSON only: "
    '{"genre":"lecture","evidence":"한 문장, 한국어"}. '
    "genre must be exactly one of: "
    + ", ".join(sorted(ALLOWED_GENRES))
    + ". Use 'any' when the material does not clearly fit one. "
    "evidence is one short Korean clause naming what in the source led you "
    "there — speech pace, who is talking, what kind of words. Never invent "
    "details that are not in the input."
)


def build_infer_prompt(
    title: str | None,
    channel: str | None,
    transcript_text: str | None,
    *,
    limit: int = 2000,
) -> str:
    opening = (transcript_text or "").strip()[:limit]
    return (
        f"제목: {(title or '').strip() or '(없음)'}\n"
        f"채널: {(channel or '').strip() or '(없음)'}\n"
        f"전사 앞부분:\n{opening or '(없음)'}"
    )


def parse_infer_response(raw: str | None) -> tuple[str | None, str | None]:
    """Pull (genre, evidence) out of a model reply. Never raises."""
    if not raw:
        return None, None
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            return None, None
        try:
            data = json.loads(match.group(0))
        except ValueError:
            return None, None
    if not isinstance(data, dict):
        return None, None
    genre = data.get("genre")
    genre = genre.strip().lower() if isinstance(genre, str) else None
    if genre not in ALLOWED_GENRES:
        genre = None
    evidence = data.get("evidence")
    evidence = evidence.strip()[:200] if isinstance(evidence, str) and evidence.strip() else None
    return genre, evidence


def infer_genre(
    title: str | None = None,
    channel: str | None = None,
    transcript_text: str | None = None,
    *,
    complete: Any = None,
) -> GenreGuess:
    """Infer the genre, preferring the model and falling back to patterns.

    ``complete`` is a callable taking (system, user) and returning the model's
    raw text. Injected so this is testable without a network, and so the
    caller owns the client and model choice.
    """
    fallback = heuristic_genre(title, channel, transcript_text)
    if complete is None:
        return fallback

    try:
        raw = complete(_INFER_SYSTEM, build_infer_prompt(title, channel, transcript_text))
    except Exception:  # the guess is never worth failing a conversion over
        logger.warning("genre inference failed; falling back to patterns", exc_info=True)
        return fallback

    genre, evidence = parse_infer_response(raw)
    if genre is None:
        return fallback

    return GenreGuess(
        genre=genre,
        label=GENRE_LABELS_KO[genre],
        criteria=GENRE_CRITERIA_KO[genre],
        evidence=evidence or fallback.evidence,
        source="model",
        scores=fallback.scores,
    )


def forced_genre(genre: str) -> GenreGuess:
    """The guess for a genre the user picked themselves.

    Kept distinct from an inferred one (``source="user"``) so the judgement
    bar does not claim to have worked out something it was told. Unknown
    values fall back to the default rather than raising: a bad genre is not
    worth failing a re-analysis over, and the bar will say which one it used.
    """
    slug = _normalize(genre) or DEFAULT_GENRE
    if slug not in ALLOWED_GENRES:
        slug = DEFAULT_GENRE
    return GenreGuess(
        genre=slug,
        label=GENRE_LABELS_KO[slug],
        criteria=GENRE_CRITERIA_KO[slug],
        evidence="직접 고른 장르로 다시 찾았어요.",
        source="user",
    )


def _with_euro(word: str) -> str:
    """``word`` + 로/으로, picked by its last letter.

    로 after a vowel or a final ㄹ, 으로 otherwise. A label that does not end
    in Hangul (a number, Latin letters) falls back to 로, which is what reads
    naturally when the label is spoken as a word.
    """
    if not word:
        return "로"
    last = word[-1]
    if not ("\uac00" <= last <= "\ud7a3"):
        return f"{word}로"
    final = (ord(last) - 0xAC00) % 28
    return f"{word}로" if final in (0, 8) else f"{word}으로"


def judgement_sentence(
    guess: GenreGuess,
    clip_count: int,
    *,
    range_label: str = "전체 구간",
    length_label: str = "길이 자동",
) -> str:
    """The result screen's 판단 바 text.

    Says what we decided, why, and under what settings — in that order, so a
    user who disagrees knows exactly which knob to turn.
    """
    found = f"{clip_count}개를 찾았어요" if clip_count else "클립을 찾지 못했어요"
    # "자동으로 보고" would read as "saw it automatically", which is not what
    # the `any` genre means — it means no genre was committed to.
    opening = "특정 장르로 보지 않고" if guess.genre == DEFAULT_GENRE else f"{_with_euro(guess.label)} 보고"
    return (
        f"{opening} {found}. "
        f"{guess.evidence} {guess.criteria} "
        f"{range_label} · {length_label}."
    )


def highlight_prompt_clause(guess: GenreGuess) -> str:
    """The line injected into the highlight prompt for this genre.

    English, because the rest of that prompt is: mixing languages inside one
    instruction makes models follow it less reliably.
    """
    return GENRE_CRITERIA_EN.get(guess.genre, GENRE_CRITERIA_EN[DEFAULT_GENRE])
