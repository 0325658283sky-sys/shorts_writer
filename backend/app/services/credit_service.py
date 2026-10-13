"""What a conversion costs, and how a failed one is given back.

docs FLOW_REDESIGN §3 and §11. Two rules decided; one number not.

**Decided — the shape.** Converting a video is priced by the *source's*
length, in bands, and does not depend on how many clips come out. That is why
the result screen can hand over 6–8 clips instead of 2–3 without costing the
user more (§5). Re-cutting costs the same as the first cut, because it runs
the same model over the same source.

**Decided — a failed conversion is given back.** The charge happens before
the work, so that a user over their limit is refused instead of being handed
work they cannot pay for; which means a failure has to release it again.

**Not decided — the numbers.** `_PROVISIONAL_TIERS` is FikaClip's published
table, kept here as a placeholder so the code can be built and tested. It is
*not* New Cut's pricing, and it must not ship as such — the real numbers wait
on measured per-conversion cost (FLOW_REDESIGN §10). Change this table and
nothing else when they land; nothing outside this module knows a price.
"""

from __future__ import annotations

#: (upper bound in minutes inclusive, credits). The last band's bound is the
#: longest source accepted at all.
#:
#: PROVISIONAL — FikaClip's table, not ours. See the module docstring.
_PROVISIONAL_TIERS: tuple[tuple[float, int], ...] = (
    (5, 50),
    (30, 100),
    (60, 200),
    (90, 300),
    (120, 400),
)

#: Sources longer than this are refused rather than priced. Being told up
#: front beats a conversion that fails after the user has waited for it.
MAX_SOURCE_MINUTES: float = _PROVISIONAL_TIERS[-1][0]


class SourceTooLongError(ValueError):
    """The source is longer than the longest band, so it has no price."""

    def __init__(self, minutes: float) -> None:
        self.minutes = minutes
        super().__init__(
            f"{minutes:.0f}분 영상은 변환할 수 없어요. "
            f"{MAX_SOURCE_MINUTES:.0f}분 이하로 구간을 나눠서 올려주세요."
        )


def cost_for_duration(duration_seconds: float) -> int:
    """Credits to convert a source of this length.

    Independent of the number of output clips, by design. A duration of 0 or
    less — an unknown length, which happens before a file has been probed —
    is priced at the cheapest band rather than refused: quoting too little is
    recoverable at charge time, refusing a conversion outright is not.
    """
    minutes = max(0.0, float(duration_seconds)) / 60.0
    if minutes > MAX_SOURCE_MINUTES:
        raise SourceTooLongError(minutes)
    for upper, credits in _PROVISIONAL_TIERS:
        if minutes <= upper:
            return credits
    raise SourceTooLongError(minutes)


def tier_label(duration_seconds: float) -> str:
    """The band a source falls in, for the UI to show beside the price."""
    minutes = max(0.0, float(duration_seconds)) / 60.0
    lower = 0.0
    for upper, _ in _PROVISIONAL_TIERS:
        if minutes <= upper:
            return f"{lower:.0f}–{upper:.0f}분" if lower else f"{upper:.0f}분 이하"
        lower = upper
    return f"{MAX_SOURCE_MINUTES:.0f}분 초과"


def list_tiers() -> list[dict[str, float | int | str]]:
    """The whole table, so a pricing page is not a second copy of it."""
    rows: list[dict[str, float | int | str]] = []
    lower = 0.0
    for upper, credits in _PROVISIONAL_TIERS:
        rows.append(
            {
                "fromMinutes": lower,
                "toMinutes": upper,
                "credits": credits,
                "label": f"{lower:.0f}–{upper:.0f}분" if lower else f"{upper:.0f}분 이하",
            }
        )
        lower = upper
    return rows
