import pytest

from app.services.credit_service import (
    MAX_SOURCE_MINUTES,
    SourceTooLongError,
    cost_for_duration,
    list_tiers,
    tier_label,
)


def test_price_depends_on_the_source_not_the_output():
    # The whole point of banding (FLOW_REDESIGN §5): handing over 8 clips
    # instead of 2 must not cost the user more. cost_for_duration has no way
    # to know the clip count, and that is the guarantee.
    assert cost_for_duration.__code__.co_argcount == 1


def test_bands_are_monotonic():
    # A longer source must never be cheaper, or users will split videos to
    # game the price.
    prices = [cost_for_duration(minutes * 60) for minutes in (1, 5, 10, 30, 45, 60, 80, 100, 120)]
    assert prices == sorted(prices)


def test_band_boundaries_land_on_the_cheaper_side():
    # Exactly 5 minutes is "5분 이하", not the next band up. An off-by-one here
    # overcharges every source that sits on a boundary.
    assert cost_for_duration(5 * 60) == cost_for_duration(60)
    assert cost_for_duration(5 * 60 + 1) > cost_for_duration(5 * 60)
    assert cost_for_duration(30 * 60) < cost_for_duration(30 * 60 + 1)


def test_unknown_length_is_quoted_cheaply_not_refused():
    # Length is 0 before a file has been probed. Quoting too little is
    # recoverable at charge time; refusing the conversion is not.
    assert cost_for_duration(0) == cost_for_duration(60)
    assert cost_for_duration(-5) == cost_for_duration(60)


def test_over_the_longest_band_is_refused_with_what_to_do():
    # §8: say what is wrong and what to do about it, and do not apologise.
    with pytest.raises(SourceTooLongError) as caught:
        cost_for_duration((MAX_SOURCE_MINUTES + 1) * 60)

    message = str(caught.value)
    assert "나눠서" in message
    assert str(int(MAX_SOURCE_MINUTES)) in message
    assert "오류" not in message


def test_the_longest_band_itself_is_accepted():
    assert cost_for_duration(MAX_SOURCE_MINUTES * 60) > 0


def test_labels_name_a_band_for_every_accepted_length():
    for minutes in (0, 1, 5, 6, 30, 31, 60, 90, 120):
        assert tier_label(minutes * 60).strip()


def test_the_table_matches_the_function():
    # A pricing screen reads list_tiers; if it disagreed with what is charged
    # the user would be quoted one number and billed another.
    for row in list_tiers():
        upper_seconds = float(row["toMinutes"]) * 60
        assert cost_for_duration(upper_seconds) == row["credits"]
